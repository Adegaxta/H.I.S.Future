import process from "node:process";

const endpoint = process.env.HIS_CDP_ENDPOINT || "http://127.0.0.1:9223/json";
const pages = await (await fetch(endpoint)).json();
const page = Array.isArray(pages) ? pages.find((entry) => entry.type === "page") : pages;
if (!page?.webSocketDebuggerUrl) throw new Error("No H.I.S. Future WebView CDP target found.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const lifecycleLogs = [];
const pdfErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const values = message.params.args.map((argument) => argument.value ?? argument.description ?? "");
    const line = values.join(" ");
    if (line.includes("[lifecycle]")) lifecycleLogs.push(line);
    if (message.params.type === "error" && line.includes("[pdf]")) pdfErrors.push(line);
  }
  if (message.method === "Runtime.exceptionThrown") pdfErrors.push(message.params.exceptionDetails.text);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(
    `${result.exceptionDetails.exception?.description || result.exceptionDetails.text}\n${JSON.stringify(result.exceptionDetails, null, 2)}`,
  );
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const diagnostic = await evaluate(`({ text: document.body.innerText, html: document.querySelector(".pdf-node-view__error,.pdf-viewer__state.is-error")?.outerHTML })`);
  throw new Error(`Timed out waiting for: ${expression}\n${JSON.stringify(diagnostic)}\n${pdfErrors.join("\n")}`);
}

await send("Runtime.enable");
await send("Page.enable");

const archivePath = `${process.env.TEMP || process.cwd()}\\hisfuture-native-lifecycle-qa-${Date.now()}.his`;
const archiveLiteral = JSON.stringify(archivePath);
await evaluate(`(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  try { await invoke("close_project", { traceId: "qa-reset" }); } catch {}
  const info = await invoke("create_project_file", { archivePath: ${archiveLiteral}, name: "QA Lifecycle" });
  const pdfText = ${JSON.stringify(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 39 >>
stream
BT /F1 24 Tf 72 72 Td (QA PDF) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`)};
  const bytes = Array.from(new TextEncoder().encode(pdfText));
  await invoke("store_project_resource", { kind: "pdf", resourceId: "qa-pdf-a", data: bytes });
  await invoke("store_project_resource", { kind: "pdf", resourceId: "qa-pdf-b", data: bytes });
  const content = (id, name) => '<!--hisfuture-pdf-resource:' + JSON.stringify({ resourceId: id, fileName: name, fileSize: bytes.length, hash: "qa" }) + '--><p><br></p>';
  const requiredProjectNodes = await invoke("list_nodes");
  await invoke("save_nodes", {
    nodes: [
      ...requiredProjectNodes,
      { id: "qa-a", name: "PDF A", type: "pdf", parentId: null, order: 0, content: content("qa-pdf-a", "a.pdf") },
      { id: "qa-b", name: "PDF B", type: "pdf", parentId: null, order: 1, content: content("qa-pdf-b", "b.pdf") },
      { id: "qa-page", name: "Notes", type: "pagina", parentId: null, order: 2, content: "<p>QA</p>" },
    ],
    hiddenIds: [], deletedNodes: "[]", traceId: null,
  });
  await invoke("close_project", { traceId: "qa-setup" });
  localStorage.setItem("hisfuture.recent-projects", JSON.stringify([info]));
  location.reload();
})()`);

await waitFor(`document.querySelector(".home-recent-card__name")?.textContent?.trim() === "QA Lifecycle"`);
await evaluate(`document.querySelector(".home-recent-card__name").click()`);
await waitFor(`Boolean(document.querySelector(".app-workspace"))`);
await waitFor(`[...document.querySelectorAll(".lore-node__name")].some((element) => element.textContent?.trim() === "PDF A")`);

const clickNode = async (name) => {
  const clicked = await evaluate(`(() => { const target = [...document.querySelectorAll(".lore-node__name")].find((element) => element.textContent?.trim() === ${JSON.stringify(name)}); if (!target) return false; target.click(); return true; })()`);
  if (!clicked) throw new Error(`Node button not found: ${name}`);
};
const waitForPdf = () => waitFor(`Boolean(document.querySelector(".pdf-viewer canvas")) && !document.querySelector(".pdf-node-view__error,.pdf-viewer__state.is-error")`, 10_000);

for (let index = 0; index < 50; index += 1) {
  await clickNode("PDF A");
  await waitForPdf();
  await clickNode("Notes");
  await waitFor(`!document.querySelector(".pdf-viewer")`);
}
for (let index = 0; index < 25; index += 1) {
  await clickNode("PDF A");
  await waitForPdf();
  await clickNode("PDF B");
  await waitForPdf();
  await clickNode("PDF A");
  await waitForPdf();
}

await evaluate(`window.__TAURI_INTERNALS__.invoke("store_project_resource", { kind: "pdf", resourceId: "close-dirty-marker", data: [37,80,68,70,45,49,46,52] })`);
await clickNode("Notes");
await waitFor(`Boolean(document.querySelector(".editor-content[contenteditable=true]"))`);
const closeEditMarker = `Close trace edit ${Date.now()}`;
await evaluate(`(() => { const editor = document.querySelector(".editor-content[contenteditable=true]"); editor.innerHTML = ${JSON.stringify(`<p>${closeEditMarker}</p>`)}; editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "trace" })); })()`);
await waitFor(`window.__TAURI_INTERNALS__.invoke("list_nodes").then((nodes) => nodes.some((node) => node.id === "qa-page" && node.content.includes(${JSON.stringify(closeEditMarker)})))`);
await clickNode("PDF A");
await waitForPdf();
const closeClicked = await evaluate(`(() => { const target = document.querySelector(".view-rail__exit"); if (!target) return false; target.click(); return true; })()`);
if (!closeClicked) throw new Error("Close Project button not found.");
await waitFor(`Boolean(document.querySelector(".home-screen"))`, 15_000);
await waitFor(`window.__TAURI_INTERNALS__.invoke("archive_sync_status").then((statuses) => statuses.some((status) => status.archivePath === ${archiveLiteral} && status.phase === "clean"))`, 15_000);

await evaluate(`document.querySelector(".home-recent-card__name").click()`);
await waitFor(`Boolean(document.querySelector(".app-workspace"))`);
await waitFor(`[...document.querySelectorAll(".lore-node__name")].some((element) => element.textContent?.trim() === "Notes")`);
await clickNode("Notes");
await waitFor(`document.querySelector(".editor-content[contenteditable=true]")?.innerHTML.includes(${JSON.stringify(closeEditMarker)})`);
const ctrlSMarker = `Ctrl+S durable ${Date.now()}`;
await evaluate(`(() => {
  const editor = document.querySelector(".editor-content[contenteditable=true]");
  editor.innerHTML = ${JSON.stringify("<p>CTRL_S_MARKER</p>")}.replace("CTRL_S_MARKER", ${JSON.stringify(ctrlSMarker)});
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "save" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "s", ctrlKey: true }));
})()`);
await waitFor(`window.__TAURI_INTERNALS__.invoke("list_nodes").then((nodes) => nodes.some((node) => node.id === "qa-page" && node.content.includes(${JSON.stringify(ctrlSMarker)})))`);

await evaluate(`document.querySelector(".view-rail__exit").click()`);
await waitFor(`Boolean(document.querySelector(".home-screen"))`, 15_000);
await waitFor(`window.__TAURI_INTERNALS__.invoke("archive_sync_status").then((statuses) => statuses.some((status) => status.archivePath === ${archiveLiteral} && status.phase === "clean"))`, 15_000);
const finalArchiveStatus = await evaluate(`window.__TAURI_INTERNALS__.invoke("archive_sync_status")`);

await evaluate(`document.querySelector(".home-recent-card__name").click()`);
await waitFor(`Boolean(document.querySelector(".app-workspace"))`);
const xPreservedWorkspace = await evaluate(`(async () => {
  const controls = [...document.querySelectorAll(".workspace-header__window-controls button")];
  controls.at(-1).click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const nodes = await window.__TAURI_INTERNALS__.invoke("list_nodes");
  await window.__TAURI_INTERNALS__.invoke("plugin:window|show", { label: "main" });
  return nodes.some((node) => node.id === "qa-page") && Boolean(document.querySelector(".app-workspace"));
})()`);
if (!xPreservedWorkspace) throw new Error("Window X did not preserve the mounted Vault.");

const closeTrace = lifecycleLogs.findLast((line) => line.includes("close-project trace"));
const exitQa = process.env.HIS_QA_EXIT === "1";
console.log(JSON.stringify({
  archivePath,
  reopenCycles: 50,
  switchCycles: 25,
  ctrlSSaved: true,
  roundtripEditRestored: true,
  xPreservedWorkspace,
  finalArchiveStatus,
  pdfErrors,
  closeTrace,
  exitTriggeredWithDirtyArchive: exitQa,
  lifecycleLogs: lifecycleLogs.filter((line) => line.includes("close-") || line.includes("PDF cleanup")),
}, null, 2));
if (exitQa) {
  await evaluate(`(() => {
    const bytes = new Uint8Array(1024 * 1024);
    bytes.set([37, 80, 68, 70, 45, 49, 46, 52]);
    return window.__TAURI_INTERNALS__.invoke("store_project_resource", {
      kind: "pdf", resourceId: "qa-exit-pending", data: Array.from(bytes),
    });
  })()`);
  const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
  await send("Runtime.evaluate", {
    expression: `window.__TAURI_INTERNALS__.invoke("exit_application")`,
    awaitPromise: false,
    returnByValue: false,
  });
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error("Exit did not close the native process.")), 15_000))]);
} else {
  socket.close();
}
