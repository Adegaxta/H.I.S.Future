import type { GraphEdge, GraphProjection, GraphVertex } from "./projection";

export const GRAPH_CANVAS_WIDTH = 5000;
export const GRAPH_CANVAS_HEIGHT = 3200;
export const GRAPH_MIN_ZOOM = 0.25;
export const GRAPH_MAX_ZOOM = 1.6;

export interface GraphPosition { x: number; y: number }
export interface GraphPoint extends GraphVertex, GraphPosition {}
export interface GraphRenderEdge {
  id: string;
  edge: GraphEdge;
  from: GraphPoint;
  to: GraphPoint;
}
export interface GraphRuntimeModel {
  points: GraphPoint[];
  pointsById: Map<string, GraphPoint>;
  edges: GraphRenderEdge[];
  edgesByPointId: Map<string, GraphRenderEdge[]>;
}

export function layoutGraphVertices(vertices: readonly GraphVertex[]): GraphPoint[] {
  const points: GraphPoint[] = [];
  const nodes = vertices.filter((vertex) => vertex.kind === "node");
  const typeHubs = vertices.filter((vertex) => vertex.kind === "type-hub");
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const gapX = 360;
  const gapY = 220;
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const startX = (GRAPH_CANVAS_WIDTH - (columns - 1) * gapX) / 2;
  const startY = (GRAPH_CANVAS_HEIGHT - (rows - 1) * gapY) / 2;
  const centerY = GRAPH_CANVAS_HEIGHT / 2;
  typeHubs.forEach((typeHub, index) => points.push({
    ...typeHub,
    x: startX - 420,
    y: centerY + (index - (typeHubs.length - 1) / 2) * 220,
  }));
  nodes.forEach((node, index) => points.push({
    ...node,
    x: startX + (index % columns) * gapX,
    y: startY + Math.floor(index / columns) * gapY,
  }));
  return points;
}

export function reduceGraphEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (edge.targetMissing) return false;
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildGraphRuntime(
  projection: GraphProjection,
  positionCache: Map<string, GraphPosition>,
): GraphRuntimeModel {
  const defaults = layoutGraphVertices(projection.vertices);
  const liveIds = new Set(defaults.map((point) => point.id));
  for (const id of positionCache.keys()) if (!liveIds.has(id)) positionCache.delete(id);
  const points = defaults.map((point) => {
    const position = positionCache.get(point.id) ?? { x: point.x, y: point.y };
    positionCache.set(point.id, position);
    return { ...point, ...position };
  });
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const edgesByPointId = new Map<string, GraphRenderEdge[]>();
  const edges = reduceGraphEdges(projection.edges).flatMap((edge) => {
    const from = pointsById.get(edge.from);
    const to = pointsById.get(edge.to);
    if (!from || !to) return [];
    const rendered = { id: `${edge.from}\u0000${edge.to}`, edge, from, to };
    for (const id of [edge.from, edge.to]) {
      const connected = edgesByPointId.get(id);
      if (connected) connected.push(rendered);
      else edgesByPointId.set(id, [rendered]);
    }
    return [rendered];
  });
  return { points, pointsById, edges, edgesByPointId };
}

export function clampGraphPosition(position: GraphPosition): GraphPosition {
  return {
    x: Math.max(45, Math.min(GRAPH_CANVAS_WIDTH - 45, position.x)),
    y: Math.max(45, Math.min(GRAPH_CANVAS_HEIGHT - 45, position.y)),
  };
}
