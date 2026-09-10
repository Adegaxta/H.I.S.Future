import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});

try {
  const { buildNodeContextMenuItems } = await server.ssrLoadModule("/src/components/ContextMenu.tsx");
  const { withExitAction } = await server.ssrLoadModule("/src/components/HisContextMenu.tsx");
  const { ES_TRANSLATIONS } = await server.ssrLoadModule("/src/i18n/translations.ts");
  const { opensNodeViewOnClick } = await server.ssrLoadModule("/src/utils/nodeTree.ts");
  const { changedNodeIds, recordRecentActivity } = await server.ssrLoadModule("/src/utils/recentActivity.ts");

  const t = (key, params = {}) => Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    ES_TRANSLATIONS[key] ?? key,
  );
  const calls = [];
  const callbacks = {
    onCreate: (id) => calls.push(["create", id]),
    onView: (id) => calls.push(["view", id]),
    onSetPrimary: (id) => calls.push(["set-primary", id]),
    onRemoveFromLore: (id) => calls.push(["remove-lore", id]),
    onDelete: (id) => calls.push(["delete", id]),
  };

  const loreItems = buildNodeContextMenuItems({
    ...callbacks,
    t,
    menu: { context: "lore", nodeId: "folder", x: 0, y: 0 },
    removeCount: 1,
  });
  assert.deepEqual(loreItems.map((item) => item.id), ["create", "rename", "view", "set-primary", "remove-lore"]);
  loreItems.find((item) => item.id === "remove-lore").onSelect();
  assert.deepEqual(calls, [["remove-lore", "folder"]], "Lore removal does not invoke entity deletion");

  const multiSelectedItems = buildNodeContextMenuItems({
    ...callbacks,
    t,
    canSetPrimary: false,
    menu: { context: "lore", nodeId: "folder", x: 0, y: 0 },
    removeCount: 2,
  });
  assert.equal(multiSelectedItems.some((item) => item.id === "set-primary"), false, "Primary action is hidden for multiple selection");

  calls.length = 0;
  const typeItems = buildNodeContextMenuItems({
    ...callbacks,
    t,
    menu: { context: "types", nodeId: "page", x: 0, y: 0 },
  });
  assert.deepEqual(typeItems.map((item) => item.id), ["rename", "view", "set-primary", "delete"]);
  typeItems.find((item) => item.id === "delete").onSelect();
  assert.deepEqual(calls, [["delete", "page"]]);

  const folder = { id: "folder", name: "Folder", type: "categoria", parentId: null, order: 0, content: "" };
  const page = { ...folder, id: "page", type: "pagina" };
  assert.equal(opensNodeViewOnClick(folder), false, "left click keeps a structural Folder in Lore");
  assert.equal(opensNodeViewOnClick(page), true);
  calls.length = 0;
  loreItems.find((item) => item.id === "view").onSelect();
  assert.deepEqual(calls, [["view", "folder"]], "the contextual View action opens the existing Folder view");

  const completeMenu = withExitAction(typeItems, t("context.exit"));
  assert.equal(completeMenu.at(-1).id, "close-menu");
  assert.equal(completeMenu.at(-1).label, "Salir");

  const activity = { older: 100, current: 200 };
  const afterOpen = recordRecentActivity(activity, "older", "navigate", 300);
  assert.equal(afterOpen, activity, "opening a Node preserves timestamps and order");
  assert.deepEqual(Object.entries(afterOpen).sort((a, b) => b[1] - a[1]).map(([id]) => id), ["current", "older"]);
  const afterEdit = recordRecentActivity(activity, "older", "edit", 300);
  assert.equal(afterEdit.older, 300, "a real edit updates recent activity");
  assert.deepEqual(Object.entries(afterEdit).sort((a, b) => b[1] - a[1]).map(([id]) => id), ["older", "current"]);
  assert.deepEqual(
    changedNodeIds([page, folder], [{ ...page, content: "edited" }, folder]),
    ["page"],
    "domain mutations attribute activity only to Nodes whose persisted state changed",
  );

  console.log("PASS: contextual actions, Folder navigation and mutation-only Recent activity.");
} finally {
  await server.close();
}
