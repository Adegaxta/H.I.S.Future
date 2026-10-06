import { rmSync } from "node:fs";
import { extname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openLexiconDatabase(path, { replace = false } = {}) {
  if (replace) {
    if (extname(path).toLocaleLowerCase() !== ".sqlite") throw new Error("Refusing to replace a non-.sqlite output.");
    for (const candidate of [path, `${path}-wal`, `${path}-shm`]) rmSync(candidate, { force: true });
  }
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS lexical_source (
      id INTEGER PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      dataset TEXT NOT NULL,
      version TEXT NOT NULL,
      license TEXT NOT NULL,
      attribution TEXT NOT NULL,
      derived INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lexical_entry (
      id INTEGER PRIMARY KEY,
      stable_id TEXT NOT NULL UNIQUE,
      canonical TEXT NOT NULL,
      normalized TEXT NOT NULL,
      language TEXT NOT NULL,
      namespace TEXT NOT NULL,
      category TEXT NOT NULL,
      part_of_speech TEXT,
      priority INTEGER NOT NULL,
      source_id INTEGER NOT NULL REFERENCES lexical_source(id),
      source_record_id TEXT,
      UNIQUE(language, namespace, canonical, part_of_speech, source_record_id)
    );
    CREATE TABLE IF NOT EXISTS lexical_form (
      entry_id INTEGER NOT NULL REFERENCES lexical_entry(id),
      form TEXT NOT NULL,
      normalized TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (entry_id, normalized, kind)
    );
    CREATE TABLE IF NOT EXISTS lexical_synonym (
      entry_id INTEGER NOT NULL REFERENCES lexical_entry(id),
      synonym TEXT NOT NULL,
      normalized TEXT NOT NULL,
      rank INTEGER NOT NULL,
      PRIMARY KEY (entry_id, normalized)
    );
    CREATE TABLE IF NOT EXISTS lexical_translation (
      entry_id INTEGER NOT NULL REFERENCES lexical_entry(id),
      language TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      relation TEXT NOT NULL,
      PRIMARY KEY (entry_id, language, normalized)
    );
    CREATE TABLE IF NOT EXISTS dataset_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS lexical_entry_lookup ON lexical_entry(language, normalized, namespace);
    CREATE INDEX IF NOT EXISTS lexical_form_lookup ON lexical_form(normalized);
    CREATE INDEX IF NOT EXISTS lexical_translation_lookup ON lexical_translation(language, normalized);
  `);
  return database;
}

export function createWriter(database) {
  const source = database.prepare(`INSERT OR IGNORE INTO lexical_source
    (source_key, provider, dataset, version, license, attribution, derived) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const sourceId = database.prepare("SELECT id FROM lexical_source WHERE source_key = ?");
  const entry = database.prepare(`INSERT INTO lexical_entry
    (stable_id, canonical, normalized, language, namespace, category, part_of_speech, priority, source_id, source_record_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stable_id) DO UPDATE SET
      canonical=excluded.canonical, normalized=excluded.normalized, language=excluded.language,
      namespace=excluded.namespace, category=excluded.category, part_of_speech=excluded.part_of_speech,
      priority=excluded.priority, source_id=excluded.source_id
    RETURNING id`);
  const form = database.prepare(`INSERT OR IGNORE INTO lexical_form
    (entry_id, form, normalized, kind) VALUES (?, ?, ?, ?)`);
  const synonym = database.prepare(`INSERT OR IGNORE INTO lexical_synonym
    (entry_id, synonym, normalized, rank) VALUES (?, ?, ?, ?)`);
  const translation = database.prepare(`INSERT OR IGNORE INTO lexical_translation
    (entry_id, language, term, normalized, relation) VALUES (?, ?, ?, ?, ?)`);
  const metadata = database.prepare("INSERT OR REPLACE INTO dataset_metadata (key, value) VALUES (?, ?)");
  return { source, sourceId, entry, form, synonym, translation, metadata, sourceIds: new Map() };
}

export function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, " ").trim();
}

export function writeEntry(statements, value) {
  const sourceKey = `${value.source.provider}\0${value.source.dataset}\0${value.source.version}`;
  let sourceId = statements.sourceIds.get(sourceKey);
  if (sourceId === undefined) {
    statements.source.run(
      sourceKey, value.source.provider, value.source.dataset, value.source.version, value.source.license,
      value.source.attribution, value.source.derived ? 1 : 0,
    );
    sourceId = statements.sourceId.get(sourceKey).id;
    statements.sourceIds.set(sourceKey, sourceId);
  }
  const entryId = statements.entry.get(
    value.id, value.canonical, normalize(value.canonical), value.language, value.namespace,
    value.category, value.partOfSpeech ?? null, value.priority, sourceId, value.source.recordId ?? null,
  ).id;
  for (const item of value.forms ?? []) statements.form.run(entryId, item.text, normalize(item.text), item.kind);
  (value.synonyms ?? []).forEach((item, index) => statements.synonym.run(entryId, item, normalize(item), index));
  for (const item of value.translations ?? []) {
    statements.translation.run(entryId, item.language, item.term, normalize(item.term), item.relation ?? "translation");
  }
}
