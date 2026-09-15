import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { buildGraphProjection } from "./projection";
import {
  DEFAULT_GRAPH_USER_PREFERENCES,
  readGraphUserPreferences,
  writeGraphUserPreferences,
  type GraphUserPreferences,
} from "./preferences";
import { buildGraphRuntime, type GraphPosition } from "./runtime";
import { buildGraphScene } from "./scene";
import type { PixiGraphRenderer } from "./PixiGraphRenderer";
import type { GraphPoint, GraphRenderEdge } from "./runtime";
import type { BaseNodeType, ContextMenuState, NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { getNodeDisplayLabel } from "../nodes/registry";
import { NodeIcon } from "../nodes/NodeIcon";
import HisContextMenu, { type HisContextMenuItem } from "../components/HisContextMenu";
import LoreAddDialog from "../components/LoreAddDialog";
import { aggregateGraphEdgeFacts } from "./edgeFacts";
import settingsAsset from "../assets/original/ui/settings.svg";
import { getNodeDefinition } from "../defs/nodeTypes";

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
  onOpenNodeMenu: (menu: ContextMenuState) => void;
  projectKey: string;
  readOnly?: boolean;
  localRootId?: string;
}

function GraphRange({ label, value, minimum, maximum, step, outputValue, onChange }: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  outputValue?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="graph-view__range">
      <span><span>{label}</span><output>{outputValue ?? `${Math.round(value * 100)}%`}</output></span>
      <input type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function GraphView({ nodes, onSelectNode, onClearSelection, onOpenNode, onCreateNode, onOpenNodeMenu, projectKey, readOnly = false, localRootId }: GraphViewProps) {
  const { t } = useLocale();
  const [preferences, setPreferences] = useState<GraphUserPreferences>(() => readGraphUserPreferences(localStorage, projectKey));
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
  function updatePreference<K extends keyof GraphUserPreferences>(key: K, value: GraphUserPreferences[K]) {
    setPreferences((current) => current[key] === value ? current : { ...current, [key]: value });
  }
  const availableTypes = useMemo(
    () => Array.from(new Set(nodes.map((item) => item.type))).sort((first, second) =>
      getNodeDisplayLabel(first, t).localeCompare(getNodeDisplayLabel(second, t)),
    ),
    [nodes, t],
  );
  const toggleNodeType = (type: BaseNodeType, visible: boolean) => {
    setPreferences((current) => ({
      ...current,
      hiddenTypes: visible
        ? current.hiddenTypes.filter((item) => item !== type)
        : Array.from(new Set([...current.hiddenTypes, type])),
    }));
  };

  // Semantic work is low-frequency: interaction handlers never call this path.
  const connectedNodeIds = useMemo(() => {
    const semanticProjection = buildGraphProjection(nodes, { showTypes: false, translate: t });
    const connected = new Set<string>();
    semanticProjection.edges.forEach((edge) => {
      if (edge.kind === "grouping" || edge.targetMissing) return;
      connected.add(edge.from);
      connected.add(edge.to);
    });
    return connected;
  }, [nodes, t]);
  const localNodeIds = useMemo(() => {
    if (!localRootId) return null;
    const semanticProjection = buildGraphProjection(nodes, { showTypes: false, translate: t });
    const neighbors = new Map<string, Set<string>>();
    semanticProjection.edges.forEach((edge) => {
      if (edge.kind === "grouping" || edge.targetMissing) return;
      if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
      if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
      neighbors.get(edge.from)!.add(edge.to);
      neighbors.get(edge.to)!.add(edge.from);
    });
    const visible = new Set([localRootId]);
    let frontier = new Set([localRootId]);
    for (let level = 0; level < preferences.localDepth; level += 1) {
      const next = new Set<string>();
      frontier.forEach((id) => neighbors.get(id)?.forEach((neighbor) => {
        if (visible.has(neighbor)) return;
        visible.add(neighbor);
        next.add(neighbor);
      }));
      frontier = next;
      if (!frontier.size) break;
    }
    return visible;
  }, [localRootId, nodes, preferences.localDepth, t]);
  const visibleNodes = useMemo(() => {
    const query = preferences.searchQuery.trim().toLocaleLowerCase();
    return nodes.filter((item) =>
      (!localNodeIds || localNodeIds.has(item.id)) &&
      !preferences.hiddenTypes.includes(item.type) &&
      (preferences.showOrphans || connectedNodeIds.has(item.id) || item.id === localRootId) &&
      (!query || `${item.name} ${item.type}`.toLocaleLowerCase().includes(query)),
    );
  }, [connectedNodeIds, localNodeIds, nodes, preferences.hiddenTypes, preferences.searchQuery, preferences.showOrphans]);
  const projection = useMemo(
    () => buildGraphProjection(visibleNodes, { showTypes: preferences.showTypes, translate: t }),
    [preferences.showTypes, t, visibleNodes],
  );
  const runtime = useMemo(
    () => buildGraphRuntime(projection, positionCacheRef.current),
    [projection, projectKey],
  );
  const scene = useMemo(() => buildGraphScene(runtime, {
    showIcons: preferences.showIcons,
    showImages: preferences.showImages,
    showArrows: preferences.showArrows,
    labelThreshold: preferences.labelThreshold,
    nodeScale: preferences.nodeScale,
    linkScale: preferences.linkScale,
    scalePagesByContent: preferences.scalePagesByContent,
    scaleImagesByDimensions: preferences.scaleImagesByDimensions,
    scaleNodesWithZoom: preferences.scaleNodesWithZoom,
  }), [preferences.labelThreshold, preferences.linkScale, preferences.nodeScale, preferences.scaleImagesByDimensions, preferences.scaleNodesWithZoom, preferences.scalePagesByContent, preferences.showArrows, preferences.showIcons, preferences.showImages, runtime]);
  const simulationTuning = useMemo(() => ({
    centerForce: preferences.centerForce,
    repelForce: preferences.repelForce,
    linkForce: preferences.linkForce,
    linkDistance: preferences.linkDistance,
  }), [preferences.centerForce, preferences.linkDistance, preferences.linkForce, preferences.repelForce]);
  const latestSceneRef = useRef(scene);
  const latestSimulationTuningRef = useRef(simulationTuning);
  latestSceneRef.current = scene;
  latestSimulationTuningRef.current = simulationTuning;

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
      onNodeContextMenu: (id, clientX, clientY) => {
        if (!readOnly) onOpenNodeMenu({ context: "types", nodeId: id, x: clientX, y: clientY });
      },
      onHoverNode: (point, clientX = 0, clientY = 0) => setHoveredNode(point ? { point, clientX, clientY } : null),
      onHoverEdge: (edge, clientX = 0, clientY = 0) => setHoveredEdge(edge ? { edge, clientX, clientY } : null),
      onBackgroundContextMenu: (clientX, clientY, worldX, worldY) => {
        if (!readOnly) setContextMenu({ x: clientX, y: clientY, worldX, worldY });
      },
    })).then((renderer) => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.setScene(latestSceneRef.current, positionCacheRef.current);
      renderer.setSimulationTuning(latestSimulationTuningRef.current);
    }).catch((error) => {
      if (!cancelled) console.error("Graph renderer failed to initialize", error);
    });
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    rendererRef.current?.setScene(scene, positionCacheRef.current);
  }, [scene]);

  useEffect(() => rendererRef.current?.setSimulationTuning(simulationTuning), [simulationTuning]);
  useEffect(() => setPreferences(readGraphUserPreferences(localStorage, projectKey)), [projectKey]);
  useEffect(() => writeGraphUserPreferences(localStorage, projectKey, preferences), [preferences, projectKey]);
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
          ><img src={settingsAsset} alt="" /></button>
          {menuOpen && (
            <div className="graph-view__menu" role="dialog" aria-label={t("graph.options")}>
              <div className="graph-view__menu-heading">
                <strong>{t("graph.settings")}</strong>
                <button type="button" onClick={() => setPreferences({ ...DEFAULT_GRAPH_USER_PREFERENCES })}>{t("graph.reset")}</button>
              </div>
              <div className="graph-view__menu-title">{t("graph.filters")}</div>
              {localRootId && <GraphRange label={t("graph.localDepth")} value={preferences.localDepth} minimum={1} maximum={5} step={1} outputValue={String(preferences.localDepth)} onChange={(value) => updatePreference("localDepth", value)} />}
              <input
                className="graph-view__search"
                type="search"
                value={preferences.searchQuery}
                placeholder={t("graph.search")}
                onChange={(event) => updatePreference("searchQuery", event.target.value)}
              />
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.showTypes} onChange={(event) => updatePreference("showTypes", event.target.checked)} />
                <span>{t("graph.types")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.showOrphans} onChange={(event) => updatePreference("showOrphans", event.target.checked)} />
                <span>{t("graph.orphans")}</span>
              </label>
              <div className="graph-view__menu-subtitle">{t("graph.nodeTypes")}</div>
              <div className="graph-view__type-filters">
                {availableTypes.map((type) => (
                  <label className="graph-view__toggle graph-view__type-toggle" key={type} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties}>
                    <input type="checkbox" checked={!preferences.hiddenTypes.includes(type)} onChange={(event) => toggleNodeType(type, event.target.checked)} />
                    <NodeIcon type={type} />
                    <span>{getNodeDisplayLabel(type, t)}</span>
                  </label>
                ))}
              </div>
              <div className="graph-view__menu-title">{t("graph.display")}</div>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.showArrows} onChange={(event) => updatePreference("showArrows", event.target.checked)} />
                <span>{t("graph.arrows")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.showIcons} onChange={(event) => updatePreference("showIcons", event.target.checked)} />
                <span>{t("graph.icons")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.showImages} onChange={(event) => updatePreference("showImages", event.target.checked)} />
                <span>{t("graph.images")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.scalePagesByContent} onChange={(event) => updatePreference("scalePagesByContent", event.target.checked)} />
                <span>{t("graph.scalePagesByContent")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.scaleImagesByDimensions} onChange={(event) => updatePreference("scaleImagesByDimensions", event.target.checked)} />
                <span>{t("graph.scaleImagesByDimensions")}</span>
              </label>
              <label className="graph-view__toggle" role="menuitem">
                <input type="checkbox" checked={preferences.scaleNodesWithZoom} onChange={(event) => updatePreference("scaleNodesWithZoom", event.target.checked)} />
                <span>{t("graph.scaleNodesWithZoom")}</span>
              </label>
              <GraphRange label={t("graph.textFade")} value={preferences.labelThreshold} minimum={0} maximum={1} step={0.05} onChange={(value) => updatePreference("labelThreshold", value)} />
              <GraphRange label={t("graph.nodeSize")} value={preferences.nodeScale} minimum={0.55} maximum={2} step={0.05} onChange={(value) => updatePreference("nodeScale", value)} />
              <GraphRange label={t("graph.linkThickness")} value={preferences.linkScale} minimum={0.45} maximum={2.5} step={0.05} onChange={(value) => updatePreference("linkScale", value)} />
              <div className="graph-view__menu-title">{t("graph.forces")}</div>
              <GraphRange label={t("graph.centerForce")} value={preferences.centerForce} minimum={0} maximum={2} step={0.05} onChange={(value) => updatePreference("centerForce", value)} />
              <GraphRange label={t("graph.repelForce")} value={preferences.repelForce} minimum={0} maximum={2} step={0.05} onChange={(value) => updatePreference("repelForce", value)} />
              <GraphRange label={t("graph.linkForce")} value={preferences.linkForce} minimum={0} maximum={2} step={0.05} onChange={(value) => updatePreference("linkForce", value)} />
              <GraphRange label={t("graph.linkDistance")} value={preferences.linkDistance} minimum={0.5} maximum={2} step={0.05} onChange={(value) => updatePreference("linkDistance", value)} />
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
      {!readOnly && contextMenu && (
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
      {!readOnly && createPosition && (
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
          {(hoveredNode.point.imageSrc || hoveredNode.point.customVisual?.kind === "image" || hoveredNode.point.iconSrc) && (
            <div className="graph-view__hover-preview-frame" style={{ borderColor: hoveredNode.point.color }}>
              <img className="graph-view__hover-preview" src={hoveredNode.point.imageSrc || (hoveredNode.point.customVisual?.kind === "image" ? hoveredNode.point.customVisual.src : hoveredNode.point.iconSrc)} alt="" />
            </div>
          )}
          <div className="graph-view__hover-card" style={{ borderColor: hoveredNode.point.color }}>
            <div className="graph-view__hover-name">{hoveredNode.point.label}</div>
            {hoveredNode.point.nodeType && (
              <div className="graph-view__hover-type" style={{ color: hoveredNode.point.color }}>
                <NodeIcon type={hoveredNode.point.nodeType} source={hoveredNode.point.iconSrc} visual={hoveredNode.point.customVisual} />
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
