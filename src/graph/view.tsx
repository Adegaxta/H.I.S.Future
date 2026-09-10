import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraphProjection } from "./projection";
import { readGraphBooleanPreference, writeGraphBooleanPreference } from "./preferences";
import { buildGraphRuntime, type GraphPosition } from "./runtime";
import { buildGraphScene } from "./scene";
import type { PixiGraphRenderer } from "./PixiGraphRenderer";
import type { GraphPoint, GraphRenderEdge } from "./runtime";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { getNodeDisplayLabel } from "../nodes/registry";
import { NodeIcon } from "../nodes/NodeIcon";
import HisContextMenu, { type HisContextMenuItem } from "../components/HisContextMenu";
import LoreAddDialog from "../components/LoreAddDialog";
import { aggregateGraphEdgeFacts } from "./edgeFacts";

interface HoveredGraphNode {
  point: GraphPoint;
  clientX: number;
  clientY: number;
}

interface HoveredGraphEdge {
  edge: GraphRenderEdge;
  clientX: number;
  clientY: number;
}

interface GraphViewProps {
  nodes: NodeItem[];
  onSelectNode: (id: string) => void;
  onClearSelection: () => void;
  onOpenNode: (id: string) => void;
  onCreateNode: (name: string, type: BaseNodeType, position: GraphPosition) => string;
  projectKey: string;
}

export default function GraphView({ nodes, onSelectNode, onClearSelection, onOpenNode, onCreateNode, projectKey }: GraphViewProps) {
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
  const [hoveredEdge, setHoveredEdge] = useState<HoveredGraphEdge | null>(null);
  const [focusedEdge, setFocusedEdge] = useState<HoveredGraphEdge | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const [createPosition, setCreatePosition] = useState<GraphPosition | null>(null);
  const rendererHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiGraphRenderer | null>(null);
  const callbacksRef = useRef({ onSelectNode, onClearSelection, onOpenNode });
  callbacksRef.current = { onSelectNode, onClearSelection, onOpenNode };
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
      onSelectNode: (id) => {
        setFocusedEdge(null);
        callbacksRef.current.onSelectNode(id);
      },
      onSelectEdge: (edge, clientX = 0, clientY = 0) => setFocusedEdge({ edge, clientX, clientY }),
      onClearSelection: () => {
        setFocusedEdge(null);
        callbacksRef.current.onClearSelection();
      },
      onOpenNode: (id) => callbacksRef.current.onOpenNode(id),
      onHoverNode: (point, clientX = 0, clientY = 0) => setHoveredNode(point ? { point, clientX, clientY } : null),
      onHoverEdge: (edge, clientX = 0, clientY = 0) => setHoveredEdge(edge ? { edge, clientX, clientY } : null),
      onBackgroundContextMenu: (clientX, clientY, worldX, worldY) => setContextMenu({ x: clientX, y: clientY, worldX, worldY }),
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
      {(hoveredEdge ?? focusedEdge) && (
        <div
          className="graph-view__edge-hover-stack"
          role="status"
          style={{
            left: Math.min((hoveredEdge ?? focusedEdge)!.clientX + 18, Math.max(12, window.innerWidth - 320)),
            top: Math.min((hoveredEdge ?? focusedEdge)!.clientY + 18, Math.max(12, window.innerHeight - 220)),
          }}
        >
          <div className="graph-view__edge-hover-card">
            <div className="graph-view__edge-hover-path">{(hoveredEdge ?? focusedEdge)!.edge.from.label} → {(hoveredEdge ?? focusedEdge)!.edge.to.label}</div>
            {aggregateGraphEdgeFacts((hoveredEdge ?? focusedEdge)!.edge.facts).map(({ fact, count }, index) => (
              <div className="graph-view__edge-fact" key={`${fact.kind}-${fact.role ?? "none"}-${index}`}>
                <strong>{fact.kind === "mention-reference" ? t("graph.edge.mention") : fact.kind === "nodal-relation" ? t("graph.edge.relation") : fact.kind === "grouping" ? t("graph.edge.grouping") : t("graph.edge.derived")}</strong>
                {count > 1 && <span className="graph-view__edge-fact-count">x{count}</span>}
                {fact.role && <span>role: {fact.role}</span>}
                <span>{fact.provenance === "nodal-metadata" ? t("graph.edge.provenance.metadata") : fact.provenance === "editor-content" ? t("graph.edge.provenance.editor") : fact.provenance === "node-registry" ? t("graph.edge.provenance.registry") : t("graph.edge.provenance.runtime")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {contextMenu && (
        <HisContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[{
            id: "create-node",
            label: t("nodal.create"),
            onSelect: () => {
              setCreatePosition({ x: contextMenu.worldX, y: contextMenu.worldY });
              setContextMenu(null);
            },
          } satisfies HisContextMenuItem]}
          onClose={() => setContextMenu(null)}
        />
      )}
      {createPosition && (
        <LoreAddDialog
          nodes={nodes}
          initialMode="new"
          title={t("graph.createNode")}
          onAdd={() => undefined}
          onCreate={(name, type) => {
            const id = onCreateNode(name, type, createPosition);
            positionCacheRef.current.set(id, createPosition);
            setCreatePosition(null);
          }}
          onClose={() => setCreatePosition(null)}
        />
      )}
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
