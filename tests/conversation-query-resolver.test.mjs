import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

const node = (id, name, content = "<p><br></p>") => ({
  id,
  name,
  type: "pagina",
  parentId: null,
  order: 0,
  content,
});
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

try {
  const { resolveConversationQuery } = await server.ssrLoadModule("/src/ai/ConversationQueryResolver.ts");
  const nodes = [
    node("retterh", "Retterh"),
    node("noosphere", "Noosfera"),
    node("midas", "Midas"),
    node("number-four", "Patrones numéricos", "<p>El número 4 aparece varias veces.</p>"),
  ];

  const explicit = resolveConversationQuery("quien es retterh", [], nodes, []);
  assert.equal(explicit.effectiveQuery, "quien es retterh");
  assert.deepEqual(explicit.activeEntities, ["Retterh"]);
  assert.equal(explicit.kind, "explicit_entity");

  const death = resolveConversationQuery(
    "cuando murio?",
    [user("quien es retterh"), assistant("Retterh es…")],
    nodes,
    [],
  );
  assert.equal(death.effectiveQuery, "cuando murio Retterh");
  assert.equal(death.kind, "previous_user_entity");

  for (const followUp of ["que hizo él?", "eso?", "ahí?", "y que hizo despues?", "y antes?", "por que?", "como ocurrio?"]) {
    const resolved = resolveConversationQuery(followUp, [user("quien es retterh")], nodes, []);
    assert.match(resolved.effectiveQuery, /Retterh/, `resolves vague follow-up: ${followUp}`);
  }

  const noosphere = resolveConversationQuery(
    "como funciona?",
    [user("hablame de la noosfera"), assistant("La Noosfera…")],
    nodes,
    [],
  );
  assert.equal(noosphere.effectiveQuery, "como funciona Noosfera");

  const numberFour = resolveConversationQuery(
    "pero sale mas veces?",
    [user("que relacion tiene el numero 4 en hisfuture"), assistant("Aparece…")],
    nodes,
    [],
  );
  assert.equal(numberFour.effectiveQuery, "sale mas veces numero 4");
  assert.equal(numberFour.activeTopic, "numero 4");

  const greeting = resolveConversationQuery("hola", [user("quien es retterh")], nodes, []);
  assert.equal(greeting.effectiveQuery, "hola");
  assert.deepEqual(greeting.activeEntities, []);
  assert.equal(greeting.kind, "unchanged");

  const switchedEntity = resolveConversationQuery(
    "cuando murio?",
    [
      user("quien es retterh"),
      assistant("Retterh es…"),
      user("y quien es midas?"),
      assistant("Midas es…"),
    ],
    nodes,
    [],
  );
  assert.equal(switchedEntity.effectiveQuery, "cuando murio Midas");
  assert.deepEqual(switchedEntity.activeEntities, ["Midas"]);

  const explicitSwitch = resolveConversationQuery(
    "y quien es midas?",
    [user("quien es retterh")],
    nodes,
    [],
  );
  assert.equal(explicitSwitch.effectiveQuery, "y quien es midas?");
  assert.deepEqual(explicitSwitch.activeEntities, ["Midas"]);

  const ignoresAssistantClaims = resolveConversationQuery(
    "cuando murio?",
    [user("cuentame algo"), assistant("Midas murió…")],
    nodes,
    [],
  );
  assert.equal(ignoresAssistantClaims.effectiveQuery, "cuando murio?", "assistant output cannot invent an active entity");

  const selfContained = resolveConversationQuery(
    "como funciona la noosfera?",
    [user("quien es retterh")],
    nodes,
    [],
  );
  assert.equal(selfContained.effectiveQuery, "como funciona la noosfera?");
  assert.deepEqual(selfContained.activeEntities, ["Noosfera"]);

  console.log("PASS: deterministic conversational query resolution.");
} finally {
  await server.close();
}
