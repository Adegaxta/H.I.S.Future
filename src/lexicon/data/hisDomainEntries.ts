import type { LexicalEntry, LexicalSource } from "../types";

const HIS_SOURCE: LexicalSource = {
  provider: "his-domain",
  dataset: "HIS Domain Lexicon",
  version: "1.0.0",
  license: "HIS-Proprietary",
  derived: false,
  attribution: "Copyright Matias Escobedo; original H.I.S. Future project data.",
};

const domain = (
  id: string,
  canonical: string,
  namespace: string,
  category: LexicalEntry["category"],
  forms: LexicalEntry["forms"] = [],
  priority = 100,
): LexicalEntry => ({
  id,
  canonical,
  language: "es",
  namespace,
  category,
  priority,
  forms,
  synonyms: [],
  translations: [],
  source: HIS_SOURCE,
});

export const HIS_DOMAIN_ENTRIES: readonly LexicalEntry[] = [
  domain("his:lore:noosferon", "Noosferón", "lore", "lore", [
    { text: "Noosferones", kind: "plural" },
    { text: "Noosferon", kind: "alias" },
    { text: "Noosferons", kind: "plural" },
  ], 200),
  domain("his:lore:nodion", "Nodión", "lore", "lore", [
    { text: "Nodiones", kind: "plural" },
    { text: "Noodiones", kind: "alias" },
    { text: "Noodions", kind: "alias" },
    { text: "Nodion", kind: "alias" },
  ], 200),
  domain("his:lore:babel", "BABEL", "lore", "lore", [], 190),
  domain("his:lore:retterh", "Retterh", "lore", "lore", [], 190),
  domain("his:lore:noosfera", "Noosfera", "lore", "lore", [], 190),
  domain("his:lore:homeostasis-noetica", "Homeostasis Noética", "lore", "lore", [
    { text: "Homeostasis Noetica", kind: "alias" },
  ], 210),
  domain("his:app:nodo", "Nodo", "app", "app", [{ text: "Nodos", kind: "plural" }], 160),
  domain("his:lore:nodo", "Nodo", "lore", "lore", [{ text: "Nodos", kind: "plural" }], 150),
  {
    ...domain("his:intent:summary-es", "resumir", "intent", "intent", [
      { text: "resúmeme", kind: "intent-phrase" },
      { text: "resume", kind: "intent-phrase" },
      { text: "hazme un resumen", kind: "intent-phrase" },
      { text: "resumen", kind: "intent-phrase" },
      { text: "sintetiza", kind: "intent-phrase" },
      { text: "síntesis", kind: "intent-phrase" },
      { text: "condensa", kind: "intent-phrase" },
    ], 180),
    partOfSpeech: "verb",
    intentHints: ["summary"],
    translations: [{ language: "en", term: "summarize", relation: "intent-equivalent" }],
  },
  {
    id: "his:intent:summary-en",
    canonical: "summarize",
    language: "en",
    namespace: "intent",
    category: "intent",
    priority: 180,
    partOfSpeech: "verb",
    forms: [
      { text: "give me a summary", kind: "intent-phrase" },
      { text: "summary", kind: "intent-phrase" },
      { text: "overview", kind: "intent-phrase" },
      { text: "condense", kind: "intent-phrase" },
    ],
    synonyms: [],
    translations: [{ language: "es", term: "resumir", relation: "intent-equivalent" }],
    intentHints: ["summary"],
    source: HIS_SOURCE,
  },
];
