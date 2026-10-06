import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { openLexiconDatabase, createWriter, writeEntry } from "./sqlite-writer.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1]] : null).filter(Boolean));
if (!args.input || !args.output || !args.version) {
  throw new Error("Uso: node import-open-english-wordnet.mjs --input <directorio JSON extraído> --output lexicon.sqlite --version 2025");
}

const inputFiles = jsonFiles(args.input).filter((path) => {
  const name = basename(path);
  return !name.startsWith("entries-") && name !== "frames.json";
});
const database = openLexiconDatabase(args.output, { replace: process.argv.includes("--replace") });
const statements = createWriter(database);
let synsetsRead = 0;
let entriesKept = 0;
let peakRssBytes = process.memoryUsage().rss;
const started = performance.now();

database.exec("BEGIN");
try {
  for (const path of inputFiles) {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    for (const [synsetId, synset] of Object.entries(parsed)) {
      synsetsRead += 1;
      if (synsetsRead % 1_000 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      const members = [...new Set((synset.members ?? []).filter((member) => typeof member === "string" && member.trim()))];
      if (members.length === 0) continue;
      for (const canonical of members) {
        const idHash = createHash("sha256").update(`en\0${synset.partOfSpeech ?? ""}\0${synsetId}\0${canonical}`).digest("hex").slice(0, 20);
        writeEntry(statements, {
          id: `open-english-wordnet:en:${idHash}`,
          canonical,
          language: "en",
          namespace: "general",
          category: "general",
          priority: 10,
          partOfSpeech: synset.partOfSpeech,
          forms: [],
          synonyms: members.filter((member) => member !== canonical),
          translations: [],
          source: {
            provider: "open-english-wordnet",
            dataset: "Open English WordNet",
            recordId: synsetId,
            version: String(args.version),
            license: "CC-BY-4.0+Princeton-WordNet",
            attribution: "Open English WordNet Team and Princeton University WordNet.",
            derived: true,
          },
        });
        entriesKept += 1;
      }
    }
  }
  statements.metadata.run("open-english-wordnet:en:version", String(args.version));
  statements.metadata.run("open-english-wordnet:en:input", inputFiles.map((path) => basename(path)).join(","));
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

console.log(JSON.stringify({
  source: "open-english-wordnet",
  language: "en",
  synsetsRead,
  entriesKept,
  inputBytes: inputFiles.reduce((total, path) => total + statSync(path).size, 0),
  peakRssBytes,
  elapsedMs: Number((performance.now() - started).toFixed(2)),
}));

function jsonFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return jsonFiles(child);
    return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
  });
}
