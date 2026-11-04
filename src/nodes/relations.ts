import type { NodeItem } from "../types/nodes";
import { findNodeRelationPolicy, getNodeRelationPolicy } from "./registry";
import { getNodalMeta, setNodalMeta, type NodalMeta } from "./metadata";
import type { RelationRole } from "./relationTypes";

export const relationId = (node: NodeItem, role: RelationRole) => getNodalMeta(node.content).relations.find((relation) => relation.role === role)?.targetId;
export const relatedNode = (nodes: NodeItem[], node: NodeItem, role: RelationRole) => nodes.find((candidate) => candidate.id === relationId(node, role));

export type NodeRelationViolation = "role-not-allowed" | "target-missing" | "self-target" | "target-type";
interface NodeRelationEndpoint {
  id: string;
  type: string;
}

export function validateNodeRelation(
  source: NodeRelationEndpoint,
  role: RelationRole,
  target: NodeRelationEndpoint | null,
): NodeRelationViolation | null {
  const rule = findNodeRelationPolicy(source.type)?.[role];
  if (!rule) return "role-not-allowed";
  if (!target) return "target-missing";
  if (source.id === target.id) return "self-target";
  if (rule.targetTypes && !rule.targetTypes.includes(target.type)) return "target-type";
  return null;
}

export function canRelate(source: NodeItem, role: RelationRole, target: NodeItem): boolean {
  return validateNodeRelation(source, role, target) === null;
}

export function withRelation(nodes: NodeItem[], sourceId: string, role: RelationRole, targetId: string | null): NodeItem[] {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || (targetId !== null && validateNodeRelation(source, role, target ?? null) !== null)) return nodes;
  const rule = getNodeRelationPolicy(source.type)[role];
  if (!rule) return nodes;
  return nodes.map((node) => {
    if (node.id !== sourceId) return node;
    const previous = getNodalMeta(node.content).relations;
    const relations = previous.filter((relation) => relation.role !== role || (targetId !== null && rule.cardinality === "many"));
    if (targetId && !relations.some((relation) => relation.role === role && relation.targetId === targetId)) relations.push({ role, targetId });
    return { ...node, content: setNodalMeta(node.content, { relations }) };
  });
}

export const withoutRelation = (nodes: NodeItem[], sourceId: string, role: RelationRole, targetId: string) => nodes.map((node) => node.id === sourceId ? { ...node, content: setNodalMeta(node.content, { relations: getNodalMeta(node.content).relations.filter((relation) => relation.role !== role || relation.targetId !== targetId) }) } : node);
export const patchNodal = (nodes: NodeItem[], id: string, patch: Partial<NodalMeta>) => nodes.map((node) => node.id === id ? { ...node, content: setNodalMeta(node.content, patch) } : node);
export type { RelationRole } from "./relationTypes";
