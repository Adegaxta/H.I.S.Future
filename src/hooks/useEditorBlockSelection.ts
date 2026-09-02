import { useCallback } from "react";
import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";

interface UseEditorBlockSelectionOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  textLineSelector: string;
  setSelectedLineBlocks: Dispatch<SetStateAction<HTMLElement[]>>;
  getTextEditorBlock: (source: Node | null) => HTMLElement | null;
  clearLineSelection: () => void;
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
  selectedLineBlocks: HTMLElement[];
}

export function useEditorBlockSelection({
  editorRef,
  textLineSelector,
  setSelectedLineBlocks,
  getTextEditorBlock,
  clearLineSelection,
  blockSelectionRef,
  blockSelection,
  setBlockSelection,
}: UseEditorBlockSelectionOptions) {
  const beginSelection = useCallback((event: PointerEvent<HTMLDivElement>) => {
  const editor = editorRef.current;
  if (!editor) return false;

  const target = event.target as HTMLElement;

  // Nunca iniciar el cuadro desde botones, controles, menciones,
  // imágenes, elementos interactivos o la cabecera del nodo.
  const isBlockedTarget = Boolean(
    target.closest(
      [
        "button",
        "[data-line-control]",
        "[data-page-index-item]",
        "[data-page-index]",
        "[data-mention-id]",
        ".editor-mention",
        "[data-no-resize='true']",
        "img",
        "[data-globe-icon]",
        "[data-node-header]",
        ".node-header",
      ].join(", "),
    ),
  );

  if (isBlockedTarget) return false;

  // Si el puntero está sobre texto/contenido real, dejar que
  // el editor se comporte normalmente.
  const textBlock = getTextEditorBlock(target);

  // Un bloque de texto, incluso vacío, sigue siendo una superficie editable.
  // La selección rectangular solo debe comenzar en el fondo libre del editor.
  if (textBlock) return false;

  // Llegados aquí estamos en una zona vacía de la superficie
  // del editor. No necesitamos encontrar un bloque para permitir
  // el inicio de la selección.
  if (!editor.contains(target)) return false;

  if (event.button !== 0 || (event.buttons & 1) === 0) {
    return false;
  }

  const selection = window.getSelection();
  selection?.removeAllRanges();

  if (
    document.activeElement instanceof HTMLElement &&
    editor.contains(document.activeElement)
  ) {
    document.activeElement.blur();
  }

  blockSelectionRef.current = {
    x: event.clientX,
    y: event.clientY,
  };

  setBlockSelection(null);

  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();

  return true;
}, [
  blockSelectionRef,
  editorRef,
  getTextEditorBlock,
  setBlockSelection,
]);

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

    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement && editorRef.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    const left = Math.min(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY);
    setBlockSelection({
      left,
      top,
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    });
  }, [blockSelectionRef, editorRef, setBlockSelection]);

  return {
    beginSelection,
    finalizeSelectionBox,
    onEditorSelectionMove,
  };
}
