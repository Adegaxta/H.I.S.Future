import type { AnswerSpec, SemanticUnit } from "./types";

const LEAKAGE_TEXT = /\b(?:Source\s*\d+|fragmento?\s*\d+|retrieval|HIS_CONTEXT|(?:ev|fact|rel|meta)-[\w-]+)\b/giu;

function clean(value: string): string {
  return value.replace(LEAKAGE_TEXT, "").replace(/\s+([,.;:!?])/gu, "$1").replace(/[ \t]{2,}/gu, " ").trim();
}

function shorten(value: string): string {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (sentences.length <= 2) return value.trim();
  return sentences.slice(0, 2).join(" ");
}

export function semanticUnitsFromSpec(spec: AnswerSpec): SemanticUnit[] {
  if (spec.evidenceStatus === "INSUFFICIENT") return [{ kind: "uncertainty", text: "No está especificado en el baúl." }];
  if (spec.evidenceStatus === "CONFLICTING") return [
    { kind: "conflict", text: "La evidencia disponible contiene versiones contradictorias; no puedo reconciliarlas sin inventar." },
    { kind: "list", items: spec.conflicts.length ? spec.conflicts : ["Hay afirmaciones incompatibles en la evidencia."] },
  ];
  return [
    ...spec.authorizedFacts.map((fact): SemanticUnit => ({ kind: "claim", factId: fact.id, text: fact.text })),
    ...spec.relations.map((relation): SemanticUnit => ({ kind: "relation", relationId: relation.id, text: `${relation.source} ${relation.relation} ${relation.target}.` })),
    ...spec.knownUnknowns.map((text): SemanticUnit => ({ kind: "uncertainty", text })),
  ];
}

function directConversation(spec: AnswerSpec): string | null {
  const source = spec.previousResponseOperation?.sourceText.trim() ?? "";
  switch (spec.conversationAct) {
    case "CHAT": return spec.language === "en" ? "Hi. What would you like to explore?" : "Hola. ¿Qué quieres explorar?";
    case "META": return spec.language === "en"
      ? "I understand you mean GemitaV/HIS, not you. I can’t confirm a specific upgrade unless the system provides that metadata."
      : "Entiendo que hablas de GemitaV/HIS, no de ti. No puedo confirmar una mejora concreta si el sistema no me proporciona esa metadata.";
    case "SHORTEN_PREVIOUS": return source ? shorten(source) : "No hay una respuesta anterior que pueda acortar.";
    case "CORRECT_REFERENCE": return spec.language === "en"
      ? "Correct: the improvement referred to GemitaV/HIS, not to you. Thanks for correcting the reference."
      : "Correcto: la mejora se refería a GemitaV/HIS, no a ti. Gracias por corregir la referencia.";
    default: return null;
  }
}

export function renderDeterministic(spec: AnswerSpec): string {
  const conversational = directConversation(spec);
  if (conversational) return clean(conversational);
  const units = semanticUnitsFromSpec(spec).filter((unit) => unit.kind === "claim" || unit.kind === "uncertainty" || unit.kind === "conflict" || unit.kind === "list");
  if (units.length === 0) return spec.language === "en" ? "I don’t have enough authorized information to answer." : "No tengo información autorizada suficiente para responder.";
  if (spec.evidenceStatus === "CONFLICTING") {
    const intro = units.find((unit) => unit.kind === "conflict")?.text ?? "La evidencia es contradictoria.";
    const items = units.find((unit) => unit.kind === "list");
    return clean(`${intro}\n${items?.kind === "list" ? items.items.map((item) => `- ${item}`).join("\n") : ""}`);
  }
  const factLimit = spec.depth === "exhaustive" ? 24 : spec.depth === "detailed" ? 12 : 5;
  const rendered = units.slice(0, factLimit).map((unit) => unit.kind === "list" ? unit.items.map((item) => `- ${item}`).join("\n") : unit.text).filter(Boolean);
  return clean(rendered.join(spec.style.useList ? "\n- " : " "));
}

export function finalizeNLG(spec: AnswerSpec, validatedDraft: string | null): { text: string; mode: "direct" | "hybrid" | "fallback"; units: SemanticUnit[] } {
  const units = semanticUnitsFromSpec(spec);
  if (!validatedDraft) return { text: renderDeterministic(spec), mode: "direct", units };
  const text = clean(validatedDraft);
  if (!text) return { text: renderDeterministic(spec), mode: "fallback", units };
  return { text, mode: "hybrid", units: [...units, { kind: "paragraph", text }] };
}
