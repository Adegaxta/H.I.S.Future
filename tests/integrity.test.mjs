import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { checkWorkspaceIntegrity } = await server.ssrLoadModule("/src/integrity/index.ts");
  const { setNodalMeta } = await server.ssrLoadModule("/src/nodes/metadata.ts");
  const { createDiagnosticEvent } = await server.ssrLoadModule("/src/diagnostics/events.ts");
  const node = (id, type = "pagina", parentId = null, content = "<p></p>") => ({
    id, type, parentId, content,
  });
  const finding = (result, rule) => result.findings.find((item) => item.rule === rule);

  const duplicate = checkWorkspaceIntegrity({
    nodes: [node("duplicate"), node("duplicate")],
  }, { operation: "node.create" });
  assert.equal(finding(duplicate, "node.id.unique").severity, "ERROR");
  assert.equal(finding(duplicate, "node.id.unique").rule, "node.id.unique");
  assert.equal(finding(duplicate, "node.id.unique").nodeId, "duplicate");
  assert.equal(finding(duplicate, "node.id.unique").expected, "Node IDs are unique across active nodes and Trash");
  assert.match(finding(duplicate, "node.id.unique").actual, /2 occurrences/);
  assert.equal(finding(duplicate, "node.id.unique").operation, "node.create");

  const emptyId = checkWorkspaceIntegrity({ nodes: [node("")] });
  assert.equal(finding(emptyId, "node.id.nonEmpty").severity, "ERROR");
  assert.equal(finding(emptyId, "node.id.nonEmpty").nodeId, "");
  assert.equal(finding(emptyId, "node.id.nonEmpty").actual, 'id = ""');

  const missingParent = checkWorkspaceIntegrity({
    nodes: [node("child", "pagina", "missing-parent")],
  });
  assert.equal(finding(missingParent, "parent.exists").severity, "ERROR");
  assert.equal(finding(missingParent, "parent.exists").nodeId, "child");
  assert.equal(finding(missingParent, "parent.exists").expected, "parentId references an existing active node");
  assert.equal(finding(missingParent, "parent.exists").actual, 'parentId = "missing-parent"; node not found');

  const cycle = checkWorkspaceIntegrity({
    nodes: [node("first", "pagina", "second"), node("second", "pagina", "first")],
  });
  assert.equal(finding(cycle, "parent.acyclic").severity, "ERROR");
  assert.equal(finding(cycle, "parent.acyclic").rule, "parent.acyclic");
  assert.ok(["first", "second"].includes(finding(cycle, "parent.acyclic").nodeId));

  const unknownType = checkWorkspaceIntegrity({ nodes: [node("future", "future-node")] });
  assert.equal(finding(unknownType, "node.type.registered").severity, "ERROR");
  assert.equal(finding(unknownType, "node.type.registered").nodeId, "future");
  assert.equal(finding(unknownType, "node.type.registered").expected, "Node type is registered in NODE_REGISTRY");
  assert.equal(finding(unknownType, "node.type.registered").actual, 'type = "future-node"');

  const invalidRelationContent = setNodalMeta("<p></p>", {
    relations: [
      { role: "syllabus", targetId: "image-target" },
      { role: "syllabus", targetId: "another-image" },
    ],
  });
  const invalidRelation = checkWorkspaceIntegrity({
    nodes: [
      node("course", "curso", null, invalidRelationContent),
      node("image-target", "imagen"),
      node("another-image", "imagen"),
    ],
  });
  assert.equal(finding(invalidRelation, "relation.target.type").severity, "ERROR");
  assert.equal(finding(invalidRelation, "relation.target.type").nodeId, "course");
  assert.equal(finding(invalidRelation, "relation.target.type").expected, "Target type is one of: pdf");
  assert.equal(finding(invalidRelation, "relation.target.type").actual, 'target type = "imagen"');
  assert.equal(finding(invalidRelation, "relation.cardinality").severity, "ERROR");
  assert.equal(finding(invalidRelation, "relation.cardinality").nodeId, "course");

  const missingRelationTarget = setNodalMeta("<p></p>", {
    relations: [{ role: "syllabus", targetId: "deleted-pdf" }],
  });
  const staleRelation = checkWorkspaceIntegrity({
    nodes: [node("course", "curso", null, missingRelationTarget)],
    deletedNodes: [node("deleted-pdf", "pdf")],
  });
  assert.equal(finding(staleRelation, "relation.target.exists").severity, "ERROR");
  assert.equal(finding(staleRelation, "relation.target.exists").nodeId, "course");
  assert.equal(finding(staleRelation, "relation.target.exists").actual, 'targetId = "deleted-pdf"; node not found');

  const primaryContent = setNodalMeta("<p></p>", { role: "vault-primary" });
  const duplicatePrimary = checkWorkspaceIntegrity({
    nodes: [node("primary-a", "proyecto", null, primaryContent), node("primary-b", "proyecto", null, primaryContent)],
  });
  assert.equal(finding(duplicatePrimary, "project.primary.unique").severity, "ERROR");
  assert.equal(finding(duplicatePrimary, "project.primary.unique").nodeId, "primary-a");
  const primaryInTrash = checkWorkspaceIntegrity({
    nodes: [],
    deletedNodes: [node("primary", "proyecto", null, primaryContent)],
  });
  assert.equal(finding(primaryInTrash, "project.primary.notInTrash").severity, "ERROR");

  const valid = checkWorkspaceIntegrity({
    nodes: [
      node("root", "categoria"),
      node("page", "pagina", "root"),
      node("course", "curso"),
      node("pdf", "pdf"),
      node("video", "video"),
      node("image", "imagen"),
      node("calendar", "calendario"),
    ],
  });
  assert.equal(valid.status, "PASS");
  assert.equal(valid.findings.filter(({ severity }) => severity === "ERROR").length, 0);
  assert.equal(valid.findings.length, 0);

  const crossTrashParent = checkWorkspaceIntegrity({
    nodes: [node("child", "pagina", "trashed-parent")],
    deletedNodes: [node("trashed-parent", "categoria")],
  });
  assert.ok(finding(crossTrashParent, "parent.exists"), "a parent in Trash is not an active hierarchy parent");

  const event = createDiagnosticEvent({
    timestamp: "2026-10-07T00:00:00.000Z",
    level: "ERROR",
    category: "integrity",
    action: "check.completed",
    operation: "node.create",
    operationId: "operation-1",
    message: "Workspace integrity failed.",
    technicalDetail: JSON.stringify(duplicate),
  });
  assert.deepEqual(event, {
    timestamp: "2026-10-07T00:00:00.000Z",
    level: "ERROR",
    category: "integrity",
    action: "check.completed",
    operation: "node.create",
    operationId: "operation-1",
    message: "Workspace integrity failed.",
    technicalDetail: JSON.stringify(duplicate),
  });

  console.log("PASS: workspace integrity rules, findings, status, and diagnostic events.");
} finally {
  await server.close();
}
