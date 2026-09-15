import type { NodeItem, RenderNodeType } from "../types/nodes";
import { getNodeDefinition } from "../defs/nodeTypes";
import { PrimaryNodeName } from "../nodes/PrimaryNodeName";
import { NodeIcon } from "../nodes/NodeIcon";
import type { ResolvedNodeVisual } from "../nodes/visuals/types";

interface DragPreviewProps {
  node: NodeItem | undefined;
  nodeType: RenderNodeType | undefined;
  position: { x: number; y: number };
  iconSource?: string;
  visual?: ResolvedNodeVisual;
}

export default function DragPreview({
  node,
  nodeType,
  position,
  iconSource,
  visual,
}: DragPreviewProps) {
  if (!node) return null;
  const color = getNodeDefinition(nodeType || "pagina").color;

  return (
    <div
      style={{
        position: "fixed",
        left: position.x + 14,
        top: position.y + 14,
        zIndex: 10000,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "7px",
        padding: "7px 10px",
        background: "#20252A",
        border: `1px solid ${color}`,
        borderRadius: "4px",
        boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
        color: "#F2F3F4",
        fontSize: "12px",
      }}
    >
      <NodeIcon type={nodeType || "pagina"} source={iconSource} visual={visual} />
      <PrimaryNodeName node={node}>{node.name}</PrimaryNodeName>
    </div>
  );
}
