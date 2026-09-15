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
  const { translateColumnWidthsForShift } = await server.ssrLoadModule("/src/editor/table.ts");
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

  const [selectionSource, controllerSource, persistenceSource, editorStyles, tableSource, richTextSource, tableCss, blockModelSource, richTextHookSource] = await Promise.all([
    readFile(new URL("../src/editor/useEditorBlockSelection.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/useEditorController.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/persistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/table.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/RichTextEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/table.css", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/blockModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/useRichTextEditor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(selectionSource, /if \(textBlock && !selectionModifier\) return false;/,
    "A first click on imported text must remain a native caret interaction");
  assert.match(selectionSource, /querySelectorAll<HTMLElement>\(`\$\{textLineSelector\}, \[data-globe\]`\)/,
    "Rectangle selection must treat a native Globe as one complete block");
  assert.match(controllerSource, /const normalizeEditableLines = \(\) =>/);
  assert.match(controllerSource, /line\.contentEditable = expected;/,
    "Imported text lines must be normalized as editable at runtime");
  assert.match(controllerSource, /const normalizePageIndices = \(\) =>/);
  assert.match(controllerSource, /\["border-top", "border-bottom"\]/,
    "legacy generated indices lose their artificial start and end dividers");
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
  assert.match(tableSource, /export function createTable\(\)/,
    "Table owns creation of its persisted DOM structure");
  assert.match(tableSource, /grid\.append\(createTableRow\(3\), createTableRow\(3\), createTableRow\(3\)\)/,
    "new tables start at 3 by 3");
  assert.match(tableSource, /export function insertTableIntoBlock\(block/,
    "Table owns replacement of residual command content");
  assert.match(tableSource, /export function addTableColumn\(table/,
    "Table owns column mutations");
  assert.match(tableSource, /export function addTableRow\(table/,
    "Table owns row mutations");
  assert.doesNotMatch(controllerSource, /data-his-table-cell.*contentEditable|createTableCell/,
    "the editor controller delegates cell construction to Table");
  assert.doesNotMatch(richTextSource, /data-his-table-row|createTableCell/,
    "the React editor delegates table structure to Table");
  assert.match(tableSource, /button\.dataset\.editorUi = "true"/,
    "table controls are marked as editor UI");
  assert.match(tableSource, /icon\.dataset\.editorUi = "true"/,
    "table assets are marked as editor UI");
  assert.doesNotMatch(tableSource, /wrapper\.contentEditable = "false"/,
    "table cells are not nested under a non-editable wrapper");
  assert.doesNotMatch(tableSource, /cell\.contentEditable = "true"/,
    "table cells use the editor editing host instead of nested editing islands");
  assert.match(tableSource, /export function ensureTableRuntime\(editor/,
    "legacy tables receive runtime controls without changing persistence");
  assert.match(tableSource, /export function isTableEditingTarget\(source/,
    "Table owns detection of editing inside its cells");
  assert.match(tableSource, /export function shouldPreventTableStructureDeletion\(inputType/,
    "Table owns protection against structural cell deletion");
  assert.match(tableSource, /export function installTableInputGuard\(editor/,
    "Table installs its native beforeinput guard");
  assert.match(tableSource, /export function installTableResizeHandlers\(editor/,
    "Table owns border resizing");
  assert.match(tableSource, /nearLeft/,
    "Table resize detects interior borders from either adjacent cell");
  assert.match(tableSource, /columnIndex === columnCount - 1/,
    "Table resize allows the outer right border");
  assert.match(tableSource, /function resizeTableWidth\(/,
    "Table resize changes the table width at the outer right border");
  assert.match(tableSource, /rightWall: editor\.getBoundingClientRect\(\)\.right/,
    "The outer right border uses the editor wall as its horizontal limit");
  assert.match(tableSource, /nextContentWidth = Math\.min\([\s\S]*availableContentWidth[\s\S]*initialContentWidth \+ delta/,
    "The outer right border can push the final cell toward the right wall");
  assert.match(tableSource, /for \(let index = widths\.length - 1/,
    "The outer right border pushes columns from right to left at their minimum");
  assert.match(tableSource, /grid\.style\.setProperty\("--his-table-columns-template"/,
    "Adding a column refreshes the grid track template immediately");
  assert.match(tableSource, /TABLE_INITIAL_CONTENT_WIDTH_PX = 360/,
    "New tables start with a compact content width");
  assert.match(tableSource, /for \(let index = columnIndex \+ 1/,
    "Interior right drags push through following columns");
  assert.match(tableSource, /for \(let index = columnIndex; index >= 0/,
    "Interior left drags push through preceding columns");
  assert.match(tableSource, /initialWidths: getColumnWidths\(grid\)/,
    "Table resize snapshots column widths at drag start");
  assert.match(tableSource, /function translateTableColumnWithShift\(/,
    "Shift resize has a separate whole-column path");
  assert.match(tableSource, /export function translateColumnWidthsForShift\(/,
    "Shift translation uses an explicit track transformation");
  assert.match(tableSource, /shift: isShiftPressed\(event\)/,
    "Shift state is initialized from the real pointer gesture");
  assert.match(tableSource, /event\.getModifierState\("Shift"\)/,
    "Shift state also reads the live pointer modifier state");
  assert.match(tableSource, /const shift = isShiftPressed\(event\)/,
    "Shift can be toggled during a resize gesture");
  assert.match(tableSource, /drag\.initialWidths = getColumnWidths\(drag\.grid\)/,
    "Changing Shift rebases from the current geometry without a jump");
  assert.match(tableSource, /else if \(drag\.shift\) \{[\s\S]*?translateTableColumnWithShift\(/,
    "Shift resize does not replace the normal modular resize");
  assert.match(tableSource, /function scrollTableWithWheel\(event/,
    "Table owns horizontal wheel scrolling");
  assert.doesNotMatch(tableSource, /resizeTableRow|axis: "row"/,
    "Table resize stays limited to vertical column borders");
  assert.match(tableSource, /cell\.setPointerCapture\(event\.pointerId\)/,
    "Table resize captures the pointer while crossing adjacent cells");
  assert.match(tableSource, /function getResizeEdgeAtPoint\(editor/,
    "Table resize scans visible cell boundaries instead of relying on event target");
  assert.match(blockModelSource, /EDITOR_UI_SELECTOR/,
    "editor UI has a reusable semantic marker");
  assert.match(controllerSource, /!image\.closest\(EDITOR_UI_SELECTOR\)/,
    "editor UI images are excluded from image-node repair");
  assert.match(persistenceSource, /querySelectorAll\(EDITOR_UI_SELECTOR\)/,
    "editor UI controls are excluded from persisted document HTML");
  assert.match(richTextHookSource, /ensureTableRuntime\(editorRef\.current\)/,
    "persisted tables are hydrated with runtime controls on load");
  assert.match(tableCss, /\[data-his-table-cell\]:focus[\s\S]*?var\(--his-accent\)[\s\S]*?outline: 0/,
    "table cell focus uses the HIS accent without native outline overlap");
  assert.match(tableCss, /overflow-x: auto/,
    "table keeps horizontal overflow inside its own viewport");
  assert.match(controllerSource, /isTableEditingTarget\([\s\S]*?event\.target instanceof Node/,
    "Delete and Backspace inside a table remain native cell editing");
  assert.match(richTextHookSource, /installTableInputGuard\(editor\)/,
    "the editor installs Table's native beforeinput guard");
  assert.match(richTextHookSource, /installTableResizeHandlers\(editor\)/,
    "the editor installs Table's resize behavior through the Table module");

  assert.deepEqual(translateColumnWidthsForShift([120, 160, 140], 1, 40), [160, 160, 100],
    "Shift moves the middle column right while preserving its width");
  assert.deepEqual(translateColumnWidthsForShift([120, 160, 140], 1, -40), [80, 160, 180],
    "Shift moves the middle column left while preserving its width");
  assert.deepEqual(translateColumnWidthsForShift([120, 160, 140], 0, 40), [120, 160, 140],
    "Shift leaves the first column anchored because it has no left neighbor");
  assert.deepEqual(translateColumnWidthsForShift([120, 160, 140], 2, -40), [120, 160, 140],
    "Shift leaves the last column anchored because it has no right neighbor");
  assert.deepEqual(translateColumnWidthsForShift([48, 160, 140], 1, -40), [48, 160, 140],
    "Shift stops when the left neighbor reaches the minimum");
  assert.deepEqual(translateColumnWidthsForShift([120, 160, 48], 1, 40), [120, 160, 48],
    "Shift stops when the right neighbor reaches the minimum");

  console.log("Editor compatibility tests passed");
} finally {
  await server.close();
  globalThis.DOMParser = originalDOMParser;
}
