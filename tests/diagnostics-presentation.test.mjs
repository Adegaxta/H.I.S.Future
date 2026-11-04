import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const presentation = await server.ssrLoadModule("/src/diagnostics/presentation.ts");
  const eventsModule = await server.ssrLoadModule("/src/diagnostics/events.ts");
  const lifecycle = await server.ssrLoadModule("/src/lifecycle/metrics.ts");
  const makeEvent = (overrides = {}) => ({
    timestamp: "2026-10-07T15:00:00.000Z",
    level: "INFO",
    category: "project",
    action: "saved",
    operation: "workspace.save",
    message: "Saved 2 rows",
    technicalDetail: '{"sqliteMs":0.42,"changedRows":2}',
    ...overrides,
  });

  const project = makeEvent();
  assert.equal(presentation.getPresentedCategory(project.category), "PROJECT");
  assert.equal(presentation.getHumanEventMessage(project), "Saved 2 rows");
  assert.equal(project.technicalDetail, '{"sqliteMs":0.42,"changedRows":2}', "presentation leaves original technical detail untouched");
  assert.equal(presentation.getPresentedCategory("unknown-subsystem"), "UNCLASSIFIED");

  const passEvent = makeEvent({
    level: "INFO",
    category: "integrity",
    action: "check.completed",
    message: "Workspace integrity pass: 0 finding(s).",
    technicalDetail: JSON.stringify({
      status: "PASS",
      nodeCount: 1842,
      deletedNodeCount: 0,
      findings: [],
    }),
  });
  assert.equal(presentation.getHumanEventMessage(passEvent), "Workspace consistent");
  assert.equal(presentation.formatIntegrityCounts(passEvent), "1842 nodes • 0 errors • 0 warnings");
  assert.equal(presentation.getPresentedCategory(passEvent.category), "INTEGRITY");

  const finding = {
    rule: "parent.exists",
    severity: "ERROR",
    nodeId: "Retterh",
    expected: "parentId references an existing active node",
    actual: 'parentId = "pagina_882"; node not found',
    operation: "node.move",
    evidence: { collection: "nodes", index: 4, relatedNodeIds: ["pagina_882"] },
    message: 'Node "Retterh" references a missing parent.',
    technicalDetail: "nodes[4].parentId did not resolve.",
  };
  const failedEvent = makeEvent({
    level: "ERROR",
    category: "integrity",
    action: "check.completed",
    message: "Workspace integrity failed: 1 finding(s).",
    technicalDetail: JSON.stringify({
      status: "FAILED",
      nodeCount: 1,
      deletedNodeCount: 0,
      findings: [finding],
    }),
  });
  assert.equal(presentation.getHumanEventMessage(failedEvent), "Workspace inconsistent");
  assert.equal(presentation.formatIntegrityCounts(failedEvent), "1 nodes • 1 errors • 0 warnings");
  assert.deepEqual(presentation.getIntegritySummary(failedEvent).findings[0], finding);

  const warningEvent = makeEvent({
    level: "WARN",
    category: "integrity",
    action: "check.completed",
    message: "Workspace integrity warning: 1 finding(s).",
    technicalDetail: JSON.stringify({
      status: "WARNING",
      nodeCount: 1,
      deletedNodeCount: 0,
      findings: [{ ...finding, severity: "WARNING" }],
    }),
  });
  assert.equal(presentation.getHumanEventMessage(warningEvent), "Workspace warning");
  assert.equal(presentation.formatIntegrityCounts(warningEvent), "1 nodes • 0 errors • 1 warnings");

  const traceA = makeEvent({ operationId: "trace-a" });
  const traceB = makeEvent({ operationId: "trace-a", action: "resources.loaded" });
  const independent = makeEvent({ action: "node.updated" });
  const grouped = presentation.groupDiagnosticEvents([traceA, independent, traceB]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "operation");
  assert.equal(grouped[0].events.length, 2);
  assert.equal(grouped[0].events[0], traceA);
  assert.equal(grouped[0].events[1], traceB);
  assert.equal(grouped[1].kind, "event");
  assert.equal(grouped[1].events[0], independent);

  const debug = makeEvent({ level: "DEBUG" });
  const trace = makeEvent({ level: "TRACE" });
  const warning = makeEvent({ level: "WARN" });
  const sourceEvents = [project, debug, trace, warning];
  const human = presentation.filterDiagnosticEvents(sourceEvents, { debugMode: false });
  assert.deepEqual(human, [project, warning]);
  const filtered = presentation.filterDiagnosticEvents(sourceEvents, {
    debugMode: true,
    levels: ["DEBUG"],
    categories: ["PROJECT"],
  });
  assert.deepEqual(filtered, [debug]);
  assert.equal(sourceEvents.length, 4, "filters only change presentation and do not discard source events");

  assert.equal(eventsModule.MAX_DIAGNOSTIC_EVENTS, 300);
  eventsModule.clearDiagnosticEvents();
  for (let index = 0; index < 305; index += 1) {
    eventsModule.publishDiagnosticEvent(makeEvent({ message: `event-${index}` }));
  }
  assert.equal(eventsModule.getDiagnosticEvents().length, 300);
  assert.equal(eventsModule.getDiagnosticEvents()[0].message, "event-5");
  eventsModule.pauseDiagnosticTracking(true);
  eventsModule.publishDiagnosticEvent(makeEvent({ message: "paused-event" }));
  assert.equal(eventsModule.getDiagnosticEvents().length, 300, "pause prevents new UI history entries without deleting existing entries");
  eventsModule.pauseDiagnosticTracking(false);
  eventsModule.clearDiagnosticEvents();
  assert.equal(eventsModule.getDiagnosticEvents().length, 0);

  const traceId = lifecycle.beginCloseProjectTrace();
  lifecycle.recordCloseProjectPhase(traceId, "SQLite save", 0.42);
  lifecycle.failCloseProjectTrace(new Error("synthetic close failure"));
  const closeEvents = eventsModule.getDiagnosticEvents();
  assert.deepEqual(closeEvents.map(({ action, category, level }) => [action, category, level]), [
    ["close.started", "PROJECT", "INFO"],
    ["close.phase.completed", "PROJECT", "DEBUG"],
    ["close.failed", "PROJECT", "ERROR"],
  ]);
  assert.ok(closeEvents.every((event) => event.operationId === traceId));
  assert.equal(JSON.parse(closeEvents[1].technicalDetail).durationMs, 0.4);
  assert.match(closeEvents[2].technicalDetail, /synthetic close failure/);
  eventsModule.clearDiagnosticEvents();
  console.log("PASS: semantic categories, integrity presentation, operation grouping, filters, and source event retention.");
} finally {
  await server.close();
}
