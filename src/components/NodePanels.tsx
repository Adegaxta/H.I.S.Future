import type { NodeItem } from "../types/nodes";
import { NODE_REGISTRY, getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";

interface NodePanelsProps {
  panel: "recent" | "types";
  nodes: NodeItem[];
  recentNodes: NodeItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function NodePanels({
  panel,
  nodes,
  recentNodes,
  selectedId,
  onSelect,
}: NodePanelsProps) {
  const { t } = useLocale();
  const visibleTypes = new Set(NODE_REGISTRY.visibleInTypePanel().map(({ type }) => type));
  const items =
    panel === "recent"
      ? recentNodes
      : nodes.filter((node) => visibleTypes.has(node.type));
  const emptyLabel =
    panel === "recent" ? "No hay cambios recientes." : t("panels.noTypedNodes");

  return (
    <div className="node-panels">
      <div className="node-panels__heading">
        {panel === "recent" ? "CAMBIOS RECIENTES" : t("panels.nodeTypes")}
      </div>
      {items.length === 0 ? (
        <div className="node-panels__empty">{emptyLabel}</div>
      ) : (
        <div className="node-panels__list">
          {items.map((node) => (
            <button
              key={node.id}
              type="button"
              className={node.id === selectedId ? "is-selected" : ""}
              onClick={() => onSelect(node.id)}
            >
              <span>{node.name}</span>
              <small>{getNodeDisplayLabel(node.type, t)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
