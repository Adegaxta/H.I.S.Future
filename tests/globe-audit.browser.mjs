import { createServer } from "vite";
import { createRequire } from "node:module";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json"));
const { chromium } = require("playwright");
const port = Number(process.env.HIS_GLOBE_AUDIT_PORT ?? 5222);
const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite/editor-audit",
  esbuild: { jsx: "automatic" },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react/jsx-dev-runtime", "react/jsx-runtime", "nspell", "react", "react-dom", "react-dom/client", "lucide-react", "lucide-react/dynamicIconImports"],
  },
  server: { port, host: "127.0.0.1", strictPort: true },
  plugins: [{
    name: "globe-audit-fixture",
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${port}` }).catch(() => {});
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
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
    const compact = (html) => html?.replace(/<img src="data:image\/svg\+xml,[^"]*" alt="Draft">/g, '<img alt="Draft">') ?? null;
    return {
      html: compact(editor.innerHTML),
          text: editor.textContent,
          serialized: compact(window.audit.serializeEditorContent(editor)),
      saved: compact(document.querySelector("#saved")?.textContent),
      focus: document.activeElement === editor,
      selection: range ? {
        text: selection.toString(),
        collapsed: selection.isCollapsed,
        connected: range.startContainer.isConnected && range.endContainer.isConnected,
        inEditor: editor.contains(range.startContainer) && editor.contains(range.endContainer),
        inGlobe: Boolean(range.startContainer.parentElement?.closest("[data-globe-content]")),
        anchor: selection.anchorNode?.parentElement?.outerHTML.slice(0, 140) ?? selection.anchorNode?.nodeName,
        anchorOffset: selection.anchorOffset,
        focus: selection.focusNode?.parentElement?.outerHTML.slice(0, 140) ?? selection.focusNode?.nodeName,
        focusOffset: selection.focusOffset,
      } : null,
      globes: Array.from(editor.querySelectorAll("[data-globe]")).map((globe) => ({
        html: compact(globe.outerHTML),
        parent: globe.parentElement?.tagName,
        contentBlocks: Array.from(globe.querySelector("[data-globe-content]")?.children ?? []).map((block) => ({ tag: block.tagName, text: block.textContent })),
      })),
      emptyParagraphs: Array.from(editor.querySelectorAll("p")).filter((line) => !line.textContent?.trim() && !line.querySelector("img, [data-mention-id]")).length,
          emptyParagraphs: Array.from(editor.querySelectorAll("p")).filter((line) => !line.textContent?.trim() && !line.querySelector("img, [data-mention-id]")).length,
          rootChildren: Array.from(editor.children).map((child) => child.tagName),
          blockIds: Array.from(editor.querySelectorAll("[data-editor-block-id]")).map((block) => block.getAttribute("data-editor-block-id")),
      listValidity: Array.from(editor.querySelectorAll("ul,ol")).map((list) => ({
        tag: list.tagName,
        directChildren: Array.from(list.children).map((child) => child.tagName),
      })),
    };
  });
  const generate = async (blockSelector, command = "globe", caret = "end", triggerPrefix = "") => {
    const block = page.locator(blockSelector).first();
    await block.click();
    if (caret === "start") await page.keyboard.press("Home");
    else if (caret === "end") await page.keyboard.press("End");
    else if (typeof caret === "number") {
      await page.keyboard.press("Home");
      for (let index = 0; index < caret; index += 1) await page.keyboard.press("ArrowRight");
    }
    if (triggerPrefix) await page.keyboard.type(triggerPrefix);
    await page.keyboard.type("/");
    await page.waitForTimeout(100);
    const menuItem = page.locator(`[data-picker-menu-item="${command}"]`);
    if (!(await menuItem.count())) {
      return {
        pickerMissing: await page.evaluate(() => {
          const editor = document.querySelector(".editor-content");
          const selection = getSelection();
          return {
            editorHtml: editor?.innerHTML,
            focusInEditor: document.activeElement === editor,
            rangeCount: selection?.rangeCount,
            focusNode: selection?.focusNode?.nodeName,
            focusOffset: selection?.focusOffset,
            textBeforeCaret: selection?.focusNode?.textContent?.slice(0, selection.focusOffset),
            menuText: document.querySelector("[data-picker-menu-item]")?.parentElement?.parentElement?.innerText ?? null,
          };
        }),
        state: await state(),
      };
    }
    await menuItem.click();
    await page.locator("[data-globe]").first().waitFor();
    await page.waitForTimeout(450);
    return state();
  };

  const cases = [];
  await reset("<p><br></p>");
  const emptyGlobe = await generate(".editor-content p", "globe", "start");
  await page.keyboard.insertText("Escrito después");
  await page.waitForTimeout(450);
  cases.push({ name: "empty-paragraph-slash-globe-then-type", generated: emptyGlobe, afterTyping: await state() });
  await reset("<ul><li>Elemento antes</li></ul>");
  const listGlobe = await generate(".editor-content li", "globe", "start");
  const listSaved = listGlobe.saved;
  await reset(listSaved);
  cases.push({ name: "list-item-globe-save-reopen", generated: listGlobe, reopened: await state() });
  await reset("<p>Antes</p><ul><li>Lista</li></ul><p>Después</p>");
  cases.push({ name: "paragraph-before-list-globe", result: await generate(".editor-content > p:first-child", "globe", "start") });
  await reset("<p>Antes</p><ul><li>Lista</li></ul><p>Después</p>");
  cases.push({ name: "paragraph-after-list-globe", result: await generate(".editor-content > p:last-child", "globe", "start") });
  for (const [tag, text] of [["h1", "Título"], ["blockquote", "Cita"], ["pre", "Código"]]) {
    await reset(`<${tag}>${text}</${tag}>`);
    cases.push({ name: `block-${tag}-globe`, result: await generate(`.editor-content > ${tag}`, "globe", "start") });
  }
  await reset("<p>Alpha beta</p>");
  const atStart = await generate(".editor-content p", "globe", "start");
  await page.keyboard.insertText("X");
  await page.waitForTimeout(450);
  cases.push({ name: "text-start-globe-then-type", generated: atStart, afterTyping: await state() });
  await reset("<p>Alpha beta</p>");
  const atMiddle = await generate(".editor-content p", "globe", 6);
  await page.keyboard.insertText("X");
  await page.waitForTimeout(450);
  cases.push({ name: "text-middle-globe-then-type", generated: atMiddle, afterTyping: await state() });
  await reset("<p>Alpha beta</p>");
  const atEnd = await generate(".editor-content p", "globe", "end", " ");
  await page.keyboard.insertText("X");
  await page.waitForTimeout(450);
  cases.push({ name: "text-end-globe-then-type", generated: atEnd, afterTyping: await state() });
  await reset("<p>Alpha beta</p>");
  const partial = page.locator(".editor-content p");
  await partial.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.type("/");
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  cases.push({ name: "partial-text-selection-replaced-by-trigger", result: await state() });
  await reset("<p>Alpha beta</p>");
  const complete = page.locator(".editor-content p");
  await complete.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type("/");
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  cases.push({ name: "complete-text-selection-replaced-by-trigger", result: await state() });
  await reset("<p>Alpha beta</p>");
  cases.push({ name: "individual-command-single-paragraph", result: await generate(".editor-content p", "globe-individual", "start") });
  await reset('<div data-globe="true"><span data-globe-icon="true" contenteditable="false">◉</span><div data-globe-content="true"><p>Interior</p></div></div>');
  cases.push({ name: "nested-globe-command", result: await generate("[data-globe-content] p", "globe", "start") });
  await reset("<p>Solo</p><p>Vecino</p>");
  await page.locator(".editor-content > p").first().click({ button: "right" });
  await page.getByRole("button", { name: "Conversión", exact: true }).click();
  await page.locator('[data-picker-menu-item="globe"]').waitFor();
  const singleContextPicker = await state();
  await page.locator('[data-picker-menu-item="globe"]').click();
  await page.waitForTimeout(450);
  cases.push({ name: "single-line-context-conversion", pickerSelection: singleContextPicker, result: await state() });
  for (const command of ["globe", "globe-individual"]) {
    await reset("<p>Uno</p><p>Dos</p><p>Tres</p>");
    const selectionAttempts = [];
    for (const index of [0, 1]) {
      await page.locator(".editor-content > p").nth(index).click({ modifiers: ["Control"] });
      await page.waitForTimeout(30);
      selectionAttempts.push({
        gesture: "control-click",
        index,
        selected: await page.locator(".editor-content > p[data-line-selected]").evaluateAll((blocks) => blocks.map((block) => block.textContent)),
      });
    }
    const selectedBefore = await page.locator(".editor-content > p[data-line-selected]").evaluateAll((blocks) => blocks.map((block) => block.textContent));
    await page.locator(".editor-content > p").nth(1).click({ button: "right" });
    const contextConversionCount = await page.getByRole("button", { name: "Conversión", exact: true }).count();
    await page.getByRole("button", { name: "Conversión", exact: true }).click();
    await page.waitForTimeout(80);
    const pickerItems = await page.locator("[data-picker-menu-item]").evaluateAll((items) => items.map((item) => item.getAttribute("data-picker-menu-item")));
    const selectedAtPicker = await page.locator(".editor-content > p[data-line-selected]").evaluateAll((blocks) => blocks.map((block) => block.textContent));
    const pickerSelection = await state();
    await page.locator(`[data-picker-menu-item="${command}"]`).waitFor();
    await page.locator(`[data-picker-menu-item="${command}"]`).click();
    await page.waitForTimeout(450);
    const pickerAfterCommand = await page.locator("[data-picker]").count();
    const selectedAfterCommand = await page.locator(".editor-content > p[data-line-selected]").evaluateAll((blocks) => blocks.map((block) => block.textContent));
    cases.push({ name: `multi-selection-${command}`, selectionAttempts, selectedBefore, contextConversionCount, pickerItems, selectedAtPicker, pickerSelection, pickerAfterCommand, selectedAfterCommand, result: await state() });
  }
  await reset("<p>Alpha beta</p>");
  const edited = await generate(".editor-content p", "globe", "start");
  const line = page.locator("[data-globe-content] p").first();
  await line.click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("ANTES ");
  await page.keyboard.press("End");
  await page.keyboard.insertText(" DESPUES");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("LINEA");
  await page.keyboard.press("Shift+Enter");
  const globeAfterShiftEnter = await state();
  await page.keyboard.insertText("SHIFT");
  await page.waitForTimeout(450);
  const editStates = [{ step: "before-history", state: await state() }];
  await page.keyboard.press("Control+z");
  editStates.push({ step: "undo-1", state: await state() });
  await page.keyboard.press("Control+z");
  editStates.push({ step: "undo-2", state: await state() });
  await page.keyboard.press("Control+y");
  editStates.push({ step: "redo-1", state: await state() });
  await page.keyboard.press("Control+y");
  editStates.push({ step: "redo-2", state: await state() });
  await reset("<p>Alpha beta</p>");
  const manualLine = page.locator(".editor-content p").first();
  await manualLine.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("LINEA");
  await page.keyboard.press("Shift+Enter");
  const manualAfterShiftEnter = await state();
  await page.keyboard.insertText("SHIFT");
  await page.keyboard.press("Control+z");
  const manualUndo = await state();
  await page.keyboard.press("Control+y");
  const manualRedo = await state();
  editStates.push({ step: "manual-enter-shiftenter-undo-redo", beforeShiftText: manualAfterShiftEnter.text, beforeShiftHtml: manualAfterShiftEnter.html, undo: manualUndo, redo: manualRedo });
  editStates.push({ step: "globe-enter-shiftenter-undo-redo", beforeShiftText: globeAfterShiftEnter.text, beforeShiftHtml: globeAfterShiftEnter.html, undoHtml: editStates.find((entry) => entry.step === "undo-1")?.state?.html });
  await reset("<p>Clipboard text</p>");
  await generate(".editor-content p", "globe", "start");
  const clipboardLine = page.locator("[data-globe-content] p").first();
  await clipboardLine.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+c");
  let copiedText = "";
  try { copiedText = await page.evaluate(() => navigator.clipboard.readText()); } catch {}
  const afterCopy = await state();
  await page.keyboard.press("Control+x");
  const afterCut = await state();
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(450);
  const afterPaste = await state();
  await page.keyboard.press("Home");
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText("EDIT");
  await page.waitForTimeout(450);
  const afterReplace = await state();
  cases.push({ name: "clipboard-copy-cut-paste-replace-inside-globe", copiedText, afterCopy, afterCut, afterPaste, afterReplace });
  await reset("<p>Alpha beta</p>");
  const generatedEmpty = await generate(".editor-content p", "globe", "start");
  const generatedUndoRedo = [generatedEmpty];
  await page.keyboard.press("Control+z");
  generatedUndoRedo.push(await state());
  await page.keyboard.press("Control+y");
  generatedUndoRedo.push(await state());
  editStates.push({ step: "globe-command-undo-redo", states: generatedUndoRedo });
  await page.getByRole("button", { name: "Visit", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#node")?.textContent === "B");
  await page.getByRole("button", { name: "Visit", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#node")?.textContent === "A");
  editStates.push({ step: "navigate-away-back", state: await state() });
  cases.push({ name: "post-generation-edit-history-navigation", generated: edited, editStates });

  const stress = [];
  const stressSeeds = [20261003, 347, 731993, 938271, 17];
  for (const seed of stressSeeds) {
    let randomState = seed >>> 0;
    const random = () => {
      randomState = (randomState + 0x6d2b79f5) | 0;
      let value = randomState;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (values) => values[Math.floor(random() * values.length)];
    await reset(`<p>Previo ${seed}</p><p>Base ${seed}</p><ul><li>Lista ${seed}</li></ul><p>Posterior ${seed}</p>`);
    const actions = [];
    const trace = [];
    const violations = [];
    const check = async (label) => {
      const snapshot = await state();
      if (snapshot.selection && (!snapshot.selection.connected || !snapshot.selection.inEditor)) {
        violations.push({ label, invariant: "selection-connected-in-editor", snapshot });
      }
      if (new Set(snapshot.blockIds).size !== snapshot.blockIds.length) {
        violations.push({ label, invariant: "unique-block-ids", snapshot });
      }
      const invalidList = snapshot.listValidity.find((list) => list.directChildren.some((tag) => tag !== "LI"));
      if (invalidList) violations.push({ label, invariant: "ul-ol-only-li-children", snapshot });
      if (snapshot.serialized !== snapshot.saved) {
        violations.push({ label, invariant: "dom-serialization-equals-react-model", snapshot });
      }
      trace.push({ label, html: snapshot.html, serialized: snapshot.serialized, saved: snapshot.saved, text: snapshot.text, selection: snapshot.selection });
      return snapshot;
    };
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const positions = ["start", 5, "end"];
      const position = pick(positions);
      const command = pick(["globe", "globe-individual"]);
      const selector = cycle === 0 ? ".editor-content > p:nth-child(2)" : "[data-globe-content] p";
      const triggerPrefix = position === "start" ? "" : " ";
      actions.push({ action: "generate", selector, command, position, triggerPrefix });
      const generated = await generate(selector, command, position, triggerPrefix);
      await check(`cycle-${cycle}-generated`);
      const targetLine = page.locator(".editor-content [data-globe-content] p").last();
      await targetLine.click();
      await page.keyboard.press("Home");
      const prefix = `A${cycle}`;
      await page.keyboard.insertText(prefix);
      await page.keyboard.press("End");
      await page.keyboard.insertText(`Z${cycle}`);
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Delete");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText(`L${cycle}`);
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.insertText(`B${cycle}`);
      actions.push({ action: "type-edit-linebreak-delete", prefix, line: `L${cycle}`, shiftLine: `B${cycle}` });
      await page.waitForTimeout(450);
      await check(`cycle-${cycle}-edited`);
      const copyLine = page.locator(".editor-content [data-globe-content] p").last();
      await copyLine.click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Control+x");
      await page.keyboard.press("Control+v");
      await page.keyboard.press("Control+z");
      await page.keyboard.press("Control+y");
      actions.push({ action: "copy-cut-paste-undo-redo" });
      await page.waitForTimeout(450);
      await check(`cycle-${cycle}-clipboard-history`);
      await page.getByRole("button", { name: "Visit", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("#node")?.textContent === "B");
      await page.getByRole("button", { name: "Visit", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("#node")?.textContent === "A");
      await page.waitForTimeout(450);
      actions.push({ action: "save-navigate-away-back" });
      await check(`cycle-${cycle}-roundtrip`);
      trace.at(-1).generated = generated.html;
    }
    const firstViolation = violations[0];
    stress.push({ seed, actions, reducedPrefix: firstViolation ? actions.slice(0, Math.floor((trace.findIndex((item) => item.label === firstViolation.label) + 3) / 4)) : null, violations, trace });
  }

  const summarize = (value) => value ? ({
    html: value.html,
    text: value.text,
    serialized: value.serialized,
    saved: value.saved,
    focus: value.focus,
    selection: value.selection && {
      text: value.selection.text,
      collapsed: value.selection.collapsed,
      connected: value.selection.connected,
      inEditor: value.selection.inEditor,
      inGlobe: value.selection.inGlobe,
      anchor: value.selection.anchor,
      anchorOffset: value.selection.anchorOffset,
    },
    globes: value.globes?.map((globe) => ({ parent: globe.parent, contentBlocks: globe.contentBlocks })),
    emptyParagraphs: value.emptyParagraphs,
    rootChildren: value.rootChildren,
    blockIds: value.blockIds,
    listValidity: value.listValidity,
  }) : null;
  const report = cases.map((item) => ({
    name: item.name,
    copiedText: item.copiedText,
    selectionAttempts: item.selectionAttempts,
    selectedBefore: item.selectedBefore,
    contextConversionCount: item.contextConversionCount,
    pickerItems: item.pickerItems,
    selectedAtPicker: item.selectedAtPicker,
    singleContextPicker: summarize(item.pickerSelection),
    pickerSelection: summarize(item.pickerSelection),
    pickerAfterCommand: item.pickerAfterCommand,
    selectedAfterCommand: item.selectedAfterCommand,
    result: summarize(item.result),
    generated: summarize(item.generated),
    afterTyping: summarize(item.afterTyping),
    reopened: summarize(item.reopened),
    afterCopy: summarize(item.afterCopy),
    afterCut: summarize(item.afterCut),
    afterPaste: summarize(item.afterPaste),
    afterReplace: summarize(item.afterReplace),
    editStates: item.editStates?.map((edit) => ({
      step: edit.step,
      beforeShiftText: edit.beforeShiftText,
      beforeShiftHtml: edit.beforeShiftHtml,
      undoHtml: edit.undoHtml,
      state: summarize(edit.state),
      undo: summarize(edit.undo),
      redo: summarize(edit.redo),
      states: edit.states?.map(summarize),
    })),
  }));
  const reportPath = "tests/editor-audit/results/globe-audit-report.json";
  await mkdir("tests/editor-audit/results", { recursive: true });
  await writeFile(reportPath, JSON.stringify({ cases: report, stress, pageErrors }, null, 2));
  console.log(JSON.stringify({ reportPath, cases: report.map((item) => item.name), stress: stress.map(({ seed, actions, violations, reducedPrefix }) => ({ seed, actions: actions.length, violations: violations.length, reducedPrefix })), pageErrors }));
} finally {
  await browser?.close();
  await server.close();
}