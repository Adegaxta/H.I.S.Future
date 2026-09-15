import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const projectRoot = new URL("../", import.meta.url);
const originalDOMParser = globalThis.DOMParser;

// formatPastedText only needs the decoded body text for the plain-text and
// Markdown cases exercised here; the real application supplies DOMParser.
globalThis.DOMParser = class PlainTextDOMParser {
  parseFromString(source) {
    return { body: { textContent: source } };
  }
};

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { formatPastedText } = await server.ssrLoadModule("/src/editor/html.ts");
  const markdown = formatPastedText([
    "# Título importado",
    "Texto con **negrita**, *cursiva*, ~~tachado~~ y `código`.",
    "- uno",
    "- dos",
    "1. primero",
    "2. segundo",
    "> una cita",
    "```ts",
    "const answer = 42;",
    "```",
  ].join("\n"));

  assert.match(markdown, /<h1>Título importado<\/h1>/);
  assert.match(markdown, /<strong>negrita<\/strong>/);
  assert.match(markdown, /<em>cursiva<\/em>/);
  assert.match(markdown, /<s>tachado<\/s>/);
  assert.match(markdown, /<code>código<\/code>/);
  assert.match(markdown, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
  assert.match(markdown, /<ol><li>primero<\/li><li>segundo<\/li><\/ol>/);
  assert.match(markdown, /<blockquote>una cita<\/blockquote>/);
  assert.match(markdown, /<pre data-language="ts"><code>const answer = 42;<\/code><\/pre>/);

  const [selectionSource, controllerSource, persistenceSource, editorStyles] = await Promise.all([
    readFile(new URL("../src/editor/useEditorBlockSelection.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/useEditorController.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/persistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(selectionSource, /if \(textBlock && !selectionModifier\) return false;/,
    "A first click on imported text must remain a native caret interaction");
  assert.match(selectionSource, /querySelectorAll<HTMLElement>\(`\$\{textLineSelector\}, \[data-globe\]`\)/,
    "Rectangle selection must treat a native Globe as one complete block");
  assert.match(controllerSource, /const normalizeEditableLines = \(\) =>/);
  assert.match(controllerSource, /line\.contentEditable = expected;/,
    "Imported text lines must be normalized as editable at runtime");
  assert.match(persistenceSource, /querySelectorAll\('\[contenteditable="true"\]'\)/,
    "Runtime editability markers must not inflate persisted HTML");
  assert.match(controllerSource, /repairUnlinkedEditorImages/,
    "Raw pasted images are promoted to real Image nodes");
  assert.match(controllerSource, /captureUndo: !event\.repeat/,
    "held Delete coalesces structural history instead of cloning the page per repeat");
  assert.match(controllerSource, /scheduleContentSync\(180, true\)/,
    "held Delete defers persistence until the burst settles");
  assert.match(editorStyles, /\.editor-content \{[\s\S]*?cursor: default;/,
    "the complete editor canvas no longer impersonates a text field");
  assert.match(editorStyles, /\[data-page-index\][\s\S]*?cursor: default;/,
    "page indices keep a selection cursor rather than an I-beam");

  console.log("Editor compatibility tests passed");
} finally {
  await server.close();
  globalThis.DOMParser = originalDOMParser;
}
