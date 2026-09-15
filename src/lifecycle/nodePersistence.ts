import type { NodeContentChange } from "../project/nodeRepository";
import type { NodeItem } from "../types/nodes";

export interface FullNodePersistenceRequest {
  kind: "full";
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  version: number;
}

export interface ContentNodePersistenceRequest {
  kind: "content";
  changes: NodeContentChange[];
  version: number;
}

export type NodePersistenceRequest = FullNodePersistenceRequest | ContentNodePersistenceRequest;

export function mergeNodePersistenceRequests(
  current: NodePersistenceRequest,
  next: NodePersistenceRequest,
): NodePersistenceRequest {
  if (next.kind === "full") return next;
  if (current.kind === "full") {
    const changes = new Map(next.changes.map((change) => [change.id, change.content]));
    return {
      ...current,
      nodes: current.nodes.map((node) => {
        const content = changes.get(node.id);
        return content === undefined || content === node.content ? node : { ...node, content };
      }),
      version: Math.max(current.version, next.version),
    };
  }
  const changes = new Map(current.changes.map((change) => [change.id, change]));
  next.changes.forEach((change) => changes.set(change.id, change));
  return {
    kind: "content",
    changes: [...changes.values()],
    version: Math.max(current.version, next.version),
  };
}
