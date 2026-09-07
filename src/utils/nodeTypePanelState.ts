import type { BaseNodeType } from "../types/nodes";

const NODE_TYPES: BaseNodeType[] = [
  "categoria",
  "pagina",
  "imagen",
  "calendario",
  "tempo",
  "pdf",
  "curso",
  "tarea",
  "video",
];

export function nodeTypePanelStorageKey(projectKey: string): string {
  return `hisfuture.ui.node-types.collapsed.${projectKey}`;
}

export function parseCollapsedNodeTypes(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      NODE_TYPES.filter((type) => parsed[type] === true).map((type) => [type, true]),
    );
  } catch {
    return {};
  }
}

export function serializeCollapsedNodeTypes(value: Record<string, boolean>): string {
  return JSON.stringify(Object.fromEntries(
    NODE_TYPES.filter((type) => value[type] === true).map((type) => [type, true]),
  ));
}
