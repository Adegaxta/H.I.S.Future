import { analyzeGeneralSemantics } from "./GeneralSemanticAnalyzer";
import type { ContextMessage, ConversationSummaryRecord } from "./types";

const unique = (values: readonly string[], limit = 24) => [...new Set(values.filter(Boolean))].slice(-limit);

export function shouldRefreshSummary(messageCount: number, hasContextPressure = false, topicChanged = false, taskCompleted = false): boolean {
  return messageCount >= 50 && (hasContextPressure || topicChanged || taskCompleted || messageCount % 25 === 0);
}

export function buildIncrementalSummary(input: { conversationId: string; messages: readonly ContextMessage[]; previous?: ConversationSummaryRecord; now?: Date }): ConversationSummaryRecord {
  const previous = input.previous;
  const userMessages = input.messages.filter((message) => message.role === "user");
  const frames = userMessages.map((message) => ({ message, frame: analyzeGeneralSemantics({ conversationId: input.conversationId, messageId: message.id, text: message.content, role: "user", now: input.now }) }));
  const mentions = frames.flatMap(({ frame }) => frame.mentions);
  const start = input.messages[0]?.sequence ?? previous?.sourceSequenceStart ?? 0;
  const end = input.messages[input.messages.length - 1]?.sequence ?? previous?.sourceSequenceEnd ?? 0;
  const version = (previous?.version ?? 0) + 1;
  return {
    id: `summary:${input.conversationId}:v${version}`,
    conversationId: input.conversationId,
    version,
    people: unique([...(previous?.people ?? []), ...frames.flatMap(({ frame }) => frame.people)]),
    places: unique([...(previous?.places ?? []), ...frames.flatMap(({ frame }) => frame.places)]),
    concepts: unique([...(previous?.concepts ?? []), ...frames.flatMap(({ frame }) => frame.concepts)]),
    topics: unique([...(previous?.topics ?? []), ...frames.flatMap(({ frame }) => [...frame.people, ...frame.concepts, ...frame.tasks])]),
    userStatements: unique([...(previous?.userStatements ?? []), ...userMessages.filter((message) => !message.content.trim().endsWith("?")).map((message) => message.content.slice(0, 240))], 40),
    preferences: unique([...(previous?.preferences ?? []), ...mentions.filter((mention) => mention.semanticType === "PREFERENCE").map((mention) => mention.object ?? mention.surfaceText)]),
    decisions: unique([...(previous?.decisions ?? []), ...mentions.filter((mention) => mention.semanticType === "DECISION").map((mention) => mention.object ?? mention.surfaceText)]),
    tasks: unique([...(previous?.tasks ?? []), ...mentions.filter((mention) => mention.semanticType === "TASK").map((mention) => mention.object ?? mention.surfaceText)]),
    events: unique([...(previous?.events ?? []), ...mentions.filter((mention) => mention.semanticType === "EVENT").map((mention) => mention.surfaceText)]),
    unresolvedQuestions: unique([...(previous?.unresolvedQuestions ?? []), ...userMessages.filter((message) => message.content.trim().endsWith("?")).map((message) => message.content.slice(0, 240))]),
    sourceSequenceStart: previous ? Math.min(previous.sourceSequenceStart, start) : start,
    sourceSequenceEnd: Math.max(previous?.sourceSequenceEnd ?? 0, end),
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}
