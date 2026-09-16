import type { NodeItem } from "../types/nodes";
import { getEffectiveNodeType, collectDescendantIds } from "./nodeTree";
import { hasNodeCapability } from "../nodes/registry";

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

export type LoreConnectorTopology = "none" | "single" | "multiple";

export function getLoreConnectorTopology(visibleChildCount: number): LoreConnectorTopology {
  if (visibleChildCount === 0) return "none";
  if (visibleChildCount === 1) return "single";
  return "multiple";
}

export function getNodeSidebarLocation(nodes: readonly NodeItem[], id: string): "lore" | "types" {
  return nodes.find((node) => node.id === id)?.loreHidden ? "types" : "lore";
}

export function getLoreExpandableIds(nodes: NodeItem[]): string[] {
  const visibleNodes = getLoreNodes(nodes);
  const childrenByParent = new Map<string | null, NodeItem[]>();
  visibleNodes.forEach((node) => {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  });
  return visibleNodes
    .filter((node) => (childrenByParent.get(node.id)?.length ?? 0) > 0)
    .filter((node) => hasNodeCapability(getEffectiveNodeType(visibleNodes, node), "containChildren"))
    .map((node) => node.id);
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
