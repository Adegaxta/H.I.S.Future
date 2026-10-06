import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";

const [wiktionaryPath, wordnetPath] = process.argv.slice(2);
if (!wiktionaryPath || !wordnetPath) throw new Error("Pass wiktionary.sqlite and open-english-wordnet.sqlite paths.");

const wiktionary = new DatabaseSync(wiktionaryPath, { readOnly: true });
const wordnet = new DatabaseSync(wordnetPath, { readOnly: true });
const exact = wiktionary.prepare("SELECT id, canonical FROM lexical_entry WHERE language = ? AND normalized = ? LIMIT 8");
const form = wiktionary.prepare("SELECT DISTINCT e.id, e.canonical FROM lexical_form f JOIN lexical_entry e ON e.id=f.entry_id WHERE f.normalized = ? LIMIT 8");
const translations = wiktionary.prepare("SELECT DISTINCT t.language, t.term FROM lexical_translation t JOIN lexical_entry e ON e.id=t.entry_id WHERE e.language = ? AND e.normalized = ? LIMIT 8");
const synonyms = wordnet.prepare("SELECT DISTINCT s.synonym FROM lexical_synonym s JOIN lexical_entry e ON e.id=s.entry_id WHERE e.language = ? AND e.normalized = ? ORDER BY s.rank LIMIT 8");
const queryTerms = ["resumeme", "toda", "informacion", "de", "los", "noosferones"];

const benchmark = (label, iterations, operation) => {
  for (let index = 0; index < 200; index += 1) operation();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) operation();
  const totalMs = performance.now() - started;
  return { label, iterations, totalMs: Number(totalMs.toFixed(3)), averageMs: Number((totalMs / iterations).toFixed(6)) };
};

const results = [
  benchmark("exact lemma", 10_000, () => exact.all("es", "resumir")),
  benchmark("form to lemma", 10_000, () => form.all("japoneses")),
  benchmark("synonyms", 10_000, () => synonyms.all("en", "summarize")),
  benchmark("translations", 10_000, () => translations.all("es", "resumir")),
  benchmark("query batch", 2_000, () => queryTerms.flatMap((term) => [...exact.all("es", term), ...form.all(term)])),
];

console.log(JSON.stringify({
  query: "resúmeme toda la información de los Noosferones",
  queryTerms,
  results,
  examples: {
    exact: exact.all("es", "resumir"),
    form: form.all("japoneses"),
    synonyms: synonyms.all("en", "summarize"),
    translations: translations.all("es", "resumir"),
  },
}, null, 2));

wiktionary.close();
wordnet.close();
