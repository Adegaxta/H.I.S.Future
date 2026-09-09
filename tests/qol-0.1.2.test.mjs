import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { getUniqueNodeName } = await server.ssrLoadModule("/src/utils/nodeNames.ts");
  const { parseCollapsedNodeTypes, serializeCollapsedNodeTypes } = await server.ssrLoadModule("/src/utils/nodeTypePanelState.ts");
  const { createEmptyEditorPickerSession, getEditorPickerTrigger, isSameMentionTriggerRange } = await server.ssrLoadModule("/src/editor/pickerSession.ts");
  const { reorderMultipleNodes } = await server.ssrLoadModule("/src/utils/nodeTree.ts");
  const { SLASH_REGISTRY } = await server.ssrLoadModule("/src/editor/commands.ts");
  const { APP_WINDOW_TITLE } = await server.ssrLoadModule("/src/utils/appEnvironment.ts");

  const named = ["Página", "Página 3", "pÁGINA 4"].map((name) => ({ name }));
  assert.equal(getUniqueNodeName("Página", []), "Página");
  assert.equal(getUniqueNodeName("Página", named), "Página 2", "uses the first free numbered name");
  assert.equal(getUniqueNodeName("Página", [...named, { name: "Página 2" }]), "Página 5");

  const collapsed = parseCollapsedNodeTypes('{"pagina":true,"imagen":false,"unknown":true}');
  assert.deepEqual(collapsed, { pagina: true }, "only collapsed known types survive hydration");
  assert.deepEqual(parseCollapsedNodeTypes("invalid"), {});
  assert.equal(serializeCollapsedNodeTypes({ pagina: true, imagen: false, unknown: true }), '{"pagina":true}');

  assert.deepEqual(getEditorPickerTrigger("@"), { type: "mention", query: "" });
  assert.equal(getEditorPickerTrigger(""), null, "deleting @ fully ends the mention session");
  assert.deepEqual(getEditorPickerTrigger("@Página"), { type: "mention", query: "Página" }, "a new @ starts cleanly");
  assert.equal(getEditorPickerTrigger("texto @uno otro"), null);
  const firstMentionText = {};
  const oldImageSession = { container: firstMentionText, triggerOffset: 0 };
  assert.equal(isSameMentionTriggerRange(oldImageSession, firstMentionText, 0), true);
  assert.equal(
    isSameMentionTriggerRange(oldImageSession, {}, 0),
    false,
    "a new @ in another range invalidates the abandoned image mention session",
  );
  assert.equal(
    isSameMentionTriggerRange(oldImageSession, firstMentionText, 8),
    false,
    "a new @ in the same text node still starts a clean session",
  );
  const clearedAfterImplicitCancel = createEmptyEditorPickerSession();
  assert.deepEqual(clearedAfterImplicitCancel, {
    slashPicker: null,
    callPicker: null,
    slashPickerIndex: 0,
    callPickerIndex: 0,
    imageMentionChoice: null,
    pickerPosition: null,
    mentionTriggerRange: null,
  }, "implicit image mention cancellation clears every transient field before the next @");

  const nodes = [
    { id: "parent", name: "Parent", type: "categoria", parentId: null, order: 0, content: "" },
    { id: "child", name: "Child", type: "pagina", parentId: "parent", order: 0, content: "" },
    { id: "root", name: "Root", type: "pagina", parentId: null, order: 1, content: "" },
  ];
  const invalidDrop = reorderMultipleNodes(nodes, ["child"], "missing-target", "inside");
  assert.equal(invalidDrop, nodes, "an invalid drop target does not reorder or reparent the node");
  assert.equal(invalidDrop[1].parentId, "parent");
  assert.equal(invalidDrop[1].order, 0);

  assert.equal(SLASH_REGISTRY.get("UL")?.labelKey, "editor.commands.bullets");
  assert.equal(APP_WINDOW_TITLE, "H.I.S. Future Dev", "Vite development mode exposes the official dev window title");

  console.log("PASS: 0.1.2 QoL naming, type UI state, picker reset, invalid drop, bullet command and dev title.");
} finally {
  await server.close();
}
