import type { GraphEdge, GraphProjection, GraphVertex } from "./projection";

export const GRAPH_CANVAS_WIDTH = 5000;
export const GRAPH_CANVAS_HEIGHT = 3200;
export const GRAPH_MIN_ZOOM = 0.18;
export const GRAPH_MAX_ZOOM = 1.6;

export interface GraphPosition { x: number; y: number }
export interface GraphPoint extends GraphVertex, GraphPosition {}
export interface GraphRenderEdge {
  id: string;
  edge: GraphEdge;
  facts: GraphEdge[];
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
  const typeHubGapY = 360;
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const nodeAreaStart = typeHubs.length > 0 ? 900 : 0;
  const nodeAreaWidth = GRAPH_CANVAS_WIDTH - nodeAreaStart;
  const startX = nodeAreaStart + (nodeAreaWidth - (columns - 1) * gapX) / 2;
  const startY = (GRAPH_CANVAS_HEIGHT - (rows - 1) * gapY) / 2;
  const centerY = GRAPH_CANVAS_HEIGHT / 2;
  typeHubs.forEach((typeHub, index) => points.push({
    ...typeHub,
    x: 360,
    y: centerY + (index - (typeHubs.length - 1) / 2) * typeHubGapY,
  }));
  nodes.forEach((node, index) => points.push({
    ...node,
    x: startX + (index % columns) * gapX,
    y: startY + Math.floor(index / columns) * gapY,
  }));
  return points;
}

export function buildGraphRuntime(
  projection: GraphProjection,
  positionCache: Map<string, GraphPosition>,
): GraphRuntimeModel {
  const defaults = layoutGraphVertices(projection.vertices);
  const liveIds = new Set(defaults.map((point) => point.id));
  for (const id of positionCache.keys()) if (!liveIds.has(id)) positionCache.delete(id);
  const defaultById = new Map(defaults.map((point) => [point.id, point]));
  const neighborsById = new Map<string, string[]>();
  for (const edge of projection.edges) {
    if (edge.targetMissing) continue;
    neighborsById.set(edge.from, [...(neighborsById.get(edge.from) ?? []), edge.to]);
    neighborsById.set(edge.to, [...(neighborsById.get(edge.to) ?? []), edge.from]);
  }
  const points = defaults.map((point) => {
    const cached = positionCache.get(point.id);
    if (cached) return { ...point, ...cached };
    const neighbors = (neighborsById.get(point.id) ?? [])
      .map((id) => positionCache.get(id) ?? defaultById.get(id))
      .filter((neighbor): neighbor is GraphPosition => Boolean(neighbor));
    const base = neighbors.length > 0
      ? neighbors.reduce((center, neighbor) => ({ x: center.x + neighbor.x / neighbors.length, y: center.y + neighbor.y / neighbors.length }), { x: 0, y: 0 })
      : { x: point.x, y: point.y };
    const hash = Array.from(point.id).reduce((value, character) => (Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0), 2166136261);
    const angle = (hash / 0x100000000) * Math.PI * 2;
    const offset = neighbors.length > 0 ? 42 : 24;
    const position = { x: base.x + Math.cos(angle) * offset, y: base.y + Math.sin(angle) * offset };
    positionCache.set(point.id, position);
    return { ...point, ...position };
  });
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const edgesByPointId = new Map<string, GraphRenderEdge[]>();
  const edges: GraphRenderEdge[] = [];
  const edgesByEndpoints = new Map<string, GraphRenderEdge>();
  for (const edge of projection.edges) {
    if (edge.targetMissing) continue;
    const from = pointsById.get(edge.from);
    const to = pointsById.get(edge.to);
    if (!from || !to) continue;
    const id = `${edge.from}\u0000${edge.to}`;
    const existing = edgesByEndpoints.get(id);
    if (existing) {
      existing.facts.push(edge);
      continue;
    }
    const rendered = { id, edge, facts: [edge], from, to };
    edgesByEndpoints.set(id, rendered);
    edges.push(rendered);
    for (const id of [edge.from, edge.to]) {
      const connected = edgesByPointId.get(id);
      if (connected) connected.push(rendered);
      else edgesByPointId.set(id, [rendered]);
    }
  }
  return { points, pointsById, edges, edgesByPointId };
}

export function clampGraphPosition(position: GraphPosition): GraphPosition {
  return {
    x: Math.max(45, Math.min(GRAPH_CANVAS_WIDTH - 45, position.x)),
    y: Math.max(45, Math.min(GRAPH_CANVAS_HEIGHT - 45, position.y)),
  };
}
