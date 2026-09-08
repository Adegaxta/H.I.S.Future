import type { NodeItem } from "../types/nodes";

export interface NodeRuntimeContribution {
  rename?: (renamedNode: NodeItem) => NodeItem;
  graphImageSource?: (node: NodeItem) => string | undefined;
  graphRelationIds?: (
    node: NodeItem,
    nodesById: ReadonlyMap<string, NodeItem>,
  ) => readonly string[];
}
