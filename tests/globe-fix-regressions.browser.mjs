import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "vite";

const require = createRequire(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json"));
const { chromium } = require("playwright");
const caseName = process.argv[2];
if (!new Set(["context", "caret", "lists"]).has(caseName)) {
  throw new Error("Uso: node tests/globe-fix-regressions.browser.mjs <context|caret|lists>");
}

const port = Number(process.env.HIS_GLOBE_FIX_PORT ?? 5248);
const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite/globe-fix-regressions",
  esbuild: { jsx: "automatic" },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react/jsx-dev-runtime", "react/jsx-runtime", "nspell", "react", "react-dom", "react-dom/client", "lucide-react", "lucide-react/dynamicIconImports"],
  },
  server: { port, host: "127.0.0.1", strictPort: true },
  plugins: [{
    name: "globe-fix-regression-fixture",
    configureServer(vite) {
      vite.middlewares.use("/audit", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await vite.transformIndexHtml("/audit", '<div id="root"></div><script type="module" src="/tests/editor-audit/fixture.tsx"></script>'));
      });
    },
  }],
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/audit`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".editor-content").waitFor();

  const reset = async (html) => {
    await page.evaluate((value) => window.audit.reset(value), html);
    await page.locator(".editor-content").waitFor();
    await page.waitForTimeout(50);
  };
  const state = async () => page.evaluate(() => {
    const editor = document.querySelector(".editor-content");
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    return {
      html: editor.innerHTML,
      text: editor.textContent?.replace(/\u00a0/g, " "),
      selection: range ? {
        collapsed: selection.isCollapsed,
        connected: range.startContainer.isConnected && range.endContainer.isConnected,
        inEditor: editor.contains(range.startContainer) && editor.contains(range.endContainer),
        focusText: selection.focusNode?.textContent,
        focusOffset: selection.focusOffset,
      } : null,
      rootTags: Array.from(editor.children).map((child) => child.tagName),
      globes: Array.from(editor.querySelectorAll("[data-globe]")).map((globe) => ({
        parent: globe.parentElement?.tagName,
        text: globe.querySelector("[data-globe-content]")?.textContent,
        blocks: Array.from(globe.querySelector("[data-globe-content]")?.children ?? []).map((block) => block.tagName),
      })),
      lists: Array.from(editor.querySelectorAll("ul,ol")).map((list) => ({
        tag: list.tagName,
        children: Array.from(list.children).map((child) => child.tagName),
        itemContents: Array.from(list.children).map((item) => item.innerHTML),
      })),
    };
  });
  const generate = async ({ selector, command = "globe", caret = "start", prefix = "" }) => {
    await page.locator(selector).first().click();
    if (caret === "start") await page.keyboard.press("Home");
    else if (caret === "end") await page.keyboard.press("End");
    else {
      await page.keyboard.press("Home");
      for (let index = 0; index < caret; index += 1) await page.keyboard.press("ArrowRight");
    }
    if (prefix) await page.keyboard.type(prefix);
    await page.keyboard.type("/");
    await page.locator(`[data-picker-menu-item="${command}"]`).waitFor();
    await page.locator(`[data-picker-menu-item="${command}"]`).click();
    await page.locator("[data-globe]").first().waitFor();
    await page.waitForTimeout(100);
  };
  const convertSelected = async (command, selector = ".editor-content > p") => {
    await page.locator(selector).nth(0).click({ modifiers: ["Control"] });
    await page.locator(selector).nth(1).click({ modifiers: ["Control"] });
    assert.deepEqual(await page.locator(`${selector}[data-line-selected]`).evaluateAll((blocks) => blocks.map((block) => block.textContent)), ["Uno", "Dos"]);
    await page.locator(selector).nth(1).click({ button: "right" });
    await page.getByRole("button", { name: "Conversión", exact: true }).click();
    await page.locator(`[data-picker-menu-item="${command}"]`).waitFor();
    await page.locator(`[data-picker-menu-item="${command}"]`).click();
    await page.waitForTimeout(100);
  };

  if (caseName === "context") {
    await reset("<p>Solo</p><p>Vecino</p>");
    await page.locator(".editor-content > p").first().click({ button: "right" });
    await page.getByRole("button", { name: "Conversión", exact: true }).click();
    await page.locator('[data-picker-menu-item="globe"]').waitFor();
    await page.locator('[data-picker-menu-item="globe"]').click();
    await page.waitForTimeout(100);
    let snapshot = await state();
    assert.equal(snapshot.globes.length, 1, "La conversión contextual de un bloque debe crear un globo");
    assert.equal(snapshot.globes[0].text, "Solo");
    assert.equal(snapshot.text, "SoloVecino");

    for (const [command, expectedCount] of [["globe", 1], ["globe-individual", 2]]) {
      await reset("<p>Uno</p><p>Dos</p><p>Tres</p>");
      await convertSelected(command);
      snapshot = await state();
      assert.equal(snapshot.globes.length, expectedCount, `${command} debe convertir ambos bloques seleccionados`);
      assert.deepEqual(snapshot.globes.map((globe) => globe.text), command === "globe" ? ["UnoDos"] : ["Uno", "Dos"]);
      assert.equal(snapshot.text, "UnoDosTres");
    }
  }

  if (caseName === "caret") {
    for (const [caret, prefix, expected] of [
      ["start", "", "XAlpha beta"],
      [6, "", "Alpha Xbeta"],
      ["end", " ", "Alpha beta X"],
    ]) {
      await reset("<p>Alpha beta</p>");
      await generate({ selector: ".editor-content p", caret, prefix });
      await page.keyboard.insertText("X");
      await page.waitForTimeout(450);
      let snapshot = await state();
      assert.equal(snapshot.globes[0].text?.replace(/\u00a0/g, " "), expected);
      assert.equal(snapshot.selection?.connected, true);
      assert.equal(snapshot.selection?.inEditor, true);
      assert.equal(snapshot.selection?.collapsed, true);
      if (caret === 6) {
        await page.keyboard.press("Control+z");
        snapshot = await state();
        assert.equal(snapshot.globes[0].text, "Alpha beta");
        await page.keyboard.press("Control+y");
        snapshot = await state();
        assert.equal(snapshot.globes[0].text, "Alpha Xbeta");
        await page.getByRole("button", { name: "Visit", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("#node")?.textContent === "B");
        await page.getByRole("button", { name: "Visit", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("#node")?.textContent === "A");
        snapshot = await state();
        assert.equal(snapshot.globes[0].text, "Alpha Xbeta");
        const saved = await page.locator("#saved").textContent();
        assert.match(saved, /Alpha Xbeta/);
        assert.match(saved, /data-globe="true"/);
      }
    }
  }

  if (caseName === "lists") {
    await reset("<ul><li>Uno</li><li>Dos</li><li>Tres</li></ul>");
    await generate({ selector: ".editor-content li", command: "globe", caret: "start" });
    let snapshot = await state();
    assert.deepEqual(snapshot.lists[0].children, ["LI", "LI", "LI"]);
    assert.equal(snapshot.lists[0].itemContents[0].includes("data-globe"), true);
    assert.equal(snapshot.text, "UnoDosTres");

    await reset("<ol><li>Uno</li><li>Dos</li><li>Tres</li></ol>");
    await convertSelected("globe", ".editor-content > ol > li");
    snapshot = await state();
    assert.deepEqual(snapshot.lists[0].children, ["LI", "LI"]);
    assert.equal(snapshot.lists[0].itemContents[0].includes("data-globe"), true);
    assert.equal(snapshot.globes[0].text, "UnoDos");
    assert.equal(snapshot.text, "UnoDosTres");

    await reset("<ol><li>Uno</li><li>Dos</li><li>Tres</li></ol>");
    await convertSelected("globe-individual", ".editor-content > ol > li");
    snapshot = await state();
    assert.deepEqual(snapshot.lists[0].children, ["LI", "LI", "LI"]);
    assert.equal(snapshot.globes.length, 2);
    assert.deepEqual(snapshot.globes.map((globe) => globe.parent), ["LI", "LI"]);
    assert.equal(snapshot.text, "UnoDosTres");
  }

  console.log(`PASS globe regression: ${caseName}`);
} finally {
  await browser?.close();
  await server.close();
}