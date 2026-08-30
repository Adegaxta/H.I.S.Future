import { useEffect, useRef } from "react";
import type { FormEventHandler, FocusEventHandler, RefObject } from "react";
import type { NodeItem } from "../types/nodes";

interface UseRichTextEditorOptions {
  node: NodeItem | undefined;
  onContentChange: (nodeId: string, html: string) => void;
  editorRef?: RefObject<HTMLDivElement | null>;
}

const CONTENT_SYNC_DEBOUNCE_MS = 150;

export function useRichTextEditor({
  node,
  onContentChange,
  editorRef: externalRef,
}: UseRichTextEditorOptions) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const editorRef = externalRef ?? internalRef;
  const timerRef = useRef<number | null>(null);

  const cancelScheduled = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!editorRef.current || !node) return;
    if (editorRef.current.getAttribute("data-active-id") === node.id) return;
    cancelScheduled();
    const content = node.content.trim() ? node.content : "<p><br></p>";
    editorRef.current.innerHTML = content;
    const hasRootTextLine = Array.from(editorRef.current.children).some((child) =>
      ["P", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "LI"].includes(child.tagName),
    );
    if (!hasRootTextLine) {
      const line = document.createElement("p");
      line.appendChild(document.createElement("br"));
      editorRef.current.appendChild(line);
    }
    editorRef.current.setAttribute("data-active-id", node.id);
    if (!node.content.trim() || !hasRootTextLine)
      onContentChange(node.id, editorRef.current.innerHTML);
    document.execCommand("enableObjectResizing", false, "false");
    document.execCommand("enableInlineTableEditing", false, "false");
  }, [editorRef, node]);

  useEffect(() => () => cancelScheduled(), []);

  // Flush INMEDIATO — para todo lo que no sea tipear letra por letra
  // (blur, pegar, negrita/cursiva, mover líneas, imágenes, etc).
  const syncContent = () => {
    cancelScheduled();
    if (editorRef.current && node) {
      onContentChange(node.id, editorRef.current.innerHTML);
    }
  };

  // Versión debounced — SOLO para el tipeo normal (onInput).
  const scheduleContentSync = () => {
    cancelScheduled();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      syncContent();
    }, CONTENT_SYNC_DEBOUNCE_MS);
  };

  const onInput: FormEventHandler<HTMLDivElement> = () => scheduleContentSync();
  const onBlur: FocusEventHandler<HTMLDivElement> = () => syncContent();

  return { editorRef, syncContent, scheduleContentSync, onInput, onBlur };
}