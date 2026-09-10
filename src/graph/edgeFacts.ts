import type { GraphEdge } from "./projection";

export interface GraphEdgeFactSummary {
  fact: GraphEdge;
  count: number;
}

export function aggregateGraphEdgeFacts(facts: readonly GraphEdge[]): GraphEdgeFactSummary[] {
  const summaries = new Map<string, GraphEdgeFactSummary>();
  for (const fact of facts) {
    const key = `${fact.kind}\u0000${fact.role ?? ""}\u0000${fact.provenance}`;
    const existing = summaries.get(key);
    if (existing) existing.count += 1;
    else summaries.set(key, { fact, count: 1 });
  }
  return [...summaries.values()];
}
