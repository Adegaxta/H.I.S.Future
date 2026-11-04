import { useCallback, useEffect, useRef } from "react";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";
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
  onGlobalImport?: (node: NodeItem) => void;
}

export function useFileNodeImports({ nodes, createNode, translate, reportError, onGlobalImport }: FileNodeImportsOptions) {
  const onGlobalImportRef = useRef(onGlobalImport);
  onGlobalImportRef.current = onGlobalImport;
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
      const imported = await importFileAsNode(file, parentId, { nodes, createNode });
      if (imported) {
        emitDiagnosticEvent(createDiagnosticEvent({
          level: "INFO",
          category: "ASSETS",
          action: "file.imported",
          operation: "file.import",
          nodeId: imported.id,
          ...(parentId ? { relatedNodeIds: [parentId] } : {}),
          message: "File imported as a node",
          technicalDetail: JSON.stringify({ type: imported.type }),
        }));
      }
      return imported;
    } catch (error) {
      emitDiagnosticEvent(createDiagnosticEvent({
        level: "ERROR",
        category: "ASSETS",
        action: "file.import.failed",
        operation: "file.import",
        message: "File could not be imported as a node",
        technicalDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }));
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
      void importFile(file, resolveDropParentId(dragEvent.clientX, dragEvent.clientY))
        .then((node) => { if (node) onGlobalImportRef.current?.(node); });
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
