import type { BaseNodeType } from "../types/nodes";

export interface ProjectResourceDefinition {
  kind: string;
  nodeType: BaseNodeType;
  extension: string;
}

export const PROJECT_RESOURCE_DEFINITIONS = [
  { kind: "pdf", nodeType: "pdf", extension: "pdf" },
] as const satisfies readonly ProjectResourceDefinition[];

export type ProjectResourceKind = (typeof PROJECT_RESOURCE_DEFINITIONS)[number]["kind"];

export function getProjectResourceDefinition(kind: string): ProjectResourceDefinition | null {
  return PROJECT_RESOURCE_DEFINITIONS.find((definition) => definition.kind === kind) ?? null;
}
