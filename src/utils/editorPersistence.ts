import type { NodeItem } from "../types/nodes";
import { getPageMeta, setPageMeta } from "./pageMeta";
import { getTempoMeta, setTempoMeta } from "./temporalMeta";

export function readEditorContent(editor: HTMLElement, node: NodeItem): string {
  const persistableEditor = editor.cloneNode(true) as HTMLElement;
  persistableEditor.querySelectorAll("[data-editor-placeholder]").forEach((block) => block.removeAttribute("data-editor-placeholder"));
  const html = persistableEditor.innerHTML;
  const content = node.content.includes("<!--hisfuture-page-meta:")
    ? setPageMeta(html, getPageMeta(node.content))
    : node.content.includes("<!--hisfuture-tempo-meta:")
      ? setTempoMeta(html, getTempoMeta(node.content))
      : html;

  return content;
}
