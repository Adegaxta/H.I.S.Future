import type { KeyboardEvent, RefObject } from "react";
import { replaceBlockTag } from "./blockCapabilities";

export function handleMarkdownAutoFormat(
  event: KeyboardEvent<HTMLDivElement>,
  activeBlock: HTMLElement,
  _editorRef: RefObject<HTMLDivElement | null>,
  syncContent: () => void,
  captureStructuralUndo: () => void,
  updatePlaceholder: () => void,
): boolean {
  if (event.key !== " " && event.key !== "Enter") return false;
  if (activeBlock.closest("[data-his-table-cell], [data-page-index], [data-globe]")) return false;
  if (activeBlock.matches("pre, code, [data-divider]")) return false;

  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || !selection.rangeCount) return false;

  const text = (activeBlock.textContent || "").replace(/[\u200b\u00a0]/g, "").trim();

  // 1. Divider: "---" + Enter or Space
  if (text === "---") {
    event.preventDefault();
    event.stopPropagation();
    captureStructuralUndo();

    const divider = document.createElement("div");
    divider.dataset.divider = "true";
    divider.contentEditable = "false";

    const nextP = document.createElement("p");
    nextP.innerHTML = "<br>";

    activeBlock.replaceWith(divider);
    divider.after(nextP);

    const range = document.createRange();
    range.selectNodeContents(nextP);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    syncContent();
    updatePlaceholder();
    return true;
  }

  // 2. Code block: "```" + Enter or Space
  if (text === "```" || text === '"""') {
    event.preventDefault();
    event.stopPropagation();
    captureStructuralUndo();

    delete activeBlock.dataset.hisList;
    delete activeBlock.dataset.hisHighlighted;
    delete activeBlock.dataset.hisDropdown;
    delete activeBlock.dataset.hisTodoChecked;
    delete activeBlock.dataset.hisToggleHeading;

    const pre = replaceBlockTag(activeBlock, "PRE");
    pre.setAttribute("data-his-code", "true");
    pre.innerHTML = "<br>";

    const range = document.createRange();
    range.selectNodeContents(pre);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    syncContent();
    updatePlaceholder();
    return true;
  }

  // Only handle prefix shortcuts on Space
  if (event.key !== " ") return false;

  // Check prefix before cursor
  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(activeBlock);
  preRange.setEnd(range.endContainer, range.endOffset);
  const textBeforeCaret = preRange.toString().replace(/[\u200b\u00a0]/g, "").trim();

  interface Rule {
    prefix: string;
    apply: (block: HTMLElement) => HTMLElement;
  }

  const rules: Rule[] = [
    {
      prefix: "###",
      apply: (b) => replaceBlockTag(b, "H3"),
    },
    {
      prefix: "##",
      apply: (b) => replaceBlockTag(b, "H2"),
    },
    {
      prefix: "#",
      apply: (b) => replaceBlockTag(b, "H1"),
    },
    {
      prefix: "-",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-list", "bullets");
        return p;
      },
    },
    {
      prefix: "*",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-list", "bullets");
        return p;
      },
    },
    {
      prefix: "1.",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-list", "numbered");
        return p;
      },
    },
    {
      prefix: "[]",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-list", "todo");
        return p;
      },
    },
    {
      prefix: "[ ]",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-list", "todo");
        return p;
      },
    },
    {
      prefix: ">",
      apply: (b) => {
        const p = replaceBlockTag(b, "P");
        p.setAttribute("data-his-highlighted", "true");
        return p;
      },
    },
  ];

  for (const rule of rules) {
    if (textBeforeCaret === rule.prefix) {
      event.preventDefault();
      event.stopPropagation();
      captureStructuralUndo();

      // Clean up previous list/heading datasets if any
      delete activeBlock.dataset.hisList;
      delete activeBlock.dataset.hisHighlighted;
      delete activeBlock.dataset.hisDropdown;
      delete activeBlock.dataset.hisTodoChecked;
      delete activeBlock.dataset.hisToggleHeading;
      delete activeBlock.dataset.hisCode;

      // Remove prefix from block text
      const fullText = (activeBlock.textContent || "").replace(/[\u200b\u00a0]/g, "");
      const prefixIndex = fullText.indexOf(rule.prefix);
      const remainingText = (prefixIndex >= 0 ? fullText.slice(prefixIndex + rule.prefix.length) : "").trimStart();

      activeBlock.textContent = remainingText;
      if (!remainingText) {
        activeBlock.innerHTML = "<br>";
      }

      const formatted = rule.apply(activeBlock);

      const newRange = document.createRange();
      newRange.selectNodeContents(formatted);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      syncContent();
      updatePlaceholder();
      return true;
    }
  }

  return false;
}
