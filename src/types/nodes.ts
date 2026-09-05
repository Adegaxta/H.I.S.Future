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
  x: number;
  y: number;
  nodeId: string | null;
}

export type DropPosition = "before" | "inside" | "after";

export interface DropTarget {
  id: string;
  position: DropPosition;
}

export interface PickerState {
  query: string;
  hasTrigger?: boolean;
}

export interface LineControlState {
  block: HTMLElement;
  top: number;
  left: number;
  before: boolean;
  nearLeft: boolean;
  hasContent: boolean;
  inside: boolean;
  pointerY?: number;
}
