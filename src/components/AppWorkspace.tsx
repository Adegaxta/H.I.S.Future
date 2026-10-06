import { PresentedImage } from "../nodes/visuals/PresentedImage";
import type { ImagePresentation } from "../utils/imagePresentation";
import { ImagePickerDialog } from "../nodes/capabilities/ImagePickerDialog";
import "../workspace/panels/styles.css";
import "../workspace/navigation/styles.css";
import "../graph/styles.css";
import "../editor/styles.css";
import "../nodes/styles.css";
import { isDesktopRuntime } from "../project/runtime";
import { useWorkspaceNavigation, type NavigationHandler } from "../hooks/useWorkspaceNavigation";
import { AVATAR_COLORS } from "../defs/palette";
import { createRef, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getNodeDefinition, getNodeDisplayLabel, hasNodeCapability } from "../defs/nodeTypes";
import { assignVaultPrimaryNode } from "../nodes/project/domain";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useTreeController } from "../hooks/useTreeController";
import ContextMenu from "./ContextMenu";
import NodeOptionsMenu from "./NodeOptionsMenu";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";
import DragPreview from "./DragPreview";
import SidebarTree from "../workspace/navigation/SidebarTree";
import NodePanels from "../workspace/navigation/NodePanels";
import LoreAddDialog from "./LoreAddDialog";
import NodeCreationPanel from "./NodeCreationPanel";
import { UiIcon } from "../ui/Icon";
import { usePendingEditorFocus } from "../editor/usePendingEditorFocus";
import RegisteredNodeView from "./RegisteredNodeView";
import type { TimeFormat } from "../utils/temporalMeta";
import { handleCalendarSlashCommand } from "../nodes/calendar/operations";
import type { NodeViewHost } from "../nodes/rendering";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { useLocale } from "../i18n/LocaleContext";
import windowCloseAsset from "../assets/third-party/Lucide.dev/icons/x.svg";
import windowMaximizeAsset from "../assets/third-party/Lucide.dev/icons/layers-2.svg";
import windowMinimizeAsset from "../assets/third-party/Lucide.dev/icons/minus.svg";
import { safeLocalStorageSet } from "../workspace/safeStorage";
import { useFileNodeImports } from "../workspace/useFileNodeImports";
import { fileImportAccept } from "../project/fileImportRegistry";
import { useProjectCover } from "../workspace/useProjectCover";
import { useWorkspaceLifecycle } from "../workspace/useWorkspaceLifecycle";
import { useSidebarResize } from "../workspace/useSidebarResize";
import { ChangelogPanel } from "../workspace/panels/ChangelogPanel";
import { ProjectSettingsPanel } from "../workspace/panels/ProjectSettingsPanel";
import { TrashPanel } from "../workspace/panels/TrashPanel";
import { finishLifecycleFlow } from "../lifecycle/metrics";
import { getActiveCloseProjectTraceId, recordCloseProjectPhase } from "../lifecycle/metrics";
import { readDefaultNodeType } from "../workspace/defaultNodeType";
import { usePresence } from "../presence/PresenceProvider";
import NodeTabSurface from "../nodes/page/NodeTabSurface";
import NodeInspectorView from "../nodes/inspector/NodeInspectorView";
import WorkspaceHistoryControls from "../workspace/navigation/WorkspaceHistoryControls";
import { getLoreAncestorIds, getLoreExpandableIds, getNodeSidebarLocation } from "../utils/loreTree";
import { useResolvedNodeCustomVisual } from "../nodes/nodeIconSource";
import { getNodalMeta, setNodalMeta } from "../nodes/metadata";
import { nodeToMarkdown } from "../export/nodeMarkdown";
import NodeActionDialog, { type ExportFormat, type PdfExportSettings } from "./NodeActionDialog";
import PrintDocument from "./PrintDocument";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { clearImageRuntimeCache } from "../utils/imageRuntimeResolver";
import { analyzeLegacyImageMigration, migrateLegacyImages, type ImageMigrationPlan } from "../project/imageMigration";
import BrainCircuit from "lucide-react/dist/esm/icons/brain-circuit.mjs";
import FileText from "lucide-react/dist/esm/icons/file-text.mjs";
import Network from "lucide-react/dist/esm/icons/network.mjs";
import { ViewRegistry } from "../workspace/tabs/ViewRegistry";
import { WorkspaceSurface } from "../workspace/tabs/WorkspaceSurface";
import { createTab, createWorkspaceLayout, findPane, restoreWorkspaceLayout, setFocusedTabView, updateTab, type WorkspaceLayout, type WorkspaceViewType } from "../workspace/tabs/model";
import { NodeIcon } from "../nodes/NodeIcon";
import { IconCapabilityPicker } from "../nodes/capabilities/IconCapabilityPicker";
import { NodeVisualRenderer } from "../nodes/visuals/NodeVisualRenderer";
import { createImageContent, getImageResourceDescriptor } from "../utils/imageResource";
import type { UnsplashImageSelection } from "../integrations/unsplash/types";

const GraphView = lazy(() => import("../graph/view"));
const AIWorkspace = lazy(() => import("../ai/AIWorkspace"));
const TrashNodeView = lazy(() => import("../workspace/panels/TrashNodeView").then((module) => ({ default: module.TrashNodeView })));
const VIEW_RAIL_WIDTH = 52;

interface AppWorkspaceProps {
  projectKey: string;
  projectName: string;
  onExitProject: () => Promise<void>;
}

interface WorkspaceLocation {
  selectedId: string | null;
  view: "list" | "graph" | "ai";
  projectTab: "workspace" | "settings";
  settingsPanel: "general" | "trash" | "changelog";
  sidebarPanel: "lore" | "recent" | "types";
  sidebarVisible: boolean;
}

function readWorkspaceLocation(key: string): WorkspaceLocation | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null") as Partial<WorkspaceLocation> | null;
    if (!parsed || (parsed.view !== "list" && parsed.view !== "graph" && parsed.view !== "ai") ||
      (parsed.projectTab !== "workspace" && parsed.projectTab !== "settings") ||
      !["general", "trash", "changelog"].includes(parsed.settingsPanel || "") ||
      !["lore", "recent", "types"].includes(parsed.sidebarPanel || "") ||
      typeof parsed.sidebarVisible !== "boolean") return null;
    return {
      selectedId: typeof parsed.selectedId === "string" ? parsed.selectedId : null,
      view: parsed.view,
      projectTab: parsed.projectTab,
      settingsPanel: parsed.settingsPanel as WorkspaceLocation["settingsPanel"],
      sidebarPanel: parsed.sidebarPanel as WorkspaceLocation["sidebarPanel"],
      sidebarVisible: parsed.sidebarVisible,
    };
  } catch {
    return null;
  }
}

export default function AppWorkspace({
    projectKey,
    projectName,
    onExitProject,
  }: AppWorkspaceProps) {
  const { locale, t } = useLocale();
  useEffect(() => () => clearImageRuntimeCache(), [projectKey]);
  const { setPresence } = usePresence();
  const colorStorageKey = `hisfuture.project.color.${projectKey}`;
  const locationStorageKey = `hisfuture.project.location.${projectKey}`;
  const workspaceLayoutStorageKey = `hisfuture.workspace.layout.v1.${projectKey}`;
  const timeFormatStorageKey = "hisfuture.settings.time-format";
  const trashViewStorageKey = `hisfuture.settings.trash-view.${projectKey}`;
  const [defaultNodeType, setDefaultNodeType] = useState<BaseNodeType>(() => readDefaultNodeType(projectKey));
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    localStorage.getItem(timeFormatStorageKey) === "24h" ? "24h" : "12h",
  );
  const workspace = useTreeController(defaultNodeType, projectKey, projectName);
  const graphCreationCallback = useRef<((id: string) => void) | null>(null);
  useEffect(() => {
    safeLocalStorageSet(`hisfuture.settings.default-node-type.${projectKey}`, defaultNodeType);
  }, [defaultNodeType, projectKey]);
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
  const { width, startResize } = useSidebarResize(projectKey);
  const [sidebarVisible, setSidebarVisible] = useState(() => readWorkspaceLocation(locationStorageKey)?.sidebarVisible ?? true);
  const [sidebarPanel, setSidebarPanel] = useState<"lore" | "recent" | "types">(
    () => readWorkspaceLocation(locationStorageKey)?.sidebarPanel ?? "lore",
  );
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [selectedLoreIds, setSelectedLoreIds] = useState<string[]>([]);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
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
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>(() => {
    const legacy = readWorkspaceLocation(locationStorageKey);
    const legacyType: WorkspaceViewType = legacy?.view === "ai" ? "ai" : legacy?.view === "graph" ? "graph" : "node";
    const fallback = createWorkspaceLayout(createTab(legacyType, legacyType === "node" ? legacy?.selectedId ?? undefined : undefined));
    return restoreWorkspaceLayout(localStorage.getItem(workspaceLayoutStorageKey), fallback);
  });
  const focusedWorkspacePane = findPane(workspaceLayout.root, workspaceLayout.focusedPaneId);
  const focusedWorkspaceTab = focusedWorkspacePane?.tabs.find((tab) => tab.id === focusedWorkspacePane.activeTabId);
  const view: "list" | "graph" | "ai" = focusedWorkspaceTab?.viewType === "ai" ? "ai" : focusedWorkspaceTab?.viewType === "graph" ? "graph" : "list";
  const setView = useCallback((next: "list" | "graph" | "ai") => {
    const type: WorkspaceViewType = next === "list" ? "node" : next;
    setWorkspaceLayout((current) => setFocusedTabView(current, type, type === "node" ? workspace.selectedId ?? undefined : undefined));
  }, [workspace.selectedId]);
  const [projectTab, setProjectTab] = useState<"workspace" | "settings">(
    () => readWorkspaceLocation(locationStorageKey)?.projectTab ?? "workspace",
  );
  const [settingsPanel, setSettingsPanel] = useState<"general" | "trash" | "changelog">(
    () => readWorkspaceLocation(locationStorageKey)?.settingsPanel ?? "general",
  );
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [trashView, setTrashView] = useState<"gallery" | "list">(() =>
    localStorage.getItem(trashViewStorageKey) === "list" ? "list" : "gallery",
  );
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(
    null,
  );
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [avatarColor] = useState(
    () =>
      localStorage.getItem(colorStorageKey) ||
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  );
  const locationRestoredRef = useRef(false);

  useEffect(() => {
    if (!workspace.hydrated || locationRestoredRef.current) return;
    locationRestoredRef.current = true;
    const location = readWorkspaceLocation(locationStorageKey);
    if (location?.selectedId && workspace.nodes.some((node) => node.id === location.selectedId)) {
      workspace.setSelectedId(location.selectedId);
      setSelectedLoreIds([location.selectedId]);
    }
  }, [locationStorageKey, workspace.hydrated, workspace.nodes, workspace.setSelectedId]);

  useEffect(() => {
    if (focusedWorkspaceTab?.viewType !== "node" || !focusedWorkspaceTab.resourceId) return;
    if (workspace.nodes.some((node) => node.id === focusedWorkspaceTab.resourceId) && workspace.selectedId !== focusedWorkspaceTab.resourceId) {
      workspace.setSelectedId(focusedWorkspaceTab.resourceId);
    }
  }, [focusedWorkspaceTab?.id, focusedWorkspaceTab?.resourceId, focusedWorkspaceTab?.viewType, workspace.nodes, workspace.selectedId, workspace.setSelectedId]);

  useEffect(() => {
    if (!workspace.hydrated || !locationRestoredRef.current) return;
    safeLocalStorageSet(locationStorageKey, JSON.stringify({
      selectedId: workspace.selectedId,
      view,
      projectTab,
      settingsPanel,
      sidebarPanel,
      sidebarVisible,
    } satisfies WorkspaceLocation));
  }, [locationStorageKey, projectTab, settingsPanel, sidebarPanel, sidebarVisible, view, workspace.hydrated, workspace.selectedId]);

  useEffect(() => {
    if (!workspace.hydrated) return;
    safeLocalStorageSet(workspaceLayoutStorageKey, JSON.stringify(workspaceLayout));
  }, [workspace.hydrated, workspaceLayout, workspaceLayoutStorageKey]);

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
  useEffect(() => {
    setSelectedPanelIds([]);
  }, [sidebarPanel]);
  const [contextMenu, setContextMenu] = useState<
    React.ComponentProps<typeof ContextMenu>["menu"] | null
  >(null);
  const [trashMenu, setTrashMenu] = useState<{ x: number; y: number } | null>(null);
  const [trashActionsMenu, setTrashActionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [nodeAction, setNodeAction] = useState<"link" | "folder" | "template" | "export" | "confirm" | null>(null);
  const [nodeActionNodeId, setNodeActionNodeId] = useState<string | null>(null);
  const [templateToApply, setTemplateToApply] = useState<{ name: string; type: string; content: string } | null>(null);
  const [printNode, setPrintNode] = useState<NodeItem | null>(null);
  const [printSettings, setPrintSettings] = useState<PdfExportSettings>({ pageSize: "a4", orientation: "portrait", scale: 1, includeTitle: true, includeIcon: true, includeCover: true, includeImages: true });
  const printReadyRef = useRef<((editor?: HTMLDivElement, error?: Error) => void) | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const tabEditorRefs = useRef(new Map<string, RefObject<HTMLDivElement | null>>());
  const getTabEditorRef = (tabId: string) => {
    const existing = tabEditorRefs.current.get(tabId);
    if (existing) return existing;
    const created = createRef<HTMLDivElement>();
    tabEditorRefs.current.set(tabId, created);
    return created;
  };
  const workspaceMainRef = useRef<HTMLElement | null>(null);
  const pendingWorkspaceScrollTopRef = useRef<number | null>(null);
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
  useLayoutEffect(() => {
    editorRef.current = focusedWorkspaceTab ? getTabEditorRef(focusedWorkspaceTab.id).current : null;
  }, [focusedWorkspaceTab?.id, workspace.nodes]);
  const preserveWorkspaceScroll = (mutation: () => void) => {
    pendingWorkspaceScrollTopRef.current = workspaceMainRef.current?.scrollTop ?? 0;
    mutation();
  };
  useLayoutEffect(() => {
    const scrollTop = pendingWorkspaceScrollTopRef.current;
    if (scrollTop === null) return;
    pendingWorkspaceScrollTopRef.current = null;
    const restore = () => {
      const main = workspaceMainRef.current;
      if (main) main.scrollTop = scrollTop;
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [workspace.nodes, workspace.deletedNodes]);
  useEffect(() => {
    const surface = projectTab === "settings"
      ? settingsPanel === "trash"
        ? "trash"
        : settingsPanel === "changelog"
          ? "changelog"
          : "settings"
      : view === "graph"
        ? "graph"
        : "workspace";
    setPresence({
      surface,
      locale,
      nodeType: surface === "workspace"
        ? selectedTrashNode?.type ?? selectedType
        : null,
    });
  }, [locale, projectTab, selectedTrashNode?.type, selectedType, setPresence, settingsPanel, view]);
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


  const revealNodeInSidebar = (id: string, forceLore = false) => {
    const location = forceLore ? "lore" : getNodeSidebarLocation(workspace.nodes, id);
    setSidebarVisible(true);
    setSidebarPanel(location);
    setSidebarQuery("");
    if (location === "types") {
      setSelectedLoreIds([]);
      return;
    }
    setSelectedLoreIds([id]);
    const ancestors = getLoreAncestorIds(workspace.nodes, id);
    if (ancestors.length) {
      workspace.setExpanded((current) => ancestors.reduce((next, ancestorId) => ({ ...next, [ancestorId]: true }), current));
    }
  };
  const openNodeView = (id: string) => {
    setInspectedNodeId(null);
    setSelectedTrashNodeId(null);
    setProjectTab("workspace");
    setWorkspaceLayout((current) => setFocusedTabView(current, "node", id));
    if (sidebarPanel === "lore" || focusedWorkspaceTab?.viewType === "graph") revealNodeInSidebar(id);
    workspace.setSelectedId(id);
  };

  const openNodeInspection = (id: string) => {
    if (!workspace.nodes.some((node) => node.id === id)) return;
    setSelectedTrashNodeId(null);
    setProjectTab("workspace");
    setWorkspaceLayout((current) => setFocusedTabView(current, "node", id));
    if (sidebarPanel === "lore" || focusedWorkspaceTab?.viewType === "graph") revealNodeInSidebar(id);
    workspace.setSelectedId(id);
    setInspectedNodeId(id);
  };

  const workspaceNavigation = useWorkspaceNavigation({
    getScrollElement: () => {
      let element = editorRef.current?.parentElement ?? null;
      while (element) {
        if (/^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return element;
        element = element.parentElement;
      }
      return workspaceMainRef.current;
    },
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
        openNodeView(next.id);
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
  const previewVisual = useResolvedNodeCustomVisual(previewNode, workspace.nodes);
  const projectInitial = projectName.trim().charAt(0).toUpperCase() || "P";
  const { importFile: createNodeFromFile } = useFileNodeImports({
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    translate: t,
    reportError: setFileImportError,
    onGlobalImport: (imported) => openNodeView(imported.id),
  });
  const createNodeFromFileAndOpen = async (file: File, parentId: string | null) => {
    const imported = await createNodeFromFile(file, parentId);
    if (imported) openNodeView(imported.id);
    return imported;
  };
  const {
    projectImage, projectPresentation, projectImageNodeId, flushImageSelection,
    projectVisual, selectVisual, clear: clearProjectImage,
    updateImageContent,
    useAsCover,
  } = useProjectCover({
    projectKey,
    hydrated: workspace.hydrated,
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    updateContent: workspace.updateContent,
    reportError: setFileImportError,
  });
  const saveWorkspaceWithImage = useCallback(async (snapshot?: NodeItem[]) => {
    await flushImageSelection();
    await workspace.saveNow(snapshot);
  }, [flushImageSelection, workspace.saveNow]);
  const { exitWorkspace, hideApplication } = useWorkspaceLifecycle({
    nodes: workspace.nodes,
    selectedId: workspace.selectedId,
    editorRef,
    saveNow: saveWorkspaceWithImage,
    exitProject: onExitProject,
    reportError: setFileImportError,
  });
  const [vaultImagePickerOpen, setVaultImagePickerOpen] = useState(false);
  const [vaultImageTab, setVaultImageTab] = useState<"local" | "emoji" | "icon" | "unsplash">("local");
  const chooseVaultImage = (id: string, presentation?: ImagePresentation) => { useAsCover(id, presentation); setVaultImagePickerOpen(false); };
  const chooseVaultUnsplash = async (selection: UnsplashImageSelection) => {
    const existing = workspace.nodes.find((item) => {
      const resource = item.type === "imagen" ? getImageResourceDescriptor(item.content, item.name) : null;
      return resource?.provenance?.provider === selection.provenance.provider && resource.provenance.resourceId === selection.provenance.resourceId;
    });
    return existing?.id ?? workspace.createNode(selection.fileName, "imagen", null, createImageContent(selection.src, selection.fileName, null, null, selection.description, selection.provenance), false);
  };
  const calendarOperationsHost = {
    nodes: workspace.nodes,
    createNode: workspace.createNode,
    selectNode: openNodeView,
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
    const id = workspace.createNode(name, defaultNodeType, parentId, undefined, false);
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
  const nodeViewHost: NodeViewHost = {
    data: { nodes: workspace.nodes, deletedNodes: workspace.deletedNodes, timeFormat, recentNodes: workspace.recentNodes },
    mutations: {
      createNode: workspace.createNode,
      updateContent: workspace.updateContent,
      mutateNodes: workspace.mutateNodes,
      renameNode: workspace.renameNode,
      deleteNode: (id) => preserveWorkspaceScroll(() => workspace.deleteNode(id)),
    },
    navigation: {
      selectNode: openNodeView,
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
      createMentionNode: (name, parentId) => {
        const id = workspace.createNode(name, "pagina", parentId, undefined, false);
        return { id, name, type: "pagina", parentId, order: workspace.nodes.filter(n => n.parentId === parentId).length, content: getNodeDefinition("pagina").defaultContent };
      },
      runSlashCommand: handleSlashCommand,
    },
    contextMenus: { openNodeMenu: setContextMenu },
    projectImage: {
      updateContent: updateImageContent,
      useAsCover,
    },
  };

  const renderNodeOptions = (optionNode: NodeItem, position: { x: number; y: number }, close: () => void, search: () => void) => {
    const updateNodeMeta = (key: "favorite" | "pinned" | "protected") => {
      const meta = getNodalMeta(optionNode.content);
      workspace.updateContent(optionNode.id, setNodalMeta(optionNode.content, { [key]: !meta[key] }));
    };
    return <NodeOptionsMenu
      node={optionNode}
      x={position.x}
      y={position.y}
      onClose={() => close()}
      onToggleMeta={updateNodeMeta}
      onTogglePrimary={() => workspace.mutateNodes((nodes) => getNodalMeta(optionNode.content).role === "vault-primary"
        ? nodes.map((item) => item.id === optionNode.id ? { ...item, content: setNodalMeta(item.content, { role: null, primaryDismissed: true }) } : item)
        : assignVaultPrimaryNode(nodes, optionNode.id))}
      onCreateLink={() => {
        setNodeActionNodeId(optionNode.id);
        setNodeAction("link");
      }}
      onAddToFolder={() => {
        setNodeActionNodeId(optionNode.id);
        setNodeAction("folder");
      }}
      onSaveTemplate={() => {
        const key = `hisfuture.templates.${projectKey}`;
        const templates = JSON.parse(localStorage.getItem(key) || "[]") as Array<{ name: string; type: string; content: string }>;
        templates.push({ name: optionNode.name, type: optionNode.type, content: optionNode.content });
        localStorage.setItem(key, JSON.stringify(templates));
        close();
      }}
      onLoadTemplate={() => {
        setNodeActionNodeId(optionNode.id);
        setNodeAction("template");
      }}
      onDuplicate={() => {
        const id = workspace.createNode(`${optionNode.name} (copia)`, optionNode.type, optionNode.parentId, optionNode.content, true);
        openNodeView(id);
        close();
      }}
      onDelete={() => { workspace.deleteNode(optionNode.id); close(); }}
      onSearch={search}
      onExport={() => {
        setNodeActionNodeId(optionNode.id);
        setNodeAction("export");
      }}
    />;

  };

  const viewRegistry = new ViewRegistry()
    .register({
      type: "node",
      keepAlive: true,
      title: "Nodo",
      icon: FileText,
      resolveTitle: (tab) => workspace.nodes.find((node) => node.id === tab.resourceId)?.name ?? (tab.resourceId ? "Recurso no disponible" : "Nodo"),
      renderIcon: (tab) => {
        const node = workspace.nodes.find((candidate) => candidate.id === tab.resourceId);
        return node ? <NodeIcon type={getEffectiveNodeType(workspace.nodes, node)} className="workspace-tab__node-icon" /> : <FileText size={13} strokeWidth={1.7} />;
      },
      renderer: (tab) => {
        const tabNode = workspace.nodes.find((node) => node.id === tab.resourceId);
        if (!tab.resourceId) return <div className="workspace-empty-state">Selecciona un nodo desde la barra lateral.</div>;
        if (!tabNode) return <div className="workspace-resource-missing">Recurso no disponible</div>;
        const showInspector = inspectedNodeId === tabNode.id;
        const tabEditorRef = getTabEditorRef(tab.id);
        const tabNodeViewHost: NodeViewHost = { ...nodeViewHost, editor: { ...nodeViewHost.editor, ref: tabEditorRef } };
        return <NodeTabSurface key={tab.resourceId} node={tabNode} nodes={workspace.nodes} editorRef={tabEditorRef} projectKey={projectKey}
          showChrome={!showInspector && (tabNode.type === "pagina" || tabNode.type === "proyecto")}
          onOpenNode={openNodeView} renderMenu={(position, close, search) => renderNodeOptions(tabNode, position, close, search)}>
          {showInspector ? (
            <NodeInspectorView
              node={tabNode}
              nodes={workspace.nodes}
              onBack={() => openNodeView(tabNode.id)}
              onAnalyzeImageMigration={async () => { await workspace.saveNow(); return analyzeLegacyImageMigration(); }}
              onMigrateImages={async (plan: ImageMigrationPlan) => {
                await workspace.saveNow();
                const result = await migrateLegacyImages(plan);
                workspace.acceptPersistedSnapshot(result.nodes, result.deletedNodes);
                clearImageRuntimeCache();
                return result;
              }}
            />
          ) : <div className={`editor-page editor-page--${tabNode.type}`}><RegisteredNodeView node={tabNode} host={tabNodeViewHost} /></div>}
        </NodeTabSurface>;
      },
    })
    .register({
      type: "ai",
      title: t("ai.title"),
      icon: BrainCircuit,
      keepAlive: true,
      renderer: (tab) => <Suspense fallback={<div className="app-loading-screen" role="status">Cargando IA…</div>}><AIWorkspace
        nodes={workspace.nodes}
        projectId={projectKey}
        initialConversationId={typeof tab.state?.conversationId === "string" ? tab.state.conversationId : undefined}
        onConversationChange={(conversationId) => setWorkspaceLayout((current) => updateTab(current, tab.id, (currentTab) => ({ ...currentTab, state: { ...currentTab.state, conversationId } })))}
      /></Suspense>,
    })
    .register({
      type: "graph",
      title: t("graph.title"),
      icon: Network,
      contextHeader: true,
      renderer: () => <Suspense fallback={<div className="app-loading-screen" role="status">Cargando grafo…</div>}>
        <GraphView
          nodes={workspace.nodes}
          onSelectNode={workspace.setSelectedId}
          onClearSelection={() => workspace.setSelectedId(null)}
          onOpenNode={openNodeView}
          onRequestCreate={(_position, onCreated) => {
            graphCreationCallback.current = onCreated;
            workspace.openCreate(null);
          }}
          onOpenNodeMenu={(menu) => setContextMenu(menu)}
          projectKey={projectKey}
        />
      </Suspense>,
    });

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      className="app-workspace"
    >
      <header
        className="workspace-header"
        onPointerDown={startWindowDrag}
      >
        <div className="workspace-header__left" data-tauri-drag-region />
        <div className="workspace-header__right">
          <div className="workspace-header__version">{appVersion ? `v${appVersion}` : "v—"}</div>
          <div className="workspace-header__window-controls">
            <button type="button" title={t("common.window.minimize")} onClick={() => void getCurrentWindow().minimize()}><img className="workspace-header__window-icon" src={windowMinimizeAsset} alt="" /></button>
            <button type="button" title={t("common.window.maximize")} onClick={() => void getCurrentWindow().toggleMaximize()}><img className="workspace-header__window-icon" src={windowMaximizeAsset} alt="" /></button>
            <button type="button" title={t("common.window.close")} onClick={() => void hideApplication()}><img className="workspace-header__window-icon" src={windowCloseAsset} alt="" /></button>
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
          className={`workspace-sidebar${sidebarVisible && view !== "ai" ? "" : " is-collapsed"}${view === "ai" ? " is-ai-view" : ""}`}
          data-sidebar="true"
          style={{ width: `${sidebarVisible && view !== "ai" ? width : VIEW_RAIL_WIDTH}px` }}
        >
          <nav className="view-rail" aria-label={t("workspace.panels")}>
            <button className="view-rail__toggle" type="button" onClick={() => setSidebarVisible((current) => !current)} aria-label={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")} data-label={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")}><UiIcon name="sidebar" /></button>
              {([
                ["lore", "sidebar.lore"],
                ["recent", "sidebar.recent"],
                ["types", "sidebar.types"],
              ] as const).map(([id, labelKey]) => (
                <button key={id} type="button" aria-label={t(labelKey)} data-label={t(labelKey)} className={`view-rail__item ${sidebarPanel === id && focusedWorkspaceTab?.viewType === "node" && projectTab === "workspace" ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setSidebarPanel(id); setProjectTab("workspace"); setSidebarQuery(""); setView("list"); }}>
                  <UiIcon name={id} active={sidebarPanel === id && focusedWorkspaceTab?.viewType === "node" && projectTab === "workspace"} />
                </button>
              ))}
              <button type="button" aria-label={t("graph.title")} data-label={t("graph.title")} className={`view-rail__item ${focusedWorkspaceTab?.viewType === "graph" && projectTab === "workspace" ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setProjectTab("workspace"); setSidebarQuery(""); setView("graph"); }}>
                <UiIcon name="graph" active={focusedWorkspaceTab?.viewType === "graph" && projectTab === "workspace"} />
              </button>
              <button type="button" aria-label={t("ai.title")} data-label={t("ai.title")} className={`view-rail__item view-rail__item--ai ${focusedWorkspaceTab?.viewType === "ai" && projectTab === "workspace" ? "is-active" : ""}`} onClick={() => { cancelLoreMultiSelection(); setSelectedTrashNodeId(null); setInspectedNodeId(null); setProjectTab("workspace"); setSidebarQuery(""); setView("ai"); }}>
                <UiIcon name="ai" active={focusedWorkspaceTab?.viewType === "ai" && projectTab === "workspace"} />
              </button>
              <button type="button" className="view-rail__exit" onClick={() => void exitWorkspace()} aria-label={t("workspace.exit")} data-label={t("workspace.exit")}><UiIcon name="exit" /></button>
          </nav>

          <section className="context-sidebar" aria-hidden={!sidebarVisible}>
              <header className="context-sidebar__project">
                <button type="button" className="workspace-sidebar__project-avatar" style={!projectVisual && !projectPresentation && projectImage ? { backgroundImage: `url(${projectImage})` } : { backgroundColor: avatarColor }} title={t("workspace.chooseVaultImage")} aria-label={t("workspace.chooseVaultImage")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setVaultImageTab("local"); setVaultImagePickerOpen(true); }}>
                  {projectVisual ? <NodeVisualRenderer visual={projectVisual} /> : projectImage && projectPresentation ? <PresentedImage src={projectImage} presentation={projectPresentation} /> : !projectImage && projectInitial}
                </button>
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
                        <input ref={sidebarImageInputRef} hidden type="file" accept={fileImportAccept()} onChange={(event) => { const file = event.target.files?.[0]; if (file) void createNodeFromFileAndOpen(file, null); event.currentTarget.value = ""; }} />
                      </>}
                    </div>
                    <div className="context-toolbar__search">
                      {sidebarPanel === "lore" && (() => {
                        const expandAll = !Object.values(workspace.expanded).some(Boolean);
                        return <button className="context-toolbar__expand-all" type="button" onClick={() => workspace.setExpanded(() => expandAll ? Object.fromEntries(getLoreExpandableIds(workspace.nodes).map((id) => [id, true])) : {})} title={t(expandAll ? "sidebar.expandAll" : "sidebar.collapseAll")} aria-label={t(expandAll ? "sidebar.expandAll" : "sidebar.collapseAll")}><UiIcon name={expandAll ? "expand-all" : "collapse-all"} /></button>;
                      })()}
                      <input ref={sidebarSearchRef} value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSidebarQuery(""); setSidebarSearchOpen(false); } }} placeholder={t("sidebar.search")} aria-label={t("sidebar.search")} />
                      <button type="button" onClick={() => { if (sidebarSearchOpen && !sidebarQuery) setSidebarSearchOpen(false); else setSidebarSearchOpen(true); }} title={t("sidebar.search")}><UiIcon name="search" /></button>
                    </div>
                  </div>
                  {sidebarPanel === "lore" ? (
                    <SidebarTree {...workspace} selectedLoreIds={selectedLoreIds} setSelectedLoreIds={setSelectedLoreIds} query={sidebarQuery} onFileDrop={(file, parentId) => void createNodeFromFileAndOpen(file, parentId)} selectedId={workspace.selectedId} contextMenuNodeId={contextMenu?.context === "lore" ? contextMenu.nodeId : null} setSelectedId={openNodeView} setContextMenu={(menu) => setContextMenu({ ...menu, context: "lore" })} />
                  ) : (
                    <NodePanels
                      projectKey={projectKey}
                      onContextMenu={(menu) => {
                        if (menu.nodeId && !selectedPanelIds.includes(menu.nodeId)) setSelectedPanelIds([menu.nodeId]);
                        setContextMenu(menu);
                      }}
                      panel={sidebarPanel}
                      query={sidebarQuery}
                      nodes={workspace.nodes}
                      recentNodes={workspace.recentNodes}
                      recentActivity={workspace.recentActivity}
                      selectedId={workspace.selectedId}
                      selectedIds={selectedPanelIds}
                      onSelectionChange={setSelectedPanelIds}
                      onSelect={(id) => { setSelectedLoreIds([id]); openNodeView(id); }}
                      onCreateType={(type) => {
                        workspace.openCreate(null, type);
                      }}
                    />
                  )}
                </>
              )}
          </section>
        </aside>

        {sidebarVisible && view !== "ai" && (
          <div onMouseDown={startResize} className="workspace-resizer" />
        )}

        {projectTab === "workspace" ? (
          <main ref={workspaceMainRef} className="workspace-main workspace-main--tabs">
            <WorkspaceSurface layout={workspaceLayout} registry={viewRegistry} onChange={setWorkspaceLayout} />
          </main>
        ) : (
        <main ref={workspaceMainRef} className="workspace-main">
          {selectedTrashNode ? (
            <Suspense fallback={null}>
              <TrashNodeView node={selectedTrashNode} host={nodeViewHost} onBack={returnToTrash} />
            </Suspense>
          ) : settingsPanel === "trash" ? (
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
          ) : settingsPanel === "changelog" ? (
            <ChangelogPanel />
          ) : (
            <ProjectSettingsPanel
              projectName={projectName}
              projectImage={projectImage}
              projectVisual={projectVisual}
              projectPresentation={projectPresentation}
              projectInitial={projectInitial}
              avatarColor={avatarColor}
              defaultNodeType={defaultNodeType}
              onDefaultNodeTypeChange={setDefaultNodeType}
              timeFormat={timeFormat}
              onTimeFormatChange={setTimeFormat}
              appVersion={appVersion}
            />
          )}
        </main>
        )}
        {view !== "ai" && <WorkspaceHistoryControls
          mainRef={workspaceMainRef}
          canBack={workspaceNavigation.canBack}
          canForward={workspaceNavigation.canForward}
          onBack={workspaceNavigation.back}
          onForward={workspaceNavigation.forward}
        />}
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
          onInspect={openNodeInspection}
          onView={openNodeView}
          onAddToLore={(id) => {
            const ids = contextMenu.context !== "lore" && selectedPanelIds.includes(id) ? selectedPanelIds : [id];
            workspace.addToLore(ids);
            ids.forEach((nodeId) => revealNodeInSidebar(nodeId, true));
            setSelectedPanelIds([]);
          }}
          onSetPrimary={(id) => workspace.mutateNodes((nodes) => assignVaultPrimaryNode(nodes, id))}
          removeCount={selectedLoreIds.includes(contextMenu.nodeId ?? "") ? selectedLoreIds.length : 1}
          canSetPrimary={contextMenu.context !== "lore" || selectedLoreIds.length <= 1}
          canAddToLore={contextMenu.context === "types" || contextMenu.context === "recent" || Boolean(contextMenu.nodeId && workspace.nodes.find((node) => node.id === contextMenu.nodeId)?.loreHidden)}
          canDelete={!contextMenu.nodeId || (contextMenu.context === "lore" && selectedLoreIds.includes(contextMenu.nodeId)
            ? selectedLoreIds.some((id) => workspace.canDeleteNode(id))
            : workspace.canDeleteNode(contextMenu.nodeId))}
          onDelete={(id) => {
            const ids = contextMenu.context === "lore" && selectedLoreIds.includes(id)
              ? selectedLoreIds
              : [id];
            preserveWorkspaceScroll(() => workspace.deleteNodes(ids));
            setSelectedLoreIds((current) => current.filter((selectedId) => !ids.includes(selectedId)));
          }}
          onRemoveFromLore={(id) => {
            workspace.removeFromLore(selectedLoreIds.includes(id) ? selectedLoreIds : [id]);
            setSelectedLoreIds([]);
            workspace.setCreating(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {nodeAction && nodeActionNodeId && (() => {
        const actionNode = workspace.nodes.find((item) => item.id === nodeActionNodeId);
        if (!actionNode) return null;
        const folders = workspace.nodes.filter((item) => item.id !== actionNode.id && workspace.nodes.some((child) => child.parentId === item.id));
        const templates = (JSON.parse(localStorage.getItem(`hisfuture.templates.${projectKey}`) || "[]") as Array<{ name: string; type: string; content: string }>).filter((template) => template.type === actionNode.type);
        const download = async (format: ExportFormat, settings: PdfExportSettings) => {
          const started = performance.now();
          const logPdf = (message: string) => console.info(`[PDF][+${Math.round(performance.now() - started)}ms] ${message}`);
          logPdf("export requested");
          const filename = actionNode.name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-") || "nodo";
          if (isDesktopRuntime()) {
            if (format === "pdf") {
              try {
                const data = await new Promise<number[]>((resolve, reject) => {
                  let phase = "PrintDocument";
                  const timeout = window.setTimeout(() => {
                    printReadyRef.current = null;
                    reject(new Error(`[PDF] timeout during ${phase} readiness`));
                  }, 30_000);
                  printReadyRef.current = async (_printEditor, hydrationError) => {
                    try {
                      if (hydrationError) throw hydrationError;
                      logPdf("PrintDocument mounted");
                      phase = "fonts";
                      await document.fonts.ready;
                      logPdf("fonts ready");
                      phase = "images";
                      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".his-print-document img"));
                      await Promise.all(images.map((image, index) => {
                        if (image.complete) {
                          return image.naturalWidth > 0
                            ? Promise.resolve()
                            : Promise.reject(new Error(`[PDF] imagen ${index + 1} no disponible`));
                        }
                        return new Promise<void>((resolveImage, rejectImage) => {
                          image.addEventListener("load", () => resolveImage(), { once: true });
                          image.addEventListener("error", () => rejectImage(new Error(`[PDF] imagen ${index + 1} no disponible`)), { once: true });
                        });
                      }));
                      logPdf("images ready");
                      phase = "WebView2 PrintToPdfStream";
                      logPdf("invoke started");
                      const result = await invoke<number[]>("print_webview_to_pdf", { settings });
                      window.clearTimeout(timeout);
                      logPdf(`frontend received ${result.length} bytes`);
                      resolve(result);
                    } catch (error) {
                      window.clearTimeout(timeout);
                      console.error("[PDF] export failed", error);
                      reject(error instanceof Error ? error : new Error(String(error)));
                    }
                  };
                  setPrintSettings(settings);
                  setPrintNode(actionNode);
                });
                logPdf("Save As opened");
                const path = await save({ defaultPath: `${filename}.pdf`, title: `Exportar ${actionNode.name}`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
                if (path) {
                  await invoke("save_image_file", { path, data });
                  logPdf("file written");
                }
              } finally {
                printReadyRef.current = null;
                setPrintNode(null);
              }
            } else {
              const blob = new Blob([nodeToMarkdown(actionNode)], { type: "text/markdown;charset=utf-8" });
              const path = await save({ defaultPath: `${filename}.md`, title: `Exportar ${actionNode.name}`, filters: [{ name: "Markdown", extensions: ["md"] }] });
              if (path) await invoke("save_image_file", { path, data: Array.from(new Uint8Array(await blob.arrayBuffer())) });
            }
          } else {
            throw new Error("La exportación PDF HTML/CSS está implementada actualmente solo para Windows.");
          }
          setNodeAction(null);

        };
        return <NodeActionDialog
          mode={nodeAction}
          nodes={nodeAction === "link" ? workspace.nodes.filter((item) => item.id !== actionNode.id) : folders}
          templates={templates}
          onClose={() => { setNodeAction(null); setNodeActionNodeId(null); setTemplateToApply(null); }}
          onSelect={(id) => {
            if (nodeAction === "link") {
              const target = workspace.nodes.find((item) => item.id === id);
              if (target) {
                const targetDocument = new DOMParser().parseFromString(target.content, "text/html");
                const paragraph = targetDocument.createElement("p");
                const mention = targetDocument.createElement("span");
                mention.className = "editor-mention";
                mention.contentEditable = "false";
                mention.dataset.mentionId = actionNode.id;
                mention.dataset.noResize = "true";
                mention.textContent = actionNode.name;
                paragraph.appendChild(mention);
                targetDocument.body.appendChild(paragraph);
                workspace.updateContent(target.id, targetDocument.body.innerHTML);
              }
            } else {
              workspace.mutateNodes((nodes) => nodes.map((item) => item.id === actionNode.id ? { ...item, parentId: id } : item));
            }
            setNodeAction(null);
            setNodeActionNodeId(null);

          }}
          onCreateFolder={(name) => {
            const folderId = workspace.createNode(name, "pagina", null, undefined, false);
            workspace.mutateNodes((nodes) => nodes.map((item) => item.id === actionNode.id ? { ...item, parentId: folderId } : item));
            setNodeAction(null);
            setNodeActionNodeId(null);

          }}
          onSelectTemplate={(template) => { setTemplateToApply(template); setNodeAction("confirm"); }}
          onExport={(format, settings) => { void download(format, settings).catch((error) => setFileImportError(error instanceof Error ? error.message : String(error))); }}
          confirmation={`Cargar “${templateToApply?.name ?? "esta plantilla"}” sobrescribirá el contenido actual.`}
          onConfirm={() => { if (templateToApply) workspace.updateContent(actionNode.id, templateToApply.content); setTemplateToApply(null); setNodeAction(null); setNodeActionNodeId(null);  }}
        />;
      })()}
      {workspace.creating && <NodeCreationPanel nodes={workspace.nodes} initialType={workspace.draftType} initialParentId={workspace.creating.parentId} onClose={() => { workspace.setCreating(null); graphCreationCallback.current = null; }} onCreate={async draft => {
        const id = await workspace.createConfiguredNode(draft);
        graphCreationCallback.current?.(id);
        openNodeView(id);
        setSelectedLoreIds(draft.destination === "lore" ? [id] : []);
      }} />}
      {loreAddOpen && <LoreAddDialog onRequestCreate={() => { setLoreAddOpen(false); workspace.openCreate(null); }} nodes={workspace.nodes} onAdd={(ids) => { workspace.addToLore(ids); setSelectedLoreIds(ids); }} onClose={() => setLoreAddOpen(false)} />}
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
          visual={previewVisual}
          position={workspace.dragPreviewPosition}
        />
      )}
      {vaultImagePickerOpen && <ImagePickerDialog title={t("workspace.chooseVaultImage")} onClose={() => setVaultImagePickerOpen(false)}>
          <IconCapabilityPicker nodes={workspace.nodes} initialImageId={!projectVisual ? projectImageNodeId : null} currentImageId={projectImageNodeId} currentPresentation={projectPresentation} tab={vaultImageTab} onTabChange={setVaultImageTab} onImageSelect={chooseVaultImage}
            onImageUpload={async (file) => (await createNodeFromFile(file, null))?.id ?? null}
            onUnsplashSelect={chooseVaultUnsplash}
            onEmojiSelect={(value, style) => { selectVisual({ kind: "emoji", value, style }); setVaultImagePickerOpen(false); }}
            onIconSelect={(provider, name) => { selectVisual({ kind: "icon", provider, name }); setVaultImagePickerOpen(false); }}
            onClear={() => { clearProjectImage(); setVaultImagePickerOpen(false); }} clearLabel={t("workspace.removeVaultImage")} />
      </ImagePickerDialog>}
      {printNode && <PrintDocument node={printNode} host={nodeViewHost} settings={printSettings} onReady={(printEditor) => printReadyRef.current?.(printEditor)} onError={(error) => printReadyRef.current?.(undefined, error)} />}
    </div>
  );
}
