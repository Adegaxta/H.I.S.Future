import type { LanguageUnderstandingResult } from "../language-understanding";
import type { AnswerSpec, AuthorizedFact, AuthorizedRelation, ResponseLanguage } from "./types";

export type ResponseComplexity = "SIMPLE_DETERMINISTIC" | "STRUCTURED_NLG" | "GENERATIVE";
export interface ResponsePlan {
  communicativeGoal: "ACKNOWLEDGE" | "ACKNOWLEDGE_AND_INVITE" | "ANSWER" | "CLARIFY" | "TRANSFORM" | "REPORT_UNCERTAINTY";
  audience: "USER"; tone: "CASUAL" | "NEUTRAL" | "FORMAL"; register: "conversational" | "technical"; verbosity: "SHORT" | "NORMAL" | "LONG";
  requiredSemanticUnits: string[]; authorizedFacts: AuthorizedFact[]; authorizedRelations: AuthorizedRelation[];
  uncertainty: string[]; conflicts: string[]; conversationalAcknowledgements: string[]; questionsToAsk: string[];
  structure: "sentence" | "paragraph" | "list" | "sections"; format: string; maxLength: number; minLength: number;
  canUseDeterministicNLG: boolean; requiresGenerativeRenderer: boolean; reason: string; confidence: number;
  complexity: ResponseComplexity; language: ResponseLanguage;
}

export function estimateResponseComplexity(spec: AnswerSpec, understanding?: LanguageUnderstandingResult): ResponseComplexity {
  const primary = understanding?.intents.value[0]?.intent;
  const ambiguity = (understanding?.confidence ?? 1) < 0.72 || (understanding?.references.confidence ?? 1) < 0.65;
  if (ambiguity) return "GENERATIVE";
  if (["REWRITE", "TRANSLATE", "EXPAND"].includes(primary ?? "") || spec.conversationAct === "REWRITE_PREVIOUS" || spec.conversationAct === "TRANSLATE_PREVIOUS" || spec.conversationAct === "EXPAND_PREVIOUS") return "GENERATIVE";
  if (["GREETING", "SMALL_TALK", "SHARE_EXPERIENCE", "CORRECTION"].includes(primary ?? "") && spec.authorizedFacts.length === 0) return "SIMPLE_DETERMINISTIC";
  if (spec.authorizedFacts.length <= 4 && spec.relations.length <= 2 && spec.depth !== "detailed" && spec.depth !== "exhaustive") return "STRUCTURED_NLG";
  return "GENERATIVE";
}

export function buildResponsePlan(spec: AnswerSpec, understanding?: LanguageUnderstandingResult): ResponsePlan {
  const intent = understanding?.intents.value[0]?.intent;
  const complexity = estimateResponseComplexity(spec, understanding);
  const share = intent === "SHARE_EXPERIENCE";
  const greeting = intent === "GREETING";
  const insufficient = spec.evidenceStatus === "INSUFFICIENT";
  const goal: ResponsePlan["communicativeGoal"] = share || greeting ? "ACKNOWLEDGE_AND_INVITE" : insufficient ? "REPORT_UNCERTAINTY" : ["REWRITE", "TRANSLATE", "SHORTEN", "EXPAND"].includes(intent ?? "") ? "TRANSFORM" : "ANSWER";
  const verbosity = spec.depth === "brief" ? "SHORT" : ["detailed", "exhaustive"].includes(spec.depth) ? "LONG" : "NORMAL";
  return {
    communicativeGoal: goal, audience: "USER", tone: share || greeting || spec.conversationAct === "CHAT" ? "CASUAL" : "NEUTRAL", register: spec.scope === "CONVERSATION" ? "conversational" : "technical", verbosity,
    requiredSemanticUnits: goal === "ACKNOWLEDGE_AND_INVITE" ? ["ACKNOWLEDGEMENT", "INVITATION_TO_CONTINUE"] : [...spec.requiredAspects],
    authorizedFacts: spec.authorizedFacts, authorizedRelations: spec.relations, uncertainty: spec.knownUnknowns, conflicts: spec.conflicts,
    conversationalAcknowledgements: share ? ["acknowledge_willingness_to_listen"] : greeting ? ["return_greeting"] : [], questionsToAsk: share ? ["invite_continuation"] : [],
    structure: verbosity === "SHORT" ? "sentence" : spec.style.useList ? "list" : verbosity === "LONG" ? "sections" : "paragraph", format: spec.format,
    maxLength: verbosity === "SHORT" ? 180 : verbosity === "NORMAL" ? 900 : 2400, minLength: verbosity === "SHORT" ? 8 : 20,
    canUseDeterministicNLG: complexity !== "GENERATIVE" && (understanding?.confidence ?? 1) >= 0.72, requiresGenerativeRenderer: complexity === "GENERATIVE",
    reason: complexity === "SIMPLE_DETERMINISTIC" ? "high_confidence_simple_pragmatic_act" : complexity === "STRUCTURED_NLG" ? "bounded_semantic_units" : "fluency_synthesis_or_ambiguity",
    confidence: Math.min(spec.evidenceStatus === "CONFLICTING" ? 0.7 : 0.98, understanding?.confidence ?? 0.9), complexity, language: spec.language,
  };
}
