export type LexicalLanguage = "es" | "en" | "de" | "ja" | "ko" | "ru" | "zh" | "cs" | "und";

export type LexicalProviderId = "his-domain" | "wiktionary" | "open-english-wordnet";

export type LexicalFormKind = "alias" | "inflection" | "plural" | "intent-phrase";

export interface LexicalSource {
  provider: LexicalProviderId;
  dataset: string;
  version: string;
  license: "HIS-Proprietary" | "CC-BY-SA/GFDL" | "CC-BY-4.0+Princeton-WordNet";
  derived: boolean;
  attribution: string;
  recordId?: string;
}

export interface LexicalForm {
  text: string;
  kind: LexicalFormKind;
}

export interface LexicalTranslation {
  language: LexicalLanguage;
  term: string;
  relation: "translation" | "intent-equivalent";
}

export interface LexicalEntry {
  id: string;
  canonical: string;
  language: LexicalLanguage;
  namespace: string;
  category: "domain" | "app" | "lore" | "intent" | "general";
  priority: number;
  partOfSpeech?: string;
  /** Optional normalized features supplied by Kaikki/OEWN shards. */
  morphology?: readonly string[];
  semanticHints?: readonly string[];
  forms: readonly LexicalForm[];
  synonyms: readonly string[];
  translations: readonly LexicalTranslation[];
  intentHints?: readonly string[];
  source: LexicalSource;
}

export interface LexicalScope {
  language?: LexicalLanguage;
  namespaces?: readonly string[];
  partOfSpeech?: string;
}

export type LexicalMatchKind = "canonical" | LexicalFormKind | "accent-folded" | "raw-fallback";

export interface LexicalMatch {
  original: string;
  normalized: string;
  canonical: string;
  language: LexicalLanguage;
  namespace: string;
  matchKind: LexicalMatchKind;
  entry: LexicalEntry | null;
  source: LexicalSource | null;
  ambiguous: boolean;
}

export interface LexicalTextMatch extends LexicalMatch {
  start: number;
  end: number;
}

export interface SynonymOptions extends LexicalScope {
  limit?: number;
}

export interface LexiconProvider {
  readonly id: LexicalProviderId;
  readonly priority: number;
  lookup(term: string, scope?: LexicalScope): readonly LexicalMatch[];
  matchText?(text: string, scope?: LexicalScope): readonly LexicalTextMatch[];
  getSynonyms?(term: string, options?: SynonymOptions): readonly LexicalMatch[];
  getTranslations?(term: string, scope?: LexicalScope): readonly LexicalTranslation[];
}

export type StopwordEffect = "zero-score" | "reduced-score" | "not-entity" | "not-primary-keyword";

export interface StopwordDecision {
  isStopword: boolean;
  weight: number;
  effects: readonly StopwordEffect[];
}

export interface LexicalQueryToken {
  original: string;
  normalized: string;
  canonical: string;
  language: LexicalLanguage;
  start: number;
  end: number;
  stopword: StopwordDecision;
  match: LexicalMatch;
  intentHints: readonly string[];
}

export interface LexicalQueryAnalysis {
  original: string;
  language: LexicalLanguage;
  tokens: readonly LexicalQueryToken[];
  significantTerms: readonly string[];
  entities: readonly LexicalMatch[];
  intentHints: readonly string[];
}
