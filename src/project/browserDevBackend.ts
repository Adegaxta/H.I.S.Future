import type { PersistedNode, ProjectInfo } from "./types";
import type { ProjectResourceKind } from "./resourceRegistry";

interface BrowserDevState {
  info: ProjectInfo;
  nodes: PersistedNode[];
  settings: Map<string, string>;
  resources: Map<string, Uint8Array>;
}

let activeState: BrowserDevState | null = null;

const cloneNodes = (nodes: PersistedNode[]) => nodes.map((node) => ({ ...node }));
const resourceKey = (kind: ProjectResourceKind, resourceId: string) => `${kind}:${resourceId}`;

export function createBrowserDevProject(): ProjectInfo {
  const sessionId = crypto.randomUUID();
  const info: ProjectInfo = {
    name: "DEV",
    folderPath: `hisfuture-dev://browser/${sessionId}`,
    databasePath: `memory://hisfuture-dev/${sessionId}`,
    lastEdited: Date.now(),
  };
  activeState = {
    info,
    nodes: [],
    settings: new Map(),
    resources: new Map(),
  };
  return { ...info };
}

export function isBrowserDevProjectActive(): boolean {
  return activeState !== null;
}

export function closeBrowserDevProject(): void {
  activeState = null;
}

function requireState(): BrowserDevState {
  if (!activeState) throw new Error("No hay un entorno DEV de navegador activo.");
  return activeState;
}

export function listBrowserDevNodes(): PersistedNode[] {
  return cloneNodes(requireState().nodes);
}

export function saveBrowserDevWorkspace(
  nodes: PersistedNode[],
  hiddenIds: string[],
  deletedNodes: string,
): void {
  const state = requireState();
  state.nodes = cloneNodes(nodes);
  state.settings.set("loreHiddenIds", JSON.stringify([...hiddenIds]));
  state.settings.set("deletedNodes", deletedNodes);
  state.info.lastEdited = Date.now();
}

export function saveBrowserDevNodeContents(
  changes: Array<{ id: string; content: string }>,
): void {
  const state = requireState();
  const byId = new Map(changes.map((change) => [change.id, change.content]));
  const found = new Set<string>();
  state.nodes = state.nodes.map((node) => {
    const content = byId.get(node.id);
    if (content === undefined) return node;
    found.add(node.id);
    return node.content === content ? node : { ...node, content };
  });
  const missing = changes.find((change) => !found.has(change.id));
  if (missing) throw new Error(`El Nodo DEV ${missing.id} no existe.`);
  state.info.lastEdited = Date.now();
}

export function getBrowserDevSetting(key: string): string | null {
  return requireState().settings.get(key) ?? null;
}

export function setBrowserDevSetting(key: string, value: string): void {
  requireState().settings.set(key, value);
}

export function storeBrowserDevResource(
  kind: ProjectResourceKind,
  resourceId: string,
  data: Uint8Array,
): void {
  requireState().resources.set(resourceKey(kind, resourceId), data.slice());
}

export function readBrowserDevResource(
  kind: ProjectResourceKind,
  resourceId: string,
): Uint8Array {
  const data = requireState().resources.get(resourceKey(kind, resourceId));
  if (!data) throw new Error(`El recurso DEV ${resourceId} no existe.`);
  return data.slice();
}

export function deleteBrowserDevResource(kind: ProjectResourceKind, resourceId: string): void {
  requireState().resources.delete(resourceKey(kind, resourceId));
}
