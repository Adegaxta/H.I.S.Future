import type { NodeItem } from "../../types/nodes";
import { getNodalMeta, setNodalMeta } from "../metadata";
import { projectNodeModule } from "./definition";
import { VAULT_PRIMARY_ROLE } from "./identity";

const PROJECT_NODE_TYPE = projectNodeModule.definition.type;

export const isVaultPrimaryNode = (node: Pick<NodeItem, "content">): boolean =>
  getNodalMeta(node.content).role === VAULT_PRIMARY_ROLE;

export function assignVaultPrimaryNode(nodes: readonly NodeItem[], primaryId: string): NodeItem[] {
  return nodes.map((node) => {
    const role = node.id === primaryId ? VAULT_PRIMARY_ROLE : null;
    return getNodalMeta(node.content).role === role
      ? node
      : { ...node, content: setNodalMeta(node.content, { role }) };
  });
}

export function createVaultPrimaryNode(nodes: readonly NodeItem[], vaultName: string, id = crypto.randomUUID()): NodeItem {
  return {
    id,
    name: vaultName.trim() || "Principal",
    type: PROJECT_NODE_TYPE,
    parentId: null,
    order: nodes.filter((node) => node.parentId === null).length,
    content: setNodalMeta("<p><br></p>", { role: VAULT_PRIMARY_ROLE }),
  };
}

export function reconcileVaultPrimary(nodes: NodeItem[], vaultName: string): NodeItem[] {
  const primaries = nodes.filter(isVaultPrimaryNode).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (primaries.length === 0) return [...nodes, createVaultPrimaryNode(nodes, vaultName)];
  if (primaries.length === 1) return nodes;
  const keepId = primaries[0].id;
  return nodes.map((node) => isVaultPrimaryNode(node) && node.id !== keepId
    ? { ...node, content: setNodalMeta(node.content, { role: null }) }
    : node);
}
