import type { EvidenceAssessment, QueryPlan, SelectedContext } from "./types";
import { normalize } from "./utils";

const COLORS = ["azul", "verde", "rojo", "amarillo", "negro", "blanco", "violeta", "morado", "naranja", "gris", "dorado", "plateado", "cian", "magenta", "turquesa"];

function aspectSupported(aspect: string, text: string): boolean {
  switch (aspect) {
    case "exact_color": return COLORS.some((color) => new RegExp(`\\b${color}(?:es|a|o|as|os)?\\b`, "u").test(text));
    case "timeline": return /\b(?:\d{3,4}|antes|despues|durante|murio|nacio|era|fecha)\b/u.test(text);
    case "cause": return /\b(?:porque|debido|causa|provoco|origino|por eso)\b/u.test(text);
    case "relations": return /\b(?:relacion|conecta|vinculo|menciona|junto|calls?)\b/u.test(text);
    case "definition": return /\b(?:es|son|se define|consiste)\b/u.test(text);
    case "origin": return /\b(?:origen|nacio|surgio|se formo|creado|creada)\b/u.test(text);
    case "functioning": return /\b(?:funciona|mediante|cuando|proceso|mecanismo)\b/u.test(text);
    case "components": return /\b(?:componentes|partes|compone|formado por|produce|producen)\b/u.test(text);
    case "role": return /\b(?:papel|funcion|importancia|conecta|conserva|permite)\b/u.test(text);
    case "document_structure": return true;
    default: return text.trim().length > 20;
  }
}

function conflicts(texts: readonly string[], plan: QueryPlan): string[] {
  if (texts.length < 2) return [];
  const result: string[] = [];
  if (plan.aspects.includes("exact_color")) {
    const colors = [...new Set(texts.flatMap((text) => COLORS.filter((color) => new RegExp(`\\b${color}(?:es|a|o|as|os)?\\b`, "u").test(text))))];
    if (colors.length > 1) result.push(`colores incompatibles: ${colors.join(" / ")}`);
  }
  if (plan.aspects.includes("timeline")) {
    const years = [...new Set(texts.flatMap((text) => text.match(/\b\d{3,4}\b/gu) ?? []))];
    if (years.length > 1 && /\b(fecha|murio|nacio|cuando)\b/u.test(normalize(plan.aspects.join(" ")))) result.push(`fechas incompatibles: ${years.join(" / ")}`);
  }
  const assertions = texts.map((text) => text.match(/\b(?:es|era|son|fue)\s+(?:de color\s+)?(no\s+)?([\p{L}-]{3,})/iu)).filter(Boolean);
  if (assertions.some((match) => match?.[1]) && assertions.some((match) => !match?.[1]) && new Set(assertions.map((match) => match?.[2]?.toLocaleLowerCase("es"))).size === 1) result.push("afirmaciones positiva y negativa incompatibles");
  return result;
}

export function gradeEvidence(plan: QueryPlan, selected: readonly SelectedContext[]): EvidenceAssessment {
  if (plan.scope === "GENERAL") return { status: "SUPPORTED", reasons: ["general_knowledge_not_corpus_graded"], supportedAspects: plan.aspects, missingAspects: [], conflictingClaims: [] };
  if (plan.scope === "APP" && plan.aspects.includes("document_structure") && selected.length > 0) return { status: "SUPPORTED", reasons: ["document_metadata_available"], supportedAspects: plan.aspects, missingAspects: [], conflictingClaims: [] };
  const texts = selected.filter((item) => item.contentMode !== "none").map((item) => normalize(item.content));
  const combined = texts.join("\n");
  const hasExplicitRelation = selected.some((item) => item.structure.calls.length > 0 || item.structure.incomingCalls.length > 0 || item.structure.outgoingRelations.length > 0 || item.structure.incomingRelations.length > 0);
  const supported = plan.aspects.filter((aspect) => aspect === "relations" ? hasExplicitRelation || aspectSupported(aspect, combined) : aspectSupported(aspect, combined));
  const missing = plan.aspects.filter((aspect) => !supported.includes(aspect));
  const conflictingClaims = conflicts(texts, plan);
  if (conflictingClaims.length) return { status: "CONFLICTING", reasons: ["incompatible_explicit_claims"], supportedAspects: supported, missingAspects: missing, conflictingClaims };
  if (texts.length === 0 || supported.length === 0) return { status: "INSUFFICIENT", reasons: [texts.length === 0 ? "no_textual_evidence" : "related_context_does_not_answer_requested_aspect"], supportedAspects: [], missingAspects: missing, conflictingClaims: [] };
  if (missing.length) return { status: "PARTIAL", reasons: ["some_requested_aspects_missing"], supportedAspects: supported, missingAspects: missing, conflictingClaims: [] };
  return { status: "SUPPORTED", reasons: ["all_requested_aspects_have_explicit_signals"], supportedAspects: supported, missingAspects: [], conflictingClaims: [] };
}
