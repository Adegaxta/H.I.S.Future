import type { PersistedConversationState, SemanticFrame } from "./types";

export function emptyPersistedConversationState(conversationId: string): PersistedConversationState {
  return { conversationId, activeSubjects: [], activePeople: [], activeEntities: [], activeConcepts: [], activeTopic: null, activeTask: null, lastIntent: null, lastScope: null, lastConversationAct: null, lastUserMessageId: null, lastAssistantMessageId: null, lastReferencedMessageIds: [], lastAnswerSpecRef: null, lastEvidenceRefs: [], currentLanguage: null, updatedAt: new Date().toISOString() };
}

function newestUnique(current: readonly string[], incoming: readonly string[], limit = 8): string[] {
  return [...new Set([...incoming, ...current])].slice(0, limit);
}

export function updateConversationState(input: { state: PersistedConversationState; frame: SemanticFrame; userMessageId: string; referencedMessageIds?: string[] }): PersistedConversationState {
  const correction = input.frame.mentions.find((mention) => mention.semanticType === "CORRECTION")?.object;
  const people = correction ? [correction] : input.frame.people;
  return {
    ...input.state,
    activeSubjects: newestUnique(input.state.activeSubjects, [input.frame.subject]),
    activePeople: newestUnique(input.state.activePeople, people),
    activeConcepts: newestUnique(input.state.activeConcepts, input.frame.concepts),
    activeTopic: input.frame.concepts[0] ?? input.frame.people[0] ?? input.state.activeTopic,
    activeTask: input.frame.tasks[0] ?? input.state.activeTask,
    lastUserMessageId: input.userMessageId,
    lastReferencedMessageIds: input.referencedMessageIds ?? input.state.lastReferencedMessageIds,
    currentLanguage: /\b(?:the|and|what|yesterday)\b/iu.test(input.frame.mentions.map((item) => item.surfaceText).join(" ")) ? "en" : "es",
    updatedAt: new Date().toISOString(),
  };
}
