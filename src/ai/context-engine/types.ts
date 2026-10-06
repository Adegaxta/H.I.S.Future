import type { LexicalQueryAnalysis } from "../../lexicon";
import type { AINodeStructure, ExplicitNodeReference } from "../AINodeInspector";

export type QueryScope = "LORE" | "APP" | "MIXED" | "GENERAL";
export type QueryIntent = "FACT" | "SUMMARY" | "FULL_NODE" | "COMPARE" | "RELATIONS" | "STRUCTURE" | "TIMELINE" | "CAUSE" | "DEFINITION" | "FOLLOW_UP" | "GENERAL_EXPLANATION";
export type DesiredDepth = "brief" | "normal" | "detailed" | "exhaustive";
export type ResponseFormat = "prose" | "comparison" | "timeline" | "structured";
export type EvidenceStatus = "SUPPORTED" | "PARTIAL" | "INSUFFICIENT" | "CONFLICTING";

export interface TimedTrace<T> { value: T; timeMs: number }
export interface ScopeResolution { scope: QueryScope; confidence: number; reasons: string[] }
export interface ResolvedEntity { canonical: string; normalized: string; namespace: string; nodeIds: string[]; source: "explicit_reference" | "lexicon" | "node_name"; strength: "strong" | "medium" }
export interface IntentResolution { intents: QueryIntent[]; reasons: string[] }
export interface ConversationState { activeEntities: string[]; activeScope: QueryScope | null; recentTopics: string[]; lastIntent: QueryIntent | null; recentTargetIds: string[] }
export interface MemoryResolution { state: ConversationState; effectiveQuery: string; inheritedEntities: string[]; inheritanceReason: string | null; modelHistory: { role: "user" | "assistant"; content: string }[] }
export interface QueryPlan { targets: ResolvedEntity[]; aspects: string[]; scope: QueryScope; desiredDepth: DesiredDepth; intents: QueryIntent[] }

export interface StructuralChunk {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  section: string | null;
  headingLevel: number | null;
  position: number;
  text: string;
  normalizedText: string;
  entities: string[];
  callTargetIds: string[];
}

export interface RankedCandidate {
  chunk: StructuralChunk;
  score: number;
  reasons: string[];
  matchedTerms: string[];
}

export interface SelectedContext {
  structure: AINodeStructure;
  targetReason: string;
  contentMode: "none" | "chunk" | "section" | "full" | "structural_map";
  content: string;
  chunks: StructuralChunk[];
  score: number;
  rankingReasons: string[];
}

export interface EvidenceAssessment { status: EvidenceStatus; reasons: string[]; supportedAspects: string[]; missingAspects: string[]; conflictingClaims: string[] }
export interface ResponsePlan { depth: DesiredDepth; format: ResponseFormat; requiredAspects: string[] }
export interface ContextBudget { totalChars: number; instructionsChars: number; conversationChars: number; contentChars: number; metadataChars: number; responseReserveChars: number; estimatedInputTokens: number }

export interface ContextEngineInput {
  query: string;
  history: readonly { role: "user" | "assistant"; content: string; error?: boolean; pending?: boolean }[];
  nodes: readonly import("../../types/nodes").NodeItem[];
  concepts?: readonly import("../types").AIConcept[];
}

export interface ContextEngineTrace {
  originalQuery: string;
  normalizedQuery: string;
  lexical: TimedTrace<LexicalQueryAnalysis>;
  scope: TimedTrace<ScopeResolution>;
  memory: TimedTrace<MemoryResolution>;
  references: TimedTrace<ExplicitNodeReference[]>;
  entities: TimedTrace<ResolvedEntity[]>;
  intent: TimedTrace<IntentResolution>;
  plan: TimedTrace<QueryPlan>;
  retrieval: TimedTrace<{ candidateCount: number; candidates: RankedCandidate[] }>;
  graph: TimedTrace<{ edgeCount: number; expandedNodeIds: string[] }>;
  expansion: TimedTrace<SelectedContext[]>;
  evidence: TimedTrace<EvidenceAssessment>;
  context: TimedTrace<{ chars: number; budget: ContextBudget }>;
}

export interface ContextEngineResult {
  context: string | null;
  modelHistory: { role: "user" | "assistant"; content: string }[];
  scope: ScopeResolution;
  memory: MemoryResolution;
  references: ExplicitNodeReference[];
  entities: ResolvedEntity[];
  intents: IntentResolution;
  plan: QueryPlan;
  selected: SelectedContext[];
  evidence: EvidenceAssessment;
  responsePlan: ResponsePlan;
  budget: ContextBudget;
  trace: ContextEngineTrace;
}
