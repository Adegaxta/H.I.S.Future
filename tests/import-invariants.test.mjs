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
      if (importer && /nodes\/(?:pdf|image)\/fileImport\.ts$/.test(importer.replaceAll("\\", "/"))) {
        if (source === "../../pdf/pdfjs") return "\0test-pdf";
        if (source === "../../project/resourceRepository") return "\0test-resources";
      }
    },
    load(id) {
      if (id === "\0test-pdf") return 'export const getDocument = () => ({ promise: Promise.resolve({}), destroy: async () => {} });';
      if (id === "\0test-resources") return `
        export const writes = []; export const removals = []; let fail = false;
        export function failWrites(value) { fail = value; }
        export async function storeProjectResource(kind, id, data, extension) { if (fail) throw new Error("disk unavailable"); writes.push({ kind, id, data, extension }); return kind === "image" ? { extension: (extension || "png").replace(/^(jpeg|jfif)$/i, "jpg").toLowerCase(), mimeType: "image/png" } : { extension: "pdf", mimeType: "application/pdf" }; }
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
    ["image", "imagen", "project-resource"],
    ["pdf", "pdf", "project-resource"],
  ]);
  assert.ok(fileImports.fileImportAccept(["imagen"]).includes("image/*"));
  assert.ok(fileImports.fileImportAccept(["imagen"]).includes(".jpeg"));
  assert.equal(fileImports.fileImportAccept(["imagen"]).includes(".pdf"), false);
  assert.deepEqual(resourceRegistry.PROJECT_RESOURCE_DEFINITIONS, [
    { kind: "pdf", nodeType: "pdf", extension: "pdf" },
    { kind: "image", nodeType: "imagen", extension: "png" },
  ]);
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

  const originalDOMParser = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString(source) {
      const attribute = (name) => source.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
      return { querySelector: () => ({
        getAttribute: (name) => name === "src" ? attribute("src") : null,
        dataset: {
          imageFileName: attribute("data-image-file-name"),
          imageHash: attribute("data-image-hash"),
          imageDescription: "",
        },
      }) };
    }
  };
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
    assert.ok(importedImage.content.includes("hisfuture-image-resource"));
    assert.ok(!importedImage.content.includes("data:image"));
    assert.equal(resources.writes.length, 3, "Image writes one canonical project resource");
    assert.equal(resources.removals.length, 1, "successful Image import does not roll back its resource");
    let duplicateCreations = 0;
    const reusedImage = await importer.importFileAsNode(new File(["x"], "copy.png", { type: "image/png" }), null, {
      nodes: [importedImage],
      createNode() { duplicateCreations += 1; return "unexpected-duplicate"; },
    });
    assert.equal(reusedImage.id, importedImage.id);
    assert.equal(duplicateCreations, 0, "the same canonical image is reused by identity");
    assert.equal(resources.writes.length, 3, "reusing an image does not duplicate the physical binary");

    let sameNameCreations = 0;
    const differentPixels = new File(["different pixels"], "cover.png", { type: "image/png" });
    const sameNameExisting = {
      id: "old-cover", type: "imagen", name: "cover.png", parentId: null, order: 0,
      content: '<p><img src="data:image/png;base64,b2xk" data-image-file-name="cover.png" data-image-hash="old-hash"></p>',
    };
    const distinctImage = await importer.importFileAsNode(differentPixels, null, {
      nodes: [sameNameExisting],
      createNode() { sameNameCreations += 1; return "new-cover"; },
    });
    assert.equal(sameNameCreations, 1, "images with the same display name but different bytes stay distinct");
    assert.equal(distinctImage.id, "new-cover");
  } finally {
    globalThis.DOMParser = originalDOMParser;
  }
  console.log("PASS: import identity, resource association and failure cleanup.");
} finally { await server.close(); }
