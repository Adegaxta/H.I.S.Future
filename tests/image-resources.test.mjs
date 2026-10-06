import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { createProjectImageContent, getProjectImageResourceInfo } =
    await server.ssrLoadModule("/src/utils/imageResource.ts");
  const { stripTransientEditorState } =
    await server.ssrLoadModule("/src/editor/serialization.ts");
  const { analyzeSource } =
    await server.ssrLoadModule("/src/nodes/inspector/sourceAnalysis.ts");

  const metadata = {
    resourceId: "image-resource-1",
    fileName: "Ilustración grande.png",
    fileSize: 8_000_000,
    mimeType: "image/png",
    extension: "png",
    hash: "ab".repeat(32),
    description: "Descripción",
    provenance: null,
  };
  const content = createProjectImageContent(metadata);
  const parsed = getProjectImageResourceInfo(content);
  assert.deepEqual(parsed, { storage: "project-resource", version: 2, ...metadata });
  assert.ok(content.length < 500, "an Image Node stores metadata, not the binary");
  assert.doesNotMatch(content, /(?:data:image|blob:)/i);

  const mention = '<span class="editor-mention" data-mention-id="image-node-1" data-mention-mode="full"><img data-his-image-placeholder="true" data-no-resize="true" alt="Ilustración grande.png"></span>';
  assert.ok(mention.length < 300, "a Page mention is a small semantic reference");
  assert.doesNotMatch(mention, /(?:data:image|blob:)/i);

  const hydrated = '<p>antes</p><span data-mention-id="image-node-1"><img data-his-image-placeholder="true" data-his-runtime-image="true" src="blob:https://runtime/not-persistable" alt="Ilustración"></span><p>después</p>';
  const persisted = stripTransientEditorState(hydrated);
  assert.doesNotMatch(persisted, /blob:/i, "runtime object URLs never cross serialization");
  assert.doesNotMatch(persisted, /data-his-runtime-image/i);
  assert.match(persisted, /data-his-image-placeholder="true"/,
    "the persistent hydration marker remains stable for reopen and undo");
  assert.equal(stripTransientEditorState(persisted), persisted,
    "serialization is stable across undo/redo snapshots");

  const globeRuntime = '<div data-globe="true"><span data-globe-icon="true"><img data-node-id="image-node-1" data-his-image-placeholder="true" data-his-runtime-image="true" src="blob:https://runtime/globe"></span></div>';
  const persistedGlobe = stripTransientEditorState(globeRuntime);
  assert.doesNotMatch(persistedGlobe, /blob:/i);
  assert.match(persistedGlobe, /data-node-id="image-node-1"/,
    "Globe keeps semantic image identity while dropping its runtime source");

  const documentary = '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="legacy"><img src="https://example.test/image.png" alt="external"></p>';
  assert.equal(stripTransientEditorState(documentary), documentary,
    "legacy and external documentary sources are not removed accidentally");

  const inspected = analyzeSource(content);
  assert.equal(inspected.resources.length, 1);
  assert.equal(inspected.resources[0].representation, "project-resource");
  assert.equal(inspected.resources[0].internalId, metadata.resourceId);
  const anomalous = analyzeSource('<p><img src="blob:https://runtime/persisted"></p>');
  assert.equal(anomalous.resources[0].representation, "blob-url");

  console.log("Image resource representation and serialization tests passed.");
} finally {
  await server.close();
}
