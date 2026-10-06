import type { LexicalQueryAnalysis, LexicalSource } from "../../lexicon";
import type { ContextMessage, PersistedConversationState, SemanticFrame, TemporalReference } from "../conversation/types";

export interface AnalysisValue<T> { value: T; confidence: number; reasons: string[]; provenance: string[] }

export type PragmaticIntent = "GREETING" | "SMALL_TALK" | "SHARE_EXPERIENCE" | "DISCLOSURE" | "OPINION" | "QUESTION" | "KNOWLEDGE_REQUEST" | "ACTION_REQUEST" | "TASK_DECLARATION" | "PREFERENCE" | "CORRECTION" | "CLARIFICATION" | "FOLLOW_UP" | "REWRITE" | "TRANSLATE" | "SHORTEN" | "EXPAND" | "META" | "CLOSURE";
export type DiscourseRole = "OPENING" | "TOPIC_INTRODUCTION" | "TOPIC_CONTINUATION" | "NARRATIVE_CONTINUATION" | "ELABORATION" | "QUESTION_ON_TOPIC" | "CLARIFICATION" | "CORRECTION" | "CONTRAST" | "DIGRESSION" | "RETURN_TO_TOPIC" | "CLOSURE";

export interface MorphologyFeature {
  surface: string;
  lemma: string;
  pos: string[];
  person?: 1 | 2 | 3;
  number?: "singular" | "plural";
  tense?: "present" | "past" | "future" | "imperfect";
  mood?: "indicative" | "subjunctive" | "imperative" | "infinitive" | "gerund" | "participle";
  clitics: string[];
  features: string[];
  provenance: (LexicalSource | { provider: "rule"; rule: string })[];
  confidence: number;
}

export interface GrammarSignals {
  explicitSubject: "USER" | "ASSISTANT" | string | null;
  implicitSubject: "USER" | "ASSISTANT" | null;
  mainVerb: string | null;
  auxiliaries: string[];
  negated: boolean;
  interrogative: boolean;
  imperative: boolean;
  conditional: boolean;
  causal: boolean;
  contrast: boolean;
  coordination: boolean;
  temporal: boolean;
  modality: "obligation" | "desire" | "intention" | "possibility" | "belief" | "certainty" | "neutral";
  communicationIntention: boolean;
  signals: string[];
}

export interface IntentScore { intent: PragmaticIntent; score: number; supportingSignals: string[] }
export interface ResolvedSubject { candidates: Array<{ subject: string; confidence: number; reason: string }>; selected: string | null }
export interface ResolvedReference { surface: string; target: string | null; confidence: number; reason: string; sourceMessageIds: string[] }

export interface LanguageUnderstandingResult {
  version: 1;
  normalizedText: AnalysisValue<string>;
  lexical: AnalysisValue<LexicalQueryAnalysis>;
  morphology: AnalysisValue<MorphologyFeature[]>;
  grammar: AnalysisValue<GrammarSignals>;
  semanticFrame: AnalysisValue<SemanticFrame>;
  intents: AnalysisValue<IntentScore[]>;
  discourse: AnalysisValue<DiscourseRole>;
  subject: AnalysisValue<ResolvedSubject>;
  references: AnalysisValue<ResolvedReference[]>;
  temporal: AnalysisValue<TemporalReference[]>;
  timings: Record<string, number>;
  confidence: number;
  cacheHit: boolean;
}

export interface LanguageUnderstandingInput {
  conversationId: string;
  messageId: string;
  text: string;
  role?: "user" | "assistant";
  now?: Date;
  state?: PersistedConversationState;
  recentMessages?: readonly ContextMessage[];
  recentFrames?: readonly SemanticFrame[];
}
