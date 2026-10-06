import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
const node = (id, name, content) => ({ id, name, type: "pagina", parentId: null, order: 0, content });
const nodes = [
  node("noosferon", "Noosferón", "<p>Los Noosferones son entidades noéticas que aparecen cuando los Nodiones alcanzan densidad crítica.</p>"),
  node("nodion", "Nodión", "<p>Los Nodiones son partículas noéticas y participan en la formación de la Noosfera.</p>"),
  node("noosphere", "Noosfera", "<p>La Noosfera es el campo noético colectivo y conserva memoria histórica.</p>"),
];
const malicious = "Noodions es una banda electrónica fundada en 2018. Publicó tres álbumes en https://noodions.example.";
const cases = [
  { name: "chat_fast_path", query: "hola", history: [], currentOutput: "¡Hola! ¿En qué puedo ayudarte?", drafts: [] },
  { name: "simple_his_fact", query: "¿cómo funcionan los Noosferones?", history: [], currentOutput: "Los Noosferones son entidades noéticas.", drafts: [] },
  { name: "long_his_synthesis", query: "dame toda la información de los Noodiones", history: [], currentOutput: malicious, drafts: [malicious, malicious] },
  { name: "previous_response_operation", query: "hazlo más corto", history: [{ role: "assistant", content: "Los Nodiones son partículas noéticas. Participan en la formación de la Noosfera. Alcanzan densidad crítica." }], currentOutput: "Los Nodiones son partículas noéticas.", drafts: [] },
];

try {
  const { prepareAIRequest } = await server.ssrLoadModule("/src/ai/AIRequestPreparation.ts");
  const { runGemitaV } = await server.ssrLoadModule("/src/ai/response-engine/GemitaVEngine.ts");
  const { emptyConversationState } = await server.ssrLoadModule("/src/ai/response-engine/types.ts");
  const originalInfo = console.info;
  console.info = () => {};
  const results = [];
  for (const item of cases) {
    const legacyStart = performance.now();
    const legacy = prepareAIRequest(item.query, item.history, nodes, [], `legacy-${item.name}`);
    const legacyTimeToModelMs = performance.now() - legacyStart;
    const legacyPromptChars = legacy.history.reduce((sum, message) => sum + message.content.length, 0);

    const controller = new AbortController();
    const drafts = [...item.drafts];
    let firstModelAt = null;
    let promptChars = 0;
    const v0Start = performance.now();
    const state = { ...emptyConversationState(), lastAssistantMessage: item.history.findLast?.((turn) => turn.role === "assistant")?.content ?? item.history.filter((turn) => turn.role === "assistant").at(-1)?.content ?? null };
    const v0 = await runGemitaV({ requestId: `v0-${item.name}`, query: item.query, history: item.history, nodes, concepts: [], state }, {
      signal: controller.signal,
      maxRepairAttempts: 1,
      generateDraft: async (messages) => {
        if (firstModelAt === null) firstModelAt = performance.now();
        promptChars += messages.reduce((sum, message) => sum + message.content.length, 0);
        return { text: drafts.shift() ?? "Los Noosferones son entidades noéticas.", metrics: null };
      },
    });
    const v0TotalMs = performance.now() - v0Start;
    results.push({
      case: item.name,
      current: {
        timeToModelMs: Number(legacyTimeToModelMs.toFixed(3)),
        retrievalMs: Number((legacy.engine?.trace.retrieval.timeMs ?? legacyTimeToModelMs).toFixed(3)),
        modelCalls: 1,
        promptChars: legacyPromptChars,
        estimatedPromptTokens: Math.ceil(legacyPromptChars / 4),
        outputChars: item.currentOutput.length,
        repairs: 0,
        hallucinationsBlocked: 0,
      },
      gemitavV0: {
        timeToModelMs: firstModelAt === null ? null : Number((firstModelAt - v0Start).toFixed(3)),
        retrievalMs: Number(v0.timings.retrievalMs.toFixed(3)),
        totalMs: Number(v0TotalMs.toFixed(3)),
        modelCalls: v0.modelCalls,
        promptChars,
        estimatedPromptTokens: Math.ceil(promptChars / 4),
        outputChars: v0.text.length,
        repairs: v0.repairs,
        hallucinationsBlocked: item.drafts.length > 0 && !/banda|album|álbum|https?:/iu.test(v0.text) ? 1 : 0,
        retrievalPolicy: v0.retrievalPolicy,
        route: v0.route.mode,
      },
    });
  }
  console.info = originalInfo;
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    methodology: "Controlled fixture; one warm in-process run per case. Model output is deterministic/stubbed, so timings cover orchestration and retrieval only. This is an orientation, not a scientific benchmark.",
    realVaultRun: "not_run: benchmark is reproducible and does not assume a user's private vault fixture",
    results,
  }, null, 2));
} finally {
  await server.close();
}
