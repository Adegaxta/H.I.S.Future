import { normalizeLexicalText } from "../../lexicon";
import type { SemanticFrame } from "./types";

export interface EventNode {
  id: string;
  type: string;
  subject: string;
  predicate: string;
  participants: string[];
  location?: string;
  temporalRef?: string;
  sourceMessageIds: string[];
  confidence: number;
  provenance: string[];
}

/** Conversation-scoped episodic graph. It never promotes nodes to HIS canon. */
export class ConversationEventGraph {
  private readonly nodesByConversation = new Map<string, EventNode[]>();

  addFrame(conversationId: string, messageId: string, frame: SemanticFrame): EventNode[] {
    const created = frame.mentions.filter((mention) => mention.semanticType === "EVENT").map((mention, index): EventNode => ({
      id: `event:${conversationId}:${messageId}:${index}`,
      type: normalizeLexicalText(mention.relation ?? "event"),
      subject: mention.subject ?? frame.subject,
      predicate: mention.relation ?? "event",
      participants: [...new Set(frame.people)],
      ...(frame.places[0] ? { location: frame.places[0] } : {}),
      ...(frame.mentions.find((item) => item.temporalReference?.resolvedValue)?.temporalReference?.resolvedValue ? { temporalRef: frame.mentions.find((item) => item.temporalReference?.resolvedValue)!.temporalReference!.resolvedValue! } : {}),
      sourceMessageIds: [messageId], confidence: mention.confidence,
      provenance: [`message://${conversationId}/${messageId}`, `mention://${mention.id}`],
    }));
    const existing = this.nodesByConversation.get(conversationId) ?? [];
    this.nodesByConversation.set(conversationId, [...existing, ...created].slice(-1000));
    return created;
  }

  query(conversationId: string, input: { people?: readonly string[]; temporalRef?: string | null; terms?: readonly string[]; limit?: number }): EventNode[] {
    const terms = (input.terms ?? []).map((term) => normalizeLexicalText(term));
    return (this.nodesByConversation.get(conversationId) ?? []).map((node) => ({ node, score:
      (input.temporalRef && node.temporalRef === input.temporalRef ? 5 : 0) +
      (input.people ?? []).filter((person) => node.participants.some((value) => normalizeLexicalText(value) === normalizeLexicalText(person))).length * 4 +
      terms.filter((term) => normalizeLexicalText(`${node.predicate} ${node.participants.join(" ")} ${node.location ?? ""}`).includes(term)).length * 2,
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, input.limit ?? 8).map((item) => item.node);
  }

  clear(conversationId: string): void { this.nodesByConversation.delete(conversationId); }
}

export const conversationEventGraph = new ConversationEventGraph();
