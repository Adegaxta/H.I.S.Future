import type { AnswerSpec, ConversationAct, ResponseMode } from "../response-engine/types";

export type SemanticType =
  | "PERSON" | "SELF" | "ASSISTANT" | "PLACE" | "DATE" | "TIME" | "EVENT"
  | "OBJECT" | "CONCEPT" | "PROJECT" | "ORGANIZATION" | "TASK" | "PREFERENCE"
  | "DECISION" | "RELATION" | "REFERENCE" | "CORRECTION" | "OTHER";

export type SemanticSubject = "USER" | "ASSISTANT" | string;

export interface TemporalReference {
  surfaceText: string;
  resolvedValue: string | null;
  resolution: "exact" | "relative" | "ambiguous";
  anchorDate: string;
}

export interface SemanticMention {
  id: string;
  conversationId: string;
  messageId: string;
  surfaceText: string;
  normalizedValue: string;
  semanticType: SemanticType;
  subject?: SemanticSubject;
  relation?: string;
  object?: string;
  temporalReference?: TemporalReference;
  confidence: number;
  canonicalNodeId?: string;
  source: "rule" | "lexicon" | "context" | "his-resolution";
  modality?: "assertion" | "belief" | "question" | "correction";
}

export interface SemanticFrame {
  speaker: "USER" | "ASSISTANT";
  subject: SemanticSubject;
  mentions: SemanticMention[];
  people: string[];
  places: string[];
  concepts: string[];
  tasks: string[];
  references: string[];
  modality: "assertion" | "belief" | "question" | "correction";
  communicativeAct?: string;
  discourseRole?: string;
  addressee?: SemanticSubject;
  predicate?: string;
  object?: string;
  indirectObject?: string;
  events?: string[];
  preferences?: string[];
  decisions?: string[];
  temporalReferences?: TemporalReference[];
  relations?: Array<{ source: string; relation: string; target: string; confidence: number }>;
  polarity?: "positive" | "negative";
  certainty?: number;
  knowledgeRequest?: boolean;
  actionRequest?: boolean;
  socialIntent?: boolean;
  confidence?: number;
  provenance?: string[];
}

export interface PersistedConversationState {
  conversationId: string;
  activeSubjects: string[];
  activePeople: string[];
  activeEntities: string[];
  activeConcepts: string[];
  activeTopic: string | null;
  activeTask: string | null;
  lastIntent: string | null;
  lastScope: string | null;
  lastConversationAct: ConversationAct | null;
  lastUserMessageId: string | null;
  lastAssistantMessageId: string | null;
  lastReferencedMessageIds: string[];
  lastAnswerSpecRef: string | null;
  lastEvidenceRefs: string[];
  currentLanguage: string | null;
  updatedAt: string;
}

export type MemoryType = "CONVERSATION" | "EPISODIC" | "ENTITY" | "TASK" | "PREFERENCE" | "DECISION" | "PROJECT" | "GLOBAL";
export type MemoryScope = "SESSION_ONLY" | "CONVERSATION" | "PROJECT" | "PERSISTENT" | "GLOBAL";
export type MemoryWriteDecision = "IGNORE" | "SESSION_ONLY" | "CONVERSATION" | "PERSISTENT";

export interface MemoryRecord {
  id: string;
  memoryType: MemoryType;
  scope: MemoryScope;
  subject: string;
  predicate?: string;
  value: string;
  sourceConversationId: string;
  sourceMessageIds: string[];
  relatedMentionIds: string[];
  relatedNodeIds: string[];
  createdAt: string;
  updatedAt: string;
  confidence: number;
  priority: number;
  expiresAt?: string;
  supersededBy?: string;
}

export interface ConversationSummaryRecord {
  id: string;
  conversationId: string;
  version: number;
  people: string[];
  places: string[];
  concepts: string[];
  topics: string[];
  userStatements: string[];
  preferences: string[];
  decisions: string[];
  tasks: string[];
  events: string[];
  unresolvedQuestions: string[];
  sourceSequenceStart: number;
  sourceSequenceEnd: number;
  createdAt: string;
}

export interface ContextMessage {
  id: string;
  sequence: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface RetrievedMemory {
  record: MemoryRecord;
  score: number;
  reasons: string[];
  provenance: string;
}

export interface ActiveConversationContext {
  currentMessage: string;
  semanticFrame: SemanticFrame;
  recentMessages: ContextMessage[];
  referencedMessages: ContextMessage[];
  activeSubjects: string[];
  activePeople: string[];
  activeEntities: string[];
  activeConcepts: string[];
  activeTopic: string | null;
  activeTask: string | null;
  selectedMemories: RetrievedMemory[];
  rejectedMemories: RetrievedMemory[];
  conversationSummary?: ConversationSummaryRecord;
  hisEvidenceRefs: string[];
  provenance: string[];
  reasons: string[];
  charBudget: number;
  estimatedTokenBudget: number;
  serialized: string;
}

export interface ConversationRecord {
  id: string;
  projectId?: string | null;
  vaultId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  messageCount: number;
}

export interface PersistedMessage extends ContextMessage {
  conversationId: string;
  responseType?: ResponseMode;
  operation?: string;
  pipeline?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextAssemblyInput {
  conversationId: string;
  currentMessage: string;
  semanticFrame: SemanticFrame;
  state: PersistedConversationState;
  recentMessages: ContextMessage[];
  referencedMessages: ContextMessage[];
  memories: MemoryRecord[];
  summary?: ConversationSummaryRecord;
  hisEvidenceRefs?: string[];
  answerSpec?: AnswerSpec | null;
  charBudget?: number;
}
