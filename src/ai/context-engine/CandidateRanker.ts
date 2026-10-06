import { hisLexicon } from "../../lexicon";
import type { AINodeStructure } from "../AINodeInspector";
import type { QueryPlan, RankedCandidate, StructuralChunk } from "./types";
import type { StructuralEdge } from "./StructuralGraph";
import { normalize, whole } from "./utils";

export const RANKING_WEIGHTS = {
  explicitTarget: 5_000,
  graphCall: 1_800,
  exactNodeName: 1_200,
  targetNode: 950,
  heading: 320,
  entity: 260,
  contentWhole: 90,
  contentPartial: 35,
} as const;

export function rankCandidates(query: string, plan: QueryPlan, chunks: readonly StructuralChunk[], structures: readonly AINodeStructure[], edges: readonly StructuralEdge[]): RankedCandidate[] {
  const queryText = normalize(query);
  const lexicalTerms = hisLexicon.analyzeQuery(query).significantTerms;
  const terms = [...new Set(plan.targets.map((target) => target.normalized).concat(plan.aspects.map(normalize)).concat(lexicalTerms))];
  const explicitIds = new Set(plan.targets.filter((target) => target.source === "explicit_reference").flatMap((target) => target.nodeIds));
  const targetIds = new Set(plan.targets.flatMap((target) => target.nodeIds));
  const graphNodes = new Map<string, { weight: number; kind: string }>();
  for (const edge of edges) {
    if (targetIds.has(edge.targetId)) graphNodes.set(edge.sourceId, { weight: edge.kind === "call" ? RANKING_WEIGHTS.graphCall : edge.weight * 10, kind: edge.kind });
    if (targetIds.has(edge.sourceId)) graphNodes.set(edge.targetId, { weight: edge.kind === "call" ? RANKING_WEIGHTS.graphCall : edge.weight * 10, kind: edge.kind });
  }
  const names = new Map(structures.map((structure) => [structure.id, normalize(structure.name)]));
  return chunks.map((chunk) => {
    let score = 0;
    const reasons: string[] = [];
    const matchedTerms: string[] = [];
    const name = names.get(chunk.nodeId) ?? normalize(chunk.nodeName);
    if (explicitIds.has(chunk.nodeId)) { score += RANKING_WEIGHTS.explicitTarget; reasons.push("explicit_user_target"); }
    if (targetIds.has(chunk.nodeId)) { score += RANKING_WEIGHTS.targetNode; reasons.push("resolved_target"); }
    if (name && whole(queryText, name)) { score += RANKING_WEIGHTS.exactNodeName; reasons.push("exact_node_name"); }
    const graph = graphNodes.get(chunk.nodeId);
    if (graph) { score += graph.weight; reasons.push(`graph_${graph.kind}`); }
    for (const term of terms) {
      if (term.length < 3) continue;
      const heading = normalize(chunk.section ?? "");
      if (heading && whole(heading, term)) { score += RANKING_WEIGHTS.heading; reasons.push("heading_match"); matchedTerms.push(term); }
      if (whole(chunk.normalizedText, term)) { score += RANKING_WEIGHTS.contentWhole; reasons.push("content_match"); matchedTerms.push(term); }
      else if (term.length >= 5 && chunk.normalizedText.includes(term)) { score += RANKING_WEIGHTS.contentPartial; reasons.push("content_partial"); matchedTerms.push(term); }
    }
    return { chunk, score, reasons: [...new Set(reasons)], matchedTerms: [...new Set(matchedTerms)] };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position).slice(0, 20);
}
