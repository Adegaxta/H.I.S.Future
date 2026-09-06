import type { NodeItem } from "../types/nodes";

export type RecentActivityKind = "navigate" | "create" | "edit" | "rename" | "move";

export function recordRecentActivity(
  current: Record<string, number>,
  nodeId: string,
  kind: RecentActivityKind,
  timestamp = Date.now(),
): Record<string, number> {
  if (kind === "navigate") return current;
  return { ...current, [nodeId]: timestamp };
}

export function changedNodeIds(before: NodeItem[], after: NodeItem[]): string[] {
  const previous = new Map(before.map((node) => [node.id, node]));
  return after.filter((node) => {
    const old = previous.get(node.id);
    return !old
      || old.name !== node.name
      || old.type !== node.type
      || old.parentId !== node.parentId
      || old.order !== node.order
      || old.content !== node.content
      || Boolean(old.loreHidden) !== Boolean(node.loreHidden);
  }).map((node) => node.id);
}
