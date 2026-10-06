import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
  const { imagePresentationGeometry: geometry, parseImagePresentation } = await server.ssrLoadModule("/src/utils/imagePresentation.ts");
  const { getPageMeta, setPageMeta, DEFAULT_PAGE_META } = await server.ssrLoadModule("/src/utils/pageMeta.ts");
  const { parseNodeVisual } = await server.ssrLoadModule("/src/nodes/visuals/types.ts");
  for (const [iw, ih] of [[1920, 1080], [1080, 1920], [50, 50], [8000, 20]]) {
    for (const [fw, fh] of [[100, 100], [1200, 220], [300, 220]]) {
      for (const zoom of [1, 1.4, 5]) for (const centerX of [0, .5, 1]) for (const centerY of [0, .5, 1]) {
        const g = geometry(iw, ih, fw, fh, { centerX, centerY, zoom });
        assert.ok(g.left <= 1e-9 && g.top <= 1e-9 && g.left + g.width >= fw - 1e-9 && g.top + g.height >= fh - 1e-9, "every allowed framing covers its output");
        const resized = geometry(iw * 2, ih * 2, fw * 3, fh * 3, g.presentation);
        assert.ok(Math.abs(resized.left - g.left * 3) < 1e-8 && Math.abs(resized.width - g.width * 3) < 1e-8, "same normalized framing is independent of image and screen resolution");
      }
    }
  }
  assert.equal(parseImagePresentation({ centerX: NaN, centerY: .5, zoom: 1 }), undefined);
  assert.equal(getPageMeta("<p>Legacy</p>").coverPresentation, undefined);
  const presentation = { centerX: .3, centerY: .6, zoom: 1.4 };
  const original = '<p>Body with original image reference</p>';
  const saved = setPageMeta(original, { ...DEFAULT_PAGE_META, coverNodeId: "original", coverPresentation: presentation, iconNodeId: "original", iconVisual: { kind: "image", nodeId: "original", source: "local", presentation: { ...presentation, centerX: .7 } } });
  assert.ok(saved.endsWith(original));
  const reopened = getPageMeta(saved);
  assert.deepEqual(reopened.coverPresentation, presentation);
  assert.equal(reopened.iconVisual.presentation.centerX, .7, "independent uses of the same original retain independent framing");
  assert.deepEqual(parseNodeVisual({ kind: "emoji", value: "😀", style: "noto", presentation }), { kind: "emoji", value: "😀", style: "noto" });
  console.log("Presentation: coverage, limits, resolution independence, legacy, metadata roundtrip and per-destination isolation passed.");
} finally { await server.close(); }
