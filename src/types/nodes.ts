export type { BaseNodeType, RenderNodeType } from "../defs/nodeTypes";
import type { BaseNodeType } from "../defs/nodeTypes";

export interface NodeItem {
  loreHidden?: boolean;
  id: string;
  name: string;
  type: BaseNodeType;
  parentId: string | null;
  order: number;
  content: string;
}

export interface CreatingState {
  parentId: string | null;
}

export interface ContextMenuState {
  context: "lore" | "types" | "recent" | "folder";
  x: number;
  y: number;
  nodeId: string | null;
  extended?: boolean;
}

export type DropPosition = "before" | "inside" | "after";

export interface DropTarget {
  id: string;
  position: DropPosition;
}
