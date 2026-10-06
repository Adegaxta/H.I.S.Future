import type { ConversationActResult, GemitaVConversationState, RetrievalPolicy } from "./types";

export function resolveKnowledgeNeed(act: ConversationActResult, state: GemitaVConversationState): RetrievalPolicy {
  if (["CHAT", "TRANSLATE_PREVIOUS", "SHORTEN_PREVIOUS", "REWRITE_PREVIOUS", "CORRECT_REFERENCE"].includes(act.primaryAct)) return "SKIP";
  if (act.primaryAct === "META" && !act.knowledgeRequired) return "SKIP";
  if (act.primaryAct === "EXPAND_PREVIOUS" && state.lastAnswerSpec) return "REUSE_PREVIOUS_EVIDENCE";
  if (act.primaryAct === "FOLLOW_UP" && state.lastAnswerSpec && !act.knowledgeRequired) return "REUSE_PREVIOUS_EVIDENCE";
  if (act.primaryAct === "FOLLOW_UP" && !act.knowledgeRequired) return "SKIP";
  return act.knowledgeRequired || act.primaryAct === "FOLLOW_UP" ? "RETRIEVE" : "SKIP";
}
