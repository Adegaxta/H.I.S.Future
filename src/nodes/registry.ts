import type { TranslationKey } from "../i18n/translations";
import { calendarNodeModule } from "./calendar/definition";
import { categoryNodeModule } from "./category/definition";
import { courseNodeModule } from "./course/definition";
import type { NodeCapability, NodeDefinition, NodeModule } from "./definition";
import { imageNodeModule } from "./image/definition";
import { pageFolderNodeModule, pageNodeModule } from "./page/definition";
import { pdfNodeModule } from "./pdf/definition";
import { taskNodeModule } from "./task/definition";
import { tempoNodeModule } from "./tempo/definition";
import { videoNodeModule } from "./video/definition";

const BASE_MODULES = [categoryNodeModule, pageNodeModule, imageNodeModule, calendarNodeModule, tempoNodeModule, pdfNodeModule, courseNodeModule, taskNodeModule, videoNodeModule] as const;
const RENDER_MODULES = [...BASE_MODULES, pageFolderNodeModule] as const;
export type BaseNodeType = (typeof BASE_MODULES)[number]["definition"]["type"];
export type RenderNodeType = (typeof RENDER_MODULES)[number]["definition"]["type"];

export function createNodeRegistry<const T extends readonly NodeModule[]>(modules: T) {
  const byType = new Map<string, NodeModule>();
  for (const module of modules) {
    if (byType.has(module.definition.type)) throw new Error(`Duplicate Node type registration: ${module.definition.type}`);
    byType.set(module.definition.type, module);
  }
  return {
    get(type: T[number]["definition"]["type"]): T[number] {
      const module = byType.get(type);
      if (!module) throw new Error(`Unknown Node type: ${String(type)}`);
      return module as T[number];
    },
    find(type: string): T[number] | null { return (byType.get(type) as T[number] | undefined) ?? null; },
    all: () => [...modules] as T[number][],
  };
}

const renderRegistry = createNodeRegistry(RENDER_MODULES);
const baseDefinitions = () => BASE_MODULES.map((module) => module.definition) as NodeDefinition<BaseNodeType>[];
export const NODE_REGISTRY = {
  get: (type: RenderNodeType) => renderRegistry.get(type).definition,
  find: (type: string) => renderRegistry.find(type)?.definition ?? null,
  all: baseDefinitions,
  availableForCreation: () => baseDefinitions().filter((definition) => definition.creation.available),
  visibleInTypePanel: () => baseDefinitions().filter((definition) => definition.typePanel.visible),
};
export const getNodeDefinition = (type: RenderNodeType) => NODE_REGISTRY.get(type);
export const getNodeRenderer = (type: RenderNodeType) => renderRegistry.get(type).renderer;
export const getNodeRelationPolicy = (type: BaseNodeType) => renderRegistry.get(type).relations;
export const hasNodeCapability = (type: RenderNodeType, capability: NodeCapability) => getNodeDefinition(type).capabilities[capability] === true;
export const getNodeDisplayLabel = (type: RenderNodeType, translate: (key: TranslationKey) => string) => translate(getNodeDefinition(type).nodeNameKey);
export type { NodeCapability, NodeDefinition, NodeModule, NodeRendererId } from "./definition";
