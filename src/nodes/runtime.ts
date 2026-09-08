import type { BaseNodeType, NodeItem } from "../types/nodes";
import { courseRuntime } from "./course/runtime";
import { imageRuntime } from "./image/runtime";
import type { NodeRuntimeContribution } from "./runtimeTypes";
import { tempoRuntime } from "./tempo/runtime";

const NODE_RUNTIME: Readonly<Partial<Record<BaseNodeType, NodeRuntimeContribution>>> = {
  curso: courseRuntime,
  imagen: imageRuntime,
  tempo: tempoRuntime,
};

export const getNodeRuntime = (type: BaseNodeType): NodeRuntimeContribution =>
  NODE_RUNTIME[type] ?? {};

export function applyNodeRename(node: NodeItem, name: string): NodeItem {
  const renamedNode = { ...node, name };
  return getNodeRuntime(node.type).rename?.(renamedNode) ?? renamedNode;
}

export const getNodeGraphImageSource = (node: NodeItem): string | undefined =>
  getNodeRuntime(node.type).graphImageSource?.(node);

export const getNodeGraphRelationIds = (
  node: NodeItem,
  nodesById: ReadonlyMap<string, NodeItem>,
): readonly string[] => getNodeRuntime(node.type).graphRelationIds?.(node, nodesById) ?? [];
