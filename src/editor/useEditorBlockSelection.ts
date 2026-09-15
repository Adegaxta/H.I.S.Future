import { useCallback, useEffect, useRef } from "react";
import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import { EDITOR_NON_EDITABLE_BLOCK_SELECTOR, keepOutermostBlocks } from "./blockModel";

interface UseEditorBlockSelectionOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  textLineSelector: string;
  setSelectedLineBlocks: Dispatch<SetStateAction<HTMLElement[]>>;
  getTextEditorBlock: (source: Node | null) => HTMLElement | null;
  clearLineSelection: () => void;
  blockSelectionRef: React.MutableRefObject<BlockSelectionOrigin | null>;
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

export interface BlockSelectionOrigin {
  x: number;
  y: number;
  scrollOrigins: Array<{
    element: HTMLElement | null;
    left: number;
    top: number;
  }>;
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
  selectedLineBlocks,
}: UseEditorBlockSelectionOptions) {
  const selectionPointerRef = useRef({ x: 0, y: 0, buttons: 0 });
  const selectionBoxRef = useRef<typeof blockSelection>(null);

  const clearSelectionBox = useCallback(() => {
    blockSelectionRef.current = null;
    selectionBoxRef.current = null;
    setBlockSelection(null);
  }, [blockSelectionRef, setBlockSelection]);

  const beginSelection = useCallback((event: PointerEvent<HTMLDivElement>) => {
  const editor = editorRef.current;
  if (!editor) return false;

  const target = event.target as HTMLElement;
  const selectionModifier = event.ctrlKey || event.metaKey || event.shiftKey;

  // beforeContent (cabeceras y controles propios de cada Nodo) comparte la
  // superficie visual con el editor, pero no forma parte del lienzo editable.
  // Si el puntero nace allí, conservar por completo su interacción nativa.
  if (!editor.contains(target) && target !== event.currentTarget) return false;

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
        ".page-node-header",
      ].join(", "),
    ),
  );

  if (isBlockedTarget) return false;

  // A text block must accept a caret on the very first click, including content
  // imported from another editor that has not been normalized yet. Rectangle
  // selection can still start over text while a selection modifier is held.
  const directTextTarget = target.closest(textLineSelector);
  const textBlock = directTextTarget ? getTextEditorBlock(target) : null;
  if (textBlock && selectedLineBlocks.includes(textBlock)) {
    clearLineSelection();
    setSelectedLineBlocks([]);
    return false;
  }
  if (textBlock && !selectionModifier) return false;

  // La superficie envolvente también puede iniciar una selección rectangular
  // en el espacio vacío posterior al último bloque.
  const selectionSurface = editor.parentElement ?? editor;
  if (!selectionSurface.contains(target)) return false;

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

  // El cuadro es fijo al viewport: el origen debe permanecer estable mientras
  // el contenedor del editor se desplaza durante el arrastre.
  const scrollOrigins: BlockSelectionOrigin["scrollOrigins"] = [];
  let scrollParent: HTMLElement | null = selectionSurface;
  while (scrollParent) {
    if (
      scrollParent !== document.body &&
      scrollParent !== document.documentElement &&
      (scrollParent.scrollHeight > scrollParent.clientHeight ||
        scrollParent.scrollWidth > scrollParent.clientWidth)
    ) {
      scrollOrigins.push({
        element: scrollParent,
        left: scrollParent.scrollLeft,
        top: scrollParent.scrollTop,
      });
    }
    scrollParent = scrollParent.parentElement;
  }
  scrollOrigins.push({ element: null, left: window.scrollX, top: window.scrollY });

  blockSelectionRef.current = {
    x: event.clientX,
    y: event.clientY,
    scrollOrigins,
  };
  selectionPointerRef.current = {
    x: event.clientX,
    y: event.clientY,
    buttons: event.buttons,
  };

  selectionBoxRef.current = null;
  setBlockSelection(null);

  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();

  return true;
}, [
  blockSelectionRef,
  editorRef,
  selectedLineBlocks,
  setSelectedLineBlocks,
  getTextEditorBlock,
  setBlockSelection,
]);

  const finalizeSelectionBox = useCallback(() => {
    if (!blockSelectionRef.current) return;
    const currentBox = selectionBoxRef.current ?? blockSelection;
    if (!currentBox) {
      clearSelectionBox();
      return;
    }
    const editor = editorRef.current;
    if (editor && currentBox.width > 6 && currentBox.height > 6) {
      const selectableBlocks = Array.from(
        editor.querySelectorAll<HTMLElement>(`${textLineSelector}, [data-globe]`),
      ).filter((block) => {
        const containingGlobe = block.closest<HTMLElement>("[data-globe]");
        return !containingGlobe || containingGlobe === block;
      });
      const intersecting = selectableBlocks.filter((block) => {
        const rect = block.getBoundingClientRect();
        return rect.right >= currentBox.left &&
          rect.left <= currentBox.left + currentBox.width &&
          rect.bottom >= currentBox.top &&
          rect.top <= currentBox.top + currentBox.height;
      });
      const selected = keepOutermostBlocks(intersecting);

      if (selected.length) {
        clearLineSelection();
        selected.forEach((block) => {
          block.setAttribute("data-line-selected", "true");
          if (!block.matches(EDITOR_NON_EDITABLE_BLOCK_SELECTOR)) block.contentEditable = "false";
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

    clearSelectionBox();
  }, [blockSelection, blockSelectionRef, clearLineSelection, clearSelectionBox, editorRef, setSelectedLineBlocks, textLineSelector]);

  const updateSelectionBox = useCallback((clientX: number, clientY: number, preventDefault?: () => void) => {
    const start = blockSelectionRef.current;
    if (!start || (selectionPointerRef.current.buttons & 1) === 0) {
      clearSelectionBox();
      return;
    }

    selectionPointerRef.current.x = clientX;
    selectionPointerRef.current.y = clientY;
    const anchoredStart = start.scrollOrigins.reduce(
      (point, origin) => {
        const currentLeft = origin.element?.scrollLeft ?? window.scrollX;
        const currentTop = origin.element?.scrollTop ?? window.scrollY;
        return {
          x: point.x - (currentLeft - origin.left),
          y: point.y - (currentTop - origin.top),
        };
      },
      { x: start.x, y: start.y },
    );
    const endX = clientX;
    const endY = clientY;
    const deltaX = Math.abs(endX - anchoredStart.x);
    const deltaY = Math.abs(endY - anchoredStart.y);
    if (deltaX < 8 && deltaY < 8) return;

    preventDefault?.();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement && editorRef.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    const left = Math.min(anchoredStart.x, endX);
    const top = Math.min(anchoredStart.y, endY);
    const nextBox = {
      left,
      top,
      width: deltaX,
      height: deltaY,
    };
    selectionBoxRef.current = nextBox;
    setBlockSelection(nextBox);
  }, [blockSelectionRef, clearSelectionBox, editorRef, setBlockSelection]);

  const onEditorSelectionMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    selectionPointerRef.current.buttons = event.buttons;
    updateSelectionBox(event.clientX, event.clientY, event.preventDefault.bind(event));
  }, [updateSelectionBox]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!blockSelectionRef.current) return;
      selectionPointerRef.current.buttons = event.buttons;
      updateSelectionBox(event.clientX, event.clientY, event.preventDefault.bind(event));
    };
    const handleScroll = () => {
      if (!blockSelectionRef.current) return;
      const { x, y } = selectionPointerRef.current;
      updateSelectionBox(x, y);
    };
    const handlePointerUp = () => {
      if (blockSelectionRef.current) finalizeSelectionBox();
    };
    const handlePointerCancel = () => {
      selectionPointerRef.current.buttons = 0;
      clearSelectionBox();
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [blockSelectionRef, clearSelectionBox, finalizeSelectionBox, updateSelectionBox]);

  return {
    beginSelection,
    clearSelectionBox,
    finalizeSelectionBox,
    onEditorSelectionMove,
  };
}
