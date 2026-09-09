import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from "react";
import {
  clampGraphPosition,
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_WIDTH,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  type GraphPosition,
  type GraphRuntimeModel,
} from "./runtime";

interface GraphInteractionOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  runtime: GraphRuntimeModel;
  positionCache: Map<string, GraphPosition>;
}

export function useGraphInteraction({ canvasRef, rootRef, runtime, positionCache }: GraphInteractionOptions) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const edgeElements = useRef(new Map<string, SVGLineElement>());
  const viewport = useRef({ zoom: 0.5, panX: 0, panY: 0 });
  const drag = useRef<{ id: string; pointerX: number; pointerY: number; moved: boolean } | null>(null);
  const pan = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const pendingDrag = useRef<{ x: number; y: number } | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const panFrame = useRef<number | null>(null);
  const zoomFrame = useRef<number | null>(null);
  const pendingWheel = useRef<{ deltaY: number; clientX: number; clientY: number } | null>(null);

  const applyViewport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY, zoom } = viewport.current;
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  };

  const updateEdges = (pointId: string) => {
    for (const rendered of runtimeRef.current.edgesByPointId.get(pointId) ?? []) {
      const line = edgeElements.current.get(rendered.id);
      if (!line) continue;
      line.setAttribute("x1", String(rendered.from.x));
      line.setAttribute("y1", String(rendered.from.y));
      line.setAttribute("x2", String(rendered.to.x));
      line.setAttribute("y2", String(rendered.to.y));
    }
  };

  const applyDrag = (clientX: number, clientY: number) => {
    const active = drag.current;
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    const point = runtimeRef.current.pointsById.get(active.id);
    if (!point) return;
    const rect = canvas.getBoundingClientRect();
    const deltaX = ((clientX - active.pointerX) / rect.width) * GRAPH_CANVAS_WIDTH;
    const deltaY = ((clientY - active.pointerY) / rect.height) * GRAPH_CANVAS_HEIGHT;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 0.1) return;
    active.pointerX = clientX;
    active.pointerY = clientY;
    active.moved = true;
    const next = clampGraphPosition({ x: point.x + deltaX, y: point.y + deltaY });
    point.x = next.x;
    point.y = next.y;
    positionCache.set(point.id, next);
    const element = nodeElements.current.get(point.id);
    if (element) {
      element.style.left = `${(next.x / GRAPH_CANVAS_WIDTH) * 100}%`;
      element.style.top = `${(next.y / GRAPH_CANVAS_HEIGHT) * 100}%`;
    }
    updateEdges(point.id);
  };

  const scheduleDrag = (clientX: number, clientY: number) => {
    pendingDrag.current = { x: clientX, y: clientY };
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const pending = pendingDrag.current;
      pendingDrag.current = null;
      if (pending) applyDrag(pending.x, pending.y);
    });
  };

  const schedulePan = (clientX: number, clientY: number) => {
    pendingPan.current = { x: clientX, y: clientY };
    if (panFrame.current !== null) return;
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = null;
      const active = pan.current;
      const pending = pendingPan.current;
      pendingPan.current = null;
      if (!active || !pending) return;
      viewport.current.panX = active.originX + pending.x - active.pointerX;
      viewport.current.panY = active.originY + pending.y - active.pointerY;
      applyViewport();
    });
  };

  const scheduleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const current = pendingWheel.current;
    pendingWheel.current = {
      deltaY: (current?.deltaY ?? 0) + event.deltaY,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (zoomFrame.current !== null) return;
    zoomFrame.current = requestAnimationFrame(() => {
      zoomFrame.current = null;
      const pending = pendingWheel.current;
      pendingWheel.current = null;
      const canvas = canvasRef.current;
      if (!pending || !canvas) return;
      const previousZoom = viewport.current.zoom;
      const nextZoom = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, previousZoom * Math.exp(-pending.deltaY * 0.0015)));
      if (nextZoom === previousZoom) return;
      const rect = canvas.getBoundingClientRect();
      const baseLeft = rect.left - viewport.current.panX;
      const baseTop = rect.top - viewport.current.panY;
      const localX = (pending.clientX - rect.left) / previousZoom;
      const localY = (pending.clientY - rect.top) / previousZoom;
      viewport.current.panX = pending.clientX - baseLeft - localX * nextZoom;
      viewport.current.panY = pending.clientY - baseTop - localY * nextZoom;
      viewport.current.zoom = nextZoom;
      applyViewport();
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.currentTarget.dataset.graphPointId) return;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDrag.current = null;
    applyDrag(event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.classList.remove("graph-node--active");
    rootRef.current?.classList.remove("graph-view--node-active");
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || runtime.points.length === 0) return;
      const parent = canvas.parentElement;
      viewport.current.panX = (parent?.clientWidth ?? canvas.offsetWidth) / 2 - canvas.offsetWidth * viewport.current.zoom / 2;
      viewport.current.panY = (parent?.clientHeight ?? canvas.offsetHeight) / 2 - canvas.offsetHeight * viewport.current.zoom / 2;
      applyViewport();
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, runtime.points.length]);

  useEffect(() => () => {
    for (const frame of [dragFrame.current, panFrame.current, zoomFrame.current]) if (frame !== null) cancelAnimationFrame(frame);
  }, []);

  return {
    setNodeElement(id: string, element: HTMLButtonElement | null) {
      if (element) nodeElements.current.set(id, element);
      else nodeElements.current.delete(id);
    },
    setEdgeElement(id: string, element: SVGLineElement | null) {
      if (element) edgeElements.current.set(id, element);
      else edgeElements.current.delete(id);
    },
    onNodePointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id, pointerX: event.clientX, pointerY: event.clientY, moved: false };
      event.currentTarget.classList.add("graph-node--active");
      rootRef.current?.classList.add("graph-view--node-active");
    },
    onNodePointerMove(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
      if (drag.current?.id === id) scheduleDrag(event.clientX, event.clientY);
    },
    onNodePointerUp(event: ReactPointerEvent<HTMLButtonElement>) { finishDrag(event); },
    onNodePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) { finishDrag(event); drag.current = null; },
    shouldSelectAfterClick() {
      const shouldSelect = !drag.current?.moved;
      drag.current = null;
      return shouldSelect;
    },
    onCanvasWheel: scheduleWheel,
    onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".graph-node"))) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pan.current = { pointerX: event.clientX, pointerY: event.clientY, originX: viewport.current.panX, originY: viewport.current.panY };
    },
    onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (pan.current) schedulePan(event.clientX, event.clientY);
    },
    onCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      if (!pan.current) return;
      if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
      const active = pan.current;
      viewport.current.panX = active.originX + event.clientX - active.pointerX;
      viewport.current.panY = active.originY + event.clientY - active.pointerY;
      applyViewport();
      pan.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onCanvasPointerCancel() { pan.current = null; },
  };
}
