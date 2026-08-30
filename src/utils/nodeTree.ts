import type { NodeItem, RenderNodeType } from "../types/nodes";

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