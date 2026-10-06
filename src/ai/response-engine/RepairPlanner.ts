import type { AnswerSpec, RepairPlan, ValidationResult } from "./types";

export function buildRepairPlan(spec: AnswerSpec, validation: ValidationResult): RepairPlan {
  const invalidSentences = new Set(validation.unsupportedClaims);
  return {
    removeUnsupportedClaims: [...validation.unsupportedClaims, ...validation.suspiciousAdditions, ...validation.sourceLeakage],
    addMissingAspects: validation.missingRequiredAspects,
    preserveClaims: spec.authorizedFacts.map((fact) => fact.text).filter((text) => !invalidSentences.has(text)).slice(0, 16),
    requiredUnknownStatements: spec.knownUnknowns.length ? spec.knownUnknowns : spec.evidenceStatus === "INSUFFICIENT" ? ["No está especificado en el baúl."] : [],
  };
}
