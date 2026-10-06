import { normalizeLexicalText } from "../../lexicon";
import type { MemoryRecord, MemoryType, MemoryWriteDecision, SemanticFrame, SemanticMention } from "./types";

export interface MemoryPolicyResult {
  decision: MemoryWriteDecision;
  records: MemoryRecord[];
  reasons: string[];
}

function newRecord(input: { conversationId: string; messageId: string; mention: SemanticMention; type: MemoryType; scope: MemoryRecord["scope"]; value: string; predicate?: string; priority: number; expiresAt?: string }): MemoryRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `memory:${input.type.toLowerCase()}:${input.messageId}:${input.mention.id.split(":").slice(-1)[0] ?? "0"}`,
    memoryType: input.type,
    scope: input.scope,
    subject: input.mention.subject ?? "USER",
    ...(input.predicate ? { predicate: input.predicate } : {}),
    value: input.value,
    sourceConversationId: input.conversationId,
    sourceMessageIds: [input.messageId],
    relatedMentionIds: [input.mention.id],
    relatedNodeIds: input.mention.canonicalNodeId ? [input.mention.canonicalNodeId] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
    confidence: input.mention.confidence,
    priority: input.priority,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

export function applyMemoryPolicy(input: { conversationId: string; messageId: string; text: string; frame: SemanticFrame; now?: Date }): MemoryPolicyResult {
  if (input.frame.speaker === "ASSISTANT") return { decision: "IGNORE", records: [], reasons: ["assistant_output_is_not_memory_authority"] };
  if ((input.frame.confidence ?? 1) < 0.72) return { decision: "IGNORE", records: [], reasons: ["semantic_frame_below_persistence_threshold"] };
  const normalized = normalizeLexicalText(input.text);
  const persistentSignal = /\b(?:de ahora en adelante|siempre|recuerda que|a partir de ahora)\b/u.test(normalized);
  const conversationSignal = /\b(?:durante esta charla|en esta conversacion|por ahora)\b/u.test(normalized);
  const now = input.now ?? new Date();
  const records: MemoryRecord[] = [];
  const reasons: string[] = [];

  for (const mention of input.frame.mentions) {
    if (mention.confidence < 0.75) { reasons.push(`low_confidence_${mention.semanticType.toLowerCase()}_ignored`); continue; }
    if (mention.semanticType === "PREFERENCE") {
      const value = mention.object ?? mention.surfaceText;
      const normalizedValue = normalizeLexicalText(value);
      const predicate = /\b(?:cort|breve|larg|detall)\w*\b/u.test(normalizedValue) ? "response_length" : /\b(?:espanol|ingles|idioma|language)\b/u.test(normalizedValue) ? "response_language" : mention.relation ?? "prefers";
      records.push(newRecord({ conversationId: input.conversationId, messageId: input.messageId, mention, type: "PREFERENCE", scope: persistentSignal ? "PERSISTENT" : "PROJECT", value, predicate, priority: persistentSignal ? 95 : 80 }));
      reasons.push(persistentSignal ? "explicit_durable_preference" : "user_preference");
    } else if (mention.semanticType === "DECISION") {
      records.push(newRecord({ conversationId: input.conversationId, messageId: input.messageId, mention, type: "DECISION", scope: "PROJECT", value: mention.object ?? mention.surfaceText, predicate: "decided", priority: 85 }));
      reasons.push("explicit_decision");
    } else if (mention.semanticType === "TASK") {
      const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      records.push(newRecord({ conversationId: input.conversationId, messageId: input.messageId, mention, type: "TASK", scope: conversationSignal ? "CONVERSATION" : "PROJECT", value: mention.object ?? mention.surfaceText, predicate: "working_on", priority: 75, expiresAt: expiry }));
      reasons.push("active_task");
    } else if (mention.semanticType === "EVENT" && mention.modality !== "belief") {
      const dateMention = input.frame.mentions.find((candidate) => candidate.temporalReference?.resolvedValue);
      const expiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
      records.push(newRecord({ conversationId: input.conversationId, messageId: input.messageId, mention, type: "EPISODIC", scope: "CONVERSATION", value: mention.surfaceText, predicate: dateMention?.temporalReference?.resolvedValue ? `event_at:${dateMention.temporalReference.resolvedValue}` : "event", priority: 55, expiresAt: expiry }));
      reasons.push("bounded_user_episode");
    }
  }

  if (records.length === 0) return { decision: "IGNORE", records, reasons: [input.frame.modality === "belief" ? "belief_is_not_promoted_to_fact" : "no_memory_worthy_structure"] };
  const decision: MemoryWriteDecision = records.some((record) => record.scope === "PERSISTENT" || record.scope === "PROJECT") ? "PERSISTENT" : "CONVERSATION";
  return { decision, records, reasons };
}

export function supersessionKey(record: MemoryRecord): string | null {
  if (!(["PREFERENCE", "TASK", "DECISION"] as MemoryType[]).includes(record.memoryType)) return null;
  return `${record.scope}|${record.memoryType}|${normalizeLexicalText(record.subject)}|${normalizeLexicalText(record.predicate ?? "")}`;
}
