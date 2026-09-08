import { isDesktopRuntime } from "../project/runtime";
import { useWorkspaceNavigation, type NavigationHandler } from "../hooks/useWorkspaceNavigation";
import { readEditorContent } from "../utils/editorPersistence";
import { AVATAR_COLORS } from "../defs/palette";
import { useCallback, useEffect, useRef, useState } from "react";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel, hasNodeCapability } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useTreeController } from "../hooks/useTreeController";
import ContextMenu from "./ContextMenu";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";
import DragPreview from "./DragPreview";
import SidebarTree from "./SidebarTree";
import NodePanels from "./NodePanels";
import LoreAddDialog from "./LoreAddDialog";
import { SidebarIcon } from "./SidebarIcon";
import RichTextEditor from "./RichTextEditor";
import GraphView from "./GraphView";
import RegisteredNodeView from "./RegisteredNodeView";
import type { TimeFormat } from "../utils/temporalMeta";
import { handleCalendarSlashCommand } from "../nodes/calendar/operations";
import type { NodeViewHost } from "../nodes/rendering";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { CHANGELOG_ENTRIES } from "../defs/changelog";
import {
  createImageContent,
  getImageResourceInfo,
} from "../utils/imageResource";
import {
  FileNodeImportError,
  findImportableFile,
  importFileAsNode,
  isImportableDragItem,
} from "../project/fileNodeImporter";
import { useLocale } from "../i18n/LocaleContext";
import windowCloseAsset from "../assets/original/ui/window_close.svg";
import windowMaximizeAsset from "../assets/original/ui/window_maximize.svg";
import windowMinimizeAsset from "../assets/original/ui/window_minimize.svg";
import { getUniqueNodeName } from "../utils/nodeNames";

interface AppWorkspaceProps {
  projectKey: string;
  projectName: string;
  onExitProject: () => Promise<void>;
}

const MAX_LOCAL_STORAGE_STRING_BYTES = 900_000;

function TrashNodePreview({ node }: { node: NodeItem }) {
  const { t } = useLocale();
  const parsed = new DOMParser().parseFromString(node.content, "text/html");
  const resource = node.type === "imagen" ? getImageResourceInfo(node.content, node.name) : null;
  const imageSource = resource?.src || parsed.querySelector("img")?.getAttribute("src");
  if (imageSource) {
    return <img src={imageSource} alt="" loading="lazy" decoding="async" />;
  }
  const text = parsed.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 180);
  return <span>{text || t("workspace.noPreview")}</span>;
}

const safeLocalStorageSet = (key: string, value: string) => {
  try {
    const estimatedBytes = new Blob([value]).size;
    if (estimatedBytes > MAX_LOCAL_STORAGE_STRING_BYTES) {
      console.warn(
        `[storage] Se descarta ${key}: valor demasiado grande (${(estimatedBytes / 1024 / 1024).toFixed(1)} MB) para localStorage.`,
      );
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[storage] No se pudo guardar ${key}; se ignora para evitar el quota.`, error);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignorado.
    }
  }
};

export default function AppWorkspace({
    projectKey,
    projectName,
    onExitProject,
  }: AppWorkspaceProps) {
  const { locale, setLocale, t } = useLocale();
  const coverNodeStorageKey = `hisfuture.project.cover-node.${projectKey}`;
  const colorStorageKey = `hisfuture.project.color.${projectKey}`;
  const timeFormatStorageKey = "hisfuture.settings.time-format";
  const trashViewStorageKey = `hisfuture.settings.trash-view.${projectKey}`;
  const [defaultNodeType, setDefaultNodeType] = useState<BaseNodeType>("pagina");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    localStorage.getItem(timeFormatStorageKey) === "24h" ? "24h" : "12h",
  );
  const workspace = useTreeController(defaultNodeType, projectKey);
  const [width, setWidth] = useState(305);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<"lore" | "recent" | "types">(
    "lore",
  );
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [selectedLoreIds, setSelectedLoreIds] = useState<string[]>([]);
  const cancelLoreMultiSelection = () => setSelectedLoreIds((current) => {
    if (current.length <= 1) return current;
    const keepId = workspace.selectedId && current.includes(workspace.selectedId)
      ? workspace.selectedId
      : current[0];
    return keepId ? [keepId] : [];
  });
  const [loreAddOpen, setLoreAddOpen] = useState(false);
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null);
  const sidebarImageInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState("list");
  const [projectTab, setProjectTab] = useState<"workspace" | "settings">(
    "workspace",
  );
  const [settingsPanel, setSettingsPanel] = useState<"general" | "trash" | "changelog">(
    "general",
  );
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [trashView, setTrashView] = useState<"gallery" | "list">(() =>
    localStorage.getItem(trashViewStorageKey) === "list" ? "list" : "gallery",
  );
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(
    null,
  );
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const [avatarColor] = useState(
    () =>
      localStorage.getItem(colorStorageKey) ||
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  );

  useEffect(() => {
    safeLocalStorageSet(colorStorageKey, avatarColor);
  }, [avatarColor, colorStorageKey]);
  useEffect(() => {
    localStorage.setItem(timeFormatStorageKey, timeFormat);
  }, [timeFormat]);
  useEffect(() => {
    localStorage.setItem(trashViewStorageKey, trashView);
  }, [trashView, trashViewStorageKey]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);
  useEffect(() => {
    if (sidebarSearchOpen) sidebarSearchRef.current?.focus();
  }, [sidebarSearchOpen]);
  const [contextMenu, setContextMenu] = useState<
    React.ComponentProps<typeof ContextMenu>["menu"] | null
  >(null);
  const [trashMenu, setTrashMenu] = useState<{ x: number; y: number } | null>(null);
  const [trashActionsMenu, setTrashActionsMenu] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const resizing = useRef(false);
  const calendarNavigation = useRef<NavigationHandler | null>(null);
  const selectedNode = workspace.nodes.find(
    (node) => node.id === workspace.selectedId,
  );
  const selectedType = selectedNode
    ? getEffectiveNodeType(workspace.nodes, selectedNode)
    : null;
  const selectedTrashNode = workspace.deletedNodes.find(
    (node) => node.id === selectedTrashNodeId,
  );
  useEffect(() => {
    if (workspace.selectedId) setSelectedTrashNodeId(null);
  }, [workspace.selectedId]);
  useEffect(() => {
    const handleRenameShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const nodeId = selectedLoreIds.length === 1 ? selectedLoreIds[0] : workspace.selectedId;
      const node = workspace.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      event.preventDefault();
      setProjectTab("workspace");
      setSidebarPanel("lore");
      setSidebarQuery("");
      setSelectedLoreIds([node.id]);
      workspace.startRename(node);
    };
    window.addEventListener("keydown", handleRenameShortcut);
    return () => window.removeEventListener("keydown", handleRenameShortcut);
  }, [selectedLoreIds, workspace]);

  useWorkspaceNavigation({
    selectedId: workspace.selectedId,
    selectedTrashId: selectedTrashNodeId,
    navigateWithinView: (direction) => Boolean(selectedNode && hasNodeCapability(selectedNode.type, "navigateWithinView") && calendarNavigation.current?.(direction)),
    onNavigate: (next) => {
      if (next.kind === "trash") {
        workspace.setSelectedId(null);
        setProjectTab("settings");
        setSettingsPanel("trash");
        setSelectedTrashNodeId(next.id);
      } else {
        setSelectedTrashNodeId(null);
        setProjectTab("workspace");
        setView("list");
        workspace.setSelectedId(next.id);
      }
    },
  });

  const onMouseDown = useCallback(() => {
    resizing.current = true;
    document.body.style.cursor = "col-resize";
  }, []);

  const onMouseUp = useCallback(() => {
    resizing.current = false;
    document.body.style.cursor = "default";
  }, []);

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (resizing.current) {
      setWidth(Math.min(440, Math.max(280, event.clientX)));
    }
  }, []);

  const startWindowDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    void getCurrentWindow().startDragging();
  };

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    if (
      !workspace.pendingEditorFocusId ||
      workspace.selectedId !== workspace.pendingEditorFocusId
    ) {
      return;
    }

    const focusEditor = () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const firstLine = editor.querySelector("p") || editor;
      const range = document.createRange();
      range.selectNodeContents(firstLine);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      workspace.clearPendingEditorFocus();
    };

    requestAnimationFrame(focusEditor);
  }, [workspace.pendingEditorFocusId, workspace.selectedId]);

  const previewNode = workspace.nodes.find(
    (node) => node.id === workspace.dragPreviewId,
  );
  const closingWindowRef = useRef(false);
  const allowWindowCloseRef = useRef(false);
  const getCurrentSnapshot = () => {
    const currentNodeId = workspace.selectedId;
    const editor = editorRef.current;
    const active = workspace.nodes.find((node) => node.id === currentNodeId);
    const currentHtml = editor && active && editor.getAttribute("data-active-id") === active.id
      ? readEditorContent(editor, active) : undefined;
    return currentNodeId && currentHtml !== undefined
      ? workspace.nodes.map((node) =>
          node.id === currentNodeId ? { ...node, content: currentHtml } : node,
        )
      : workspace.nodes;
  };
  const saveCurrentWorkspace = () =>
    workspace.saveNow(getCurrentSnapshot());
  const closeWindowSafely = async () => {
    const currentWindow = getCurrentWindow();
    try {
      await currentWindow.close();
      return;
    } catch (error) {
      console.warn("close() falló, intentando destroy():", error);
    }

    try {
      await currentWindow.destroy();
    } catch (error) {
      console.error("No se pudo cerrar la ventana", error);
    }
  };

  const exitWorkspace = async () => {
    try {
      await saveCurrentWorkspace();
    } catch (error) {
      setFileImportError(String(error));
      return;
    }

    try {
      await onExitProject();
    } catch (error) {
      setFileImportError(String(error));
    }
  };
  const closeApplication = async () => {
    if (closingWindowRef.current) return;
    closingWindowRef.current = true;

    try {
      await saveCurrentWorkspace();
    } catch (error) {
      setFileImportError(String(error));
      closingWindowRef.current = false;
      return;
    }

    try {
      await onExitProject();
    } catch (error) {
      setFileImportError(String(error));
      closingWindowRef.current = false;
      return;
    }

    try {
      allowWindowCloseRef.current = true;
      await closeWindowSafely();
    } catch (error) {
      console.error("No se pudo cerrar la ventana", error);
    } finally {
      closingWindowRef.current = false;
    }
  };
  const closeApplicationRef = useRef(closeApplication);
  closeApplicationRef.current = closeApplication;
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (allowWindowCloseRef.current) return;
      event.preventDefault();
      if (!closingWindowRef.current) void closeApplicationRef.current();
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; })
      .catch((error) => setFileImportError(String(error)));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const projectInitial = projectName.trim().charAt(0).toUpperCase() || "P";
  const findCoverNode = useCallback(() => {
    const storedId = localStorage.getItem(coverNodeStorageKey);
    return (
      workspace.nodes.find((node) => node.id === storedId) ||
      workspace.nodes.find(
        (node) => node.type === "imagen" && node.name === "Imagen de portada",
      )
    );
  }, [coverNodeStorageKey, workspace.nodes]);
  useEffect(() => {
    if (!workspace.hydrated) return;
    const coverNode = findCoverNode();
    const source = coverNode
      ? getImageResourceInfo(coverNode.content, coverNode.name)?.src ?? null
      : null;
    setProjectImage((current) => current === source ? current : source);
    if (coverNode) safeLocalStorageSet(coverNodeStorageKey, coverNode.id);
    else localStorage.removeItem(coverNodeStorageKey);
  }, [coverNodeStorageKey, findCoverNode, workspace.hydrated]);
  const resolveDropParentId = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-node-id]");
    const targetId = target?.dataset.nodeId;
    if (!targetId) return null;

    const targetNode = workspace.nodes.find((node) => node.id === targetId);
    if (!targetNode) return null;

    const targetType = getEffectiveNodeType(workspace.nodes, targetNode);
    const canContain = hasNodeCapability(targetType, "containChildren");

    return canContain ? targetId : targetNode.parentId ?? null;
  }, [workspace.nodes]);

  const createNodeFromFile = async (file: File, parentId: string | null = null) => {
    setFileImportError(null);
    try {
      return await importFileAsNode(file, parentId, {
        nodes: workspace.nodes,
        createNode: workspace.createNode,
      });
    } catch (error) {
      console.error(error);
      setFileImportError(t(
        error instanceof FileNodeImportError ? error.translationKey : "fileImport.failed",
      ));
      return null;
    }
  };

  const handleProjectImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== "string") return;
      setProjectImage(reader.result);
      const coverNode = findCoverNode();
      if (coverNode) {
        const resource = getImageResourceInfo(coverNode.content, coverNode.name);
        const content = createImageContent(
          reader.result,
          resource?.fileName || "Imagen de portada",
          0,
          resource?.hash || "",
          resource?.description || "Imagen de portada del proyecto",
        );
        workspace.updateContent(coverNode.id, content);
        safeLocalStorageSet(coverNodeStorageKey, coverNode.id);
        return;
      }
      const id = workspace.createNode(
        "Imagen de portada",
        "imagen",
        null,
        createImageContent(
          reader.result,
          "Imagen de portada",
          0,
          "",
          "Imagen de portada del proyecto",
        ),
      );
      safeLocalStorageSet(coverNodeStorageKey, id);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handleGlobalDragOver = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.defaultPrevented) return;

      const dataTransfer = dragEvent.dataTransfer;
      if (!dataTransfer) return;

      const hasImportableItem = Array.from(dataTransfer.items).some((item) =>
        isImportableDragItem(item),
      );

      if (hasImportableItem) {
        event.preventDefault();
        event.stopPropagation();
        dataTransfer.dropEffect = "copy";
      }
    };

    const handleGlobalDrop = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.defaultPrevented) return;

      const dataTransfer = dragEvent.dataTransfer;
      if (!dataTransfer) return;

      const file = findImportableFile(dataTransfer);

      if (!file) return;

      event.preventDefault();
      event.stopPropagation();
      void createNodeFromFile(
        file,
        resolveDropParentId(dragEvent.clientX, dragEvent.clientY),
      );
    };

    const targets = [window, document, document.body];
    targets.forEach((target) => {
      target.addEventListener("dragover", handleGlobalDragOver);
      target.addEventListener("drop", handleGlobalDrop);
    });

    return () => {
      targets.forEach((target) => {
        target.removeEventListener("dragover", handleGlobalDragOver);
        target.removeEventListener("drop", handleGlobalDrop);
      });
    };
  }, [createNodeFromFile, resolveDropParentId]);
  const updateImageContent = (id: string, content: string) => {
    workspace.updateContent(id, content);
    const imageNode = workspace.nodes.find((node) => node.id === id);
    const coverNode = findCoverNode();
    if (imageNode && coverNode?.id === imageNode.id) {
      const resource = getImageResourceInfo(content, imageNode.name);
      if (resource) setProjectImage(resource.src);
    }
  };
  const calendarOperationsHost = {
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    selectNode: workspace.setSelectedId,
    setExpanded: workspace.setExpanded,
    updateContent: workspace.updateContent,
  };
  const handleSlashCommand = (tag: string) => handleCalendarSlashCommand(tag, calendarOperationsHost);
  const createPastedNode = (rawName: string): NodeItem | null => {
    const name = rawName.trim() || getNodeDisplayLabel(defaultNodeType, t);
    const normalizedName = name.toLocaleLowerCase();
    const existing = workspace.nodes.find(
      (item) => item.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (existing) return existing;
    const parentId = selectedNode?.parentId ?? null;
    const defaultContent = getNodeDefinition(defaultNodeType).defaultContent;
    const id = workspace.createNode(name, defaultNodeType, parentId, defaultContent, false);
    return {
      id,
      name,
      type: defaultNodeType,
      parentId,
      order: workspace.nodes.filter((item) => item.parentId === parentId).length,
      content: defaultContent,
    };
  };
  useEffect(() => {
    if (!workspace.hydrated || !projectImage) return;
    const imageNode = findCoverNode();
    if (imageNode) {
      safeLocalStorageSet(coverNodeStorageKey, imageNode.id);
      return;
    }
    const id = workspace.createNode(
        "Imagen de portada",
        "imagen",
        null,
        createImageContent(
          projectImage,
          "Imagen de portada",
          0,
          "",
          "Imagen de portada del proyecto",
        ),
      );
    safeLocalStorageSet(coverNodeStorageKey, id);
  }, [projectImage, workspace.hydrated, workspace.nodes, coverNodeStorageKey]);

  const openDeletedNode = (id: string) => {
    workspace.setSelectedId(null);
    setProjectTab("settings");
    setSettingsPanel("trash");
    setSelectedTrashNodeId(id);
  };
  const returnToTrash = () => {
    setSelectedTrashNodeId(null);
    setProjectTab("settings");
    setSettingsPanel("trash");
  };
  const openTrashMenu = (event: React.MouseEvent, node: NodeItem) => {
    event.preventDefault();
    if (!workspace.selectedDeletedIds.includes(node.id)) {
      workspace.selectDeletedNode(node.id);
    }
    setTrashMenu({ x: event.clientX, y: event.clientY });
  };
  const selectTrashNode = (event: React.MouseEvent, node: NodeItem) => {
    workspace.selectDeletedNode(node.id, {
      ctrlKey: event.ctrlKey || event.metaKey,
      shiftKey: event.shiftKey,
    });
  };
  const handleTrashNodeClick = (event: React.MouseEvent, node: NodeItem) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectTrashNode(event, node);
      return;
    }
    openDeletedNode(node.id);
  };
  const trashActionItems: HisContextMenuItem[] = [
    {
      id: "restore",
      label: t("trash.restoreSelected"),
      disabled: workspace.selectedDeletedIds.length === 0,
      onSelect: workspace.restoreDeletedNodes,
    },
    {
      id: "delete-permanently",
      label: t("trash.deletePermanentlyAction"),
      danger: true,
      disabled: workspace.selectedDeletedIds.length === 0,
      onSelect: workspace.permanentlyDeleteNodes,
    },
  ];
  const openNodeView = (id: string) => {
    setSelectedTrashNodeId(null);
    setProjectTab("workspace");
    setView("list");
    workspace.setSelectedId(id);
  };
  const nodeViewHost: NodeViewHost = {
    data: { nodes: workspace.nodes, deletedNodes: workspace.deletedNodes, timeFormat },
    mutations: {
      createNode: workspace.createNode,
      updateContent: workspace.updateContent,
      mutateNodes: workspace.mutateNodes,
      renameNode: workspace.renameNode,
      deleteNode: workspace.deleteNode,
    },
    navigation: {
      selectNode: workspace.setSelectedId,
      openNodeView,
      openDeletedNode,
      registerWithinView: (handler) => {
        calendarNavigation.current = handler;
        return () => {
          if (calendarNavigation.current === handler) calendarNavigation.current = null;
        };
      },
    },
    tree: { setExpanded: workspace.setExpanded },
    files: { importFile: (file, parentId) => createNodeFromFile(file, parentId ?? selectedNode?.parentId ?? null) },
    editor: {
      ref: editorRef,
      pendingNodeDrop: workspace.pendingEditorNodeDrop,
      clearPendingNodeDrop: workspace.clearPendingEditorNodeDrop,
      createPastedNode,
      runSlashCommand: handleSlashCommand,
    },
    contextMenus: { openNodeMenu: setContextMenu },
    projectImage: {
      updateContent: updateImageContent,
      useAsCover: (nodeId) => {
        const imageNode = workspace.nodes.find((node) => node.id === nodeId);
        const resource = imageNode ? getImageResourceInfo(imageNode.content, imageNode.name) : null;
        if (!resource) return;
        setProjectImage(resource.src);
        safeLocalStorageSet(coverNodeStorageKey, nodeId);
      },
    },
  };

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      className="app-workspace"
    >
      <header
        className="workspace-header"
        data-tauri-drag-region
        onPointerDown={startWindowDrag}
      >
        <div className="workspace-header__left">
          <div className="workspace-header__views">
            {["list", "graph"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={view === option ? "is-active" : ""}
              >
                {t(option === "list" ? "workspace.views.list" : "workspace.views.graph")}
              </button>
            ))}
            <button
              type="button"
              className="workspace-header__quick-template"
              data-tauri-drag-region="false"
              title={`${t("workspace.exit")} (DEV)`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => void exitWorkspace()}
            >
              {t("workspace.exitDev")} <b>DEV</b>
            </button>
          </div>
        </div>
        <div className="workspace-header__right" data-tauri-drag-region="false">
          <div className="workspace-header__version">{appVersion ? `v${appVersion}` : "v—"}</div>
          <div className="workspace-header__window-controls">
            <button type="button" title={t("common.window.minimize")} onClick={() => void getCurrentWindow().minimize()}><img src={windowMinimizeAsset} alt="" /></button>
            <button type="button" title={t("common.window.maximize")} onClick={() => void getCurrentWindow().toggleMaximize()}><img src={windowMaximizeAsset} alt="" /></button>
            <button type="button" title={t("common.window.close")} onClick={() => void closeApplication()}><img src={windowCloseAsset} alt="" /></button>
          </div>
        </div>
      </header>

      {(fileImportError || workspace.persistenceError) && (
        <div className="workspace-file-import-error" role="alert">
          <span>{fileImportError || workspace.persistenceError}</span>
          <button type="button" onClick={() => setFileImportError(null)} aria-label={t("fileImport.dismiss")}>×</button>
        </div>
      )}

      <div className="workspace-body">
        <aside
          className={`workspace-sidebar${sidebarVisible ? "" : " is-collapsed"}`}
          data-sidebar="true"
          style={{ width: `${sidebarVisible ? width : 80}px` }}
        >
          <nav className="view-rail" aria-label={t("workspace.panels")}>
            <button className="view-rail__toggle" type="button" onClick={() => setSidebarVisible((current) => !current)} title={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")}><SidebarIcon name="sidebar" /></button>
              {([
                ["lore", "sidebar.lore"],
                ["recent", "sidebar.recent"],
                ["types", "sidebar.types"],
              ] as const).map(([id, labelKey]) => (
                <button key={id} type="button" aria-label={t(labelKey)} title={t(labelKey)} className={`view-rail__item ${sidebarPanel === id ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setSidebarPanel(id); setProjectTab("workspace"); setSidebarQuery(""); }}>
                  <SidebarIcon name={id} active={sidebarPanel === id} />
                  {sidebarPanel === id && <span>{t(labelKey)}</span>}
                </button>
              ))}
              <button type="button" className="view-rail__exit" onClick={() => void exitWorkspace()} title={t("workspace.exit")}><SidebarIcon name="exit" /></button>
          </nav>

          <section className="context-sidebar" aria-hidden={!sidebarVisible}>
              <header className="context-sidebar__project">
                <label className="workspace-sidebar__project-avatar" style={projectImage ? { backgroundImage: `url(${projectImage})` } : { backgroundColor: avatarColor }} title={t("workspace.projectImage.change")}>
                  {!projectImage && projectInitial}
                  <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleProjectImageUpload(file); event.currentTarget.value = ""; }} />
                </label>
                <div className="context-sidebar__identity">
                  <div className="workspace-sidebar__title">{projectName}</div>
                  {projectTab === "workspace" && <div className="workspace-sidebar__count">{t("sidebar.nodeCount", { count: workspace.nodes.length })}</div>}
                </div>
                <button type="button" onClick={() => { cancelLoreMultiSelection(); setSelectedTrashNodeId(null); setProjectTab((current) => current === "settings" ? "workspace" : "settings"); }} title={t("workspace.projectSettings")} className={`workspace-sidebar__settings ${projectTab === "settings" ? "is-active" : ""}`}><SidebarIcon name="settings" /></button>
              </header>

              {projectTab === "settings" ? (
                <nav className="settings-navigation" aria-label={t("workspace.projectSettings")}>
                  {([
                    ["general", "general", "sidebar.settings.general"],
                    ["changelog", "history", "sidebar.settings.history"],
                    ["trash", "trash", "sidebar.settings.trash"],
                  ] as const).map(([id, icon, labelKey]) => (
                    <button key={id} type="button" className={settingsPanel === id ? "is-active" : ""} onClick={() => { cancelLoreMultiSelection(); setSelectedTrashNodeId(null); setSettingsPanel(id); }}><SidebarIcon name={icon} /><span>{t(labelKey)}</span></button>
                  ))}
                </nav>
              ) : (
                <>
                  <div className={`context-toolbar ${sidebarSearchOpen ? "is-searching" : ""}`}>
                    <div className="context-toolbar__actions">
                      {sidebarPanel === "lore" && <>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); setLoreAddOpen(true); }} title={t("sidebar.addNode")}><SidebarIcon name="add" /></button>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); workspace.openCreate(null, "categoria"); }} title={t("sidebar.addFolder")}><SidebarIcon name="folder" /></button>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); sidebarImageInputRef.current?.click(); }} title={t("sidebar.addImage")}><SidebarIcon name="image-add" /></button>
                        <input ref={sidebarImageInputRef} hidden type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void createNodeFromFile(file, null); event.currentTarget.value = ""; }} />
                      </>}
                    </div>
                    <div className="context-toolbar__search">
                      <input ref={sidebarSearchRef} value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSidebarQuery(""); setSidebarSearchOpen(false); } }} placeholder={t("sidebar.search")} aria-label={t("sidebar.search")} />
                      <button type="button" onClick={() => { if (sidebarSearchOpen && !sidebarQuery) setSidebarSearchOpen(false); else setSidebarSearchOpen(true); }} title={t("sidebar.search")}><SidebarIcon name="search" /></button>
                    </div>
                  </div>
                  {sidebarPanel === "lore" ? (
                    <SidebarTree {...workspace} selectedLoreIds={selectedLoreIds} setSelectedLoreIds={setSelectedLoreIds} query={sidebarQuery} onFileDrop={(file, parentId) => void createNodeFromFile(file, parentId)} selectedId={workspace.selectedId} contextMenuNodeId={contextMenu?.context === "lore" ? contextMenu.nodeId : null} setSelectedId={(id) => { setSelectedTrashNodeId(null); workspace.setSelectedId(id); }} setContextMenu={(menu) => setContextMenu({ ...menu, context: "lore" })} />
                  ) : (
                    <NodePanels
                      projectKey={projectKey}
                      onContextMenu={setContextMenu}
                      panel={sidebarPanel}
                      query={sidebarQuery}
                      nodes={workspace.nodes}
                      recentNodes={workspace.recentNodes}
                      recentActivity={workspace.recentActivity}
                      selectedId={workspace.selectedId}
                      onSelect={(id) => { setSelectedTrashNodeId(null); setSelectedLoreIds([id]); workspace.setSelectedId(id); }}
                      onCreateType={(type) => {
                        const name = getUniqueNodeName(getNodeDisplayLabel(type, t), workspace.nodes);
                        workspace.createNode(name, type, null);
                      }}
                    />
                  )}
                </>
              )}
          </section>
        </aside>

        {sidebarVisible && (
          <div onMouseDown={onMouseDown} className="workspace-resizer" />
        )}

        <main
          className={`workspace-main${view === "graph" ? " workspace-main--graph" : ""}`}
        >
          {selectedTrashNode ? (
            <div className="editor-page editor-page--trash">
              <button type="button" className="trash-node-back" onClick={returnToTrash}>
                {t("trash.back")}
              </button>
              <div className="trash-node-warning">
                {t("trash.readOnly")}
              </div>
              <div
                className="editor-page__type"
                style={{ color: getNodeDefinition(selectedTrashNode.type).color }}
              >
                {getNodeDisplayLabel(selectedTrashNode.type, t)}
              </div>
              <h1 className="editor-page__title">{selectedTrashNode.name}</h1>
              <RichTextEditor
                node={selectedTrashNode}
                nodes={workspace.nodes}
                deletedNodes={workspace.deletedNodes}
                editorRef={editorRef}
                onContentChange={workspace.updateContent}
                setSelectedId={workspace.setSelectedId}
                setExpanded={workspace.setExpanded}
                pendingNodeDrop={null}
                onNodeDropHandled={() => undefined}
                onOpenDeletedNode={openDeletedNode}
                onOpenNodeView={(id) => {
                  setSelectedTrashNodeId(null);
                  setProjectTab("workspace");
                  setView("list");
                  workspace.setSelectedId(id);
                }}
                readOnly
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 0,
                  minWidth: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "#E8E9EA",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  lineHeight: "1.6",
                  outline: "none",
                }}
              />
            </div>
          ) : projectTab === "settings" && settingsPanel === "trash" ? (
            <section className="trash-view">
              <div className="trash-view__header">
                <div>
                  <div className="project-settings__eyebrow">{t("trash.heading")}</div>
                  <h1>{t("trash.deletedNodes")}</h1>
                </div>
                <div className="trash-view__header-right">
                  <div className="trash-view__view-toggle" role="group" aria-label={t("trash.view")}>
                    <button type="button" className={trashView === "gallery" ? "is-active" : ""} onClick={() => setTrashView("gallery")}>{t("trash.gallery")}</button>
                    <button type="button" className={trashView === "list" ? "is-active" : ""} onClick={() => setTrashView("list")}>{t("trash.list")}</button>
                  </div>
                  <div className="trash-view__actions">
                    <button
                      type="button"
                      className="trash-view__more"
                      title={t("trash.selectedActions")}
                      aria-label={t("trash.selectedActions")}
                      onClick={(event) => setTrashActionsMenu({ x: event.currentTarget.getBoundingClientRect().right, y: event.currentTarget.getBoundingClientRect().bottom + 6 })}
                    >
                      <span aria-hidden="true">...</span>
                    </button>
                    <button
                      type="button"
                      title={t("trash.restoreSelected")}
                      disabled={workspace.selectedDeletedIds.length === 0}
                      onClick={workspace.restoreDeletedNodes}
                    >
                      <span className="trash-view__action-icon" aria-hidden="true">↶</span>
                    </button>
                    <button
                      type="button"
                      title={t("trash.deletePermanently")}
                      disabled={workspace.selectedDeletedIds.length === 0}
                      onClick={workspace.permanentlyDeleteNodes}
                    >
                      <span className="trash-view__action-icon" aria-hidden="true">×</span>
                    </button>
                  </div>
                </div>
              </div>
              {workspace.deletedNodes.length === 0 ? (
                <div className="trash-view__empty">{t("trash.empty")}</div>
              ) : trashView === "list" ? (
                <div className="trash-view__list">
                  {workspace.deletedNodes.map((node) => (
                    <div
                      key={node.id}
                      className={`trash-view__item ${workspace.selectedDeletedIds.includes(node.id) ? "is-selected" : ""}`}
                      onClick={(event) => handleTrashNodeClick(event, node)}
                      onContextMenu={(event) => openTrashMenu(event, node)}
                    >
                      <input
                        type="checkbox"
                        checked={workspace.selectedDeletedIds.includes(node.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => workspace.selectDeletedNode(node.id, { ctrlKey: true })}
                      />
                      <button
                        type="button"
                        title={node.name}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleTrashNodeClick(event, node);
                        }}
                      >
                        <span
                          className="trash-view__type-dot"
                          style={{ backgroundColor: getNodeDefinition(node.type).color }}
                        />
                        {node.name}
                      </button>
                      <small>{getNodeDisplayLabel(node.type, t)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="trash-view__gallery">
                  {workspace.deletedNodes.map((node) => (
                    <article
                      key={node.id}
                      className={`trash-view__card ${workspace.selectedDeletedIds.includes(node.id) ? "is-selected" : ""}`}
                      onClick={(event) => handleTrashNodeClick(event, node)}
                      onContextMenu={(event) => openTrashMenu(event, node)}
                    >
                      <div className="trash-view__preview">
                        <TrashNodePreview node={node} />
                        <small>{getNodeDisplayLabel(node.type, t)}</small>
                      </div>
                      <div className="trash-view__card-meta">
                        <span className="trash-view__card-name" title={node.name}>{node.name}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : projectTab === "settings" && settingsPanel === "changelog" ? (
            <section className="project-settings">
              <div className="project-settings__eyebrow">{t("changelog.heading")}</div>
              <h1>Changelog</h1>
              <div className="changelog-list">
                {CHANGELOG_ENTRIES.map((entry) => (
                  <article className="changelog-entry" key={entry.version}>
                    <div className="changelog-entry__meta">
                      <span>{entry.category}</span>
                      <span>v{entry.version}</span>
                      <span>{entry.date}</span>
                    </div>
                    <h2>{"titleKey" in entry ? t(entry.titleKey) : entry.title}</h2>
                    {"summaryKey" in entry && entry.summaryKey ? <p className="changelog-entry__summary">{t(entry.summaryKey)}</p> : "summary" in entry && entry.summary && <p className="changelog-entry__summary">{entry.summary}</p>}
                    {"sections" in entry && entry.sections ? (
                      <div className="changelog-entry__sections">
                        {entry.sections.map((section) => <section className={section.kind === "fix" ? "is-fix" : ""} key={"titleKey" in section ? section.titleKey : section.title}>
                          <h3>{"titleKey" in section ? t(section.titleKey) : section.title}</h3>
                          <ul>{("changeKeys" in section ? section.changeKeys.map((key) => t(key)) : section.changes).map((change) => <li key={change}>{change}</li>)}</ul>
                        </section>)}
                      </div>
                    ) : (
                      <ul>
                        {("changeKeys" in entry ? entry.changeKeys.map((key) => t(key)) : entry.changes)
                          .map((change) => <li key={change}>{change}</li>)}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ) : projectTab === "settings" ? (
            <section className="project-settings">
              <div className="project-settings__hero">
                <div
                  className="project-settings__image"
                  style={projectImage ? { backgroundImage: `url(${projectImage})` } : { backgroundColor: avatarColor }}
                >
                  {!projectImage && projectInitial}
                </div>
                <div>
                  <div className="project-settings__eyebrow">{t("settings.project.heading")}</div>
                  <h1>{projectName}</h1>
                </div>
              </div>
              <label className="project-settings__field">
                {t("settings.defaultNodeType")}
                <select
                  value={defaultNodeType}
                  onChange={(event) =>
                    setDefaultNodeType(event.target.value as BaseNodeType)
                  }
                >
                  {NODE_REGISTRY.availableForCreation().map((definition) => (
                    <option key={definition.type} value={definition.type}>
                      {t(definition.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="project-settings__field">
                {t("settings.projectLocale")}
                <select value={locale} onChange={(event) => void setLocale(event.target.value as "es" | "en")}>
                  <option value="es">{t("settings.locale.es")}</option>
                  <option value="en">{t("settings.locale.en")}</option>
                </select>
              </label>
              <label className="project-settings__field">
                {t("settings.timeFormat")}
                <select value={timeFormat} onChange={(event) => setTimeFormat(event.target.value as TimeFormat)}>
                  <option value="12h">{t("settings.timeFormat.12h")}</option>
                  <option value="24h">{t("settings.timeFormat.24h")}</option>
                </select>
              </label>
              <div className="project-settings__version" aria-label={t("settings.appVersion")}>
                {appVersion ? `v${appVersion}` : "v—"}
              </div>
            </section>
          ) : view === "graph" ? (
            <GraphView
              nodes={workspace.nodes}
              onSelectNode={workspace.setSelectedId}
              onOpenNode={(id) => {
                workspace.setSelectedId(id);
                setView("list");
              }}
              projectKey={projectKey}
            />
          ) : !selectedNode ? (
            <div className="workspace-empty-state">
              <div>
                {workspace.nodes.length === 0
                  ? t("workspace.empty.none")
                  : t("workspace.empty.select")}
              </div>
            </div>
          ) : null}

          {projectTab !== "settings" && view === "list" && selectedNode && selectedType && (
            <div className="editor-page">
              <RegisteredNodeView
                node={selectedNode}
                host={nodeViewHost}
              />
            </div>
          )}
        </main>
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onCreate={(parentId) => {
            workspace.openCreate(parentId);
            cancelLoreMultiSelection();
          }}
          onRename={(id) => {
            const node = workspace.nodes.find((item) => item.id === id);
            if (!node) return;
            setSelectedTrashNodeId(null);
            setProjectTab("workspace");
            setSidebarPanel("lore");
            setSidebarQuery("");
            setSelectedLoreIds([id]);
            workspace.startRename(node);
          }}
          onView={(id) => {
            setSelectedTrashNodeId(null);
            setProjectTab("workspace");
            setView("list");
            setSelectedLoreIds([id]);
            workspace.setSelectedId(id);
          }}
          removeCount={selectedLoreIds.includes(contextMenu.nodeId ?? "") ? selectedLoreIds.length : 1}
          canDelete={!contextMenu.nodeId || workspace.canDeleteNode(contextMenu.nodeId)}
          onDelete={(id) => {
            workspace.deleteNode(id);
            setSelectedLoreIds((current) => current.filter((selectedId) => selectedId !== id));
          }}
          onRemoveFromLore={(id) => {
            workspace.removeFromLore(selectedLoreIds.includes(id) ? selectedLoreIds : [id]);
            setSelectedLoreIds([]);
            workspace.setCreating(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {loreAddOpen && <LoreAddDialog nodes={workspace.nodes} onAdd={(ids) => { workspace.addToLore(ids); setSelectedLoreIds(ids); }} onCreate={(name, type) => {
        const id = workspace.createNode(name, type, null);
        workspace.setSelectedId(id);
        setSelectedLoreIds([id]);
      }} onClose={() => setLoreAddOpen(false)} />}
      {trashMenu && (
        <HisContextMenu
          x={trashMenu.x}
          y={trashMenu.y}
          items={trashActionItems}
          onClose={() => setTrashMenu(null)}
        />
      )}
      {trashActionsMenu && (
        <HisContextMenu
          x={trashActionsMenu.x}
          y={trashActionsMenu.y}
          items={trashActionItems}
          onClose={() => setTrashActionsMenu(null)}
        />
      )}
      {workspace.dragPreviewId && workspace.isDraggingNode && previewNode && (
        <DragPreview
          node={previewNode}
          nodeType={getEffectiveNodeType(workspace.nodes, previewNode)}
          position={workspace.dragPreviewPosition}
        />
      )}
    </div>
  );
}
