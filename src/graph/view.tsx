import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraphProjection } from "./projection";
import { readGraphBooleanPreference, writeGraphBooleanPreference } from "./preferences";
import { buildGraphRuntime, GRAPH_CANVAS_HEIGHT, GRAPH_CANVAS_WIDTH, type GraphPosition } from "./runtime";
import { useGraphInteraction } from "./useGraphInteraction";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon } from "../nodes/NodeIcon";

interface GraphViewProps {
  nodes: NodeItem[];
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
  projectKey: string;
}

export default function GraphView({ nodes, onSelectNode, onOpenNode, projectKey }: GraphViewProps) {
  const { t } = useLocale();
  const typesPreferenceKey = `hisfuture:graph:types:${projectKey}`;
  const iconsPreferenceKey = `hisfuture:graph:icons:${projectKey}`;
  const imagesPreferenceKey = `hisfuture:graph:images:${projectKey}`;
  const legacyTypesPreferenceKey = `hisfuture:graph:concepts:${projectKey}`;
  const [showTypes, setShowTypes] = useState(() => readGraphBooleanPreference(localStorage, typesPreferenceKey, false, legacyTypesPreferenceKey));
  const [showIcons, setShowIcons] = useState(() => readGraphBooleanPreference(localStorage, iconsPreferenceKey, false));
  const [showImages, setShowImages] = useState(() => readGraphBooleanPreference(localStorage, imagesPreferenceKey, true));
  const [showIntro, setShowIntro] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const positionCacheRef = useRef(new Map<string, GraphPosition>());
  const positionCacheProjectRef = useRef(projectKey);
  if (positionCacheProjectRef.current !== projectKey) {
    positionCacheProjectRef.current = projectKey;
    positionCacheRef.current.clear();
  }

  // Semantic work is low-frequency: interaction handlers never call this path.
  const projection = useMemo(
    () => buildGraphProjection(nodes, { showTypes, translate: t }),
    [nodes, showTypes, t],
  );
  const runtime = useMemo(
    () => buildGraphRuntime(projection, positionCacheRef.current),
    [projection],
  );
  const interaction = useGraphInteraction({
    canvasRef,
    rootRef,
    runtime,
    positionCache: positionCacheRef.current,
  });

  useEffect(() => writeGraphBooleanPreference(localStorage, typesPreferenceKey, showTypes), [typesPreferenceKey, showTypes]);
  useEffect(() => writeGraphBooleanPreference(localStorage, iconsPreferenceKey, showIcons), [iconsPreferenceKey, showIcons]);
  useEffect(() => writeGraphBooleanPreference(localStorage, imagesPreferenceKey, showImages), [imagesPreferenceKey, showImages]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setShowIntro(false), 4200);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section ref={rootRef} className="graph-view" aria-label={t("graph.label")}>
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
          >≡</button>
          {menuOpen && (
            <div className="graph-view__menu" role="menu">
              <div className="graph-view__menu-title">{t("graph.layout")}</div>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={showTypes} onChange={(event) => setShowTypes(event.target.checked)} />
                <span>{t("graph.types")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={showIcons} onChange={(event) => setShowIcons(event.target.checked)} />
                <span>{t("graph.icons")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={showImages} onChange={(event) => setShowImages(event.target.checked)} />
                <span>{t("graph.images")}</span>
              </label>
            </div>
          )}
        </div>
      </div>
      {showIntro && <div className="graph-view__intro" role="status">{t("graph.intro")}</div>}
      {nodes.length === 0 ? (
        <div className="graph-view__empty">{t("graph.empty")}</div>
      ) : (
        <div
          ref={canvasRef}
          className="graph-view__canvas"
          onWheel={interaction.onCanvasWheel}
          onPointerDown={interaction.onCanvasPointerDown}
          onPointerMove={interaction.onCanvasPointerMove}
          onPointerUp={interaction.onCanvasPointerUp}
          onPointerCancel={interaction.onCanvasPointerCancel}
        >
          <svg viewBox={`0 0 ${GRAPH_CANVAS_WIDTH} ${GRAPH_CANVAS_HEIGHT}`} aria-hidden="true">
            {runtime.edges.map(({ id, edge, from, to }) => (
              <line
                ref={(element) => interaction.setEdgeElement(id, element)}
                key={id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                vectorEffect="non-scaling-stroke"
                className={edge.kind === "grouping" ? "graph-edge graph-edge--type-hub" : "graph-edge"}
              />
            ))}
          </svg>
          {runtime.points.map((point) => (
            <button
              ref={(element) => interaction.setNodeElement(point.id, element)}
              key={point.id}
              data-graph-point-id={point.id}
              type="button"
              className={`graph-node${point.kind === "type-hub" ? " graph-node--type-hub" : ""}`}
              style={{
                left: `${(point.x / GRAPH_CANVAS_WIDTH) * 100}%`,
                top: `${(point.y / GRAPH_CANVAS_HEIGHT) * 100}%`,
                color: point.color,
              }}
              onPointerDown={(event) => interaction.onNodePointerDown(event, point.id)}
              onPointerMove={(event) => interaction.onNodePointerMove(event, point.id)}
              onPointerUp={interaction.onNodePointerUp}
              onPointerCancel={interaction.onNodePointerCancel}
              onClick={() => {
                if (point.kind === "node" && interaction.shouldSelectAfterClick()) onSelectNode(point.id);
              }}
              onDoubleClick={() => {
                if (point.kind === "node") onOpenNode(point.id);
              }}
            >
              {point.kind === "node" && (
                point.imageSrc && showImages ? (
                  <img className="graph-node__image" src={point.imageSrc} alt="" />
                ) : showIcons ? (
                  <NodeIcon type={point.nodeType!} className="graph-node__icon" />
                ) : (
                  <span className="graph-node__dot" style={{ backgroundColor: point.color }} />
                )
              )}
              {point.kind === "type-hub" && point.nodeType && (
                <NodeIcon type={point.nodeType} className="graph-node__icon graph-node__icon--hub" />
              )}
              <strong style={{ color: point.color }}>{point.label}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
