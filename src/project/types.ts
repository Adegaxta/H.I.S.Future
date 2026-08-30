import type { BaseNodeType } from "../defs/nodeTypes";
export interface ProjectInfo {
  name: string;
  folderPath: string;
  databasePath: string;
  lastEdited?: number;
}

export interface PersistedNode {
  id: string;
  name: string;
    type: BaseNodeType;
  parentId: string | null;
  order: number;
  content: string;
}
