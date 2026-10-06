import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

const node = (id, name, content = "<p><br></p>", parentId = null) => ({ id, name, type: "pagina", parentId, order: 0, content });

try {
  const inspectorModule = await server.ssrLoadModule("/src/ai/AINodeInspector.ts");
  const retrieval = await server.ssrLoadModule("/src/ai/NodeContextRetrieval.ts");
  const imageAndTable = node("atlas", "Atlas", `
    <h1>Origen</h1><p>Texto inicial.</p>
    <h2>Consecuencias</h2>
    <p><span class="editor-mention" data-mention-id="midas">Midas</span></p>
    <img src="resource:cover" alt="Mapa" data-resource-id="cover" data-image-file-name="mapa.png">
    <table><tr><th>Era</th><th>Evento</th></tr><tr><td>1</td><td>Inicio</td></tr></table>
    <a href="https://example.test/source">Fuente</a>
  `);
  const nodes = [
    node("retterh", "Retterh"),
    node("midas", "Midas", "<p>Rey de Midasia.</p>"),
    imageAndTable,
    node("caller", "Crónica", '<p><span data-mention-id="retterh">Retterh</span><span data-mention-id="retterh">Retterh</span></p>'),
  ];

  const inspector = inspectorModule.createAINodeInspector(nodes);
  const atlas = inspector.inspect("atlas");
  assert.deepEqual(atlas.headings.map(({ level, text }) => ({ level, text })), [{ level: 1, text: "Origen" }, { level: 2, text: "Consecuencias" }]);
  assert.equal(atlas.images.length, 1);
  assert.equal(atlas.images[0].alt, "Mapa");
  assert.equal(atlas.tables.length, 1);
  assert.equal(atlas.tables[0].rows, 2);
  assert.equal(atlas.tables[0].columns, 2);
  assert.deepEqual(atlas.tables[0].headers, ["Era", "Evento"]);
  assert.equal(atlas.totalCalls, 1);
  assert.equal(atlas.calls[0].targetName, "Midas");

  const retterh = inspector.inspect("retterh");
  assert.equal(retterh.textLength, 0);
  assert.equal(retterh.incomingCalls[0].sourceName, "Crónica");
  assert.equal(retterh.incomingCalls[0].count, 2);

  assert.equal(inspectorModule.classifyAINodeIntent("resume @Atlas"), "summary");
  assert.equal(inspectorModule.classifyAINodeIntent("dime información de todo el nodo @Atlas"), "full_node");
  assert.equal(inspectorModule.classifyAINodeIntent("¿qué calls tiene @Atlas?"), "relations");
  assert.equal(inspectorModule.classifyAINodeIntent("¿qué contiene este Nodo?"), "structure");

  const full = retrieval.retrieveNodeContext("dime información de todo el nodo @Atlas", nodes);
  assert.equal(full.mode, "full_node");
  assert.equal(full.documents[0].contentMode, "full");
  assert.match(full.documents[0].content, /Origen/);
  assert.match(full.documents[0].content, /Consecuencias/);

  const loreQuestion = retrieval.retrieveNodeContext("¿qué es un Nodo en la Noosfera?", nodes);
  assert.equal(loreQuestion.documents.length, 0, "the word Nodo alone is not app metadata");
  assert.equal(loreQuestion.appNodeQuestion, false);

  const appQuestion = retrieval.retrieveNodeContext("¿qué es un Nodo en HIS?", nodes);
  assert.equal(appQuestion.appNodeQuestion, true);
  const contextBuilder = await server.ssrLoadModule("/src/ai/ContextBuilder.ts");
  assert.match(contextBuilder.buildNodeKnowledgeContext(appQuestion), /\[HIS_APP_CONTEXT\]/);
  assert.match(contextBuilder.buildNodeKnowledgeContext(appQuestion), /NodeItem_fields/);

  console.log("PASS: structural Node inspection, direct @ references, intents and whole-node context.");
} finally {
  await server.close();
}
