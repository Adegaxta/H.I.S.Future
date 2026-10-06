import { normalizeLexicalText } from "../../lexicon";
import type { ContextMessage, PersistedConversationState, SemanticFrame } from "./types";

export interface ReferenceResolution {
  resolvedSubjects: string[];
  referencedMessageIds: string[];
  reasons: string[];
  confidence: number;
}

export function resolveGeneralReferences(input: { text: string; frame: SemanticFrame; state: PersistedConversationState; recentMessages: readonly ContextMessage[] }): ReferenceResolution {
  const text = normalizeLexicalText(input.text);
  const correction = input.frame.mentions.find((mention) => mention.semanticType === "CORRECTION");
  if (correction?.object) return { resolvedSubjects: [correction.object], referencedMessageIds: input.state.lastReferencedMessageIds, reasons: ["explicit_reference_correction"], confidence: 0.99 };

  const resolvedSubjects: string[] = [];
  const reasons: string[] = [];
  if (/\b(?:ella|el|ellos|ellas|esa persona)\b/u.test(text) && input.state.activePeople.length) {
    resolvedSubjects.push(input.state.activePeople[0]);
    reasons.push("recent_active_person");
  } else if (/\b(?:eso|esto|lo anterior|lo segundo|lo que dijiste)\b/u.test(text) && input.state.activeEntities.length) {
    resolvedSubjects.push(input.state.activeEntities[0]);
    reasons.push("recent_active_entity");
  } else if (/\b(?:ese proyecto|mi proyecto)\b/u.test(text) && input.state.activeTopic) {
    resolvedSubjects.push(input.state.activeTopic);
    reasons.push("active_project_or_topic");
  }
  const explicitPrevious = /\b(?:lo que dijiste|lo anterior|tu respuesta|dijiste)\b/u.test(text);
  const referencedMessageIds = explicitPrevious
    ? input.recentMessages.filter((message) => message.role === "assistant").slice(-1).map((message) => message.id)
    : input.state.lastReferencedMessageIds;
  return { resolvedSubjects, referencedMessageIds, reasons, confidence: reasons.length ? 0.82 : 0 };
}
