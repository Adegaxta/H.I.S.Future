import type { LexicalLanguage } from "./types";

const COMBINING_MARKS = /\p{M}+/gu;
const NON_TERM_CHARACTERS = /[^\p{L}\p{N}_-]+/gu;

export interface NormalizedLexicalText {
  original: string;
  unicode: string;
  folded: string;
  accentFolded: string;
}

export class LexicalNormalizer {
  normalize(value: string, language: LexicalLanguage = "und"): NormalizedLexicalText {
    const original = value;
    const unicode = value.normalize("NFKC");
    const locale = language === "und" ? undefined : language;
    const folded = unicode
      .toLocaleLowerCase(locale)
      .replace(NON_TERM_CHARACTERS, " ")
      .replace(/\s+/g, " ")
      .trim();
    const accentFolded = folded.normalize("NFKD").replace(COMBINING_MARKS, "").normalize("NFKC");
    return { original, unicode, folded, accentFolded };
  }

  key(value: string, language: LexicalLanguage = "und"): string {
    return this.normalize(value, language).folded;
  }

  looseKey(value: string, language: LexicalLanguage = "und"): string {
    return this.normalize(value, language).accentFolded;
  }

  tokenize(value: string, language: LexicalLanguage = "und"): Array<{ original: string; normalized: string; start: number; end: number }> {
    const tokens: Array<{ original: string; normalized: string; start: number; end: number }> = [];
    for (const match of value.matchAll(/[\p{L}\p{M}\p{N}_-]+/gu)) {
      const original = match[0];
      const start = match.index ?? 0;
      tokens.push({ original, normalized: this.key(original, language), start, end: start + original.length });
    }
    return tokens;
  }
}

export const lexicalNormalizer = new LexicalNormalizer();

export function normalizeLexicalText(value: string, language: LexicalLanguage = "und"): string {
  return lexicalNormalizer.looseKey(value, language);
}
