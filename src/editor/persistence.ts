import type { NodeItem } from "../types/nodes";
import {
  EDITOR_TRANSIENT_BLOCK_ATTRIBUTES,
  EDITOR_TRANSIENT_BLOCK_SELECTOR,
  EDITOR_UI_SELECTOR,
} from "./blockModel";
import { getPageMeta, setPageMeta } from "../utils/pageMeta";
import { getTempoMeta, setTempoMeta } from "../utils/temporalMeta";

export function readEditorContent(editor: HTMLElement, node: NodeItem): string {
  const supportsFastPath = typeof editor.querySelector === "function";
  const needsSanitization = !supportsFastPath || Boolean(
    editor.querySelector("[data-editor-placeholder]") ||
    editor.querySelector(EDITOR_TRANSIENT_BLOCK_SELECTOR) ||
    editor.querySelector(EDITOR_UI_SELECTOR) ||
    editor.querySelector('[contenteditable="true"]'),
  );
  let html = editor.innerHTML;
  if (needsSanitization) {
    if (!supportsFastPath) {
      // Kept for non-DOM test doubles and compatibility environments.
      const persistableEditor = editor.cloneNode(true) as HTMLElement;
      persistableEditor.querySelectorAll("[data-editor-placeholder]").forEach((block) => block.removeAttribute("data-editor-placeholder"));
      persistableEditor.querySelectorAll(EDITOR_TRANSIENT_BLOCK_SELECTOR).forEach((block) => {
        EDITOR_TRANSIENT_BLOCK_ATTRIBUTES.forEach((attribute) => block.removeAttribute(attribute));
      });
      persistableEditor.querySelectorAll(EDITOR_UI_SELECTOR).forEach((element) => element.remove());
      html = persistableEditor.innerHTML;
    } else {
      // Avoid cloning the entire page (and large inline image strings) merely
      // to omit a handful of UI-only attributes from persistence.
      const stripped: Array<{ element: Element; attribute: string; value: string }> = [];
      const strip = (element: Element, attribute: string) => {
        const value = element.getAttribute(attribute);
        if (value === null) return;
        stripped.push({ element, attribute, value });
        element.removeAttribute(attribute);
      };
      editor.querySelectorAll("[data-editor-placeholder]").forEach((block) => strip(block, "data-editor-placeholder"));
      editor.querySelectorAll(EDITOR_TRANSIENT_BLOCK_SELECTOR).forEach((block) => {
        strip(block, "contenteditable");
        EDITOR_TRANSIENT_BLOCK_ATTRIBUTES.forEach((attribute) => strip(block, attribute));
      });
      const removedUi: Array<{ element: Element; parent: Node; nextSibling: ChildNode | null }> = [];
      editor.querySelectorAll(EDITOR_UI_SELECTOR).forEach((element) => {
        if (!element.parentNode) return;
        removedUi.push({ element, parent: element.parentNode, nextSibling: element.nextSibling });
        element.remove();
      });
      editor.querySelectorAll('[contenteditable="true"]').forEach((block) => strip(block, "contenteditable"));
      try {
        html = editor.innerHTML;
      } finally {
        removedUi.reverse().forEach(({ element, parent, nextSibling }) => {
          parent.insertBefore(element, nextSibling && nextSibling.parentNode === parent ? nextSibling : null);
        });
        stripped.forEach(({ element, attribute, value }) => element.setAttribute(attribute, value));
      }
    }
  }
  const content = node.content.includes("<!--hisfuture-page-meta:")
    ? setPageMeta(html, getPageMeta(node.content))
    : node.content.includes("<!--hisfuture-tempo-meta:")
      ? setTempoMeta(html, getTempoMeta(node.content))
      : html;

  return content;
}
