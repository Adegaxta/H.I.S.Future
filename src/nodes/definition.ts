import type { TranslationKey } from "../i18n/translations";
import type { NodeRelationPolicy } from "./relationTypes";

export type NodeRendererId = "folder" | "page" | "image" | "calendar" | "tempo" | "pdf" | "course" | "task" | "video";
export type NodeCapability = "containChildren" | "openOnPrimaryAction" | "navigateWithinView";
export interface NodeDefinition<T extends string = string> {
  type: T; labelKey: TranslationKey; nodeNameKey: TranslationKey; color: string;
  capabilities: Readonly<Partial<Record<NodeCapability, true>>>;
  creation: Readonly<{ available: boolean; selectAfterCreation: boolean }>;
  typePanel: Readonly<{ visible: boolean }>;
  defaultContent: string;
}
export interface NodeModule<T extends string = string> {
  definition: NodeDefinition<T>;
  renderer: NodeRendererId;
  relations: NodeRelationPolicy;
}
export const defineNodeModule = <const T extends string>(module: NodeDefinition<T> & { renderer: NodeRendererId; relations?: NodeRelationPolicy }): NodeModule<T> => {
  const { renderer, relations = {}, ...definition } = module;
  return { definition, renderer, relations };
};
