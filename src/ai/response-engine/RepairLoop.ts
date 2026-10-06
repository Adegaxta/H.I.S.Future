import { emitAILog } from "../AILogger";
import { buildRepairMessages } from "./DraftGenerator";
import { validateDraft } from "./DraftValidator";
import { buildRepairPlan } from "./RepairPlanner";
import type { AnswerSpec, DraftGenerationResult, ValidationResult } from "./types";

export interface RepairLoopResult {
  draft: string;
  validation: ValidationResult;
  attempts: number;
  modelCalls: number;
  lastMetrics: DraftGenerationResult["metrics"];
}

export async function runRepairLoop(input: {
  requestId: string;
  userQuery: string;
  spec: AnswerSpec;
  initialDraft: string;
  initialValidation: ValidationResult;
  maxAttempts: number;
  signal: AbortSignal;
  generate: (messages: ReturnType<typeof buildRepairMessages>, signal: AbortSignal) => Promise<DraftGenerationResult>;
}): Promise<RepairLoopResult> {
  let draft = input.initialDraft;
  let validation = input.initialValidation;
  let attempts = 0;
  let lastMetrics: DraftGenerationResult["metrics"] = null;
  const boundedAttempts = Math.max(0, Math.min(input.maxAttempts, 2));
  while (!validation.valid && attempts < boundedAttempts) {
    attempts += 1;
    const plan = buildRepairPlan(input.spec, validation);
    emitAILog("repair", "attempt_started", { requestId: input.requestId, metadata: { attempt: attempts, issues: validation.reasons, remove: plan.removeUnsupportedClaims.length, add: plan.addMissingAspects.length } });
    if (plan.removeUnsupportedClaims.length > 0 && plan.addMissingAspects.length === 0) {
      const invalid = new Set(plan.removeUnsupportedClaims.map((sentence) => sentence.trim()));
      const focused = (draft.match(/[^.!?\n]+(?:[.!?]+|$)/gu) ?? [draft]).map((sentence) => sentence.trim()).filter((sentence) => sentence && !invalid.has(sentence)).join(" ");
      const focusedValidation = validateDraft(focused, input.spec);
      if (focused && focusedValidation.valid) {
        draft = focused; validation = focusedValidation;
        emitAILog("repair", "focused_unit_repair_succeeded", { requestId: input.requestId, metadata: { attempt: attempts, removedUnits: invalid.size, modelCalls: 0 } });
        break;
      }
    }
    const result = await input.generate(buildRepairMessages(input.spec, input.userQuery, draft, plan), input.signal);
    lastMetrics = result.metrics;
    draft = result.text;
    validation = validateDraft(draft, input.spec);
    emitAILog("validate", "repair_validated", { requestId: input.requestId, metadata: { attempt: attempts, valid: validation.valid, unsupported: validation.unsupportedClaims.length, missing: validation.missingRequiredAspects.length } });
  }
  return { draft, validation, attempts, modelCalls: attempts, lastMetrics };
}
