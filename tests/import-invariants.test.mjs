import assert from "node:assert/strict";
import { createServer } from "vite";

// Only I/O boundaries are replaced: the real importer and PDF metadata codec run.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom",
  plugins: [{
    name: "import-io-test-boundaries",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer?.replaceAll("\\", "/").endsWith("nodes/pdf/fileImport.ts")) {
        if (source === "../../pdf/pdfjs") return "\0test-pdf";
        if (source === "../../project/resourceRepository") return "\0test-resources";
      }
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
  const fileImports = await server.ssrLoadModule("/src/project/fileImportRegistry.ts");
  const resourceRegistry = await server.ssrLoadModule("/src/project/resourceRegistry.ts");
  const resources = await server.ssrLoadModule("\0test-resources");
  const { getPdfResourceInfo } = await server.ssrLoadModule("/src/utils/pdfResource.ts");
  const file = new File(["%PDF-1.4 test"], "notes.pdf", { type: "application/pdf" });
  assert.equal(importer.getImportableFileKind(file), "pdf");
  assert.equal(importer.getImportableFileKind(new File(["x"], "PHOTO.JPEG", { type: "" })), "image");
  assert.equal(importer.getImportableFileKind(new File(["x"], "notes.txt", { type: "text/plain" })), null);
  assert.deepEqual(fileImports.FILE_IMPORT_REGISTRY.all().map(({ definition }) => [definition.kind, definition.nodeType, definition.storage]), [
    ["image", "imagen", "inline"],
    ["pdf", "pdf", "project-resource"],
  ]);
  assert.ok(fileImports.fileImportAccept(["imagen"]).includes("image/*"));
  assert.ok(fileImports.fileImportAccept(["imagen"]).includes(".jpeg"));
  assert.equal(fileImports.fileImportAccept(["imagen"]).includes(".pdf"), false);
  assert.deepEqual(resourceRegistry.PROJECT_RESOURCE_DEFINITIONS, [{ kind: "pdf", nodeType: "pdf", extension: "pdf" }]);
  const duplicate = fileImports.FILE_IMPORT_REGISTRY.all()[0];
  assert.throws(() => fileImports.createFileImportRegistry([duplicate, duplicate]), /Duplicate file import registration/);
  assert.throws(() => fileImports.createFileImportRegistry([
    duplicate,
    { ...duplicate, definition: { ...duplicate.definition, kind: "other" } },
  ]), /Duplicate Node resource registration/);
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

  const originalFileReader = globalThis.FileReader;
  const originalDocument = globalThis.document;
  globalThis.FileReader = class {
    result = null; onload = null; onerror = null;
    readAsDataURL() { this.result = "data:image/png;base64,eA=="; this.onload?.(); }
  };
  globalThis.document = { createElement() {
    const image = { dataset: {} };
    Object.defineProperties(image, {
      src: { set(value) { image.source = value; } },
      alt: { set(value) { image.altText = value; } },
      outerHTML: { get() { return `<img src="${image.source}" alt="${image.altText}">`; } },
    });
    return image;
  } };
  try {
    const imageCreated = [];
    const image = new File(["x"], "cover.png", { type: "image/png" });
    const importedImage = await importer.importFileAsNode(image, null, {
      nodes: [], createNode(name, type, parentId, content) {
        imageCreated.push({ name, type, parentId, content }); return "image-node";
      },
    });
    assert.equal(importedImage.type, "imagen");
    assert.equal(imageCreated.length, 1);
    assert.ok(importedImage.content.includes("data:image/png"));
    assert.equal(resources.writes.length, 2, "inline Image does not call project-resource storage");
    assert.equal(resources.removals.length, 1, "inline Image does not register PDF cleanup");
  } finally {
    globalThis.FileReader = originalFileReader;
    globalThis.document = originalDocument;
  }
  console.log("PASS: import identity, resource association and failure cleanup.");
} finally { await server.close(); }
