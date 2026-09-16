import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { ContextMenuState, NodeItem, RenderNodeType } from "../../types/nodes";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../../defs/nodeTypes";
import { opensNodeViewOnClick } from "../../utils/nodeTree";
import { useLocale } from "../../i18n/LocaleContext";
import { UiIcon } from "../../ui/Icon";
import { NodeIcon } from "../../nodes/NodeIcon";
import { PrimaryNodeName } from "../../nodes/PrimaryNodeName";
import { buildNodeCustomVisuals } from "../../nodes/nodeIconSource";
import type { ResolvedNodeVisual } from "../../nodes/visuals/types";
import { useSearchReveal } from "../../hooks/useSearchReveal";
import { selectLoreRange } from "../../utils/loreTree";
import {
  nodeTypePanelStorageKey,
  parseCollapsedNodeTypes,
  serializeCollapsedNodeTypes,
} from "../../utils/nodeTypePanelState";

interface NodePanelsProps {
  projectKey: string;
  panel: "recent" | "types";
  nodes: NodeItem[];
  recentNodes: NodeItem[];
  recentActivity: Record<string, number>;
  selectedId: string | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  query: string;
  onSelect: (id: string) => void;
  onContextMenu: (menu: ContextMenuState) => void;
  onCreateType: (type: import("../../types/nodes").BaseNodeType) => void;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export default function NodePanels({ projectKey, panel, nodes, recentNodes, recentActivity, selectedId, selectedIds, onSelectionChange, query, onSelect, onContextMenu, onCreateType }: NodePanelsProps) {
  const { locale, t } = useLocale();
  const collapsedStorageKey = nodeTypePanelStorageKey(projectKey);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return parseCollapsedNodeTypes(localStorage.getItem(collapsedStorageKey));
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageKey, serializeCollapsedNodeTypes(collapsed));
    } catch (error) {
      console.warn("No se pudo guardar el estado de Tipos de Nodo.", error);
    }
  }, [collapsed, collapsedStorageKey]);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = (node: NodeItem) => node.name.toLocaleLowerCase(locale).includes(normalizedQuery);
  const searchRef = useSearchReveal(normalizedQuery, `${panel}:${(panel === "recent" ? recentNodes : nodes).filter(matches).map((node) => node.id).join(",")}`);
  const selectedType = nodes.find((node) => node.id === selectedId)?.type;
  const parentIds = useMemo(() => new Set(nodes.map((node) => node.parentId).filter(Boolean)), [nodes]);
  const customVisuals = useMemo(() => buildNodeCustomVisuals(nodes), [nodes]);
  const selectionAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedIds.length) selectionAnchor.current = null;
  }, [selectedIds]);
  useEffect(() => {
    if (!selectedId || !selectedType) return;
    if (panel === "types") {
      setCollapsed((current) => current[selectedType] ? { ...current, [selectedType]: false } : current);
    }
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const row = Array.from(searchRef.current?.querySelectorAll<HTMLElement>("[data-node-id]") ?? [])
          .find((element) => element.dataset.nodeId === selectedId);
        row?.scrollIntoView({ block: "nearest" });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [panel, searchRef, selectedId, selectedType]);
  const recentGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const yesterday = today - 86_400_000;
    const groups = new Map<string, NodeItem[]>();
    recentNodes.forEach((node) => {
      const timestamp = recentActivity[node.id] || Date.now();
      const day = startOfDay(new Date(timestamp));
      const label = day === today ? t("sidebar.today") : day === yesterday ? t("sidebar.yesterday") : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(timestamp).toLocaleUpperCase(locale);
      groups.set(label, [...(groups.get(label) ?? []), node]);
    });
    return [...groups.entries()];
  }, [locale, recentActivity, recentNodes, t]);
  const panelNodes = panel === "recent" ? recentGroups.flatMap(([, items]) => items) : nodes;
  const selectPanelNode = (node: NodeItem, event: MouseEvent) => {
    const next = selectLoreRange(panelNodes.map((item) => item.id), selectedIds, selectionAnchor.current, node.id, event.ctrlKey || event.metaKey, event.shiftKey);
    onSelectionChange(next);
    if (!event.shiftKey) selectionAnchor.current = node.id;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (opensNodeViewOnClick(node)) onSelect(node.id);
  };

  if (panel === "recent") return (
    <div ref={searchRef} className="node-panels node-panels--recent">
      {recentGroups.length === 0 ? <div className="node-panels__empty">{t("sidebar.noRecent")}</div> : recentGroups.map(([label, items]) => (
        <section className="recent-group" key={label}>
          <h3 className={normalizedQuery && !items.some(matches) ? "is-search-dimmed" : ""}>{label}</h3>
          {items.map((node) => <NodeRow key={node.id} node={node} visual={customVisuals.get(node.id)} hasChildren={parentIds.has(node.id)} selected={selectedIds.length ? selectedIds.includes(node.id) : node.id === selectedId} onSelect={selectPanelNode} context={panel} onContextMenu={onContextMenu} searchMatch={normalizedQuery ? matches(node) : undefined} />)}
        </section>
      ))}
    </div>
  );

  return (
    <div ref={searchRef} className="node-panels node-panels--types">
      {NODE_REGISTRY.visibleInTypePanel().map((definition) => {
        const items = nodes.filter((node) => node.type === definition.type);
        const hasMatch = items.some(matches);
        const isCollapsed = collapsed[definition.type] && !(normalizedQuery && hasMatch);
        return (
          <section className="type-group" key={definition.type} style={{ "--node-color": definition.color } as CSSProperties}>
            <div className={`type-group__heading ${normalizedQuery && !hasMatch ? "is-search-dimmed" : ""}`}>
              <button className="type-group__toggle" type="button" onClick={() => setCollapsed((current) => ({ ...current, [definition.type]: !current[definition.type] }))}>
                <NodeIcon type={definition.type as RenderNodeType} />
                <span>{getNodeDisplayLabel(definition.type, t)}</span>
                <span className="type-group__count">{items.length}</span>
              </button>
              {definition.creation.available && <button
                className="type-group__add"
                type="button"
                title={t("panels.createType", { type: getNodeDisplayLabel(definition.type, t) })}
                aria-label={t("panels.createType", { type: getNodeDisplayLabel(definition.type, t) })}
                onClick={() => onCreateType(definition.type)}
              >
                +
              </button>}
              <button className="type-group__chevron-button" type="button" aria-label={t(isCollapsed ? "panels.expand" : "panels.collapse")} onClick={() => setCollapsed((current) => ({ ...current, [definition.type]: !current[definition.type] }))}>
                <UiIcon name={isCollapsed ? "arrow-close" : "arrow-open"} className="type-group__chevron" />
              </button>
            </div>
            {!isCollapsed && items.map((node) => <NodeRow key={node.id} node={node} visual={customVisuals.get(node.id)} hasChildren={parentIds.has(node.id)} selected={selectedIds.length ? selectedIds.includes(node.id) : node.id === selectedId} onSelect={selectPanelNode} context={panel} onContextMenu={onContextMenu} compact searchMatch={normalizedQuery ? matches(node) : undefined} />)}
          </section>
        );
      })}
    </div>
  );
}
function NodeRow({ node, visual, hasChildren, selected, onSelect, context, onContextMenu, compact = false, searchMatch }: { node: NodeItem; visual?: ResolvedNodeVisual; hasChildren: boolean; selected: boolean; compact?: boolean; searchMatch?: boolean; onSelect: (node: NodeItem, event: MouseEvent) => void; context: "recent" | "types"; onContextMenu: (menu: ContextMenuState) => void }) {
  const type: RenderNodeType = node.type === "pagina" && hasChildren ? "pagina-carpeta" : node.type;
  return (
    <button type="button" data-node-id={node.id} data-search-match={searchMatch} className={`context-node-row ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""} ${searchMatch === false ? "is-search-dimmed" : ""}`} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties} onClick={(event) => onSelect(node, event)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu({ context, nodeId: node.id, x: event.clientX, y: event.clientY, extended: event.shiftKey }); }} title={node.name}>
      <NodeIcon type={type} visual={visual} />
      <PrimaryNodeName node={node} className="context-node-row__name" />
    </button>
  );
}
