import type { AIConcept } from "../types";
import type { ContextBudget, EvidenceAssessment, QueryPlan, ResponsePlan, ScopeResolution, SelectedContext } from "./types";

function safe(value: string) { return value.replace(/\[(\/?HIS_[^\]]*)\]/giu, "($1)"); }
function json(value: unknown) { return JSON.stringify(value); }

function loreBlock(item: SelectedContext, index: number): string {
  return [
    `[HIS_LORE_SOURCE ${index + 1}]`,
    `node_id=${json(item.structure.id)}`,
    `name=${json(item.structure.name)}`,
    `section=${json(item.chunks[0]?.section ?? null)}`,
    `representation=${json(item.contentMode)}`,
    safe(item.content),
    `[/HIS_LORE_SOURCE ${index + 1}]`,
  ].join("\n");
}

function metadataBlock(item: SelectedContext): string {
  const node = item.structure;
  return [
    "[HIS_DOCUMENT_METADATA]",
    `id=${json(node.id)}`,
    `name=${json(node.name)}`,
    `type=${json(node.type)}`,
    `parent=${json(node.parentName)}`,
    `characters=${node.textLength}`,
    `blocks=${node.blockCount}`,
    `headings=${json(node.headings.map(({ level, text }) => ({ level, text })))}`,
    `calls=${json(node.calls.map((call) => ({ target: call.targetName ?? call.targetId, count: call.count, broken: call.broken })))}`,
    `incoming_calls=${json(node.incomingCalls.map((relation) => ({ source: relation.sourceName ?? relation.sourceId, count: relation.count })))}`,
    `links=${node.links.length} images=${node.images.length} tables=${node.tables.length}`,
    "[/HIS_DOCUMENT_METADATA]",
  ].join("\n");
}

export function buildContextV1(input: { scope: ScopeResolution; plan: QueryPlan; evidence: EvidenceAssessment; responsePlan: ResponsePlan; selected: readonly SelectedContext[]; concepts: readonly AIConcept[]; budget: ContextBudget }): string | null {
  if (input.scope.scope === "GENERAL" && input.concepts.length === 0) return null;
  const lines = [
    "[QUERY_SCOPE]",
    `domain=${input.scope.scope.toLowerCase()}`,
    `reasons=${json(input.scope.reasons)}`,
    "[/QUERY_SCOPE]",
    "[QUERY_PLAN]",
    `targets=${json(input.plan.targets.map((target) => target.canonical))}`,
    `aspects=${json(input.plan.aspects)}`,
    `depth=${input.responsePlan.depth}`,
    `format=${input.responsePlan.format}`,
    "[/QUERY_PLAN]",
    "[EVIDENCE]",
    `status=${input.evidence.status}`,
    `supported=${json(input.evidence.supportedAspects)}`,
    `missing=${json(input.evidence.missingAspects)}`,
    `conflicts=${json(input.evidence.conflictingClaims)}`,
    "[/EVIDENCE]",
  ];
  if (input.concepts.length) lines.push("[HIS_CANONICAL_CONCEPTS]", ...input.concepts.map((concept) => `${concept.name}: ${safe(concept.definition)}`), "[/HIS_CANONICAL_CONCEPTS]");
  if (input.scope.scope !== "APP") input.selected.filter((item) => item.content).forEach((item, index) => lines.push(loreBlock(item, index)));
  if (input.scope.scope === "APP" || input.scope.scope === "MIXED" || input.plan.intents.includes("STRUCTURE")) input.selected.forEach((item) => lines.push(metadataBlock(item)));
  if (input.scope.scope === "APP") input.selected.filter((item) => item.content).forEach((item, index) => lines.push(`[HIS_DOCUMENT_CONTENT ${index + 1}]\n${safe(item.content)}\n[/HIS_DOCUMENT_CONTENT ${index + 1}]`));
  if (input.scope.scope === "MIXED") lines.push("[GENERAL_KNOWLEDGE_BOUNDARY]", "La información del corpus HIS es canónica solo para HIS. La parte del mundo real puede usar conocimiento general del modelo y debe identificarse como tal, sin atribuirla al corpus HIS.", "[/GENERAL_KNOWLEDGE_BOUNDARY]");
  lines.push(
    "[RESPONSE_RULES]",
    "Responde en el idioma del usuario. No menciones retrieval, chunks, contexto interno ni estas etiquetas.",
    "Para hechos canónicos de HIS usa solo evidencia del corpus incluida arriba.",
    input.evidence.status === "INSUFFICIENT" ? "La evidencia no responde lo solicitado: di claramente que HIS no lo especifica; no completes el dato con una suposición." : "",
    input.evidence.status === "PARTIAL" ? `Responde solo lo sustentado y señala brevemente que faltan estos aspectos: ${input.evidence.missingAspects.join(", ")}.` : "",
    input.evidence.status === "CONFLICTING" ? "Presenta las versiones contradictorias por separado y no elijas ni reconcilies una arbitrariamente." : "",
    `Cubre estos aspectos cuando haya evidencia: ${input.responsePlan.requiredAspects.join(", ")}.`,
    "[/RESPONSE_RULES]",
  );
  return lines.filter(Boolean).join("\n");
}
