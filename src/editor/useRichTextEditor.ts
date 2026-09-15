import { useEffect, useRef } from "react";
import type { FormEventHandler, FocusEventHandler, RefObject } from "react";
import type { NodeItem } from "../types/nodes";
import { readEditorContent } from "./persistence";

interface UseRichTextEditorOptions {
  node: NodeItem | undefined;
  onContentChange: (nodeId: string, html: string) => void;
  editorRef?: RefObject<HTMLDivElement | null>;
}

// A short pause between fast keystrokes should not clone the page and rerender
// the complete workspace. Structural edits and blur still flush immediately.
const CONTENT_SYNC_DEBOUNCE_MS = 400;

export function useRichTextEditor({
  node,
  onContentChange,
  editorRef: externalRef,
}: UseRichTextEditorOptions) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const editorRef = externalRef ?? internalRef;
  const timerRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  const cancelScheduled = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (idleRef.current !== null) {
      window.cancelIdleCallback?.(idleRef.current);
      idleRef.current = null;
    }
  };

  useEffect(() => {
    if (!editorRef.current || !node) return;
    if (editorRef.current.getAttribute("data-active-id") === node.id) return;
    cancelScheduled();
    const content = node.content.trim() ? node.content : "<p><br></p>";
    editorRef.current.innerHTML = content;
    const hasRootTextLine = Array.from(editorRef.current.children).some((child) =>
      ["P", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "LI", "UL", "OL"].includes(child.tagName),
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
  const persistEditorSnapshot = () => {
    const currentNode = nodeRef.current;
    if (editorRef.current && currentNode) {
      const content = readEditorContent(editorRef.current, currentNode);
      onContentChange(currentNode.id, content);
    }
  };

  const syncContent = () => {
    cancelScheduled();
    persistEditorSnapshot();
  };

  // Versión debounced — SOLO para el tipeo normal (onInput).
  const scheduleContentSync = (delay = CONTENT_SYNC_DEBOUNCE_MS, preferIdle = false) => {
    cancelScheduled();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (preferIdle && typeof window.requestIdleCallback === "function") {
        idleRef.current = window.requestIdleCallback(() => {
          idleRef.current = null;
          persistEditorSnapshot();
        }, { timeout: 2_000 });
        return;
      }
      persistEditorSnapshot();
    }, delay);
  };

  const onInput: FormEventHandler<HTMLDivElement> = () => scheduleContentSync();
  const onBlur: FocusEventHandler<HTMLDivElement> = () => syncContent();

  return { editorRef, syncContent, scheduleContentSync, onInput, onBlur };
}
