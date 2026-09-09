import {
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_WIDTH,
  clampGraphPosition,
  type GraphPosition,
  type GraphRuntimeModel,
} from "./runtime";
import type { GraphEdgeKind } from "./projection";

export type GraphSimulationWakeReason = "initial" | "structure" | "drag" | "release" | "manual";

export interface GraphSimulationEdgeConfig {
  strength: number;
  targetLength: number;
}

export interface GraphSimulationConfig {
  repulsionStrength: number;
  maxRepulsionDistance: number;
  minSeparation: number;
  collisionStrength: number;
  centerStrength: number;
  damping: number;
  maxSpeed: number;
  sleepSpeedThreshold: number;
  sleepFrames: number;
  maxSettlingFrames: number;
  typeHubMass: number;
  edgeKinds: Record<GraphEdgeKind, GraphSimulationEdgeConfig>;
}

export const DEFAULT_GRAPH_SIMULATION_CONFIG: GraphSimulationConfig = {
  repulsionStrength: 80000,
  maxRepulsionDistance: 900,
  minSeparation: 135,
  collisionStrength: 2.1,
  centerStrength: 0.003,
  damping: 5.8,
  maxSpeed: 720,
  sleepSpeedThreshold: 3.5,
  sleepFrames: 14,
  maxSettlingFrames: 240,
  typeHubMass: 2.5,
  edgeKinds: {
    "nodal-relation": { strength: 0.85, targetLength: 280 },
    "mention-reference": { strength: 0.5, targetLength: 350 },
    "legacy-runtime-derived": { strength: 0.32, targetLength: 410 },
    grouping: { strength: 0.025, targetLength: 620 },
  },
};

export type GraphPositionUpdate = readonly [string, GraphPosition];

interface GraphVelocity {
  x: number;
  y: number;
}

interface ActivePointerState {
  id: string;
  position: GraphPosition;
}

function hashPair(first: string, second: string): number {
  let hash = 2166136261;
  for (const value of `${first}\u0000${second}`) {
    hash ^= value.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnitVector(first: string, second: string): { x: number; y: number } {
  const angle = (hashPair(first, second) / 0x100000000) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function mergeConfig(config?: Partial<GraphSimulationConfig>): GraphSimulationConfig {
  return {
    ...DEFAULT_GRAPH_SIMULATION_CONFIG,
    ...config,
    edgeKinds: {
      ...DEFAULT_GRAPH_SIMULATION_CONFIG.edgeKinds,
      ...(config?.edgeKinds ?? {}),
    },
  };
}

function isActive(activeIds: Set<string> | null, id: string): boolean {
  return activeIds === null || activeIds.has(id);
}

export class GraphSimulation {
  private runtime: GraphRuntimeModel;
  private readonly config: GraphSimulationConfig;
  private readonly velocities = new Map<string, GraphVelocity>();
  private readonly pinned = new Map<string, ActivePointerState>();
  private activeIds: Set<string> | null = null;
  private pointIndexes = new Map<string, number>();
  private forceX: number[] = [];
  private forceY: number[] = [];
  private activeFlags = new Uint8Array(0);
  private readonly updates: GraphPositionUpdate[] = [];
  private sleeping = true;
  private quietFrames = 0;
  private settlingFrames = 0;

  constructor(runtime: GraphRuntimeModel, config?: Partial<GraphSimulationConfig>) {
    this.runtime = runtime;
    this.config = mergeConfig(config);
    this.syncRuntime();
  }

  setRuntime(runtime: GraphRuntimeModel): boolean {
    if (this.runtime === runtime) return false;
    this.runtime = runtime;
    this.activeIds = null;
    this.syncRuntime();
    this.wake("structure");
    return true;
  }

  wake(reason: GraphSimulationWakeReason = "manual", focusId?: string): void {
    if (reason === "drag" && focusId) this.activeIds = this.localNeighborhood(focusId);
    else if (reason === "structure" || reason === "initial") this.activeIds = null;
    this.sleeping = false;
    this.quietFrames = 0;
    this.settlingFrames = 0;
  }

  sleep(): void {
    this.sleeping = true;
    this.quietFrames = 0;
    for (const velocity of this.velocities.values()) {
      velocity.x = 0;
      velocity.y = 0;
    }
  }

  isSleeping(): boolean {
    return this.sleeping;
  }

  startDrag(id: string): boolean {
    const point = this.runtime.pointsById.get(id);
    if (!point) return false;
    this.pinned.set(id, { id, position: { x: point.x, y: point.y } });
    const velocity = this.velocities.get(id);
    if (velocity) {
      velocity.x = 0;
      velocity.y = 0;
    }
    this.activeIds = this.localNeighborhood(id);
    this.wake("drag");
    return true;
  }

  movePinned(id: string, position: GraphPosition): GraphPositionUpdate | null {
    const point = this.runtime.pointsById.get(id);
    if (!point || !this.pinned.has(id)) return null;
    const next = clampGraphPosition(position);
    const pinned = this.pinned.get(id)!;
    pinned.position = next;
    point.x = next.x;
    point.y = next.y;
    this.wake("drag");
    return [id, next];
  }

  endDrag(id: string): void {
    if (!this.pinned.delete(id)) return;
    const velocity = this.velocities.get(id);
    if (velocity) {
      velocity.x = 0;
      velocity.y = 0;
    }
    this.wake("release");
  }

  step(deltaSeconds = 1 / 60): readonly GraphPositionUpdate[] {
    if (this.sleeping) return [];
    if (this.runtime.points.length === 0) {
      this.sleep();
      return [];
    }
    const delta = Math.max(1 / 240, Math.min(0.05, deltaSeconds));
    const points = this.runtime.points;
    this.activeFlags.fill(0);
    this.updates.length = 0;
    const activeFlags = this.activeFlags;
    for (let index = 0; index < points.length; index += 1) {
      if (isActive(this.activeIds, points[index].id)) activeFlags[index] = 1;
      this.forceX[index] = 0;
      this.forceY[index] = 0;
    }

    for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
      const first = points[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
        if (activeFlags[firstIndex] === 0 && activeFlags[secondIndex] === 0) continue;
        const second = points[secondIndex];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          const unit = stableUnitVector(first.id, second.id);
          dx = unit.x;
          dy = unit.y;
          distance = 1;
        } else {
          dx /= distance;
          dy /= distance;
        }
        if (distance > this.config.maxRepulsionDistance) continue;
        const collision = distance < this.config.minSeparation
          ? (this.config.minSeparation - distance) * this.config.collisionStrength
          : 0;
        const magnitude = this.config.repulsionStrength / (distance * distance) + collision;
        if (activeFlags[firstIndex]) {
          this.forceX[firstIndex] -= dx * magnitude;
          this.forceY[firstIndex] -= dy * magnitude;
        }
        if (activeFlags[secondIndex]) {
          this.forceX[secondIndex] += dx * magnitude;
          this.forceY[secondIndex] += dy * magnitude;
        }
      }
    }

    for (const rendered of this.runtime.edges) {
      const fromIndex = this.pointIndexes.get(rendered.from.id);
      const toIndex = this.pointIndexes.get(rendered.to.id);
      if (fromIndex === undefined || toIndex === undefined) continue;
      if (activeFlags[fromIndex] === 0 && activeFlags[toIndex] === 0) continue;
      const physics = this.edgePhysics(rendered.facts);
      let dx = rendered.to.x - rendered.from.x;
      let dy = rendered.to.y - rendered.from.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.001) {
        const unit = stableUnitVector(rendered.from.id, rendered.to.id);
        dx = unit.x;
        dy = unit.y;
        distance = 1;
      } else {
        dx /= distance;
        dy /= distance;
      }
      const magnitude = (distance - physics.targetLength) * physics.strength;
      if (activeFlags[fromIndex]) {
        this.forceX[fromIndex] += dx * magnitude;
        this.forceY[fromIndex] += dy * magnitude;
      }
      if (activeFlags[toIndex]) {
        this.forceX[toIndex] -= dx * magnitude;
        this.forceY[toIndex] -= dy * magnitude;
      }
    }

    const decay = Math.exp(-this.config.damping * delta);
    let maxSpeed = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const velocity = this.velocities.get(point.id)!;
      const pinned = this.pinned.get(point.id);
      if (pinned) {
        point.x = pinned.position.x;
        point.y = pinned.position.y;
        velocity.x = 0;
        velocity.y = 0;
        continue;
      }
      if (!activeFlags[index]) {
        velocity.x = 0;
        velocity.y = 0;
        continue;
      }
      this.forceX[index] += (GRAPH_CANVAS_WIDTH / 2 - point.x) * this.config.centerStrength;
      this.forceY[index] += (GRAPH_CANVAS_HEIGHT / 2 - point.y) * this.config.centerStrength;
      const mass = point.kind === "type-hub" ? this.config.typeHubMass : 1;
      velocity.x = (velocity.x + (this.forceX[index] / mass) * delta) * decay;
      velocity.y = (velocity.y + (this.forceY[index] / mass) * delta) * decay;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > this.config.maxSpeed) {
        const scale = this.config.maxSpeed / speed;
        velocity.x *= scale;
        velocity.y *= scale;
      }
      const next = clampGraphPosition({ x: point.x + velocity.x * delta, y: point.y + velocity.y * delta });
      point.x = next.x;
      point.y = next.y;
      maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.y));
      this.updates.push([point.id, next]);
    }

    this.settlingFrames += 1;
    if (maxSpeed <= this.config.sleepSpeedThreshold) this.quietFrames += 1;
    else this.quietFrames = 0;
    if (this.quietFrames >= this.config.sleepFrames || this.settlingFrames >= this.config.maxSettlingFrames) this.sleep();
    return this.updates;
  }

  private syncRuntime() {
    const liveIds = new Set(this.runtime.points.map((point) => point.id));
    for (const id of this.velocities.keys()) if (!liveIds.has(id)) this.velocities.delete(id);
    for (const id of this.pinned.keys()) if (!liveIds.has(id)) this.pinned.delete(id);
    this.pointIndexes = new Map(this.runtime.points.map((point, index) => [point.id, index]));
    this.forceX.length = this.runtime.points.length;
    this.forceY.length = this.runtime.points.length;
    if (this.activeFlags.length !== this.runtime.points.length) this.activeFlags = new Uint8Array(this.runtime.points.length);
    for (const point of this.runtime.points) {
      if (!this.velocities.has(point.id)) this.velocities.set(point.id, { x: 0, y: 0 });
    }
  }

  private localNeighborhood(focusId: string): Set<string> {
    const ids = new Set<string>([focusId]);
    for (const edge of this.runtime.edgesByPointId.get(focusId) ?? []) {
      ids.add(edge.from.id);
      ids.add(edge.to.id);
    }
    return ids;
  }

  private edgePhysics(facts: readonly { kind: GraphEdgeKind }[]): GraphSimulationEdgeConfig {
    let selected = this.config.edgeKinds.grouping;
    for (const fact of facts) {
      const candidate = this.config.edgeKinds[fact.kind];
      if (candidate.strength > selected.strength) selected = candidate;
    }
    return selected;
  }
}