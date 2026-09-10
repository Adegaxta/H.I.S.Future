import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const registry = await server.ssrLoadModule("/src/nodes/registry.ts");
  const catalogs = await server.ssrLoadModule("/src/i18n/translations.ts");
  const definitions = registry.NODE_REGISTRY.all();
  const persistedTypes = ["categoria", "pagina", "proyecto", "imagen", "calendario", "tempo", "pdf", "curso", "tarea", "video"];

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
    categoria: "folder", pagina: "page", proyecto: "project", imagen: "image", calendario: "calendar", tempo: "tempo",
    pdf: "pdf", curso: "course", tarea: "task", video: "video",
  });
  assert.equal(registry.getNodeRenderer("pagina-carpeta"), "page");
  assert.equal(registry.hasNodeCapability("categoria", "containChildren"), true);
  assert.equal(registry.hasNodeCapability("pagina", "containChildren"), false);
  assert.equal(registry.hasNodeCapability("pagina-carpeta", "containChildren"), true);
  assert.equal(registry.hasNodeCapability("categoria", "openOnPrimaryAction"), false);
  assert.equal(registry.hasNodeCapability("calendario", "navigateWithinView"), true);
  assert.equal(registry.hasNodeCapability("curso", "navigateWithinView"), true);
  assert.equal(registry.getNodeDefinition("proyecto").color, "#FFFFFF", "Project Node is white");
  assert.deepEqual(registry.getNodeDefinition("proyecto").composition.capabilities.map(({ id }) => id), ["rich-text"], "v1 declares only behavior with a real reusable implementation");
  assert.equal(registry.hasComposableNodeCapability("proyecto", "rich-text"), true);
  assert.equal(registry.getComposableNodeCapability("proyecto", "rich-text").id, "rich-text");
  assert.equal(registry.getComposableNodeCapability("pagina", "rich-text"), null, "Page has not been migrated to capability declarations");
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
  const calendarStyles = fs.readFileSync(path.join(root, "src/nodes/calendar/styles.css"), "utf8");
  const tempoStyles = fs.readFileSync(path.join(root, "src/nodes/tempo/styles.css"), "utf8");
  const calendarView = fs.readFileSync(path.join(root, "src/nodes/calendar/view.tsx"), "utf8");
  const pageHeader = fs.readFileSync(path.join(root, "src/nodes/page/header.tsx"), "utf8");
  const richTextEditor = fs.readFileSync(path.join(root, "src/editor/RichTextEditor.tsx"), "utf8");
  const projectRenderer = fs.readFileSync(path.join(root, "src/nodes/project/renderer.tsx"), "utf8");
  const composableContent = fs.readFileSync(path.join(root, "src/nodes/capabilities/ComposableNodeContent.tsx"), "utf8");
  const editorBlocks = fs.readFileSync(path.join(root, "src/editor/useEditorBlocks.ts"), "utf8");
  const imageResize = fs.readFileSync(path.join(root, "src/editor/imageResize.ts"), "utf8");
  const editorPersistence = fs.readFileSync(path.join(root, "src/editor/persistence.ts"), "utf8");
  const editorStyles = fs.readFileSync(path.join(root, "src/editor/styles.css"), "utf8");
  const workspacePanelStyles = fs.readFileSync(path.join(root, "src/workspace/panels/styles.css"), "utf8");
  const workspaceNavigationStyles = fs.readFileSync(path.join(root, "src/workspace/navigation/styles.css"), "utf8");
  const uiStyles = fs.readFileSync(path.join(root, "src/ui/styles.css"), "utf8");
  const nodeIconStyles = fs.readFileSync(path.join(root, "src/nodes/iconStyles.css"), "utf8");
  const graphView = fs.readFileSync(path.join(root, "src/graph/view.tsx"), "utf8");
  const graphStyles = fs.readFileSync(path.join(root, "src/graph/styles.css"), "utf8");
  const nodeStore = fs.readFileSync(path.join(root, "src/hooks/useNodeStore.ts"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src/nodes/registry.ts"), "utf8");
  const workspaceLifecycle = fs.readFileSync(path.join(root, "src/workspace/useWorkspaceLifecycle.ts"), "utf8");
  const workspaceImports = fs.readFileSync(path.join(root, "src/workspace/useFileNodeImports.ts"), "utf8");
  const projectCover = fs.readFileSync(path.join(root, "src/workspace/useProjectCover.ts"), "utf8");
  const backendPersistence = fs.readFileSync(path.join(root, "src-tauri/src/persistence.rs"), "utf8");
  const backendProject = fs.readFileSync(path.join(root, "src-tauri/src/project.rs"), "utf8");
  const fileImportRegistry = fs.readFileSync(path.join(root, "src/project/fileImportRegistry.ts"), "utf8");
  const resourceRegistry = fs.readFileSync(path.join(root, "src/project/resourceRegistry.ts"), "utf8");
  const fileImporter = fs.readFileSync(path.join(root, "src/project/fileNodeImporter.ts"), "utf8");
  assert.equal(registrySource.includes("/renderer"), false, "metadata registry must not import React renderers");
  assert.ok(backendPersistence.includes("PERSISTED_NODE_TYPES"), "the backend owns one persistence registry");
  assert.ok(backendPersistence.includes("nodes_table_sql"), "SQLite schema is generated from the persistence registry");
  assert.ok(backendProject.includes('is_persisted_node_type'), "workspace saves validate through the persistence registry");
  assert.equal(backendProject.split("#[cfg(test)]")[0].includes("CHECK(type IN ('categoria'"), false, "project orchestration must not duplicate persisted type SQL");
  assert.ok(fileImportRegistry.includes("FILE_IMPORT_MODULES"), "file recognition is composed through one import registry");
  assert.ok(resourceRegistry.includes("PROJECT_RESOURCE_DEFINITIONS"), "frontend resource calls derive their kind from one registry");
  const frontendResourceDefs = [...resourceRegistry.matchAll(/\{ kind: "([^"]+)", nodeType: "([^"]+)", extension: "([^"]+)" \}/g)].map((match) => match.slice(1));
  const backendResourceDefs = [...backendPersistence.matchAll(/ProjectResourceDefinition \{\s*kind: "([^"]+)",\s*node_type: "([^"]+)",\s*extension: "([^"]+)"/g)].map((match) => match.slice(1));
  assert.deepEqual(backendResourceDefs, frontendResourceDefs, "frontend and backend project-resource contracts must stay identical");
  assert.equal(backendProject.includes('kind == "pdf"'), false, "backend resource orchestration must not branch on PDF");
  for (const resourceDetail of ["application/pdf", "image/", 'kind === "pdf"', 'kind === "image"', 'type === "imagen"']) {
    assert.equal(fileImporter.includes(resourceDetail), false, `generic importer must not own ${resourceDetail}`);
  }
  assert.equal(/selectedNode\.type\s*===/.test(workspace), false, "AppWorkspace must not regain global renderer branching");
  assert.equal(fs.existsSync(path.join(root, "src/components/NodalViews.tsx")), false, "the former cross-domain view container stays removed");
  assert.ok(workspace.includes("<RegisteredNodeView"));
  assert.ok(workspace.includes("host={nodeViewHost}"), "AppWorkspace supplies one grouped host contract");
  assert.equal(workspace.includes("createTempoNode"), false, "Calendar/Tempo creation belongs to the Calendar module");
  assert.equal(workspace.includes("renderCalendar"), false, "Calendar rendering belongs to its renderer owner");
  for (const implementationDetail of ["readEditorContent", "onCloseRequested", "importFileAsNode", "findImportableFile", "createImageContent", "MAX_LOCAL_STORAGE_STRING_BYTES"]) {
    assert.equal(workspace.includes(implementationDetail), false, `AppWorkspace delegates ${implementationDetail}`);
  }
  assert.ok(workspace.includes("useWorkspaceLifecycle"), "workspace composes the save/close lifecycle service");
  assert.ok(workspace.includes("useFileNodeImports"), "workspace composes the file import service");
  assert.ok(workspace.includes("useProjectCover"), "workspace composes the project cover service");
  assert.ok(workspace.includes("useSidebarResize"), "workspace composes the sidebar resize controller");
  assert.ok(workspace.includes("usePendingEditorFocus"), "editor owns its pending DOM focus behavior");
  assert.equal(workspace.includes('document.createRange()'), false, "AppWorkspace does not manipulate editor selection directly");
  assert.equal(workspace.includes('window.addEventListener("mousemove"'), false, "AppWorkspace does not own resize listeners");
  assert.ok(workspaceLifecycle.includes("getWorkspaceSnapshot"), "lifecycle owns the live editor snapshot boundary");
  assert.ok(workspaceImports.includes("resolveDropParentId"), "file imports own DOM drop resolution");
  assert.ok(projectCover.includes("safeLocalStorageSet"), "project cover owns its local compatibility pointer");
  assert.equal(fs.existsSync(path.join(root, "src/workspace/useSidebarResize.ts")), true);
  assert.equal(fs.existsSync(path.join(root, "src/editor/usePendingEditorFocus.ts")), true);
  for (const panel of ["TrashPanel.tsx", "TrashNodeView.tsx", "ChangelogPanel.tsx", "ProjectSettingsPanel.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, "src/workspace/panels", panel)), true, `workspace panel owns ${panel}`);
  }
  for (const file of ["SidebarTree.tsx", "NodePanels.tsx", "styles.css"]) {
    assert.equal(fs.existsSync(path.join(root, "src/workspace/navigation", file)), true, `navigation owns ${file}`);
  }
  for (const file of ["SidebarTree.tsx", "NodePanels.tsx", "SidebarIcon.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, "src/components", file)), false, `${file} stays out of shared components`);
  }
  assert.equal(fs.existsSync(path.join(root, "src/ui/Icon.tsx")), true, "generic action icons live in UI");
  assert.equal(fs.existsSync(path.join(root, "src/nodes/NodeIcon.tsx")), true, "typed Node icons live in Nodes");
  for (const implementationDetail of ["TrashNodePreview", "CHANGELOG_ENTRIES", "NODE_REGISTRY.availableForCreation", "<RichTextEditor"]) {
    assert.equal(workspace.includes(implementationDetail), false, `AppWorkspace delegates panel detail ${implementationDetail}`);
  }
  assert.ok(workspace.includes("<TrashPanel"));
  assert.ok(workspace.includes("<TrashNodeView"));
  assert.ok(workspace.includes("<ChangelogPanel"));
  assert.ok(workspace.includes("<ProjectSettingsPanel"));
  assert.ok(app.includes('import "./nodes/styles.css"'), "the application composes Node-owned styles after the shell");
  assert.ok(app.includes('import "./editor/styles.css"'), "the application composes the shared editor after the shell");
  assert.ok(app.includes('import "./workspace/panels/styles.css"'), "the application composes workspace panel ownership explicitly");
  assert.ok(app.includes('import "./workspace/navigation/styles.css"'), "the application composes workspace navigation explicitly");
  assert.ok(app.includes('import "./ui/styles.css"'), "the application composes shared UI primitives explicitly");
  assert.ok(app.includes('import "./graph/styles.css"'), "the application composes Graph presentation explicitly");
  for (const type of ["course", "task", "video", "image", "pdf", "page", "calendar", "tempo"]) {
    assert.ok(nodalStyles.includes(`@import "./${type}/styles.css"`), `the Nodal stylesheet composes ${type} ownership`);
  }
  assert.equal(appCss.includes(".course-node-view"), false, "Course layout must not return to App.css");
  assert.equal(appCss.includes(".task-node-view"), false, "Task layout must not return to App.css");
  assert.equal(appCss.includes(".video-node-view"), false, "Video layout must not return to App.css");
  assert.equal(appCss.includes(".image-node-view"), false, "Image layout must not return to App.css");
  assert.equal(appCss.includes(".pdf-viewer"), false, "PDF viewer layout must not return to App.css");
  assert.equal(appCss.includes(".page-node-header"), false, "Page layout must not return to App.css");
  assert.equal(appCss.includes(".calendar-node"), false, "Calendar layout must not return to App.css");
  assert.equal(appCss.includes(".tempo-inspector"), false, "Tempo layout must not return to App.css");
  assert.equal(appCss.includes(".editor-content"), false, "rich-text presentation must not return to App.css");
  for (const selector of [".trash-view", ".project-settings", ".changelog-entry", ".workspace-file-import-error"]) {
    assert.equal(appCss.includes(selector), false, `${selector} must not return to App.css`);
    assert.ok(workspacePanelStyles.includes(selector), `workspace panels own ${selector}`);
  }
  for (const selector of [".graph-view", ".graph-view__renderer", ".graph-view__canvas"]) {
    assert.equal(appCss.includes(selector), false, `${selector} must not return to App.css`);
    assert.ok(graphStyles.includes(selector), `Graph owns ${selector}`);
  }
  for (const selector of [".view-rail", ".context-sidebar", ".lore-node", ".node-panels", ".type-group"]) {
    assert.equal(appCss.includes(selector), false, `${selector} must not return to App.css`);
    assert.ok(workspaceNavigationStyles.includes(selector), `workspace navigation owns ${selector}`);
  }
  assert.equal(appCss.includes('.sidebar-icon--search { --icon-url'), false, "action icon assets stay out of App.css");
  assert.ok(uiStyles.includes(".sidebar-icon--search"), "shared UI owns action icon assets");
  assert.equal(appCss.includes(".node-type-icon--"), false, "Node icon assets stay out of App.css");
  assert.ok(nodeIconStyles.includes(".node-type-icon--pagina"), "the Node system owns persisted type icons");
  assert.ok(nodeIconStyles.includes('nodes/node_project.svg'), "Project uses the official Node icon through the shared catalogue");
  assert.ok(projectRenderer.includes("<ComposableNodeContent"), "Project content is resolved through the capability composition host");
  assert.equal(composableContent.includes('=== "proyecto"'), false, "the capability host does not know its consumer Node type");
  assert.equal(fs.existsSync(path.join(root, "src/components/GraphView.tsx")), false, "Graph view stays out of shared components");
  for (const file of ["view.tsx", "projection.ts", "preferences.ts", "runtime.ts", "scene.ts", "PixiGraphRenderer.ts", "iconSource.ts", "styles.css"]) {
    assert.equal(fs.existsSync(path.join(root, "src/graph", file)), true, `Graph owns ${file}`);
  }
  assert.ok(courseStyles.includes(".course-node-view"));
  assert.ok(courseStyles.includes(".course-schedule .calendar-node"), "Course owns its embedded Calendar presentation");
  assert.ok(pageStyles.includes(".page-node-editor"), "Page owns its editor surface overrides");
  assert.ok(pageStyles.includes(".page-node-header"), "Page owns its header presentation");
  assert.ok(calendarStyles.includes(".weekly-tempo-view"), "Calendar owns the weekly Tempo projection it renders");
  assert.ok(tempoStyles.includes(".tempo-inspector"), "Tempo owns its inspector presentation");
  assert.ok(editorStyles.includes(".editor-content"), "the editor subsystem owns rich-text presentation");
  for (const file of [
    "RichTextEditor.tsx", "commands.ts", "html.ts", "menuTree.ts", "persistence.ts", "pickerSession.ts", "types.ts",
    "useBlockControls.ts", "useEditorBlockSelection.ts", "useEditorBlocks.ts", "useEditorController.ts",
    "useEditorHistory.ts", "useEditorMentions.ts", "useEditorPickers.ts", "useEditorSelection.ts", "useRichTextEditor.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(root, "src/editor", file)), true, `editor owns ${file}`);
  }
  for (const file of ["image/fileImport.ts", "pdf/fileImport.ts"]) {
    assert.equal(fs.existsSync(path.join(root, "src/nodes", file)), true, `the Node module owns ${file}`);
  }
  for (const file of [
    "src/components/RichTextEditor.tsx", "src/defs/editor.ts", "src/defs/devNodes.ts",
    "src/utils/editorHtml.ts", "src/utils/editorPersistence.ts", "src/utils/editorPickerSession.ts",
    "src/hooks/useBlockControls.ts", "src/hooks/useEditorBlockSelection.ts", "src/hooks/useEditorBlocks.ts",
    "src/hooks/useEditorController.ts", "src/hooks/useEditorHistory.ts", "src/hooks/useEditorMentions.ts",
    "src/hooks/useEditorPickers.ts", "src/hooks/useEditorSelection.ts", "src/hooks/useRichTextEditor.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must not regain editor ownership`);
  }
  const globalNodeTypes = fs.readFileSync(path.join(root, "src/types/nodes.ts"), "utf8");
  assert.equal(globalNodeTypes.includes("PickerState"), false, "picker UI state stays out of the persisted Node contract");
  assert.equal(globalNodeTypes.includes("LineControlState"), false, "block-control UI state stays private to the editor");
  assert.equal(calendarView.includes('toLocaleDateString("es-ES"'), false, "Calendar must use the active locale");
  assert.equal(calendarView.includes("meta.currentDate === today"), false, "opening Calendar must preserve its persisted date");
  assert.ok(richTextEditor.includes("controller.toggleLineSelection(clickedBlock)"), "Ctrl/Cmd click remains wired to block multi-selection");
  assert.ok(richTextEditor.includes("isResizableEditorImage"), "image actions use the shared resize guard");
  assert.ok(imageResize.includes('mention.dataset.mentionMode === "full"'), "Node image mentions resize only in full mode");
  assert.ok(editorBlocks.includes("{ captureUndo: false, sync: false }"), "batch block deletion stays atomic");
  assert.ok(editorPersistence.includes("EDITOR_TRANSIENT_BLOCK_ATTRIBUTES"), "temporary block selection state must not persist in Node HTML");
  assert.equal(editorBlocks.includes("if (!hasTextLineAfter(block)) removeLine(block)"), false, "opening options must not delete an empty block");
  for (const phrase of ["Restablecer diseño", "Ancho del bloque", "Subir imagen", "Quitar portada", "Quitar icono"]) {
    assert.equal(pageHeader.includes(phrase), false, `Page header must translate ${phrase}`);
  }
  assert.equal(/node\.type\s*===\s*["'](?:imagen|tempo)["']/.test(graphView), false, "GraphView consumes owner runtime contributions");
  assert.equal(/item\.type\s*===\s*["']curso["']/.test(nodeStore), false, "Course rename behavior stays in its owner");
  assert.ok(nodeStore.includes('hasNodeCapability(node.type, "openOnPrimaryAction")'), "Recent Nodes reuse the declarative capability");
  for (const type of ["category", "page", "project", "image", "calendar", "tempo", "pdf", "course", "task", "video"]) {
    assert.equal(fs.existsSync(path.join(root, `src/nodes/${type}/renderer.tsx`)), true, `${type} owns a renderer adapter`);
  }
  for (const file of ["category/view.tsx", "image/view.tsx", "calendar/view.tsx", "tempo/view.tsx", "pdf/view.tsx", "course/view.tsx", "task/view.tsx", "video/view.tsx", "page/header.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, "src/nodes", file)), true, `${file} is physically owned by its Node module`);
  }
  for (const file of ["course/runtime.ts", "image/runtime.ts", "tempo/runtime.ts"]) {
    assert.equal(fs.existsSync(path.join(root, "src/nodes", file)), true, `${file} owns its runtime contribution`);
  }
  for (const file of ["FolderNodeView.tsx", "ImageNodeView.tsx", "CalendarNodeView.tsx", "TempoInspector.tsx", "WeeklyTempoView.tsx", "PdfNodeView.tsx", "PageNodeHeader.tsx"]) {
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
