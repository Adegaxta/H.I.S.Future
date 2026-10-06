import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { openLexiconDatabase, createWriter, writeEntry } from "./sqlite-writer.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1]] : null).filter(Boolean));
if (!args.input || !args.output || !args.language || !args.version) {
  throw new Error("Uso: node import-kaikki.mjs --input dump.jsonl[.gz] --output lexicon.sqlite --language es --version YYYY-MM-DD");
}

const source = createReadStream(args.input);
const decoded = String(args.input).endsWith(".gz") ? source.pipe(createGunzip()) : source;
const lines = createInterface({ input: decoded, crlfDelay: Infinity });
const database = openLexiconDatabase(args.output, { replace: process.argv.includes("--replace") });
const statements = createWriter(database);
let read = 0;
let kept = 0;
let peakRssBytes = process.memoryUsage().rss;
const started = performance.now();
const supportedTranslationLanguages = new Set(["es", "en", "de", "ja", "ko", "ru", "zh", "cs"]);

database.exec("BEGIN");
try {
  for await (const line of lines) {
    read += 1;
    if (read % 1_000 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const language = row.lang_code ?? row.language_code ?? args.language;
    if (language !== args.language || !row.word) continue;
    const senses = row.senses ?? [];
    const formOf = [...new Set(senses.flatMap((sense) => sense.form_of ?? []).map((item) => item?.word).filter(Boolean))];
    const canonicals = formOf.length > 0 ? formOf : [row.word];
    const sourceForms = (row.forms ?? []).flatMap((item) => item?.form && item.form !== row.word
      ? [{ text: item.form, kind: item.tags?.includes("plural") ? "plural" : "inflection" }]
      : []);
    const synonyms = [...new Set([...(row.synonyms ?? []), ...senses.flatMap((sense) => sense.synonyms ?? [])]
      .map((item) => typeof item === "string" ? item : item?.word).filter(Boolean))];
    const translations = [...new Map([...(row.translations ?? []), ...senses.flatMap((sense) => sense.translations ?? [])].flatMap((item) => {
      const term = item?.word ?? item?.term;
      const targetLanguage = item?.code ?? item?.lang_code;
      return term && supportedTranslationLanguages.has(targetLanguage)
        ? [[`${targetLanguage}:${term}`, { language: targetLanguage, term, relation: "translation" }]]
        : [];
    })).values()];
    for (const canonical of canonicals) {
      const forms = formOf.length > 0
        ? [{ text: row.word, kind: "inflection" }, ...sourceForms]
        : sourceForms;
      const idHash = createHash("sha256").update(`${language}\0${row.pos ?? ""}\0${canonical}`).digest("hex").slice(0, 20);
      writeEntry(statements, {
        id: `wiktionary:${language}:${idHash}`,
        canonical,
        language,
        namespace: "general",
        category: "general",
        priority: 20,
        partOfSpeech: row.pos,
        forms,
        synonyms,
        translations,
        source: {
          provider: "wiktionary",
          dataset: `Kaikki/Wiktionary ${args.language}`,
          recordId: row.id ?? `${row.word}:${row.pos ?? "unknown"}`,
          version: String(args.version),
          license: "CC-BY-SA/GFDL",
          attribution: "Wiktionary contributors; extracted with Wiktextract via Kaikki.org.",
          derived: true,
        },
      });
      kept += 1;
    }
  }
  statements.metadata.run(`wiktionary:${args.language}:version`, String(args.version));
  statements.metadata.run(`wiktionary:${args.language}:input`, basename(args.input));
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

console.log(JSON.stringify({ source: "wiktionary", language: args.language, read, kept, inputBytes: statSync(args.input).size, peakRssBytes, elapsedMs: Number((performance.now() - started).toFixed(2)) }));
