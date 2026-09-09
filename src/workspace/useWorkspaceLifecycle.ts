import { useCallback, useEffect, useRef, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readEditorContent } from "../editor/persistence";
import { isDesktopRuntime } from "../project/runtime";
import type { NodeItem } from "../types/nodes";

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
  return nodes.map((node) => node.id === selectedId ? { ...node, content: currentHtml } : node);
}

async function closeWindowSafely() {
  const currentWindow = getCurrentWindow();
  try {
    await currentWindow.close();
    return;
  } catch (error) {
    console.warn("close() falló, intentando destroy():", error);
  }

  try {
    await currentWindow.destroy();
  } catch (error) {
    console.error("No se pudo cerrar la ventana", error);
  }
}

export function useWorkspaceLifecycle({
  nodes,
  selectedId,
  editorRef,
  saveNow,
  exitProject,
  reportError,
}: WorkspaceLifecycleOptions) {
  const closingWindowRef = useRef(false);
  const allowWindowCloseRef = useRef(false);

  const saveCurrentWorkspace = useCallback(
    () => saveNow(getWorkspaceSnapshot(nodes, selectedId, editorRef.current)),
    [editorRef, nodes, saveNow, selectedId],
  );

  const exitWorkspace = useCallback(async () => {
    try {
      await saveCurrentWorkspace();
      await exitProject();
    } catch (error) {
      reportError(String(error));
    }
  }, [exitProject, reportError, saveCurrentWorkspace]);

  const closeApplication = useCallback(async () => {
    if (closingWindowRef.current) return;
    closingWindowRef.current = true;

    try {
      await saveCurrentWorkspace();
      await exitProject();
      allowWindowCloseRef.current = true;
      await closeWindowSafely();
    } catch (error) {
      reportError(String(error));
    } finally {
      closingWindowRef.current = false;
    }
  }, [exitProject, reportError, saveCurrentWorkspace]);

  const closeApplicationRef = useRef(closeApplication);
  closeApplicationRef.current = closeApplication;

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (allowWindowCloseRef.current) return;
      event.preventDefault();
      if (!closingWindowRef.current) void closeApplicationRef.current();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error) => reportError(String(error)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [reportError]);

  return { exitWorkspace, closeApplication, saveCurrentWorkspace };
}
