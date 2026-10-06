import { retrieveMemories } from "./MemoryRetriever";
import type { ActiveConversationContext, ContextAssemblyInput, ContextMessage, RetrievedMemory } from "./types";

const DEFAULT_BUDGET = 4_800;
const SECTION_BUDGETS = { current: 1_200, his: 1_600, referenced: 900, semantic: 650, memory: 900, recent: 900, summary: 500, instructions: 500 } as const;

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function messageLine(message: ContextMessage): string { return `${message.role.toUpperCase()}#${message.sequence}: ${message.content}`; }

function memoryLine(item: RetrievedMemory): string {
  const record = item.record;
  return `${record.memoryType} | ${record.subject} ${record.predicate ?? ""} ${record.value} | provenance=${item.provenance}`;
}

export function assembleConversationContext(input: ContextAssemblyInput): ActiveConversationContext {
  const charBudget = input.charBudget ?? DEFAULT_BUDGET;
  const memoryResult = retrieveMemories({ conversationId: input.conversationId, frame: input.semanticFrame, query: input.currentMessage, records: input.memories, charBudget: Math.min(SECTION_BUDGETS.memory, Math.floor(charBudget * 0.2)) });
  const referenced = input.referencedMessages.slice(-8);
  const referencedIds = new Set(referenced.map((message) => message.id));
  const recent = input.recentMessages.filter((message) => !referencedIds.has(message.id)).slice(-6);
  const provenance = [
    ...referenced.map((message) => `message://conversation/${input.conversationId}/${message.sequence}`),
    ...memoryResult.selected.map((item) => item.provenance),
    ...(input.summary ? [`summary://conversation/${input.conversationId}/v${input.summary.version}`] : []),
    ...(input.hisEvidenceRefs ?? []).map((id) => `node://${id}`),
  ];
  const sections = [
    `[CURRENT_REQUEST]\n${truncate(input.currentMessage, SECTION_BUDGETS.current)}`,
    input.hisEvidenceRefs?.length ? `[HIS_KNOWLEDGE]\nAuthorized evidence references only: ${truncate(input.hisEvidenceRefs.join(", "), SECTION_BUDGETS.his)}` : "[HIS_KNOWLEDGE]\nNone selected.",
    referenced.length ? `[REFERENCED_HISTORY]\n${truncate(referenced.map(messageLine).join("\n"), SECTION_BUDGETS.referenced)}` : "",
    `[SEMANTIC_FRAME]\n${truncate(JSON.stringify({ act: input.semanticFrame.communicativeAct, subject: input.semanticFrame.subject, predicate: input.semanticFrame.predicate, people: input.semanticFrame.people, places: input.semanticFrame.places, tasks: input.semanticFrame.tasks, temporal: input.semanticFrame.temporalReferences, modality: input.semanticFrame.modality, polarity: input.semanticFrame.polarity, confidence: input.semanticFrame.confidence }), SECTION_BUDGETS.semantic)}`,
    `[DISCOURSE_STATE]\n${truncate(JSON.stringify({ role: input.semanticFrame.discourseRole, topic: input.state.activeTopic, task: input.state.activeTask, references: input.state.lastReferencedMessageIds }), Math.floor(SECTION_BUDGETS.semantic * 0.6))}`,
    memoryResult.selected.length ? `[MEMORY]\nUser/conversation context; claims retain their provenance and are not HIS canon.\n${truncate(memoryResult.selected.map(memoryLine).join("\n"), SECTION_BUDGETS.memory)}` : "",
    recent.length ? `[RELEVANT_HISTORY]\n${truncate(recent.map(messageLine).join("\n"), SECTION_BUDGETS.recent)}` : "",
    input.summary ? `[CONVERSATION_SUMMARY]\n${truncate(JSON.stringify({ people: input.summary.people, topics: input.summary.topics, preferences: input.summary.preferences, decisions: input.summary.decisions, tasks: input.summary.tasks, unresolvedQuestions: input.summary.unresolvedQuestions }), SECTION_BUDGETS.summary)}` : "",
    `[RESPONSE_PLAN]\n${truncate(JSON.stringify(input.answerSpec ? { act: input.answerSpec.conversationAct, depth: input.answerSpec.depth, format: input.answerSpec.format, required: input.answerSpec.requiredAspects } : { status: "built_after_context_selection" }), SECTION_BUDGETS.instructions)}\nTreat MEMORY as attributed conversational context, never as lore authority. HIS_KNOWLEDGE wins on lore conflicts. Do not expose internal IDs.`,
  ].filter(Boolean);
  let serialized = sections.join("\n\n");
  if (serialized.length > charBudget) serialized = truncate(serialized, charBudget);
  return {
    currentMessage: input.currentMessage,
    semanticFrame: input.semanticFrame,
    recentMessages: recent,
    referencedMessages: referenced,
    activeSubjects: input.state.activeSubjects,
    activePeople: input.state.activePeople,
    activeEntities: input.state.activeEntities,
    activeConcepts: input.state.activeConcepts,
    activeTopic: input.state.activeTopic,
    activeTask: input.state.activeTask,
    selectedMemories: memoryResult.selected,
    rejectedMemories: memoryResult.rejected,
    ...(input.summary ? { conversationSummary: input.summary } : {}),
    hisEvidenceRefs: input.hisEvidenceRefs ?? [],
    provenance,
    reasons: ["current_request", ...(referenced.length ? ["explicit_or_resolved_reference"] : []), ...(memoryResult.selected.length ? ["ranked_memory"] : []), ...(recent.length ? ["bounded_recent_history"] : []), ...(input.summary ? ["long_conversation_summary"] : []), ...(input.hisEvidenceRefs?.length ? ["authorized_his_evidence"] : [])],
    charBudget,
    estimatedTokenBudget: Math.ceil(serialized.length / 4),
    serialized,
  };
}

export { SECTION_BUDGETS };
