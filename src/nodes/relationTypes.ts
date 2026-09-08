export const RELATION_ROLES = ["syllabus", "calendar", "class", "content", "course", "tempo", "material", "relatedWork", "cover"] as const;
export type RelationRole = typeof RELATION_ROLES[number];
export interface NodeRelation { role: RelationRole; targetId: string; order?: number; date?: string }
export interface NodeRelationRule {
  cardinality: "one" | "many";
  targetTypes?: readonly string[];
}
export type NodeRelationPolicy = Readonly<Partial<Record<RelationRole, NodeRelationRule>>>;
