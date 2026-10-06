import { lexicalNormalizer } from "../LexicalNormalizer";
import type {
  LexicalEntry,
  LexicalMatch,
  LexicalMatchKind,
  LexicalProviderId,
  LexicalScope,
  LexicalTextMatch,
  LexiconProvider,
  SynonymOptions,
} from "../types";

interface IndexedForm {
  entry: LexicalEntry;
  text: string;
  kind: Exclude<LexicalMatchKind, "accent-folded" | "raw-fallback">;
}

function inScope(entry: LexicalEntry, scope: LexicalScope): boolean {
  if (scope.language && scope.language !== "und" && entry.language !== scope.language) return false;
  if (scope.namespaces?.length && !scope.namespaces.includes(entry.namespace)) return false;
  if (scope.partOfSpeech && entry.partOfSpeech && entry.partOfSpeech !== scope.partOfSpeech) return false;
  return true;
}

export class HISDomainProvider implements LexiconProvider {
  private readonly exact = new Map<string, IndexedForm[]>();
  private readonly loose = new Map<string, IndexedForm[]>();
  private readonly phrases: IndexedForm[];

  constructor(
    readonly entries: readonly LexicalEntry[],
    readonly id: LexicalProviderId = "his-domain",
    readonly priority = 1_000,
  ) {
    const forms: IndexedForm[] = entries.flatMap((entry) => [
      { entry, text: entry.canonical, kind: "canonical" as const },
      ...entry.forms.map((form) => ({ entry, text: form.text, kind: form.kind })),
    ]);
    for (const form of forms) {
      this.add(this.exact, lexicalNormalizer.key(form.text, form.entry.language), form);
      this.add(this.loose, lexicalNormalizer.looseKey(form.text, form.entry.language), form);
    }
    this.phrases = forms
      .filter((form) => lexicalNormalizer.tokenize(form.text, form.entry.language).length > 1)
      .sort((left, right) => right.text.length - left.text.length || right.entry.priority - left.entry.priority);
  }

  lookup(term: string, scope: LexicalScope = {}): readonly LexicalMatch[] {
    const exactKey = lexicalNormalizer.key(term, scope.language);
    const exact = (this.exact.get(exactKey) ?? []).filter(({ entry }) => inScope(entry, scope));
    const candidates = exact.length > 0
      ? exact
      : (this.loose.get(lexicalNormalizer.looseKey(term, scope.language)) ?? []).filter(({ entry }) => inScope(entry, scope));
    const unique = [...new Map(candidates.map((candidate) => [candidate.entry.id, candidate])).values()]
      .sort((left, right) => right.entry.priority - left.entry.priority || left.entry.id.localeCompare(right.entry.id));
    const canonicalIds = new Set(unique.map(({ entry }) => `${entry.namespace}:${entry.canonical}`));
    return unique.map(({ entry, kind }) => ({
      original: term,
      normalized: lexicalNormalizer.looseKey(term, entry.language),
      canonical: entry.canonical,
      language: entry.language,
      namespace: entry.namespace,
      matchKind: exact.length > 0 ? kind : "accent-folded",
      entry,
      source: entry.source,
      ambiguous: canonicalIds.size > 1 || unique.length > 1,
    }));
  }

  matchText(text: string, scope: LexicalScope = {}): readonly LexicalTextMatch[] {
    const matches: LexicalTextMatch[] = [];
    for (const form of this.phrases) {
      if (!inScope(form.entry, scope)) continue;
      const escaped = form.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, "giu");
      for (const match of text.matchAll(expression)) {
        const original = match[2];
        const start = (match.index ?? 0) + match[1].length;
        const resolved = this.lookup(original, { ...scope, language: form.entry.language })
          .find((candidate) => candidate.entry?.id === form.entry.id);
        if (resolved) matches.push({ ...resolved, start, end: start + original.length });
      }
    }
    return matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  }

  getSynonyms(term: string, options: SynonymOptions = {}): readonly LexicalMatch[] {
    const limit = Math.max(0, Math.min(options.limit ?? 8, 32));
    const entry = this.lookup(term, options)[0]?.entry;
    if (!entry) return [];
    return entry.synonyms.slice(0, limit).map((synonym) => ({
      original: synonym,
      normalized: lexicalNormalizer.looseKey(synonym, entry.language),
      canonical: synonym,
      language: entry.language,
      namespace: entry.namespace,
      matchKind: "alias",
      entry,
      source: entry.source,
      ambiguous: false,
    }));
  }

  getTranslations(term: string, scope: LexicalScope = {}) {
    return this.lookup(term, scope)[0]?.entry?.translations ?? [];
  }

  private add(index: Map<string, IndexedForm[]>, key: string, value: IndexedForm): void {
    const values = index.get(key) ?? [];
    values.push(value);
    index.set(key, values);
  }
}
