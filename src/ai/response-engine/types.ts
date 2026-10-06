import type { AIMessageMetrics } from "../types";
import type { ContextEngineResult, DesiredDepth, EvidenceStatus, QueryIntent, QueryScope, ResponseFormat } from "../context-engine";

export type ConversationAct =
  | "KNOWLEDGE"
  | "CHAT"
  | "META"
  | "FOLLOW_UP"
  | "REWRITE_PREVIOUS"
  | "TRANSLATE_PREVIOUS"
  | "SHORTEN_PREVIOUS"
  | "EXPAND_PREVIOUS"
  | "CORRECT_REFERENCE";

export type RetrievalPolicy = "RETRIEVE" | "REUSE_PREVIOUS_EVIDENCE" | "SKIP";
export type ResponseMode = "DIRECT_NLG" | "GEMMA_DRAFT";
export type ResponseLanguage = "es" | "en" | "und";

export interface ConversationActResult {
  primaryAct: ConversationAct;
  secondaryActs: ConversationAct[];
  language: ResponseLanguage;
  referencesPreviousUser: boolean;
  referencesPreviousAssistant: boolean;
  knowledgeRequired: boolean;
  retrievalPolicy: RetrievalPolicy;
  confidence: number;
  reasons: string[];
}

export interface PersonalityProfile {
  id: string;
  directness: number;
  informality: number;
  verbosity: number;
  humor: number;
  sarcasm: number;
  warmth: number;
  willingnessToChallengeUnsupportedAssumptions: number;
  instructions: string[];
}

export interface EvidenceRef {
  id: string;
  sourceId: string;
  text: string;
  kind: "content" | "metadata" | "relation" | "concept" | "previous_response";
}

export interface AuthorizedFact {
  id: string;
  semanticType: "claim" | "definition" | "attribute" | "previous_response";
  text: string;
  entityIds: string[];
  evidenceIds: string[];
  confidence: number;
}

export interface AuthorizedRelation {
  id: string;
  source: string;
  relation: string;
  target: string;
  evidenceIds: string[];
}

export interface AuthorizedTemporalFact {
  id: string;
  text: string;
  values: string[];
  evidenceIds: string[];
}

export interface AuthorizedMetadataFact {
  id: string;
  key: string;
  value: string | number | boolean | null;
  sourceId: string;
}

export interface PreviousResponseOperation {
  type: "REWRITE" | "TRANSLATE" | "SHORTEN" | "EXPAND" | "CORRECT_REFERENCE";
  sourceText: string;
  targetLanguage?: ResponseLanguage;
}

export interface AnswerSpec {
  requestId: string;
  scope: QueryScope | "CONVERSATION";
  conversationAct: ConversationAct;
  intents: QueryIntent[];
  language: ResponseLanguage;
  depth: DesiredDepth;
  format: ResponseFormat;
  targets: string[];
  requiredAspects: string[];
  evidenceStatus: EvidenceStatus;
  evidence: EvidenceRef[];
  authorizedFacts: AuthorizedFact[];
  relations: AuthorizedRelation[];
  temporalFacts: AuthorizedTemporalFact[];
  metadataFacts: AuthorizedMetadataFact[];
  unsupportedAspects: string[];
  knownUnknowns: string[];
  conflicts: string[];
  previousResponseOperation?: PreviousResponseOperation;
  style: { concise: boolean; natural: boolean; useHeadings: boolean; useList: boolean };
  personality: PersonalityProfile;
  sourceIds: string[];
  pruningMetrics: {
    answerSpecFactsBeforePrune: number;
    answerSpecFactsAfterPrune: number;
    relationsBeforePrune: number;
    relationsAfterPrune: number;
    selectedAspects: string[];
  };
  conversationContext?: import("../conversation/types").ActiveConversationContext;
}

export interface ResponseRoute {
  mode: ResponseMode;
  reason: string;
}

export interface DraftGenerationResult {
  text: string;
  metrics: AIMessageMetrics | null;
}

export interface ValidationResult {
  valid: boolean;
  unsupportedClaims: string[];
  missingRequiredAspects: string[];
  contradictions: string[];
  suspiciousAdditions: string[];
  sourceLeakage: string[];
  reasons: string[];
}

export interface RepairPlan {
  removeUnsupportedClaims: string[];
  addMissingAspects: string[];
  preserveClaims: string[];
  requiredUnknownStatements: string[];
}

export type SemanticUnit =
  | { kind: "heading"; text: string }
  | { kind: "claim"; factId: string; text: string }
  | { kind: "relation"; relationId: string; text: string }
  | { kind: "temporal"; temporalFactId: string; text: string }
  | { kind: "uncertainty"; text: string }
  | { kind: "conflict"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export interface FinalValidationResult {
  valid: boolean;
  reasons: string[];
  leakage: string[];
}

export interface ActivityEvent {
  requestId: string;
  phase: "resolve" | "retrieve" | "answer_spec" | "draft" | "validate" | "repair" | "nlg" | "final_validate";
  status: "started" | "finished" | "failed";
  userVisibleCandidate?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface GemitaVConversationState {
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
  activeEntities: string[];
  activeTopic: string | null;
  lastIntent: QueryIntent | null;
  lastScope: QueryScope | null;
  lastConversationAct: ConversationAct | null;
  lastAnswerSpec: AnswerSpec | null;
  lastEvidenceRefs: string[];
  lastResponseType: ResponseMode | null;
}

export interface GemitaVInput {
  requestId: string;
  query: string;
  history: readonly { role: "user" | "assistant"; content: string; error?: boolean; pending?: boolean }[];
  nodes: readonly import("../../types/nodes").NodeItem[];
  concepts: readonly import("../types").AIConcept[];
  state?: GemitaVConversationState;
  conversationContext?: import("../conversation/types").ActiveConversationContext;
  languageUnderstanding?: import("../language-understanding/types").LanguageUnderstandingResult;
}

export interface GemitaVDependencies {
  generateDraft: (messages: readonly import("../LocalAIClient").LocalAIChatMessage[], signal: AbortSignal, options?: { maxTokens?: number }) => Promise<DraftGenerationResult>;
  signal: AbortSignal;
  onActivity?: (event: ActivityEvent) => void;
  maxRepairAttempts?: number;
}

export interface GemitaVResult {
  text: string;
  state: GemitaVConversationState;
  act: ConversationActResult;
  retrievalPolicy: RetrievalPolicy;
  route: ResponseRoute;
  answerSpec: AnswerSpec;
  contextEngine: ContextEngineResult | null;
  validation: ValidationResult | null;
  finalValidation: FinalValidationResult;
  repairs: number;
  modelCalls: number;
  modelMetrics: AIMessageMetrics | null;
  timings: Record<string, number>;
  responsePlan?: import("./ResponsePlan").ResponsePlan;
  debug?: { rawAnswerSpec: AnswerSpec; rawGemmaDraft: string | null; finalRender: string };
}

export function emptyConversationState(): GemitaVConversationState {
  return {
    lastUserMessage: null,
    lastAssistantMessage: null,
    activeEntities: [],
    activeTopic: null,
    lastIntent: null,
    lastScope: null,
    lastConversationAct: null,
    lastAnswerSpec: null,
    lastEvidenceRefs: [],
    lastResponseType: null,
  };
}
