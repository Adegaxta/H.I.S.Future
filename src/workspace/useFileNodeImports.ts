import { useCallback, useEffect } from "react";
import { hasNodeCapability } from "../defs/nodeTypes";
import type { Translate } from "../i18n/LocaleContext";
import {
  FileNodeImportError,
  findImportableFile,
  importFileAsNode,
  isImportableDragItem,
} from "../project/fileNodeImporter";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";

interface FileNodeImportsOptions {
  nodes: NodeItem[];
  createNode: (name: string, type: BaseNodeType, parentId: string | null, content?: string) => string;
  translate: Translate;
  reportError: (message: string | null) => void;
}

export function useFileNodeImports({ nodes, createNode, translate, reportError }: FileNodeImportsOptions) {
  const resolveDropParentId = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-node-id]");
    const targetId = target?.dataset.nodeId;
    if (!targetId) return null;

    const targetNode = nodes.find((node) => node.id === targetId);
    if (!targetNode) return null;
    const targetType = getEffectiveNodeType(nodes, targetNode);
    return hasNodeCapability(targetType, "containChildren") ? targetId : targetNode.parentId ?? null;
  }, [nodes]);

  const importFile = useCallback(async (file: File, parentId: string | null = null) => {
    reportError(null);
    try {
      return await importFileAsNode(file, parentId, { nodes, createNode });
    } catch (error) {
      console.error(error);
      reportError(translate(
        error instanceof FileNodeImportError ? error.translationKey : "fileImport.failed",
      ));
      return null;
    }
  }, [createNode, nodes, reportError, translate]);

  useEffect(() => {
    const handleGlobalDragOver = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.defaultPrevented || !dragEvent.dataTransfer) return;
      if (!Array.from(dragEvent.dataTransfer.items).some(isImportableDragItem)) return;
      event.preventDefault();
      event.stopPropagation();
      dragEvent.dataTransfer.dropEffect = "copy";
    };

    const handleGlobalDrop = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.defaultPrevented || !dragEvent.dataTransfer) return;
      const file = findImportableFile(dragEvent.dataTransfer);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void importFile(file, resolveDropParentId(dragEvent.clientX, dragEvent.clientY));
    };

    const targets = [window, document, document.body];
    for (const target of targets) {
      target.addEventListener("dragover", handleGlobalDragOver);
      target.addEventListener("drop", handleGlobalDrop);
    }
    return () => {
      for (const target of targets) {
        target.removeEventListener("dragover", handleGlobalDragOver);
        target.removeEventListener("drop", handleGlobalDrop);
      }
    };
  }, [importFile, resolveDropParentId]);

  return { importFile, resolveDropParentId };
}
