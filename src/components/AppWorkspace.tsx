import { isDesktopRuntime } from "../project/runtime";
import { useWorkspaceNavigation, type NavigationHandler } from "../hooks/useWorkspaceNavigation";
import { AVATAR_COLORS } from "../defs/palette";
import { useEffect, useRef, useState } from "react";
import { getNodeDefinition, getNodeDisplayLabel, hasNodeCapability } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useTreeController } from "../hooks/useTreeController";
import ContextMenu from "./ContextMenu";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";
import DragPreview from "./DragPreview";
import SidebarTree from "../workspace/navigation/SidebarTree";
import NodePanels from "../workspace/navigation/NodePanels";
import LoreAddDialog from "./LoreAddDialog";
import { UiIcon } from "../ui/Icon";
import { usePendingEditorFocus } from "../editor/usePendingEditorFocus";
import GraphView from "../graph/view";
import RegisteredNodeView from "./RegisteredNodeView";
import type { TimeFormat } from "../utils/temporalMeta";
import { handleCalendarSlashCommand } from "../nodes/calendar/operations";
import type { NodeViewHost } from "../nodes/rendering";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { useLocale } from "../i18n/LocaleContext";
import windowCloseAsset from "../assets/original/ui/window_close.svg";
import windowMaximizeAsset from "../assets/original/ui/window_maximize.svg";
import windowMinimizeAsset from "../assets/original/ui/window_minimize.svg";
import { getUniqueNodeName } from "../utils/nodeNames";
import { safeLocalStorageSet } from "../workspace/safeStorage";
import { useFileNodeImports } from "../workspace/useFileNodeImports";
import { fileImportAccept } from "../project/fileImportRegistry";
import { useProjectCover } from "../workspace/useProjectCover";
import { useWorkspaceLifecycle } from "../workspace/useWorkspaceLifecycle";
import { useSidebarResize } from "../workspace/useSidebarResize";
import { ChangelogPanel } from "../workspace/panels/ChangelogPanel";
import { ProjectSettingsPanel } from "../workspace/panels/ProjectSettingsPanel";
import { TrashPanel } from "../workspace/panels/TrashPanel";
import { TrashNodeView } from "../workspace/panels/TrashNodeView";
import { finishLifecycleFlow } from "../lifecycle/metrics";
import { getActiveCloseProjectTraceId, recordCloseProjectPhase } from "../lifecycle/metrics";

interface AppWorkspaceProps {
  projectKey: string;
  projectName: string;
  onExitProject: () => Promise<void>;
}

export default function AppWorkspace({
    projectKey,
    projectName,
    onExitProject,
  }: AppWorkspaceProps) {
  const { t } = useLocale();
  const colorStorageKey = `hisfuture.project.color.${projectKey}`;
  const timeFormatStorageKey = "hisfuture.settings.time-format";
  const trashViewStorageKey = `hisfuture.settings.trash-view.${projectKey}`;
  const [defaultNodeType, setDefaultNodeType] = useState<BaseNodeType>("pagina");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    localStorage.getItem(timeFormatStorageKey) === "24h" ? "24h" : "12h",
  );
  const workspace = useTreeController(defaultNodeType, projectKey, projectName);
  useEffect(() => () => {
    const started = performance.now();
    const traceId = getActiveCloseProjectTraceId();
    queueMicrotask(() => recordCloseProjectPhase(traceId, "workspace dispose", performance.now() - started));
  }, []);
  useEffect(() => {
    if (!workspace.hydrated) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        finishLifecycleFlow("project.time-to-useful-ui", "painted");
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [projectKey, workspace.hydrated]);
  const { width, startResize } = useSidebarResize();
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

  const startWindowDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    void getCurrentWindow().startDragging();
  };

  usePendingEditorFocus({
    pendingNodeId: workspace.pendingEditorFocusId,
    selectedNodeId: workspace.selectedId,
    editorRef,
    clearPendingFocus: workspace.clearPendingEditorFocus,
  });

  const previewNode = workspace.nodes.find(
    (node) => node.id === workspace.dragPreviewId,
  );
  const { exitWorkspace, hideApplication } = useWorkspaceLifecycle({
    nodes: workspace.nodes,
    selectedId: workspace.selectedId,
    editorRef,
    saveNow: workspace.saveNow,
    exitProject: onExitProject,
    reportError: setFileImportError,
  });
  const projectInitial = projectName.trim().charAt(0).toUpperCase() || "P";
  const { importFile: createNodeFromFile } = useFileNodeImports({
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    translate: t,
    reportError: setFileImportError,
  });
  const {
    projectImage,
    upload: handleProjectImageUpload,
    updateImageContent,
    useAsCover,
  } = useProjectCover({
    projectKey,
    hydrated: workspace.hydrated,
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    updateContent: workspace.updateContent,
  });
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
      useAsCover,
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
            <button type="button" title={t("common.window.close")} onClick={() => void hideApplication()}><img src={windowCloseAsset} alt="" /></button>
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
            <button className="view-rail__toggle" type="button" onClick={() => setSidebarVisible((current) => !current)} title={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")}><UiIcon name="sidebar" /></button>
              {([
                ["lore", "sidebar.lore"],
                ["recent", "sidebar.recent"],
                ["types", "sidebar.types"],
              ] as const).map(([id, labelKey]) => (
                <button key={id} type="button" aria-label={t(labelKey)} title={t(labelKey)} className={`view-rail__item ${sidebarPanel === id && view !== "graph" ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setSidebarPanel(id); setProjectTab("workspace"); setSidebarQuery(""); setView("list"); }}>
                  <UiIcon name={id} active={sidebarPanel === id && view !== "graph"} />
                  {sidebarPanel === id && view !== "graph" && <span>{t(labelKey)}</span>}
                </button>
              ))}
              <button type="button" aria-label={t("graph.title")} title={t("graph.title")} className={`view-rail__item ${view === "graph" ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setProjectTab("workspace"); setSidebarQuery(""); setView("graph"); }}>
                <UiIcon name="graph" active={view === "graph"} />
                {view === "graph" && <span>{t("graph.title")}</span>}
              </button>
              <button type="button" className="view-rail__exit" onClick={() => void exitWorkspace()} title={t("workspace.exit")}><UiIcon name="exit" /></button>
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
                <button type="button" onClick={() => { cancelLoreMultiSelection(); setSelectedTrashNodeId(null); setProjectTab((current) => current === "settings" ? "workspace" : "settings"); }} title={t("workspace.projectSettings")} className={`workspace-sidebar__settings ${projectTab === "settings" ? "is-active" : ""}`}><UiIcon name="settings" /></button>
              </header>

              {projectTab === "settings" ? (
                <nav className="settings-navigation" aria-label={t("workspace.projectSettings")}>
                  {([
                    ["general", "general", "sidebar.settings.general"],
                    ["changelog", "history", "sidebar.settings.history"],
                    ["trash", "trash", "sidebar.settings.trash"],
                  ] as const).map(([id, icon, labelKey]) => (
                    <button key={id} type="button" className={settingsPanel === id ? "is-active" : ""} onClick={() => { cancelLoreMultiSelection(); setSelectedTrashNodeId(null); setSettingsPanel(id); }}><UiIcon name={icon} /><span>{t(labelKey)}</span></button>
                  ))}
                </nav>
              ) : (
                <>
                  <div className={`context-toolbar ${sidebarSearchOpen ? "is-searching" : ""}`}>
                    <div className="context-toolbar__actions">
                      {sidebarPanel === "lore" && <>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); setLoreAddOpen(true); }} title={t("sidebar.addNode")}><UiIcon name="add" /></button>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); workspace.openCreate(null, "categoria"); }} title={t("sidebar.addFolder")}><UiIcon name="folder" /></button>
                        <button type="button" onClick={() => { cancelLoreMultiSelection(); sidebarImageInputRef.current?.click(); }} title={t("sidebar.addImage")}><UiIcon name="image-add" /></button>
                        <input ref={sidebarImageInputRef} hidden type="file" accept={fileImportAccept()} onChange={(event) => { const file = event.target.files?.[0]; if (file) void createNodeFromFile(file, null); event.currentTarget.value = ""; }} />
                      </>}
                    </div>
                    <div className="context-toolbar__search">
                      <input ref={sidebarSearchRef} value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSidebarQuery(""); setSidebarSearchOpen(false); } }} placeholder={t("sidebar.search")} aria-label={t("sidebar.search")} />
                      <button type="button" onClick={() => { if (sidebarSearchOpen && !sidebarQuery) setSidebarSearchOpen(false); else setSidebarSearchOpen(true); }} title={t("sidebar.search")}><UiIcon name="search" /></button>
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
          <div onMouseDown={startResize} className="workspace-resizer" />
        )}

        <main
          className={`workspace-main${view === "graph" ? " workspace-main--graph" : ""}`}
        >
          {selectedTrashNode ? (
            <TrashNodeView node={selectedTrashNode} host={nodeViewHost} onBack={returnToTrash} />
          ) : projectTab === "settings" && settingsPanel === "trash" ? (
            <TrashPanel
              nodes={workspace.deletedNodes}
              selectedIds={workspace.selectedDeletedIds}
              view={trashView}
              onViewChange={setTrashView}
              onOpenNode={openDeletedNode}
              onSelectNode={workspace.selectDeletedNode}
              onOpenNodeMenu={(_nodeId, position) => setTrashMenu(position)}
              onOpenActionsMenu={setTrashActionsMenu}
              onRestoreSelected={workspace.restoreDeletedNodes}
              onDeleteSelected={workspace.permanentlyDeleteNodes}
            />
          ) : projectTab === "settings" && settingsPanel === "changelog" ? (
            <ChangelogPanel />
          ) : projectTab === "settings" ? (
            <ProjectSettingsPanel
              projectName={projectName}
              projectImage={projectImage}
              projectInitial={projectInitial}
              avatarColor={avatarColor}
              defaultNodeType={defaultNodeType}
              onDefaultNodeTypeChange={setDefaultNodeType}
              timeFormat={timeFormat}
              onTimeFormatChange={setTimeFormat}
              appVersion={appVersion}
            />
          ) : view === "graph" ? (
            <GraphView
              nodes={workspace.nodes}
              onSelectNode={workspace.setSelectedId}
              onClearSelection={() => workspace.setSelectedId(null)}
              onOpenNode={(id) => {
                workspace.setSelectedId(id);
                setView("list");
              }}
              onCreateNode={(name, type) => {
                const id = workspace.createNode(name, type, null);
                workspace.setSelectedId(id);
                setSelectedLoreIds([id]);
                return id;
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
