import { normalizeLexicalText } from "../../lexicon";
import type { AnswerSpec, ValidationResult } from "./types";

const COLORS = ["azul", "verde", "rojo", "amarillo", "negro", "blanco", "violeta", "morado", "naranja", "gris", "dorado", "plateado", "cian", "magenta", "turquesa"];
const LEAKAGE = [/\bsource\s*\d+\b/iu, /\bfragmento?\s*\d+\b/iu, /\bretrieval\b/iu, /\bHIS_CONTEXT\b/iu, /\b(?:ev|fact|rel|meta)-[\w-]+\b/iu];
const EXTERNAL_LORE_SIGNALS = ["banda electronica", "grupo musical", "discografia", "festival", "album", "sello discografico", "miembros de la banda", "spotify", "bandcamp"];

function unique(values: readonly string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function corpus(spec: AnswerSpec): string {
  return normalizeLexicalText([
    ...spec.authorizedFacts.map((fact) => fact.text),
    ...spec.relations.map((relation) => `${relation.source} ${relation.relation} ${relation.target}`),
    ...spec.temporalFacts.map((fact) => fact.text),
    ...spec.metadataFacts.map((fact) => `${fact.key} ${String(fact.value)}`),
    ...spec.knownUnknowns,
    ...spec.conflicts,
    ...spec.targets,
    spec.scope === "CONVERSATION" || spec.scope === "GENERAL" ? spec.conversationContext?.serialized ?? "" : "",
  ].join("\n"));
}

function containingSentence(text: string, needle: string): string {
  return (text.match(/[^.!?\n]+(?:[.!?]+|$)/gu) ?? [text]).find((sentence) => normalizeLexicalText(sentence).includes(normalizeLexicalText(needle)))?.trim() ?? needle;
}

function riskyProperNames(text: string): string[] {
  const result: string[] = [];
  const pattern = /\b[\p{Lu}ÁÉÍÓÚÑ][\p{L}ÁÉÍÓÚÑáéíóúñ-]{2,}\b/gu;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    const prefix = text.slice(0, index).trimEnd();
    const sentenceInitial = index === 0 || /[.!?]\s*$/u.test(prefix);
    if (!sentenceInitial && !["HIS", "GemitaV", "Gemita"].includes(value)) result.push(value);
  }
  return unique(result);
}

function hasUncertaintyMarker(text: string): boolean {
  return /\b(?:no (?:esta|está) especificado|no se especifica|no hay (?:informacion|información|datos)|desconocid|insuficiente|his no)\b/iu.test(text);
}

function hasConflictMarker(text: string): boolean {
  return /\b(?:conflicto|contradic|versiones?|difiere|por un lado|por otro)\b/iu.test(text);
}

export function validateDraft(draft: string, spec: AnswerSpec): ValidationResult {
  const normalizedDraft = normalizeLexicalText(draft);
  const authorized = corpus(spec);
  const suspicious: string[] = [];
  const unsupported: string[] = [];
  const contradictions: string[] = [];
  const missing: string[] = [];
  const leakage = LEAKAGE.filter((pattern) => pattern.test(draft)).map((pattern) => pattern.source);

  const riskyValues = unique([
    ...(draft.match(/https?:\/\/[^\s)]+/giu) ?? []),
    ...(draft.match(/\b\d+(?:[.,]\d+)?%?\b/gu) ?? []),
    ...COLORS.filter((color) => new RegExp(`\\b${color}(?:es|a|o|as|os)?\\b`, "iu").test(draft)),
    ...riskyProperNames(draft),
  ]);
  for (const value of riskyValues) {
    if (!authorized.includes(normalizeLexicalText(value))) suspicious.push(value);
  }
  for (const signal of EXTERNAL_LORE_SIGNALS) {
    if (normalizedDraft.includes(signal) && !authorized.includes(signal)) suspicious.push(signal);
  }

  const draftClaimsRelation = /\b(?:causa|provoca|origina|creo|creó|fund[oó]|miembro|pertenece|aliado|relaciona|conecta)\b/iu.test(draft);
  const evidenceHasRelation = /\b(?:causa|provoca|origina|creo|creó|fund[oó]|miembro|pertenece|aliado|relaciona|conecta)\b/iu.test(authorized) || spec.relations.length > 0;
  if (draftClaimsRelation && !evidenceHasRelation) suspicious.push("unsupported_relation_or_cause");

  for (const addition of suspicious) unsupported.push(containingSentence(draft, addition));
  if ((spec.evidenceStatus === "INSUFFICIENT" || spec.knownUnknowns.length > 0) && !hasUncertaintyMarker(draft)) missing.push(...(spec.unsupportedAspects.length ? spec.unsupportedAspects : ["unknown_marker"]));
  if (spec.evidenceStatus === "CONFLICTING" && !hasConflictMarker(draft)) missing.push("conflict_marker");
  if (spec.knownUnknowns.length > 0 && /\b(?:definitivamente|sin duda|confirmado|ciertamente)\b/iu.test(draft)) contradictions.push("certainty_contradicts_known_unknowns");

  const reasons = [
    ...(unsupported.length ? ["unsupported_high_risk_claims"] : []),
    ...(missing.length ? ["required_aspects_or_markers_missing"] : []),
    ...(contradictions.length ? ["evidence_status_contradiction"] : []),
    ...(leakage.length ? ["internal_source_leakage"] : []),
    ...(!draft.trim() ? ["empty_draft"] : []),
  ];
  return {
    valid: reasons.length === 0,
    unsupportedClaims: unique(unsupported),
    missingRequiredAspects: unique(missing),
    contradictions: unique(contradictions),
    suspiciousAdditions: unique(suspicious),
    sourceLeakage: unique(leakage),
    reasons,
  };
}
