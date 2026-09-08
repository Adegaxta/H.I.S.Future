import type { NodeRuntimeContribution } from "../runtimeTypes";

export const tempoRuntime = {
  graphRelationIds: (node, nodesById) =>
    node.parentId && nodesById.get(node.parentId)?.type === "calendario"
      ? [node.parentId]
      : [],
} satisfies NodeRuntimeContribution;
