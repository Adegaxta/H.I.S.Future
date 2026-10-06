import { useCallback, useEffect } from "react";
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import type { LineControlState } from "./types";
import { isEditableElement } from "../utils/dom";
import { readInlineMarkState, rangeBelongsToEditor, type InlineMarkState } from "./inlineMarks";

export interface SelectionToolbarState {
  top: number;
  left: number;
  marks: InlineMarkState;
}

interface UseEditorSelectionOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  blockSelector: string;
  textLineSelector: string;
  setSelectedLineBlocks: Dispatch<SetStateAction<HTMLElement[]>>;
  setLineActionBlock: Dispatch<SetStateAction<HTMLElement | null>>;
  setSelectionToolbar: Dispatch<SetStateAction<SelectionToolbarState | null>>;
  savedTextRangeRef: MutableRefObject<Range | null>;
  setPlaceholderBlock: Dispatch<SetStateAction<HTMLElement | null>>;
  controls: {
    isDraggingLine: boolean;
    setLineControl: Dispatch<SetStateAction<LineControlState | null>>;
  };
  getEditorBlock: (source: Node | null) => HTMLElement | null;
  getTextEditorBlock: (source: Node | null) => HTMLElement | null;
  isRootEditorBlock: (block: HTMLElement) => boolean;
  isLineEmpty: (block: HTMLElement) => boolean;
  clearLineSelection: () => void;
  clearNativeSelection: () => void;
}

export function useEditorSelection({
  editorRef,
  blockSelector,
  textLineSelector,
  setSelectedLineBlocks,
  setLineActionBlock,
  setSelectionToolbar,
  savedTextRangeRef,
  setPlaceholderBlock,
  controls,
  getEditorBlock,
  getTextEditorBlock,
  isRootEditorBlock,
  isLineEmpty,
  clearLineSelection,
  clearNativeSelection,
}: UseEditorSelectionOptions) {

  const clearMentionSelection = useCallback((editor: HTMLElement | null) => {
    editor?.querySelectorAll<HTMLElement>(".editor-mention[data-mention-selected]").forEach((mention) => {
      mention.removeAttribute("data-mention-selected");
      mention.querySelector<HTMLElement>("[data-mention-node-visual]")?.style.removeProperty("--mention-selection-top");
      mention.querySelector<HTMLElement>("[data-mention-node-visual]")?.style.removeProperty("--mention-selection-height");
      mention.querySelector<HTMLElement>("[data-mention-node-visual]")?.style.removeProperty("--mention-selection-left");
      mention.querySelector<HTMLElement>("[data-mention-node-visual]")?.style.removeProperty("--mention-selection-width");
    });
  }, []);

  const syncMentionSelection = useCallback((editor: HTMLElement, range: Range | null) => {
    clearMentionSelection(editor);
    if (!range || range.collapsed) return;
    editor.querySelectorAll<HTMLElement>(".editor-mention").forEach((mention) => {
      try {
        if (range.intersectsNode(mention)) {
          mention.setAttribute("data-mention-selected", "true");
          const icon = mention.querySelector<HTMLElement>("[data-mention-node-visual]");
          const label = mention.querySelector<HTMLElement>(".editor-mention__label");
          if (icon && label) {
            const labelRange = document.createRange();
            labelRange.selectNodeContents(label);
            const labelRect = labelRange.getBoundingClientRect();
            let textRect = labelRect;
            const iconRect = icon.getBoundingClientRect();
            // Native selection uses the editable text's font box, which can be
            // taller than the box inside a noneditable Call in WebView2.
            const block = mention.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, [data-his-table-cell]");
            if (block) {
              const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
              const centerY = iconRect.top + iconRect.height / 2;
              let text = walker.nextNode();
              while (text) {
                if (text.textContent?.trim() && !text.parentElement?.closest(".editor-mention, [data-editor-ui]")) {
                  const nearbyRange = document.createRange();
                  nearbyRange.selectNodeContents(text);
                  const sameLine = Array.from(nearbyRange.getClientRects()).find((rect) => rect.top <= centerY && rect.bottom >= centerY);
                  if (sameLine) { textRect = sameLine; break; }
                }
                text = walker.nextNode();
              }
            }
            const mentionRect = mention.getBoundingClientRect();
            icon.style.setProperty("--mention-selection-left", (mentionRect.left - iconRect.left) + "px");
            icon.style.setProperty("--mention-selection-width", (labelRect.left - mentionRect.left) + "px");
            icon.style.setProperty("--mention-selection-top", (textRect.top - iconRect.top) + "px");
            icon.style.setProperty("--mention-selection-height", textRect.height + "px");
          }
        }
      } catch {
        // Hydration will reconcile a mention that was detached mid-selection.
      }
    });
  }, [clearMentionSelection]);

  const isTextEntryElement = useCallback((element: Element | null) => {
    return isEditableElement(element);
  }, []);

  const selectAllBlocks = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const blocks = Array.from(editor.querySelectorAll<HTMLElement>(blockSelector)).filter(isRootEditorBlock);
    if (!blocks.length) return;
    clearNativeSelection();
    clearLineSelection();
    blocks.forEach((block) => {
      block.setAttribute("data-line-selected", "true");
      block.contentEditable = "false";
    });
    setSelectedLineBlocks(blocks);
    setLineActionBlock(null);
    controls.setLineControl(null);
    editor.focus({ preventScroll: true });
  }, [blockSelector, clearLineSelection, clearNativeSelection, controls, editorRef, isRootEditorBlock, setLineActionBlock, setSelectedLineBlocks]);

  const updateSelectionToolbar = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editor && rangeBelongsToEditor(range, editor)) {
      savedTextRangeRef.current = range.cloneRange();
    }
    if (
      !selection ||
      !editor ||
      controls.isDraggingLine ||
      !selection.rangeCount ||
      selection.isCollapsed ||
      !selection.toString().trim() ||
      !range ||
      !rangeBelongsToEditor(range, editor)
    ) {
      clearMentionSelection(editor);
      setSelectionToolbar(null);
      return;
    }
    syncMentionSelection(editor, range);
    const rect = range.getBoundingClientRect();
    const toolbarWidth = 190;
    setSelectionToolbar({
      left: Math.min(
        Math.max(8, rect.left + (rect.width - toolbarWidth) / 2),
        window.innerWidth - toolbarWidth - 8,
      ),
      top:
        rect.top - 48 >= 8
          ? rect.top - 48
          : Math.min(window.innerHeight - 48, rect.bottom + 8),
      marks: readInlineMarkState(range, editor),
    });
  }, [clearMentionSelection, controls.isDraggingLine, editorRef, savedTextRangeRef, setSelectionToolbar, syncMentionSelection]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const active = document.activeElement;
      if (active instanceof Element && active.closest("[data-selection-toolbar]")) return;
      updateSelectionToolbar();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearMentionSelection(editorRef.current);
    };
  }, [clearMentionSelection, editorRef, updateSelectionToolbar]);

  const updatePlaceholder = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!editor) return;
    const activeElement = document.activeElement;
    const caretInEditor = Boolean(
      selection?.rangeCount &&
      selection.isCollapsed &&
      selection.anchorNode &&
      editor.contains(selection.anchorNode) &&
      activeElement &&
      editor.contains(activeElement),
    );
    if (!caretInEditor) {
      setPlaceholderBlock(null);
      return;
    }
    const block = getTextEditorBlock(selection!.focusNode);
    if (
      block &&
      !block.matches("[data-divider]") &&
      !block.textContent?.trim() &&
      !block.querySelector("img, .editor-mention")
    ) {
      setPlaceholderBlock(block);
    } else {
      setPlaceholderBlock(null);
    }
  }, [editorRef, getEditorBlock, getTextEditorBlock, isLineEmpty, isRootEditorBlock, setPlaceholderBlock, textLineSelector]);

  return {
    isTextEntryElement,
    selectAllBlocks,
    updateSelectionToolbar,
    updatePlaceholder,
  };
}
