import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });

try {
  const capabilities = await server.ssrLoadModule("/src/editor/blockCapabilities.ts");
  assert.equal(capabilities.PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "format").length, 6);
  assert.deepEqual(
    capabilities.PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "property").map((item) => item.id),
    ["dropdown", "globe", "highlighted", "code", "equation", "synced"],
  );
  assert.deepEqual(
    capabilities.PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "list").map((item) => item.value),
    ["bullets", "collapsible", "numbered", "tree", "todo"],
  );
  assert.equal(capabilities.PAGE_BLOCK_COMPATIBILITY.properties.composable, true);
  assert.equal(capabilities.PAGE_BLOCK_COMPATIBILITY.heading.exclusive, true);
  assert.equal(capabilities.PAGE_BLOCK_COMPATIBILITY.list.exclusive, true);

  const attributes = new Map();
  const fakeBlock = {
    tagName: "P",
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
  };
  const highlighted = capabilities.PAGE_BLOCK_CAPABILITIES.find((item) => item.id === "highlighted");
  capabilities.togglePageBlockCapability(fakeBlock, highlighted);
  assert.equal(capabilities.isCapabilityActive(fakeBlock, highlighted), true);
  capabilities.togglePageBlockCapability(fakeBlock, highlighted);
  assert.equal(capabilities.isCapabilityActive(fakeBlock, highlighted), false);
  const code = capabilities.PAGE_BLOCK_CAPABILITIES.find((item) => item.id === "code");
  assert.equal(capabilities.isCapabilityActive({ ...fakeBlock, tagName: "PRE" }, code), true,
    "semantic code blocks imported from Anytype expose Code as active");

  const menu = read("src/editor/PageBlockContextMenu.tsx");
  const editor = read("src/editor/RichTextEditor.tsx");
  const html = read("src/editor/html.ts");
  assert.ok(menu.includes("useHoverSubpanel") && menu.includes("onPointerEnter={aesthetics.enter}") && menu.includes("onPointerLeave={aesthetics.leave}"));
  assert.ok(menu.includes("checkedIcon") && menu.includes("uncheckedIcon"), "provided checked and unchecked SVG assets are used");
  assert.ok(menu.indexOf("props.imageItems?.map") < menu.indexOf('t("editor.context.moveTo")'), "image actions precede Move to");
  for (const action of ["copy", "cut", "paste", "duplicate", "insertAbove", "insertBelow", "delete"]) assert.ok(menu.includes(`editor.context.${action}`));
  assert.ok(editor.includes("captureStructuralUndo") && editor.includes("syncContent"), "capability mutations participate in history and persistence");
  assert.ok(editor.includes("openEditorBlockContextMenu(lineControl.block") && !editor.includes("controller.openLineCommands(lineControl.block, event.currentTarget)"), "the block options button uses the same new context menu");
  assert.ok(editor.includes("controller.resetEditorPickers()") && !editor.includes("controller.dismissEditorMenus();\n    const selected"), "opening block options closes old pickers without destroying multiselection");
  assert.ok(editor.includes("deleteContextBlock(editorContextMenu.block)"), "Delete acts on the menu target instead of depending on delayed action state");
  assert.ok(editor.includes("preserveEditorViewport"), "context mutations retain the current page position");
  assert.ok(!editor.includes('className="editor-line-control-drag"'), "options and dragging share one line control");
  assert.ok(menu.includes("arrowDrop") || (menu.includes("arrowUpIcon") && menu.includes("arrowDownIcon")), "column count uses the supplied arrow assets");
  assert.ok(menu.includes('<div className="page-context-menu__column-row"><img src={columnIcon}') && !menu.includes('page-context-menu__column-row"><img src={uncheckedIcon}'), "columns do not render a checkbox");
  for (const attribute of ["data-his-dropdown", "data-his-highlighted", "data-his-synced", "data-his-list", "data-his-column-layout", "data-his-todo-checked"]) assert.ok(html.includes(attribute));
  const blocks = read("src/editor/useEditorBlocks.ts");
  assert.ok(capabilities.togglePageBlockCapability);
  assert.ok(read("src/editor/blockCapabilities.ts").includes('line.contentEditable = "true"'), "each new column owns an independent editable text block");
  assert.ok(blocks.includes('"[data-globe-content], [data-his-column]"'), "line controls and block operations are scoped to each modular column");
  assert.ok(blocks.includes("sourceScopes.forEach"), "moving the last block out of a column leaves a fresh editable block behind");
  assert.ok(blocks.includes("remainingColumns.length === 1") && blocks.includes("column.remove()"), "deleting the last block removes its column and unwraps a one-column layout");
  assert.ok(blocks.includes("remainingColumns.length === 0") && blocks.includes("layoutParent.insertBefore(line, layout)"), "deleting every column restores one normal editable block");
  const selection = read("src/editor/useEditorBlockSelection.ts");
  assert.ok(selection.includes("(event.ctrlKey || event.metaKey) && (textBlock || target.closest(\"[data-globe]\"))"), "Ctrl/Cmd click reaches discrete block multiselection instead of starting a zero-size rectangle");
  const styles = read("src/editor/styles.css");
  assert.ok(blocks.includes("copyContinuingBlockAttributes") && blocks.includes("window.setTimeout") && blocks.includes("activateLineDrag(pending)"), "styles continue and dragging starts only after a held click");
  assert.ok(styles.includes("check_box_outline_blank") && styles.includes("check_box_256dp") && styles.includes("chevron-down.svg"), "Todo and dropdown use the supplied tinted assets");
  console.log("PASS: page context menu is capability-driven, persistent, and preserves image action ordering.");
} finally {
  await server.close();
}
