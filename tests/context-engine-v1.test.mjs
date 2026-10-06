import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
const node = (id, name, content = "<p><br></p>", order = 0) => ({ id, name, type: "pagina", parentId: null, order, content });
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

try {
  const { runContextEngine } = await server.ssrLoadModule("/src/ai/context-engine/ContextEngine.ts");
  const nodes = [
    node("noosphere", "Noosfera", "<h1>Definición</h1><p>La Noosfera es el campo noético colectivo.</p><h2>Funcionamiento</h2><p>Se forma mediante Nodiones y Noosferones.</p>"),
    node("nodion", "Nodión", "<p>Un Nodión participa en la formación de la Noosfera.</p>"),
    node("noosferon", "Noosferón", "<p>Los Noosferones aparecen cuando los Nodiones alcanzan densidad crítica. Su color no está documentado.</p>"),
    node("retterh", "Retterh", "<h1>Vida</h1><p>Retterh fue un explorador.</p><h2>Ascensión</h2><p>Después viajó a Midasia durante la Ascensión.</p>"),
    node("midas", "Midas", "<p>Midas fue aliado de Retterh.</p>"),
    node("relation", "Crónica de la alianza", '<p><span data-mention-id="retterh">Retterh</span> conoció a <span data-mention-id="midas">Midas</span> y ambos sellaron una alianza.</p>'),
    node("numbers", "Patrones numéricos", "<p>El número 4 aparece como medida y como símbolo ritual.</p>"),
    node("homeostasis", "Homeostasis Noética", "<p>La Homeostasis Noética estabiliza el campo.</p>"),
  ];
  const run = (query, history = [], corpus = nodes) => runContextEngine({ query, history, nodes: corpus, concepts: [] });

  const lore = run("Explícame al completo la Noosfera en el universo de HISFuture");
  assert.equal(lore.scope.scope, "LORE", "test 1: lore scope");
  assert.doesNotMatch(lore.context, /\[HIS_DOCUMENT_METADATA\]/, "test 1: lore excludes app metadata");
  assert.equal(lore.responsePlan.depth, "exhaustive");

  const app = run("¿Qué tipo de Nodo es Noosfera?");
  assert.equal(app.scope.scope, "APP", "test 2: app scope");
  assert.match(app.context, /\[HIS_DOCUMENT_METADATA\]/);

  const mixed = run("¿Qué dice el Nodo Noosfera sobre la Noosfera del lore?");
  assert.equal(mixed.scope.scope, "MIXED", "test 3: mixed scope");
  assert.match(mixed.context, /\[HIS_LORE_SOURCE/);
  assert.match(mixed.context, /\[HIS_DOCUMENT_METADATA\]/);

  const follow = run("¿y qué pasó después?", [user("Háblame de Retterh"), assistant("Retterh fue un explorador.")]);
  assert.deepEqual(follow.memory.inheritedEntities, ["Retterh"], "test 4: dependent follow-up inherits");
  assert.match(follow.memory.effectiveQuery, /Retterh/);
  assert.equal(follow.modelHistory.length, 2);

  const selfContained = run("¿Dónde aparece el número 4 y qué papel cumple en cada caso?", [user("Háblame de Homeostasis Noética"), assistant("Es un mecanismo.")]);
  assert.deepEqual(selfContained.memory.inheritedEntities, [], "test 5: self-contained query does not inherit");
  assert.doesNotMatch(selfContained.memory.effectiveQuery, /Homeostasis/u);
  assert.equal(selfContained.modelHistory.length, 0);

  const emptyCorpus = [
    node("retterh-empty", "Retterh", "<p><br></p>"),
    node("retterh-life", "Vida de Retterh", "<p>Retterh nació durante la Ascensión y recorrió Midasia.</p>"),
    node("retterh-call", "Crónica", '<p><span data-mention-id="retterh-empty">Retterh</span> murió tras la campaña.</p>'),
  ];
  const empty = run("Háblame de Retterh", [], emptyCorpus);
  const emptyTarget = empty.selected.find((item) => item.structure.id === "retterh-empty");
  assert.equal(emptyTarget?.contentMode, "none", "test 6: empty exact node is metadata only");
  assert.ok(empty.selected.some((item) => item.content.length > 0), "test 6: useful content still selected");

  const color = run("¿Qué color exacto tienen los Noosferones?");
  assert.equal(color.evidence.status, "INSUFFICIENT", "test 7: related text is not color evidence");
  assert.match(color.context, /HIS no lo especifica/);

  const compound = run("Explica la Homeostasis Noética");
  assert.deepEqual(compound.entities.map((entity) => entity.canonical), ["Homeostasis Noética"], "test 8: longest compound wins");

  const full = run("@Retterh dime toda la información de este Nodo");
  assert.ok(full.plan.intents.includes("FULL_NODE"), "test 9: full-node intent");
  assert.equal(full.selected.find((item) => item.structure.id === "retterh")?.contentMode, "full");

  const summary = run("resúmeme todo sobre los Noosferones");
  assert.ok(summary.plan.intents.includes("SUMMARY"), "test 10: Spanish summary hint");
  assert.ok(summary.entities.some((entity) => entity.canonical === "Noosferón"));
  assert.ok(["detailed", "exhaustive"].includes(summary.responsePlan.depth));

  const english = run("summarize everything about Noosferones");
  assert.ok(english.plan.intents.includes("SUMMARY"), "test 11: English equivalent intent");
  assert.ok(english.entities.some((entity) => entity.canonical === "Noosferón"));

  const relations = run("¿Qué relación tienen Retterh y Midas?");
  assert.ok(relations.plan.intents.includes("RELATIONS"), "test 12: relation intent");
  assert.ok(relations.selected.some((item) => item.structure.id === "relation"), "test 12: explicit call document selected");
  assert.ok(relations.trace.retrieval.value.candidates.some((candidate) => candidate.reasons.includes("graph_call")), "test 12: calls influence rank");

  const generic = run("¿Qué tiene que ocurrir para que aparezca un Noosferón?");
  assert.deepEqual(generic.entities.map((entity) => entity.canonical), ["Noosferón"], "test 13: generic words are not entities");

  const multi = run("Explica qué es la Noosfera, cómo funciona y cómo se relaciona con Nodiones y Noosferones");
  assert.ok(multi.plan.aspects.includes("definition"), "test 14: definition aspect");
  assert.ok(multi.plan.aspects.includes("functioning"), "test 14: functioning aspect");
  assert.ok(multi.plan.aspects.includes("relations"), "test 14: relations aspect");

  const conflictCorpus = [
    node("noosferon", "Noosferón", "<p>Los Noosferones son entidades noéticas.</p>"),
    node("color-a", "Registro A", "<p>Los Noosferones son de color azul.</p>"),
    node("color-b", "Registro B", "<p>Los Noosferones son de color rojo.</p>"),
  ];
  const contradiction = run("¿Qué color exacto tienen los Noosferones?", [], conflictCorpus);
  assert.equal(contradiction.evidence.status, "CONFLICTING", "test 15: incompatible canon is not reconciled");
  assert.match(contradiction.context, /no elijas ni reconcilies/);

  const longHistory = Array.from({ length: 16 }, (_, index) => index % 2 ? assistant(`Respuesta ${index}`) : user(`Pregunta ${index} sobre Noosferones`));
  const switched = run("Háblame de Retterh", longHistory);
  assert.equal(switched.modelHistory.length, 0, "self-contained entity switches send no old model history");
  assert.ok(switched.modelHistory.length <= 4, "model history is bounded");
  assert.ok(lore.context.length <= 15_000, "serialized context is bounded");

  console.log("PASS: HIS Core Context Engine V1 — 15 required scenarios and budget/history invariants.");
} finally {
  await server.close();
}
