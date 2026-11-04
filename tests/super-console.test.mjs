import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const diagnostics = await server.ssrLoadModule("/src/diagnostics/presentation.ts");
  const eventsModule = await server.ssrLoadModule("/src/diagnostics/events.ts");
  const makeEvent = (overrides = {}) => ({
    timestamp: "2026-10-07T15:00:00.000Z",
    level: "INFO",
    category: "EDITOR",
    action: "node.moved",
    operation: "node.move",
    nodeId: "node-source",
    message: "Node moved",
    technicalDetail: '{"privateContent":"not exported"}',
    ...overrides,
  });

  const finding = {
    rule: "relation.target.exists",
    severity: "ERROR",
    nodeId: "node-source",
    expected: "Relation target references an existing active node",
    actual: 'targetId = "node-missing"; node not found',
    operation: "node.move",
    evidence: {
      collection: "nodes",
      index: 2,
      relatedNodeIds: ["node-missing"],
      relationRole: "tempo",
    },
    message: "Relation points to a missing node.",
  };
  const integrityEvent = makeEvent({
    level: "ERROR",
    category: "INTEGRITY",
    action: "check.completed",
    operationId: "operation-a",
    traceId: "trace-a",
    technicalDetail: JSON.stringify({
      status: "FAILED",
      nodeCount: 1,
      deletedNodeCount: 0,
      findings: [finding],
    }),
  });

  assert.deepEqual(
    diagnostics.getDiagnosticEntityReferences(integrityEvent),
    [
      { id: "node-source", role: "source" },
      { id: "node-missing", role: "related" },
    ],
    "finding evidence yields source and related IDs once",
  );
  assert.deepEqual(
    diagnostics.resolveDiagnosticEntityReferences(integrityEvent, [{ id: "node-source" }]),
    [
      { id: "node-source", role: "source", state: "active" },
      { id: "node-missing", role: "related", state: "missing" },
    ],
    "referenced missing nodes remain distinguishable from existing nodes",
  );
  assert.equal(
    diagnostics.resolveDiagnosticEntityReferences(integrityEvent, [{ id: "node-source" }], ["node-missing"])[1].state,
    "deleted",
    "references in Trash are not misreported as missing",
  );

  const traceEvent = makeEvent({ operation: undefined, operationId: undefined, traceId: "trace-a", action: "ai.resolve" });
  const uncorrelated = makeEvent({ operation: undefined, operationId: undefined, traceId: undefined });
  const grouped = diagnostics.groupDiagnosticEvents([integrityEvent, traceEvent, uncorrelated]);
  assert.deepEqual(grouped.map(({ kind }) => kind), ["operation", "trace", "event"]);
  assert.equal(grouped[0].events.length, 1, "operation ID takes precedence when an event has both IDs");
  assert.equal(grouped[1].traceId, "trace-a");
  assert.equal(grouped[2].events[0], uncorrelated, "events without IDs are not correlated");

  const resourceEvent = makeEvent({
    category: "ASSETS",
    action: "resource.stored",
    nodeId: undefined,
    resourceId: "resource-image-1",
  });
  const databaseEvent = makeEvent({ category: "DATABASE", nodeId: undefined, relatedNodeIds: ["node-source"] });
  const touched = diagnostics.summarizeDiagnosticHistory([integrityEvent, resourceEvent, databaseEvent]);
  assert.deepEqual(touched.nodes, [
    { id: "node-source", role: "source" },
    { id: "node-missing", role: "related" },
  ]);
  assert.deepEqual(touched.resourceIds, ["resource-image-1"]);
  assert.equal(touched.relationFindings, 1);
  assert.equal(touched.persistenceEvents, 1);
  assert.equal(touched.workspaceEvents, 0);

  const latest = diagnostics.getLatestIntegritySummary([
    makeEvent({ category: "INTEGRITY", action: "check.completed", technicalDetail: JSON.stringify({
      status: "PASS", nodeCount: 3, findings: [],
    }) }),
    integrityEvent,
  ]);
  assert.equal(latest.summary.status, "FAILED");
  assert.equal(latest.event, integrityEvent);

  const evidence = diagnostics.createDiagnosticEvidencePayload([integrityEvent]);
  assert.equal(evidence.historyScope, "current-session-buffer");
  assert.equal(evidence.events[0].operationId, "operation-a");
  assert.equal(evidence.events[0].traceId, "trace-a");
  assert.equal(evidence.events[0].integrity.findings[0].rule, "relation.target.exists");
  assert.equal("technicalDetail" in evidence.events[0], false, "AI evidence projection excludes raw technical payload");
  assert.equal("technicalDetail" in evidence.events[0].integrity.findings[0], false, "AI projection whitelists structured finding fields");
  assert.equal(JSON.stringify(evidence).includes("privateContent"), false, "evidence never carries raw node content");
  assert.equal(diagnostics.getLatestIntegritySummary([]), null);

  eventsModule.clearDiagnosticEvents();

  console.log("PASS: console references, missing entities, operation/trace grouping, touched summary, and minimized AI evidence.");
} finally {
  await server.close();
}
