import type { AINodeStructure } from "../AINodeInspector";

export type StructuralEdgeKind = "call" | "nodal" | "hierarchy" | "link";
export interface StructuralEdge { sourceId: string; targetId: string; kind: StructuralEdgeKind; weight: number }

export function buildStructuralGraph(structures: readonly AINodeStructure[]) {
  const nodeIds = new Set(structures.map((structure) => structure.id));
  const edges: StructuralEdge[] = [];
  for (const structure of structures) {
    for (const call of structure.calls) if (!call.broken) edges.push({ sourceId: structure.id, targetId: call.targetId, kind: "call", weight: 90 });
    for (const relation of structure.outgoingRelations) if (!relation.broken) edges.push({ sourceId: structure.id, targetId: relation.targetId, kind: "nodal", weight: 80 });
    if (structure.parentId && nodeIds.has(structure.parentId)) edges.push({ sourceId: structure.parentId, targetId: structure.id, kind: "hierarchy", weight: 65 });
    for (const link of structure.links) {
      const target = link.href.match(/^(?:his:|node:|#node-)(.+)$/u)?.[1];
      if (target && nodeIds.has(target)) edges.push({ sourceId: structure.id, targetId: target, kind: "link", weight: 70 });
    }
  }
  const related = (targets: ReadonlySet<string>) => edges.filter((edge) => targets.has(edge.sourceId) || targets.has(edge.targetId));
  return { edges, related };
}
