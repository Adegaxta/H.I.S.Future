import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const withModel = process.argv.includes("--model");
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
const node = (id, name, content = "<p><br></p>") => ({ id, name, type: "pagina", parentId: null, order: 0, content });
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

const nodes = [
  node("noosphere", "Noosfera", "<h1>Definición</h1><p>La Noosfera es el campo noético colectivo.</p><h2>Formación</h2><p>Se forma cuando los Nodiones producen Noosferones.</p><h2>Papel</h2><p>Conecta conciencias y conserva memoria histórica.</p>"),
  node("nodion", "Nodión", "<p>Los Nodiones participan en la formación de la Noosfera.</p>"),
  node("noosferon", "Noosferón", "<p>Los Noosferones aparecen cuando los Nodiones alcanzan densidad crítica. La documentación no asigna un color.</p>"),
  node("retterh", "Retterh", "<h1>Vida</h1><p>Retterh fue un explorador.</p><h2>Ascensión</h2><p>Después viajó a Midasia y colaboró con Midas.</p>"),
  node("midas", "Midas", "<p>Midas fue aliado de Retterh.</p>"),
  node("alliance", "Crónica de la alianza", '<p><span data-mention-id="retterh">Retterh</span> y <span data-mention-id="midas">Midas</span> sellaron una alianza.</p>'),
  node("noise", "Recetas", "<p>Una sopa requiere agua, sal y cuatro verduras.</p>"),
];

const longHistory = Array.from({ length: 30 }, (_, index) => index % 2 ? assistant(`Respuesta histórica ${index} sobre Noosferones.`) : user(`Pregunta histórica ${index} sobre Noosferones.`));
const cases = [
  { query: "Háblame de Retterh", history: longHistory, relevant: ["retterh", "alliance", "midas"] },
  { query: "¿y qué pasó después?", history: [user("Háblame de Retterh"), assistant("Retterh fue un explorador.")], relevant: ["retterh", "alliance", "midas"] },
  { query: "Explícame al completo la Noosfera en el universo de HISFuture", history: [], relevant: ["noosphere", "nodion", "noosferon"] },
  { query: "¿Qué color exacto tienen los Noosferones?", history: [], relevant: ["noosferon"] },
  { query: "resúmeme todo sobre los Noosferones", history: [], relevant: ["noosferon", "noosphere", "nodion"] },
  { query: "¿Qué relación tienen Retterh y Midas?", history: [], relevant: ["retterh", "midas", "alliance"] },
];

async function modelAnswer(messages) {
  if (!withModel) return null;
  const response = await fetch("http://127.0.0.1:8080/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "local_ai/models/gemma-3-1b-it-Q4_K_M.gguf", messages, stream: false, max_tokens: 220 }) });
  if (!response.ok) throw new Error(`model HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content ?? null;
}

try {
  const legacyRetrieval = await server.ssrLoadModule("/src/ai/NodeContextRetrieval.ts");
  const legacyBuilder = await server.ssrLoadModule("/src/ai/ContextBuilder.ts");
  const legacyConversation = await server.ssrLoadModule("/src/ai/ConversationQueryResolver.ts");
  const { runContextEngine } = await server.ssrLoadModule("/src/ai/context-engine/ContextEngine.ts");
  const results = [];
  let modelAvailable = false;
  if (withModel) {
    try { modelAvailable = (await fetch("http://127.0.0.1:8080/health")).ok; } catch { modelAvailable = false; }
  }
  for (const item of cases) {
    const legacyStart = performance.now();
    const resolution = legacyConversation.resolveConversationQuery(item.query, item.history, nodes, []);
    const legacyRetrieved = legacyRetrieval.retrieveNodeContext(resolution.effectiveQuery, nodes);
    const legacyContext = legacyBuilder.buildNodeKnowledgeContext(legacyRetrieved);
    const legacyMs = performance.now() - legacyStart;
    const legacyIds = [...new Set([...legacyRetrieved.documents.map((document) => document.structure.id), ...legacyRetrieved.sources.map((source) => source.nodeId)])];
    const v1Start = performance.now();
    const v1 = runContextEngine({ query: item.query, history: item.history, nodes, concepts: [] });
    const v1Ms = performance.now() - v1Start;
    const v1Ids = [...new Set(v1.selected.map((selected) => selected.structure.id))];
    const legacyMessages = [...item.history.map(({ role, content }) => ({ role, content })), { role: "user", content: legacyBuilder.buildGroundedUserMessage(item.query, legacyContext) }];
    const v1Messages = [...v1.modelHistory, { role: "user", content: legacyBuilder.buildGroundedUserMessage(item.query, v1.context) }];
    results.push({
      query: item.query,
      legacy: { contextChars: legacyContext?.length ?? 0, selectedDocs: legacyIds, irrelevantDocs: legacyIds.filter((id) => !item.relevant.includes(id)), historyMessages: legacyMessages.length, latencyMs: Number(legacyMs.toFixed(3)), evidenceStatus: "NOT_AVAILABLE", finalModelAnswer: modelAvailable ? await modelAnswer(legacyMessages) : null },
      v1: { scope: v1.scope.scope, contextChars: v1.context?.length ?? 0, selectedDocs: v1Ids, irrelevantDocs: v1Ids.filter((id) => !item.relevant.includes(id)), historyMessages: v1Messages.length, latencyMs: Number(v1Ms.toFixed(3)), evidenceStatus: v1.evidence.status, finalModelAnswer: modelAvailable ? await modelAnswer(v1Messages) : null },
      trace: { normalizedQuery: v1.trace.normalizedQuery, effectiveQuery: v1.memory.effectiveQuery, inheritedEntities: v1.memory.inheritedEntities, intents: v1.intents.intents, targets: v1.plan.targets.map((target) => target.canonical), aspects: v1.plan.aspects, expansion: v1.selected.map((selected) => ({ node: selected.structure.name, mode: selected.contentMode, chars: selected.content.length })), responsePlan: v1.responsePlan, timingsMs: { lexicon: Number(v1.trace.lexical.timeMs.toFixed(3)), scope: Number(v1.trace.scope.timeMs.toFixed(3)), memory: Number(v1.trace.memory.timeMs.toFixed(3)), resolve: Number((v1.trace.references.timeMs + v1.trace.entities.timeMs).toFixed(3)), plan: Number(v1.trace.plan.timeMs.toFixed(3)), retrieval: Number(v1.trace.retrieval.timeMs.toFixed(3)), graph: Number(v1.trace.graph.timeMs.toFixed(3)), expansion: Number(v1.trace.expansion.timeMs.toFixed(3)), evidence: Number(v1.trace.evidence.timeMs.toFixed(3)), context: Number(v1.trace.context.timeMs.toFixed(3)) } },
    });
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), corpus: "controlled-context-engine-v1-fixture", modelComparison: modelAvailable ? "completed" : "not_run_local_server_unavailable", results }, null, 2));
} finally {
  await server.close();
}
