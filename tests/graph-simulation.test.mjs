import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

function vertex(id, kind = "node", extra = {}) {
  return {
    id,
    label: id,
    kind,
    provenance: kind === "type-hub" ? "node-registry" : "nodal-node",
    color: "#fff",
    nodeType: "pagina",
    ...(kind === "type-hub" ? { typeId: "pagina" } : {}),
    ...extra,
  };
}

function edge(from, to, kind = "nodal-relation", targetMissing = false) {
  return { from, to, kind, provenance: kind === "grouping" ? "node-registry" : "nodal-metadata", derived: kind === "grouping", targetMissing };
}

function createModel(runtime, projection, cache = {}) {
  const positions = new Map(Object.entries(cache));
  const model = runtime.buildGraphRuntime(projection, positions);
  return model;
}

function settle(simulation, limit = 320) {
  simulation.wake("initial");
  let frames = 0;
  while (!simulation.isSleeping() && frames < limit) {
    simulation.step(1 / 60);
    frames += 1;
  }
  return frames;
}

try {
  const runtime = await server.ssrLoadModule("/src/graph/runtime.ts");
  const simulationModule = await server.ssrLoadModule("/src/graph/simulation.ts");
  const { GraphSimulation, DEFAULT_GRAPH_SIMULATION_CONFIG } = simulationModule;
  const projection = (vertices, edges) => ({ vertices, edges, diagnostics: [] });

  const connectedModel = createModel(
    runtime,
    projection([vertex("a"), vertex("b")], [edge("a", "b")]),
    { a: { x: 300, y: 300 }, b: { x: 1100, y: 300 } },
  );
  const connectedSimulation = new GraphSimulation(connectedModel);
  settle(connectedSimulation);
  const connectedDistance = Math.hypot(
    connectedModel.pointsById.get("a").x - connectedModel.pointsById.get("b").x,
    connectedModel.pointsById.get("a").y - connectedModel.pointsById.get("b").y,
  );
  assert.ok(connectedDistance > 140 && connectedDistance < 500, `connected nodes settled at ${connectedDistance}`);

  const overlapModel = createModel(runtime, projection([vertex("a"), vertex("b")], [edge("a", "b")]), { a: { x: 500, y: 500 }, b: { x: 500, y: 500 } });
  const overlapSimulation = new GraphSimulation(overlapModel);
  overlapSimulation.wake("initial");
  for (let index = 0; index < 40; index += 1) overlapSimulation.step(1 / 60);
  assert.ok(Math.hypot(overlapModel.points[0].x - overlapModel.points[1].x, overlapModel.points[0].y - overlapModel.points[1].y) > 50, "overlapping nodes separate");

  const isolatedModel = createModel(runtime, projection([vertex("isolated")], []), { isolated: { x: 1000, y: 1000 } });
  const isolatedSimulation = new GraphSimulation(isolatedModel);
  const isolatedFrames = settle(isolatedSimulation);
  assert.ok(isolatedFrames <= DEFAULT_GRAPH_SIMULATION_CONFIG.maxSettlingFrames);
  assert.ok(Number.isFinite(isolatedModel.points[0].x) && Number.isFinite(isolatedModel.points[0].y));
  assert.equal(isolatedSimulation.isSleeping(), true);

  const hubVertices = [vertex("hub", "type-hub"), ...Array.from({ length: 40 }, (_, index) => vertex(`node-${index}`))];
  const groupingEdges = hubVertices.slice(1).map((node) => edge("hub", node.id, "grouping"));
  const hubCache = Object.fromEntries(hubVertices.map((point, index) => [point.id, { x: 700 + (index % 8) * 130, y: 700 + Math.floor(index / 8) * 130 }]));
  const hubModel = createModel(runtime, projection(hubVertices, groupingEdges), hubCache);
  const hubSimulation = new GraphSimulation(hubModel);
  settle(hubSimulation);
  const hubDistances = hubModel.points.slice(1).map((point) => Math.hypot(point.x - hubModel.points[0].x, point.y - hubModel.points[0].y));
  assert.ok(Math.min(...hubDistances) > 100, "weak grouping does not collapse every node into its Type Hub");
  assert.ok(DEFAULT_GRAPH_SIMULATION_CONFIG.edgeKinds["nodal-relation"].strength > DEFAULT_GRAPH_SIMULATION_CONFIG.edgeKinds.grouping.strength);
  assert.ok(DEFAULT_GRAPH_SIMULATION_CONFIG.edgeKinds["mention-reference"].strength > DEFAULT_GRAPH_SIMULATION_CONFIG.edgeKinds.grouping.strength);

  const dragModel = createModel(runtime, projection([vertex("a"), vertex("b")], [edge("a", "b")]), { a: { x: 400, y: 400 }, b: { x: 750, y: 400 } });
  const dragSimulation = new GraphSimulation(dragModel);
  assert.equal(dragSimulation.startDrag("a"), true);
  const dragUpdate = dragSimulation.movePinned("a", { x: 1400, y: 900 });
  assert.deepEqual(dragUpdate, ["a", { x: 1400, y: 900 }]);
  dragSimulation.step(1 / 60);
  assert.deepEqual({ x: dragModel.pointsById.get("a").x, y: dragModel.pointsById.get("a").y }, { x: 1400, y: 900 });
  dragSimulation.endDrag("a");
  for (let index = 0; index < 30; index += 1) dragSimulation.step(1 / 60);
  assert.notDeepEqual({ x: dragModel.pointsById.get("a").x, y: dragModel.pointsById.get("a").y }, { x: 1400, y: 900 });

  const missingModel = createModel(runtime, projection([vertex("source")], [edge("source", "gone", "mention-reference", true)]));
  const missingSimulation = new GraphSimulation(missingModel);
  missingSimulation.wake("initial");
  for (let index = 0; index < 20; index += 1) missingSimulation.step(1 / 60);
  assert.equal(missingModel.edges.length, 0);
  assert.ok(missingSimulation.isSleeping() || missingModel.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));

  const emptySimulation = new GraphSimulation(createModel(runtime, projection([], [])));
  emptySimulation.wake("initial");
  emptySimulation.step(1 / 60);
  assert.equal(emptySimulation.isSleeping(), true, "an empty graph does not keep the RAF awake");

  const first = createModel(runtime, projection([vertex("new")], []));
  const second = createModel(runtime, projection([vertex("new")], []));
  assert.deepEqual(
    { x: first.points[0].x, y: first.points[0].y },
    { x: second.points[0].x, y: second.points[0].y },
    "initial placement is deterministic",
  );
  const neighborPlacement = createModel(runtime, projection([vertex("existing"), vertex("new")], [edge("existing", "new")]), { existing: { x: 300, y: 700 } });
  assert.ok(Math.hypot(neighborPlacement.pointsById.get("new").x - 300, neighborPlacement.pointsById.get("new").y - 700) <= 42.01, "new nodes start near positioned neighbors");

  const wakeModel = createModel(runtime, projection([vertex("quiet")], []));
  const wakeSimulation = new GraphSimulation(wakeModel);
  settle(wakeSimulation);
  assert.equal(wakeSimulation.isSleeping(), true);
  wakeSimulation.wake("manual");
  assert.equal(wakeSimulation.isSleeping(), false);
  console.log("PASS: GraphSimulation forces, semantic weights, locality, pinning, sleep/wake and stability are covered.");
} finally {
  await server.close();
}