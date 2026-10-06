import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const require = createRequire(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json"));
const { chromium } = require("playwright");
const results = "tests/editor-audit/results";
await mkdir(results, { recursive: true });
let server;
try {
  await fetch("http://localhost:1420/");
} catch {
  server = await createServer({ cacheDir: "node_modules/.vite/globe-audit-native", server: { host: "localhost", port: 1420, strictPort: true } });
  await server.listen();
}

const profile = await mkdtemp(join(tmpdir(), "his-globe-audit-"));
const cdpPort = 9250;
const app = spawn("src-tauri/target/debug/hisfuture.exe", [], {
  windowsHide: true,
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` },
});
let browser;
let failed = null;
const errors = [];
const scenarios = [];

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  if (!browser) throw new Error("No se pudo conectar al WebView2 aislado");
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const invoke = (command, payload) => page.evaluate(async ({ command, payload }) => {
    const { invoke } = await import("/node_modules/@tauri-apps/api/core.js");
    return invoke(command, payload);
  }, { command, payload });
  const openDev = async () => {
    await page.goto("http://localhost:1420/");
    await page.locator(".home-action--quick-dev button").click();
    await openAuditPage();
  };
  const openAuditPage = async () => {
    await page.getByRole("button", { name: "LORE", exact: true }).click();
    if (!(await page.locator('[data-node-id="globe-audit-page"]').count())) {
      await page.locator('[data-node-id] .lore-node__expand:not(.lore-node__expand--placeholder)').first().click();
    }
    await page.locator('[data-node-id="globe-audit-page"]').click();
    await page.locator(".editor-content").waitFor();
  };
  const readNode = async () => (await invoke("list_nodes")).find((node) => node.id === "globe-audit-page")?.content ?? null;
  const persist = async () => {
    await page.keyboard.press("Control+s");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })));
    await page.waitForTimeout(900);
    return readNode();
  };
  const domState = async () => page.locator(".editor-content").evaluate((editor) => {
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    return {
      html: editor.innerHTML,
      text: editor.textContent,
      selection: range ? {
        text: selection.toString(),
        collapsed: selection.isCollapsed,
        connected: range.startContainer.isConnected && range.endContainer.isConnected,
        inEditor: editor.contains(range.startContainer) && editor.contains(range.endContainer),
        focusText: selection.focusNode?.textContent,
        focusOffset: selection.focusOffset,
      } : null,
      globes: Array.from(editor.querySelectorAll("[data-globe]")).map((globe) => ({ parent: globe.parentElement?.tagName, html: globe.outerHTML })),
      listChildren: Array.from(editor.querySelectorAll("ul,ol")).map((list) => ({ tag: list.tagName, children: Array.from(list.children).map((child) => child.tagName) })),
    };
  });

  await page.goto("http://localhost:1420/");
  await page.locator(".home-action--quick-dev button").click();
  const project = await invoke("current_project");
  const expectedRoot = resolve(tmpdir(), `hisfuture-dev-${app.pid}`);
  if (!resolve(project.folderPath).toLowerCase().startsWith(`${expectedRoot.toLowerCase()}\\`)) {
    throw new Error(`El proyecto no está aislado en el temporal esperado: ${project.folderPath}`);
  }
  const nodes = await invoke("list_nodes");
  nodes.push({
    id: "globe-audit-page",
    name: "Globe audit page",
    type: "pagina",
    parentId: nodes[0].id,
    order: 200,
    content: "<p>Alpha beta</p><ul><li>Elemento lista</li></ul>",
  });
  await invoke("save_nodes", { nodes, hiddenIds: [], deletedNodes: "[]" });
  await page.route("**/native-globe-blank", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Isolated globe audit</body></html>" }));
  await page.goto("http://localhost:1420/native-globe-blank");
  await invoke("close_project");
  await page.goto("http://localhost:1420/");
  await page.locator(".home-action--quick-dev button").click();
  await openAuditPage();

  await page.locator(".editor-content > p").first().click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 6; index += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.type("/");
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  const middleGenerated = await domState();
  await page.keyboard.insertText("X");
  await page.waitForTimeout(450);
  const middleTyped = await domState();
  const middleStored = await persist();
  scenarios.push({ seed: 20261003, id: "CARET_AFTER_GLOBE", generated: middleGenerated, afterTyping: middleTyped, stored: middleStored });

  await page.locator(".editor-content li").click();
  await page.keyboard.press("Home");
  await page.keyboard.type("/");
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  const listGenerated = await domState();
  const listStored = await persist();
  const storedListShape = await page.evaluate((html) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return Array.from(host.querySelectorAll("ul,ol")).map((list) => ({ tag: list.tagName, children: Array.from(list.children).map((child) => child.tagName) }));
  }, listStored);
  await page.route("**/native-globe-blank", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Isolated globe audit</body></html>" }));
  await page.goto("http://localhost:1420/native-globe-blank");
  await invoke("close_project");
  await page.goto("http://localhost:1420/");
  await page.locator(".home-action--quick-dev button").click();
  await openAuditPage();
  const listReopened = await domState();
  scenarios.push({ seed: 20261003, id: "GLOBE_FROM_LIST_ITEM", generated: listGenerated, stored: listStored, storedListShape, reopened: listReopened });

  await page.route("**/native-globe-blank", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Isolated globe audit</body></html>" }));
  await page.goto("http://localhost:1420/native-globe-blank");
  const orderedNodes = await invoke("list_nodes");
  const auditNode = orderedNodes.find((node) => node.id === "globe-audit-page");
  auditNode.content = "<ol><li>Ordinal uno</li><li>Ordinal dos</li><li>Ordinal tres</li></ol>";
  await invoke("save_nodes", { nodes: orderedNodes, hiddenIds: [], deletedNodes: "[]" });
  await invoke("close_project");
  await page.goto("http://localhost:1420/");
  await page.locator(".home-action--quick-dev button").click();
  await openAuditPage();
  await page.locator(".editor-content ol li").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("/");
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  const orderedGenerated = await domState();
  const orderedStored = await persist();
  const storedOrderedShape = await page.evaluate((html) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return Array.from(host.querySelectorAll("ol")).map((list) => ({ tag: list.tagName, children: Array.from(list.children).map((child) => child.tagName) }));
  }, orderedStored);
  await page.route("**/native-globe-blank", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Isolated globe audit</body></html>" }));
  await page.goto("http://localhost:1420/native-globe-blank");
  await invoke("close_project");
  await page.goto("http://localhost:1420/");
  await page.locator(".home-action--quick-dev button").click();
  await openAuditPage();
  const orderedReopened = await domState();
  scenarios.push({ seed: 20261003, id: "GLOBE_FROM_ORDERED_LIST_ITEM", generated: orderedGenerated, stored: orderedStored, storedOrderedShape, reopened: orderedReopened });
  if (errors.length) throw new Error(`Errores JS nativos: ${errors.join(" | ")}`);
} catch (error) {
  failed = { message: error.message, stack: error.stack };
  console.error(error);
} finally {
  await writeFile(`${results}/globe-native-report.json`, JSON.stringify({ profile, pid: app.pid, scenarios, errors, failed }, null, 2));
  await browser?.close();
  if (app.exitCode === null) {
    const exited = new Promise((resolveExit) => app.once("exit", resolveExit));
    app.kill();
    await exited;
  }
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await server?.close();
  if (failed) process.exitCode = 1;
}