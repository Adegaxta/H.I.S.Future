import type { GraphEdge } from "./projection";

export function isDirectionalGraphEdge(edge: Pick<GraphEdge, "kind">): boolean {
  return edge.kind === "nodal-relation" || edge.kind === "mention-reference";
}