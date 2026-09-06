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

  let generated = 0;
  const allocate = () => 'generated-' + (++generated);
  const legacyCourse = { ...base('legacy-course', 'curso'), name: '2491.202620 - TALLER DE ARTES VISUALES (SRM)', content: nodal.setNodalMeta('', {code: '2491.202620', courseTitle: 'TALLER DE ARTES VISUALES', modality: 'SRM'}) };
  let repaired = nodal.reconcileCourseCalendars([legacyCourse], [], 'Calendario', allocate);
  const calendarId = nodal.relationId(repaired.nodes[0], 'calendar');
  const createdCalendar = repaired.nodes.find(n => n.id === calendarId);
  assert.equal(generated, 1);
  assert.equal(createdCalendar.type, 'calendario');
  assert.equal(createdCalendar.name, 'Calendario - TALLER DE ARTES VISUALES');
  assert.equal(createdCalendar.loreHidden, true);
  assert.equal(createdCalendar.parentId, null, 'synchronization does not use hierarchy');
  for (let count = 0; count < 10; count++) {
    const again = nodal.reconcileCourseCalendars(repaired.nodes, repaired.deletedNodes, 'Calendario', allocate);
    assert.equal(again.nodes, repaired.nodes, 'unchanged reconciliation is referentially idempotent');
    repaired = again;
  }
  assert.equal(generated, 1, 'opening/rendering cannot allocate extra Calendars');
  const renamed = nodal.patchNodal(repaired.nodes, legacyCourse.id, {courseTitle:'ARTES', code:'other', modality:'other'});
  repaired = nodal.reconcileCourseCalendars(renamed, [], 'Calendario', allocate);
  assert.equal(nodal.relatedNode(repaired.nodes, repaired.nodes[0], 'calendar').name, 'Calendario - ARTES');
  assert.equal(nodal.relationId(repaired.nodes[0], 'calendar'), calendarId);
  const reopened = nodal.reconcileCourseCalendars(JSON.parse(JSON.stringify(repaired.nodes)), [], 'Calendario', allocate);
  assert.equal(nodal.relationId(reopened.nodes[0], 'calendar'), calendarId);
  assert.equal(generated, 1);
  const extra = base('independent-material', 'pdf');
  const withMaterial = nodal.withRelation([...repaired.nodes, extra], legacyCourse.id, 'syllabus', extra.id);
  const deletion = nodal.synchronizedNodeIds(withMaterial, [legacyCourse.id]);
  assert.equal(deletion.has(calendarId), true, 'Course deletion includes its synchronized Calendar');
  assert.equal(deletion.has(extra.id), false, 'ordinary references are independent');
  const trash = withMaterial.filter(n => deletion.has(n.id));
  assert.deepEqual(nodal.synchronizedNodeIds(trash, [legacyCourse.id]), deletion, 'restoration and permanent deletion preserve the synchronization unit');
  const recovered = nodal.reconcileCourseCalendars([repaired.nodes[0]], [createdCalendar], 'Calendario', allocate);
  assert.equal(recovered.deletedNodes.length, 0);
  assert.equal(nodal.relationId(recovered.nodes[0], 'calendar'), calendarId);
  assert.equal(generated, 1, 'reuse the Calendar in trash instead of creating another');
  const broken = nodal.withRelation([legacyCourse, base('wrong', 'calendario')], legacyCourse.id, 'calendar', 'wrong').filter(n => n.id !== 'wrong');
  assert.equal(nodal.reconcileCourseCalendars(broken, [], 'Calendar', allocate).nodes[1].name, 'Calendar - TALLER DE ARTES VISUALES');

  assert.equal(nodal.courseTitleFromName({ ...legacyCourse, name: '2491.202620 - NUEVO (SRM)' }), 'NUEVO');
  const childTempo = { ...base('calendar-child-tempo', 'tempo'), parentId: calendarId };
  const recoveredTree = nodal.reconcileCourseCalendars([repaired.nodes[0]], [createdCalendar, childTempo], 'Calendario', allocate);
  assert.equal(recoveredTree.deletedNodes.length, 0);
  assert.ok(recoveredTree.nodes.some(n => n.id === childTempo.id), 'recover Calendar contents together with its existing identity');
  assert.equal(nodal.courseAwareDeletionIds(withMaterial, [calendarId]).size, 0, 'the mandatory Calendar cannot be deleted independently');
  assert.deepEqual(nodal.courseAwareDeletionIds(withMaterial, [legacyCourse.id]), deletion);
  assert.equal(nodal.reconcileCourseCalendars(repaired.nodes, [], 'Calendario', allocate).nodes, repaired.nodes);

  // An old Course keeps every field and reference; only its missing Calendar is added.
  const legacyBody = '<p>Apuntes originales que no se deben trasladar ni perder.</p>';
  const populatedLegacy = { ...legacyCourse, parentId: 'folder', order: 7, content: nodal.setNodalMeta(legacyBody, {
    ...nodal.getNodalMeta(legacyCourse.content), description: 'Descripción original',
    url: 'https://example.com/curso', roomLinks: [{ id: 'room', label: 'Aula', url: 'https://example.com/aula' }],
    relations: [{ role: 'syllabus', targetId: extra.id }],
  }) };
  const safetyInput = [base('folder', 'categoria'), populatedLegacy, extra];
  assert.equal(nodal.hasMissingCourseCalendar(safetyInput), true);
  const safetyResult = nodal.reconcileCourseCalendars(safetyInput, [], 'Calendario', allocate);
  const preservedCourse = safetyResult.nodes.find(n => n.id === populatedLegacy.id);
  assert.deepEqual({ ...preservedCourse, content: populatedLegacy.content }, populatedLegacy);
  assert.ok(preservedCourse.content.endsWith(legacyBody));
  assert.deepEqual({ ...nodal.getNodalMeta(preservedCourse.content), relations: [] }, { ...nodal.getNodalMeta(populatedLegacy.content), relations: [] });
  assert.equal(nodal.relationId(preservedCourse, 'syllabus'), extra.id);
  assert.equal(nodal.hasMissingCourseCalendar(safetyResult.nodes), false);
  const allocationCount = generated;
  for (let count = 0; count < 10; count++) {
    assert.equal(nodal.reconcileCourseCalendars(safetyResult.nodes, [], 'Calendario', allocate).nodes, safetyResult.nodes);
  }
  assert.equal(generated, allocationCount);
  const absentTarget = safetyResult.nodes.filter(n => n.type !== 'calendario');
  assert.equal(nodal.hasMissingCourseCalendar(absentTarget), true);
  assert.equal(nodal.hasMissingCourseCalendar(safetyResult.nodes.map(n => n.type === 'calendario' ? { ...n, type: 'pagina' } : n)), true);
  assert.equal(nodal.hasMissingCourseCalendar([extra]), false);
  console.log('PASS: automatic safety repair preserves the old Course and all its information without duplicate Calendars.');
  const courseView = await readFile(new URL('../src/components/NodalViews.tsx', import.meta.url), 'utf8');
  const workspaceView = await readFile(new URL('../src/components/AppWorkspace.tsx', import.meta.url), 'utf8');
  assert.equal(courseView.includes('CourseCalendarPreview'), false);
  assert.ok(courseView.includes('props.renderCalendar(calendar, true)'));
  assert.ok(workspaceView.includes('renderCalendar={renderCalendar}'));
  assert.ok(workspaceView.includes('renderCalendar(selectedNode)'));
  console.log('PASS: Course Calendar identity, hidden creation, rename, idempotent migration, reopening and synchronized lifecycle.');
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
