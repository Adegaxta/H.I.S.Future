import { AI_NODE_LIMITS, type AINodeStructure } from "../AINodeInspector";
import type { QueryPlan, RankedCandidate, SelectedContext } from "./types";
import { normalize } from "./utils";

const FULL_NODE_CHARS = AI_NODE_LIMITS.mediumTextChars;
const VERY_LARGE_CHARS = AI_NODE_LIMITS.mediumTextChars * 2;
const MAX_CONTENT_CONTEXTS = 5;

function structuralMap(structure: AINodeStructure): string {
  return [
    `Estructura de ${structure.name}`,
    ...structure.headings.map((heading) => `${"#".repeat(heading.level)} ${heading.text}`),
    structure.calls.length ? `Calls: ${structure.calls.map((call) => call.targetName ?? call.targetId).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

export function expandContexts(plan: QueryPlan, structures: readonly AINodeStructure[], ranked: readonly RankedCandidate[]): SelectedContext[] {
  const byId = new Map(structures.map((structure) => [structure.id, structure]));
  const rankedByNode = new Map<string, RankedCandidate[]>();
  for (const candidate of ranked) {
    const list = rankedByNode.get(candidate.chunk.nodeId) ?? [];
    list.push(candidate);
    rankedByNode.set(candidate.chunk.nodeId, list);
  }
  const targetIds = plan.targets.flatMap((target) => target.nodeIds);
  const definitionOnly = plan.intents.includes("DEFINITION") && plan.aspects.length === 1 && plan.aspects[0] === "definition";
  const definitionCandidates = definitionOnly ? ranked.filter((candidate) => {
    const text = normalize(candidate.chunk.text);
    const compactText = text.replace(/\s+/gu, "");
    const mentionsTarget = plan.targets.some((target) => text.includes(target.normalized) || compactText.includes(target.normalized.replace(/\s+/gu, "")));
    return mentionsTarget && /\b(?:es|son|se define|consiste|se refiere)\b/u.test(text);
  }) : [];
  const directDefinition = definitionCandidates.find((candidate) => {
    const heading = normalize(candidate.chunk.section ?? "");
    const compactHeading = heading.replace(/\s+/gu, "");
    return plan.targets.some((target) => heading.includes(target.normalized) || compactHeading.includes(target.normalized.replace(/\s+/gu, "")));
  }) ?? definitionCandidates[0];
  const order = directDefinition
    ? [directDefinition.chunk.nodeId]
    : [...new Set([...targetIds, ...ranked.map((candidate) => candidate.chunk.nodeId)])];
  const selected: SelectedContext[] = [];
  let contentSlots = 0;
  for (const nodeId of order) {
    const structure = byId.get(nodeId);
    if (!structure) continue;
    const candidates = rankedByNode.get(nodeId) ?? [];
    const best = candidates[0];
    const isTarget = targetIds.includes(nodeId);
    if (!structure.markdown.trim()) {
      if (isTarget) selected.push({ structure, targetReason: "resolved_target", contentMode: "none", content: "", chunks: [], score: best?.score ?? 0, rankingReasons: best?.reasons ?? ["empty_target_metadata_only"] });
      continue;
    }
    if (contentSlots >= MAX_CONTENT_CONTEXTS && !isTarget) continue;
    let contentMode: SelectedContext["contentMode"] = "chunk";
    let content = best?.chunk.text ?? structure.markdown.slice(0, 1_200);
    let chunks = best ? [best.chunk] : [];
    if (plan.intents.includes("FULL_NODE") || plan.intents.includes("SUMMARY") || plan.desiredDepth === "exhaustive") {
      if (structure.textLength <= FULL_NODE_CHARS) { contentMode = "full"; content = structure.markdown; chunks = candidates.map((candidate) => candidate.chunk); }
      else if (structure.textLength <= VERY_LARGE_CHARS) { contentMode = "section"; chunks = candidates.slice(0, 5).map((candidate) => candidate.chunk); content = chunks.map((chunk) => chunk.text).join("\n\n"); }
      else { contentMode = "structural_map"; chunks = candidates.slice(0, 3).map((candidate) => candidate.chunk); content = `${structuralMap(structure)}\n\n${chunks.map((chunk) => chunk.text).join("\n\n")}`; }
    } else if (plan.intents.includes("RELATIONS")) {
      contentMode = "section"; chunks = candidates.slice(0, 3).map((candidate) => candidate.chunk); content = chunks.map((chunk) => chunk.text).join("\n\n");
    } else if (best?.chunk.section) {
      contentMode = "section"; chunks = candidates.filter((candidate) => candidate.chunk.section === best.chunk.section).slice(0, 3).map((candidate) => candidate.chunk); content = chunks.map((chunk) => chunk.text).join("\n\n");
    }
    selected.push({ structure, targetReason: isTarget ? "resolved_target" : best?.reasons[0] ?? "ranked_candidate", contentMode, content, chunks, score: best?.score ?? 0, rankingReasons: best?.reasons ?? [] });
    contentSlots += 1;
  }
  return selected;
}
