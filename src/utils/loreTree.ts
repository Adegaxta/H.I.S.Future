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
    return { ...node, parentId: parentId && !seen.has(parentId) && byId.has(parentId) ? parentId : null };
  });
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
