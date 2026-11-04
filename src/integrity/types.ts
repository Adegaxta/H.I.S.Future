export type IntegritySeverity = "ERROR" | "WARNING";

export interface IntegrityNode {
  id: string;
  type: string;
  parentId: string | null;
  content: string;
}

export interface WorkspaceIntegritySnapshot {
  nodes: readonly IntegrityNode[];
  deletedNodes?: readonly IntegrityNode[];
}

export interface WorkspaceIntegrityContext {
  operation?: string;
}

export interface IntegrityFinding {
  rule: string;
  severity: IntegritySeverity;
  nodeId?: string;
  expected: string;
  actual: string;
  operation?: string;
  evidence: {
    collection: "nodes" | "deletedNodes";
    index: number;
    relatedNodeIds?: string[];
    relationRole?: string;
  };
  message: string;
  technicalDetail: string;
}

export interface WorkspaceIntegrityResult {
  status: "PASS" | "WARNING" | "FAILED";
  nodeCount: number;
  deletedNodeCount: number;
  findings: IntegrityFinding[];
}
