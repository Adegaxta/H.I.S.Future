import { useEffect, type RefObject } from "react";

interface PendingEditorFocusOptions {
  pendingNodeId: string | null;
  selectedNodeId: string | null;
  editorRef: RefObject<HTMLDivElement | null>;
  clearPendingFocus: () => void;
}

export function usePendingEditorFocus({
  pendingNodeId,
  selectedNodeId,
  editorRef,
  clearPendingFocus,
}: PendingEditorFocusOptions) {
  useEffect(() => {
    if (!pendingNodeId || selectedNodeId !== pendingNodeId) return;

    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const firstLine = editor.querySelector("p") || editor;
      const range = document.createRange();
      range.selectNodeContents(firstLine);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      clearPendingFocus();
    });

    return () => cancelAnimationFrame(frame);
  }, [clearPendingFocus, editorRef, pendingNodeId, selectedNodeId]);
}
