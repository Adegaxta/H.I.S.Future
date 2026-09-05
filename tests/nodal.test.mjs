import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
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
