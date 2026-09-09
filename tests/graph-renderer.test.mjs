import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const scene = await server.ssrLoadModule("/src/graph/scene.ts");
  const edgeGeometry = await server.ssrLoadModule("/src/graph/edgeGeometry.ts");
  const node = { id: "image", label: "Image", kind: "node", provenance: "nodal-node", color: "#4dd8c0", nodeType: "imagen", imageSrc: "data:image/png;base64,AA==", x: 1, y: 1 };
  const hub = { id: "type-hub-imagen", label: "Image", kind: "type-hub", provenance: "node-registry", color: "#4dd8c0", nodeType: "imagen", typeId: "imagen", x: 1, y: 1 };
  const plain = { ...node, id: "page", nodeType: "pagina", imageSrc: undefined };
  const pageWithImage = { ...node, id: "page-with-image", nodeType: "pagina" };

  assert.equal(scene.graphLodForZoom(0.8), "detail");
  assert.equal(scene.graphLodForZoom(0.5), "medium");
  assert.equal(scene.graphLodForZoom(0.35), "far");
  assert.equal(scene.graphLodForZoom(0.2), "distant");
  assert.equal(scene.graphLodForZoom(0.60, "detail"), "detail", "detail LOD has hysteresis when zooming out");
  assert.equal(scene.graphLodForZoom(0.64, "medium"), "medium", "medium LOD has hysteresis when zooming in");

  assert.equal(scene.graphNodeVisual(node, "detail", { showImages: true, showIcons: false }), "thumbnail");
  assert.equal(scene.graphNodeVisual(node, "medium", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(node, "far", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(node, "distant", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(pageWithImage, "detail", { showImages: true, showIcons: true }), "thumbnail");
  assert.equal(scene.graphNodeVisual(pageWithImage, "medium", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(pageWithImage, "distant", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(node, "detail", { showImages: false, showIcons: true }), "icon", "image and icon preferences remain independent");
  assert.equal(scene.graphNodeVisual(plain, "medium", { showImages: true, showIcons: true }), "icon");
  assert.equal(scene.graphNodeVisual(plain, "far", { showImages: true, showIcons: true }), "circle");
  assert.equal(scene.graphNodeVisual(plain, "distant", { showImages: true, showIcons: true }), "point");
  assert.equal(scene.graphNodeVisual(hub, "detail", { showImages: false, showIcons: false }), "icon", "real Type Hubs keep their official identity at useful LOD");
  assert.equal(scene.graphNodeVisual(hub, "far", { showImages: false, showIcons: false }), "circle");
  assert.equal(scene.graphLabelVisible("medium", false), true);
  assert.equal(scene.graphLabelVisible("far", false), false);
  assert.equal(scene.graphLabelVisible("far", true), true);
  assert.equal(scene.graphLabelVisible("distant", true), false);

  const endpoints = () => ({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const circle = (radius) => ({ kind: "circle", radius, halfWidth: radius, halfHeight: radius });
  const rectangle = (halfWidth, halfHeight) => ({ kind: "rectangle", radius: 0, halfWidth, halfHeight });
  const distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const assertFiniteEndpoints = (result) => {
    assert.ok(result, "separated visual nodes produce a visible segment");
    for (const value of Object.values(result)) assert.ok(Number.isFinite(value), "edge endpoints remain finite");
  };
  const rectangleBoundary = (halfWidth, halfHeight, centerX, centerY, pointX, pointY) => {
    const directionX = pointX - centerX;
    const directionY = pointY - centerY;
    const directionLength = Math.hypot(directionX, directionY);
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    return 1 / Math.max(Math.abs(unitX) / halfWidth, Math.abs(unitY) / halfHeight);
  };
  const assertBoundaryDistance = (result, from, to, fromBoundary, toBoundary) => {
    assert.ok(distance(from.x, from.y, result.startX, result.startY) + 1e-6 >= fromBoundary);
    assert.ok(distance(to.x, to.y, result.endX, result.endY) + 1e-6 >= toBoundary);
  };

  const circleToCircle = endpoints();
  assertFiniteEndpoints(edgeGeometry.resolveVisualEdgeEndpoints(0, 0, 100, 0, circle(10), circle(20), 1, circleToCircle) && circleToCircle);
  assertBoundaryDistance(circleToCircle, { x: 0, y: 0 }, { x: 100, y: 0 }, 11, 21);

  const circleToRectangle = endpoints();
  assertFiniteEndpoints(edgeGeometry.resolveVisualEdgeEndpoints(0, 0, 100, 20, circle(10), rectangle(20, 8), 1, circleToRectangle) && circleToRectangle);
  assertBoundaryDistance(
    circleToRectangle,
    { x: 0, y: 0 },
    { x: 100, y: 20 },
    11,
    rectangleBoundary(21, 9, 100, 20, circleToRectangle.endX, circleToRectangle.endY),
  );

  const rectangleToCircle = endpoints();
  assertFiniteEndpoints(edgeGeometry.resolveVisualEdgeEndpoints(-50, -20, 80, 30, rectangle(12, 7), circle(9), 1, rectangleToCircle) && rectangleToCircle);
  assertBoundaryDistance(
    rectangleToCircle,
    { x: -50, y: -20 },
    { x: 80, y: 30 },
    rectangleBoundary(13, 8, -50, -20, rectangleToCircle.startX, rectangleToCircle.startY),
    10,
  );

  const rectangleToRectangle = endpoints();
  assertFiniteEndpoints(edgeGeometry.resolveVisualEdgeEndpoints(0, 0, 80, 60, rectangle(10, 16), rectangle(12, 7), 1, rectangleToRectangle) && rectangleToRectangle);
  assertBoundaryDistance(
    rectangleToRectangle,
    { x: 0, y: 0 },
    { x: 80, y: 60 },
    rectangleBoundary(11, 17, 0, 0, rectangleToRectangle.startX, rectangleToRectangle.startY),
    rectangleBoundary(13, 8, 80, 60, rectangleToRectangle.endX, rectangleToRectangle.endY),
  );

  const typeHub = { kind: "type-hub", nodeType: "pagina" };
  const typeHubRadius = scene.graphNodeRadius(typeHub, "detail", false);
  assert.equal(typeHubRadius, 17, "Type Hubs use their larger visual radius");
  const typeHubEndpoints = endpoints();
  assertFiniteEndpoints(edgeGeometry.resolveVisualEdgeEndpoints(0, 0, 100, 0, circle(typeHubRadius), circle(12), 0, typeHubEndpoints) && typeHubEndpoints);
  assertBoundaryDistance(typeHubEndpoints, { x: 0, y: 0 }, { x: 100, y: 0 }, typeHubRadius, 12);

  const coincident = endpoints();
  assert.equal(edgeGeometry.resolveVisualEdgeEndpoints(10, 10, 10, 10, circle(8), rectangle(10, 10), 1, coincident), false, "coincident centers omit the visual edge");
  const overlapping = endpoints();
  assert.equal(edgeGeometry.resolveVisualEdgeEndpoints(0, 0, 15, 0, circle(10), circle(10), 1, overlapping), false, "overlapping geometry omits an impossible visible segment");

  const rendererSource = fs.readFileSync(new URL("../src/graph/PixiGraphRenderer.ts", import.meta.url), "utf8");
  const viewSource = fs.readFileSync(new URL("../src/graph/view.tsx", import.meta.url), "utf8");
  const iconSource = fs.readFileSync(new URL("../src/graph/iconSource.ts", import.meta.url), "utf8");
  for (const lifecycleGuard of ["autoStart: false", "this.app.stop()", "ResizeObserver", "removeEventListener", "Assets.unload", "this.app.destroy"]) {
    assert.ok(rendererSource.includes(lifecycleGuard), `renderer lifecycle must include ${lifecycleGuard}`);
  }
  assert.ok(rendererSource.includes("preference: \"webgl\""));
  assert.ok(rendererSource.includes("texturePromises"), "textures are cached rather than resolved per frame");
  assert.ok(rendererSource.includes("textureReferences"), "textures are reference-counted while nodes enter and leave the scene");
  assert.ok(rendererSource.includes("releaseDisplayTexture"), "removed nodes release their Pixi texture ownership");
  assert.ok(rendererSource.includes("edgesByPointId"), "node movement updates only incident edges");
  assert.ok(rendererSource.includes("onHoverNode"), "hover state is delegated to the React overlay");
  const applyVisualStart = rendererSource.indexOf("private applyNodeVisual");
  const ensureMediaStart = rendererSource.indexOf("private async ensureMedia");
  const thumbnailMaskStart = rendererSource.indexOf("display.mask.visible = true", ensureMediaStart);
  assert.ok(applyVisualStart >= 0 && rendererSource.indexOf("display.mask.visible = false", applyVisualStart) >= 0, "LOD reconciliation hides the thumbnail mask before rendering non-thumbnail visuals");
  assert.ok(thumbnailMaskStart >= ensureMediaStart && thumbnailMaskStart < rendererSource.indexOf("} else if (currentVisual === \"icon\")", thumbnailMaskStart), "only thumbnail media re-enables the mask Graphics");
  for (const counter of ["sceneUpdates", "localizedPositionUpdates", "viewportUpdates", "lodChanges", "textureLoads", "renders"]) {
    assert.ok(rendererSource.includes(counter), `renderer exposes ${counter} instrumentation`);
  }
  assert.equal(rendererSource.includes("ticker.add"), false, "static Graph has no permanent animation loop");
  assert.ok(viewSource.includes("import(\"./PixiGraphRenderer\")"), "Pixi is lazy-loaded only when Graph mounts");
  assert.equal(iconSource.includes("node_page.svg"), false, "renderer does not create a second icon catalogue");
  assert.equal(iconSource.includes("NODE_REGISTRY"), false, "icon resolution reuses the Node-owned CSS identity");
  console.log("PASS: Pixi renderer LOD, preferences, Type Hubs, textures and lifecycle stay bounded and independent.");
} finally {
  await server.close();
}
