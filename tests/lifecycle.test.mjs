import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { PersistenceQueue } = await server.ssrLoadModule("/src/lifecycle/PersistenceQueue.ts");
  const { mergeNodePersistenceRequests } = await server.ssrLoadModule("/src/lifecycle/nodePersistence.ts");
  const { saveEditorImageLayout, loadEditorImageLayouts, flushEditorLayoutWrites } = await server.ssrLoadModule("/src/project/editorLayoutRepository.ts");
  const { PdfDocumentSession } = await server.ssrLoadModule("/src/pdf/PdfDocumentSession.ts");
  const writes = [];
  let releaseFirst;
  const firstWrite = new Promise((resolve) => { releaseFirst = resolve; });
  const queue = new PersistenceQueue(async (value) => {
    writes.push(value);
    if (value === 1) await firstWrite;
  });
  const first = queue.enqueue(1);
  const second = queue.enqueue(2);
  const third = queue.enqueue(3);
  assert.equal(queue.hasPendingWrites(), true);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.deepEqual(writes, [1, 3], "writes stay ordered and queued snapshots coalesce to the newest state");
  assert.equal(queue.hasPendingWrites(), false);

  await saveEditorImageLayout({ nodeId: "page", blockId: "image-stable", width: 512 });
  await flushEditorLayoutWrites();
  assert.deepEqual(
    await loadEditorImageLayouts("page"),
    [{ nodeId: "page", blockId: "image-stable", width: 512 }],
    "browser and test runtimes preserve the granular image layout contract",
  );

  let shouldFail = true;
  const retryWrites = [];
  const retryQueue = new PersistenceQueue(async (value) => {
    retryWrites.push(value);
    if (shouldFail) throw new Error("disk full");
  });
  await assert.rejects(retryQueue.enqueue("latest"), /disk full/);
  assert.equal(retryQueue.hasPendingWrites(), true, "a failed write remains explicitly pending");
  shouldFail = false;
  await retryQueue.flush();
  assert.deepEqual(retryWrites, ["latest", "latest"]);
  assert.equal(retryQueue.hasPendingWrites(), false);

  const page = { id: "page", name: "Page", type: "pagina", parentId: null, order: 0, content: "old" };
  const mergedContent = mergeNodePersistenceRequests(
    { kind: "content", changes: [{ id: "page", content: "middle" }, { id: "other", content: "kept" }], version: 2 },
    { kind: "content", changes: [{ id: "page", content: "latest" }], version: 3 },
  );
  assert.deepEqual(mergedContent, {
    kind: "content",
    changes: [{ id: "page", content: "latest" }, { id: "other", content: "kept" }],
    version: 3,
  }, "incremental writes coalesce independently by Node identity");
  const mergedCheckpoint = mergeNodePersistenceRequests(
    { kind: "full", nodes: [page], deletedNodes: [], version: 4 },
    { kind: "content", changes: [{ id: "page", content: "after-checkpoint" }], version: 5 },
  );
  assert.equal(mergedCheckpoint.kind, "full");
  assert.equal(mergedCheckpoint.nodes[0].content, "after-checkpoint", "new typing is folded into a queued checkpoint");
  assert.equal(mergedCheckpoint.version, 5);

  const transferred = new Uint8Array([37, 80, 68, 70]);
  structuredClone(transferred, { transfer: [transferred.buffer] });
  assert.equal(transferred.byteLength, 0, "PDF.js-style ownership transfer detaches the caller buffer");

  let destroyed = 0;
  const task = { promise: Promise.resolve({ numPages: 1 }), destroy: async () => { destroyed += 1; } };
  const sharedSession = new PdfDocumentSession(new Uint8Array([37, 80, 68, 70]), task);
  for (let index = 0; index < 100; index += 1) {
    const replayed = sharedSession.acquire();
    replayed.release();
    const replacement = sharedSession.acquire();
    await replacement.promise;
    if (index < 99) replacement.release();
  }
  assert.equal(destroyed, 0, "StrictMode release/acquire replay cannot destroy the reused loading task");
  const finalLease = sharedSession.acquire();
  finalLease.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(destroyed, 1, "the final owner destroys its loading task exactly once");

  const destroyedByDocument = { A1: 0, B: 0, A2: 0 };
  const makeSession = (name) => new PdfDocumentSession(
    new Uint8Array([37, 80, 68, 70]),
    {
      promise: Promise.resolve({ name }),
      destroy: async () => { destroyedByDocument[name] += 1; },
    },
  );
  const a1 = makeSession("A1");
  const a1Lease = a1.acquire();
  a1Lease.release();
  const b = makeSession("B");
  const bLease = b.acquire();
  await bLease.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(destroyedByDocument, { A1: 1, B: 0, A2: 0 }, "PDF A cleanup cannot destroy PDF B");
  bLease.release();
  const a2 = makeSession("A2");
  const a2Lease = a2.acquire();
  await a2Lease.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(destroyedByDocument, { A1: 1, B: 1, A2: 0 }, "PDF B cleanup cannot destroy reopened PDF A");
  a2Lease.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(destroyedByDocument, { A1: 1, B: 1, A2: 1 });

  const appLifecycle = read("src/lifecycle/AppLifecycle.tsx");
  const workspaceLifecycle = read("src/workspace/useWorkspaceLifecycle.ts");
  const app = read("src/App.tsx");
  const nodeStore = read("src/hooks/useNodeStore.ts");
  const pdfViewer = read("src/components/PdfViewer.tsx");
  const resourceRepository = read("src/project/resourceRepository.ts");
  const editorPersistence = read("src/editor/persistence.ts");
  const richTextPersistence = read("src/editor/useRichTextEditor.ts");
  const editorController = read("src/editor/useEditorController.ts");
  const imageLayoutRepository = read("src/project/editorLayoutRepository.ts");
  const backend = read("src-tauri/src/lib.rs");
  const project = read("src-tauri/src/project.rs");

  assert.ok(appLifecycle.includes("event.preventDefault()") && appLifecycle.includes("hideApplication()"), "native X hides the window");
  assert.equal(appLifecycle.includes("closeProject"), false, "window close does not close the project");
  assert.equal(workspaceLifecycle.includes("onCloseRequested"), false, "window listener has one app-level owner");
  assert.ok(app.includes("<AppLifecycleProvider><AppContent /></AppLifecycleProvider>"), "hide/show keeps the mounted workspace owner");
  assert.ok(workspaceLifecycle.includes('measureActiveCloseProjectPhase("frontend save"') && workspaceLifecycle.includes("await exitProject();"), "Close Project flushes before dispose/Home");
  assert.ok(workspaceLifecycle.includes('event.key.toLowerCase() !== "s"') && workspaceLifecycle.includes("saveCurrentWorkspace()"), "Ctrl+S is a durable workspace flush, not archive packaging");
  assert.ok(appLifecycle.includes("await flushRef.current?.();\n      await invoke(\"exit_application\")"), "real Exit flushes before backend shutdown");
  assert.ok(appLifecycle.includes("showApplication()"), "an Exit failure restores the window for a visible error");
  assert.ok(backend.includes('"Abrir H.I.S. Future"') && backend.includes('"Salir"'), "tray exposes restore and real Exit");
  assert.ok(backend.includes('app.emit("app-exit-requested"'), "tray Exit enters the safe frontend flush path");
  assert.ok(backend.includes("take_launch_project_path") && backend.includes("initial_his_path"), "startup consumes a direct .his launch path");
  assert.ok(app.includes('invoke<string | null>("take_launch_project_path")') && app.includes("session.openDirect(path)"), "frontend opens the .his path received at startup");
  assert.ok(nodeStore.includes("enqueueFullSave(snapshot, changeVersionRef.current)"), "explicit flush creates a complete validated checkpoint");
  assert.ok(nodeStore.includes("PersistenceQueue"), "workspace persistence has an explicit queue");
  assert.ok(nodeStore.includes("enqueueContentSave") && backend.includes("save_node_contents"), "typing uses the incremental persistence path");
  assert.ok(nodeStore.includes("loadWorkspaceSnapshot") && backend.includes("load_workspace_snapshot"), "initial Node, Lore and Trash hydration uses one backend snapshot");
  assert.ok(project.includes("PRAGMA wal_autocheckpoint = 0"), "interactive saves defer WAL checkpoint work to the durability boundary");
  assert.ok(editorPersistence.includes("const stripped:") && editorPersistence.includes("element.setAttribute(attribute, value)"), "editor persistence strips transient attributes without cloning large live pages");
  assert.ok(richTextPersistence.includes("requestIdleCallback"), "editor snapshots can be deferred to an idle main-thread window");
  assert.ok(editorController.includes("saveEditorImageLayout") && editorController.includes("if (resize.blockIdCreated) syncContent()"), "image resize writes one granular row and snapshots HTML only for one-time legacy identity migration");
  assert.ok(imageLayoutRepository.includes('invoke("save_editor_image_layout"') && imageLayoutRepository.includes("pendingWrites"), "granular layout writes are tracked until the durability boundary");
  assert.ok(workspaceLifecycle.includes("flushEditorLayoutWrites"), "Close, Exit and Ctrl+S await granular editor writes");
  assert.ok(project.includes("editor_image_layouts") && backend.includes("save_editor_image_layout"), "SQLite owns durable block-level image widths");
  assert.ok(project.includes("if project.archive_dirty") && project.includes("archive_sync.enqueue(job)"), "clean archive close skips packaging and dirty archives enter the background queue");
  assert.ok(project.includes("ARCHIVE_DIRTY_FILE") && project.includes("durable_working_folder"), "archive dirty state and extracted working state are durable");
  assert.ok(project.includes("validate_archive_file(&temporary)") && project.includes("replace_archive(&temporary, archive_path)"), "archive replacement follows package, validation, replace order");
  assert.ok(backend.includes("archive_sync.wait_for_vault(&selected)"), "reopening the same Vault coordinates with its own archive job");
  assert.ok(backend.includes("archive_sync.drain()"), "real Exit drains background archive work");
  assert.ok(project.includes("WHERE nodes.name IS NOT excluded.name"), "SQLite avoids rewriting unchanged node rows");
  assert.ok(resourceRepository.includes("ArrayBuffer | Uint8Array"), "resource reads use raw IPC bytes");
  assert.ok(pdfViewer.includes("IntersectionObserver") && pdfViewer.includes("pageNumber === 1"), "PDF renders the first page and lazily activates nearby pages");
  assert.equal(pdfViewer.includes("data.slice()"), false, "PDF loading does not clone the entire resource buffer");
  assert.ok(pdfViewer.includes("PdfDocumentSession") && pdfViewer.includes("lease.release("), "PDF loading task has one explicit lifecycle owner");
  console.log("PASS: lifecycle ownership, persistence safety, tray semantics, and progressive PDF loading.");
} finally {
  await server.close();
}
