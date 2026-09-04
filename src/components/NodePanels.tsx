import { useMemo, useState, type CSSProperties } from "react";
import type { NodeItem, RenderNodeType } from "../types/nodes";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon, SidebarIcon } from "./SidebarIcon";

interface NodePanelsProps {
  panel: "recent" | "types";
  nodes: NodeItem[];
  recentNodes: NodeItem[];
  recentActivity: Record<string, number>;
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export default function NodePanels({ panel, nodes, recentNodes, recentActivity, selectedId, query, onSelect }: NodePanelsProps) {
  const { locale, t } = useLocale();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = (node: NodeItem) => node.name.toLocaleLowerCase(locale).includes(normalizedQuery);
  const recentGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const yesterday = today - 86_400_000;
    const groups = new Map<string, NodeItem[]>();
    recentNodes.filter(matches).forEach((node) => {
      const timestamp = recentActivity[node.id] || Date.now();
      const day = startOfDay(new Date(timestamp));
      const label = day === today ? t("sidebar.today") : day === yesterday ? t("sidebar.yesterday") : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(timestamp).toLocaleUpperCase(locale);
      groups.set(label, [...(groups.get(label) ?? []), node]);
    });
    return [...groups.entries()];
  }, [locale, normalizedQuery, recentActivity, recentNodes, t]);

  if (panel === "recent") return (
    <div className="node-panels node-panels--recent">
      {recentGroups.length === 0 ? <div className="node-panels__empty">{t("sidebar.noRecent")}</div> : recentGroups.map(([label, items]) => (
        <section className="recent-group" key={label}>
          <h3>{label}</h3>
          {items.map((node) => <NodeRow key={node.id} node={node} nodes={nodes} selected={node.id === selectedId} onSelect={onSelect} />)}
        </section>
      ))}
    </div>
  );

  return (
    <div className="node-panels node-panels--types">
      {NODE_REGISTRY.visibleInTypePanel().map((definition) => {
        const items = nodes.filter((node) => node.type === definition.type && matches(node));
        const isCollapsed = collapsed[definition.type];
        return (
          <section className="type-group" key={definition.type} style={{ "--node-color": definition.color } as CSSProperties}>
            <button className="type-group__heading" type="button" onClick={() => setCollapsed((current) => ({ ...current, [definition.type]: !current[definition.type] }))}>
              <NodeIcon type={definition.type as RenderNodeType} />
              <span>{getNodeDisplayLabel(definition.type, t)}</span>
              <span className="type-group__count">{items.length}</span>
              <SidebarIcon name={isCollapsed ? "arrow-close" : "arrow-open"} className="type-group__chevron" />
            </button>
            {!isCollapsed && items.map((node) => <NodeRow key={node.id} node={node} nodes={nodes} selected={node.id === selectedId} onSelect={onSelect} compact />)}
          </section>
        );
      })}
    </div>
  );
}

function NodeRow({ node, nodes, selected, onSelect, compact = false }: { node: NodeItem; nodes: NodeItem[]; selected: boolean; compact?: boolean; onSelect: (id: string) => void }) {
  const type = getEffectiveNodeType(nodes, node);
  return (
    <button type="button" className={`context-node-row ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties} onClick={() => onSelect(node.id)} title={node.name}>
      <NodeIcon type={type} />
      <span className="context-node-row__name">{node.name}</span>
    </button>
  );
}
