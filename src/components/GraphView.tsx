import { getNodalMeta } from "../nodes/metadata";
import { getNodeGraphImageSource, getNodeGraphRelationIds } from "../nodes/runtime";
import { useEffect, useRef, useState } from "react";
import { NODE_REGISTRY, getNodeDefinition } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { useLocale, type Translate } from "../i18n/LocaleContext";

interface GraphViewProps {
  nodes: NodeItem[];
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
  projectKey: string;
}

interface GraphPoint {
  id: string;
  label: string;
  type: BaseNodeType | "concepto";
  x: number;
  y: number;
  concept?: boolean;
  category?: boolean;
  color?: string;
  imageSrc?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  concept?: boolean;
}

type PointPosition = Pick<GraphPoint, "x" | "y">;

const CANVAS_WIDTH = 5000;
const CANVAS_HEIGHT = 3200;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.6;

function layoutNodes(nodes: NodeItem[], showConcepts: boolean, t: Translate): GraphPoint[] {
  const points: GraphPoint[] = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const gapX = 360;
  const gapY = 220;
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const startX = (CANVAS_WIDTH - (columns - 1) * gapX) / 2;
  const startY = (CANVAS_HEIGHT - (rows - 1) * gapY) / 2;
  if (showConcepts) {
    const definitions = NODE_REGISTRY.conceptual();
    const centerY = CANVAS_HEIGHT / 2;
    definitions.forEach((definition, index) => {
      const concept = definition.concept!;
      points.push({
        id: `concept-${concept.id}`,
        label: t(concept.labelKey),
        type: "concepto",
        x: startX - 420,
        y: centerY + (index - (definitions.length - 1) / 2) * 220,
        concept: true,
        color: definition.color,
      });
    });
    NODE_REGISTRY.categories().forEach((category) => {
      const childPoints = definitions
        .filter(({ concept }) => concept?.categoryId === category.id)
        .map(({ concept }) => points.find((point) => point.id === `concept-${concept!.id}`))
        .filter((point): point is GraphPoint => Boolean(point));
      points.push({
        id: `category-${category.id}`,
        label: t(category.labelKey),
        type: "concepto",
        x: startX - 760,
        y: childPoints.length
          ? childPoints.reduce((total, point) => total + point.y, 0) / childPoints.length
          : centerY,
        concept: true,
        category: true,
        color: category.color,
      });
    });
  }
  nodes.forEach((node, index) => {
    points.push({
      id: node.id,
      label: node.name,
      type: node.type,
      imageSrc: getNodeGraphImageSource(node),
      x: startX + (index % columns) * gapX,
      y: startY + Math.floor(index / columns) * gapY,
    });
  });
  return points;
}

function getCallTargets(node: NodeItem, nodesById: Map<string, NodeItem>): string[] {
  const source = new DOMParser().parseFromString(node.content, "text/html");
  return Array.from(source.querySelectorAll<HTMLElement>("[data-mention-id]"))
    .map((element) => element.dataset.mentionId)
    .filter(
      (id): id is string =>
        Boolean(id && id !== node.id && nodesById.has(id)),
    );
}

function buildEdges(nodes: NodeItem[], showConcepts: boolean): GraphEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];
  if (showConcepts) {
    NODE_REGISTRY.conceptual().forEach(({ concept }) => {
      if (concept?.categoryId) {
        edges.push({
          from: `category-${concept.categoryId}`,
          to: `concept-${concept.id}`,
          concept: true,
        });
      }
    });
    nodes.forEach((node) => {
      const concept = getNodeDefinition(node.type).concept;
      if (concept) {
        edges.push({ from: `concept-${concept.id}`, to: node.id, concept: true });
      }
    });
  }
  nodes.forEach((node) => {
    getNodeGraphRelationIds(node, nodesById).forEach((targetId) => {
      edges.push({ from: targetId, to: node.id });
    });
  });
  nodes.forEach((node) => {
    [...getCallTargets(node, nodesById), ...getNodalMeta(node.content).relations.map((r) => r.targetId).filter((id) => nodesById.has(id))].forEach((targetId) => {
      if (targetId !== node.id && !edges.some((edge) => edge.from === node.id && edge.to === targetId)) {
        edges.push({ from: node.id, to: targetId });
      }
    });
  });
  return edges;
}

export default function GraphView({
  nodes,
  onSelectNode,
  onOpenNode,
  projectKey,
}: GraphViewProps) {
  const { t } = useLocale();
  const preferenceKey = `hisfuture:graph:concepts:${projectKey}`;
  const [showConcepts, setShowConcepts] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) !== "false";
    } catch {
      return true;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, PointPosition>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const defaults = layoutNodes(nodes, showConcepts, t);
  const points = defaults.map((point) => ({
    ...point,
    ...positions[point.id],
  }));
  const edges = buildEdges(nodes, showConcepts);
  const outgoingCallCounts = new Map<string, number>();
  edges.forEach((edge) => {
    if (!edge.concept) {
      outgoingCallCounts.set(
        edge.from,
        (outgoingCallCounts.get(edge.from) || 0) + 1,
      );
    }
  });
  const pointsById = new Map(points.map((point) => [point.id, point]));

  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, String(showConcepts));
    } catch {
    }
  }, [preferenceKey, showConcepts]);

  useEffect(() => {
    if (!canvasRef.current || defaults.length === 0) return;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = canvas.parentElement;
      setPan({
        x: (viewport?.clientWidth ?? canvas.offsetWidth) / 2 -
          (canvas.offsetWidth * zoom) / 2,
        y: (viewport?.clientHeight ?? canvas.offsetHeight) / 2 -
          (canvas.offsetHeight * zoom) / 2,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes.length, showConcepts]);

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current };
      defaults.forEach((point) => {
        if (!next[point.id]) next[point.id] = { x: point.x, y: point.y };
      });
      return next;
    });
  }, [nodes, showConcepts]);

  const movePoint = (event: React.PointerEvent<HTMLButtonElement>, point: GraphPoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const previous = lastPointerRef.current;
    if (!previous) return;
    const deltaX = ((event.clientX - previous.x) / rect.width) * CANVAS_WIDTH;
    const deltaY = ((event.clientY - previous.y) / rect.height) * CANVAS_HEIGHT;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 0.1) return;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = true;
    const connectedInfluences = new Map<string, number>();
    edges.forEach((edge) => {
      if (edge.concept) return;
      if (edge.from === point.id) {
        const weight = Math.min(0.58, 0.18 + (outgoingCallCounts.get(point.id) || 0) * 0.07);
        connectedInfluences.set(edge.to, Math.max(connectedInfluences.get(edge.to) || 0, weight));
      } else if (edge.to === point.id) {
        const leaderWeight = outgoingCallCounts.get(edge.from) || 0;
        const weight = Math.min(0.24, 0.07 + leaderWeight * 0.025);
        connectedInfluences.set(edge.from, Math.max(connectedInfluences.get(edge.from) || 0, weight));
      }
    });
    setPositions((current) => ({
      ...current,
      ...Object.fromEntries(
        [point.id, ...connectedInfluences.keys()].map((id) => {
          const source = current[id] ?? pointsById.get(id) ?? point;
          const influence = id === point.id ? 1 : connectedInfluences.get(id) || 0;
          return [id, {
            x: Math.max(45, Math.min(CANVAS_WIDTH - 45, source.x + deltaX * influence)),
            y: Math.max(45, Math.min(CANVAS_HEIGHT - 45, source.y + deltaY * influence)),
          }];
        }),
      ),
    }));
  };

  return (
    <section
      className={`graph-view${draggingId ? " graph-view--node-active" : ""}`}
      aria-label={t("graph.label")}
    >
      <div className="graph-view__toolbar">
        <div>
          <div className="graph-view__eyebrow">{t("graph.eyebrow")}</div>
          <h1>{t("graph.title")}</h1>
        </div>
        <div className="graph-view__menu-wrap">
          <button
            type="button"
            className="graph-view__menu-button"
            aria-label={t("graph.options")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            ≡
          </button>
          {menuOpen && (
            <div className="graph-view__menu" role="menu">
              <div className="graph-view__menu-title">{t("graph.layout")}</div>
              <label className="graph-view__toggle" role="menuitem">
                <input
                  type="checkbox"
                  checked={showConcepts}
                  onChange={(event) => setShowConcepts(event.target.checked)}
                />
                <span>{t("graph.concepts")}</span>
              </label>
            </div>
          )}
        </div>
      </div>
      {nodes.length === 0 ? (
        <div className="graph-view__empty">{t("graph.empty")}</div>
      ) : (
        <div
          ref={canvasRef}
          className="graph-view__canvas"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
          }}
          onWheel={(event) => {
            event.preventDefault();
            const previousZoom = zoom;
            const nextZoom = Math.max(
              MIN_ZOOM,
              Math.min(
                MAX_ZOOM,
                previousZoom + (event.deltaY < 0 ? 0.1 : -0.1),
              ),
            );
            if (nextZoom === previousZoom) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const originX = rect.left - pan.x;
            const originY = rect.top - pan.y;
            const localX = (event.clientX - originX - pan.x) / previousZoom;
            const localY = (event.clientY - originY - pan.y) / previousZoom;
            setPan({
              x: event.clientX - originX - localX * nextZoom,
              y: event.clientY - originY - localY * nextZoom,
            });
            setZoom(nextZoom);
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target instanceof Element &&
                event.target.closest(".graph-node"))
            ) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            panningRef.current = true;
            panStartRef.current = { x: event.clientX, y: event.clientY };
            panOriginRef.current = pan;
          }}
          onPointerMove={(event) => {
            if (!panningRef.current) return;
            setPan({
              x: panOriginRef.current.x + event.clientX - panStartRef.current.x,
              y: panOriginRef.current.y + event.clientY - panStartRef.current.y,
            });
          }}
          onPointerUp={(event) => {
            if (!panningRef.current) return;
            panningRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            panningRef.current = false;
          }}
        >
          <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
            {edges.map((edge, index) => {
              const from = pointsById.get(edge.from);
              const to = pointsById.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${edge.from}-${edge.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  vectorEffect="non-scaling-stroke"
                  className={edge.concept ? "graph-edge graph-edge--concept" : "graph-edge"}
                />
              );
            })}
          </svg>
          {points.map((point) => (
            <button
              key={point.id}
              type="button"
              className={`graph-node${point.concept ? " graph-node--concept" : ""}${point.category ? " graph-node--category" : ""}${draggingId === point.id ? " graph-node--active" : ""}`}
              style={{ left: `${(point.x / CANVAS_WIDTH) * 100}%`, top: `${(point.y / CANVAS_HEIGHT) * 100}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                movedRef.current = false;
                lastPointerRef.current = { x: event.clientX, y: event.clientY };
                setDraggingId(point.id);
              }}
              onPointerMove={(event) => {
                if (draggingId === point.id) {
                  movePoint(event, point);
                }
              }}
              onPointerUp={(event) => {
                if (draggingId === point.id) {
                  movePoint(event, point);
                  setDraggingId(null);
                  lastPointerRef.current = null;
                }
              }}
              onClick={() => {
                if (!point.concept && !movedRef.current) onSelectNode(point.id);
              }}
              onDoubleClick={() => {
                if (point.type !== "concepto") onOpenNode(point.id);
              }}
            >
              {point.type !== "concepto" && (
                point.imageSrc ? (
                  <img className="graph-node__image" src={point.imageSrc} alt="" />
                ) : (
                  <span className="graph-node__dot" style={{ backgroundColor: getNodeDefinition(point.type).color }} />
                )
              )}
              {point.concept && (
                <span
                  className="graph-node__dot graph-node__dot--concept"
                  style={{ backgroundColor: point.color }}
                />
              )}
              <strong
                style={{
                  color: getNodeDefinition(
                    point.type === "concepto" ? "pagina" : point.type,
                  ).color,
                  ...(point.concept ? { color: point.color } : {}),
                }}
              >
                {point.label}
              </strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
