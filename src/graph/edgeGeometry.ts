import type { GraphNodeVisual } from "./scene";

export const GRAPH_NODE_DIAMETER = 2;
export const GRAPH_THUMBNAIL_DIAMETER = 1.9;

export type GraphEdgeGeometryKind = "circle" | "rectangle";

export interface GraphEdgeGeometry {
  kind: GraphEdgeGeometryKind;
  radius: number;
  halfWidth: number;
  halfHeight: number;
}

export interface GraphEdgeEndpoints {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface GraphArrowhead {
  tipX: number;
  tipY: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

const MIN_DISTANCE = 1e-6;

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : MIN_DISTANCE;
}

function finitePadding(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function rayBoundaryDistance(ux: number, uy: number, halfWidth: number, halfHeight: number): number {
  const horizontal = Math.abs(ux) / finitePositive(halfWidth);
  const vertical = Math.abs(uy) / finitePositive(halfHeight);
  return 1 / Math.max(horizontal, vertical, MIN_DISTANCE);
}

function trimSegment(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  startBoundary: number,
  endBoundary: number,
  endpoints: GraphEdgeEndpoints,
): boolean {
  endpoints.startX = fromX;
  endpoints.startY = fromY;
  endpoints.endX = toX;
  endpoints.endY = toY;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) return false;
  const start = Math.max(0, startBoundary);
  const end = Math.max(0, endBoundary);
  if (!Number.isFinite(start) || !Number.isFinite(end) || distance - start - end <= MIN_DISTANCE) return false;
  const ux = dx / distance;
  const uy = dy / distance;
  endpoints.startX = fromX + ux * start;
  endpoints.startY = fromY + uy * start;
  endpoints.endX = toX - ux * end;
  endpoints.endY = toY - uy * end;
  return Number.isFinite(endpoints.startX)
    && Number.isFinite(endpoints.startY)
    && Number.isFinite(endpoints.endX)
    && Number.isFinite(endpoints.endY);
}

export function trimCircularEdge(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromRadius: number,
  toRadius: number,
  padding: number,
  endpoints: GraphEdgeEndpoints,
): boolean {
  const safePadding = finitePadding(padding);
  return trimSegment(
    fromX,
    fromY,
    toX,
    toY,
    finitePositive(fromRadius) + safePadding,
    finitePositive(toRadius) + safePadding,
    endpoints,
  );
}

export function trimRectangularEdge(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromHalfWidth: number,
  fromHalfHeight: number,
  toHalfWidth: number,
  toHalfHeight: number,
  padding: number,
  endpoints: GraphEdgeEndpoints,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) {
    endpoints.startX = fromX;
    endpoints.startY = fromY;
    endpoints.endX = toX;
    endpoints.endY = toY;
    return false;
  }
  const ux = dx / distance;
  const uy = dy / distance;
  const safePadding = finitePadding(padding);
  const startBoundary = rayBoundaryDistance(ux, uy, finitePositive(fromHalfWidth) + safePadding, finitePositive(fromHalfHeight) + safePadding);
  const endBoundary = rayBoundaryDistance(ux, uy, finitePositive(toHalfWidth) + safePadding, finitePositive(toHalfHeight) + safePadding);
  return trimSegment(fromX, fromY, toX, toY, startBoundary, endBoundary, endpoints);
}

export function resolveVisualEdgeEndpoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromGeometry: GraphEdgeGeometry,
  toGeometry: GraphEdgeGeometry,
  padding: number,
  endpoints: GraphEdgeEndpoints,
): boolean {
  if (fromGeometry.kind === "rectangle" && toGeometry.kind === "rectangle") {
    return trimRectangularEdge(
      fromX,
      fromY,
      toX,
      toY,
      fromGeometry.halfWidth,
      fromGeometry.halfHeight,
      toGeometry.halfWidth,
      toGeometry.halfHeight,
      padding,
      endpoints,
    );
  }
  if (fromGeometry.kind === "rectangle") {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) {
      endpoints.startX = fromX;
      endpoints.startY = fromY;
      endpoints.endX = toX;
      endpoints.endY = toY;
      return false;
    }
    const safePadding = finitePadding(padding);
    const ux = dx / distance;
    const uy = dy / distance;
    return trimSegment(
      fromX,
      fromY,
      toX,
      toY,
      rayBoundaryDistance(ux, uy, finitePositive(fromGeometry.halfWidth) + safePadding, finitePositive(fromGeometry.halfHeight) + safePadding),
      finitePositive(toGeometry.radius) + safePadding,
      endpoints,
    );
  }
  if (toGeometry.kind === "rectangle") {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) {
      endpoints.startX = fromX;
      endpoints.startY = fromY;
      endpoints.endX = toX;
      endpoints.endY = toY;
      return false;
    }
    const safePadding = finitePadding(padding);
    const ux = dx / distance;
    const uy = dy / distance;
    return trimSegment(
      fromX,
      fromY,
      toX,
      toY,
      finitePositive(fromGeometry.radius) + safePadding,
      rayBoundaryDistance(ux, uy, finitePositive(toGeometry.halfWidth) + safePadding, finitePositive(toGeometry.halfHeight) + safePadding),
      endpoints,
    );
  }
  return trimCircularEdge(fromX, fromY, toX, toY, fromGeometry.radius, toGeometry.radius, padding, endpoints);
}

export function resolveGraphVisualGeometry(visual: GraphNodeVisual, radius: number, geometry: GraphEdgeGeometry): GraphEdgeGeometry {
  const diameter = visual === "thumbnail" ? GRAPH_THUMBNAIL_DIAMETER : GRAPH_NODE_DIAMETER;
  const halfSize = finitePositive(radius) * diameter / 2;
  geometry.kind = visual === "thumbnail" || visual === "image" ? "rectangle" : "circle";
  geometry.radius = finitePositive(radius);
  geometry.halfWidth = halfSize;
  geometry.halfHeight = halfSize;
  return geometry;
}

export function resolveGraphArrowhead(
  fromX: number,
  fromY: number,
  tipX: number,
  tipY: number,
  length: number,
  width: number,
  arrowhead: GraphArrowhead,
): boolean {
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) return false;
  const safeLength = Math.max(0, finitePositive(length));
  const safeWidth = Math.max(0, finitePositive(width));
  const ux = dx / distance;
  const uy = dy / distance;
  const baseX = tipX - ux * safeLength;
  const baseY = tipY - uy * safeLength;
  const perpendicularX = -uy * safeWidth / 2;
  const perpendicularY = ux * safeWidth / 2;
  arrowhead.tipX = tipX;
  arrowhead.tipY = tipY;
  arrowhead.leftX = baseX + perpendicularX;
  arrowhead.leftY = baseY + perpendicularY;
  arrowhead.rightX = baseX - perpendicularX;
  arrowhead.rightY = baseY - perpendicularY;
  return true;
}
