export type WorkspaceViewType = "node" | "ai" | "graph";
export type SplitDirection = "horizontal" | "vertical";
export type DropZone = "center" | "left" | "right" | "top" | "bottom";

export interface WorkspaceTab {
  id: string;
  viewType: WorkspaceViewType | null;
  resourceId?: string;
  title?: string;
  state?: Record<string, unknown>;
}

export interface WorkspacePane {
  kind: "pane";
  id: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
}

export interface WorkspaceSplit {
  kind: "split";
  id: string;
  direction: SplitDirection;
  ratio: number;
  children: [WorkspaceLayoutNode, WorkspaceLayoutNode];
}

export type WorkspaceLayoutNode = WorkspacePane | WorkspaceSplit;

export interface WorkspaceLayout {
  version: 1;
  root: WorkspaceLayoutNode;
  focusedPaneId: string;
}

let idSequence = 0;
export function workspaceId(prefix: "pane" | "split" | "tab") {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function createTab(viewType: WorkspaceViewType | null = null, resourceId?: string): WorkspaceTab {
  return { id: workspaceId("tab"), viewType, ...(resourceId ? { resourceId } : {}) };
}

export function createPane(tabs: WorkspaceTab[] = []): WorkspacePane {
  return { kind: "pane", id: workspaceId("pane"), tabs, activeTabId: tabs[0]?.id ?? null };
}

export function createWorkspaceLayout(initialTab: WorkspaceTab = createTab()): WorkspaceLayout {
  const root = createPane([initialTab]);
  return { version: 1, root, focusedPaneId: root.id };
}

export function listPanes(node: WorkspaceLayoutNode): WorkspacePane[] {
  return node.kind === "pane" ? [node] : [...listPanes(node.children[0]), ...listPanes(node.children[1])];
}

export function findPane(node: WorkspaceLayoutNode, paneId: string): WorkspacePane | null {
  if (node.kind === "pane") return node.id === paneId ? node : null;
  return findPane(node.children[0], paneId) ?? findPane(node.children[1], paneId);
}

export function findTab(layout: WorkspaceLayout, tabId: string): { pane: WorkspacePane; tab: WorkspaceTab } | null {
  for (const pane of listPanes(layout.root)) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) return { pane, tab };
  }
  return null;
}

function mapNode(node: WorkspaceLayoutNode, paneId: string, update: (pane: WorkspacePane) => WorkspaceLayoutNode): WorkspaceLayoutNode {
  if (node.kind === "pane") return node.id === paneId ? update(node) : node;
  const first = mapNode(node.children[0], paneId, update);
  const second = mapNode(node.children[1], paneId, update);
  return first === node.children[0] && second === node.children[1] ? node : { ...node, children: [first, second] };
}

export function focusPane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  return findPane(layout.root, paneId) ? { ...layout, focusedPaneId: paneId } : layout;
}

export function addEmptyTab(layout: WorkspaceLayout, paneId = layout.focusedPaneId, tab = createTab()): WorkspaceLayout {
  const root = mapNode(layout.root, paneId, (pane) => ({ ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id }));
  console.info("[WORKSPACE] tab_created", { tabId: tab.id, viewType: tab.viewType });
  return { ...layout, root, focusedPaneId: paneId };
}

export function activateTab(layout: WorkspaceLayout, paneId: string, tabId: string): WorkspaceLayout {
  const pane = findPane(layout.root, paneId);
  if (!pane?.tabs.some((tab) => tab.id === tabId)) return layout;
  return { ...layout, root: mapNode(layout.root, paneId, (current) => ({ ...current, activeTabId: tabId })), focusedPaneId: paneId };
}

export function updateTab(layout: WorkspaceLayout, tabId: string, update: (tab: WorkspaceTab) => WorkspaceTab): WorkspaceLayout {
  const match = findTab(layout, tabId);
  if (!match) return layout;
  return { ...layout, root: mapNode(layout.root, match.pane.id, (pane) => ({ ...pane, tabs: pane.tabs.map((tab) => tab.id === tabId ? update(tab) : tab) })) };
}

export function reorderTab(layout: WorkspaceLayout, paneId: string, tabId: string, targetIndex: number): WorkspaceLayout {
  const pane = findPane(layout.root, paneId);
  if (!pane) return layout;
  const sourceIndex = pane.tabs.findIndex((tab) => tab.id === tabId);
  if (sourceIndex < 0) return layout;
  const safeIndex = Math.max(0, Math.min(pane.tabs.length - 1, targetIndex));
  if (safeIndex === sourceIndex) return layout;
  const tabs = [...pane.tabs];
  const [tab] = tabs.splice(sourceIndex, 1);
  tabs.splice(safeIndex, 0, tab);
  console.info("[WORKSPACE] tab_reordered", { tabId, paneId, from: sourceIndex, to: safeIndex });
  return { ...layout, root: mapNode(layout.root, paneId, (current) => ({ ...current, tabs })) };
}

export function setFocusedTabView(layout: WorkspaceLayout, viewType: WorkspaceViewType, resourceId?: string): WorkspaceLayout {
  const pane = findPane(layout.root, layout.focusedPaneId);
  if (!pane) return layout;
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
  if (!active) return addEmptyTab(layout, pane.id, createTab(viewType, resourceId));
  return updateTab(layout, active.id, (tab) => {
    const next: WorkspaceTab = { ...tab, viewType };
    delete next.title;
    if (resourceId) next.resourceId = resourceId;
    else delete next.resourceId;
    return next;
  });
}

export function closeTab(layout: WorkspaceLayout, paneId: string, tabId: string): WorkspaceLayout {
  const pane = findPane(layout.root, paneId);
  if (!pane) return layout;
  const index = pane.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return layout;
  const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId = pane.activeTabId === tabId
    ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null
    : pane.activeTabId;
  console.info("[WORKSPACE] tab_closed", { tabId, paneId });
  const updated = { ...layout, root: mapNode(layout.root, paneId, (current) => ({ ...current, tabs, activeTabId })), focusedPaneId: paneId };
  const primaryPaneId = listPanes(layout.root)[0]?.id;
  return tabs.length === 0 && paneId !== primaryPaneId ? closePane(updated, paneId) : updated;
}

export function closePane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  const panes = listPanes(layout.root);
  if (!panes.some((pane) => pane.id === paneId)) return layout;
  if (panes.length === 1) {
    console.info("[WORKSPACE] pane_cleared", { paneId });
    return {
      ...layout,
      root: mapNode(layout.root, paneId, (pane) => ({ ...pane, tabs: [], activeTabId: null })),
      focusedPaneId: paneId,
    };
  }

  const remove = (node: WorkspaceLayoutNode): WorkspaceLayoutNode | null => {
    if (node.kind === "pane") return node.id === paneId ? null : node;
    const first = remove(node.children[0]);
    const second = remove(node.children[1]);
    if (!first) return second;
    if (!second) return first;
    return first === node.children[0] && second === node.children[1]
      ? node
      : { ...node, children: [first, second] };
  };

  const root = remove(layout.root);
  if (!root) return layout;
  const remainingPanes = listPanes(root);
  const focusedPaneId = remainingPanes.some((pane) => pane.id === layout.focusedPaneId)
    ? layout.focusedPaneId
    : remainingPanes[0].id;
  console.info("[WORKSPACE] pane_closed", { paneId, remainingPanes: remainingPanes.length });
  return { ...layout, root, focusedPaneId };
}

function detachTab(layout: WorkspaceLayout, tabId: string): { layout: WorkspaceLayout; tab: WorkspaceTab } | null {
  const match = findTab(layout, tabId);
  if (!match) return null;
  const index = match.pane.tabs.findIndex((tab) => tab.id === tabId);
  const tabs = match.pane.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId = match.pane.activeTabId === tabId
    ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null
    : match.pane.activeTabId;
  const root = mapNode(layout.root, match.pane.id, (pane) => ({ ...pane, tabs, activeTabId }));
  return { layout: { ...layout, root }, tab: match.tab };
}

export function moveTab(layout: WorkspaceLayout, tabId: string, targetPaneId: string, zone: DropZone, targetIndex?: number): WorkspaceLayout {
  const source = findTab(layout, tabId);
  const target = findPane(layout.root, targetPaneId);
  if (!source || !target || (source.pane.id === targetPaneId && zone === "center")) return layout;
  const detached = detachTab(layout, tabId);
  if (!detached) return layout;
  if (zone === "center") {
    const root = mapNode(detached.layout.root, targetPaneId, (pane) => {
      const index = Math.max(0, Math.min(pane.tabs.length, targetIndex ?? pane.tabs.length));
      const tabs = [...pane.tabs];
      tabs.splice(index, 0, detached.tab);
      return { ...pane, tabs, activeTabId: detached.tab.id };
    });
    console.info("[WORKSPACE] tab_moved", { tabId, paneId: targetPaneId });
    return { ...detached.layout, root, focusedPaneId: targetPaneId };
  }
  const newPane = createPane([detached.tab]);
  const direction: SplitDirection = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const root = mapNode(detached.layout.root, targetPaneId, (pane) => {
    const children: [WorkspaceLayoutNode, WorkspaceLayoutNode] = zone === "left" || zone === "top" ? [newPane, pane] : [pane, newPane];
    return { kind: "split", id: workspaceId("split"), direction, ratio: 0.5, children };
  });
  console.info("[WORKSPACE] tab_moved", { tabId, paneId: newPane.id });
  console.info("[WORKSPACE] pane_split", { direction, ratio: 0.5 });
  return { ...detached.layout, root, focusedPaneId: newPane.id };
}

export function resizeSplit(layout: WorkspaceLayout, splitId: string, ratio: number): WorkspaceLayout {
  const safeRatio = Math.max(0.18, Math.min(0.82, ratio));
  const visit = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if (node.kind === "pane") return node;
    if (node.id === splitId) return { ...node, ratio: safeRatio };
    return { ...node, children: [visit(node.children[0]), visit(node.children[1])] };
  };
  return { ...layout, root: visit(layout.root) };
}

function validTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<WorkspaceTab>;
  return typeof tab.id === "string" && (tab.viewType === null || ["node", "ai", "graph"].includes(tab.viewType ?? ""));
}

function restoreNode(value: unknown): WorkspaceLayoutNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<WorkspaceLayoutNode> & { children?: unknown[]; tabs?: unknown[] };
  if (node.kind === "pane" && typeof node.id === "string" && Array.isArray(node.tabs) && node.tabs.every(validTab)) {
    const activeTabId = node.tabs.some((tab) => tab.id === node.activeTabId) ? node.activeTabId as string : node.tabs[0]?.id ?? null;
    return { kind: "pane", id: node.id, tabs: node.tabs, activeTabId };
  }
  if (node.kind === "split" && typeof node.id === "string" && (node.direction === "horizontal" || node.direction === "vertical") && Array.isArray(node.children) && node.children.length === 2) {
    const first = restoreNode(node.children[0]);
    const second = restoreNode(node.children[1]);
    if (first && second) return { kind: "split", id: node.id, direction: node.direction, ratio: Math.max(0.18, Math.min(0.82, Number(node.ratio) || 0.5)), children: [first, second] };
  }
  return null;
}

export function restoreWorkspaceLayout(raw: string | null, fallback: WorkspaceLayout): WorkspaceLayout {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayout>;
    const root = restoreNode(parsed.root);
    if (!root) return fallback;
    const panes = listPanes(root);
    const focusedPaneId = panes.some((pane) => pane.id === parsed.focusedPaneId) ? parsed.focusedPaneId as string : panes[0].id;
    console.info("[WORKSPACE] workspace_restored", { panes: panes.length });
    return { version: 1, root, focusedPaneId };
  } catch {
    return fallback;
  }
}
