import { useCallback } from "react";
import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { LineControlState } from "../types/nodes";

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
  blockSelectionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  blockSelection: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  setBlockSelection: Dispatch<SetStateAction<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>>;
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
  blockSelectionRef,
  blockSelection,
  setBlockSelection,
}: UseEditorSelectionOptions) {
  const isTextEntryElement = useCallback((element: Element | null) => {
    if (!element) return false;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
    return element instanceof HTMLElement && element.isContentEditable;
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
    if (!selection?.rangeCount) {
      const line = editor.querySelector<HTMLElement>(
        "[data-globe-content] p, " + textLineSelector,
      );
      if (
        line &&
        (isRootEditorBlock(line) || line.closest("[data-globe-content]")) &&
        isLineEmpty(line)
      ) {
        setPlaceholderBlock(line);
      }
      return;
    }
    const block = getTextEditorBlock(selection.focusNode) || getEditorBlock(selection.focusNode);
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

  const finalizeSelectionBox = useCallback(() => {
    if (!blockSelectionRef.current || !blockSelection) return;
    const editor = editorRef.current;
    if (editor && blockSelection.width > 6 && blockSelection.height > 6) {
      const selected = Array.from(editor.querySelectorAll<HTMLElement>(textLineSelector)).filter((block) => {
        const rect = block.getBoundingClientRect();
        return rect.right >= blockSelection.left &&
          rect.left <= blockSelection.left + blockSelection.width &&
          rect.bottom >= blockSelection.top &&
          rect.top <= blockSelection.top + blockSelection.height;
      });

      if (selected.length) {
        clearLineSelection();
        selected.forEach((block) => {
          block.setAttribute("data-line-selected", "true");
          if (!block.matches("[data-divider], [data-globe], [data-page-index]")) block.contentEditable = "false";
        });
        setSelectedLineBlocks(selected);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement && editor.contains(document.activeElement)) {
          document.activeElement.blur();
        }
      } else {
        const selection = window.getSelection();
        selection?.removeAllRanges();
      }
    }

    blockSelectionRef.current = null;
    setBlockSelection(null);
  }, [blockSelection, blockSelectionRef, clearLineSelection, editorRef, setBlockSelection, setSelectedLineBlocks, textLineSelector]);

  const onEditorSelectionMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = blockSelectionRef.current;
    if (!start || (event.buttons & 1) === 0) {
      blockSelectionRef.current = null;
      setBlockSelection(null);
      return;
    }
    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = Math.abs(event.clientY - start.y);
    if (deltaX < 8 && deltaY < 8) return;
    const left = Math.min(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY);
    setBlockSelection({
      left,
      top,
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    });
  }, [blockSelectionRef, setBlockSelection]);

  return {
    isTextEntryElement,
    selectAllBlocks,
    updateSelectionToolbar,
    updatePlaceholder,
    finalizeSelectionBox,
    onEditorSelectionMove,
  };
}
