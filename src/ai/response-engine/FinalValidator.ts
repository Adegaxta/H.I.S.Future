import { validateDraft } from "./DraftValidator";
import type { AnswerSpec, FinalValidationResult } from "./types";

const LEAKAGE = [/\bsource\s*\d+\b/iu, /\bfragmento?\s*\d+\b/iu, /\bretrieval\b/iu, /\bHIS_CONTEXT\b/iu, /\b(?:ev|fact|rel|meta)-[\w-]+\b/iu];

function languageMismatch(text: string, spec: AnswerSpec): boolean {
  if (spec.language === "und") return false;
  const normalized = text.toLocaleLowerCase("es");
  const spanish = (normalized.match(/\b(?:el|la|los|las|que|no|de|en|para|es|está|una|un)\b/gu) ?? []).length;
  const english = (normalized.match(/\b(?:the|is|are|that|of|in|for|with|this|a|an)\b/gu) ?? []).length;
  return spec.language === "es" ? english >= 4 && english > spanish * 2 : spanish >= 4 && spanish > english * 2;
}

export function validateFinal(text: string, spec: AnswerSpec): FinalValidationResult {
  const draftValidation = validateDraft(text, spec);
  const leakage = LEAKAGE.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  const reasons = [
    ...(!text.trim() ? ["empty_response"] : []),
    ...(draftValidation.unsupportedClaims.length ? ["blocked_claim_reappeared"] : []),
    ...(draftValidation.missingRequiredAspects.length ? ["required_unknown_or_conflict_marker_missing"] : []),
    ...(leakage.length ? ["internal_leakage"] : []),
    ...(languageMismatch(text, spec) ? ["language_mismatch"] : []),
  ];
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], leakage: [...new Set(leakage)] };
}
