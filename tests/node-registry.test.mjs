import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({ root, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom" });
try {
  const registry = await server.ssrLoadModule("/src/nodes/registry.ts");
  const catalogs = await server.ssrLoadModule("/src/i18n/translations.ts");
  const definitions = registry.NODE_REGISTRY.all();
  const persistedTypes = ["categoria", "pagina", "imagen", "calendario", "tempo", "pdf", "curso", "tarea", "video"];

  assert.deepEqual(definitions.map(({ type }) => type), persistedTypes, "persisted Node IDs and order stay stable");
  assert.equal(new Set(definitions.map(({ type }) => type)).size, definitions.length);
  assert.equal(definitions.some((definition) => "renderer" in definition), false, "NodeDefinition remains pure presentation/domain data");
  const duplicateModule = { definition: definitions[0], renderer: "folder" };
  assert.throws(() => registry.createNodeRegistry([duplicateModule, duplicateModule]), /Duplicate Node type registration: categoria/);
  assert.equal(registry.NODE_REGISTRY.find("future-node"), null);
  assert.throws(() => registry.NODE_REGISTRY.get("future-node"), /Unknown Node type: future-node/);

  for (const definition of definitions) {
    assert.ok(definition.labelKey in catalogs.ES_TRANSLATIONS, `${definition.type} has a valid labelKey`);
    assert.ok(definition.nodeNameKey in catalogs.ES_TRANSLATIONS, `${definition.type} has a valid nodeNameKey`);
    assert.ok(definition.labelKey in catalogs.EN_TRANSLATIONS, `${definition.type} labelKey exists in English`);
    assert.ok(definition.nodeNameKey in catalogs.EN_TRANSLATIONS, `${definition.type} nodeNameKey exists in English`);
  }

  assert.deepEqual(Object.fromEntries(persistedTypes.map((type) => [type, registry.getNodeRenderer(type)])), {
    categoria: "folder", pagina: "page", imagen: "image", calendario: "calendar", tempo: "tempo",
    pdf: "pdf", curso: "course", tarea: "task", video: "video",
  });
  assert.equal(registry.getNodeRenderer("pagina-carpeta"), "page");
  assert.equal(registry.hasNodeCapability("categoria", "containChildren"), true);
  assert.equal(registry.hasNodeCapability("pagina", "containChildren"), false);
  assert.equal(registry.hasNodeCapability("pagina-carpeta", "containChildren"), true);
  assert.equal(registry.hasNodeCapability("categoria", "openOnPrimaryAction"), false);
  assert.equal(registry.hasNodeCapability("calendario", "navigateWithinView"), true);
  assert.equal(registry.hasNodeCapability("curso", "navigateWithinView"), true);
  assert.deepEqual(registry.getNodeRelationPolicy("curso").syllabus, { cardinality: "one", targetTypes: ["pdf"] });
  assert.deepEqual(registry.getNodeRelationPolicy("curso").class, { cardinality: "many", targetTypes: ["video"] });
  assert.deepEqual(registry.getNodeRelationPolicy("tarea").tempo, { cardinality: "one", targetTypes: ["tempo"] });
  assert.deepEqual(registry.getNodeRelationPolicy("tempo").calendar, { cardinality: "one", targetTypes: ["calendario"] });
  assert.deepEqual(registry.getNodeRelationPolicy("pagina"), {});
  assert.deepEqual(registry.NODE_REGISTRY.availableForCreation().map(({ type }) => type), ["categoria", "pagina", "curso", "tarea", "video"]);

  const workspace = fs.readFileSync(path.join(root, "src/components/AppWorkspace.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const appCss = fs.readFileSync(path.join(root, "src/App.css"), "utf8");
  const nodalStyles = fs.readFileSync(path.join(root, "src/nodes/styles.css"), "utf8");
  const courseStyles = fs.readFileSync(path.join(root, "src/nodes/course/styles.css"), "utf8");
  const pageStyles = fs.readFileSync(path.join(root, "src/nodes/page/styles.css"), "utf8");
  const pageHeader = fs.readFileSync(path.join(root, "src/nodes/page/header.tsx"), "utf8");
  const richTextEditor = fs.readFileSync(path.join(root, "src/components/RichTextEditor.tsx"), "utf8");
  const editorBlocks = fs.readFileSync(path.join(root, "src/hooks/useEditorBlocks.ts"), "utf8");
  const editorPersistence = fs.readFileSync(path.join(root, "src/utils/editorPersistence.ts"), "utf8");
  const graphView = fs.readFileSync(path.join(root, "src/components/GraphView.tsx"), "utf8");
  const nodeStore = fs.readFileSync(path.join(root, "src/hooks/useNodeStore.ts"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src/nodes/registry.ts"), "utf8");
  assert.equal(registrySource.includes("/renderer"), false, "metadata registry must not import React renderers");
  assert.equal(/selectedNode\.type\s*===/.test(workspace), false, "AppWorkspace must not regain global renderer branching");
  assert.equal(fs.existsSync(path.join(root, "src/components/NodalViews.tsx")), false, "the former cross-domain view container stays removed");
  assert.ok(workspace.includes("<RegisteredNodeView"));
  assert.ok(workspace.includes("host={nodeViewHost}"), "AppWorkspace supplies one grouped host contract");
  assert.equal(workspace.includes("createTempoNode"), false, "Calendar/Tempo creation belongs to the Calendar module");
  assert.equal(workspace.includes("renderCalendar"), false, "Calendar rendering belongs to its renderer owner");
  assert.ok(app.includes('import "./nodes/styles.css"'), "the application composes Node-owned styles after the shell");
  for (const type of ["course", "task", "video", "image", "pdf", "page"]) {
    assert.ok(nodalStyles.includes(`@import "./${type}/styles.css"`), `the Nodal stylesheet composes ${type} ownership`);
  }
  assert.equal(appCss.includes(".course-node-view"), false, "Course layout must not return to App.css");
  assert.equal(appCss.includes(".task-node-view"), false, "Task layout must not return to App.css");
  assert.equal(appCss.includes(".video-node-view"), false, "Video layout must not return to App.css");
  assert.equal(appCss.includes(".image-node-view"), false, "Image layout must not return to App.css");
  assert.equal(appCss.includes(".pdf-viewer"), false, "PDF viewer layout must not return to App.css");
  assert.equal(appCss.includes(".page-node-header"), false, "Page layout must not return to App.css");
  assert.ok(courseStyles.includes(".course-node-view"));
  assert.ok(courseStyles.includes(".course-schedule .calendar-node"), "Course owns its embedded Calendar presentation");
  assert.ok(pageStyles.includes(".page-node-editor"), "Page owns its editor surface overrides");
  assert.ok(pageStyles.includes(".page-node-header"), "Page owns its header presentation");
  assert.ok(richTextEditor.includes("controller.toggleLineSelection(clickedBlock)"), "Ctrl/Cmd click remains wired to block multi-selection");
  assert.ok(editorBlocks.includes("{ captureUndo: false, sync: false }"), "batch block deletion stays atomic");
  assert.ok(editorPersistence.includes("EDITOR_TRANSIENT_BLOCK_ATTRIBUTES"), "temporary block selection state must not persist in Node HTML");
  assert.equal(editorBlocks.includes("if (!hasTextLineAfter(block)) removeLine(block)"), false, "opening options must not delete an empty block");
  for (const phrase of ["Restablecer diseño", "Ancho del bloque", "Subir imagen", "Quitar portada", "Quitar icono"]) {
    assert.equal(pageHeader.includes(phrase), false, `Page header must translate ${phrase}`);
  }
  assert.equal(/node\.type\s*===\s*["'](?:imagen|tempo)["']/.test(graphView), false, "GraphView consumes owner runtime contributions");
  assert.equal(/item\.type\s*===\s*["']curso["']/.test(nodeStore), false, "Course rename behavior stays in its owner");
  assert.ok(nodeStore.includes('hasNodeCapability(node.type, "openOnPrimaryAction")'), "Recent Nodes reuse the declarative capability");
  for (const type of ["category", "page", "image", "calendar", "tempo", "pdf", "course", "task", "video"]) {
    assert.equal(fs.existsSync(path.join(root, `src/nodes/${type}/renderer.tsx`)), true, `${type} owns a renderer adapter`);
  }
  for (const file of ["category/view.tsx", "image/view.tsx", "calendar/view.tsx", "tempo/view.tsx", "pdf/view.tsx", "course/view.tsx", "task/view.tsx", "video/view.tsx", "page/header.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, "src/nodes", file)), true, `${file} is physically owned by its Node module`);
  }
  for (const file of ["course/runtime.ts", "image/runtime.ts", "tempo/runtime.ts"]) {
    assert.equal(fs.existsSync(path.join(root, "src/nodes", file)), true, `${file} owns its runtime contribution`);
  }
  for (const file of ["FolderNodeView.tsx", "ImageNodeView.tsx", "CalendarNodeView.tsx", "TempoInspector.tsx", "PdfNodeView.tsx", "PageNodeHeader.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, "src/components", file)), false, `${file} stays out of the shared component directory`);
  }

  const calendar = await server.ssrLoadModule("/src/nodes/calendar/operations.ts");
  const temporal = await server.ssrLoadModule("/src/utils/temporalMeta.ts");
  const operationNodes = [];
  const expanded = [];
  const selected = [];
  const host = {
    nodes: operationNodes,
    createNode(name, type, parentId, content = "") {
      const id = `${type}-${operationNodes.length + 1}`;
      operationNodes.push({ id, name, type, parentId, order: operationNodes.length, content });
      return id;
    },
    selectNode: (id) => selected.push(id),
    setExpanded: (update) => expanded.push(update({})),
    updateContent: (id, content) => {
      const node = operationNodes.find((item) => item.id === id);
      if (node) node.content = content;
    },
  };
  assert.equal(calendar.handleCalendarSlashCommand("OTHER", host), false);
  assert.equal(calendar.handleCalendarSlashCommand("CALENDARIO", host), true);
  assert.equal(operationNodes[0].type, "calendario");
  assert.equal(selected[0], operationNodes[0].id);
  const tempoId = calendar.createTempoNode(host, operationNodes[0].id, "2026-09-08", "09:00");
  assert.equal(operationNodes[1].type, "tempo");
  assert.deepEqual(expanded[0], { [operationNodes[0].id]: true });
  const movedMeta = { ...temporal.getTempoMeta(operationNodes[1].content), date: "2026-09-09" };
  calendar.moveTempoNode(host, tempoId, movedMeta);
  assert.equal(temporal.getTempoMeta(operationNodes[1].content).date, "2026-09-09");
  console.log("PASS: declarative Node registry, renderer ownership, capabilities, stable IDs and branching guard.");
} finally {
  await server.close();
}
