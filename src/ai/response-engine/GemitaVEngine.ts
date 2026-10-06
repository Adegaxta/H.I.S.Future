import { emitAILog } from "../AILogger";
import { emitContextEngineLogs } from "../AIRequestPreparation";
import { runContextEngine } from "../context-engine";
import { buildAnswerSpec } from "./AnswerSpecBuilder";
import { resolveConversationAct } from "./ConversationActResolver";
import { buildDraftMessages } from "./DraftGenerator";
import { validateDraft } from "./DraftValidator";
import { recordGemitaVDevTrace } from "./DevTraceStore";
import { validateFinal } from "./FinalValidator";
import { resolveKnowledgeNeed } from "./KnowledgeNeedResolver";
import { finalizeNLG, renderDeterministic } from "./NLGFinalizer";
import { runRepairLoop } from "./RepairLoop";
import { routeResponse } from "./ResponseRouter";
import { buildResponsePlan } from "./ResponsePlan";
import { deterministicNLGRenderer, serializeCompactRendererPrompt } from "./LanguageRenderer";
import { emptyConversationState, type ActivityEvent, type GemitaVConversationState, type GemitaVDependencies, type GemitaVInput, type GemitaVResult } from "./types";

function now(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

function stateFromInput(input: GemitaVInput): GemitaVConversationState {
  const base = input.state ?? emptyConversationState();
  const valid = input.history.filter((turn) => !turn.error && !turn.pending && turn.content.trim());
  return {
    ...base,
    lastUserMessage: base.lastUserMessage ?? [...valid].reverse().find((turn) => turn.role === "user")?.content ?? null,
    lastAssistantMessage: base.lastAssistantMessage ?? [...valid].reverse().find((turn) => turn.role === "assistant")?.content ?? null,
  };
}

export async function runGemitaV(input: GemitaVInput, dependencies: GemitaVDependencies): Promise<GemitaVResult> {
  const totalStart = now();
  const timings: Record<string, number> = { ...(input.languageUnderstanding?.timings ?? {}) };
  const state = stateFromInput(input);
  const activity = (phase: ActivityEvent["phase"], status: ActivityEvent["status"], startedAt: number, userVisibleCandidate?: string) => dependencies.onActivity?.({ requestId: input.requestId, phase, status, startedAt, ...(status !== "started" ? { finishedAt: now() } : {}), ...(userVisibleCandidate ? { userVisibleCandidate } : {}) });

  let started = now();
  activity("resolve", "started", started);
  const initialAct = resolveConversationAct(input.query, state, input.languageUnderstanding);
  const retrievalPolicy = resolveKnowledgeNeed(initialAct, state);
  const act = { ...initialAct, retrievalPolicy };
  timings.resolveMs = now() - started;
  activity("resolve", "finished", started);
  emitAILog("act", "resolved", { requestId: input.requestId, metadata: { type: act.primaryAct, secondary: act.secondaryActs, knowledgeRequired: act.knowledgeRequired, retrieval: retrievalPolicy, confidence: act.confidence, reasons: act.reasons } });

  let engine = null;
  if (retrievalPolicy === "RETRIEVE") {
    started = now();
    activity("retrieve", "started", started, "Revisando tu baúl…");
    engine = runContextEngine({ query: input.query, history: input.history, nodes: input.nodes, concepts: input.concepts });
    emitContextEngineLogs(engine, input.requestId);
    timings.retrievalMs = now() - started;
    activity("retrieve", "finished", started);
  } else {
    timings.retrievalMs = 0;
  }

  started = now();
  activity("answer_spec", "started", started);
  const baseSpec = buildAnswerSpec({ requestId: input.requestId, act, engine, state, previousSpec: retrievalPolicy === "REUSE_PREVIOUS_EVIDENCE" ? state.lastAnswerSpec : null });
  const hisEvidenceRefs = engine?.selected.map((item) => item.structure.id) ?? input.conversationContext?.hisEvidenceRefs ?? [];
  const conversationContext = input.conversationContext ? {
    ...input.conversationContext,
    hisEvidenceRefs,
    serialized: input.conversationContext.serialized.replace(
      "[HIS_KNOWLEDGE]\nNone selected.",
      hisEvidenceRefs.length ? `[HIS_KNOWLEDGE]\nAuthorized evidence references only: ${hisEvidenceRefs.join(", ")}` : "[HIS_KNOWLEDGE]\nNone selected.",
    ),
  } : undefined;
  const answerSpec = { ...baseSpec, ...(conversationContext ? { conversationContext } : {}) };
  timings.answerSpecMs = now() - started;
  activity("answer_spec", "finished", started);
  emitAILog("answer_spec", "built", { requestId: input.requestId, metadata: { scope: answerSpec.scope, evidenceStatus: answerSpec.evidenceStatus, facts: answerSpec.authorizedFacts.length, relations: answerSpec.relations.length, unknowns: answerSpec.knownUnknowns.length, conflicts: answerSpec.conflicts.length, sourceCount: answerSpec.sourceIds.length, ...answerSpec.pruningMetrics } });

  started = now();
  const responsePlan = buildResponsePlan(answerSpec, input.languageUnderstanding);
  timings.responsePlanMs = now() - started;
  const route = routeResponse(answerSpec, input.languageUnderstanding ? responsePlan : undefined);
  emitAILog("route", "selected", { requestId: input.requestId, metadata: { mode: route.mode, reason: route.reason } });
  let rawDraft: string | null = null;
  let validation = null;
  let repairs = 0;
  let modelCalls = 0;
  let modelMetrics = null;

  if (route.mode === "GEMMA_DRAFT") {
    started = now();
    activity("draft", "started", started, "Preparando una respuesta…");
    const generated = await dependencies.generateDraft(input.languageUnderstanding ? serializeCompactRendererPrompt(input.query, responsePlan) : buildDraftMessages(answerSpec, input.query), dependencies.signal, { maxTokens: responsePlan.verbosity === "SHORT" ? 48 : responsePlan.verbosity === "NORMAL" ? 240 : 600 });
    rawDraft = generated.text;
    modelMetrics = generated.metrics;
    modelCalls = 1;
    timings.draftMs = now() - started;
    activity("draft", "finished", started);
    emitAILog("draft", "generated", { requestId: input.requestId, metadata: { chars: rawDraft.length, modelCalls } });

    started = now();
    activity("validate", "started", started, "Comprobando la respuesta…");
    validation = validateDraft(rawDraft, answerSpec);
    timings.validateMs = now() - started;
    activity("validate", "finished", started);
    emitAILog("validate", "draft_validated", { requestId: input.requestId, metadata: { valid: validation.valid, unsupported: validation.unsupportedClaims.length, missing: validation.missingRequiredAspects.length, contradictions: validation.contradictions.length, leakage: validation.sourceLeakage.length } });

    if (!validation.valid) {
      started = now();
      activity("repair", "started", started);
      const repaired = await runRepairLoop({ requestId: input.requestId, userQuery: input.query, spec: answerSpec, initialDraft: rawDraft, initialValidation: validation, maxAttempts: dependencies.maxRepairAttempts ?? 1, signal: dependencies.signal, generate: dependencies.generateDraft });
      rawDraft = repaired.draft;
      validation = repaired.validation;
      repairs = repaired.attempts;
      modelCalls += repaired.modelCalls;
      modelMetrics = repaired.lastMetrics ?? modelMetrics;
      timings.repairMs = now() - started;
      activity("repair", validation.valid ? "finished" : "failed", started);
    }
  }

  started = now();
  activity("nlg", "started", started);
  const useDraft = rawDraft && validation?.valid ? rawDraft : null;
  let finalized = !useDraft && input.languageUnderstanding && deterministicNLGRenderer.canRender(responsePlan)
    ? { text: await deterministicNLGRenderer.render(responsePlan, answerSpec), mode: "direct" as const, units: [] }
    : finalizeNLG(answerSpec, useDraft);
  if (rawDraft && !useDraft) finalized = { ...finalized, mode: "fallback" };
  timings.nlgMs = now() - started;
  activity("nlg", "finished", started);
  emitAILog("nlg", "finalized", { requestId: input.requestId, metadata: { mode: finalized.mode, finalChars: finalized.text.length, semanticUnits: finalized.units.length } });

  started = now();
  activity("final_validate", "started", started);
  let finalValidation = validateFinal(finalized.text, answerSpec);
  if (!finalValidation.valid) {
    finalized = { ...finalized, text: renderDeterministic(answerSpec), mode: "fallback" };
    finalValidation = validateFinal(finalized.text, answerSpec);
  }
  timings.finalValidateMs = now() - started;
  activity("final_validate", finalValidation.valid ? "finished" : "failed", started);
  emitAILog("final", "validated", { requestId: input.requestId, metadata: { valid: finalValidation.valid, reasons: finalValidation.reasons, finalChars: finalized.text.length, fallback: finalized.mode === "fallback" } });

  const safeText = finalValidation.valid ? finalized.text : answerSpec.language === "en" ? "I can’t produce a safe answer from the available information." : "No puedo producir una respuesta segura con la información disponible.";
  timings.totalMs = now() - totalStart;
  if (route.mode === "DIRECT_NLG") timings.timeToFirstUsefulOutputMs = timings.totalMs;
  const nextState: GemitaVConversationState = {
    lastUserMessage: input.query,
    lastAssistantMessage: safeText,
    activeEntities: answerSpec.targets.length ? answerSpec.targets : state.activeEntities,
    activeTopic: answerSpec.targets[0] ?? state.activeTopic,
    lastIntent: answerSpec.intents[0] ?? state.lastIntent,
    lastScope: engine?.scope.scope ?? state.lastScope,
    lastConversationAct: act.primaryAct,
    lastAnswerSpec: answerSpec,
    lastEvidenceRefs: answerSpec.sourceIds,
    lastResponseType: route.mode,
  };
  recordGemitaVDevTrace({ requestId: input.requestId, rawAnswerSpec: answerSpec, rawGemmaDraft: rawDraft, finalRender: safeText });
  return {
    text: safeText,
    state: nextState,
    act,
    retrievalPolicy,
    route,
    answerSpec,
    contextEngine: engine,
    validation,
    finalValidation,
    repairs,
    modelCalls,
    modelMetrics,
    timings,
    responsePlan,
    ...(import.meta.env.DEV ? { debug: { rawAnswerSpec: answerSpec, rawGemmaDraft: rawDraft, finalRender: safeText } } : {}),
  };
}
