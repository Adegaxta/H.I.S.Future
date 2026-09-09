import type { NodeItem } from "../types/nodes";
import {
  EDITOR_TRANSIENT_BLOCK_ATTRIBUTES,
  EDITOR_TRANSIENT_BLOCK_SELECTOR,
} from "./blockModel";
import { getPageMeta, setPageMeta } from "../utils/pageMeta";
import { getTempoMeta, setTempoMeta } from "../utils/temporalMeta";

export function readEditorContent(editor: HTMLElement, node: NodeItem): string {
  const persistableEditor = editor.cloneNode(true) as HTMLElement;
  persistableEditor.querySelectorAll("[data-editor-placeholder]").forEach((block) => block.removeAttribute("data-editor-placeholder"));
  persistableEditor.querySelectorAll(EDITOR_TRANSIENT_BLOCK_SELECTOR).forEach((block) => {
    EDITOR_TRANSIENT_BLOCK_ATTRIBUTES.forEach((attribute) => block.removeAttribute(attribute));
  });
  const html = persistableEditor.innerHTML;
  const content = node.content.includes("<!--hisfuture-page-meta:")
    ? setPageMeta(html, getPageMeta(node.content))
    : node.content.includes("<!--hisfuture-tempo-meta:")
      ? setTempoMeta(html, getTempoMeta(node.content))
      : html;

  return content;
}
