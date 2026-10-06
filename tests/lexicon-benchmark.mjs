import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

const iterations = 5_000;
try {
  const { hisLexicon } = await server.ssrLoadModule("/src/lexicon/index.ts");
  const query = "resúmeme toda la información de los Noosferones";
  for (let index = 0; index < 200; index += 1) hisLexicon.analyzeQuery(query);
  const started = performance.now();
  let analysis;
  for (let index = 0; index < iterations; index += 1) analysis = hisLexicon.analyzeQuery(query);
  const elapsedMs = performance.now() - started;
  console.log(JSON.stringify({
    iterations,
    totalMs: Number(elapsedMs.toFixed(3)),
    averageMs: Number((elapsedMs / iterations).toFixed(5)),
    query,
    language: analysis.language,
    tokens: analysis.tokens.map((token) => ({
      original: token.original,
      canonical: token.canonical,
      stopword: token.stopword.isStopword,
      source: token.match.source?.provider ?? "raw",
    })),
    significantTerms: analysis.significantTerms,
    entities: analysis.entities.map((entity) => entity.canonical),
    intentHints: analysis.intentHints,
  }, null, 2));
} finally {
  await server.close();
}
