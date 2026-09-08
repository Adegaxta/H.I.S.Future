import { getNodeDefinition } from "./registry";
import type { BaseNodeType, NodeItem } from "../types/nodes";

export function makeNode(nodes: NodeItem[], id: string, type: BaseNodeType, name: string, content = getNodeDefinition(type).defaultContent): NodeItem {
  return { id, type, name, parentId: null, order: nodes.filter((node) => !node.parentId).length, content };
}
