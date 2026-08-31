import { AVATAR_COLORS } from "../defs/palette";
import { useCallback, useEffect, useRef, useState } from "react";
import { NODE_REGISTRY, getNodeDefinition } from "../defs/nodeTypes";
import type { BaseNodeType } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useTreeController } from "../hooks/useTreeController";
import ContextMenu from "./ContextMenu";
import DragPreview from "./DragPreview";
import SidebarTree from "./SidebarTree";
import NodePanels from "./NodePanels";
import RichTextEditor from "./RichTextEditor";
import ImageNodeView from "./ImageNodeView";
import GraphView from "./GraphView";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CHANGELOG_ENTRIES, CURRENT_VERSION } from "../defs/changelog";
import {
  createImageContent,
  getImageResourceInfo,
  hashImageFile,
  compressImageSource,
} from "../utils/imageResource";
import windowCloseAsset from "../assets/ui/window_close.svg";
import windowMaximizeAsset from "../assets/ui/window_maximize.svg";
import windowMinimizeAsset from "../assets/ui/window_minimize.svg";

interface AppWorkspaceProps {
  projectKey: string;
  projectName: string;
  onExitProject: () => Promise<void>;
}

const MAX_LOCAL_STORAGE_STRING_BYTES = 900_000;

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
  const imageStorageKey = `hisfuture.project.image.${projectKey}`;
  const coverNodeStorageKey = `hisfuture.project.cover-node.${projectKey}`;
  const colorStorageKey = `hisfuture.project.color.${projectKey}`;
  const [defaultNodeType, setDefaultNodeType] = useState<BaseNodeType>("pagina");
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
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(
    null,
  );
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
  const [contextMenu, setContextMenu] = useState<
    React.ComponentProps<typeof ContextMenu>["menu"] | null
  >(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const resizing = useRef(false);
  const navigationHistory = useRef<{ ids: string[]; index: number }>({
    ids: [],
    index: -1,
  });
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
    const id = workspace.selectedId;
    if (!id) return;
    const history = navigationHistory.current;
    if (history.ids[history.index] === id) return;
    const current = history.ids.slice(0, history.index + 1);
    if (current[current.length - 1] === id) return;
    navigationHistory.current = {
      ids: [...current, id],
      index: current.length,
    };
  }, [workspace.selectedId]);

  useEffect(() => {
    const handleMouseButton = (event: globalThis.MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      const history = navigationHistory.current;
      const nextIndex = event.button === 3 ? history.index - 1 : history.index + 1;
      if (nextIndex < 0 || nextIndex >= history.ids.length) return;
      event.preventDefault();
      history.index = nextIndex;
      workspace.setSelectedId(history.ids[nextIndex]);
    };
    window.addEventListener("mousedown", handleMouseButton);
    return () => window.removeEventListener("mousedown", handleMouseButton);
  }, [workspace]);

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

  const isImageFile = (file?: File | null) => {
    if (!file) return false;
    const normalizedName = file.name.toLowerCase();
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
      ".ico",
      ".avif",
      ".heic",
      ".heif",
      ".jfif",
    ];
    return file.type.startsWith("image/") || imageExtensions.some((ext) => normalizedName.endsWith(ext));
  };

    const isImageDragItem = (item: DataTransferItem) =>
    item.kind === "file" && item.type.startsWith("image/");

  const createImageNodeFromFile = async (file: File, parentId: string | null = null) => {
    if (!isImageFile(file)) return null;
    const hash = await hashImageFile(file);
    const existing = workspace.nodes.find(
      (node) =>
        node.type === "imagen" &&
        (getImageResourceInfo(node.content, node.name)?.hash === hash ||
          getImageResourceInfo(node.content, node.name)?.fileName === file.name),
    );
    if (existing) {
      return existing.id;
    }

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result !== "string") {
          resolve(null);
          return;
        }
        const compressed = await compressImageSource(reader.result);
        const id = workspace.createNode(
          file.name,
          "imagen",
          parentId,
          createImageContent(compressed, file.name, file.size, hash, ""),
        );
        resolve(id);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
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

      const hasImageItem = Array.from(dataTransfer.items).some((item) =>
        isImageDragItem(item),
      );

      if (hasImageItem) {
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

      const imageFile =
        Array.from(dataTransfer.files).find((file) => isImageFile(file)) ||
        Array.from(dataTransfer.items)
          .map((item) => item.getAsFile())
          .find((file): file is File => isImageFile(file));

      if (!imageFile) return;

      event.preventDefault();
      event.stopPropagation();
      void createImageNodeFromFile(
        imageFile,
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
  }, [createImageNodeFromFile, resolveDropParentId]);
  const updateImageContent = (id: string, content: string) => {
    workspace.updateContent(id, content);
    const imageNode = workspace.nodes.find((node) => node.id === id);
    const coverNode = findCoverNode();
    if (imageNode && coverNode?.id === imageNode.id) {
      const resource = getImageResourceInfo(content, imageNode.name);
      if (resource) setProjectImage(resource.src);
    }
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
                onImageFileDrop={(file, parentId) => void createImageNodeFromFile(file, parentId)}
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
              <div className="trash-node-warning">
                Este nodo está en la papelera y no es editable.
              </div>
              <div
                className="editor-page__type"
                style={{ color: getNodeDefinition(selectedTrashNode.type).color }}
              >
                {getNodeDefinition(selectedTrashNode.type).label}
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
                onOpenDeletedNode={(id) => {
                  setProjectTab("settings");
                  setSettingsPanel("trash");
                  setSelectedTrashNodeId(id);
                }}
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
                {workspace.selectedDeletedIds.length > 0 && (
                  <div className="trash-view__actions">
                    <button type="button" title="Restaurar seleccionados" onClick={workspace.restoreDeletedNodes}>
                      <img src="/coso/restore.svg" alt="" />
                    </button>
                    <button type="button" title="Eliminar definitivamente" onClick={workspace.permanentlyDeleteNodes}>
                      <img src="/coso/delete.svg" alt="" />
                    </button>
                  </div>
                )}
              </div>
              {workspace.deletedNodes.length === 0 ? (
                <div className="trash-view__empty">La papelera está vacía.</div>
              ) : (
                <div className="trash-view__list">
                  {workspace.deletedNodes.map((node) => (
                    <div key={node.id} className="trash-view__item">
                      <input
                        type="checkbox"
                        checked={workspace.selectedDeletedIds.includes(node.id)}
                        onChange={(event) =>
                          workspace.setSelectedDeletedIds((current) =>
                            event.target.checked
                              ? [...current, node.id]
                              : current.filter((id) => id !== node.id),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedTrashNodeId(node.id)}
                      >
                        <span
                          className="trash-view__type-dot"
                          style={{ backgroundColor: getNodeDefinition(node.type).color }}
                        />
                        {node.name}
                      </button>
                      <small>{getNodeDefinition(node.type).label}</small>
                    </div>
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
                    <h2>{entry.title}</h2>
                    <ul>
                      {entry.changes.map((change) => <li key={change}>{change}</li>)}
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
                      {definition.label}
                    </option>
                  ))}
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
              <div
                className="editor-page__type"
                style={{ color: getNodeDefinition(selectedType).color }}
              >
                {getNodeDefinition(selectedType).label}
              </div>
              <h1 className="editor-page__title">{selectedNode.name}</h1>
              {selectedNode.type === "imagen" ? (
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
                    setProjectTab("settings");
                    setSettingsPanel("trash");
                    setSelectedTrashNodeId(id);
                  }}
                  onImageFilePaste={async (file: File, parentId?: string | null) => {
                    return createImageNodeFromFile(file, parentId ?? selectedNode.parentId ?? null);
                  }}
                  onOpenNodeView={(id) => {
                    setSelectedTrashNodeId(null);
                    setProjectTab("workspace");
                    setView("list");
                    workspace.setSelectedId(id);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
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
