import { lexicalNormalizer } from "./LexicalNormalizer";
import { hisStopwords, StopwordRegistry } from "./StopwordRegistry";
import type {
  LexicalLanguage,
  LexicalMatch,
  LexicalQueryAnalysis,
  LexicalQueryToken,
  LexicalScope,
  LexiconProvider,
  SynonymOptions,
} from "./types";

const FALLBACK_SOURCE = null;

function rawFallback(term: string, language: LexicalLanguage): LexicalMatch {
  return {
    original: term,
    normalized: lexicalNormalizer.looseKey(term, language),
    canonical: term.normalize("NFKC"),
    language,
    namespace: "raw",
    matchKind: "raw-fallback",
    entry: null,
    source: FALLBACK_SOURCE,
    ambiguous: false,
  };
}

export class LexiconService {
  private readonly providers: readonly LexiconProvider[];

  constructor(providers: readonly LexiconProvider[], private readonly stopwords: StopwordRegistry = hisStopwords) {
    this.providers = [...providers].sort((left, right) => right.priority - left.priority);
  }

  lookup(term: string, scope: LexicalScope = {}): readonly LexicalMatch[] {
    for (const provider of this.providers) {
      const matches = provider.lookup(term, scope);
      if (matches.length > 0) return matches;
    }
    return [rawFallback(term, scope.language ?? "und")];
  }

  resolve(term: string, scope: LexicalScope = {}): LexicalMatch {
    return this.lookup(term, scope)[0];
  }

  getSynonyms(term: string, options: SynonymOptions = {}): readonly LexicalMatch[] {
    const limit = Math.max(0, Math.min(options.limit ?? 8, 32));
    const matches: LexicalMatch[] = [];
    for (const provider of this.providers) {
      if (!provider.getSynonyms) continue;
      for (const match of provider.getSynonyms(term, { ...options, limit: limit - matches.length })) {
        if (!matches.some((current) => current.normalized === match.normalized && current.language === match.language)) matches.push(match);
        if (matches.length === limit) return matches;
      }
    }
    return matches;
  }

  getTranslations(term: string, scope: LexicalScope = {}) {
    for (const provider of this.providers) {
      const translations = provider.getTranslations?.(term, scope) ?? [];
      if (translations.length > 0) return translations;
    }
    return [];
  }

  analyzeQuery(query: string, scope: LexicalScope = {}): LexicalQueryAnalysis {
    const language = scope.language ?? this.inferLanguage(query);
    const phraseMatches = this.providers.flatMap((provider) => provider.matchText?.(query, { ...scope, language: undefined }) ?? [])
      .sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start);
    const selectedPhrases = phraseMatches.filter((candidate, index, all) =>
      !all.slice(0, index).some((selected) => candidate.start < selected.end && candidate.end > selected.start),
    );
    const covered = (start: number, end: number) => selectedPhrases.some((phrase) => start >= phrase.start && end <= phrase.end);
    const tokens: LexicalQueryToken[] = [];

    for (const phrase of selectedPhrases) tokens.push(this.toToken(phrase.original, phrase.start, phrase.end, phrase, language));
    for (const token of lexicalNormalizer.tokenize(query, language)) {
      if (covered(token.start, token.end)) continue;
      const match = this.resolve(token.original, { ...scope, language: undefined });
      tokens.push(this.toToken(token.original, token.start, token.end, match, language));
    }
    tokens.sort((left, right) => left.start - right.start);

    const significantTerms = [...new Set(tokens
      .filter((token) =>
        token.stopword.weight > 0
        && !token.stopword.effects.includes("not-primary-keyword")
        && token.normalized.length >= 3
        && token.match.entry?.category !== "intent",
      )
      .map((token) => lexicalNormalizer.looseKey(token.canonical, token.language)))];
    const entities = tokens
      .map((token) => token.match)
      .filter((match) => match.entry !== null && !["intent", "general"].includes(match.entry.category));
    const intentHints = [...new Set(tokens.flatMap((token) => token.intentHints))];
    return { original: query, language, tokens, significantTerms, entities, intentHints };
  }

  private toToken(original: string, start: number, end: number, match: LexicalMatch, queryLanguage: LexicalLanguage): LexicalQueryToken {
    const language = match.language === "und" ? queryLanguage : match.language;
    return {
      original,
      normalized: lexicalNormalizer.looseKey(original, language),
      canonical: match.canonical,
      language,
      start,
      end,
      stopword: this.stopwords.decide(original, queryLanguage),
      match,
      intentHints: match.entry?.intentHints ?? [],
    };
  }

  private inferLanguage(query: string): LexicalLanguage {
    if (/\p{Script=Hangul}/u.test(query)) return "ko";
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(query)) return "ja";
    if (/\p{Script=Han}/u.test(query)) return "zh";
    if (/\p{Script=Cyrillic}/u.test(query)) return "ru";
    const tokens = lexicalNormalizer.tokenize(query).map((token) => token.normalized);
    const enScore = tokens.filter((token) => this.stopwords.decide(token, "en").isStopword).length;
    const esScore = tokens.filter((token) => this.stopwords.decide(token, "es").isStopword).length;
    return enScore > esScore ? "en" : "es";
  }
}
