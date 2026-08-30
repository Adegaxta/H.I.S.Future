import type { NodeItem } from "../types/nodes";
import { getNodeDefinition } from "../defs/nodeTypes";

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
  const items =
    panel === "recent"
      ? recentNodes
      : nodes.filter((node) => node.type === "pagina" || node.type === "imagen");
  const emptyLabel =
    panel === "recent" ? "No hay cambios recientes." : "No hay páginas creadas.";

  return (
    <div className="node-panels">
      <div className="node-panels__heading">
        {panel === "recent" ? "CAMBIOS RECIENTES" : "PÁGINAS"}
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
              <small>{getNodeDefinition(node.type).label}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
