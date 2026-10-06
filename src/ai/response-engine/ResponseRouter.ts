import type { AnswerSpec, ResponseRoute } from "./types";
import type { ResponsePlan } from "./ResponsePlan";

export function routeResponse(spec: AnswerSpec, plan?: ResponsePlan): ResponseRoute {
  if (plan?.complexity === "SIMPLE_DETERMINISTIC" && plan.canUseDeterministicNLG) return { mode: "DIRECT_NLG", reason: plan.reason };
  if (plan?.complexity === "STRUCTURED_NLG" && plan.canUseDeterministicNLG) return { mode: "DIRECT_NLG", reason: plan.reason };
  if (plan?.complexity === "GENERATIVE") return { mode: "GEMMA_DRAFT", reason: plan.reason };
  if (spec.evidenceStatus === "INSUFFICIENT") return { mode: "DIRECT_NLG", reason: "structured_insufficient_evidence" };
  if (spec.evidenceStatus === "CONFLICTING") return { mode: "DIRECT_NLG", reason: "structured_conflicting_evidence" };
  if (spec.conversationAct === "SHORTEN_PREVIOUS") return { mode: "DIRECT_NLG", reason: "deterministic_previous_response_shortening" };
  if (spec.conversationAct === "CORRECT_REFERENCE") return { mode: "DIRECT_NLG", reason: "deterministic_reference_correction" };
  if (spec.conversationAct === "META") return { mode: "DIRECT_NLG", reason: "bounded_system_meta" };
  if (spec.conversationAct === "CHAT" && spec.authorizedFacts.length === 0 && spec.depth === "brief") return { mode: "DIRECT_NLG", reason: "small_talk_fast_path" };
  if (spec.conversationContext && (spec.conversationAct === "CHAT" || spec.conversationAct === "FOLLOW_UP")) return { mode: "GEMMA_DRAFT", reason: "bounded_conversation_context_requires_fluency" };
  if (spec.conversationAct === "CHAT") return { mode: "GEMMA_DRAFT", reason: "open_conversation_requires_fluency" };
  if (spec.scope === "APP" && spec.requiredAspects.length <= 1 && spec.metadataFacts.length > 0) return { mode: "DIRECT_NLG", reason: "simple_app_metadata" };
  if (spec.conversationAct === "TRANSLATE_PREVIOUS" || spec.conversationAct === "REWRITE_PREVIOUS" || spec.conversationAct === "EXPAND_PREVIOUS") return { mode: "GEMMA_DRAFT", reason: "language_operation_requires_fluency" };
  if (spec.format !== "prose" || spec.depth === "detailed" || spec.depth === "exhaustive" || spec.authorizedFacts.length > 3) return { mode: "GEMMA_DRAFT", reason: "multi_fact_synthesis" };
  return { mode: "DIRECT_NLG", reason: "bounded_fact_render" };
}
