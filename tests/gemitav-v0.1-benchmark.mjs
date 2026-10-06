import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const api = await server.ssrLoadModule("/src/ai/conversation/index.ts");
  const state = { ...api.emptyPersistedConversationState("large"), activePeople: ["Ana"] };
  const frame = api.analyzeGeneralSemantics({ conversationId: "large", messageId: "current", text: "¿qué me dijo Ana?", role: "user", now: new Date("2026-09-29T12:00:00Z") });
  const all = Array.from({ length: 10_000 }, (_, index) => ({ id: `m-${index}`, sequence: index + 1, role: index % 2 ? "assistant" : "user", content: index === 123 ? "Ana dijo que la reunión era mañana" : `mensaje sintético ${index}` }));
  const recent = all.slice(-12);
  const referenced = [all[123]];
  const started = performance.now();
  let context;
  for (let index = 0; index < 1_000; index += 1) context = api.assembleConversationContext({ conversationId: "large", currentMessage: "¿qué me dijo Ana?", semanticFrame: frame, state, recentMessages: recent, referencedMessages: referenced, memories: [], charBudget: 2_000 });
  const elapsed = performance.now() - started;
  assert.ok(context.serialized.length <= 2_000);
  assert.equal(context.recentMessages.length, 6);
  assert.equal(context.referencedMessages.length, 1);
  assert.ok(elapsed < 1_500, `1,000 bounded assemblies took ${elapsed.toFixed(1)}ms`);
  console.log(`GEMITAV_V0_1_BENCHMARK source_messages=10000 loaded_recent=${recent.length} referenced=${referenced.length} assemblies=1000 elapsed_ms=${elapsed.toFixed(2)} context_chars=${context.serialized.length}`);
} finally {
  await server.close();
}
