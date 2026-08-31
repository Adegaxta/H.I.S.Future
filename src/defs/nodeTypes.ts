import { PALETTE } from "./palette";
export interface NodeDefinition<T extends string = string> {
  type: T;
  label: string;
  color: string;
  canContainChildren: boolean;
  availableInCreation: boolean;
  defaultContent: string;
}

const NODE_DEFINITIONS = [
  {
    type: "categoria",
    label: "Categoría",
    color: PALETTE.categoria,
    canContainChildren: true,
    availableInCreation: true,
    defaultContent: "<p><br></p>",
  },
  {
    type: "pagina",
    label: "Página",
    color: PALETTE.pagina,
    canContainChildren: false,
    availableInCreation: true,
    defaultContent: "<p><br></p>",
  },
  {
    type: "imagen",
    label: "Imagen",
    color: PALETTE.imagen,
    canContainChildren: false,
    availableInCreation: false,
    defaultContent: "<p><br></p>",
  },
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

// Defs derivados: cada uno declara de qué Def base parte ("extends")
// y qué propiedades cambia ("overrides"). Nada de copiar a mano por posición.
const DERIVED_DEFINITIONS: Record<"pagina-carpeta", DerivedNodeDefinition> = {
  "pagina-carpeta": {
    extends: "pagina",
    overrides: { label: "Pág-Carpeta", color: PALETTE.paginaCarpeta },
  },
};

const derivedEntries = Object.entries(DERIVED_DEFINITIONS).map(
  ([type, spec]) => {
    const definition = spec as DerivedNodeDefinition;
    return [
      type,
      { ...BASE_BY_TYPE[definition.extends], ...definition.overrides },
    ] as const;
  },
);

const RENDER_DEFINITIONS: Record<RenderNodeType, NodeDefinition> = {
  ...BASE_BY_TYPE,
  ...Object.fromEntries(derivedEntries),
} as Record<RenderNodeType, NodeDefinition>;

export const NODE_REGISTRY = {
  all(): NodeDefinition<BaseNodeType>[] {
    return [...NODE_DEFINITIONS] as NodeDefinition<BaseNodeType>[];
  },
  availableForCreation(): NodeDefinition<BaseNodeType>[] {
    return NODE_DEFINITIONS.filter(
      (definition) => definition.availableInCreation,
    ) as NodeDefinition<BaseNodeType>[];
  },
  get(type: RenderNodeType): NodeDefinition {
    const definition = RENDER_DEFINITIONS[type];
    if (definition) return definition;
    return RENDER_DEFINITIONS.pagina;
  },
};

export const getNodeDefinition = (type: RenderNodeType) =>
  NODE_REGISTRY.get(type);

// Punto único para el formato visible del tipo de nodo: siempre "Nodo - <Subtipo>".
export const getNodeDisplayLabel = (type: RenderNodeType) =>
  `Nodo - ${getNodeDefinition(type).label}`;
