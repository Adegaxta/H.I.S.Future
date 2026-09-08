import type { NodeItem, RenderNodeType } from "../types/nodes";
import { hasNodeCapability } from "../defs/nodeTypes";

export function getChildren(
  nodes: NodeItem[],
  parentId: string | null,
): NodeItem[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function getEffectiveNodeType(
  nodes: NodeItem[],
  node: NodeItem,
): RenderNodeType {
  return node.type === "pagina" &&
    nodes.some((child) => child.parentId === node.id)
    ? "pagina-carpeta"
    : node.type;
}

export function collectDescendantIds(
  nodes: NodeItem[],
  id: string,
): Set<string> {
  const ids = new Set<string>();
  const collect = (parentId: string) => {
    ids.add(parentId);
    nodes
      .filter((node) => node.parentId === parentId)
      .forEach((node) => collect(node.id));
  };
  collect(id);
  return ids;
}

export function wouldCreateCycle(
  nodes: NodeItem[],
  draggedId: string,
  targetId: string,
): boolean {
  let current = nodes.find((node) => node.id === targetId);
  while (current) {
    if (current.id === draggedId) return true;
    current = nodes.find((node) => node.id === current?.parentId);
  }
  return false;
}

export function reorderNodes(
  nodes: NodeItem[],
  draggedId: string,
  targetId: string | null,
  position: "before" | "inside" | "after",
): NodeItem[] {
  const dragged = nodes.find((node) => node.id === draggedId);
  const target =
    targetId === null ? null : nodes.find((node) => node.id === targetId);
  if (!dragged || (targetId !== null && !target)) return nodes;

  const newParentId =
    position === "inside" ? targetId : (target?.parentId ?? null);
  const destination = nodes
    .filter((node) => node.parentId === newParentId && node.id !== draggedId)
    .sort((a, b) => a.order - b.order);
  const targetIndex = target
    ? destination.findIndex((node) => node.id === target.id)
    : destination.length;
  const insertionIndex =
    position === "before"
      ? Math.max(0, targetIndex)
      : position === "after"
        ? targetIndex + 1
        : destination.length;
  destination.splice(insertionIndex, 0, { ...dragged, parentId: newParentId });

  return nodes.map((node) => {
    const destinationIndex = destination.findIndex(
      (item) => item.id === node.id,
    );
    if (node.id === draggedId)
      return { ...node, parentId: newParentId, order: insertionIndex };
    if (destinationIndex !== -1) return { ...node, order: destinationIndex };
    return node;
  });
}

export function reorderMultipleNodes(
  nodes: NodeItem[],
  draggedIds: string[],
  targetId: string | null,
  position: "before" | "inside" | "after",
): NodeItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedIds = new Set(draggedIds);
  const roots = draggedIds.filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId) {
      if (selectedIds.has(parentId)) return false;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return byId.has(id);
  });
  const target = targetId === null ? null : byId.get(targetId);
  if (!roots.length || roots.includes(targetId ?? "")) return nodes;
  if (targetId !== null && !target) return nodes;
  if (targetId && roots.some((id) => wouldCreateCycle(nodes, id, targetId))) return nodes;

  const newParentId = position === "inside" ? targetId : (target?.parentId ?? null);
  const destination = getChildren(nodes, newParentId).filter((node) => !roots.includes(node.id));
  const targetIndex = target ? destination.findIndex((node) => node.id === target.id) : -1;
  const insertionIndex =
    position === "before"
      ? Math.max(0, targetIndex)
      : position === "after" && targetIndex >= 0
        ? targetIndex + 1
        : destination.length;
  const orderedDestination = [...destination];
  orderedDestination.splice(insertionIndex, 0, ...roots.map((id) => byId.get(id)!));
  const destinationOrder = new Map(orderedDestination.map((node, index) => [node.id, index]));

  return nodes.map((node) => {
    const nextOrder = destinationOrder.get(node.id);
    if (roots.includes(node.id)) return { ...node, parentId: newParentId, order: nextOrder ?? node.order };
    if (nextOrder !== undefined) return { ...node, order: nextOrder };
    return node;
  });
}

export function sanitizeParentIds(nodes: NodeItem[]): NodeItem[] {
  const ids = new Set(nodes.map((node) => node.id));
  let changed = false;
  const result = nodes.map((node) => {
    if (node.parentId !== null && !ids.has(node.parentId)) {
      changed = true;
      return { ...node, parentId: null };
    }
    return node;
  });
  return changed ? result : nodes;
}

export function sortNodesForPersistence(nodes: NodeItem[]): NodeItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sorted: NodeItem[] = [];
  const visited = new Set<string>();

  const visit = (node: NodeItem) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (node.parentId && byId.has(node.parentId)) {
      visit(byId.get(node.parentId)!);
    }
    sorted.push(node);
  };

  nodes.forEach(visit);
  return sorted;
}

// Categories are structural folders; Page folders and Calendar keep their own click behavior.
export function opensNodeViewOnClick(node: NodeItem): boolean {
  return hasNodeCapability(node.type, "openOnPrimaryAction");
}
