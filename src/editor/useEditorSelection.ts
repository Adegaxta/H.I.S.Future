import { useCallback } from "react";
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import type { LineControlState } from "./types";
import { isEditableElement } from "../utils/dom";

interface UseEditorSelectionOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  blockSelector: string;
  textLineSelector: string;
  setSelectedLineBlocks: Dispatch<SetStateAction<HTMLElement[]>>;
  setLineActionBlock: Dispatch<SetStateAction<HTMLElement | null>>;
  setSelectionToolbar: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
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
  setPlaceholderBlock,
  controls,
  getEditorBlock,
  getTextEditorBlock,
  isRootEditorBlock,
  isLineEmpty,
  clearLineSelection,
  clearNativeSelection,
}: UseEditorSelectionOptions) {
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
    editor.focus();
  }, [blockSelector, clearLineSelection, clearNativeSelection, controls, editorRef, isRootEditorBlock, setLineActionBlock, setSelectedLineBlocks]);

  const updateSelectionToolbar = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (
      !selection ||
      !editor ||
      controls.isDraggingLine ||
      !selection.rangeCount ||
      selection.isCollapsed ||
      !selection.toString().trim() ||
      !editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      setSelectionToolbar(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
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
    });
  }, [controls.isDraggingLine, editorRef, setSelectionToolbar]);

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
