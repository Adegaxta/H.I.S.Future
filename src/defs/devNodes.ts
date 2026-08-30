export interface DevNodePosition {
  top: number;
  left: number;
}

export interface DevNodeDefinition<K extends string> {
  kind: K;
  label: string;
  role: BlockTextDevNodeRole;
  width: number;
  height: number;
  parentKind: K | null;
  allowedChildren: K[];
}

export interface DevNode<K extends string> {
  id: string;
  kind: K;
  parentId: string | null;
  block: HTMLElement | null;
  position: DevNodePosition;
  width: number;
  height: number;
}

export interface DevNodeTree<K extends string> {
  root: DevNode<K> | null;
  children: DevNode<K>[];
}

export interface DevNodeRegistryConfig<K extends string> {
  definitions: Record<K, DevNodeDefinition<K>>;
  rootKind: K;
}

export function clampDevNodePosition(
  top: number,
  left: number,
  width: number,
  height: number,
): DevNodePosition {
  return {
    top: Math.min(Math.max(12, top), Math.max(12, window.innerHeight - height - 12)),
    left: Math.min(Math.max(12, left), Math.max(12, window.innerWidth - width - 12)),
  };
}

export function createDevNodeRegistry<K extends string>({ definitions, rootKind }: DevNodeRegistryConfig<K>) {
  const canAttachChild = (parent: DevNode<K> | null, childKind: K) => {
    if (!parent) return false;
    const definition = definitions[parent.kind];
    return definition.allowedChildren.includes(childKind);
  };

  const createRoot = (position: DevNodePosition, block: HTMLElement | null): DevNode<K> => {
    const definition = definitions[rootKind];
    return {
      id: String(definition.kind),
      kind: definition.kind,
      parentId: null,
      block,
      position,
      width: definition.width,
      height: definition.height,
    };
  };

  const createChild = (parent: DevNode<K> | null, childKind: K, position: DevNodePosition, block: HTMLElement | null): DevNode<K> | null => {
    if (!parent || !canAttachChild(parent, childKind)) return null;
    const definition = definitions[childKind];
    return {
      id: String(definition.kind),
      kind: definition.kind,
      parentId: parent.id,
      block,
      position,
      width: definition.width,
      height: definition.height,
    };
  };

  const createTree = (root: DevNode<K> | null, children: DevNode<K>[] = []): DevNodeTree<K> => ({ root, children });

  const findChild = (tree: DevNodeTree<K>, kind: K): DevNode<K> | null =>
    tree.children.find((child) => child.kind === kind) ?? null;

  const attachChild = (tree: DevNodeTree<K>, child: DevNode<K>): DevNodeTree<K> => {
    if (!tree.root || !canAttachChild(tree.root, child.kind)) return tree;
    return {
      root: tree.root,
      children: [...tree.children.filter((entry) => entry.kind !== child.kind), child],
    };
  };

  const closeChild = (tree: DevNodeTree<K>, kind: K): DevNodeTree<K> => ({
    root: tree.root,
    children: tree.children.filter((child) => child.kind !== kind),
  });

  const closeTree = (): DevNodeTree<K> => ({ root: null, children: [] });

  return {
    definitions,
    rootKind,
    createRoot,
    createChild,
    createTree,
    findChild,
    attachChild,
    closeChild,
    closeTree,
    canAttachChild,
  };
}

export type BlockTextDevNodeRole = "root" | "panel" | "action";
export type BlockTextDevNodeKind = "block-text-button" | "block-text-color-option";

export interface BlockTextDevNodeDefinition extends DevNodeDefinition<BlockTextDevNodeKind> {}
export interface BlockTextDevNode extends DevNode<BlockTextDevNodeKind> {}
export interface BlockTextDevNodeTree extends DevNodeTree<BlockTextDevNodeKind> {}

export const BLOCK_TEXT_DEV_DEFINITIONS: Record<BlockTextDevNodeKind, BlockTextDevNodeDefinition> = {
  "block-text-button": {
    kind: "block-text-button",
    label: "Botón del bloque de texto",
    role: "root",
    width: 260,
    height: 420,
    parentKind: null,
    allowedChildren: ["block-text-color-option"],
  },
  "block-text-color-option": {
    kind: "block-text-color-option",
    label: "Color del bloque de texto",
    role: "panel",
    width: 260,
    height: 340,
    parentKind: "block-text-button",
    allowedChildren: [],
  },
};

export const BLOCK_TEXT_DEV_REGISTRY = createDevNodeRegistry({
  definitions: BLOCK_TEXT_DEV_DEFINITIONS,
  rootKind: "block-text-button",
});

export const clampFloatNodePosition = clampDevNodePosition;
