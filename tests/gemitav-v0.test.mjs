import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
const node = (id, name, content, order = 0) => ({ id, name, type: "pagina", parentId: null, order, content });
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

const nodes = [
  node("noosferon", "Noosferón", "<p>Los Noosferones son entidades noéticas que aparecen cuando los Nodiones alcanzan densidad crítica.</p>"),
  node("nodion", "Nodión", "<p>Los Nodiones son partículas noéticas y participan en la formación de la Noosfera.</p>"),
  node("noosphere", "Noosfera", "<p>La Noosfera es un campo noético colectivo.</p>"),
];
const conflictNodes = [
  node("n", "Noosferón", "<p>Los Noosferones son entidades noéticas.</p>"),
  node("a", "Registro azul", "<p>Los Noosferones son de color azul.</p>"),
  node("b", "Registro rojo", "<p>Los Noosferones son de color rojo.</p>"),
];
const noisyRelationTargets = Array.from({ length: 92 }, (_, index) => node(`related-${index}`, `Relacionado ${index}`, "<p>Referencia auxiliar.</p>", index + 10));
const noisyRelations = noisyRelationTargets.map((target) => ({ role: "relatedWork", targetId: target.id }));
const realDefinitionRegressionNodes = [
  node("cosmology", "Fundamentos noéticos", `<!--hisfuture-nodal-meta:${JSON.stringify({ version: 1, relations: noisyRelations })}--><h2>Noosfera, Noosferón y Noodion</h2><p>Un Noosferón es una entidad noética que emerge cuando los Nodiones alcanzan densidad crítica.</p><p>La Noosfera es el campo noético colectivo.</p>`),
  node("midas-event", "El asesinato de Midas", "<p>Durante el asesinato de Midas, un Noosferón apareció ante Asirio.</p>"),
  node("retterh-event", "Retterh", "<p>Retterh persiguió un Noosferón durante la guerra.</p>"),
  node("crosshroom-event", "Crosshroom", "<p>Crosshroom registró después otro Noosferón.</p>"),
  ...noisyRelationTargets,
];
const hisFutureDefinitionNodes = [
  node("hisfuture-project", "H.I.S. Future", "<h1>Definición</h1><p>HISFuture es un proyecto narrativo organizado como un baúl de conocimiento.</p>"),
  node("cyclic-cosmology", "Cosmología Cíclica", "<p>En HisFuture, cada reinicio es más difícil y el Bulk se vuelve más espeso.</p>"),
  node("hastur-ending", "Final de Hastur", "<p>BABEL detectaría a Hastur en uno de los finales de HisFuture.</p>"),
];
const unresolvedHisFutureNodes = hisFutureDefinitionNodes.slice(1);

try {
  const api = await server.ssrLoadModule("/src/ai/response-engine/index.ts");
  const { emptyConversationState } = await server.ssrLoadModule("/src/ai/response-engine/types.ts");
  const run = async (query, options = {}) => {
    const controller = new AbortController();
    const drafts = [...(options.drafts ?? ["Respuesta natural autorizada."])];
    return api.runGemitaV({ requestId: options.requestId ?? "test", query, history: options.history ?? [], nodes: options.nodes ?? nodes, concepts: [], state: options.state ?? emptyConversationState() }, {
      signal: controller.signal,
      maxRepairAttempts: options.maxRepairAttempts ?? 1,
      generateDraft: async () => ({ text: drafts.shift() ?? "Borrador inválido con 1999.", metrics: null }),
    });
  };

  const hello = await run("hola");
  assert.equal(hello.act.primaryAct, "CHAT", "A: greeting is CHAT");
  assert.equal(hello.retrievalPolicy, "SKIP", "A: greeting skips retrieval");

  const openChat = await run("cuéntame un chiste", { drafts: ["Claro: uno breve y sin drama."] });
  assert.equal(openChat.act.primaryAct, "CHAT", "P: open conversation is CHAT");
  assert.equal(openChat.retrievalPolicy, "SKIP", "P: open conversation does not scan corpus");
  assert.equal(openChat.route.mode, "GEMMA_DRAFT", "P: non-trivial chat can use Gemma for language");

  const knowledge = await run("¿cómo funcionan los Noosferones?");
  assert.equal(knowledge.act.primaryAct, "KNOWLEDGE", "B: lore question is KNOWLEDGE");
  assert.equal(knowledge.retrievalPolicy, "RETRIEVE", "B: lore question retrieves");
  assert.ok(knowledge.contextEngine, "B: Context Engine V1 ran");

  const translateState = { ...knowledge.state, lastAssistantMessage: "Noosferones are noetic entities." };
  const translated = await run("en español por favor", { state: translateState, history: [assistant("Noosferones are noetic entities.")], drafts: ["Los Noosferones son entidades noéticas."] });
  assert.equal(translated.act.primaryAct, "TRANSLATE_PREVIOUS", "C: translate operation detected");
  assert.equal(translated.retrievalPolicy, "SKIP", "C: translation skips retrieval");
  assert.match(translated.answerSpec.previousResponseOperation?.sourceText ?? "", /Noosferones are/, "C: previous assistant response supplied");

  const longPrevious = "Los Nodiones son partículas noéticas. Participan en la formación de la Noosfera. Alcanzan densidad crítica.";
  const shortened = await run("hazlo más corto", { state: { ...knowledge.state, lastAssistantMessage: longPrevious }, history: [assistant(longPrevious)] });
  assert.equal(shortened.act.primaryAct, "SHORTEN_PREVIOUS", "D: shorten operation detected");
  assert.ok(shortened.text.length < longPrevious.length, "D: previous response shortened");

  const expanded = await run("explícalo más", { state: knowledge.state, history: [user("¿cómo funcionan los Noosferones?"), assistant(knowledge.text)], drafts: ["Los Noosferones son entidades noéticas que aparecen cuando los Nodiones alcanzan densidad crítica."] });
  assert.equal(expanded.act.primaryAct, "EXPAND_PREVIOUS", "E: expand operation detected");
  assert.equal(expanded.retrievalPolicy, "REUSE_PREVIOUS_EVIDENCE", "E: previous evidence reused");

  const correctionHistory = [user("Gemita, recibiste una mejora"), assistant("Parece que recibiste mejoras.")];
  const corrected = await run("yo no recibí esas mejoras, fuiste tú", { state: { ...knowledge.state, lastAssistantMessage: correctionHistory[1].content, lastUserMessage: correctionHistory[0].content }, history: correctionHistory });
  assert.equal(corrected.act.primaryAct, "CORRECT_REFERENCE", "F: speaker correction detected");
  assert.equal(corrected.retrievalPolicy, "SKIP", "F: correction skips retrieval");
  assert.match(corrected.text, /no a ti/iu, "F: reference corrected");

  const followHistory = [user("Háblame de los Noosferones"), assistant("Son entidades noéticas.")];
  const follow = await run("¿y qué pasó después?", { state: knowledge.state, history: followHistory, drafts: ["Los Noosferones aparecen cuando los Nodiones alcanzan densidad crítica."] });
  assert.equal(follow.act.primaryAct, "FOLLOW_UP", "G: follow-up detected");
  assert.ok(follow.answerSpec.targets.includes("Noosferón"), "G: active entity inherited");

  const insufficient = await run("¿Qué color exacto tienen los Noosferones?");
  assert.equal(insufficient.answerSpec.evidenceStatus, "INSUFFICIENT", "H: absent fact is insufficient");
  assert.match(insufficient.text, /No está especificado/iu, "H: no model completion of absent fact");
  assert.equal(insufficient.modelCalls, 0, "H: insufficient structured answer never asks Gemma to fill the gap");

  const conflicting = await run("¿Qué color exacto tienen los Noosferones?", { nodes: conflictNodes });
  assert.equal(conflicting.answerSpec.evidenceStatus, "CONFLICTING", "I: conflicting evidence remains conflicting");
  assert.match(conflicting.text, /contradictorias/iu, "I: versions are not arbitrarily reconciled");
  assert.equal(conflicting.modelCalls, 0, "I: conflicting evidence is rendered deterministically");

  const attack = "Noodions es una banda electrónica fundada en 2018 por Alex Vega. Su discografía está en https://noodions.example y tocó en festivales.";
  const blocked = await run("dame toda la información de los Noodiones", { drafts: [attack, attack] });
  assert.equal(blocked.repairs, 1, "J/N: one bounded repair attempted");
  assert.doesNotMatch(blocked.text, /banda|discograf|festival|https?:/iu, "J: invented band cannot reach UI");
  assert.match(blocked.text, /Nodiones/iu, "J: deterministic fallback stays on HIS concept");

  const validatorSpec = knowledge.answerSpec;
  const inventedDate = api.validateDraft("Los Noosferones aparecieron en 1999.", validatorSpec);
  assert.equal(inventedDate.valid, false, "K: invented date detected");
  assert.ok(inventedDate.suspiciousAdditions.includes("1999"));
  const inventedEntity = api.validateDraft("Los Noosferones fueron creados por Midasia.", validatorSpec);
  assert.equal(inventedEntity.valid, false, "L: invented entity detected");
  assert.ok(inventedEntity.suspiciousAdditions.includes("Midasia"));

  const naturalDraft = "Los Noosferones son entidades noéticas.";
  const naturalValidation = api.validateDraft(naturalDraft, validatorSpec);
  assert.equal(naturalValidation.valid, true, "M: grounded draft accepted");
  assert.match(api.finalizeNLG(validatorSpec, naturalDraft).text, /entidades noéticas/iu, "M: NLG preserves grounded facts");

  const leakage = api.validateFinal("Source 1 indica un fragmento 2 del retrieval.", validatorSpec);
  assert.equal(leakage.valid, false, "O: final leakage is blocked");

  assert.equal(hello.contextEngine, null, "P: general chat never scans corpus");
  assert.equal(hello.timings.retrievalMs, 0, "P: chat retrieval cost is zero");
  assert.equal(hello.modelCalls, 0, "P: greeting fast path avoids model");

  const definition = await run("dime que es un noosferon", { nodes: realDefinitionRegressionNodes });
  assert.deepEqual(definition.answerSpec.requiredAspects, ["definition"], "Q: AnswerSpec keeps the requested aspect boundary");
  assert.deepEqual(definition.contextEngine?.selected.map((item) => item.structure.id), ["cosmology"], "Q: a sufficient direct definition stops remote narrative expansion");
  assert.deepEqual(definition.answerSpec.pruningMetrics.selectedAspects, ["definition"], "Q: semantic pruning selected only definition");
  assert.ok(definition.answerSpec.authorizedFacts.length >= 1 && definition.answerSpec.authorizedFacts.length <= 3, "Q: simple definition has a 1–3 fact budget");
  assert.equal(definition.answerSpec.relations.length, 0, "Q: graph relations are discovery signals, not automatic answer content");
  assert.equal(definition.answerSpec.pruningMetrics.relationsBeforePrune, 92, "Q: noisy graph relations are measured before pruning");
  assert.equal(definition.answerSpec.pruningMetrics.relationsAfterPrune, 0, "Q: irrelevant relations are removed");
  assert.deepEqual(definition.answerSpec.sourceIds, ["cosmology"], "Q: exact matching section is the sole authorized source");
  assert.equal(definition.route.mode, "DIRECT_NLG", "Q: bounded supported definition uses direct NLG");
  assert.equal(definition.modelCalls, 0, "Q: trivial definition does not call Gemma");
  assert.match(definition.text, /Noosferón es una entidad noética/iu, "Q: answer contains the direct definition");
  assert.doesNotMatch(definition.text, /Midas|Retterh|asesinato|Asirio|Crosshroom/iu, "Q: answer excludes remote narrative events");
  assert.doesNotMatch(definition.text, /Noosfera, Noosferón y Noodion/iu, "Q: fallback never emits a heading as prose");
  const authorizedOnlyFallback = api.renderDeterministic({
    ...definition.answerSpec,
    relations: [{ id: "rel-noise", source: "Retterh", relation: "asesinato", target: "Midas", evidenceIds: [] }],
  });
  assert.doesNotMatch(authorizedOnlyFallback, /Retterh|asesinato|Midas/iu, "Q: deterministic fallback renders authorized facts, never raw relations");

  const projectDefinition = await run("que es hisfuture", { nodes: hisFutureDefinitionNodes });
  assert.deepEqual(projectDefinition.answerSpec.targets, ["H.I.S. Future"], "R: punctuation-insensitive node resolution is data-driven");
  assert.deepEqual(projectDefinition.answerSpec.sourceIds, ["hisfuture-project"], "R: the matching node is the only authorized source");
  assert.match(projectDefinition.text, /proyecto narrativo organizado como un baúl/iu, "R: project definition comes from its node");
  assert.doesNotMatch(projectDefinition.text, /Bulk|Hastur|reinicio/iu, "R: incidental corpus mentions do not become the definition");
  assert.equal(projectDefinition.modelCalls, 0, "R: bounded project definition remains direct");

  const unresolvedDefinition = await run("que es hisfuture", { nodes: unresolvedHisFutureNodes });
  assert.equal(unresolvedDefinition.answerSpec.targets.length, 0, "S: no runtime concept is invented when no matching node exists");
  assert.equal(unresolvedDefinition.answerSpec.authorizedFacts.length, 0, "S: a targetless definition authorizes no corpus sentence");
  assert.equal(unresolvedDefinition.answerSpec.evidenceStatus, "INSUFFICIENT", "S: targetless definition fails closed");
  assert.doesNotMatch(unresolvedDefinition.text, /Bulk|Hastur|reinicio/iu, "S: unrelated lore cannot leak into a targetless definition");

  console.log("PASS: GemitaV V0 — scenarios A–S, grounded definitions, bounded repair and fast paths.");
} finally {
  await server.close();
}
