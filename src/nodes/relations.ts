import type { NodeItem } from "../types/nodes";
import { getNodeRelationPolicy } from "./registry";
import { getNodalMeta, setNodalMeta, type NodalMeta } from "./metadata";
import type { RelationRole } from "./relationTypes";

export const relationId = (node: NodeItem, role: RelationRole) => getNodalMeta(node.content).relations.find((relation) => relation.role === role)?.targetId;
export const relatedNode = (nodes: NodeItem[], node: NodeItem, role: RelationRole) => nodes.find((candidate) => candidate.id === relationId(node, role));

export function canRelate(source: NodeItem, role: RelationRole, target: NodeItem): boolean {
  if (source.id === target.id) return false;
  const rule = getNodeRelationPolicy(source.type)[role];
  return Boolean(rule && (!rule.targetTypes || rule.targetTypes.includes(target.type)));
}

export function withRelation(nodes: NodeItem[], sourceId: string, role: RelationRole, targetId: string | null): NodeItem[] {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || (targetId !== null && (!target || !canRelate(source, role, target)))) return nodes;
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
