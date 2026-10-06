import { HIS_DOMAIN_ENTRIES } from "./data/hisDomainEntries";
import { LexiconService } from "./LexiconService";
import { HISDomainProvider } from "./providers/HISDomainProvider";
import { EnglishWordNetProvider, WiktionaryProvider } from "./providers/CompactDatasetProviders";

export const hisLexicon = new LexiconService([
  new HISDomainProvider(HIS_DOMAIN_ENTRIES),
  new WiktionaryProvider(),
  new EnglishWordNetProvider(),
]);

export { LexiconService } from "./LexiconService";
export { LexicalNormalizer, lexicalNormalizer, normalizeLexicalText } from "./LexicalNormalizer";
export { StopwordRegistry, hisStopwords } from "./StopwordRegistry";
export { HISDomainProvider } from "./providers/HISDomainProvider";
export { WiktionaryProvider, EnglishWordNetProvider } from "./providers/CompactDatasetProviders";
export type * from "./types";
