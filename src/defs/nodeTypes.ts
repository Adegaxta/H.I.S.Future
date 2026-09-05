import type { TranslationKey } from "../i18n/translations";
import { PALETTE } from "./palette";

export type NodeConceptId = "pages" | "categories" | "images" | "calendars" | "pdf" | "courses" | "tasks" | "videos";
export type NodeCategoryId = "documents";

export interface NodeCategoryDefinition {
  id: NodeCategoryId;
  labelKey: TranslationKey;
  color: string;
}

export interface NodeConceptDefinition {
  id: NodeConceptId;
  labelKey: TranslationKey;
  categoryId?: NodeCategoryId;
}

export interface NodeDefinition<T extends string = string> {
  type: T;
  labelKey: TranslationKey;
  nodeNameKey: TranslationKey;
  color: string;
  canContainChildren: boolean;
  availableInCreation: boolean;
  showInTypePanel: boolean;
  concept?: NodeConceptDefinition;
  defaultContent: string;
}

const NODE_CATEGORIES = [
  { id: "documents", labelKey: "categories.documents", color: PALETTE.documents },
] as const satisfies readonly NodeCategoryDefinition[];

const NODE_DEFINITIONS = [
  {
    type: "categoria",
    labelKey: "nodes.category.label",
    nodeNameKey: "nodes.category.nodeName",
    color: PALETTE.categoria,
    canContainChildren: true,
    availableInCreation: true,
    showInTypePanel: true,
    concept: { id: "categories", labelKey: "concepts.categories" },
    defaultContent: "<p><br></p>",
  },
  {
    type: "pagina",
    labelKey: "nodes.page.label",
    nodeNameKey: "nodes.page.nodeName",
    color: PALETTE.pagina,
    canContainChildren: false,
    availableInCreation: true,
    showInTypePanel: true,
    concept: { id: "pages", labelKey: "concepts.pages" },
    defaultContent: "<p><br></p>",
  },
  {
    type: "imagen",
    labelKey: "nodes.image.label",
    nodeNameKey: "nodes.image.nodeName",
    color: PALETTE.imagen,
    canContainChildren: false,
    availableInCreation: false,
    showInTypePanel: true,
    concept: { id: "images", labelKey: "concepts.images" },
    defaultContent: "<p><br></p>",
  },
  {
    type: "calendario",
    labelKey: "nodes.calendar.label",
    nodeNameKey: "nodes.calendar.nodeName",
    color: PALETTE.calendario,
    canContainChildren: true,
    availableInCreation: false,
    showInTypePanel: true,
    concept: { id: "calendars", labelKey: "concepts.calendars" },
    defaultContent: "<p><br></p>",
  },
  {
    type: "tempo",
    labelKey: "nodes.tempo.label",
    nodeNameKey: "nodes.tempo.nodeName",
    color: PALETTE.tempo,
    canContainChildren: false,
    availableInCreation: false,
    showInTypePanel: true,
    defaultContent: "<p><br></p>",
  },
  {
    type: "pdf",
    labelKey: "nodes.pdf.label",
    nodeNameKey: "nodes.pdf.nodeName",
    color: PALETTE.pdf,
    canContainChildren: false,
    availableInCreation: false,
    showInTypePanel: true,
    concept: { id: "pdf", labelKey: "concepts.pdf", categoryId: "documents" },
    defaultContent: "<p><br></p>",
  },
  { type: "curso", labelKey: "nodes.course.label", nodeNameKey: "nodes.course.nodeName", color: PALETTE.curso, canContainChildren: false, availableInCreation: true, showInTypePanel: true, concept: { id: "courses", labelKey: "concepts.courses" }, defaultContent: "<p><br></p>" },
  { type: "tarea", labelKey: "nodes.task.label", nodeNameKey: "nodes.task.nodeName", color: PALETTE.tarea, canContainChildren: false, availableInCreation: true, showInTypePanel: true, concept: { id: "tasks", labelKey: "concepts.tasks" }, defaultContent: "<p><br></p>" },
  { type: "video", labelKey: "nodes.video.label", nodeNameKey: "nodes.video.nodeName", color: PALETTE.video, canContainChildren: false, availableInCreation: true, showInTypePanel: true, concept: { id: "videos", labelKey: "concepts.videos" }, defaultContent: "<p><br></p>" },
] as const satisfies readonly NodeDefinition[];

export type BaseNodeType = (typeof NODE_DEFINITIONS)[number]["type"];
export type RenderNodeType = BaseNodeType | "pagina-carpeta";

const BASE_BY_TYPE: Record<BaseNodeType, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<BaseNodeType, NodeDefinition>;

interface DerivedNodeDefinition {
  extends: BaseNodeType;
  overrides: Partial<NodeDefinition>;
}

const DERIVED_DEFINITIONS: Record<"pagina-carpeta", DerivedNodeDefinition> = {
  "pagina-carpeta": {
    extends: "pagina",
    overrides: {
      labelKey: "nodes.pageFolder.label",
      nodeNameKey: "nodes.pageFolder.nodeName",
      color: PALETTE.paginaCarpeta,
    },
  },
};

const derivedEntries = Object.entries(DERIVED_DEFINITIONS).map(([type, spec]) => [
  type,
  { ...BASE_BY_TYPE[spec.extends], ...spec.overrides },
] as const);

const RENDER_DEFINITIONS: Record<RenderNodeType, NodeDefinition> = {
  ...BASE_BY_TYPE,
  ...Object.fromEntries(derivedEntries),
} as Record<RenderNodeType, NodeDefinition>;

export const NODE_REGISTRY = {
  all: () => [...NODE_DEFINITIONS] as NodeDefinition<BaseNodeType>[],
  availableForCreation: () => NODE_DEFINITIONS.filter(
    (definition) => definition.availableInCreation,
  ) as NodeDefinition<BaseNodeType>[],
  visibleInTypePanel: () => NODE_DEFINITIONS.filter(
    (definition) => definition.showInTypePanel,
  ) as NodeDefinition<BaseNodeType>[],
  conceptual: () => NODE_DEFINITIONS.filter(
    (definition) => "concept" in definition && Boolean(definition.concept),
  ) as NodeDefinition<BaseNodeType>[],
  categories: () => [...NODE_CATEGORIES] as NodeCategoryDefinition[],
  get(type: RenderNodeType): NodeDefinition {
    return RENDER_DEFINITIONS[type] ?? RENDER_DEFINITIONS.pagina;
  },
};

export const getNodeDefinition = (type: RenderNodeType) => NODE_REGISTRY.get(type);

export const getNodeDisplayLabel = (
  type: RenderNodeType,
  translate: (key: TranslationKey) => string,
) => translate(getNodeDefinition(type).nodeNameKey);
