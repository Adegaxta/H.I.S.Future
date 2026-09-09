import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const runtime = await server.ssrLoadModule("/src/graph/runtime.ts");
  const vertices = Array.from({ length: 50 }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    kind: "node",
    provenance: "nodal-node",
    color: "#fff",
    nodeType: "pagina",
  }));
  const edges = Array.from({ length: 100 }, (_, index) => ({
    from: `node-${index % 50}`,
    to: `node-${(index + 1) % 50}`,
    kind: "nodal-relation",
    provenance: "nodal-metadata",
    derived: false,
    targetMissing: false,
  }));
  edges.push({ ...edges[0] });
  edges.push({ ...edges[0], to: "missing", targetMissing: true });
  const cache = new Map();
  const model = runtime.buildGraphRuntime({ vertices, edges, diagnostics: [] }, cache);
  assert.equal(model.points.length, 50);
  assert.equal(model.edges.length, 50, "visual edges remain deduplicated by directed endpoints");
  assert.equal(model.edges.reduce((count, rendered) => count + rendered.facts.length, 0), 101, "all non-missing semantic facts remain attached to visual edges");
  assert.equal(model.pointsById.size, 50);
  assert.equal(model.edgesByPointId.get("node-0").length, 2, "incident edges are indexed once for direct drag updates");

  cache.set("node-0", { x: 123, y: 456 });
  cache.set("removed", { x: 1, y: 1 });
  const rebuilt = runtime.buildGraphRuntime({ vertices, edges, diagnostics: [] }, cache);
  assert.deepEqual({ x: rebuilt.pointsById.get("node-0").x, y: rebuilt.pointsById.get("node-0").y }, { x: 123, y: 456 });
  assert.equal(cache.has("removed"), false, "runtime cache removes identities absent from the semantic projection");
  assert.deepEqual(runtime.clampGraphPosition({ x: -100, y: 99999 }), { x: 45, y: runtime.GRAPH_CANVAS_HEIGHT - 45 });

  const viewSource = fs.readFileSync(new URL("../src/graph/view.tsx", import.meta.url), "utf8");
  const rendererSource = fs.readFileSync(new URL("../src/graph/PixiGraphRenderer.ts", import.meta.url), "utf8");
  assert.ok(viewSource.includes("useMemo("), "projection and runtime use low-frequency memoized paths");
  for (const formerHighFrequencyState of ["setPositions", "setPan", "setZoom", "setDraggingId"]) {
    assert.equal(viewSource.includes(formerHighFrequencyState), false, `${formerHighFrequencyState} must not return to Graph rendering`);
  }
  assert.ok(rendererSource.includes("requestAnimationFrame"), "pointer and render work is coalesced to animation frames");
  assert.ok(rendererSource.includes("updatePositions(updates:"), "renderer exposes a direct position-update boundary");
  assert.equal(rendererSource.includes("buildGraphProjection"), false, "renderer cannot perform semantic projection");
  assert.equal(rendererSource.includes("setState"), false, "high-frequency interaction stays outside React state");
  assert.equal(viewSource.includes("<svg"), false, "React no longer creates an SVG/DOM object per graph primitive");
  assert.equal(viewSource.includes("runtime.points.map"), false, "React does not reconcile nodes");
  console.log("PASS: Graph runtime keeps semantic facts and delegates localized visual updates outside React.");
} finally {
  await server.close();
}
