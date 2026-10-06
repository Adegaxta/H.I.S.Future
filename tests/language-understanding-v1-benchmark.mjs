import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const lu = await server.ssrLoadModule("/src/ai/language-understanding/index.ts");
  const conversation = await server.ssrLoadModule("/src/ai/conversation/index.ts");
  const state = conversation.emptyPersistedConversationState("bench");
  const inputs = ["holaaa que tal sabes te voy a contar mi dia", "voy a contarte algo", "tengo que terminar el validator", "creo que Ana vive en Madrid", "si mañana llueve no voy", "ella me dijo eso ayer", "no, me refería a Ana", "qué te conté ayer?", "cómo se llamaba la persona que te mencioné?", "yo prefiero respuestas cortas"];
  const started = performance.now();
  const traces = [];
  for (let i = 0; i < 1000; i += 1) traces.push(lu.languageUnderstandingPipeline.analyze({ conversationId: "bench", messageId: `m-${i}`, text: inputs[i % inputs.length], role: "user", state, now: new Date("2026-09-29T12:00:00-05:00") }));
  const totalMs = performance.now() - started;
  const context = conversation.assembleConversationContext({ conversationId: "bench", currentMessage: "qué te conté ayer de Ana?", semanticFrame: traces[0].semanticFrame.value, state, recentMessages: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, sequence: 1000 + i, role: i % 2 ? "assistant" : "user", content: `turno ${i}` })), referencedMessages: [{ id: "old", sequence: 42, role: "user", content: "Ayer vi a Ana" }], memories: [], charBudget: 2000 });
  assert.ok(totalMs < 2500);
  assert.ok(context.serialized.length <= 2000);
  const stages = Object.keys(traces[0].timings);
  console.log(JSON.stringify({ messages: 1000, totalMs: Number(totalMs.toFixed(2)), averageMs: Number((totalMs / 1000).toFixed(3)), contextChars: context.serialized.length, selectedRecent: context.recentMessages.length, selectedReferenced: context.referencedMessages.length, stages }, null, 2));
} finally { await server.close(); }
