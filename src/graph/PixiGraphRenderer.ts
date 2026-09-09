import {
  Application,
  Assets,
  Circle,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { BaseNodeType } from "../types/nodes";
import { resolveNodeTypeIconSource } from "./iconSource";
import {
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_WIDTH,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  clampGraphPosition,
  type GraphPoint,
  type GraphPosition,
  type GraphRenderEdge,
} from "./runtime";
import {
  graphLabelVisible,
  graphLodForZoom,
  graphNodeRadius,
  graphNodeVisual,
  type GraphLod,
  type GraphScene,
} from "./scene";
import {
  GRAPH_THUMBNAIL_DIAMETER,
  resolveGraphVisualGeometry,
  resolveVisualEdgeEndpoints,
  type GraphEdgeEndpoints,
  type GraphEdgeGeometry,
} from "./edgeGeometry";
import { GraphSimulation } from "./simulation";

interface GraphRendererCallbacks {
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
  onHoverNode: (point: GraphPoint | null, clientX?: number, clientY?: number) => void;
}

interface NodeDisplay {
  point: GraphPoint;
  container: Container;
  halo: Graphics;
  body: Graphics;
  label: Text;
  mask: Graphics;
  media: Sprite | null;
  mediaSource: string | null;
}

export interface GraphRendererDiagnostics {
  sceneUpdates: number;
  localizedPositionUpdates: number;
  viewportUpdates: number;
  lodChanges: number;
  textureLoads: number;
  renders: number;
}

interface EdgeDisplay {
  rendered: GraphRenderEdge;
  graphics: Graphics;
}

interface ActivePointer {
  kind: "node" | "pan";
  id?: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

const INITIAL_ZOOM = 0.65;
const DRAG_THRESHOLD = 3;

function colorNumber(color: string): number {
  return Number.parseInt(color.replace("#", ""), 16);
}

function mediaSourceFor(point: GraphPoint, visual: ReturnType<typeof graphNodeVisual>): string | null {
  if (visual === "thumbnail") return point.imageSrc ?? null;
  if (visual === "icon" && point.nodeType) return resolveNodeTypeIconSource(point.nodeType as BaseNodeType);
  return null;
}

export class PixiGraphRenderer {
  private readonly app = new Application();
  private readonly viewport = new Container();
  private readonly edgeLayer = new Container();
  private readonly nodeLayer = new Container();
  private readonly nodeDisplays = new Map<string, NodeDisplay>();
  private readonly edgeDisplays = new Map<string, EdgeDisplay>();
  private readonly texturePromises = new Map<string, Promise<Texture>>();
  private readonly loadedTextureSources = new Set<string>();
  private readonly textureReferences = new Map<string, number>();
  private readonly fromEdgeGeometry: GraphEdgeGeometry = { kind: "circle", radius: 0, halfWidth: 0, halfHeight: 0 };
  private readonly toEdgeGeometry: GraphEdgeGeometry = { kind: "circle", radius: 0, halfWidth: 0, halfHeight: 0 };
  private readonly edgeEndpoints: GraphEdgeEndpoints = { startX: 0, startY: 0, endX: 0, endY: 0 };
  private readonly resizeObserver: ResizeObserver;
  private scene: GraphScene | null = null;
  private positionCache = new Map<string, GraphPosition>();
  private callbacks: GraphRendererCallbacks;
  private lod: GraphLod = graphLodForZoom(INITIAL_ZOOM);
  private zoom = INITIAL_ZOOM;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private activePointer: ActivePointer | null = null;
  private readonly hoveredConnectionIds = new Set<string>();
  private pendingPointer: { x: number; y: number } | null = null;
  private pendingWheel: { deltaY: number; x: number; y: number } | null = null;
  private interactionFrame: number | null = null;
  private renderFrame: number | null = null;
  private simulationFrame: number | null = null;
  private simulationTimestamp = 0;
  private destroyed = false;
  // GraphSimulation owns velocities and sleep state; Pixi owns scheduling and visual application.
  private simulation: GraphSimulation | null = null;
  private lastTap: { id: string; time: number } | null = null;
  private readonly diagnostics: GraphRendererDiagnostics = {
    sceneUpdates: 0,
    localizedPositionUpdates: 0,
    viewportUpdates: 0,
    lodChanges: 0,
    textureLoads: 0,
    renders: 0,
  };

  private constructor(private readonly host: HTMLDivElement, callbacks: GraphRendererCallbacks) {
    this.callbacks = callbacks;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  static async create(host: HTMLDivElement, callbacks: GraphRendererCallbacks): Promise<PixiGraphRenderer> {
    const renderer = new PixiGraphRenderer(host, callbacks);
    await renderer.mount();
    return renderer;
  }

  private async mount() {
    const bounds = this.host.getBoundingClientRect();
    await this.app.init({
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      antialias: true,
      autoDensity: true,
      autoStart: false,
      backgroundAlpha: 0,
      preference: "webgl",
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      eventFeatures: { move: true, click: true, wheel: false, globalMove: false },
    });
    this.app.stop();
    this.app.canvas.className = "graph-view__canvas";
    this.app.canvas.setAttribute("aria-label", "Graph canvas");
    this.host.appendChild(this.app.canvas);
    this.viewport.eventMode = "passive";
    this.edgeLayer.eventMode = "none";
    this.nodeLayer.eventMode = "passive";
    this.viewport.addChild(this.edgeLayer, this.nodeLayer);
    this.app.stage.addChild(this.viewport);
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointerdown", this.onStagePointerDown);
    this.app.canvas.addEventListener("pointermove", this.onPointerMove);
    this.app.canvas.addEventListener("pointerup", this.onPointerUp);
    this.app.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resizeObserver.observe(this.host);
    this.resize(true);
  }

  setCallbacks(callbacks: GraphRendererCallbacks) {
    this.callbacks = callbacks;
  }

  setScene(scene: GraphScene, positionCache: Map<string, GraphPosition>) {
    if (this.destroyed) return;
    this.scene = scene;
    this.positionCache = positionCache;
    if (!this.simulation) {
      this.simulation = new GraphSimulation(scene.runtime);
      this.simulation.wake("initial");
      this.scheduleSimulation();
    } else if (this.simulation.setRuntime(scene.runtime)) {
      this.scheduleSimulation();
    }
    this.diagnostics.sceneUpdates += 1;
    this.reconcileEdges();
    this.reconcileNodes();
    this.applyLod();
    this.requestRender();
  }

  // This is the high-frequency renderer boundary for a future GraphSimulation.
  // It mutates visual positions and incident edges without rebuilding projection or React.
  updatePositions(updates: Iterable<readonly [string, GraphPosition]>) {
    if (!this.scene || this.destroyed) return;
    const dirtyEdges = new Set<string>();
    for (const [id, position] of updates) {
      const point = this.scene.runtime.pointsById.get(id);
      const display = this.nodeDisplays.get(id);
      if (!point || !display) continue;
      const next = clampGraphPosition(position);
      point.x = next.x;
      point.y = next.y;
      this.positionCache.set(id, next);
      display.container.position.set(next.x, next.y);
      this.diagnostics.localizedPositionUpdates += 1;
      for (const edge of this.scene.runtime.edgesByPointId.get(id) ?? []) dirtyEdges.add(edge.id);
    }
    for (const id of dirtyEdges) this.drawEdge(this.edgeDisplays.get(id));
    this.requestRender();
  }

  getDiagnostics(): Readonly<GraphRendererDiagnostics> {
    return { ...this.diagnostics };
  }

  private reconcileNodes() {
    if (!this.scene) return;
    const liveIds = new Set(this.scene.runtime.points.map((point) => point.id));
    for (const [id, display] of this.nodeDisplays) {
      if (liveIds.has(id)) continue;
      this.releaseDisplayTexture(display);
      display.container.destroy({ children: true });
      this.nodeDisplays.delete(id);
    }
    for (const point of this.scene.runtime.points) {
      let display = this.nodeDisplays.get(point.id);
      if (!display) {
        display = this.createNodeDisplay(point);
        this.nodeDisplays.set(point.id, display);
        this.nodeLayer.addChild(display.container);
      }
      display.point = point;
      display.container.position.set(point.x, point.y);
      display.label.text = point.label;
      display.label.style.fill = point.color;
    }
  }

  private createNodeDisplay(point: GraphPoint): NodeDisplay {
    const container = new Container();
    const halo = new Graphics();
    const body = new Graphics();
    const mask = new Graphics();
    const label = new Text({
      text: point.label,
      style: { fill: point.color, fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fontWeight: "500" },
    });
    label.anchor.set(0.5, 0);
    label.eventMode = "none";
    halo.eventMode = "none";
    body.eventMode = "none";
    mask.eventMode = "none";
    container.addChild(halo, body, mask, label);
    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointerover", (event: FederatedPointerEvent) => {
      this.setHovered(point.id, event.nativeEvent as PointerEvent);
    });
    container.on("pointerout", () => this.setHovered(null));
    container.on("pointerdown", (event: FederatedPointerEvent) => this.onNodePointerDown(event, point.id));
    return { point, container, halo, body, label, mask, media: null, mediaSource: null };
  }

  private reconcileEdges() {
    if (!this.scene) return;
    const liveIds = new Set(this.scene.runtime.edges.map((edge) => edge.id));
    for (const [id, display] of this.edgeDisplays) {
      if (liveIds.has(id)) continue;
      display.graphics.destroy();
      this.edgeDisplays.delete(id);
    }
    for (const rendered of this.scene.runtime.edges) {
      let display = this.edgeDisplays.get(rendered.id);
      if (!display) {
        display = { rendered, graphics: new Graphics() };
        display.graphics.eventMode = "none";
        this.edgeDisplays.set(rendered.id, display);
        this.edgeLayer.addChild(display.graphics);
      }
      display.rendered = rendered;
      this.drawEdge(display);
    }
  }

  private drawEdge(display?: EdgeDisplay) {
    if (!display || !this.scene) return;
    const { rendered, graphics } = display;
    const grouping = rendered.facts.every((fact) => fact.kind === "grouping");
    const highlighted = this.hoveredId !== null && (rendered.from.id === this.hoveredId || rendered.to.id === this.hoveredId);
    const dimmed = this.hoveredId !== null && !highlighted;
    const alpha = highlighted
      ? 0.95
      : dimmed
        ? 0.045
        : grouping
      ? (this.lod === "distant" ? 0.05 : this.lod === "far" ? 0.12 : 0.24)
      : (this.lod === "distant" ? 0.12 : this.lod === "far" ? 0.24 : 0.4);
    const width = highlighted ? 2.35 : this.lod === "detail" ? 1.45 : this.lod === "medium" ? 1.2 : 0.85;
    const fromEmphasized = rendered.from.id === this.selectedId || rendered.from.id === this.hoveredId;
    const toEmphasized = rendered.to.id === this.selectedId || rendered.to.id === this.hoveredId;
    resolveGraphVisualGeometry(
      graphNodeVisual(rendered.from, this.lod, this.scene.preferences),
      graphNodeRadius(rendered.from, this.lod, fromEmphasized),
      this.fromEdgeGeometry,
    );
    resolveGraphVisualGeometry(
      graphNodeVisual(rendered.to, this.lod, this.scene.preferences),
      graphNodeRadius(rendered.to, this.lod, toEmphasized),
      this.toEdgeGeometry,
    );
    const hasSegment = resolveVisualEdgeEndpoints(
      rendered.from.x,
      rendered.from.y,
      rendered.to.x,
      rendered.to.y,
      this.fromEdgeGeometry,
      this.toEdgeGeometry,
      width / 2,
      this.edgeEndpoints,
    );
    graphics.clear();
    if (hasSegment) {
      if (grouping && this.lod !== "distant") {
        this.drawDashedLine(graphics, this.edgeEndpoints.startX, this.edgeEndpoints.startY, this.edgeEndpoints.endX, this.edgeEndpoints.endY, 8, 7);
      } else {
        graphics.moveTo(this.edgeEndpoints.startX, this.edgeEndpoints.startY).lineTo(this.edgeEndpoints.endX, this.edgeEndpoints.endY);
      }
    }
    const highlightColor = this.hoveredId ? colorNumber(this.scene?.runtime.pointsById.get(this.hoveredId)?.color ?? "#ffffff") : 0xffffff;
    if (hasSegment) graphics.stroke({ color: highlighted ? highlightColor : grouping ? 0x4dd8c0 : 0x8d969b, width, alpha });
  }

  private drawDashedLine(graphics: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    const ux = dx / Math.max(1, distance);
    const uy = dy / Math.max(1, distance);
    for (let offset = 0; offset < distance; offset += dash + gap) {
      const end = Math.min(distance, offset + dash);
      graphics.moveTo(x1 + ux * offset, y1 + uy * offset).lineTo(x1 + ux * end, y1 + uy * end);
    }
  }

  private applyLod() {
    if (!this.scene) return;
    for (const display of this.nodeDisplays.values()) this.applyNodeVisual(display);
    for (const display of this.edgeDisplays.values()) this.drawEdge(display);
  }

  private applyNodeVisual(display: NodeDisplay) {
    if (!this.scene) return;
    const emphasized = display.point.id === this.selectedId || display.point.id === this.hoveredId;
    const dimmed = this.hoveredId !== null
      && display.point.id !== this.hoveredId
      && !this.hoveredConnectionIds.has(display.point.id);
    const radius = graphNodeRadius(display.point, this.lod, emphasized);
    const visual = graphNodeVisual(display.point, this.lod, this.scene.preferences);
    const color = colorNumber(display.point.color);
    const square = visual === "thumbnail" || visual === "image";
    display.container.alpha = dimmed ? 0.16 : 1;
    display.body.mask = null;
    display.mask.visible = false;
    if (display.media && visual !== "thumbnail" && visual !== "icon") {
      display.media.mask = null;
      display.media.visible = false;
    }
    if (square) {
      display.body.clear().rect(-radius, -radius, radius * 2, radius * 2).fill({ color, alpha: 0.96 });
    } else {
      display.body.clear().circle(0, 0, radius).fill({ color, alpha: visual === "point" ? 0.78 : 0.96 });
    }
    display.halo.clear();
    if (display.point.id === this.selectedId) {
      display.halo.circle(0, 0, radius + 5).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    } else if (display.point.id === this.hoveredId) {
      display.halo.circle(0, 0, radius + 3).stroke({ color: 0xffffff, width: 1.25, alpha: 0.72 });
    }
    display.container.hitArea = square
      ? new Rectangle(-Math.max(11, radius + 5), -Math.max(11, radius + 5), Math.max(22, (radius + 5) * 2), Math.max(22, (radius + 5) * 2))
      : new Circle(0, 0, Math.max(11, radius + 5));
    display.label.visible = graphLabelVisible(this.lod, emphasized);
    display.label.position.set(0, radius + 7);
    display.label.style.fontSize = display.point.kind === "type-hub" ? 13 : 11;
    const source = mediaSourceFor(display.point, visual);
    if (!source) {
      display.body.mask = null;
      if (display.media) {
        display.media.mask = null;
        display.media.visible = false;
      }
      return;
    }
    void this.ensureMedia(display, source);
  }

  private async ensureMedia(display: NodeDisplay, source: string) {
    if (display.mediaSource !== source) {
      this.releaseDisplayTexture(display);
      display.mediaSource = source;
      this.textureReferences.set(source, (this.textureReferences.get(source) ?? 0) + 1);
    }
    let promise = this.texturePromises.get(source);
    if (!promise) {
      promise = Assets.load<Texture>(source);
      this.texturePromises.set(source, promise);
      this.diagnostics.textureLoads += 1;
    }
    try {
      const texture = await promise;
      this.loadedTextureSources.add(source);
      if (this.destroyed || !this.nodeDisplays.has(display.point.id) || display.mediaSource !== source) {
        if (this.destroyed || !this.textureReferences.has(source)) {
          this.loadedTextureSources.delete(source);
          this.texturePromises.delete(source);
          void Assets.unload(source);
        }
        return;
      }
      if (!display.media) {
        display.media = new Sprite(texture);
        display.media.anchor.set(0.5);
        display.media.eventMode = "none";
        display.container.addChildAt(display.media, 2);
      } else {
        display.media.texture = texture;
      }
      const emphasized = display.point.id === this.selectedId || display.point.id === this.hoveredId;
      const currentVisual = graphNodeVisual(display.point, this.lod, this.scene!.preferences);
      const currentRadius = graphNodeRadius(display.point, this.lod, emphasized);
      display.media.visible = mediaSourceFor(display.point, currentVisual) === source;
      const diameter = currentRadius * (currentVisual === "thumbnail" ? GRAPH_THUMBNAIL_DIAMETER : 1.45);
      display.media.width = diameter;
      display.media.height = diameter;
      display.media.tint = 0xffffff;
      display.mask.clear();
      if (currentVisual === "thumbnail") {
        display.body.mask = null;
        display.mask.clear().rect(-currentRadius * 0.95, -currentRadius * 0.95, currentRadius * 1.9, currentRadius * 1.9).fill(0xffffff);
        display.mask.visible = true;
        display.media.mask = display.mask;
      } else if (currentVisual === "icon") {
        display.mask.visible = false;
        display.media.mask = null;
        display.body.mask = display.media;
      } else {
        display.mask.visible = false;
        display.body.mask = null;
        display.media.mask = null;
      }
      this.requestRender();
    } catch (error) {
      console.warn("Graph texture could not be loaded", source, error);
      this.texturePromises.delete(source);
      if (display.mediaSource === source) this.releaseDisplayTexture(display);
    }
  }

  private releaseDisplayTexture(display: NodeDisplay) {
    const source = display.mediaSource;
    display.body.mask = null;
    if (display.media) {
      display.media.mask = null;
      display.media.destroy({ texture: false, textureSource: false });
      display.media = null;
    }
    display.mask.visible = false;
    display.mediaSource = null;
    if (!source) return;
    const references = Math.max(0, (this.textureReferences.get(source) ?? 1) - 1);
    if (references > 0) {
      this.textureReferences.set(source, references);
      return;
    }
    this.textureReferences.delete(source);
    queueMicrotask(() => {
      if (this.destroyed || this.textureReferences.has(source)) return;
      this.texturePromises.delete(source);
      if (this.loadedTextureSources.delete(source)) void Assets.unload(source);
    });
  }

  private setHovered(id: string | null, nativeEvent?: PointerEvent) {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.hoveredConnectionIds.clear();
    if (id && this.scene) {
      for (const edge of this.scene.runtime.edgesByPointId.get(id) ?? []) {
        this.hoveredConnectionIds.add(edge.from.id);
        this.hoveredConnectionIds.add(edge.to.id);
      }
    }
    const nextDisplay = id ? this.nodeDisplays.get(id) : null;
    for (const display of this.nodeDisplays.values()) this.applyNodeVisual(display);
    this.callbacks.onHoverNode(
      nextDisplay?.point ?? null,
      nativeEvent?.clientX,
      nativeEvent?.clientY,
    );
    for (const display of this.edgeDisplays.values()) this.drawEdge(display);
    this.requestRender();
  }

  private onNodePointerDown = (event: FederatedPointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const native = event.nativeEvent as PointerEvent;
    this.activePointer = {
      kind: "node", id, pointerId: event.pointerId,
      startX: native.clientX, startY: native.clientY, lastX: native.clientX, lastY: native.clientY, moved: false,
    };
    this.app.canvas.setPointerCapture?.(event.pointerId);
  };

  private onStagePointerDown = (event: FederatedPointerEvent) => {
    if (event.button !== 0 || event.target !== this.app.stage) return;
    const native = event.nativeEvent as PointerEvent;
    this.activePointer = {
      kind: "pan", pointerId: event.pointerId,
      startX: native.clientX, startY: native.clientY, lastX: native.clientX, lastY: native.clientY, moved: false,
    };
    this.app.canvas.setPointerCapture?.(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.activePointer || event.pointerId !== this.activePointer.pointerId) return;
    this.pendingPointer = { x: event.clientX, y: event.clientY };
    this.scheduleInteraction();
  };

  private scheduleInteraction() {
    if (this.interactionFrame !== null) return;
    this.interactionFrame = requestAnimationFrame(() => {
      this.interactionFrame = null;
      const active = this.activePointer;
      const pending = this.pendingPointer;
      this.pendingPointer = null;
      if (!active || !pending) return;
      const totalDistance = Math.hypot(pending.x - active.startX, pending.y - active.startY);
      if (!active.moved && totalDistance < DRAG_THRESHOLD) return;
      if (!active.moved) {
        active.moved = true;
        this.app.canvas.classList.add("is-grabbing");
        if (active.kind === "node" && active.id) {
          this.simulation?.startDrag(active.id);
          this.simulationTimestamp = 0;
          this.scheduleSimulation();
        }
      }
      const dx = pending.x - active.lastX;
      const dy = pending.y - active.lastY;
      active.lastX = pending.x;
      active.lastY = pending.y;
      if (active.kind === "pan") {
        this.viewport.position.x += dx;
        this.viewport.position.y += dy;
        this.diagnostics.viewportUpdates += 1;
        this.requestRender();
      } else if (active.id && this.scene) {
        const point = this.scene.runtime.pointsById.get(active.id);
        if (point) {
          const next = { x: point.x + dx / this.zoom, y: point.y + dy / this.zoom };
          const update = this.simulation?.movePinned(active.id, next);
          this.updatePositions([update ?? [active.id, next]]);
        }
      }
    });
  }

  private onPointerUp = (event: PointerEvent) => {
    const active = this.activePointer;
    if (!active || event.pointerId !== active.pointerId) return;
    if (this.interactionFrame !== null) cancelAnimationFrame(this.interactionFrame);
    this.interactionFrame = null;
    this.pendingPointer = null;
    this.activePointer = null;
    this.app.canvas.classList.remove("is-grabbing");
    if (this.app.canvas.hasPointerCapture?.(event.pointerId)) this.app.canvas.releasePointerCapture(event.pointerId);
    if (active.kind === "node" && active.id) {
      if (!active.moved) this.activateNode(active.id);
      else {
        this.simulation?.endDrag(active.id);
        this.simulationTimestamp = 0;
        this.scheduleSimulation();
      }
    }
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (this.activePointer?.pointerId !== event.pointerId) return;
    if (this.activePointer.kind === "node" && this.activePointer.id && this.activePointer.moved) {
      this.simulation?.endDrag(this.activePointer.id);
      this.simulationTimestamp = 0;
      this.scheduleSimulation();
    }
    this.activePointer = null;
    this.pendingPointer = null;
    this.app.canvas.classList.remove("is-grabbing");
  };

  private activateNode(id: string) {
    if (this.scene?.runtime.pointsById.get(id)?.kind !== "node") return;
    const previous = this.selectedId;
    this.selectedId = id;
    const previousDisplay = previous ? this.nodeDisplays.get(previous) : null;
    const display = this.nodeDisplays.get(id);
    if (previousDisplay) this.applyNodeVisual(previousDisplay);
    if (display) this.applyNodeVisual(display);
    const now = performance.now();
    if (this.lastTap?.id === id && now - this.lastTap.time < 320) {
      this.lastTap = null;
      this.callbacks.onOpenNode(id);
    } else {
      this.lastTap = { id, time: now };
      this.callbacks.onSelectNode(id);
    }
    this.requestRender();
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const current = this.pendingWheel;
    this.pendingWheel = {
      deltaY: (current?.deltaY ?? 0) + event.deltaY,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    if (this.interactionFrame !== null) return;
    this.interactionFrame = requestAnimationFrame(() => {
      this.interactionFrame = null;
      const pending = this.pendingWheel;
      this.pendingWheel = null;
      if (!pending) return;
      const previous = this.zoom;
      const next = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, previous * Math.exp(-pending.deltaY * 0.0015)));
      if (next === previous) return;
      const worldX = (pending.x - this.viewport.position.x) / previous;
      const worldY = (pending.y - this.viewport.position.y) / previous;
      this.zoom = next;
      this.viewport.scale.set(next);
      this.viewport.position.set(pending.x - worldX * next, pending.y - worldY * next);
      this.diagnostics.viewportUpdates += 1;
      const nextLod = graphLodForZoom(next, this.lod);
      if (nextLod !== this.lod) {
        this.lod = nextLod;
        this.diagnostics.lodChanges += 1;
        this.applyLod();
      }
      this.requestRender();
    });
  };

  private resize(center = false) {
    if (this.destroyed || !this.app.renderer) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.app.renderer.resize(width, height);
    this.app.stage.hitArea = new Rectangle(0, 0, width, height);
    if (center) {
      this.viewport.scale.set(this.zoom);
      this.viewport.position.set(
        width / 2 - GRAPH_CANVAS_WIDTH * this.zoom / 2,
        height / 2 - GRAPH_CANVAS_HEIGHT * this.zoom / 2,
      );
    }
    this.requestRender();
  }

  private requestRender() {
    if (this.destroyed || this.renderFrame !== null) return;
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      if (!this.destroyed) {
        this.app.render();
        this.diagnostics.renders += 1;
      }
    });
  }

  private scheduleSimulation() {
    if (this.destroyed || this.simulationFrame !== null || !this.simulation || this.simulation.isSleeping()) return;
    this.simulationFrame = requestAnimationFrame((timestamp) => {
      this.simulationFrame = null;
      if (this.destroyed || !this.simulation || this.simulation.isSleeping()) return;
      const delta = this.simulationTimestamp === 0 ? 1 / 60 : Math.min(0.05, (timestamp - this.simulationTimestamp) / 1000);
      this.simulationTimestamp = timestamp;
      const updates = this.simulation.step(delta);
      if (updates.length > 0) this.updatePositions(updates);
      if (!this.simulation.isSleeping()) this.scheduleSimulation();
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    if (this.interactionFrame !== null) cancelAnimationFrame(this.interactionFrame);
    if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
    if (this.simulationFrame !== null) cancelAnimationFrame(this.simulationFrame);
    this.simulation?.sleep();
    this.app.stage.off("pointerdown", this.onStagePointerDown);
    this.app.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.app.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.app.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false, context: true });
    for (const source of this.loadedTextureSources) void Assets.unload(source);
    this.loadedTextureSources.clear();
    this.texturePromises.clear();
    this.textureReferences.clear();
    this.nodeDisplays.clear();
    this.edgeDisplays.clear();
  }
}
