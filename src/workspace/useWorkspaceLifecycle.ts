import { useCallback, useEffect, type RefObject } from "react";
import { readEditorContent } from "../editor/persistence";
import { useAppLifecycle } from "../lifecycle/AppLifecycle";
import type { NodeItem } from "../types/nodes";
import {
  beginCloseProjectTrace,
  failCloseProjectTrace,
  measureActiveCloseProjectPhase,
} from "../lifecycle/metrics";

interface WorkspaceLifecycleOptions {
  nodes: NodeItem[];
  selectedId: string | null;
  editorRef: RefObject<HTMLDivElement | null>;
  saveNow: (snapshot?: NodeItem[]) => Promise<void>;
  exitProject: () => Promise<void>;
  reportError: (message: string) => void;
}

export function getWorkspaceSnapshot(
  nodes: NodeItem[],
  selectedId: string | null,
  editor: HTMLDivElement | null,
): NodeItem[] {
  const active = nodes.find((node) => node.id === selectedId);
  const currentHtml = editor && active && editor.getAttribute("data-active-id") === active.id
    ? readEditorContent(editor, active)
    : undefined;

  if (!selectedId || currentHtml === undefined) return nodes;
  if (currentHtml === active?.content) return nodes;
  return nodes.map((node) => node.id === selectedId ? { ...node, content: currentHtml } : node);
}

export function useWorkspaceLifecycle({
  nodes,
  selectedId,
  editorRef,
  saveNow,
  exitProject,
  reportError,
}: WorkspaceLifecycleOptions) {
  const { hideApplication, registerWorkspaceFlush } = useAppLifecycle();

  const saveCurrentWorkspace = useCallback(
    () => saveNow(getWorkspaceSnapshot(nodes, selectedId, editorRef.current)),
    [editorRef, nodes, saveNow, selectedId],
  );

  const exitWorkspace = useCallback(async () => {
    beginCloseProjectTrace();
    try {
      const snapshot = measureActiveCloseProjectPhase("capture active editor", () =>
        getWorkspaceSnapshot(nodes, selectedId, editorRef.current),
      );
      await measureActiveCloseProjectPhase("frontend save", () => saveNow(snapshot));
      await exitProject();
    } catch (error) {
      failCloseProjectTrace(error);
      reportError(String(error));
    }
  }, [editorRef, exitProject, nodes, reportError, saveNow, selectedId]);

  useEffect(() => {
    return registerWorkspaceFlush(saveCurrentWorkspace);
  }, [registerWorkspaceFlush, saveCurrentWorkspace]);

  return { exitWorkspace, hideApplication, saveCurrentWorkspace };
}
