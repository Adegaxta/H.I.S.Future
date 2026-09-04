import { AVATAR_COLORS } from "../defs/palette";
import { useCallback, useEffect, useRef, useState } from "react";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useTreeController } from "../hooks/useTreeController";
import ContextMenu from "./ContextMenu";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";
import DragPreview from "./DragPreview";
import SidebarTree from "./SidebarTree";
import NodePanels from "./NodePanels";
import RichTextEditor from "./RichTextEditor";
import ImageNodeView from "./ImageNodeView";
import PdfNodeView from "./PdfNodeView";
import PageNodeHeader from "./PageNodeHeader";
import GraphView from "./GraphView";
import CalendarNodeView from "./CalendarNodeView";
import TempoInspector from "./TempoInspector";
import { getPageMeta } from "../utils/pageMeta";
import { createCalendarContent, createTempoContent, DEFAULT_TEMPO_COLOR, setTempoMeta, type TempoMeta, type TempoSubtype, type TimeFormat } from "../utils/temporalMeta";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CHANGELOG_ENTRIES, CURRENT_VERSION } from "../defs/changelog";
import {
  createImageContent,
  getImageResourceInfo,
  compressImageSource,
} from "../utils/imageResource";
import {
  FileNodeImportError,
  findImportableFile,
  importFileAsNode,
  isImportableDragItem,
} from "../project/fileNodeImporter";
import { useLocale } from "../i18n/LocaleContext";
import windowCloseAsset from "../assets/ui/window_close.svg";
import windowMaximizeAsset from "../assets/ui/window_maximize.svg";
import windowMinimizeAsset from "../assets/ui/window_minimize.svg";

interface AppWorkspaceProps {
  projectKey: string;
  projectName: string;
  onExitProject: () => Promise<void>;
}

const MAX_LOCAL_STORAGE_STRING_BYTES = 900_000;

type NavigationEntry =
  | { kind: "node"; id: string }
  | { kind: "trash"; id: string };

function TrashNodePreview({ node }: { node: NodeItem }) {
  const parsed = new DOMParser().parseFromString(node.content, "text/html");
  const resource = node.type === "imagen" ? getImageResourceInfo(node.content, node.name) : null;
  const imageSource = resource?.src || parsed.querySelector("img")?.getAttribute("src");
  if (imageSource) {
    return <img src={imageSource} alt="" loading="lazy" decoding="async" />;
  }
  const text = parsed.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 180);
  return <span>{text || "Sin previsualización"}</span>;
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
  const imageStorageKey = `hisfuture.project.image.${projectKey}`;
  const coverNodeStorageKey = `hisfuture.project.cover-node.${projectKey}`;
  const colorStorageKey = `hisfuture.project.color.${projectKey}`;
  const timeFormatStorageKey = "hisfuture.settings.time-format";
  const trashViewStorageKey = `hisfuture.settings.trash-view.${projectKey}`;
  const [defaultNodeType, setDefaultNodeType] = useState<BaseNodeType>("pagina");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    localStorage.getItem(timeFormatStorageKey) === "24h" ? "24h" : "12h",
  );
  const workspace = useTreeController(defaultNodeType, projectKey);
  const [width, setWidth] = useState(260);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<"lore" | "recent" | "types">(
    "lore",
  );
  const [view, setView] = useState("list");
  const [projectTab, setProjectTab] = useState<"workspace" | "settings">(
    "workspace",
  );
  const [settingsPanel, setSettingsPanel] = useState<"general" | "trash" | "changelog">(
    "general",
  );
  const [trashView, setTrashView] = useState<"gallery" | "list">(() =>
    localStorage.getItem(trashViewStorageKey) === "list" ? "list" : "gallery",
  );
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(
    null,
  );
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [projectImage, setProjectImage] = useState<string | null>(() =>
    localStorage.getItem(imageStorageKey),
  );
  const [avatarColor] = useState(
    () =>
      localStorage.getItem(colorStorageKey) ||
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  );

  useEffect(() => {
    if (projectImage) safeLocalStorageSet(imageStorageKey, projectImage);
    safeLocalStorageSet(colorStorageKey, avatarColor);
  }, [avatarColor, colorStorageKey, imageStorageKey, projectImage]);
  useEffect(() => {
    localStorage.setItem(timeFormatStorageKey, timeFormat);
  }, [timeFormat]);
  useEffect(() => {
    localStorage.setItem(trashViewStorageKey, trashView);
  }, [trashView, trashViewStorageKey]);
  const [contextMenu, setContextMenu] = useState<
    React.ComponentProps<typeof ContextMenu>["menu"] | null
  >(null);
  const [trashMenu, setTrashMenu] = useState<{ x: number; y: number } | null>(null);
  const [trashActionsMenu, setTrashActionsMenu] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const resizing = useRef(false);
  const navigationHistory = useRef<{ entries: NavigationEntry[]; index: number }>({
    entries: [],
    index: -1,
  });
  const calendarNavigation = useRef<((direction: -1 | 1) => boolean) | null>(null);
  const selectedNode = workspace.nodes.find(
    (node) => node.id === workspace.selectedId,
  );
  const selectedType = selectedNode
    ? getEffectiveNodeType(workspace.nodes, selectedNode)
    : null;
  const selectedTrashNode = workspace.deletedNodes.find(
    (node) => node.id === selectedTrashNodeId,
  );
  // El ancho y la posición de bloques de Nodo Página solo afectan el texto, no la cabecera.
  const pageMeta = selectedNode?.type === "pagina" ? getPageMeta(selectedNode.content) : null;
  const textBlockMargin = pageMeta?.textPosition === "right"
    ? { marginLeft: "auto", marginRight: 0 }
    : pageMeta?.textPosition === "left"
      ? { marginLeft: 0, marginRight: "auto" }
      : { marginLeft: "auto", marginRight: "auto" };
  useEffect(() => {
    if (workspace.selectedId) setSelectedTrashNodeId(null);
  }, [workspace.selectedId]);

  useEffect(() => {
    const id = workspace.selectedId;
    if (!id) return;
    const history = navigationHistory.current;
    const currentEntry = history.entries[history.index];
    if (currentEntry?.kind === "node" && currentEntry.id === id) return;
    const current = history.entries.slice(0, history.index + 1);
    if (current[current.length - 1]?.kind === "node" && current[current.length - 1].id === id) return;
    navigationHistory.current = {
      entries: [...current, { kind: "node", id }],
      index: current.length,
    };
  }, [workspace.selectedId]);

  useEffect(() => {
    const id = selectedTrashNodeId;
    if (!id) return;
    const history = navigationHistory.current;
    const currentEntry = history.entries[history.index];
    if (currentEntry?.kind === "trash" && currentEntry.id === id) return;
    const current = history.entries.slice(0, history.index + 1);
    if (current[current.length - 1]?.kind === "trash" && current[current.length - 1].id === id) return;
    navigationHistory.current = {
      entries: [...current, { kind: "trash", id }],
      index: current.length,
    };
  }, [selectedTrashNodeId]);

  useEffect(() => {
    const handleMouseButton = (event: globalThis.MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      const direction = event.button === 3 ? -1 : 1;
      if (selectedNode?.type === "calendario" && calendarNavigation.current?.(direction)) {
        event.preventDefault();
        return;
      }
      const history = navigationHistory.current;
      const nextIndex = history.index + direction;
      if (nextIndex < 0 || nextIndex >= history.entries.length) return;
      event.preventDefault();
      const next = history.entries[nextIndex];
      history.index = nextIndex;
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
    };
    window.addEventListener("mousedown", handleMouseButton);
    return () => window.removeEventListener("mousedown", handleMouseButton);
  }, [workspace, selectedNode?.id, selectedNode?.type]);

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
      setWidth(Math.min(420, Math.max(200, event.clientX)));
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
  const getCurrentSnapshot = () => {
    const currentNodeId = workspace.selectedId;
    const currentHtml = editorRef.current?.innerHTML;
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
      console.error("No se pudo guardar el proyecto antes de salir", error);
    }

    try {
      await onExitProject();
    } catch (error) {
      console.error("No se pudo cerrar el proyecto", error);
    }
  };
  const closeApplication = async () => {
    if (closingWindowRef.current) return;
    closingWindowRef.current = true;

    try {
      await saveCurrentWorkspace();
    } catch (error) {
      console.error("No se pudo guardar el proyecto antes de cerrar", error);
    }

    try {
      await onExitProject();
    } catch (error) {
      console.error("No se pudo empaquetar el proyecto antes de cerrar", error);
      closingWindowRef.current = false;
      return;
    }

    try {
      await closeWindowSafely();
    } catch (error) {
      console.error("No se pudo cerrar la ventana", error);
    } finally {
      closingWindowRef.current = false;
    }
  };
  const projectInitial = projectName.trim().charAt(0).toUpperCase() || "P";
  const findCoverNode = () => {
    const storedId = localStorage.getItem(coverNodeStorageKey);
    return (
      workspace.nodes.find((node) => node.id === storedId) ||
      workspace.nodes.find(
        (node) =>
          node.type === "imagen" &&
          projectImage !== null &&
          getImageResourceInfo(node.content, node.name)?.src === projectImage,
      ) ||
      workspace.nodes.find(
        (node) => node.type === "imagen" && node.name === "Imagen de portada",
      )
    );
  };
  const resolveDropParentId = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-node-id]");
    const targetId = target?.dataset.nodeId;
    if (!targetId) return null;

    const targetNode = workspace.nodes.find((node) => node.id === targetId);
    if (!targetNode) return null;

    const targetType = getEffectiveNodeType(workspace.nodes, targetNode);
    const canContain =
      getNodeDefinition(targetType).canContainChildren || targetType === "pagina-carpeta";

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
      const compressed = await compressImageSource(reader.result);
      setProjectImage(compressed);
      safeLocalStorageSet(imageStorageKey, compressed);
      const coverNode = findCoverNode();
      if (coverNode) {
        const resource = getImageResourceInfo(coverNode.content, coverNode.name);
        const content = createImageContent(
          compressed,
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
          compressed,
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
  const createCalendarNode = () => {
    const usedNumbers = new Set(
      workspace.nodes
        .filter((node) => node.type === "calendario")
        .map((node) => /^Calendario (\d+)$/.exec(node.name)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(Number),
    );
    let number = 1;
    while (usedNumbers.has(number)) number += 1;
    const id = workspace.createNode(
      `Calendario ${number}`,
      "calendario",
      null,
      createCalendarContent(),
    );
    workspace.setSelectedId(id);
    return true;
  };
  const handleSlashCommand = (tag: string) => {
    if (tag !== "CALENDARIO") return false;
    return createCalendarNode();
  };
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
  const createTempoNode = (calendarId: string, date: string, startTime?: string, subtype: TempoSubtype = "daily", endDate: string | null = null, weeklyVisualOrder: number | null = null) => {
    const usedNumbers = new Set(
      workspace.nodes
        .filter((node) => node.type === "tempo" && node.parentId === calendarId)
        .map((node) => /^Tempo (\d+)$/.exec(node.name)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(Number),
    );
    let number = 1;
    while (usedNumbers.has(number)) number += 1;
    const id = workspace.createNode(
      `Tempo ${number}`,
      "tempo",
      calendarId,
      createTempoContent({ date, startTime: startTime ?? null, endTime: null, subtype, endDate, color: DEFAULT_TEMPO_COLOR, weeklyVisualOrder, activeWeekdays: null }),
    );
    workspace.setExpanded((current) => ({ ...current, [calendarId]: true }));
    return id;
  };
  const moveTempoNode = (id: string, meta: TempoMeta) => {
    const tempo = workspace.nodes.find((item) => item.id === id && item.type === "tempo");
    if (tempo) workspace.updateContent(id, setTempoMeta(tempo.content, meta));
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
      label: "Recuperar seleccionados",
      disabled: workspace.selectedDeletedIds.length === 0,
      onSelect: workspace.restoreDeletedNodes,
    },
    {
      id: "delete-permanently",
      label: "Eliminar permanentemente",
      danger: true,
      disabled: workspace.selectedDeletedIds.length === 0,
      onSelect: workspace.permanentlyDeleteNodes,
    },
  ];

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
                {option === "list" ? "LISTA" : "GRAFO"}
              </button>
            ))}
            <button
              type="button"
              className="workspace-header__quick-template"
              data-tauri-drag-region="false"
              title="Salir del proyecto (DEV)"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => void exitWorkspace()}
            >
              SALIR DEL PROYECTO <b>DEV</b>
            </button>
          </div>
        </div>
        <div className="workspace-header__right" data-tauri-drag-region="false">
          <div className="workspace-header__version">v{CURRENT_VERSION}</div>
          <div className="workspace-header__window-controls">
            <button type="button" title="Minimizar" onClick={() => void getCurrentWindow().minimize()}><img src={windowMinimizeAsset} alt="" /></button>
            <button type="button" title="Maximizar" onClick={() => void getCurrentWindow().toggleMaximize()}><img src={windowMaximizeAsset} alt="" /></button>
            <button type="button" title="Cerrar" onClick={() => void closeApplication()}><img src={windowCloseAsset} alt="" /></button>
          </div>
        </div>
      </header>

      {fileImportError && (
        <div className="workspace-file-import-error" role="alert">
          <span>{fileImportError}</span>
          <button type="button" onClick={() => setFileImportError(null)} aria-label={t("fileImport.dismiss")}>×</button>
        </div>
      )}

      <div className="workspace-body">
        {sidebarVisible && (
          <aside
            className="workspace-sidebar"
            data-sidebar="true"
            style={{ width: `${width}px` }}
          >
            <div className="workspace-sidebar__heading">
              <label
                className="workspace-sidebar__project-avatar"
                style={projectImage ? { backgroundImage: `url(${projectImage})` } : { backgroundColor: avatarColor }}
                title="Cambiar imagen del proyecto"
              >
                {!projectImage && projectInitial}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleProjectImageUpload(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div>
                <div className="workspace-sidebar__title">{projectName}</div>
                <div className="workspace-sidebar__count">
                  {workspace.nodes.length} NODOS
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTrashNodeId(null);
                  setProjectTab((current) =>
                    current === "settings" ? "workspace" : "settings",
                  );
                }}
                title="Ajustes del proyecto"
                className={`workspace-sidebar__settings ${projectTab === "settings" ? "is-active" : ""}`}
              >
                •
              </button>
              <button
                type="button"
                onClick={() => setSidebarVisible(false)}
                title="Ocultar panel"
                className="workspace-sidebar__hide"
              >
                «
              </button>
            </div>
            {projectTab === "settings" ? (
              <nav className="project-sidebar__tabs" aria-label="Ajustes del proyecto">
                <button
                  type="button"
                  className={settingsPanel === "general" ? "is-active" : ""}
                  onClick={() => {
                    setSelectedTrashNodeId(null);
                    setSettingsPanel("general");
                  }}
                >
                  <span className="project-sidebar__icon">G</span>
                  GENERAL
                </button>
                <button
                  type="button"
                  className={settingsPanel === "trash" ? "is-active" : ""}
                  onClick={() => {
                    setSelectedTrashNodeId(null);
                    setSettingsPanel("trash");
                  }}
                >
                  <span className="project-sidebar__icon">P</span>
                  PAPELERA
                </button>
                <button
                  type="button"
                  className={settingsPanel === "changelog" ? "is-active" : ""}
                  onClick={() => {
                    setSelectedTrashNodeId(null);
                    setSettingsPanel("changelog");
                  }}
                >
                  <span className="project-sidebar__icon">V</span>
                  CAMBIOS
                </button>
              </nav>
            ) : <><button
              type="button"
              onClick={() => workspace.openCreate(null)}
              className="workspace-sidebar__create"
            >
              + NUEVO NODO RAÍZ
            </button>
            <nav className="workspace-sidebar__tabs" aria-label="Paneles">
              {[
                ["lore", "LORE"],
                ["recent", "RECIENTES"],
                ["types", "TIPOS DE NODOS"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={sidebarPanel === id ? "is-active" : ""}
                  onClick={() => setSidebarPanel(id as typeof sidebarPanel)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {sidebarPanel === "lore" ? (
              <SidebarTree
                {...workspace}
                onFileDrop={(file, parentId) => void createNodeFromFile(file, parentId)}
                selectedId={workspace.selectedId}
                setSelectedId={(id) => {
                  setSelectedTrashNodeId(null);
                  workspace.setSelectedId(id);
                }}
                setContextMenu={(menu) => setContextMenu(menu)}
              />
            ) : (
              <NodePanels
                panel={sidebarPanel}
                nodes={workspace.nodes}
                recentNodes={workspace.recentNodes}
                selectedId={workspace.selectedId}
                onSelect={(id) => {
                  setSelectedTrashNodeId(null);
                  workspace.setSelectedId(id);
                }}
              />
            )}</>}
          </aside>
        )}

        {sidebarVisible && (
          <div onMouseDown={onMouseDown} className="workspace-resizer" />
        )}

        {!sidebarVisible && (
          <button
            type="button"
            className="workspace-sidebar__show"
            onClick={() => setSidebarVisible(true)}
            title="Mostrar panel"
            aria-label="Mostrar panel izquierdo"
          >
            »
          </button>
        )}

        <main
          className={`workspace-main${view === "graph" ? " workspace-main--graph" : ""}`}
        >
          {selectedTrashNode ? (
            <div className="editor-page editor-page--trash">
              <button type="button" className="trash-node-back" onClick={returnToTrash}>
                Volver
              </button>
              <div className="trash-node-warning">
                Este nodo está en la papelera y no es editable.
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
                  <div className="project-settings__eyebrow">PAPELERA</div>
                  <h1>Nodos eliminados</h1>
                </div>
                <div className="trash-view__header-right">
                  <div className="trash-view__view-toggle" role="group" aria-label="Vista de papelera">
                    <button type="button" className={trashView === "gallery" ? "is-active" : ""} onClick={() => setTrashView("gallery")}>GALERÍA</button>
                    <button type="button" className={trashView === "list" ? "is-active" : ""} onClick={() => setTrashView("list")}>LISTA</button>
                  </div>
                  <div className="trash-view__actions">
                    <button
                      type="button"
                      className="trash-view__more"
                      title="Acciones de seleccionados"
                      aria-label="Acciones de seleccionados"
                      onClick={(event) => setTrashActionsMenu({ x: event.currentTarget.getBoundingClientRect().right, y: event.currentTarget.getBoundingClientRect().bottom + 6 })}
                    >
                      <span aria-hidden="true">...</span>
                    </button>
                    <button
                      type="button"
                      title="Restaurar seleccionados"
                      disabled={workspace.selectedDeletedIds.length === 0}
                      onClick={workspace.restoreDeletedNodes}
                    >
                      <img src="/coso/restore.svg" alt="" />
                    </button>
                    <button
                      type="button"
                      title="Eliminar definitivamente"
                      disabled={workspace.selectedDeletedIds.length === 0}
                      onClick={workspace.permanentlyDeleteNodes}
                    >
                      <img src="/coso/delete.svg" alt="" />
                    </button>
                  </div>
                </div>
              </div>
              {workspace.deletedNodes.length === 0 ? (
                <div className="trash-view__empty">La papelera está vacía.</div>
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
              <div className="project-settings__eyebrow">HISTORIAL DE CAMBIOS</div>
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
                    <ul>
                      {("changeKeys" in entry ? entry.changeKeys.map((key) => t(key)) : entry.changes)
                        .map((change) => <li key={change}>{change}</li>)}
                    </ul>
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
                  <div className="project-settings__eyebrow">PROYECTO</div>
                  <h1>{projectName}</h1>
                </div>
              </div>
              <label className="project-settings__field">
                Tipo de Nodo por defecto
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
                Formato horario
                <select value={timeFormat} onChange={(event) => setTimeFormat(event.target.value as TimeFormat)}>
                  <option value="12h">12 horas (AM/PM)</option>
                  <option value="24h">24 horas</option>
                </select>
              </label>
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
                  ? "Ningún nodo creado todavía."
                  : "Selecciona una página o categoría en el panel."}
              </div>
            </div>
          ) : null}

          {projectTab !== "settings" && view === "list" && selectedNode && selectedType && (
            <div className="editor-page">
              {selectedNode.type === "pagina" ? (
                <>
                  <PageNodeHeader
                    node={selectedNode}
                    nodes={workspace.nodes}
                    onContentChange={workspace.updateContent}
                    onRename={workspace.renameNode}
                    onImageFileUpload={async (file) => (await createNodeFromFile(file, selectedNode.parentId))?.id ?? null}
                  />
                  <RichTextEditor
                    node={selectedNode}
                    nodes={workspace.nodes}
                    deletedNodes={workspace.deletedNodes}
                    editorRef={editorRef}
                    onContentChange={workspace.updateContent}
                    setSelectedId={(id) => workspace.setSelectedId(id)}
                    setExpanded={workspace.setExpanded}
                    pendingNodeDrop={workspace.pendingEditorNodeDrop}
                    onNodeDropHandled={workspace.clearPendingEditorNodeDrop}
                    onOpenDeletedNode={openDeletedNode}
                    onFileImport={async (file: File, parentId?: string | null) => {
                      return createNodeFromFile(file, parentId ?? selectedNode.parentId ?? null);
                    }}
                    onCreatePastedNode={createPastedNode}
                    onSlashCommand={handleSlashCommand}
                    onOpenNodeView={(id) => {
                      setSelectedTrashNodeId(null);
                      setProjectTab("workspace");
                      setView("list");
                      workspace.setSelectedId(id);
                    }}
                    style={{
                      display: "block",
                      width: pageMeta ? `${pageMeta.blockWidth / 2}%` : "100%",
                      ...textBlockMargin,
                      minHeight: 0,
                      minWidth: 0,
                      padding: 0,
                      border: "none",
                      resize: "none",
                      background: "transparent",
                      color: "#E8E9EA",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      lineHeight: "1.6",
                      outline: "none",
                    }}
                  />
                </>
              ) : selectedNode.type === "calendario" ? (
                <CalendarNodeView
                  node={selectedNode}
                  nodes={workspace.nodes}
                  deletedNodes={workspace.deletedNodes}
                  onContentChange={workspace.updateContent}
                  onCreateTempo={(date, startTime, subtype, endDate, weeklyVisualOrder) => createTempoNode(selectedNode.id, date, startTime, subtype, endDate, weeklyVisualOrder)}
                  onMoveTempo={moveTempoNode}
                  onRenameTempo={workspace.renameNode}
                  onDeleteTempo={workspace.deleteNode}
                  setExpanded={workspace.setExpanded}
                  onOpenDeletedNode={(id) => {
                    openDeletedNode(id);
                  }}
                  onOpenNodeView={(id) => {
                    setSelectedTrashNodeId(null);
                    setProjectTab("workspace");
                    setView("list");
                    workspace.setSelectedId(id);
                  }}
                  onFileImport={async (file: File, parentId?: string | null) => {
                    return createNodeFromFile(file, parentId ?? selectedNode.id);
                  }}
                  onSlashCommand={handleSlashCommand}
                  onRegisterNavigation={(handler) => {
                    calendarNavigation.current = handler;
                    return () => {
                      if (calendarNavigation.current === handler) calendarNavigation.current = null;
                    };
                  }}
                  timeFormat={timeFormat}
                />
              ) : selectedNode.type === "tempo" ? (
                <TempoInspector
                  tempo={selectedNode}
                  nodes={workspace.nodes}
                  deletedNodes={workspace.deletedNodes}
                  timeFormat={timeFormat}
                  variant="standalone"
                  onRename={workspace.renameNode}
                  onContentChange={workspace.updateContent}
                  setExpanded={workspace.setExpanded}
                  onOpenDeletedNode={(id) => {
                    openDeletedNode(id);
                  }}
                  onFileImport={async (file: File, parentId?: string | null) => {
                    return createNodeFromFile(file, parentId ?? selectedNode.parentId ?? null);
                  }}
                  onSlashCommand={handleSlashCommand}
                  onOpenNodeView={(id) => {
                    setSelectedTrashNodeId(null);
                    setProjectTab("workspace");
                    setView("list");
                    workspace.setSelectedId(id);
                  }}
                />
              ) : selectedNode.type === "pdf" ? (
                <PdfNodeView node={selectedNode} />
              ) : selectedNode.type === "imagen" ? (
                <ImageNodeView
                  node={selectedNode}
                  onContentChange={updateImageContent}
                  onRename={workspace.renameNode}
                  onDelete={workspace.deleteNode}
                  onUseAsProjectCover={(nodeId) => {
                    const imageNode = workspace.nodes.find((node) => node.id === nodeId);
                    const resource = imageNode ? getImageResourceInfo(imageNode.content, imageNode.name) : null;
                    if (!resource) return;
                    setProjectImage(resource.src);
                    safeLocalStorageSet(imageStorageKey, resource.src);
                    safeLocalStorageSet(coverNodeStorageKey, nodeId);
                  }}
                />
              ) : (
                <RichTextEditor
                  node={selectedNode}
                  nodes={workspace.nodes}
                  deletedNodes={workspace.deletedNodes}
                  editorRef={editorRef}
                  onContentChange={workspace.updateContent}
                  setSelectedId={(id) => workspace.setSelectedId(id)}
                  setExpanded={workspace.setExpanded}
                  pendingNodeDrop={workspace.pendingEditorNodeDrop}
                  onNodeDropHandled={workspace.clearPendingEditorNodeDrop}
                  onOpenDeletedNode={(id) => {
                    openDeletedNode(id);
                  }}
                  onFileImport={async (file: File, parentId?: string | null) => {
                    return createNodeFromFile(file, parentId ?? selectedNode.parentId ?? null);
                  }}
                  onCreatePastedNode={createPastedNode}
                  onSlashCommand={handleSlashCommand}
                  onOpenNodeView={(id) => {
                    setSelectedTrashNodeId(null);
                    setProjectTab("workspace");
                    setView("list");
                    workspace.setSelectedId(id);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: "calc(100vh - 40px)",
                    minWidth: 0,
                    padding: 0,
                    border: "none",
                    resize: "none",
                    background: "transparent",
                    color: "#E8E9EA",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    lineHeight: "1.6",
                    outline: "none",
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onCreate={workspace.openCreate}
          onView={(id) => {
            setSelectedTrashNodeId(null);
            setProjectTab("workspace");
            setView("list");
            workspace.setSelectedId(id);
          }}
          onDelete={workspace.deleteNode}
          onClose={() => setContextMenu(null)}
        />
      )}
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
