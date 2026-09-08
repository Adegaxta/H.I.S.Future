import type { RefObject } from "react";
import type { NavigationHandler } from "../hooks/useWorkspaceNavigation";
import type { BaseNodeType, ContextMenuState, NodeItem } from "../types/nodes";
import type { TimeFormat } from "../utils/temporalMeta";

export interface NodeViewHost {
  data: {
    nodes: NodeItem[];
    deletedNodes: NodeItem[];
    timeFormat: TimeFormat;
  };
  mutations: {
    createNode: (name: string, type: BaseNodeType, parentId: string | null, content?: string, selectCreated?: boolean) => string;
    updateContent: (id: string, content: string) => void;
    mutateNodes: (update: (nodes: NodeItem[]) => NodeItem[]) => void;
    renameNode: (id: string, name: string) => void;
    deleteNode: (id: string) => void;
  };
  navigation: {
    selectNode: (id: string) => void;
    openNodeView: (id: string, x?: number, y?: number) => void;
    openDeletedNode: (id: string) => void;
    registerWithinView: (handler: NavigationHandler) => () => void;
  };
  tree: {
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  };
  files: {
    importFile: (file: File, parentId?: string | null) => Promise<NodeItem | null> | NodeItem | null;
  };
  editor: {
    ref: RefObject<HTMLDivElement | null>;
    pendingNodeDrop: { nodeId: string; x: number; y: number } | null;
    clearPendingNodeDrop: () => void;
    createPastedNode?: (name: string) => NodeItem | null;
    runSlashCommand?: (tag: string) => boolean;
  };
  contextMenus: {
    openNodeMenu: (menu: ContextMenuState) => void;
  };
  projectImage: {
    updateContent: (id: string, content: string) => void;
    useAsCover: (nodeId: string) => void;
  };
}

export interface NodeRendererProps {
  node: NodeItem;
  host: NodeViewHost;
}
