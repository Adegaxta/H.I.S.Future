import type { PersistedNode, ProjectInfo } from "./types";
import type { ProjectResourceKind } from "./resourceRegistry";
import type { Tag } from "../tags/types";

interface BrowserDevState {
  info: ProjectInfo;
  nodes: PersistedNode[];
  settings: Map<string, string>;
  resources: Map<string, Uint8Array>;
  tags: Tag[];
  nodeTags: Map<string, Set<string>>;
}

let activeState: BrowserDevState | null = null;

const cloneNodes = (nodes: PersistedNode[]) => nodes.map((node) => ({ ...node }));
const resourceKey = (kind: ProjectResourceKind, resourceId: string, extension?: string) =>
  `${kind}:${resourceId}:${(extension ?? (kind === "pdf" ? "pdf" : "png")).toLowerCase()}`;

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
    tags: [],
    nodeTags: new Map(),
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
  nodeTags?: [string, string[]],
): void {
  const state = requireState();
  if (nodeTags?.[1].length && !nodes.some(node => node.id === nodeTags[0] && (node.type === "pagina" || node.type === "proyecto"))) throw new Error("Tags unavailable for this type");
  if (nodeTags && nodeTags[1].some(id => !state.tags.some(tag => tag.id === id))) throw new Error("Tag unavailable");
  state.nodes = cloneNodes(nodes);
  if (nodeTags) state.nodeTags.set(nodeTags[0], new Set(nodeTags[1]));
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
  extension?: string,
): void {
  requireState().resources.set(resourceKey(kind, resourceId, extension), data.slice());
}

export function readBrowserDevResource(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Uint8Array {
  const data = requireState().resources.get(resourceKey(kind, resourceId, extension));
  if (!data) throw new Error(`El recurso DEV ${resourceId} no existe.`);
  return data.slice();
}

export function deleteBrowserDevResource(kind: ProjectResourceKind, resourceId: string, extension?: string): void {
  requireState().resources.delete(resourceKey(kind, resourceId, extension));
}

export function browserDevResourceExists(kind: ProjectResourceKind, resourceId: string, extension?: string): boolean {
  return requireState().resources.has(resourceKey(kind, resourceId, extension));
}

export function listBrowserDevTags(): Tag[] {
  return requireState().tags.map((tag) => ({ ...tag }));
}

export function listBrowserDevNodeTags(nodeId: string): Tag[] {
  const state = requireState();
  const assigned = state.nodeTags.get(nodeId) ?? new Set<string>();
  return state.tags.filter((tag) => assigned.has(tag.id)).map((tag) => ({ ...tag }));
}

export function createBrowserDevTag(tag: Omit<Tag, "order">): Tag {
  const state = requireState();
  const normalized = tag.name.trim().toLocaleLowerCase();
  if (state.tags.some((existing) => existing.name.trim().toLocaleLowerCase() === normalized)) {
    throw new Error("Ya existe un Tag con ese nombre.");
  }
  const created = { ...tag, name: tag.name.trim(), order: state.tags.length };
  state.tags.push(created);
  return { ...created };
}

export function updateBrowserDevTag(tag: Omit<Tag, "order">): Tag {
  const state = requireState();
  const index = state.tags.findIndex((existing) => existing.id === tag.id);
  if (index < 0) throw new Error("El Tag ya no existe.");
  const normalized = tag.name.trim().toLocaleLowerCase();
  if (state.tags.some((existing) => existing.id !== tag.id && existing.name.trim().toLocaleLowerCase() === normalized)) {
    throw new Error("Ya existe un Tag con ese nombre.");
  }
  state.tags[index] = { ...state.tags[index], name: tag.name.trim(), color: tag.color };
  return { ...state.tags[index] };
}

export function deleteBrowserDevTag(id: string): void {
  const state = requireState();
  state.tags = state.tags.filter((tag) => tag.id !== id);
  for (const assigned of state.nodeTags.values()) assigned.delete(id);
}

export function setBrowserDevNodeTag(nodeId: string, tagId: string, assigned: boolean): void {
  const state = requireState();
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error("El Nodo ya no existe.");
  if (node.type !== "pagina" && node.type !== "proyecto") throw new Error("Este tipo de Nodo no admite Tags.");
  if (!state.tags.some((tag) => tag.id === tagId)) throw new Error("El Tag ya no existe.");
  const current = state.nodeTags.get(nodeId) ?? new Set<string>();
  if (assigned) current.add(tagId);
  else current.delete(tagId);
  state.nodeTags.set(nodeId, current);
}

export function reorderBrowserDevTags(ids: string[]): void {
  const state = requireState();
  if (new Set(ids).size !== state.tags.length || ids.length !== state.tags.length) {
    throw new Error("El nuevo orden debe incluir todos los Tags una sola vez.");
  }
  const byId = new Map(state.tags.map((tag) => [tag.id, tag]));
  state.tags = ids.map((id, order) => {
    const tag = byId.get(id);
    if (!tag) throw new Error("El nuevo orden contiene un Tag inexistente.");
    return { ...tag, order };
  });
}
