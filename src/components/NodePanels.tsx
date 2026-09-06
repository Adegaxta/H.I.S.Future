import { useMemo, useState, type CSSProperties } from "react";
import type { ContextMenuState, NodeItem, RenderNodeType } from "../types/nodes";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { getEffectiveNodeType, opensNodeViewOnClick } from "../utils/nodeTree";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon, SidebarIcon } from "./SidebarIcon";
import { useSearchReveal } from "../hooks/useSearchReveal";

interface NodePanelsProps {
  panel: "recent" | "types";
  nodes: NodeItem[];
  recentNodes: NodeItem[];
  recentActivity: Record<string, number>;
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  onContextMenu: (menu: ContextMenuState) => void;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export default function NodePanels({ panel, nodes, recentNodes, recentActivity, selectedId, query, onSelect, onContextMenu }: NodePanelsProps) {
  const { locale, t } = useLocale();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = (node: NodeItem) => node.name.toLocaleLowerCase(locale).includes(normalizedQuery);
  const searchRef = useSearchReveal(normalizedQuery, `${panel}:${(panel === "recent" ? recentNodes : nodes).filter(matches).map((node) => node.id).join(",")}`);
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

  if (panel === "recent") return (
    <div ref={searchRef} className="node-panels node-panels--recent">
      {recentGroups.length === 0 ? <div className="node-panels__empty">{t("sidebar.noRecent")}</div> : recentGroups.map(([label, items]) => (
        <section className="recent-group" key={label}>
          <h3 className={normalizedQuery && !items.some(matches) ? "is-search-dimmed" : ""}>{label}</h3>
          {items.map((node) => <NodeRow key={node.id} node={node} nodes={nodes} selected={node.id === selectedId} onSelect={onSelect} context={panel} onContextMenu={onContextMenu} searchMatch={normalizedQuery ? matches(node) : undefined} />)}
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
            <button className={`type-group__heading ${normalizedQuery && !hasMatch ? "is-search-dimmed" : ""}`} type="button" onClick={() => setCollapsed((current) => ({ ...current, [definition.type]: !current[definition.type] }))}>
              <NodeIcon type={definition.type as RenderNodeType} />
              <span>{getNodeDisplayLabel(definition.type, t)}</span>
              <span className="type-group__count">{items.length}</span>
              <SidebarIcon name={isCollapsed ? "arrow-close" : "arrow-open"} className="type-group__chevron" />
            </button>
            {!isCollapsed && items.map((node) => <NodeRow key={node.id} node={node} nodes={nodes} selected={node.id === selectedId} onSelect={onSelect} context={panel} onContextMenu={onContextMenu} compact searchMatch={normalizedQuery ? matches(node) : undefined} />)}
          </section>
        );
      })}
    </div>
  );
}

function NodeRow({ node, nodes, selected, onSelect, context, onContextMenu, compact = false, searchMatch }: { node: NodeItem; nodes: NodeItem[]; selected: boolean; compact?: boolean; searchMatch?: boolean; onSelect: (id: string) => void; context: "recent" | "types"; onContextMenu: (menu: ContextMenuState) => void }) {
  const type = getEffectiveNodeType(nodes, node);
  return (
    <button type="button" data-search-match={searchMatch} className={`context-node-row ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""} ${searchMatch === false ? "is-search-dimmed" : ""}`} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties} onClick={() => { if (opensNodeViewOnClick(node)) onSelect(node.id); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu({ context, nodeId: node.id, x: event.clientX, y: event.clientY, extended: event.shiftKey }); }} title={node.name}>
      <NodeIcon type={type} />
      <span className="context-node-row__name">{node.name}</span>
    </button>
  );
}
