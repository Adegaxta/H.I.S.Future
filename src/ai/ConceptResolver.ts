import type { AIConcept } from "./types";
import { hisLexicon, normalizeLexicalText } from "../lexicon";

const normalize = (value: string) => normalizeLexicalText(value);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalize(term).trim();
  if (!normalizedTerm) return false;
  const boundary = "[^\\p{L}\\p{N}_]";
  return new RegExp(`(^|${boundary})${escapeRegExp(normalizedTerm)}($|${boundary})`, "u").test(text);
}

export function resolveAIConcepts(query: string, concepts: readonly AIConcept[]): AIConcept[] {
  const normalizedQuery = normalize(query);
  const canonicalTerms = hisLexicon.analyzeQuery(query).tokens.map((token) => normalize(token.canonical));
  return concepts.filter((concept) =>
    [concept.name, ...(concept.aliases ?? [])].some((term) =>
      containsTerm(normalizedQuery, term) || canonicalTerms.includes(normalize(term)),
    ),
  );
}
