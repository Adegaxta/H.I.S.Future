import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const model = await server.ssrLoadModule("/src/workspace/tabs/model.ts");
  const { activateTab, addEmptyTab, closePane, closeTab, createPane, createTab, createWorkspaceLayout, findPane, findTab, listPanes, moveTab, reorderTab, restoreWorkspaceLayout, setFocusedTabView } = model;

  const nodeTab = createTab("node", "node-a");
  let layout = createWorkspaceLayout(nodeTab);
  assert.equal(listPanes(layout.root).length, 1, "a workspace always begins with one pane");

  layout = addEmptyTab(layout);
  let pane = findPane(layout.root, layout.focusedPaneId);
  const emptyTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
  assert.equal(emptyTab.viewType, null, "new tabs are empty");
  assert.equal(emptyTab.resourceId, undefined, "new tabs do not preselect a resource");

  layout = setFocusedTabView(layout, "ai");
  assert.equal(findTab(layout, emptyTab.id).tab.viewType, "ai", "AI opens in the current tab");
  layout = activateTab(layout, pane.id, nodeTab.id);
  assert.equal(findTab(layout, nodeTab.id).tab.resourceId, "node-a", "a node can remain open in a separate tab");

  layout = moveTab(layout, emptyTab.id, pane.id, "right");
  assert.equal(listPanes(layout.root).length, 2, "right drop creates a split");
  assert.equal(layout.root.direction, "horizontal");
  const aiPane = findTab(layout, emptyTab.id).pane;
  const nodePane = findTab(layout, nodeTab.id).pane;

  const centerTab = createTab("graph");
  layout = addEmptyTab(layout, nodePane.id, centerTab);
  layout = moveTab(layout, centerTab.id, aiPane.id, "center");
  assert.equal(findTab(layout, centerTab.id).pane.id, aiPane.id, "center drop moves a tab into another pane group");

  let leftLayout = createWorkspaceLayout(createTab("node", "left-base"));
  const leftTab = createTab("ai");
  leftLayout = addEmptyTab(leftLayout, leftLayout.focusedPaneId, leftTab);
  leftLayout = moveTab(leftLayout, leftTab.id, leftLayout.focusedPaneId, "left");
  assert.equal(leftLayout.root.direction, "horizontal", "left drop creates a horizontal split");
  assert.equal(leftLayout.root.children[0].kind, "pane");
  assert.equal(leftLayout.root.children[0].tabs[0].id, leftTab.id, "left drop places the moved tab first");

  const secondNode = createTab("node", "node-b");
  layout = addEmptyTab(layout, aiPane.id, secondNode);
  layout = moveTab(layout, secondNode.id, aiPane.id, "bottom");
  assert.equal(listPanes(layout.root).length, 3, "a pane child can be split recursively");
  assert.equal(findTab(layout, secondNode.id).pane.id, layout.focusedPaneId, "bottom drop places the moved tab in the lower child");
  assert.equal(findTab(layout, secondNode.id).pane.tabs.length, 1);

  const beforeTopSplit = listPanes(layout.root).length;
  layout = moveTab(layout, nodeTab.id, nodePane.id, "top");
  assert.equal(listPanes(layout.root).length, beforeTopSplit + 1, "top drop creates a vertical split");
  assert.equal(findTab(layout, nodeTab.id).pane.tabs.length, 1);

  const lastPane = findTab(layout, nodeTab.id).pane;
  assert.equal(lastPane.id, listPanes(layout.root)[0].id, "the top split becomes the structural primary pane");
  layout = closeTab(layout, lastPane.id, nodeTab.id);
  assert.equal(findPane(layout.root, lastPane.id).tabs.length, 0, "closing the last primary tab preserves its empty pane");
  assert.equal(listPanes(layout.root).length, 4, "the structural primary pane remains reusable");

  const assertBinaryTree = (node) => {
    if (node.kind === "pane") return;
    assert.equal(node.children.length, 2, "every split retains exactly two children");
    assert.ok(node.children[0] && node.children[1], "a split never retains an empty child");
    assertBinaryTree(node.children[0]);
    assertBinaryTree(node.children[1]);
  };
  const closedNestedPaneId = findTab(layout, secondNode.id).pane.id;
  layout = closeTab(layout, closedNestedPaneId, secondNode.id);
  assert.equal(findPane(layout.root, closedNestedPaneId), null, "closing the last tab removes its secondary pane");
  assert.equal(listPanes(layout.root).length, 3, "an empty nested pane collapses its parent split");
  const explicitlyClosedPaneId = findTab(layout, centerTab.id).pane.id;
  layout = closePane(layout, explicitlyClosedPaneId);
  assert.equal(findPane(layout.root, explicitlyClosedPaneId), null, "explicit pane closing still removes a populated pane");
  assert.equal(listPanes(layout.root).length, 2, "explicit pane closing retains a valid binary tree");
  assertBinaryTree(layout.root);

  let primaryTabLayout = createWorkspaceLayout(createTab("node", "primary-only"));
  const primaryTabPaneId = primaryTabLayout.focusedPaneId;
  const primaryTabId = findPane(primaryTabLayout.root, primaryTabPaneId).activeTabId;
  primaryTabLayout = closeTab(primaryTabLayout, primaryTabPaneId, primaryTabId);
  assert.equal(listPanes(primaryTabLayout.root).length, 1, "closing the last primary tab preserves the root pane");
  assert.equal(findPane(primaryTabLayout.root, primaryTabPaneId).tabs.length, 0, "the root pane can remain empty and reusable");

  let lastPaneLayout = createWorkspaceLayout(createTab("graph"));
  const onlyPaneId = lastPaneLayout.focusedPaneId;
  lastPaneLayout = closePane(lastPaneLayout, onlyPaneId);
  assert.equal(listPanes(lastPaneLayout.root).length, 1, "the final pane cannot be removed");
  assert.equal(findPane(lastPaneLayout.root, onlyPaneId).tabs.length, 0, "closing the final pane leaves a reusable empty pane");

  let manyPanes = createWorkspaceLayout(createTab("node", "pane-1"));
  for (let index = 2; index <= 8; index += 1) {
    const tab = createTab(index % 2 === 0 ? "graph" : "ai");
    const sourcePaneId = manyPanes.focusedPaneId;
    manyPanes = addEmptyTab(manyPanes, sourcePaneId, tab);
    manyPanes = moveTab(manyPanes, tab.id, sourcePaneId, index % 3 === 0 ? "bottom" : "right");
  }
  assert.equal(listPanes(manyPanes.root).length, 8, "eight panes can be created while preserving a binary layout tree");
  assertBinaryTree(manyPanes.root);
  for (const pane of listPanes(manyPanes.root).slice(1)) manyPanes = closePane(manyPanes, pane.id);
  assert.equal(listPanes(manyPanes.root).length, 1, "repeated recursive closes collapse an eight-pane tree to one pane");
  assertBinaryTree(manyPanes.root);

  const serialized = JSON.stringify(layout);
  const restored = restoreWorkspaceLayout(serialized, createWorkspaceLayout());
  assert.deepEqual(restored, layout, "layout, active tabs, resources and ratios restore together");

  const missing = createWorkspaceLayout(createTab("node", "deleted-resource"));
  assert.equal(restoreWorkspaceLayout(JSON.stringify(missing), createWorkspaceLayout()).root.tabs[0].resourceId, "deleted-resource", "deleted resources remain a safe restorable reference");

  const vaultA = JSON.stringify(createWorkspaceLayout(createTab("ai")));
  const vaultB = JSON.stringify(createWorkspaceLayout(createTab("graph")));
  assert.equal(restoreWorkspaceLayout(vaultA, createWorkspaceLayout()).root.tabs[0].viewType, "ai");
  assert.equal(restoreWorkspaceLayout(vaultB, createWorkspaceLayout()).root.tabs[0].viewType, "graph", "vault layouts restore independently");

  const reorderTabs = [createTab("node", "a"), { ...createTab("graph"), state: { camera: { x: 12, y: -7, zoom: 1.25 } } }, createTab(), createTab("ai")];
  let reorderLayout = createWorkspaceLayout(reorderTabs[0]);
  for (const tab of reorderTabs.slice(1)) reorderLayout = addEmptyTab(reorderLayout, reorderLayout.focusedPaneId, tab);
  const reorderPaneId = reorderLayout.focusedPaneId;
  reorderLayout = activateTab(reorderLayout, reorderPaneId, reorderTabs[3].id);
  reorderLayout = reorderTab(reorderLayout, reorderPaneId, reorderTabs[3].id, 1);
  assert.deepEqual(findPane(reorderLayout.root, reorderPaneId).tabs.map((tab) => tab.id), [reorderTabs[0].id, reorderTabs[3].id, reorderTabs[1].id, reorderTabs[2].id], "tabs reorder to any insertion index, including empty tabs");
  assert.equal(findPane(reorderLayout.root, reorderPaneId).activeTabId, reorderTabs[3].id, "reorder preserves the active tab");
  assert.equal(reorderLayout.focusedPaneId, reorderPaneId, "reorder preserves pane focus");
  assert.deepEqual(findTab(reorderLayout, reorderTabs[1].id).tab.state, reorderTabs[1].state, "reorder preserves per-tab view state");
  const restoredReorder = restoreWorkspaceLayout(JSON.stringify(reorderLayout), createWorkspaceLayout());
  assert.deepEqual(findPane(restoredReorder.root, reorderPaneId).tabs.map((tab) => tab.id), findPane(reorderLayout.root, reorderPaneId).tabs.map((tab) => tab.id), "persisted layout restores the explicit tab order");
  assert.deepEqual(findTab(restoredReorder, reorderTabs[1].id).tab.state, reorderTabs[1].state, "restore preserves per-tab view state");

  const appSource = await readFile(new URL("../src/components/AppWorkspace.tsx", import.meta.url), "utf8");
  const appCss = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  const tabsCss = await readFile(new URL("../src/workspace/tabs/styles.css", import.meta.url), "utf8");
  const navigationCss = await readFile(new URL("../src/workspace/navigation/styles.css", import.meta.url), "utf8");
  const aiCss = await readFile(new URL("../src/ai/styles.css", import.meta.url), "utf8");
  const graphViewSource = await readFile(new URL("../src/graph/view.tsx", import.meta.url), "utf8");
  const graphCss = await readFile(new URL("../src/graph/styles.css", import.meta.url), "utf8");
  const graphRendererSource = await readFile(new URL("../src/graph/PixiGraphRenderer.ts", import.meta.url), "utf8");
  assert.match(appSource, /focusedWorkspaceTab\?\.viewType === "node"/, "primary navigation derives active state from one focused tab");
  assert.doesNotMatch(appSource, /sidebarPanel === id && view !== "graph"/, "AI no longer leaves LORE visually active");
  const surfaceSource = await readFile(new URL("../src/workspace/tabs/WorkspaceSurface.tsx", import.meta.url), "utf8");
  const registrySource = await readFile(new URL("../src/workspace/tabs/ViewRegistry.tsx", import.meta.url), "utf8");
  const historySource = await readFile(new URL("../src/workspace/navigation/WorkspaceHistoryControls.tsx", import.meta.url), "utf8");
  const pageChromeSource = await readFile(new URL("../src/nodes/page/chrome.tsx", import.meta.url), "utf8");
  const pageCss = await readFile(new URL("../src/nodes/page/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /WorkspaceTabs/, "the global titlebar no longer owns workspace tabs or their plus button");
  assert.doesNotMatch(appSource, /<PaneTabBar/, "the application titlebar is independent from pane tab geometry");
  assert.match(appSource, /workspace-header__left" data-tauri-drag-region/, "the titlebar retains a dedicated native drag region");
  assert.match(appSource, /const VIEW_RAIL_WIDTH = 52;/, "the global rail uses a narrow fixed width");
  assert.doesNotMatch(appSource, /&& <span>\{t\((?:labelKey|"graph\.title"|"ai\.title")\)\}<\/span>/, "active rail items do not reserve width for persistent labels");
  assert.match(appSource, /data-label=\{t\(labelKey\)\}/, "rail labels are available contextually without occupying layout width");
  assert.match(surfaceSource, /function PaneTabBar/, "PaneTabBar is implemented as a pane-owned control");
  assert.match(surfaceSource, /<PaneTabBar pane=\{pane\} registry=\{registry\} onChange=\{onChange\} \/>/, "every pane renders its own local tabbar at pane top");
  assert.doesNotMatch(surfaceSource, /isPrimaryPane|listPanes\(layout\.root\)/, "pane geometry has no root-only tabbar special case");
  assert.match(surfaceSource, /onClick=\{\(\) => onChange\(\(current\) => addEmptyTab\(current, pane\.id\)\)\}/, "each pane plus creates a tab in that pane");
  assert.match(surfaceSource, /workspace-pane-tabbar__tabs[\s\S]*workspace-tabs__add[\s\S]*workspace-pane-tabbar__spacer/, "the plus sits immediately after the tabs and before flexible space");
  assert.doesNotMatch(surfaceSource, /workspace-pane-tabbar__close|closePane\(current, pane\.id\)/, "there is no fixed pane-close control beside the plus");
  assert.match(surfaceSource, /className=\{`workspace-tab[\s\S]*workspace-tab__close/, "each tab owns its close control");
  assert.match(registrySource, /renderIcon\?: \(tab: WorkspaceTab\) => ReactNode/, "views can provide a resource-aware tab icon");
  assert.match(appSource, /renderIcon: \(tab\)[\s\S]*<NodeIcon type=\{getEffectiveNodeType/, "node tabs resolve their actual node-type icon");
  assert.doesNotMatch(`${appSource}\n${surfaceSource}`, /data-tauri-drag-region="false"/, "interactive controls never misuse presence-only Tauri drag attributes");
  assert.match(surfaceSource, /reorderTab\(current, pane\.id, tabId, targetIndex\)/, "same-pane tabbar drops reorder without splitting");
  assert.match(surfaceSource, /moveTab\(current, tabId, pane\.id, "center", insertion\.index\)/, "another pane tabbar accepts a tab at an explicit index");
  assert.match(surfaceSource, /workspace-tab-reorder-indicator/, "tabbar reorder uses a compact insertion indicator");
  assert.match(surfaceSource, /event\.key\.toLowerCase\(\) === "t"[\s\S]*addEmptyTab\(current\)/, "Ctrl+T creates a tab in focusedPane");
  assert.match(surfaceSource, /event\.key\.toLowerCase\(\) === "w"[\s\S]*closeTab\(current, pane\.id, pane\.activeTabId!\)/, "Ctrl+W closes the active tab without closing its pane");
  assert.match(surfaceSource, /target\?\.isContentEditable/, "workspace shortcuts ignore editor inputs");
  assert.match(surfaceSource, /workspace-drop-preview--\$\{zone\}/, "all geometric drag targets expose a preview");
  assert.match(surfaceSource, /workspace-tabs__add/, "root and child PaneTabBars render their own plus button");
  assert.match(appSource, /Lucide\.dev\/icons\/minus\.svg/, "minimize uses the requested Lucide minus asset");
  assert.match(appSource, /Lucide\.dev\/icons\/layers-2\.svg/, "maximize and restore use the requested Lucide layers-2 asset");
  assert.match(appSource, /Lucide\.dev\/icons\/x\.svg/, "application close uses the requested Lucide x asset");
  assert.match(appCss, /--his-titlebar-height:\s*40px/, "titlebar height has a single shared variable");
  assert.match(appCss, /\.workspace-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;/s, "workspace body consumes the remaining viewport height");
  assert.match(appCss, /\.workspace-main\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s, "workspace host propagates full height");
  assert.doesNotMatch(appCss, /\.workspace-header__left,\s*\.workspace-header__version\s*\{\s*display:\s*none/, "the titlebar drag region remains available");
  assert.match(appCss, /\.workspace-header\s*\{[^}]*position:\s*absolute;[^}]*height:\s*30px;/s, "window controls share the compact tab row instead of reserving a second titlebar");
  assert.match(tabsCss, /\.workspace-main--tabs[^}]*\.workspace-pane-tabbar\s*\{\s*padding-right:\s*146px;/s, "the root tab row reserves room for drag and window controls");
  assert.match(tabsCss, /\.workspace-surface\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s, "WorkspaceSurface fills and clips the remaining area");
  assert.match(tabsCss, /\.workspace-pane-tabbar\s*\{[^}]*height:\s*30px;[^}]*flex:\s*0 0 30px;/s, "PaneTabBar has a tighter compact fixed height");
  assert.doesNotMatch(tabsCss, /\.workspace-pane-tabbar\.is-root/, "root and child tabbars use identical pane-local geometry");
  assert.match(tabsCss, /\.workspace-pane\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*flex-direction:\s*column;/s, "pane root fills its split cell and stacks bar over content");
  assert.match(tabsCss, /\.workspace-pane__content\s*\{[^}]*position:\s*relative;[^}]*min-height:\s*0;[^}]*flex:\s*1 1 0;[^}]*overflow:\s*hidden;/s, "pane content consumes all height remaining below PaneTabBar");
  assert.match(tabsCss, /\.workspace-pane__view--node\s*\{\s*overflow-y:\s*auto;/, "Node retains the scroll ownership previously supplied by workspace-main");
  assert.match(tabsCss, /\.workspace-pane__view--node\s*>\s*\.editor-page\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s, "Node pages use the pane height instead of the full viewport height");
  assert.match(tabsCss, /\.workspace-tab\.is-active::after\s*\{[^}]*right:\s*0;[^}]*bottom:\s*-1px;[^}]*left:\s*0;/s, "the active tab line meets the content edge instead of floating inside the tab");
  assert.match(tabsCss, /\.workspace-tab\s*\{[^}]*flex:\s*0 0 clamp\(124px, 14vw, 168px\);/s, "tabs retain a stable close-target width as siblings are removed");
  assert.match(tabsCss, /\.workspace-tab__title\s*\{[^}]*flex:\s*1 1 auto;/s, "tab titles yield space while the close button stays at the right edge");
  assert.match(tabsCss, /\.workspace-tab__close:hover\s*\{[^}]*color:\s*#ffd5d8;[^}]*background:\s*rgb\(190 52 65 \/ 34%\);/s, "tab close hover gives explicit red destructive feedback");
  assert.match(tabsCss, /\.workspace-tab-reorder-indicator\s*\{[^}]*width:\s*2px;/s, "reorder preview is a narrow vertical line rather than a split overlay");
  assert.match(tabsCss, /\.workspace-split > \.workspace-pane\s*\{[^}]*box-shadow:/s, "split children have a visible pane boundary");
  assert.match(tabsCss, /\.workspace-drop-preview--right\s*\{[^}]*calc\(50% \+ 3px\)/s, "right-drop preview reserves a visible split gap");
  assert.doesNotMatch(tabsCss, /\.workspace-pane\.is-focused/, "pane focus does not compete visually with the active tab");
  assert.match(navigationCss, /\.view-rail\s*\{[^}]*width:\s*52px;[^}]*min-width:\s*52px;/s, "the global icon rail stays narrow");
  assert.match(navigationCss, /\.view-rail__item\.is-active::before\s*\{[^}]*width:\s*2px;/s, "the active rail item uses only a thin side accent");
  assert.match(navigationCss, /content:\s*attr\(data-label\)/, "rail labels appear as contextual flyouts");
  assert.doesNotMatch(graphViewSource, /<h1>\{t\("graph\.title"\)\}<\/h1>/, "Graph does not repeat its tab title inside the content area");
  assert.doesNotMatch(graphViewSource, /showIntro|graph-view__intro/, "Graph does not render decorative introductory copy");
  assert.doesNotMatch(graphCss, /\.graph-view h1/, "the removed giant Graph title has no stale visual rule");
  assert.doesNotMatch(graphCss, /\.graph-view__intro/, "the removed Graph intro has no stale visual rule");
  assert.doesNotMatch(historySource, /scheduleHide|setVisible|onPointerEnter/, "workspace history controls remain visible without hover timers");
  assert.match(navigationCss, /\.workspace-history-controls\s*\{[^}]*top:\s*33px;/s, "history arrows sit directly below the integrated pane-local tabbar");
  assert.doesNotMatch(pageChromeSource, /useAutoHide|visibilityClass|controls\.release/, "page chrome controls no longer auto-hide");
  assert.doesNotMatch(pageCss, /\.page-chrome__zone--(?:node-options|index|graph)[^{]*\.page-chrome__button\s*\{[^}]*opacity:/s, "right-side page controls stay visibly stable");
  assert.match(pageCss, /\.editor-page--pagina,[\s\S]*\.editor-page--proyecto\s*\{\s*padding-top:\s*12px;/, "page and project nodes remove the redundant top gap");
  assert.doesNotMatch(aiCss, /\.ai-workspace\s*\{[^}]*padding-top:/s, "AI no longer reserves a second titlebar row");
  assert.match(appSource, /type: "graph",[\s\S]*contextHeader: true/, "Graph opts into the compact contextual view header");
  assert.match(tabsCss, /\.workspace-view-header\s*\{[^}]*height:\s*34px;[^}]*justify-content:\s*center;/s, "context headers are compact and centered");
  assert.match(graphRendererSource, /new ResizeObserver\(\(\) => this\.resize\(\)\)/, "Graph observes pane size changes after tabs and splits");

  console.log("PASS: workspace tabs, recursive splits, restore, per-vault state, focus and active navigation invariants.");
} finally {
  await server.close();
}
