import type { GraphPoint, GraphRuntimeModel } from "./runtime";

export type GraphLod = "detail" | "medium" | "far" | "distant";
export type GraphNodeVisual = "thumbnail" | "image" | "icon" | "circle" | "point";

export interface GraphVisualPreferences {
  showIcons: boolean;
  showImages: boolean;
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
    return lod === "detail" && point.imageSrc ? "thumbnail" : "circle";
  }
  if (point.kind === "node" && point.imageSrc && preferences.showImages) {
    return lod === "detail" ? "thumbnail" : "circle";
  }
  if (lod === "distant") return "point";
  if (lod === "far") return "circle";
  if ((point.kind === "type-hub" || preferences.showIcons) && point.nodeType) return "icon";
  return "circle";
}

export function graphLabelVisible(lod: GraphLod, emphasized: boolean): boolean {
  return lod === "detail" || lod === "medium" || (lod === "far" && emphasized);
}

export function graphNodeRadius(point: GraphPoint, lod: GraphLod, emphasized: boolean): number {
  if (lod === "distant") return emphasized ? 5 : 3.5;
  if (lod === "far") return emphasized ? 10 : 8;
  const base = point.kind === "type-hub" ? 17 : 12;
  return emphasized ? base + 2.5 : base;
}
