import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const lu = await server.ssrLoadModule("/src/ai/language-understanding/index.ts");
  const conversation = await server.ssrLoadModule("/src/ai/conversation/index.ts");
  const response = await server.ssrLoadModule("/src/ai/response-engine/index.ts");
  const at = new Date("2026-09-29T12:00:00-05:00");
  const state = conversation.emptyPersistedConversationState("c1");
  const analyze = (text, id, recentMessages = [], customState = state) => lu.languageUnderstandingPipeline.analyze({ conversationId: "c1", messageId: id, text, role: "user", now: at, state: customState, recentMessages });

  const a = analyze("holaaa que tal sabes te voy a contar mi dia", "a");
  assert.equal(a.intents.value[0].intent, "SHARE_EXPERIENCE");
  assert.ok((a.intents.value.find((x) => x.intent === "TASK_DECLARATION")?.score ?? 0) <= 0.11);
  assert.ok((a.intents.value.find((x) => x.intent === "KNOWLEDGE_REQUEST")?.score ?? 0) <= 0.07);
  assert.equal(a.semanticFrame.value.tasks.length, 0);

  const b = analyze("voy a contarte algo", "b");
  assert.equal(b.grammar.value.communicationIntention, true);
  assert.equal(b.morphology.value.find((x) => x.surface === "contarte")?.lemma, "contar");
  assert.equal(b.semanticFrame.value.tasks.length, 0);

  const c = analyze("tengo que terminar el validator", "c");
  assert.equal(c.grammar.value.modality, "obligation");
  assert.equal(c.intents.value[0].intent, "TASK_DECLARATION");

  const d = analyze("creo que Ana vive en Madrid", "d");
  assert.equal(d.grammar.value.modality, "belief");
  assert.ok(d.semanticFrame.value.certainty < 0.7);

  const e = analyze("si mañana llueve no voy", "e");
  assert.equal(e.grammar.value.conditional, true);
  assert.equal(e.grammar.value.negated, true);
  assert.equal(e.temporal.value[0]?.resolvedValue, "2026-09-30");

  const personState = { ...state, activePeople: ["Ana"] };
  const f = analyze("ella me dijo eso ayer", "f", [], personState);
  assert.equal(f.references.value[0]?.target, "Ana");
  assert.equal(f.subject.value.selected, "Ana");

  const g = analyze("no, me refería a Ana", "g", [], personState);
  assert.equal(g.intents.value[0].intent, "CORRECTION");

  const j = analyze("yo prefiero respuestas cortas", "j");
  assert.equal(j.intents.value[0].intent, "PREFERENCE");
  assert.ok(conversation.applyMemoryPolicy({ conversationId: "c1", messageId: "j", text: "yo prefiero respuestas cortas", frame: j.semanticFrame.value, now: at }).records.length > 0);

  const turns = ["hola", "te voy a contar mi día", "primero fui a trabajar", "después vi a Ana", "pasó algo raro", "por qué crees que hizo eso?"];
  const expected = ["OPENING", "TOPIC_INTRODUCTION", "NARRATIVE_CONTINUATION", "NARRATIVE_CONTINUATION", "ELABORATION", "QUESTION_ON_TOPIC"];
  const recent = [];
  for (let i = 0; i < turns.length; i += 1) {
    const result = analyze(turns[i], `n${i}`, recent);
    assert.equal(result.discourse.value, expected[i], `turn ${i + 1}`);
    recent.push({ id: `n${i}`, sequence: i + 1, role: "user", content: turns[i] });
  }

  const spec = { conversationAct: "CHAT", scope: "CONVERSATION", depth: "brief", format: "prose", requiredAspects: [], authorizedFacts: [], relations: [], knownUnknowns: [], conflicts: [], evidenceStatus: "SUPPORTED", style: { useList: false } };
  const plan = response.buildResponsePlan(spec, b);
  assert.equal(plan.complexity, "SIMPLE_DETERMINISTIC");
  assert.equal(response.routeResponse(spec, plan).mode, "DIRECT_NLG");
  assert.match(response.deterministicNLGRenderer.render(plan, spec), /cu[eé]ntame|te escucho|te leo/iu);

  const cached = analyze("voy a contarte algo", "b");
  assert.equal(cached.cacheHit, true);
  console.log("HIS Language Understanding V1 tests passed: morphology, grammar, weighted intent, discourse, references, memory confidence, planning and cache.");
} finally { await server.close(); }
