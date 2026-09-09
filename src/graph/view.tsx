import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraphProjection } from "./projection";
import { readGraphBooleanPreference, writeGraphBooleanPreference } from "./preferences";
import { buildGraphRuntime, type GraphPosition } from "./runtime";
import { buildGraphScene } from "./scene";
import type { PixiGraphRenderer } from "./PixiGraphRenderer";
import type { GraphPoint } from "./runtime";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { getNodeDisplayLabel } from "../nodes/registry";
import { NodeIcon } from "../nodes/NodeIcon";

interface HoveredGraphNode {
  point: GraphPoint;
  clientX: number;
  clientY: number;
}

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
  const [hoveredNode, setHoveredNode] = useState<HoveredGraphNode | null>(null);
  const rendererHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiGraphRenderer | null>(null);
  const callbacksRef = useRef({ onSelectNode, onOpenNode });
  callbacksRef.current = { onSelectNode, onOpenNode };
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
    [projection, projectKey],
  );
  const scene = useMemo(() => buildGraphScene(runtime, { showIcons, showImages }), [runtime, showIcons, showImages]);
  const latestSceneRef = useRef(scene);
  latestSceneRef.current = scene;

  useEffect(() => {
    const host = rendererHostRef.current;
    if (!host) return;
    let cancelled = false;
    void import("./PixiGraphRenderer").then(({ PixiGraphRenderer }) => PixiGraphRenderer.create(host, {
      onSelectNode: (id) => callbacksRef.current.onSelectNode(id),
      onOpenNode: (id) => callbacksRef.current.onOpenNode(id),
      onHoverNode: (point, clientX = 0, clientY = 0) => setHoveredNode(point ? { point, clientX, clientY } : null),
    })).then((renderer) => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.setScene(latestSceneRef.current, positionCacheRef.current);
    }).catch((error) => {
      if (!cancelled) console.error("Graph renderer failed to initialize", error);
    });
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setScene(scene, positionCacheRef.current);
  }, [scene]);

  useEffect(() => writeGraphBooleanPreference(localStorage, typesPreferenceKey, showTypes), [typesPreferenceKey, showTypes]);
  useEffect(() => writeGraphBooleanPreference(localStorage, iconsPreferenceKey, showIcons), [iconsPreferenceKey, showIcons]);
  useEffect(() => writeGraphBooleanPreference(localStorage, imagesPreferenceKey, showImages), [imagesPreferenceKey, showImages]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setShowIntro(false), 4200);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="graph-view" aria-label={t("graph.label")}>
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
      <div ref={rendererHostRef} className="graph-view__renderer" />
      {hoveredNode && (
        <div
          className="graph-view__hover-stack"
          role="status"
          style={{
            left: Math.min(hoveredNode.clientX + 18, Math.max(12, window.innerWidth - 292)),
            top: Math.min(hoveredNode.clientY + 18, Math.max(12, window.innerHeight - 190)),
          }}
        >
          {hoveredNode.point.imageSrc && (
            <div className="graph-view__hover-preview-frame" style={{ borderColor: hoveredNode.point.color }}>
              <img className="graph-view__hover-preview" src={hoveredNode.point.imageSrc} alt="" />
            </div>
          )}
          <div className="graph-view__hover-card" style={{ borderColor: hoveredNode.point.color }}>
            <div className="graph-view__hover-name">{hoveredNode.point.label}</div>
            {hoveredNode.point.nodeType && (
              <div className="graph-view__hover-type" style={{ color: hoveredNode.point.color }}>
                <NodeIcon type={hoveredNode.point.nodeType} />
                <span>{getNodeDisplayLabel(hoveredNode.point.nodeType, t)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {nodes.length === 0 && <div className="graph-view__empty">{t("graph.empty")}</div>}
    </section>
  );
}
