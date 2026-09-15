import type { GraphPoint, GraphRuntimeModel } from "./runtime";

export type GraphLod = "detail" | "medium" | "far" | "distant";
export type GraphNodeVisual = "thumbnail" | "image" | "icon" | "circle" | "point";

export interface GraphVisualPreferences {
  showIcons: boolean;
  showImages: boolean;
  showArrows?: boolean;
  labelThreshold?: number;
  nodeScale?: number;
  linkScale?: number;
  scalePagesByContent?: boolean;
  scaleImagesByDimensions?: boolean;
  scaleNodesWithZoom?: boolean;
}

export interface GraphScene {
  runtime: GraphRuntimeModel;
  preferences: GraphVisualPreferences;
}

export const GRAPH_LOD_THRESHOLDS = {
  detail: 0.62,
  medium: 0.42,
  far: 0.3,
  hysteresis: 0.025,
} as const;

export function buildGraphScene(runtime: GraphRuntimeModel, preferences: GraphVisualPreferences): GraphScene {
  return { runtime, preferences };
}

export function graphLodForZoom(zoom: number, previous?: GraphLod): GraphLod {
  const { detail, medium, far, hysteresis } = GRAPH_LOD_THRESHOLDS;
  if (previous === "detail" && zoom >= detail - hysteresis) return "detail";
  if (previous === "medium" && zoom >= medium - hysteresis && zoom < detail + hysteresis) return "medium";
  if (previous === "far" && zoom >= far - hysteresis && zoom < medium + hysteresis) return "far";
  if (previous === "distant" && zoom < far + hysteresis) return "distant";
  if (zoom >= detail) return "detail";
  if (zoom >= medium) return "medium";
  if (zoom >= far) return "far";
  return "distant";
}

export function graphNodeVisual(
  point: GraphPoint,
  lod: GraphLod,
  preferences: GraphVisualPreferences,
): GraphNodeVisual {
  if (point.kind === "node" && point.nodeType === "imagen" && preferences.showImages) {
    if (!point.imageSrc) return lod === "distant" ? "point" : lod === "far" ? "circle" : preferences.showIcons ? "icon" : "circle";
    return lod === "detail" ? "thumbnail" : lod === "medium" ? "image" : lod === "far" ? "circle" : "point";
  }
  if (point.kind === "node" && point.imageSrc && preferences.showImages) {
    return lod === "detail" ? "thumbnail" : "circle";
  }
  if (lod === "distant") return "point";
  if (lod === "far") return "circle";
  if ((point.kind === "type-hub" || preferences.showIcons) && point.nodeType) return "icon";
  return "circle";
}

export function graphLabelVisible(lod: GraphLod, emphasized: boolean, threshold = 0.45): boolean {
  if (emphasized) return lod !== "distant";
  const visibility = lod === "detail" ? 1 : lod === "medium" ? 0.67 : lod === "far" ? 0.34 : 0;
  return visibility >= threshold;
}

export function graphNodeRadius(point: GraphPoint, lod: GraphLod, emphasized: boolean): number {
  if (lod === "distant") return emphasized ? 5 : 3.5;
  if (lod === "far") return emphasized ? 10 : 8;
  const base = point.kind === "type-hub" ? 17 : point.isPrimaryProject ? 16 : 12;
  return emphasized ? base + 2.5 : base;
}
