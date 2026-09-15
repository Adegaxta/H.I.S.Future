import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const server = await createServer({ root, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true }, appType: "custom" });

try {
  const lucide = await server.ssrLoadModule("/src/nodes/visuals/lucideCatalog.ts");
  const moonResults = lucide.searchLucideIcons("MoOn");
  assert.ok(moonResults.includes("moon"), "Lucide search is case-insensitive");
  assert.ok(moonResults.some((name) => name !== "moon" && name.includes("moon")), "Lucide search includes related catalogue names");
  assert.ok(lucide.searchLucideIcons("interfaz").some((name) => name.includes("layout") || name.includes("panel") || name.includes("window")), "Lucide search expands Spanish semantic concepts over official tags");

  const material = await server.ssrLoadModule("/src/nodes/visuals/materialSymbolCatalog.ts");
  const settingsResults = material.searchMaterialSymbols("SeTtInGs");
  assert.ok(settingsResults.includes("settings"), "Material Symbols search is case-insensitive");
  assert.ok(material.searchMaterialSymbols("calendar").some((name) => name.includes("calendar")), "Material Symbols search uses the generated local catalogue");
  assert.ok(material.searchMaterialSymbols("interfaz").some((name) => name.includes("view") || name.includes("window") || name.includes("screen")), "Material Symbols search expands Spanish semantic concepts over Google metadata");

  const emoji = await server.ssrLoadModule("/src/nodes/visuals/emojiCatalog.ts");
  const englishCatalog = emoji.getEmojiCatalog("en");
  const emojiResults = emoji.searchEmojis(englishCatalog, "crescent moon", null);
  assert.ok(emojiResults.some((item) => item.emoji === "🌙"), "Emoji search uses CLDR names and keywords");
  assert.ok(emoji.getEmojiCategories("es").length >= 9, "Emoji categories come from the localized dataset");

  const visualTypes = await server.ssrLoadModule("/src/nodes/visuals/types.ts");
  assert.deepEqual(visualTypes.parseNodeVisual({ kind: "emoji", value: "🌙", style: "noto" }), { kind: "emoji", value: "🌙", style: "noto" });
  assert.deepEqual(visualTypes.parseNodeVisual({ kind: "emoji", value: "🌙", style: "twemoji" }), { kind: "emoji", value: "🌙", style: "twemoji" });
  assert.deepEqual(visualTypes.parseNodeVisual({ kind: "icon", provider: "lucide", name: "moon" }), { kind: "icon", provider: "lucide", name: "moon" });
  assert.deepEqual(visualTypes.parseNodeVisual({ kind: "icon", provider: "material-symbols", name: "settings" }), { kind: "icon", provider: "material-symbols", name: "settings" });
  assert.equal(visualTypes.parseNodeVisual({ kind: "icon", provider: "other", name: "moon" }), null);

  const pageMeta = await server.ssrLoadModule("/src/utils/pageMeta.ts");
  const legacy = pageMeta.getPageMeta('<!--hisfuture-page-meta:{"description":"old","iconNodeId":"image-1","coverNodeId":null}--><p>Body</p>');
  assert.deepEqual(legacy.iconVisual, { kind: "image", nodeId: "image-1", source: "local" }, "legacy iconNodeId is exposed through the new visual contract");
  const serialized = pageMeta.setPageMeta("<p>Body</p>", { ...pageMeta.DEFAULT_PAGE_META, iconVisual: { kind: "emoji", value: "🌙", style: "twemoji" } });
  assert.deepEqual(pageMeta.getPageMeta(serialized).iconVisual, { kind: "emoji", value: "🌙", style: "twemoji" }, "new visuals survive metadata serialization");
  const materialSerialized = pageMeta.setPageMeta("<p>Body</p>", { ...pageMeta.DEFAULT_PAGE_META, iconVisual: { kind: "icon", provider: "material-symbols", name: "home" } });
  assert.deepEqual(pageMeta.getPageMeta(materialSerialized).iconVisual, { kind: "icon", provider: "material-symbols", name: "home" }, "Material Symbols preserve provider and name through metadata serialization");

  const rendererSource = fs.readFileSync(path.join(root, "src/nodes/visuals/NodeVisualRenderer.tsx"), "utf8");
  assert.ok(rendererSource.includes('visual.kind === "image"') && rendererSource.includes('visual.kind === "emoji"') && rendererSource.includes("DynamicLucideIcon") && rendererSource.includes('visual.provider === "material-symbols"'), "the common renderer owns image, emoji, Lucide, and Material Symbols rendering");
  const iconPickerSource = fs.readFileSync(path.join(root, "src/nodes/visuals/IconPicker.tsx"), "utf8");
  assert.ok(iconPickerSource.includes('onSelect("lucide", name)') && iconPickerSource.includes('onSelect("material-symbols", name)'), "icon selection preserves provider and name");
  assert.ok(iconPickerSource.includes("query={query}") && iconPickerSource.includes("onQueryChange={setQuery}"), "the icon query remains shared when switching providers");
  const pageStyles = fs.readFileSync(path.join(root, "src/nodes/page/styles.css"), "utf8");
  assert.match(pageStyles, /\.node-type-icon\.node-visual--lucide\s*\{[^}]*color:\s*#e8e9ea\s*!important/si, "selected Lucide icons keep a neutral color instead of the Node color");
  assert.match(pageStyles, /\.node-type-icon\.node-visual--material-symbols\s*\{[^}]*color:\s*#e8e9ea\s*!important/si, "selected Material Symbols keep a neutral color instead of the Node color");
  const pickerSource = fs.readFileSync(path.join(root, "src/nodes/visuals/EmojiPicker.tsx"), "utf8");
  assert.ok(pickerSource.includes('setStyle("noto")') && pickerSource.includes('setStyle("twemoji")'), "both emoji styles are selectable");
  const headerSource = fs.readFileSync(path.join(root, "src/nodes/page/header.tsx"), "utf8");
  assert.ok(headerSource.indexOf("page-image-picker__upload-card") < headerSource.indexOf("imageNodes.map"), "upload is the first local-library card");
  assert.ok(headerSource.includes('fileImportAccept(["imagen"])') && headerSource.includes("onImageFileUpload(file)"), "local upload reuses the registered project image importer and its accepted formats");

  console.log("Node visual tests passed");
} finally {
  await server.close();
}
