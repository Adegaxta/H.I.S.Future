import { lexicalNormalizer } from "./LexicalNormalizer";
import type { LexicalLanguage, StopwordDecision, StopwordEffect } from "./types";

const ZERO_SCORE: readonly StopwordEffect[] = ["zero-score", "not-entity", "not-primary-keyword"];
const REDUCED_SCORE: readonly StopwordEffect[] = ["reduced-score", "not-entity", "not-primary-keyword"];

const WORDS: Readonly<Partial<Record<LexicalLanguage, Readonly<Record<string, readonly StopwordEffect[]>>>>> = {
  es: Object.fromEntries([
    ...["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "o", "para", "por", "que", "sin", "un", "una", "y"].map((word) => [word, ZERO_SCORE]),
    ...[
      "algo", "algun", "alguna", "algunos", "ano", "anos", "aqui", "asi", "antes", "cada", "como",
      "cual", "cuales", "cuando", "cuanto", "cuantos", "donde", "ella", "ellos", "era", "eran", "es",
      "esa", "ese", "eso", "esta", "este", "esto", "forma", "fue", "ha", "hay", "mas", "me", "mi",
      "mis", "murio", "muy", "pero", "porque", "quien", "quienes", "se", "segun", "ser", "sobre", "son",
      "su", "sus", "te", "tiene", "todo", "toda", "tu", "uno", "unos", "ya", "yo",
    ].map((word) => [word, REDUCED_SCORE]),
  ]),
  en: Object.fromEntries([
    ...["a", "an", "and", "for", "from", "in", "of", "on", "or", "the", "to", "with"].map((word) => [word, ZERO_SCORE]),
    ...["about", "all", "everything", "give", "is", "me", "what"].map((word) => [word, REDUCED_SCORE]),
  ]),
};

const NONE: StopwordDecision = { isStopword: false, weight: 1, effects: [] };

export class StopwordRegistry {
  decide(term: string, language: LexicalLanguage): StopwordDecision {
    const key = lexicalNormalizer.looseKey(term, language);
    const effects = WORDS[language]?.[key];
    if (!effects) return NONE;
    return { isStopword: true, weight: effects.includes("zero-score") ? 0 : 0.2, effects };
  }

  list(language: LexicalLanguage): readonly string[] {
    return Object.keys(WORDS[language] ?? {});
  }
}

export const hisStopwords = new StopwordRegistry();
