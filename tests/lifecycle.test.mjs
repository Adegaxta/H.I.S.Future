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
  assert.ok(nodeStore.includes("persistedVersionRef.current === changeVersionRef.current"), "no-change flush skips redundant persistence");
  assert.ok(nodeStore.includes("PersistenceQueue"), "workspace persistence has an explicit queue");
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
