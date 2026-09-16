import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const { getLoreAncestorIds, getLoreConnectorTopology, getLoreExpandableIds, getLoreNodes, getNodeSidebarLocation, setLoreMembership, selectLoreRange } = await server.ssrLoadModule("/src/utils/loreTree.ts");
  assert.equal(getLoreConnectorTopology(0), "none", "zero visible children use NONE");
  assert.equal(getLoreConnectorTopology(1), "single", "one visible child uses SINGLE");
  assert.equal(getLoreConnectorTopology(2), "multiple", "two visible children use MULTIPLE");
  assert.equal(getLoreConnectorTopology(10), "multiple", "ten visible children use MULTIPLE");
  const nodes = [
    { id: "folder", name: "Folder", type: "categoria", parentId: null, order: 0, content: "folder content" },
    { id: "child", name: "Page", type: "pagina", parentId: "folder", order: 0, content: "page content" },
    { id: "other", name: "Other", type: "pagina", parentId: null, order: 1, content: "other content" },
  ];
  const hidden = setLoreMembership(nodes, ["folder", "child"], false);
  assert.equal(hidden.length, nodes.length, "removal must preserve every project node");
  assert.deepEqual(hidden.map(({ loreHidden, ...node }) => node), nodes, "content and relationships must not change");
  assert.deepEqual(getLoreNodes(hidden).map((node) => node.id), ["other"]);
  assert.equal(getNodeSidebarLocation(hidden, "child"), "types");
  assert.equal(getNodeSidebarLocation(hidden, "other"), "lore");
  const restoredChild = setLoreMembership(hidden, ["child"], true);
  assert.equal(getLoreNodes(restoredChild).find((node) => node.id === "child").parentId, null, "individually restored child remains visible");
  assert.equal(restoredChild.find((node) => node.id === "child").parentId, "folder", "project parent stays intact");
  assert.deepEqual(getLoreAncestorIds(restoredChild, "child"), [], "hidden ancestors are skipped by the Lore projection");
  assert.deepEqual(getLoreAncestorIds(nodes, "child"), ["folder"]);
  assert.deepEqual(getLoreNodes(setLoreMembership(hidden, ["folder"], true)).map(({ loreHidden, ...node }) => node), nodes);
  assert.ok(nodes.every((node) => node.loreHidden === undefined), "operations must not mutate input");

  const tree = [
    { id: "project", name: "H.I.S. Future", type: "proyecto", parentId: null, order: 0, content: "" },
    { id: "a", name: "A", type: "pagina", parentId: "project", order: 0, content: "" },
    { id: "b", name: "B", type: "categoria", parentId: "project", order: 1, content: "" },
    { id: "grandchild", name: "Nieto", type: "pagina", parentId: "b", order: 0, content: "" },
    { id: "c", name: "C", type: "pagina", parentId: "project", order: 2, content: "" },
  ];
  const loreMembers = getLoreNodes(tree);
  assert.deepEqual(getLoreExpandableIds(tree), ["project", "b"], "Project and nested folders are expandable");
  const childrenByParent = (parentId) => loreMembers.filter((node) => node.parentId === parentId).sort((left, right) => left.order - right.order);
  const visibleIds = (expanded) => {
    const result = [];
    const visit = (parentId) => childrenByParent(parentId).forEach((node) => {
      result.push(node.id);
      if (expanded.has(node.id)) visit(node.id);
    });
    visit(null);
    return result;
  };
  const collapsed = new Set();
  assert.deepEqual(visibleIds(collapsed), ["project"], "collapsed Project shows only the root");
  collapsed.add("project");
  assert.deepEqual(visibleIds(collapsed), ["project", "a", "b", "c"], "expanded Project shows ordered children");
  collapsed.add("b");
  assert.deepEqual(visibleIds(collapsed), ["project", "a", "b", "grandchild", "c"], "expanded child shows its grandchild");
  const hiddenBeforeCollapse = tree.map((node) => node.loreHidden);
  collapsed.delete("project");
  assert.deepEqual(visibleIds(collapsed), ["project"], "collapsing Project hides descendants visually");
  assert.deepEqual(tree.map((node) => node.loreHidden), hiddenBeforeCollapse, "collapse does not change Lore membership");
  collapsed.add("project");
  assert.deepEqual(visibleIds(collapsed), ["project", "a", "b", "grandchild", "c"], "re-expanding restores the tree");
  const removed = setLoreMembership(tree, ["b"], false);
  assert.deepEqual(getLoreNodes(removed).map((node) => node.id), ["project", "a", "c"], "removing from Lore remains independent of collapse");
  assert.deepEqual(getLoreExpandableIds(removed), ["project"], "removed branches are excluded from Expand all");
  const visibleChildren = (items, parentId) => getLoreNodes(items).filter((node) => node.parentId === parentId).length;
  assert.equal(getLoreConnectorTopology(visibleChildren(removed, "project")), "multiple", "the visible projection determines topology");
  const twoChildTree = tree.filter((node) => node.id !== "c");
  assert.equal(getLoreConnectorTopology(visibleChildren(setLoreMembership(twoChildTree, ["b"], false), "project")), "single", "two structural children with one visible use SINGLE");
  assert.equal(getLoreConnectorTopology(visibleChildren(setLoreMembership(tree, ["b", "c"], false), "project")), "single", "three structural children with one visible use SINGLE");
  assert.equal(getLoreConnectorTopology(visibleChildren(setLoreMembership(tree, ["a", "b", "c"], false), "project")), "none", "all hidden children use NONE");
  const order = ["folder", "child", "other"];
  assert.deepEqual(selectLoreRange(order, ["folder"], "folder", "other", true, false), ["folder", "other"]);
  assert.deepEqual(selectLoreRange(order, ["folder"], "folder", "folder", true, false), []);
  assert.deepEqual(selectLoreRange(order, ["other"], "other", "folder", false, true), order);
  assert.deepEqual(selectLoreRange(order, ["other"], "other", "child", false, false), ["child"]);
  console.log("PASS: Lore removal, subtree restoration, individual restoration, data preservation, and multiple selection.");
} finally {
  await server.close();
}
