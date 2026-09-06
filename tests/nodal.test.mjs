import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom" });
try {
  const { NODE_REGISTRY } = await server.ssrLoadModule("/src/defs/nodeTypes.ts");
  const definitions = NODE_REGISTRY.all();
  assert.equal(new Set(definitions.map((d) => d.type)).size, definitions.length);
  assert.deepEqual(definitions.filter((d) => d.selectOnCreation).map((d) => d.type), ["pagina", "curso", "tarea", "video"]);
  const { readFile } = await import("node:fs/promises");
  const backend = await readFile(new URL("../src-tauri/src/project.rs", import.meta.url), "utf8");
  for (const match of backend.matchAll(/CHECK\(type IN \(([^)]+)\)\)/g)) {
    const sqlTypes = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    // Legacy schemas in test fixtures intentionally accept fewer types.
    if (match.index > backend.indexOf("mod tests")) continue;
    assert.deepEqual(sqlTypes.sort(), definitions.map((d) => d.type).sort(), "SQLite and the registry must accept exactly the same types");
  }
  const nav = await server.ssrLoadModule("/src/hooks/useWorkspaceNavigation.ts");
  let history = { entries: [], index: -1 };
  assert.equal(nav.stepWorkspaceNavigation(history, -1), undefined);
  history = nav.recordWorkspaceVisit(history, { kind: "node", id: "a" });
  history = nav.recordWorkspaceVisit(history, { kind: "trash", id: "b" });
  assert.deepEqual(nav.stepWorkspaceNavigation(history, -1), { kind: "node", id: "a" });
  assert.equal(nav.recordWorkspaceVisit(history, { kind: "node", id: "a" }), history, "back navigation does not truncate forward history");
  assert.deepEqual(nav.stepWorkspaceNavigation(history, 1), { kind: "trash", id: "b" });
  nav.stepWorkspaceNavigation(history, -1);
  history = nav.recordWorkspaceVisit(history, { kind: "node", id: "c" });
  assert.equal(nav.stepWorkspaceNavigation(history, 1), undefined, "new visit replaces the forward branch");
  assert.deepEqual(history.entries.map((entry) => entry.id), ["a", "c"]);
  const nodal = await server.ssrLoadModule("/src/utils/nodalMeta.ts");
  const video = await server.ssrLoadModule("/src/utils/videoSource.ts");
  const webUrl = await server.ssrLoadModule("/src/utils/webUrl.ts");
  const base = (id, type, content = "<p><br></p>") => ({ id, name: id, type, parentId: null, order: 0, content });
  let nodes = [base("course", "curso"), base("task", "tarea"), base("pdf", "pdf"), base("calendar", "calendario")];

  nodes = nodal.withRelation(nodes, "task", "course", "course");
  nodes = nodal.withRelation(nodes, "course", "syllabus", "pdf");
  nodes = nodal.withRelation(nodes, "course", "calendar", "calendar");
  assert.equal(nodal.courseTasks(nodes, "course")[0].id, "task");
  assert.equal(nodal.relatedNode(nodes, nodes[0], "syllabus").id, "pdf");
  nodes = nodal.patchNodal(nodes, "task", { evaluation: true });
  assert.equal(nodal.courseTasks(nodes, "course", true)[0].id, "task", "evaluation is a projection of the same task");
  nodes = nodal.scheduleTask(nodes, "task", "tempo", "unused-calendar", "Calendar", "daily");
  assert.equal(nodes.filter((node) => node.type === "tempo").length, 1, "one Tempo is the only temporal source");
  assert.equal(nodal.calendarTempos(nodes, "calendar")[0].id, "tempo", "course Calendar projects its task Tempo");
  const withoutTask = nodes.filter((node) => node.id !== "task");
  assert.equal(nodal.courseTasks(withoutTask, "course").length, 0);
  assert.equal(nodal.courseTasks(nodes, "course")[0].id, "task", "restoring the same identity restores every projection");
  const tree = await server.ssrLoadModule("/src/utils/nodeTree.ts");
  const lore = await server.ssrLoadModule("/src/utils/loreTree.ts");
  const moved = tree.reorderNodes(nodes, "task", "course", "inside");
  assert.equal(moved.length, nodes.length);
  assert.equal(moved.find((n) => n.id === "task").content, nodes.find((n) => n.id === "task").content);
  assert.equal(moved.find((n) => n.id === "task").parentId, "course");
  assert.deepEqual(lore.setLoreMembership(nodes, ["task"], false).map((n) => n.id), nodes.map((n) => n.id));
  const reload = JSON.parse(JSON.stringify(nodes));
  assert.equal(nodal.courseTasks(reload, "course")[0].id, "task");
  assert.equal(nodal.calendarTempos(reload, "calendar")[0].id, "tempo");
  assert.equal(nodal.withRelation(nodes, "course", "syllabus", "task"), nodes, "invalid target is rejected");
  const dangling = nodes.filter((n) => n.id !== "pdf");
  assert.equal(nodal.relatedNode(dangling, dangling[0], "syllabus"), undefined);
  assert.equal(nodal.relationId(dangling[0], "syllabus"), "pdf", "deletion keeps semantic identity for restoration");
  const page = await server.ssrLoadModule("/src/utils/pageMeta.ts");
  const pdf = await server.ssrLoadModule("/src/utils/pdfResource.ts");
  const temporal = await server.ssrLoadModule("/src/utils/temporalMeta.ts");
  const special = "text --> <tag> & quotation \"";
  const pageContent = page.setPageMeta("<p>body</p>", { ...page.DEFAULT_PAGE_META, description: special });
  assert.equal(page.getPageMeta(pageContent).description, special);
  const replacementText = special + "   assert.equal(page.getPageMeta(pageContent).description, special); $";
  assert.equal(page.getPageMeta(page.setPageMeta(pageContent, { ...page.DEFAULT_PAGE_META, description: replacementText })).description, replacementText);
  assert.equal((pageContent.match(/-->/g) ?? []).length, 1);
  const pdfInfo = { resourceId: "resource", fileName: special, fileSize: 100, hash: "hash" };
  assert.deepEqual(pdf.getPdfResourceInfo(pdf.createPdfContent(pdfInfo)), pdfInfo);
  const tempoMeta = { ...temporal.getTempoMeta(""), date: "2026-09-05", color: "#112233" };
  const tempoContent = temporal.setTempoMeta("<p>body</p>", tempoMeta);
  assert.equal((tempoContent.match(/-->/g) ?? []).length, 1);
  assert.deepEqual(temporal.getTempoMeta(tempoContent), tempoMeta);
  const escaped = nodal.setNodalMeta("<p>body</p>", { description: "unsafe --> <tag>" });
  assert.equal(nodal.getNodalMeta(escaped).description, "unsafe --> <tag>");
  assert.equal((escaped.match(/<!--hisfuture-nodal-meta:/g) ?? []).length, 1);
  assert.equal(nodal.courseNodeName("2491.202620", "TALLER DE ARTES VISUALES", "SRM"), "2491.202620 - TALLER DE ARTES VISUALES (SRM)");

  assert.deepEqual(video.resolveVideoSource("https://youtu.be/abc123"), { kind: "embed", provider: "youtube", url: "https://www.youtube.com/embed/abc123" });
  assert.equal(video.resolveVideoSource("https://files.example/video.mp4").kind, "direct");
  assert.equal(video.resolveVideoSource("https://example.com/watch/1").kind, "external");
  assert.equal(webUrl.normalizeWebUrl("meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(webUrl.normalizeWebUrl(" https://example.com/room "), "https://example.com/room");
  assert.equal(webUrl.normalizeWebUrl("javascript:alert(1)"), null);
  console.log("PASS: Nodal relations, evaluation projection, Tempo/Calendar projection, safe metadata and video source resolution.");
} finally {
  await server.close();
}
