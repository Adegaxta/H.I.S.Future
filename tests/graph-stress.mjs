import { performance } from "node:perf_hooks";
import { createServer } from "vite";

globalThis.DOMParser = class BenchmarkDOMParser {
  parseFromString() {
    return { querySelector: () => null, querySelectorAll: () => [] };
  }
};

const server = await createServer({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const graph = await server.ssrLoadModule("/src/graph/projection.ts");
  const runtime = await server.ssrLoadModule("/src/graph/runtime.ts");
  const sizes = [50, 250, 500, 1000];
  console.log("Graph structural stress benchmark (not an FPS measurement)");
  for (const size of sizes) {
    const nodes = Array.from({ length: size }, (_, index) => {
      const relations = Array.from({ length: Math.min(3, size - index - 1) }, (_, offset) => ({
        role: "content",
        targetId: `node-${index + offset + 1}`,
      }));
      return {
        id: `node-${index}`,
        name: `Node ${index}`,
        type: "pagina",
        parentId: null,
        order: index,
        content: `<!--hisfuture-nodal-meta:${JSON.stringify({ version: 1, relations })}--><p>Benchmark</p>`,
      };
    });
    const samples = [];
    let edgeCount = 0;
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const started = performance.now();
      const projection = graph.buildGraphProjection(nodes, { showTypes: false, translate: (key) => key });
      const model = runtime.buildGraphRuntime(projection, new Map());
      const elapsed = performance.now() - started;
      if (iteration > 1) samples.push(elapsed);
      edgeCount = model.edges.length;
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    console.log(`${String(size).padStart(4)} nodes | ${String(edgeCount).padStart(4)} edges | projection + layout median ${median.toFixed(2)} ms`);
  }
} finally {
  await server.close();
}
