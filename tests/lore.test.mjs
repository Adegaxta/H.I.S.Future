import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { getLoreNodes, setLoreMembership, selectLoreRange } = await server.ssrLoadModule("/src/utils/loreTree.ts");
  const nodes = [
    { id: "folder", name: "Folder", type: "categoria", parentId: null, order: 0, content: "folder content" },
    { id: "child", name: "Page", type: "pagina", parentId: "folder", order: 0, content: "page content" },
    { id: "other", name: "Other", type: "pagina", parentId: null, order: 1, content: "other content" },
  ];
  const hidden = setLoreMembership(nodes, ["folder", "child"], false);
  assert.equal(hidden.length, nodes.length, "removal must preserve every project node");
  assert.deepEqual(hidden.map(({ loreHidden, ...node }) => node), nodes, "content and relationships must not change");
  assert.deepEqual(getLoreNodes(hidden).map((node) => node.id), ["other"]);
  const restoredChild = setLoreMembership(hidden, ["child"], true);
  assert.equal(getLoreNodes(restoredChild).find((node) => node.id === "child").parentId, null, "individually restored child remains visible");
  assert.equal(restoredChild.find((node) => node.id === "child").parentId, "folder", "project parent stays intact");
  assert.deepEqual(getLoreNodes(setLoreMembership(hidden, ["folder"], true)).map(({ loreHidden, ...node }) => node), nodes);
  assert.ok(nodes.every((node) => node.loreHidden === undefined), "operations must not mutate input");
  const order = ["folder", "child", "other"];
  assert.deepEqual(selectLoreRange(order, ["folder"], "folder", "other", true, false), ["folder", "other"]);
  assert.deepEqual(selectLoreRange(order, ["folder"], "folder", "folder", true, false), []);
  assert.deepEqual(selectLoreRange(order, ["other"], "other", "folder", false, true), order);
  assert.deepEqual(selectLoreRange(order, ["other"], "other", "child", false, false), ["child"]);
  console.log("PASS: Lore removal, subtree restoration, individual restoration, data preservation, and multiple selection.");
} finally {
  await server.close();
}
