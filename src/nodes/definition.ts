import type { TranslationKey } from "../i18n/translations";
import type { NodeRelationPolicy } from "./relationTypes";

export type NodeConceptId = "pages" | "categories" | "images" | "calendars" | "pdf" | "courses" | "tasks" | "videos";
export type NodeCategoryId = "documents";
export type NodeRendererId = "folder" | "page" | "image" | "calendar" | "tempo" | "pdf" | "course" | "task" | "video";
export type NodeCapability = "containChildren" | "openOnPrimaryAction" | "navigateWithinView";
export interface NodeCategoryDefinition { id: NodeCategoryId; labelKey: TranslationKey; color: string; }
export interface NodeConceptDefinition { id: NodeConceptId; labelKey: TranslationKey; categoryId?: NodeCategoryId; }
export interface NodeDefinition<T extends string = string> {
  type: T; labelKey: TranslationKey; nodeNameKey: TranslationKey; color: string;
  capabilities: Readonly<Partial<Record<NodeCapability, true>>>;
  creation: Readonly<{ available: boolean; selectAfterCreation: boolean }>;
  typePanel: Readonly<{ visible: boolean }>;
  concept?: NodeConceptDefinition; defaultContent: string;
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
