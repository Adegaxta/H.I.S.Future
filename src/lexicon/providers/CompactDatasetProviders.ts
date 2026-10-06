import { HISDomainProvider } from "./HISDomainProvider";
import type { LexicalEntry } from "../types";

/**
 * Adapter for bounded, generated shards. The importer owns the source schema;
 * the runtime only sees HIS LexicalEntry records with provenance retained.
 */
export class WiktionaryProvider extends HISDomainProvider {
  constructor(entries: readonly LexicalEntry[] = []) {
    super(entries.filter((entry) => entry.source.provider === "wiktionary"), "wiktionary", 200);
  }
}

export class EnglishWordNetProvider extends HISDomainProvider {
  constructor(entries: readonly LexicalEntry[] = []) {
    super(
      entries.filter((entry) => entry.language === "en" && entry.source.provider === "open-english-wordnet"),
      "open-english-wordnet",
      100,
    );
  }
}
