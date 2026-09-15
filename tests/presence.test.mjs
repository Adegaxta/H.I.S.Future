import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  root,
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { presenceActivityFingerprint, projectPresence } = await server.ssrLoadModule(
    "/src/presence/projectPresence.ts",
  );
  const inEnglish = (context) => projectPresence({ ...context, locale: "en" });
  const inSpanish = (context) => projectPresence({ ...context, locale: "es" });

  assert.deepEqual(inEnglish({ surface: "workspace", nodeType: "pagina" }), {
    details: "Editing a Page",
    state: "H.I.S. Future",
    largeImage: "hisfuture_icon",
    largeText: "H.I.S. Future",
    smallImage: "node_page",
    smallText: "Page",
  });

  const supportedAssets = [
    ["pagina", "node_page", "Page", "Editing a Page"],
    ["pagina-carpeta", "node_page", "Page", "Editing a Page"],
    ["calendario", "node_calendar", "Calendar", "Viewing Calendar"],
    ["tempo", "node_tempo", "Tempo", "Viewing Tempo"],
    ["proyecto", "node_project", "Project", "Working in H.I.S. Future"],
    ["curso", "node_course", "Course", "Viewing a Course"],
    ["pdf", "node_pdf", "PDF", "Reading PDF"],
    ["imagen", "node_image", "Image", "Viewing Image"],
    ["video", "node_video", "Video", "Watching Video"],
  ];
  for (const [nodeType, smallImage, smallText, details] of supportedAssets) {
    const activity = inEnglish({ surface: "workspace", nodeType });
    assert.equal(activity.largeImage, "hisfuture_icon");
    assert.equal(activity.largeText, "H.I.S. Future");
    assert.equal(activity.smallImage, smallImage);
    assert.equal(activity.smallText, smallText);
    assert.equal(activity.details, details);
  }

  const graph = inEnglish({ surface: "graph" });
  assert.equal(graph.details, "Viewing Graph");
  assert.equal(graph.smallImage, "graph_7");
  assert.equal(graph.smallText, "Graph");

  const generic = inEnglish({ surface: "workspace", nodeType: "tarea" });
  assert.equal(generic.details, "Working on a Task");
  assert.equal(generic.largeImage, "hisfuture_icon");
  assert.equal("smallImage" in generic, false);
  assert.equal("smallText" in generic, false);

  const fallback = inEnglish({ surface: "home" });
  assert.equal(fallback.details, "Working in H.I.S. Future");
  assert.equal(fallback.largeImage, "hisfuture_icon");
  assert.equal("smallImage" in fallback, false);

  assert.equal(
    presenceActivityFingerprint(inEnglish({ surface: "workspace", nodeType: "pagina" })),
    presenceActivityFingerprint(inEnglish({ surface: "workspace", nodeType: "pagina" })),
  );
  assert.notEqual(
    presenceActivityFingerprint(inEnglish({ surface: "workspace", nodeType: "pagina" })),
    presenceActivityFingerprint(inEnglish({ surface: "workspace", nodeType: "pdf" })),
  );

  assert.deepEqual(inSpanish({ surface: "workspace", nodeType: "pagina" }), {
    details: "Editando una página",
    state: "H.I.S. Future",
    largeImage: "hisfuture_icon",
    largeText: "H.I.S. Future",
    smallImage: "node_page",
    smallText: "Página",
  });
  assert.equal(inSpanish({ surface: "graph" }).details, "Viendo el grafo");
  assert.equal(inSpanish({ surface: "graph" }).smallText, "Grafo");
  assert.equal(inSpanish({ surface: "home" }).details, "Trabajando en H.I.S. Future");
  assert.notEqual(
    presenceActivityFingerprint(inEnglish({ surface: "workspace", nodeType: "pagina" })),
    presenceActivityFingerprint(inSpanish({ surface: "workspace", nodeType: "pagina" })),
  );

  const serialized = JSON.stringify(inSpanish({
    surface: "workspace",
    nodeType: "pagina",
    projectName: "Private Project",
    nodeName: "Private Page",
    content: "Private editor content",
    path: "C:\\Private\\vault.his",
  }));
  for (const privateValue of ["Private Project", "Private Page", "Private editor content", "vault.his"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  console.log("PASS: Presence projection maps semantic state and excludes private names, content and paths.");
} finally {
  await server.close();
}
