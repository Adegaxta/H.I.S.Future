import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  globalThis.DOMParser = class TestDOMParser {
    parseFromString(content) {
      return {
        querySelector: (selector) => selector === "img"
          ? { getAttribute: (name) => name === "src" ? "data:image/png;base64,AA==" : null, dataset: {} }
          : null,
        querySelectorAll: () => [...content.matchAll(/<[^>]*data-mention-id=(['"])(.*?)\1[^>]*>/g)].map((match) => ({ dataset: { mentionId: match[2] } })),
      };
    }
  };
  const graph = await server.ssrLoadModule("/src/graph/projection.ts");
  const preferences = await server.ssrLoadModule("/src/graph/preferences.ts");
  const nodal = await server.ssrLoadModule("/src/nodes/domain.ts");
  const calendarDomain = await server.ssrLoadModule("/src/nodes/calendar/projections.ts");
  const registry = await server.ssrLoadModule("/src/nodes/registry.ts");
  const translate = (key) => key;
  const base = (id, type, overrides = {}) => ({
    id,
    name: id,
    type,
    parentId: null,
    order: 0,
    content: "<p><br></p>",
    ...overrides,
  });
  const project = (nodes, showTypes = false) => graph.buildGraphProjection(nodes, { showTypes, translate });

  const realNodes = [
    base("hidden-page", "pagina", { loreHidden: true }),
    base("page-folder-child", "pagina", { parentId: "hidden-page", order: 4 }),
  ];
  const realProjection = project(realNodes);
  assert.deepEqual(realProjection.vertices.map((vertex) => vertex.id), realNodes.map((node) => node.id));
  assert.equal(realProjection.vertices.filter((vertex) => vertex.kind === "node").length, realNodes.length);
  assert.equal(realProjection.vertices.find((vertex) => vertex.id === "hidden-page").nodeType, "pagina");
  assert.equal(realProjection.vertices.some((vertex) => vertex.nodeType === "pagina-carpeta"), false);
  assert.equal(realProjection.vertices.find((vertex) => vertex.id === "hidden-page").provenance, "nodal-node");

  const imageProjection = project([base("image", "imagen", { content: "<p><img src=\"data:image/png;base64,AA==\"></p>" })]);
  assert.equal(imageProjection.vertices[0].imageSrc, "data:image/png;base64,AA==");

  const typeOff = project([base("course", "curso")], false);
  assert.equal(typeOff.vertices.some((vertex) => vertex.kind === "type-hub"), false);
  assert.equal(typeOff.vertices.some((vertex) => vertex.id === "course"), true);
  const typeOn = project([base("course", "curso")], true);
  const typeHubs = typeOn.vertices.filter((vertex) => vertex.kind === "type-hub");
  assert.deepEqual(typeHubs.map((vertex) => vertex.typeId).sort(), registry.NODE_REGISTRY.all().map((definition) => definition.type).sort());
  assert.equal(new Set(typeHubs.map((vertex) => vertex.typeId)).size, typeHubs.length);
  assert.equal(typeHubs.every((vertex) => vertex.provenance === "node-registry"), true);
  assert.equal(typeHubs.every((vertex) => vertex.nodeType), true);
  assert.equal(typeHubs.some((vertex) => vertex.id === "type-hub-pagina-carpeta"), false);
  assert.equal(typeOn.vertices.some((vertex) => vertex.id === "category-documents"), false);
  assert.equal(typeOn.edges.filter((edge) => edge.kind === "grouping").length, 1);
  assert.deepEqual(
    registry.NODE_REGISTRY.all().map((definition) => definition.type).sort(),
    ["calendario", "categoria", "curso", "imagen", "pagina", "pdf", "tarea", "tempo", "video"],
  );

  const courseWithRoles = {
    ...base("course", "curso"),
    content: nodal.setNodalMeta("<p>course</p>", {
      relations: [
        { role: "class", targetId: "video" },
        { role: "content", targetId: "video" },
      ],
    }),
  };
  const relationProjection = project([courseWithRoles, base("video", "video")]);
  const roleEdges = relationProjection.edges.filter((edge) => edge.kind === "nodal-relation");
  assert.deepEqual(roleEdges.map((edge) => edge.role), ["class", "content"]);
  assert.deepEqual(roleEdges.map((edge) => [edge.from, edge.to]), [["course", "video"], ["course", "video"]]);
  assert.equal(new Set(roleEdges.map((edge) => edge.role)).size, 2);

  const missingRelation = {
    ...base("missing-source", "curso"),
    content: nodal.setNodalMeta("", { relations: [{ role: "calendar", targetId: "missing-calendar" }] }),
  };
  const missingProjection = project([missingRelation]);
  assert.equal(missingProjection.edges[0].targetMissing, true);
  assert.deepEqual(missingProjection.diagnostics, [{
    code: "missing-target",
    kind: "nodal-relation",
    provenance: "nodal-metadata",
    sourceId: "missing-source",
    targetId: "missing-calendar",
    role: "calendar",
  }]);

  const mentionSource = base("page-a", "pagina", {
    content: "<p><span data-mention-id=\"page-b\">B</span><span data-mention-id=\"page-b\">B otra vez</span></p>",
  });
  const mentionProjection = project([mentionSource, base("page-b", "pagina")]);
  const mentionEdges = mentionProjection.edges.filter((edge) => edge.kind === "mention-reference");
  assert.equal(mentionEdges.length, 2);
  assert.deepEqual(mentionEdges.map((edge) => edge.occurrence), [0, 1]);
  assert.equal(mentionEdges.every((edge) => edge.provenance === "editor-content"), true);

  const mixedSource = {
    ...mentionSource,
    content: nodal.setNodalMeta(mentionSource.content, { relations: [{ role: "content", targetId: "page-b" }] }),
  };
  const mixedProjection = project([mixedSource, base("page-b", "pagina")]);
  assert.deepEqual(
    mixedProjection.edges.map((edge) => edge.kind),
    ["mention-reference", "mention-reference", "nodal-relation"],
  );
  assert.equal(mixedProjection.edges.length, 3);

  const missingMention = base("mention-missing", "pagina", {
    content: "<p><span data-mention-id=\"deleted-node\">deleted</span></p>",
  });
  const missingMentionProjection = project([missingMention]);
  assert.equal(missingMentionProjection.edges[0].targetMissing, true);
  assert.equal(missingMentionProjection.diagnostics[0].kind, "mention-reference");

  const calendar = base("calendar", "calendario");
  const legacyTempo = base("tempo", "tempo", { parentId: calendar.id });
  const legacyProjection = project([calendar, legacyTempo]);
  assert.deepEqual(legacyProjection.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind, derived: edge.derived })), [{
    from: "calendar",
    to: "tempo",
    kind: "legacy-runtime-derived",
    derived: true,
  }]);

  const explicitTempo = {
    ...legacyTempo,
    content: nodal.setNodalMeta("", { relations: [{ role: "calendar", targetId: calendar.id }] }),
  };
  const explicitTempoProjection = project([calendar, explicitTempo]);
  assert.deepEqual(
    explicitTempoProjection.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind, role: edge.role })),
    [{ from: "tempo", to: "calendar", kind: "nodal-relation", role: "calendar" }],
    "explicit relation takes precedence over equivalent legacy runtime fallback",
  );

  const course = base("course-calendar", "curso", {
    content: nodal.setNodalMeta("", { relations: [{ role: "calendar", targetId: calendar.id }] }),
  });
  const task = base("task-calendar", "tarea", {
    content: nodal.setNodalMeta("", {
      relations: [
        { role: "course", targetId: course.id },
        { role: "tempo", targetId: "projected-tempo" },
      ],
    }),
  });
  const projectedTempo = base("projected-tempo", "tempo");
  const domainFixture = [calendar, course, task, projectedTempo];
  assert.deepEqual(calendarDomain.calendarTempos(domainFixture, calendar.id).map((node) => node.id), [projectedTempo.id]);
  const domainProjection = project(domainFixture);
  assert.deepEqual(
    domainProjection.edges.filter((edge) => edge.from === calendar.id || edge.to === calendar.id),
    [{ from: course.id, to: calendar.id, kind: "nodal-relation", provenance: "nodal-metadata", role: "calendar", derived: false, targetMissing: false }],
    "Calendar view membership does not become a second Calendar-Tempo graph fact",
  );
  assert.equal(domainProjection.edges.some((edge) => edge.from === calendar.id && edge.to === projectedTempo.id), false);
  assert.equal(domainProjection.edges.some((edge) => edge.from === course.id && edge.to === task.id), false);
  assert.equal(domainProjection.edges.some((edge) => edge.from === course.id && edge.to === projectedTempo.id), false);

  const withoutTaskTempo = domainFixture.map((node) => node.id === task.id
    ? { ...node, content: nodal.setNodalMeta("", { relations: [{ role: "course", targetId: course.id }] }) }
    : node);
  assert.deepEqual(calendarDomain.calendarTempos(withoutTaskTempo, calendar.id).map((node) => node.id), []);
  assert.equal(project(withoutTaskTempo).edges.some((edge) => edge.from === calendar.id && edge.to === projectedTempo.id), false);

  const hierarchyOnly = project([base("parent", "categoria"), base("child", "pagina", { parentId: "parent", order: 3 })]);
  assert.equal(hierarchyOnly.edges.some((edge) => edge.from === "parent" && edge.to === "child"), false);
  assert.equal(hierarchyOnly.edges.some((edge) => edge.kind === "lore-hierarchy"), false);

  const input = [courseWithRoles, base("video", "video")];
  const snapshot = JSON.parse(JSON.stringify(input));
  const first = project(input, true);
  const second = project(input, true);
  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.equal(input[0].content, snapshot[0].content);

  const storage = new Map();
  const storageApi = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  assert.equal(preferences.readGraphBooleanPreference(storageApi, "types", false), false);
  assert.equal(preferences.readGraphBooleanPreference(storageApi, "icons", false), false);
  assert.equal(preferences.readGraphBooleanPreference(storageApi, "images", true), true);
  storage.set("legacy-concepts", "true");
  assert.equal(preferences.readGraphBooleanPreference(storageApi, "types", false, "legacy-concepts"), true);
  assert.equal(storage.get("types"), "true");
  assert.deepEqual(project([base("isolated", "pagina")]), project([base("isolated", "pagina")], false));
  const graphViewSource = fs.readFileSync(new URL("../src/graph/view.tsx", import.meta.url), "utf8");
  assert.ok(graphViewSource.includes("point.imageSrc && showImages"));
  assert.ok(graphViewSource.includes("showIcons ?"));
  assert.ok(graphViewSource.includes("<NodeIcon type={point.nodeType!}"));

  console.log("PASS: Graph projection preserves Type Hubs, Nodal, mention, grouping and Tempo legacy semantics without mutation.");
} finally {
  await server.close();
}
