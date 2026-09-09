import { performance } from "node:perf_hooks";
import { createServer } from "vite";

globalThis.DOMParser = class BenchmarkDOMParser {
  parseFromString(content) {
    return {
      querySelector: () => content.includes("<img") ? { getAttribute: () => "data:image/png;base64,AA==", dataset: {} } : null,
      querySelectorAll: () => [],
    };
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
  const scene = await server.ssrLoadModule("/src/graph/scene.ts");
  const { GraphSimulation } = await server.ssrLoadModule("/src/graph/simulation.ts");
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
        type: index % 10 === 0 ? "imagen" : "pagina",
        parentId: null,
        order: index,
        content: `<!--hisfuture-nodal-meta:${JSON.stringify({ version: 1, relations })}--><p>${index % 10 === 0 ? "<img>" : "Benchmark"}</p>`,
      };
    });
    const samples = [];
    const simulationSamples = [];
    const simulationRuns = size >= 1000 ? 1 : 3;
    let simulationFrames = 0;
    let edgeCount = 0;
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const started = performance.now();
      const projection = graph.buildGraphProjection(nodes, { showTypes: true, translate: (key) => key });
      const model = runtime.buildGraphRuntime(projection, new Map());
      const graphScene = scene.buildGraphScene(model, { showIcons: true, showImages: true });
      for (const lod of ["detail", "medium", "far", "distant"]) {
        for (const point of graphScene.runtime.points) {
          scene.graphNodeVisual(point, lod, graphScene.preferences);
          scene.graphLabelVisible(lod, false);
        }
      }
      const elapsed = performance.now() - started;
      if (iteration > 1) samples.push(elapsed);
      if (iteration >= 2 && iteration < 2 + simulationRuns) {
        const simulation = new GraphSimulation(model);
        simulation.wake("initial");
        const simulationStarted = performance.now();
        let frames = 0;
        while (!simulation.isSleeping() && frames < 240) {
          simulation.step(1 / 60);
          frames += 1;
        }
        simulationSamples.push((performance.now() - simulationStarted) / Math.max(1, frames));
        simulationFrames = frames;
      }
      edgeCount = model.edges.length;
    }
    samples.sort((a, b) => a - b);
    simulationSamples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const simulationMedian = simulationSamples[Math.floor(simulationSamples.length / 2)];
    console.log(`${String(size).padStart(4)} nodes | ${String(edgeCount).padStart(4)} visual edges + Type Hubs/LOD | structural median ${median.toFixed(2)} ms | simulation ${simulationMedian.toFixed(2)} ms/step | ${simulationFrames} frames to sleep`);
  }
} finally {
  await server.close();
}
