import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const domain = await server.ssrLoadModule("/src/nodes/project/domain.ts");
  const metadata = await server.ssrLoadModule("/src/nodes/metadata.ts");
  const scene = await server.ssrLoadModule("/src/graph/scene.ts");
  const node = (id, name, type = "pagina", content = "<p><br></p>", order = 0) => ({ id, name, type, parentId: null, order, content });

  const migrated = domain.reconcileVaultPrimary([node("page", "Page")], "My Vault");
  assert.equal(migrated.filter(domain.isVaultPrimaryNode).length, 1);
  assert.equal(migrated.find(domain.isVaultPrimaryNode).name, "My Vault");
  assert.equal(metadata.getNodalMeta(migrated.find(domain.isVaultPrimaryNode).content).role, "vault-primary");
  assert.equal(domain.reconcileVaultPrimary(migrated, "My Vault"), migrated, "reconciliation is idempotent");

  const renamed = { ...migrated.find(domain.isVaultPrimaryNode), name: "Renamed" };
  assert.equal(domain.isVaultPrimaryNode(renamed), true, "primary identity does not depend on the name");
  const secondary = node("secondary", "Secondary", "proyecto");
  assert.equal(domain.isVaultPrimaryNode(secondary), false);

  const duplicate = node("duplicate", "Duplicate", "proyecto", metadata.setNodalMeta("<p></p>", { role: "vault-primary" }), 2);
  const repaired = domain.reconcileVaultPrimary([renamed, secondary, duplicate], "My Vault");
  assert.equal(repaired.filter(domain.isVaultPrimaryNode).length, 1);
  assert.equal(repaired.find(domain.isVaultPrimaryNode).id, renamed.id, "the established earliest primary is preserved");
  assert.equal(domain.isVaultPrimaryNode(repaired.find((item) => item.id === "duplicate")), false);
  assert.ok(repaired.find((item) => item.id === "duplicate").content.endsWith("<p></p>"), "demotion preserves duplicate content");
  const primaryPoint = { ...renamed, kind: "node", provenance: "nodal-node", label: renamed.name, color: "#FFFFFF", nodeType: "proyecto", isPrimaryProject: true, x: 0, y: 0 };
  const secondaryPoint = { ...primaryPoint, id: "secondary-point", isPrimaryProject: false };
  assert.ok(scene.graphNodeRadius(primaryPoint, "detail", false) > scene.graphNodeRadius(secondaryPoint, "detail", false));
  assert.equal(scene.graphNodeRadius(primaryPoint, "distant", false), scene.graphNodeRadius(secondaryPoint, "distant", false), "distant LOD remains a simple point");
  console.log("PASS: Project Node primary creation, identity and reconciliation invariants.");
} finally {
  await server.close();
}
