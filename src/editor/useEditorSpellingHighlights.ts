import { useEffect, type RefObject } from "react";
import type { Locale } from "../i18n/core";
import { getBundledSpeller, personalWordSet, usesNativeSpelling } from "./spelling";

const editorHighlights = new Map<HTMLElement, Range[]>();
function publish(editor: HTMLElement, ranges: Range[] | null) {
  if (ranges) editorHighlights.set(editor, ranges); else editorHighlights.delete(editor);
  if (typeof Highlight === "undefined" || !CSS.highlights) return;
  const highlight = new Highlight();
  editorHighlights.forEach((items) => items.forEach((range) => highlight.add(range)));
  CSS.highlights.set("his-editor-spelling", highlight);
}

/** Native spelling when installed; DOM-free underlines for the offline fallback. */
export function useEditorSpellingHighlights(editorRef: RefObject<HTMLDivElement | null>, nodeId: string, locale: Locale, enabled: boolean) {
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled) return;
    let active = true;
    let revision = 0;
    let scheduled: number | null = null;
    const idle = typeof window.requestIdleCallback === "function";
    const cancel = () => {
      if (scheduled !== null) {
        if (idle) window.cancelIdleCallback(scheduled); else cancelAnimationFrame(scheduled);
        scheduled = null;
      }
    };
    const check = async () => {
      scheduled = null;
      const token = revision;
      const native = await usesNativeSpelling(locale);
      if (!active || token !== revision) return;
      editor.spellcheck = native;
      if (native) { publish(editor, null); return; }
      const checker = await getBundledSpeller(locale);
      if (!active || token !== revision) return;
      const blocks = new Map<Element, Text[]>();
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.parentElement?.closest("[data-mention-id], [data-editor-ui], [data-page-index], [data-globe-icon], pre, code, [data-his-code]")) continue;
        const block = node.parentElement?.closest("p, h1, h2, h3, h4, h5, h6, blockquote, li") ?? editor;
        const nodes = blocks.get(block) ?? [];
        nodes.push(node); blocks.set(block, nodes);
      }
      const ranges: Range[] = [];
      const personal = personalWordSet();
      const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      blocks.forEach((nodes, block) => {
        // Keep offsets across inline marks; excluded mention text creates gaps.
        const all = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const allowed = new Set(nodes);
        const mapping: Array<{ node: Text; start: number; end: number }> = [];
        let text = "";
        while (all.nextNode()) {
          const node = all.currentNode as Text;
          const start = text.length;
          text += allowed.has(node) ? node.data : "\n".repeat(node.length);
          mapping.push({ node, start, end: text.length });
        }
        for (const segment of segmenter.segment(text)) {
          if (!segment.isWordLike || !/\p{L}/u.test(segment.segment) || personal.has(segment.segment.normalize("NFC").toLowerCase()) || checker.correct(segment.segment)) continue;
          const start = mapping.find((item) => item.end > segment.index);
          const endOffset = segment.index + segment.segment.length;
          const end = mapping.find((item) => item.end >= endOffset);
          if (!start || !end) continue;
          const range = document.createRange();
          range.setStart(start.node, segment.index - start.start);
          range.setEnd(end.node, endOffset - end.start);
          ranges.push(range);
        }
      });
      publish(editor, ranges);
    };
    const schedule = () => {
      revision++; cancel();
      const run = () => { void check().catch((error) => console.warn("Spelling highlights unavailable", error)); };
      // Coalesce typing checks without touching Selection or saved content.
      scheduled = idle ? window.requestIdleCallback(run, { timeout: 1000 }) : requestAnimationFrame(run);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    window.addEventListener("his-personal-dictionary-change", schedule);
    schedule();
    return () => {
      active = false; revision++; cancel(); observer.disconnect();
      window.removeEventListener("his-personal-dictionary-change", schedule);
      publish(editor, null);
    };
  }, [editorRef, nodeId, locale, enabled]);
}
