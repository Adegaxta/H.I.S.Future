import type { NodeItem } from "../types/nodes";
import { collectDescendantIds } from "./nodeTree";

export function setLoreMembership(nodes: NodeItem[], ids: string[], visible: boolean): NodeItem[] {
  const affected = new Set(ids.flatMap((id) => [...collectDescendantIds(nodes, id)]));
  return nodes.map((node) => affected.has(node.id) ? { ...node, loreHidden: !visible } : node);
}

/** Lore placement is a projection; removing an ancestor never breaks project relationships. */
export function getLoreNodes(nodes: NodeItem[]): NodeItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => !node.loreHidden).map((node) => {
    let parentId = node.parentId;
    const seen = new Set([node.id]);
    while (parentId && byId.get(parentId)?.loreHidden && !seen.has(parentId)) {
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    const projectedParentId = parentId && !seen.has(parentId) && byId.has(parentId) ? parentId : null;
    return projectedParentId === node.parentId ? node : { ...node, parentId: projectedParentId };
  });
}

export function normalizeLoreHiddenIds(nodes: readonly NodeItem[], hiddenIds: ReadonlySet<string>): Set<string> {
  const hasNonProjectNode = nodes.some((node) => node.type !== "proyecto");
  const allNonProjectNodesHidden = hasNonProjectNode && nodes
    .filter((node) => node.type !== "proyecto")
    .every((node) => hiddenIds.has(node.id));
  return allNonProjectNodesHidden ? new Set<string>() : new Set(hiddenIds);
}

export function getNodeSidebarLocation(nodes: readonly NodeItem[], id: string): "lore" | "types" {
  return nodes.find((node) => node.id === id)?.loreHidden ? "types" : "lore";
}

export function getLoreAncestorIds(nodes: NodeItem[], id: string): string[] {
  const projected = getLoreNodes(nodes);
  const byId = new Map(projected.map((node) => [node.id, node]));
  const ancestors: string[] = [];
  const seen = new Set([id]);
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    ancestors.push(parentId);
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
}

export function selectLoreRange(order: string[], current: string[], anchor: string | null, id: string, additive: boolean, range: boolean): string[] {
  const from = anchor ? order.indexOf(anchor) : -1;
  const to = order.indexOf(id);
  if (range && from >= 0 && to >= 0) {
    const ids = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    return additive ? [...new Set([...current, ...ids])] : ids;
  }
  return additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id];
}
