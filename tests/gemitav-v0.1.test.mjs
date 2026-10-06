import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const api = await server.ssrLoadModule("/src/ai/conversation/index.ts");
  const { validateDraft } = await server.ssrLoadModule("/src/ai/response-engine/DraftValidator.ts");
  const now = new Date("2026-09-29T12:00:00-05:00");
  const analyze = (text, id = "m1", conversationId = "a") => api.analyzeGeneralSemantics({ conversationId, messageId: id, text, role: "user", now });

  const event = analyze("ayer hablé con Ana en el trabajo");
  assert.ok(event.mentions.some((item) => item.semanticType === "PERSON" && item.surfaceText === "Ana"), "F: detects PERSON");
  assert.ok(event.mentions.some((item) => item.semanticType === "DATE" && item.temporalReference?.resolvedValue === "2026-09-28"), "F: resolves yesterday without losing surface form");
  assert.ok(event.mentions.some((item) => item.semanticType === "EVENT"), "F: detects EVENT");

  const preference = analyze("yo prefiero respuestas cortas", "m2");
  assert.equal(preference.subject, "USER", "G: resolves yo to USER");
  assert.ok(preference.mentions.some((item) => item.semanticType === "PREFERENCE"), "G: detects PREFERENCE");
  const write = api.applyMemoryPolicy({ conversationId: "a", messageId: "m2", text: "de ahora en adelante yo prefiero respuestas cortas", frame: analyze("de ahora en adelante yo prefiero respuestas cortas", "m2"), now });
  assert.equal(write.decision, "PERSISTENT", "G/O: durable preference is persisted");

  const assistant = api.analyzeGeneralSemantics({ conversationId: "a", messageId: "m3", text: "GemitaV respondió raro", role: "user", now });
  assert.ok(assistant.mentions.some((item) => item.semanticType === "ASSISTANT"), "H: detects ASSISTANT");
  assert.ok(assistant.mentions.some((item) => item.semanticType === "EVENT"), "H: detects assistant event");
  assert.equal(api.applyMemoryPolicy({ conversationId: "a", messageId: "assistant", text: "Ana vive en Madrid", frame: { ...assistant, speaker: "ASSISTANT" }, now }).decision, "IGNORE", "M: assistant output is not memory authority");

  const task = analyze("el martes termino el validator", "m4");
  assert.ok(task.mentions.some((item) => item.semanticType === "DATE"), "I: detects weekday");
  assert.ok(task.mentions.some((item) => item.semanticType === "TASK"), "I: detects task");

  const belief = analyze("creo que Ana vive en Madrid", "m5");
  assert.equal(belief.modality, "belief", "L: claim modality remains belief");
  assert.equal(api.applyMemoryPolicy({ conversationId: "a", messageId: "m5", text: "creo que Ana vive en Madrid", frame: belief, now }).records.filter((item) => item.memoryType === "ENTITY").length, 0, "L: mention does not become a fact");

  let state = api.emptyPersistedConversationState("a");
  state = { ...state, activePeople: ["Ana"], lastReferencedMessageIds: ["old-ana"] };
  const pronoun = analyze("¿qué fue lo que me dijo ella?", "m6");
  const resolved = api.resolveGeneralReferences({ text: "¿qué fue lo que me dijo ella?", frame: pronoun, state, recentMessages: [] });
  assert.deepEqual(resolved.resolvedSubjects, ["Ana"], "J: pronoun resolves to active antecedent");
  const corrected = api.resolveGeneralReferences({ text: "no, me refería a María", frame: analyze("no, me refería a María", "m7"), state, recentMessages: [] });
  assert.deepEqual(corrected.resolvedSubjects, ["María"], "K: explicit correction replaces active reference");

  const expired = { ...write.records[0], id: "expired", expiresAt: "2026-01-01T00:00:00Z" };
  const active = { ...write.records[0], id: "active", updatedAt: now.toISOString() };
  const retrieval = api.retrieveMemories({ conversationId: "a", frame: preference, query: "cómo prefiero las respuestas", records: [expired, active], now });
  assert.ok(retrieval.selected.some((item) => item.record.id === "active"), "N/P: relevant active memory retrieved");
  assert.ok(!retrieval.selected.some((item) => item.record.id === "expired"), "N: expired memory excluded");

  const recent = Array.from({ length: 12 }, (_, index) => ({ id: `recent-${index}`, sequence: 100 + index, role: index % 2 ? "assistant" : "user", content: `turno irrelevante ${index}` }));
  const oldAna = { id: "old-ana", sequence: 8, role: "user", content: "Ana me dijo que la reunión era mañana" };
  const context = api.assembleConversationContext({ conversationId: "a", currentMessage: "¿qué fue lo que me dijo ella?", semanticFrame: pronoun, state, recentMessages: recent, referencedMessages: [oldAna], memories: [active], charBudget: 1_600, hisEvidenceRefs: ["node-authority"] });
  assert.ok(context.serialized.includes("[CURRENT_REQUEST]"), "T: namespaced current request");
  assert.ok(context.serialized.includes("[MEMORY]"), "U: selected memory serialized separately");
  assert.ok(context.serialized.includes("[HIS_KNOWLEDGE]"), "S: HIS knowledge has a separate namespace");
  assert.ok(context.serialized.length <= 1_600, "T: context respects character budget");
  assert.ok(context.referencedMessages.some((item) => item.id === "old-ana"), "P: relevant old message is included");
  assert.ok(context.recentMessages.length <= 6, "E/U: bounded recent history only");

  const summary = api.buildIncrementalSummary({ conversationId: "a", messages: [{ id: "u", sequence: 1, role: "user", content: "yo prefiero respuestas cortas" }, { id: "bot", sequence: 2, role: "assistant", content: "Ana vive en Marte" }], now });
  assert.ok(summary.preferences.includes("respuestas cortas"), "R: summary records user preference");
  assert.ok(!summary.userStatements.some((item) => item.includes("Marte")), "R: summary never canonizes assistant output");

  const contextB = api.assembleConversationContext({ conversationId: "b", currentMessage: "hola", semanticFrame: analyze("hola", "b1", "b"), state: api.emptyPersistedConversationState("b"), recentMessages: [], referencedMessages: [], memories: [{ ...active, scope: "CONVERSATION" }], charBudget: 1_000 });
  assert.equal(contextB.selectedMemories.length, 0, "B/C/31: conversation memory does not cross conversations");

  const persistence = fs.readFileSync(new URL("../src-tauri/src/persistence.rs", import.meta.url), "utf8");
  assert.match(persistence, /CREATE VIRTUAL TABLE IF NOT EXISTS ai_messages_fts USING fts5/, "E/V: scalable FTS5 retrieval schema");
  assert.match(persistence, /ai_messages_conversation_sequence/, "D/V: sequence index exists");
  assert.match(persistence, /CHECK\(scope <> 'GLOBAL'\)/, "31: GLOBAL memory is disabled");

  const loreSpec = { scope: "LORE", authorizedFacts: [{ text: "Retterh murió en 701." }], relations: [], temporalFacts: [], metadataFacts: [], knownUnknowns: [], conflicts: [], targets: ["Retterh"], evidenceStatus: "SUPPORTED", unsupportedAspects: [], conversationContext: { serialized: "[MEMORY]\nEl usuario dijo que Retterh murió en 700." } };
  assert.equal(validateDraft("Retterh murió en 700.", loreSpec).valid, false, "S: memory cannot authorize a lore contradiction");

  console.log("GEMITAV V0.1 tests passed: semantics, references, memory policy/retrieval, summaries, isolation, budgets and SQLite indexes.");
} finally {
  await server.close();
}
