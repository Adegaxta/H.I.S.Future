import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { hisLexicon } = await server.ssrLoadModule("/src/lexicon/index.ts");
  const inspector = await server.ssrLoadModule("/src/ai/AINodeInspector.ts");

  assert.equal(hisLexicon.resolve("Noosferones").canonical, "Noosferón");
  assert.equal(hisLexicon.resolve("Nodiones").canonical, "Nodión");
  for (const expression of ["resúmeme", "resume", "sintetiza", "summarize"]) {
    assert.ok(hisLexicon.analyzeQuery(expression).intentHints.includes("summary"), expression);
    assert.equal(inspector.classifyAINodeIntent(expression), "summary");
  }

  const stopword = hisLexicon.analyzeQuery("Para").tokens[0];
  assert.equal(stopword.stopword.isStopword, true);
  assert.equal(stopword.stopword.weight, 0);
  assert.deepEqual(hisLexicon.analyzeQuery("Para").entities, []);

  const compound = hisLexicon.analyzeQuery("Explica Homeostasis Noética ahora");
  assert.ok(compound.entities.some((match) => match.canonical === "Homeostasis Noética"));
  assert.equal(compound.tokens.filter((token) => /homeostasis|noética/iu.test(token.original)).length, 1, "longest phrase wins");

  assert.equal(hisLexicon.resolve("Nodo", { namespaces: ["app"] }).entry?.id, "his:app:nodo");
  assert.equal(hisLexicon.resolve("Nodo", { namespaces: ["lore"] }).entry?.id, "his:lore:nodo");
  assert.equal(hisLexicon.resolve("Nodo").ambiguous, true);

  const unknown = hisLexicon.resolve("Zorblax");
  assert.equal(unknown.canonical, "Zorblax");
  assert.equal(unknown.matchKind, "raw-fallback");

  const spanish = hisLexicon.analyzeQuery("resúmeme todo sobre los noosferones");
  assert.ok(spanish.intentHints.includes("summary"));
  assert.ok(spanish.entities.some((match) => match.canonical === "Noosferón"));
  assert.ok(spanish.significantTerms.includes("noosferon"));

  const english = hisLexicon.analyzeQuery("summarize everything about Noosferones");
  assert.ok(english.intentHints.includes("summary"));
  assert.ok(english.entities.some((match) => match.canonical === "Noosferón"));

  console.log("PASS: HIS Lexicon V1 domain, intent, namespace, stopword, compound and fallback cases.");
} finally {
  await server.close();
}
