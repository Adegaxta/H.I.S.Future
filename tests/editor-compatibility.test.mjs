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
  const { anytypeClipboardToHtml, formatPastedText } = await server.ssrLoadModule("/src/editor/html.ts");
  const { translateColumnWidthsForShift, createInitialTableColumnWidths, TABLE_MIN_COLUMN_WIDTH_PX } = await server.ssrLoadModule("/src/editor/table.ts");
  const { clampEditorImageWidth } = await server.ssrLoadModule("/src/editor/imageResize.ts");
  const { getEditorPickerTrigger } = await server.ssrLoadModule("/src/editor/pickerSession.ts");
  assert.deepEqual(getEditorPickerTrigger("@Nodo con espacios"), { type: "mention", query: "Nodo con espacios" },
    "mention search stays open for multi-word node names");
  assert.deepEqual(getEditorPickerTrigger("Texto @Nodo con espacios"), { type: "mention", query: "Nodo con espacios" },
    "inline multi-word mention queries retain their complete deletion range");
  assert.equal(getEditorPickerTrigger("@Nodo\notra línea"), null,
    "mention search never crosses block line boundaries");
  assert.equal(clampEditorImageWidth(900, 320), 320,
    "resized images cannot exceed their immediate layout container");
  assert.equal(clampEditorImageWidth(10, 320), 40,
    "resized images keep the minimum drag width when the container permits it");
  assert.equal(clampEditorImageWidth(40, 24), 24,
    "very narrow containers take priority over the normal minimum image width");
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

  const paragraph = (id, text) => ({
    id,
    type: "text",
    childrenIds: [],
    content: { text, style: 0 },
  });
  const toc = (id) => ({ id, type: "tableOfContents", childrenIds: [] });
  const renderAnytype = (blocks, availableWidth = 0, clipboardHtml = "") =>
    anytypeClipboardToHtml(JSON.stringify({ blocks }), availableWidth, clipboardHtml);
  const makeTable = (id, columnNames, rowSpecs) => {
    const columnIds = columnNames.map((_, index) => `${id}-column-${index + 1}`);
    const rowIds = rowSpecs.map((row) => row.id);
    const columns = columnIds.map((columnId) => ({ id: columnId, type: "tableColumn", childrenIds: [] }));
    const rows = rowSpecs.map((row) => ({
      id: row.id,
      type: "tableRow",
      childrenIds: row.cells ? row.cells.map((_, index) => `${row.id}-${columnIds[index]}`) : [],
      content: { isHeader: Boolean(row.isHeader) },
    }));
    const cells = rowSpecs.flatMap((row) => (row.cells || []).map((cell, index) => ({
      id: `${row.id}-${columnIds[index]}`,
      type: "text",
      childrenIds: [],
      content: typeof cell === "string" ? { text: cell, style: 0 } : cell,
    })));
    return [
      { id, type: "table", childrenIds: [`${id}-rows`, `${id}-columns`] },
      { id: `${id}-columns`, type: "layout", childrenIds: columnIds, content: { style: 5 } },
      { id: `${id}-rows`, type: "layout", childrenIds: rowIds, content: { style: 4 } },
      ...columns,
      ...rows,
      ...cells,
    ];
  };
  const makeColumns = (id, columns) => {
    const columnIds = columns.map((_, index) => `${id}-column-${index + 1}`);
    return [
      { id, type: "layout", childrenIds: columnIds, content: { style: 0 } },
      ...columnIds.map((columnId, index) => ({
        id: columnId,
        type: "layout",
        childrenIds: columns[index].map((_, blockIndex) => `${columnId}-block-${blockIndex + 1}`),
        content: { style: 1 },
      })),
      ...columns.flatMap((blocks, columnIndex) => blocks.map((text, blockIndex) =>
        paragraph(`${columnIds[columnIndex]}-block-${blockIndex + 1}`, text),
      )),
    ];
  };
  assert.match(renderAnytype([paragraph("p1", "Párrafo")]), /<p>Párrafo<\/p>/,
    "a text-only Anytype clipboard remains accepted");
  const textColumns = renderAnytype(makeColumns("row-1", [["Izquierda", "Segundo"], ["Derecha"]]));
  assert.equal((textColumns.match(/data-his-column="true"/g) || []).length, 2,
    "Anytype Row/Column layouts become native HIS text columns");
  assert.equal((textColumns.match(/Izquierda|Segundo|Derecha/g) || []).length, 3,
    "column descendants are rendered once and retain their source order");
  assert.equal(renderAnytype([toc("toc-1")]), '<div data-page-index="true" data-page-index-source="anytype"></div>',
    "an isolated TOC is accepted without content.text");
  const table2x2 = renderAnytype(makeTable("table-2x2", ["c1", "c2"], [
    { id: "row-1", cells: ["A1", "B1"] },
    { id: "row-2", cells: ["A2", "B2"] },
  ]));
  assert.match(table2x2, /data-his-table="true"/);
  assert.equal((table2x2.match(/data-his-table-row="true"/g) || []).length, 2,
    "a 2x2 table preserves both rows");
  assert.equal((table2x2.match(/data-his-table-cell="true"/g) || []).length, 4,
    "a 2x2 table preserves four cells");
  assert.ok(["A1", "B1", "A2", "B2"].every((value) => table2x2.includes(value)),
    "a 2x2 table preserves cell order and content");
  const emptyTable = renderAnytype(makeTable("table-empty", ["c1", "c2"], [
    { id: "empty-row-1" },
    { id: "empty-row-2" },
  ]));
  assert.equal((emptyTable.match(/data-his-table-cell="true"/g) || []).length, 4,
    "empty rows still produce one cell per column");
  const table3x3 = renderAnytype(makeTable("table-3x3", ["c1", "c2", "c3"], [
    { id: "row-1", cells: ["A1", "B1", "C1"] },
    { id: "row-2", cells: ["A2", "B2", "C2"] },
    { id: "row-3", cells: ["A3", "B3", "C3"] },
  ]));
  assert.equal((table3x3.match(/data-his-table-cell="true"/g) || []).length, 9,
    "a 3x3 table preserves all structural cells");
  const markedTable = renderAnytype(makeTable("table-marked", ["c1", "c2"], [{
    id: "row-1",
    cells: [
      { text: "Bold", style: 0, marks: [{ type: 3, range: { from: 0, to: 4 } }] },
      { text: "Red", style: 0, marks: [{ type: 6, param: "red", range: { from: 0, to: 3 } }] },
    ],
  }]));
  assert.match(markedTable, /<strong>Bold<\/strong>/, "cell marks reuse the Anytype rich-text converter");
  assert.match(markedTable, /color:/, "cell text color survives conversion");
  const multipleTables = renderAnytype([
    ...makeTable("table-first", ["c1"], [{ id: "row-1", cells: ["First"] }]),
    ...makeTable("table-second", ["c1"], [{ id: "row-1", cells: ["Second"] }]),
  ]);
  assert.equal((multipleTables.match(/data-his-table="true"/g) || []).length, 2,
    "multiple tables remain separate in clipboard order");
  assert.ok(multipleTables.indexOf("First") < multipleTables.indexOf("Second"));
  const invalidTable = makeTable("table-invalid", ["c1"], [{ id: "row-1", cells: ["x"] }])
    .filter((block) => block.id !== "table-invalid-rows");
  assert.doesNotMatch(renderAnytype(invalidTable), /data-his-table="true"/, "a table without a rows layout is not reconstructed");
  const missingChildTable = makeTable("table-missing", ["c1"], [{ id: "row-1", cells: ["x"] }])
    .map((block) => block.id === "table-missing-columns" ? { ...block, childrenIds: ["missing-column"] } : block);
  const missingChildHtml = renderAnytype(missingChildTable);
  assert.ok(missingChildHtml === null || !missingChildHtml.includes('data-his-table="true"'),
    "a missing column child rejects table reconstruction");
  const tableWithUnknown = [...makeTable("table-known", ["c1"], [{ id: "row-1", cells: ["Known"] }]), { id: "unknown", type: "futureBlock", childrenIds: [] }];
  assert.match(renderAnytype(tableWithUnknown), /Known/, "unknown sibling blocks do not block a valid table");
  const paragraphTocParagraph = renderAnytype([paragraph("p1", "Antes"), toc("toc-1"), paragraph("p2", "Después")]);
  assert.ok(paragraphTocParagraph.indexOf("Antes") < paragraphTocParagraph.indexOf("data-page-index") &&
    paragraphTocParagraph.indexOf("data-page-index") < paragraphTocParagraph.indexOf("Después"),
  "paragraph + TOC + paragraph preserves order");
  const tocParagraph = renderAnytype([toc("toc-1"), paragraph("p1", "Después")]);
  assert.ok(tocParagraph.indexOf("data-page-index") < tocParagraph.indexOf("Después"),
    "TOC + paragraph preserves order");
  const paragraphToc = renderAnytype([paragraph("p1", "Antes"), toc("toc-1")]);
  assert.ok(paragraphToc.indexOf("Antes") < paragraphToc.indexOf("data-page-index"),
    "paragraph + TOC preserves order");
  assert.equal(anytypeClipboardToHtml(JSON.stringify({ blocks: [{ id: "x", type: "algoDesconocido" }] })), null,
    "arbitrary JSON blocks are not accepted as Anytype clipboard");
  assert.equal(anytypeClipboardToHtml(JSON.stringify({ foo: "bar" })), null,
    "arbitrary JSON without blocks is rejected");
  assert.equal(anytypeClipboardToHtml(JSON.stringify({ blocks: [] })), null,
    "empty Anytype block payload is rejected");
  assert.equal(anytypeClipboardToHtml(JSON.stringify({ blocks: [{ id: "toc-1", type: "tableOfContents", childrenIds: "invalid" }] })), null,
    "structurally invalid blocks are rejected");
  const mixed = renderAnytype([paragraph("p1", "Antes"), toc("toc-1"), { id: "unknown", type: "futureBlock", childrenIds: [] }, paragraph("p2", "Después")]);
  assert.ok(mixed.includes("Antes") && mixed.includes("Después") && mixed.includes("data-page-index"),
    "known blocks survive alongside an unknown structurally valid block");

  const [selectionSource, controllerSource, persistenceSource, editorStyles, tableSource, richTextSource, tableCss, blockModelSource, richTextHookSource, tableActionsSource, tableSelectionSource, tableClipboardSource, tableMenuSource] = await Promise.all([
    readFile(new URL("../src/editor/useEditorBlockSelection.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/useEditorController.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/persistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/table.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/RichTextEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/table.css", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/blockModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/useRichTextEditor.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/tableActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/tableSelection.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/tableClipboard.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/TableOptionsMenu.tsx", import.meta.url), "utf8"),
  ]);
  const globeEditorSource = await readFile(new URL("../src/editor/RichTextEditor.tsx", import.meta.url), "utf8");
  const globeIconSource = await readFile(new URL("../src/editor/globeIcon.ts", import.meta.url), "utf8");
  const iconPickerSource = await readFile(new URL("../src/nodes/capabilities/IconCapabilityPicker.tsx", import.meta.url), "utf8");
  const pageChromeSource = await readFile(new URL("../src/nodes/page/chrome.tsx", import.meta.url), "utf8");
  const serializationSource = await readFile(new URL("../src/editor/serialization.ts", import.meta.url), "utf8");
  assert.match(selectionSource, /if \(textBlock && !selectionModifier\) return false;/,
    "A first click on imported text must remain a native caret interaction");
  assert.match(selectionSource, /querySelectorAll<HTMLElement>\(`\$\{textLineSelector\}, \[data-globe\], \[data-his-table\]`\)/,
    "Rectangle selection must treat native Globe and Table as complete blocks");
  assert.match(controllerSource, /const normalizeEditableLines = \(\) =>/);
  assert.match(controllerSource, /line\.contentEditable = expected;/,
    "Imported text lines must be normalized as editable at runtime");
  assert.match(controllerSource, /const normalizePageIndices = \(\) =>/);
  assert.match(controllerSource, /normalizePageIndices\(\);/,
    "pasted indices are normalized into the native HIS index");
  assert.doesNotMatch(controllerSource, /fragment\.querySelectorAll<HTMLElement>\("\[data-page-index\]"\)\.forEach\(\(index\) => index\.remove\(\)\)/,
    "pasted native indices are not discarded after insertion");
  assert.match(persistenceSource, /serializeEditorContent/,
    "Runtime editability markers are removed behind the document serialization boundary");
  assert.doesNotMatch(persistenceSource, /removeAttribute|setAttribute|cloneNode/,
    "capturing content must not mutate or clone the live editor DOM");
  assert.match(controllerSource, /repairUnlinkedEditorImages/,
    "Raw pasted images are promoted to real Image nodes");
  assert.match(globeEditorSource, /hasPageBlockCapability\(globe, "icon"\)/,
    "Globe asks the block capability registry before opening icon selection");
  assert.doesNotMatch(globeEditorSource, /new FileReader\(\)/,
    "Globe no longer owns an inline FileReader icon importer");
  assert.match(globeIconSource, /globeNodeIconPersistence/,
    "Globe keeps its own persistence adapter for NodeIconState");
  assert.match(globeIconSource, /return globeNodeIconPersistence\.read\(globe\.outerHTML\)/,
    "Globe reconstructs all visual providers through its persistence adapter");
  assert.doesNotMatch(globeIconSource, /label\.textContent = visual\.name/,
    "technical icon names are never inserted as Globe visual text");
  assert.match(globeIconSource, /dataset\.nodeId/,
    "Globe preserves image resource references through its block adapter");
  assert.match(iconPickerSource, /IconPicker onSelect/,
    "Globe and Page use the existing icon picker implementation");
  assert.match(controllerSource, /captureUndo: !event\.repeat/,
    "held Delete coalesces structural history instead of cloning the page per repeat");
  assert.match(controllerSource, /scheduleContentSync\(180, true\)/,
    "held Delete defers persistence until the burst settles");
  assert.equal((controllerSource.match(/useNodeScopedEditorHistory</g) || []).length, 1,
    "text and structural edits share one chronological undo stack");
  assert.match(controllerSource, /captureInputUndo[\s\S]*pushEditorHistory\(\)/,
    "normal beforeinput edits are captured before the browser changes the document");
  assert.match(controllerSource, /restoreSelectionSnapshot\(editor, snapshot\.selection\)/,
    "undo restores the caret or selection together with the document snapshot");
  assert.match(richTextSource, /lang=\{locale === "es" \? "es-ES" : "en-US"\}/,
    "the editor spell-check language follows the project locale");
  assert.match(richTextSource, /spellCheck=\{!readOnly\}/,
    "editable HIS content enables native spelling underlines");
  assert.match(richTextSource, /spelling\.request\(event\.clientX, event\.clientY, openBlock\)/,
    "editable text routes spelling suggestions before block options");
  assert.match(editorStyles, /\.editor-content \{[\s\S]*?cursor: default;/,
    "the complete editor canvas no longer impersonates a text field");
  assert.match(editorStyles, /\[data-page-index\][\s\S]*?cursor: default;/,
    "page indices keep a selection cursor rather than an I-beam");
  assert.match(editorStyles, /\[data-globe-icon\][\s\S]*?min-width: 28px[\s\S]*?overflow: hidden/,
    "Globe icon slots keep the legacy fixed footprint");
  assert.match(editorStyles, /material-symbols-rounded[\s\S]*?font-family: "Material Symbols Rounded" !important[\s\S]*?font-feature-settings: "liga" !important/,
    "Material icon names remain ligatures instead of visible labels inside Globe");
  assert.match(editorStyles, /\.editor-content \[data-globe-icon\] \{[^}]*color: #e8e9ea;/,
    "Globe visual slots use the normal light icon color");
  assert.doesNotMatch(editorStyles, /\.editor-content \[data-globe-icon\] \{[^}]*color: #d8b34d;/,
    "Globe icon slots do not inherit the legacy yellow accent");
  assert.match(tableSource, /export function createTable\(availableWidth: number\)/,
    "Table owns creation of its responsive persisted DOM structure");
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
  assert.match(tableSource, /table_option_active\.svg[\s\S]*table_option_inactive\.svg/,
    "row and column handles use the requested original active and inactive textures");
  assert.match(tableSource, /more_vert\.svg/,
    "cell options retain the requested vertical points asset");
  assert.match(tableSource, /drag_indicator\.svg/,
    "hover and drag handles use the requested drag asset");
  assert.match(tableSource, /normalIcon\.dataset\.hisTableHandleIcon = "normal"/,
    "a normal handle visual is represented by an image asset");
  assert.doesNotMatch(tableSource, /for \(let index = 0; index < 6; index \+= 1\) button\.appendChild\(document\.createElement\("span"\)\)/,
    "table handles no longer draw six synthetic dots");
  assert.match(tableSource, /dataset\.hisTableColumnHandles = "true"/,
    "column handles live in one grid-level overlay");
  assert.match(tableCss, /\[data-his-table-handle\] \{[\s\S]*?background: transparent;/,
    "handle hit areas have no visible pill background");
  assert.match(tableCss, /his-table-handle-icon="drag"\][\s\S]*?display: none/,
    "the drag asset is hidden until it replaces the normal asset");
  assert.doesNotMatch(tableCss, /\[data-his-table-cell\]:hover::before|\[data-his-table-cell\]\[data-his-table-active="true"\]::before/,
    "active cells no longer render a cyan pseudo-handle capsule");
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
  assert.match(tableSource, /const boundaryX = cell\.getBoundingClientRect\(\)\.right/,
    "Table resize resolves one exact geometric boundary instead of competing adjacent cells");
  assert.match(tableSource, /const outerRight = index === cells\.length - 1/,
    "Table resize allows the outer right border");
  assert.match(tableSource, /function markTableResizeBoundary[\s\S]*?querySelectorAll<HTMLElement>\(TABLE_ROW_SELECTOR\)/,
    "Table resize highlights the selected boundary across every row");
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
  assert.match(tableSource, /TABLE_MIN_COLUMN_WIDTH_PX = 100/,
    "initial sizing uses one centralized minimum column width");
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
  assert.match(serializationSource, /EDITOR_UI_ATTRIBUTE/,
    "editor UI controls are excluded from persisted document HTML");
  assert.match(richTextHookSource, /ensureTableRuntime\(editorRef\.current\)/,
    "persisted tables are hydrated with runtime controls on load");
  assert.match(tableCss, /\[data-his-table-cell\]:focus[\s\S]*?var\(--his-accent\)[\s\S]*?outline: 0/,
    "table cell focus uses the HIS accent without native outline overlap");
  assert.match(tableCss, /overflow-x: auto/,
    "table keeps horizontal overflow inside its own viewport");
  assert.match(tableCss, /\[data-his-table-cell\][\s\S]*?min-width: 0[\s\S]*?overflow-wrap: anywhere/,
    "table cells wrap long text without hiding it");
  assert.match(richTextSource, /data-his-table-cell/,
    "context actions recognize table cells");
  assert.match(richTextSource, /ensureCellContentBlock/,
    "context conversion targets cell content without replacing the cell");
  assert.match(controllerSource, /isTableEditingTarget\([\s\S]*?event\.target instanceof Node/,
    "Delete and Backspace inside a table remain native cell editing");
  assert.match(richTextHookSource, /installTableInputGuard\(editor\)/,
    "the editor installs Table's native beforeinput guard");
  assert.match(richTextHookSource, /installTableResizeHandlers\(editor\)/,
    "the editor installs Table's resize behavior through the Table module");
  assert.match(tableSource, /querySelectorAll<HTMLElement>\(`:scope > \$\{TABLE_CELL_SELECTOR\}`\)/,
    "table geometry ignores runtime handles when counting or measuring cells");
  assert.match(tableActionsSource, /export function fitTableColumns/,
    "symmetry is a reusable table action rather than menu-local behavior");
  assert.match(tableActionsSource, /Math\.max\(TABLE_MIN_COLUMN_WIDTH_PX/,
    "symmetry and structural operations preserve the centralized minimum width");
  assert.match(tableSelectionSource, /TABLE_SELECTED/,
    "multi-cell selection is isolated in a transient selection module");
  assert.match(tableSelectionSource, /TABLE_UNIT_SELECTED/,
    "row and column outlines use state distinct from Ctrl-click multi-selection");
  assert.match(tableCss, /data-his-table-unit-selected="row"[\s\S]*?background: transparent/,
    "row selection draws an outline without the multi-selection fill");
  assert.match(tableCss, /data-his-table-unit-selected="column"[\s\S]*?background: transparent/,
    "column selection draws an outline without the multi-selection fill");
  assert.match(richTextSource, /Opciones de celdas seleccionadas/,
    "Ctrl-click selection exposes one shared options button");
  assert.match(tableCss, /\.his-table-menu \{ width: 360px/,
    "the full table menu keeps the compact Anytype-like scale");
  assert.match(tableSource, /export function setHoveredTableHandles/,
    "table runtime should expose hover-scoped row and column handles");
  assert.match(richTextSource, /addEventListener\("pointerover", updateHoveredHandles, true\)/,
    "table handle visibility should use native delegated pointer tracking inside contentEditable");
  assert.match(tableCss, /data-his-table-row\]:hover > \[data-his-table-handle="row"\]/,
    "row handles should retain a CSS hover fallback");
  assert.match(tableCss, /data-his-table-cell\]:nth-child\(1\):hover[\s\S]*?data-his-table-handle="column"\]:nth-child\(1\)/,
    "column handles should retain a direct CSS hover fallback");
  assert.match(tableSource, /cell\.onmouseenter[\s\S]*?setHoveredTableHandles\(editor, cell\)/,
    "each runtime table cell should directly reveal its row and column controls");
  assert.match(tableCss, /data-his-table-handle="column"[^\n]*data-his-table-handle-icon="drag"[^\n]*rotate\(90deg\)/,
    "column drag indicator should remain horizontal");
  assert.doesNotMatch(tableCss, /data-his-table-active="true"\] > \[data-his-table-handle="cell"\]/,
    "cell options should not remain visible merely because a cell has focus");
  assert.match(tableClipboardSource, /text\/plain/);
  assert.match(tableClipboardSource, /text\/html/,
    "cell clipboard writes both TSV and HTML table representations");
  assert.match(tableMenuSource, /Lucide\.dev\/icons\/type\.svg/,
    "the style control uses the corrected type icon");
  assert.match(tableMenuSource, /google-material\/icons\/format_color\.svg/,
    "the text-color control uses the corrected format_color icon");
  assert.match(tableMenuSource, /original\/icons\/container_button\.svg[\s\S]*original\/icons\/circle_button_generic\.svg/,
    "the header switch uses the supplied original container and circle assets");
  assert.match(tableCss, /background: #121417/,
    "table option surfaces use the requested flat background color");
  assert.match(tableCss, /his-table-menu__action\.is-dangerous:hover[\s\S]*?#ff626a/,
    "destructive table actions receive a gradual red hover state");
  assert.match(richTextSource, /landedOnCellShell[\s\S]*focusTableCellAtPoint\(clickedCell, event\.clientX, event\.clientY\)/,
    "clicking unused cell space repairs the caret at the nearest writable point");
  assert.match(tableSelectionSource, /editor\?\.focus\(\{ preventScroll: true \}\);[\s\S]*caretPositionFromPoint/,
    "table-cell caret placement focuses the editing host before resolving click coordinates");
  assert.match(pageChromeSource, /observer\.observe\(editor\)/,
    "the custom scrollbar remeasures when editor content changes height");
  assert.match(pageChromeSource, /requestAnimationFrame\(updateThumb\)/,
    "scrollbar DOM writes are throttled to one animation frame");
  assert.match(blockModelSource, /data-his-table-active/);
  assert.match(blockModelSource, /data-his-table-selected/,
    "active and selected cell state is explicitly excluded from persistence");
  assert.match(blockModelSource, /data-his-table-unit-selected/,
    "row and column outline state is excluded from persistence");
  assert.match(blockModelSource, /data-his-table-hovered/,
    "contextual table handle visibility is excluded from persistence");

  const wideFiveColumnWidths = createInitialTableColumnWidths(5, 900, 900);
  assert.equal(wideFiveColumnWidths.length, 5);
  assert.deepEqual(wideFiveColumnWidths, [180, 180, 180, 180, 180],
    "five columns use the available width uniformly when it fits");
  assert.equal(wideFiveColumnWidths.reduce((sum, width) => sum + width, 0), 900);
  const narrowFiveColumnWidths = createInitialTableColumnWidths(5, 300);
  assert.deepEqual(narrowFiveColumnWidths, Array(5).fill(TABLE_MIN_COLUMN_WIDTH_PX),
    "narrow tables use the centralized minimum and allow overflow only when required");
  assert.equal(createInitialTableColumnWidths(1, 800, 800)[0], 800,
    "one column uses the available width");
  assert.deepEqual(createInitialTableColumnWidths(2, 800, 800), [400, 400],
    "two columns share the available width");
  assert.ok(createInitialTableColumnWidths(20, 0).every(Number.isFinite),
    "invalid available widths still produce finite tracks");

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
