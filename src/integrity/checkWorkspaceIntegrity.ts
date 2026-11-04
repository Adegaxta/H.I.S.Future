import { getNodalMeta } from "../nodes/metadata";
import { isVaultPrimaryNode } from "../nodes/project/domain";
import { findNodeRelationPolicy, NODE_REGISTRY } from "../nodes/registry";
import { validateNodeRelation } from "../nodes/relations";
import type {
  IntegrityFinding,
  IntegrityNode,
  WorkspaceIntegrityContext,
  WorkspaceIntegrityResult,
  WorkspaceIntegritySnapshot,
} from "./types";

interface LocatedNode {
  node: IntegrityNode;
  collection: "nodes" | "deletedNodes";
  index: number;
}

const addFinding = (
  findings: IntegrityFinding[],
  context: WorkspaceIntegrityContext,
  finding: Omit<IntegrityFinding, "operation">,
) => {
  findings.push({
    ...finding,
    ...(context.operation ? { operation: context.operation } : {}),
  });
};

function checkIdentityAndTypes(
  entries: LocatedNode[],
  context: WorkspaceIntegrityContext,
  findings: IntegrityFinding[],
): void {
  const byId = new Map<string, LocatedNode[]>();
  for (const entry of entries) {
    if (entry.node.id.length === 0) {
      addFinding(findings, context, {
        rule: "node.id.nonEmpty",
        severity: "ERROR",
        nodeId: entry.node.id,
        expected: "Node id is a non-empty string",
        actual: `id = ${JSON.stringify(entry.node.id)}`,
        evidence: { collection: entry.collection, index: entry.index },
        message: "Node has an empty ID.",
        technicalDetail: `An empty id was found in ${entry.collection}[${entry.index}].`,
      });
    }
    const occurrences = byId.get(entry.node.id) ?? [];
    occurrences.push(entry);
    byId.set(entry.node.id, occurrences);

    if (!NODE_REGISTRY.find(entry.node.type)) {
      addFinding(findings, context, {
        rule: "node.type.registered",
        severity: "ERROR",
        nodeId: entry.node.id,
        expected: "Node type is registered in NODE_REGISTRY",
        actual: `type = ${JSON.stringify(entry.node.type)}`,
        evidence: { collection: entry.collection, index: entry.index },
        message: `Node has an unregistered type "${entry.node.type}".`,
        technicalDetail: `NODE_REGISTRY.find(${JSON.stringify(entry.node.type)}) returned null.`,
      });
    }
  }

  for (const [id, occurrences] of byId) {
    if (occurrences.length < 2) continue;
    const first = occurrences[0];
    addFinding(findings, context, {
      rule: "node.id.unique",
      severity: "ERROR",
      nodeId: id,
      expected: "Node IDs are unique across active nodes and Trash",
      actual: `${occurrences.length} occurrences of id = ${JSON.stringify(id)}`,
      evidence: {
        collection: first.collection,
        index: first.index,
        relatedNodeIds: occurrences.map(({ node }) => node.id),
      },
      message: `Node ID "${id}" occurs more than once.`,
      technicalDetail: occurrences
        .map(({ collection, index }) => `${collection}[${index}]`)
        .join(", "),
    });
  }
}

function checkHierarchy(
  active: LocatedNode[],
  context: WorkspaceIntegrityContext,
  findings: IntegrityFinding[],
) {
  const activeById = new Map<string, LocatedNode[]>();
  for (const entry of active) {
    const occurrences = activeById.get(entry.node.id) ?? [];
    occurrences.push(entry);
    activeById.set(entry.node.id, occurrences);
  }
  const uniqueNodes = new Map<string, LocatedNode>();
  for (const [id, occurrences] of activeById) {
    if (occurrences.length === 1 && id.trim()) uniqueNodes.set(id, occurrences[0]);
  }

  for (const entry of active) {
    const parentId = entry.node.parentId;
    if (parentId === null || activeById.has(parentId)) continue;
    addFinding(findings, context, {
      rule: "parent.exists",
      severity: "ERROR",
      nodeId: entry.node.id,
      expected: "parentId references an existing active node",
      actual: `parentId = ${JSON.stringify(parentId)}; node not found`,
      evidence: { collection: "nodes", index: entry.index, relatedNodeIds: [parentId] },
      message: `Node "${entry.node.id}" references a missing parent.`,
      technicalDetail: `nodes[${entry.index}].parentId does not resolve in the active node snapshot.`,
    });
  }

  const reportedCycles = new Set<string>();
  for (const entry of uniqueNodes.values()) {
    const path: string[] = [];
    const pathPositions = new Map<string, number>();
    let current: LocatedNode | undefined = entry;
    while (current) {
      const id = current.node.id;
      const cycleStart = pathPositions.get(id);
      if (cycleStart !== undefined) {
        const cycleIds = path.slice(cycleStart);
        const key = [...cycleIds].sort().join("\u0000");
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          addFinding(findings, context, {
            rule: "parent.acyclic",
            severity: "ERROR",
            nodeId: id,
            expected: "Parent hierarchy contains no cycles",
            actual: `cycle = ${cycleIds.join(" -> ")} -> ${id}`,
            evidence: {
              collection: "nodes",
              index: current.index,
              relatedNodeIds: cycleIds,
            },
            message: `Node hierarchy contains a cycle involving "${cycleIds.join('", "')}".`,
            technicalDetail: `Parent traversal repeated node id ${JSON.stringify(id)}.`,
          });
        }
        break;
      }
      pathPositions.set(id, path.length);
      path.push(id);
      const parentId: string | null = current.node.parentId;
      current = parentId === null ? undefined : uniqueNodes.get(parentId);
    }
  }
}

function checkProjectIdentity(
  active: LocatedNode[],
  deleted: LocatedNode[],
  context: WorkspaceIntegrityContext,
  findings: IntegrityFinding[],
) {
  const activePrimaryNodes = active.filter(
    ({ node }) => node.type === "proyecto" && isVaultPrimaryNode(node),
  );
  if (activePrimaryNodes.length > 1) {
    const first = activePrimaryNodes[0];
    addFinding(findings, context, {
      rule: "project.primary.unique",
      severity: "ERROR",
      nodeId: first.node.id,
      expected: "At most one active Proyecto node has the vault-primary role",
      actual: `${activePrimaryNodes.length} active primary project nodes`,
      evidence: {
        collection: "nodes",
        index: first.index,
        relatedNodeIds: activePrimaryNodes.map(({ node }) => node.id),
      },
      message: "Workspace has more than one primary project node.",
      technicalDetail: `Primary project node IDs: ${activePrimaryNodes.map(({ node }) => node.id).join(", ")}.`,
    });
  }

  for (const entry of deleted) {
    if (entry.node.type !== "proyecto" || !isVaultPrimaryNode(entry.node)) continue;
    addFinding(findings, context, {
      rule: "project.primary.notInTrash",
      severity: "ERROR",
      nodeId: entry.node.id,
      expected: "The primary project node is not in Trash",
      actual: `primary project node is in deletedNodes[${entry.index}]`,
      evidence: { collection: "deletedNodes", index: entry.index },
      message: "The primary project node is in Trash.",
      technicalDetail: "Persistence rejects the vault-primary node in the deleted node snapshot.",
    });
  }
}

function checkRelations(
  active: LocatedNode[],
  context: WorkspaceIntegrityContext,
  findings: IntegrityFinding[],
) {
  const activeById = new Map<string, LocatedNode>();
  for (const entry of active) {
    if (!activeById.has(entry.node.id)) activeById.set(entry.node.id, entry);
  }

  for (const entry of active) {
    const policy = findNodeRelationPolicy(entry.node.type);
    if (!policy) continue;
    const relations = getNodalMeta(entry.node.content).relations;
    const byRole = new Map<string, typeof relations>();
    for (const relation of relations) {
      const rule = policy[relation.role];
      const roleRelations = byRole.get(relation.role) ?? [];
      roleRelations.push(relation);
      byRole.set(relation.role, roleRelations);

      const target = activeById.get(relation.targetId);
      const violation = validateNodeRelation(entry.node, relation.role, target?.node ?? null);
      const evidence = {
        collection: "nodes" as const,
        index: entry.index,
        relatedNodeIds: [relation.targetId],
        relationRole: relation.role,
      };
      if (violation === "role-not-allowed") {
        addFinding(findings, context, {
          rule: "relation.allowed",
          severity: "ERROR",
          nodeId: entry.node.id,
          expected: `Node type "${entry.node.type}" declares relation role "${relation.role}"`,
          actual: `relation role "${relation.role}" is not declared for this type`,
          evidence,
          message: `Node "${entry.node.id}" has an unsupported "${relation.role}" relation.`,
          technicalDetail: `No relation policy exists for ${entry.node.type}.${relation.role}.`,
        });
        continue;
      }
      if (violation === "target-missing") {
        addFinding(findings, context, {
          rule: "relation.target.exists",
          severity: "ERROR",
          nodeId: entry.node.id,
          expected: "Relation target references an existing active node",
          actual: `targetId = ${JSON.stringify(relation.targetId)}; node not found`,
          evidence,
          message: `Relation "${relation.role}" points to a missing node.`,
          technicalDetail: `Relation target ${JSON.stringify(relation.targetId)} is absent from the active snapshot.`,
        });
        continue;
      }
      if (violation === "self-target") {
        addFinding(findings, context, {
          rule: "relation.target.notSelf",
          severity: "ERROR",
          nodeId: entry.node.id,
          expected: "Relation target differs from its source node",
          actual: `sourceId and targetId are both ${JSON.stringify(entry.node.id)}`,
          evidence,
          message: `Node "${entry.node.id}" relates to itself.`,
          technicalDetail: "canRelate rejects a source node as its own target.",
        });
        continue;
      }
      if (violation === "target-type" && target && rule?.targetTypes) {
        addFinding(findings, context, {
          rule: "relation.target.type",
          severity: "ERROR",
          nodeId: entry.node.id,
          expected: `Target type is one of: ${rule.targetTypes.join(", ")}`,
          actual: `target type = ${JSON.stringify(target.node.type)}`,
          evidence,
          message: `Relation "${relation.role}" targets an incompatible node type.`,
          technicalDetail: `Relation policy for ${entry.node.type}.${relation.role} allows ${rule.targetTypes.join(", ")}.`,
        });
      }
    }

    for (const [role, roleRelations] of byRole) {
      if (policy[role as keyof typeof policy]?.cardinality !== "one" || roleRelations.length <= 1) continue;
      addFinding(findings, context, {
        rule: "relation.cardinality",
        severity: "ERROR",
        nodeId: entry.node.id,
        expected: `At most one "${role}" relation`,
        actual: `${roleRelations.length} "${role}" relations`,
        evidence: {
          collection: "nodes",
          index: entry.index,
          relatedNodeIds: roleRelations.map(({ targetId }) => targetId),
          relationRole: role,
        },
        message: `Node "${entry.node.id}" has multiple "${role}" relations.`,
        technicalDetail: `Declared cardinality for ${entry.node.type}.${role} is "one".`,
      });
    }
  }
}

export function checkWorkspaceIntegrity(
  snapshot: WorkspaceIntegritySnapshot,
  context: WorkspaceIntegrityContext = {},
): WorkspaceIntegrityResult {
  const active = snapshot.nodes.map((node, index) => ({
    node,
    collection: "nodes" as const,
    index,
  }));
  const deleted = (snapshot.deletedNodes ?? []).map((node, index) => ({
    node,
    collection: "deletedNodes" as const,
    index,
  }));
  const findings: IntegrityFinding[] = [];
  checkIdentityAndTypes([...active, ...deleted], context, findings);

  checkHierarchy(active, context, findings);
  checkProjectIdentity(active, deleted, context, findings);
  checkRelations(active, context, findings);

  return {
    status: findings.some(({ severity }) => severity === "ERROR")
      ? "FAILED"
      : findings.length
        ? "WARNING"
        : "PASS",
    nodeCount: active.length,
    deletedNodeCount: deleted.length,
    findings,
  };
}

export type {
  IntegrityFinding,
  IntegrityNode,
  IntegritySeverity,
  WorkspaceIntegrityContext,
  WorkspaceIntegrityResult,
  WorkspaceIntegritySnapshot,
} from "./types";
