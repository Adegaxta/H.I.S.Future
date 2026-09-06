import assert from "node:assert/strict";
import { createServer } from "vite";

// Only I/O boundaries are replaced: the real importer and PDF metadata codec run.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true }, appType: "custom",
  plugins: [{
    name: "import-io-test-boundaries",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.endsWith("fileNodeImporter.ts")) return;
      if (source === "../pdf/pdfjs") return "\0test-pdf";
      if (source === "./resourceRepository") return "\0test-resources";
    },
    load(id) {
      if (id === "\0test-pdf") return 'export const getDocument = () => ({ promise: Promise.resolve({}), destroy: async () => {} });';
      if (id === "\0test-resources") return `
        export const writes = []; export const removals = []; let fail = false;
        export function failWrites(value) { fail = value; }
        export async function storeProjectResource(kind, id, data) { if (fail) throw new Error("disk unavailable"); writes.push({ kind, id, data }); }
        export async function deleteProjectResource(kind, id) { removals.push({ kind, id }); }
      `;
    },
  }],
});
try {
  const importer = await server.ssrLoadModule("/src/project/fileNodeImporter.ts");
  const resources = await server.ssrLoadModule("\0test-resources");
  const { getPdfResourceInfo } = await server.ssrLoadModule("/src/utils/pdfResource.ts");
  const file = new File(["%PDF-1.4 test"], "notes.pdf", { type: "application/pdf" });
  const created = [];
  const context = { nodes: [], createNode(name, type, parentId, content) {
    const node = { id: "one-node", name, type, parentId, content, order: 0 };
    created.push(node); return node.id;
  } };
  const result = await importer.importFileAsNode(file, null, context);
  assert.equal(created.length, 1, "import creates exactly one entity");
  assert.equal(result.id, created[0].id, "returned node is a projection of the created identity");
  assert.equal(resources.writes.length, 1);
  assert.equal(getPdfResourceInfo(result.content).resourceId, resources.writes[0].id);
  resources.failWrites(true);
  await assert.rejects(importer.importFileAsNode(file, null, context), /disk unavailable/);
  assert.equal(created.length, 1, "failed resource persistence creates no node");
  resources.failWrites(false);
  const originalError = console.error;
  console.error = () => {}; // Expected failure reported by the production importer.
  try {
    await assert.rejects(importer.importFileAsNode(file, null, { nodes: [], createNode() { throw new Error("create failed"); } }));
  } finally { console.error = originalError; }
  assert.equal(resources.removals.length, 1);
  assert.equal(resources.removals[0].id, resources.writes[1].id, "failed creation removes only its own resource");
  console.log("PASS: import identity, resource association and failure cleanup.");
} finally { await server.close(); }
