import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MouseEvent, PointerEvent, SetStateAction } from "react";
import type { LineControlState, PickerState } from "../types/nodes";

interface UseEditorBlocksOptions {
  editorRef: React.RefObject<HTMLDivElement | null>;
  blockSelector: string;
  textLineSelector: string;
  selectedLineBlocks: HTMLElement[];
  lineActionBlock: HTMLElement | null;
  setSelectedLineBlocks: Dispatch<SetStateAction<HTMLElement[]>>;
  setLineActionBlock: Dispatch<SetStateAction<HTMLElement | null>>;
  setPlaceholderBlock: Dispatch<SetStateAction<HTMLElement | null>>;
  setSelectionToolbar: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  controls: {
    lineControl: LineControlState | null;
    setLineControl: Dispatch<SetStateAction<LineControlState | null>>;
    isDraggingLine: boolean;
    setIsDraggingLine: Dispatch<SetStateAction<boolean>>;
    draggedLineRef: React.MutableRefObject<HTMLElement | null>;
    draggedLinesRef: React.MutableRefObject<HTMLElement[]>;
    didDragLineRef: React.MutableRefObject<boolean>;
    lineDropRef: React.MutableRefObject<{ block: HTMLElement; before: boolean; inside: boolean } | null>;
    clearBlockControls: () => void;
  };
  imageResizeRef: React.MutableRefObject<{
    image: HTMLImageElement;
    startX: number;
    startWidth: number;
  } | null>;
  lastPointerRef: React.MutableRefObject<{ x: number; y: number }>;
  pickers: {
    setSlashPicker: Dispatch<SetStateAction<PickerState | null>>;
    setSlashPickerIndex: Dispatch<SetStateAction<number>>;
    setCallPicker: Dispatch<SetStateAction<PickerState | null>>;
    setPickerPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  };
  getEditorBlock: (source: Node | null) => HTMLElement | null;
  getLineControlBlock: (source: Node | null) => HTMLElement | null;
  isRootEditorBlock: (block: HTMLElement) => boolean;
  clearLineSelection: () => void;
  syncContent: () => void;
  updatePlaceholder: () => void;
  captureStructuralUndo: () => void;
  isLineEmpty: (block: HTMLElement) => boolean;
}

export function useEditorBlocks({
  editorRef,
  blockSelector,
  textLineSelector,
  selectedLineBlocks,
  lineActionBlock,
  setSelectedLineBlocks,
  setLineActionBlock,
  setPlaceholderBlock,
  setSelectionToolbar,
  controls,
  imageResizeRef,
  lastPointerRef,
  pickers,
  getEditorBlock,
  getLineControlBlock,
  isRootEditorBlock,
  clearLineSelection,
  syncContent,
  updatePlaceholder,
  captureStructuralUndo,
  isLineEmpty,
}: UseEditorBlocksOptions) {
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  const generatedLinesRef = useRef<HTMLElement[]>([]);
  const duplicateDragRef = useRef(false);

  const rememberGeneratedLine = useCallback((line: HTMLElement) => {
    generatedLinesRef.current = [
      ...generatedLinesRef.current.filter((item) => item.isConnected),
      line,
    ];
  }, []);

  const clearGeneratedLines = useCallback(() => {
    generatedLinesRef.current = [];
  }, []);

  const insertLine = useCallback((block: HTMLElement, before: boolean) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(block)) return;
    captureStructuralUndo();
    const line = document.createElement("p");
    line.removeAttribute("style");
    line.appendChild(document.createElement("br"));
    block.parentNode?.insertBefore(line, before ? block : block.nextSibling);
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    rememberGeneratedLine(line);
    updatePlaceholder();
    line.scrollIntoView({ block: "nearest" });
    syncContent();
    controls.setLineControl(null);
  }, [captureStructuralUndo, controls, editorRef, rememberGeneratedLine, syncContent, updatePlaceholder]);

  const ensureEditorLine = useCallback(() => {
    const editor = editorRef.current;
    const hasRootBlock = Array.from(
      editor?.querySelectorAll<HTMLElement>(blockSelector) || [],
    ).some((line) => isRootEditorBlock(line));
    if (!editor || hasRootBlock) return false;
    const line = document.createElement("p");
    line.appendChild(document.createElement("br"));
    editor.appendChild(line);
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    return true;
  }, [blockSelector, editorRef, isRootEditorBlock]);

  const removeLine = useCallback((block: HTMLElement) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(block)) return;
    captureStructuralUndo();
    const globeContent = block.closest("[data-globe-content]") as HTMLElement | null;
    const rootCandidates = globeContent
      ? Array.from(globeContent.querySelectorAll<HTMLElement>(textLineSelector))
      : Array.from(editor.querySelectorAll<HTMLElement>(textLineSelector)).filter(
          (line) => line !== block && isRootEditorBlock(line),
        );
    const candidates = rootCandidates.filter((line) => line !== block);
    const nextLine = candidates.find(
      (line) => block.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const previousLine = [...candidates].reverse().find(
      (line) => block.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING,
    );
    block.remove();
    const focusLine = nextLine || previousLine;
    if (!candidates.length) {
      const line = document.createElement("p");
      line.removeAttribute("style");
      line.appendChild(document.createElement("br"));
      if (globeContent) {
        globeContent.appendChild(line);
      } else {
        editor.appendChild(line);
      }
    } else if (focusLine && !focusLine.matches("[data-divider]")) {
      const range = document.createRange();
      range.selectNodeContents(focusLine);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    editor.focus();
    generatedLinesRef.current = generatedLinesRef.current.filter(
      (line) => line !== block,
    );
    clearLineSelection();
    controls.clearBlockControls();
    setPlaceholderBlock(null);
    syncContent();
  }, [captureStructuralUndo, clearLineSelection, controls, editorRef, isRootEditorBlock, setPlaceholderBlock, syncContent, textLineSelector]);

  const hasTextLineAfter = useCallback((block: HTMLElement) => {
    const editor = editorRef.current;
    if (!editor) return false;
    const lines = Array.from(
      editor.querySelectorAll<HTMLElement>(
        "p, h1, h2, h3, h4, blockquote, li, [data-divider]",
      ),
    );
    const blockIndex = lines.indexOf(block);
    return lines
      .slice(blockIndex + 1)
      .some((line) => Boolean(line.textContent?.trim()));
  }, [editorRef]);

  const deleteSelectedLine = useCallback(() => {
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const targets = blocks.length
      ? blocks
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : [];
    if (!targets.length) return;
    targets.forEach((block) => removeLine(block));
    pickers.setPickerPosition(null);
    pickers.setSlashPicker(null);
    setLineActionBlock(null);
  }, [lineActionBlock, pickers, removeLine, selectedLineBlocks, setLineActionBlock]);

  const openLineCommands = useCallback((block: HTMLElement, anchor?: HTMLElement) => {
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    const range = document.createRange();
    if (block.matches("[data-globe], [data-divider]")) range.selectNode(block);
    else range.selectNodeContents(block);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorRef.current?.focus();
    setSelectionToolbar(null);
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    if (!selected.includes(block)) {
      clearLineSelection();
      setSelectedLineBlocks([]);
      block.setAttribute("data-line-selected", "true");
    }
    setLineActionBlock(block);
    const rect = block.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect() || rect;
    pickers.setSlashPicker(
      block.matches("[data-divider]")
        ? null
        : { query: "", hasTrigger: false },
    );
    pickers.setSlashPickerIndex(0);
    pickers.setCallPicker(null);
    pickers.setPickerPosition({
      top: Math.min(window.innerHeight - 236, anchorRect.bottom + 8),
      left: Math.min(window.innerWidth - 236, Math.max(8, anchorRect.left)),
    });
  }, [clearLineSelection, editorRef, imageResizeRef, pickers, selectedLineBlocks, setLineActionBlock, setSelectedLineBlocks, setSelectionToolbar]);

  const duplicateLine = useCallback((target: HTMLElement, before: boolean, inside = false) => {
    const dragged = controls.draggedLineRef.current;
    if (!dragged) return;
    const draggedLines = controls.draggedLinesRef.current.length
      ? controls.draggedLinesRef.current
      : [dragged];
    if (draggedLines.includes(target)) return;
    captureStructuralUndo();
    const clones = draggedLines.map((line) => {
      const clone = line.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-line-dragging");
      clone.removeAttribute("data-line-selected");
      clone.removeAttribute("data-line-drop-target");
      clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      clone.querySelectorAll("[data-page-index-id]").forEach((node) => node.removeAttribute("data-page-index-id"));
      clone.querySelectorAll("[data-line-dragging], [data-line-selected], [data-line-drop-target]").forEach((node) => {
        node.removeAttribute("data-line-dragging");
        node.removeAttribute("data-line-selected");
        node.removeAttribute("data-line-drop-target");
      });
      return clone;
    });
    if (inside) {
      const content = target.matches("[data-globe]")
        ? target.querySelector<HTMLElement>("[data-globe-content]")
        : target;
      clones.forEach((line) => content?.appendChild(line));
    } else {
      const reference = before ? target : target.nextSibling;
      clones.forEach((line) => target.parentNode?.insertBefore(line, reference));
    }
    clones.forEach((line) => {
      line.removeAttribute("data-line-dragging");
      line.removeAttribute("data-line-selected");
      if (line.matches("[data-divider]")) line.contentEditable = "false";
    });
    target.removeAttribute("data-line-drop-target");
    syncContent();
    controls.draggedLineRef.current = null;
    controls.draggedLinesRef.current = [];
    setSelectedLineBlocks([]);
  }, [captureStructuralUndo, controls, setSelectedLineBlocks, syncContent]);

  const updateDragPreview = useCallback((block: HTMLElement, x: number, y: number) => {
    const preview = dragPreviewRef.current ?? document.createElement("div");
    if (!dragPreviewRef.current) {
      preview.setAttribute("aria-hidden", "true");
      preview.style.position = "fixed";
      preview.style.pointerEvents = "none";
      preview.style.zIndex = "99999";
      preview.style.left = "0px";
      preview.style.top = "0px";
      preview.style.transformOrigin = "left top";
      preview.style.padding = "0";
      preview.style.margin = "0";
      preview.style.border = "none";
      preview.style.background = "transparent";
      preview.style.boxShadow = "none";
      preview.style.borderRadius = "0";
      preview.style.display = "inline-block";
      document.body.appendChild(preview);
      dragPreviewRef.current = preview;
    }

    const computed = getComputedStyle(block);
    const clone = block.cloneNode(true) as HTMLElement;
    const rect = block.getBoundingClientRect();
    clone.removeAttribute("data-line-dragging");
    clone.removeAttribute("data-line-selected");
    clone.removeAttribute("data-line-drop-target");
    clone.style.pointerEvents = "none";
    clone.style.position = "relative";
    clone.style.margin = "0";
    clone.style.display = "block";
    clone.style.width = `${Math.max(rect.width, 120)}px`;
    clone.style.minWidth = "0";
    clone.style.maxWidth = "none";
    clone.style.minHeight = "0";
    clone.style.height = "auto";
    clone.style.overflow = "visible";
    clone.style.filter = "none";
    clone.style.padding = "0";
    clone.style.border = "none";
    clone.style.background = "transparent";
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    clone.style.fontSize = computed.fontSize;
    clone.style.fontFamily = computed.fontFamily;
    clone.style.fontWeight = computed.fontWeight;
    clone.style.lineHeight = computed.lineHeight;
    clone.style.letterSpacing = computed.letterSpacing;
    clone.style.textTransform = computed.textTransform;
    clone.style.whiteSpace = computed.whiteSpace;
    clone.querySelectorAll("[data-line-dragging], [data-line-selected], [data-line-drop-target]").forEach((node) => {
      node.removeAttribute("data-line-dragging");
      node.removeAttribute("data-line-selected");
      node.removeAttribute("data-line-drop-target");
    });

    const opacity = 0.28 + Math.min(rect.height / 220, 0.46);
    preview.innerHTML = "";
    preview.appendChild(clone);
    preview.style.opacity = String(Math.min(0.9, opacity));
    preview.style.transform = "none";
    preview.style.left = `${x + 18}px`;
    preview.style.top = `${y + 18}px`;
    preview.style.width = `${Math.max(rect.width, 120)}px`;
    preview.style.boxShadow = "none";
    preview.style.border = "none";
    preview.style.background = "transparent";
    preview.style.color = computed.color || "#E8E9EA";
  }, []);

  const clearDragPreview = useCallback(() => {
    if (dragPreviewRef.current) {
      dragPreviewRef.current.remove();
      dragPreviewRef.current = null;
    }
  }, []);

  const moveLine = useCallback((target: HTMLElement, before: boolean, inside = false) => {
    const dragged = controls.draggedLineRef.current;
    if (!dragged || dragged === target || dragged.contains(target)) return;
    const draggedLines = controls.draggedLinesRef.current.length
      ? controls.draggedLinesRef.current
      : [dragged];
    if (draggedLines.includes(target)) return;
    captureStructuralUndo();
    draggedLines.forEach((line) => line.remove());
    if (inside) {
      const content = target.matches("[data-globe]")
        ? target.querySelector<HTMLElement>("[data-globe-content]")
        : target;
      draggedLines.forEach((line) => content?.appendChild(line));
    } else {
      const reference = before ? target : target.nextSibling;
      draggedLines.forEach((line) => target.parentNode?.insertBefore(line, reference));
    }
    draggedLines.forEach((line) => {
      line.removeAttribute("data-line-dragging");
      line.removeAttribute("data-line-selected");
    });
    target.removeAttribute("data-line-drop-target");
    syncContent();
    controls.draggedLineRef.current = null;
    controls.draggedLinesRef.current = [];
    setSelectedLineBlocks([]);
  }, [captureStructuralUndo, controls, setSelectedLineBlocks, syncContent]);

  const updateLineControlAt = useCallback((clientX: number, clientY: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    const elementsUnderPointer = Array.from(document.elementsFromPoint(clientX, clientY));
    let block = elementsUnderPointer
      .map((element) => element.closest(blockSelector) as HTMLElement | null)
      .find((candidate): candidate is HTMLElement => {
        if (!candidate || candidate === editor || !editor.contains(candidate)) return false;
        return isRootEditorBlock(candidate);
      }) ?? null;

    if (!block) {
      block = getLineControlBlock(document.elementFromPoint(clientX, clientY));
    }
    if (!block) {
      block = Array.from(editor.querySelectorAll<HTMLElement>(blockSelector)).find((candidate) => {
        if (!isRootEditorBlock(candidate)) return false;
        const rect = candidate.getBoundingClientRect();
        return clientY >= rect.top && clientY <= rect.bottom;
      }) || null;
    }

    if (!block) {
      controls.setLineControl(null);
      return;
    }

    if (block.matches("[data-divider]")) setPlaceholderBlock(null);

    const rect = block.getBoundingClientRect();
    const blockMid = rect.top + rect.height / 2;
    const pointerInside = clientY >= rect.top && clientY <= rect.bottom;
    let before = clientY < blockMid;

    if (pointerInside && Math.abs(clientY - blockMid) <= Math.min(12, rect.height * 0.08)) {
      before = clientY <= blockMid;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && selection.anchorNode && block.contains(selection.anchorNode) && !pointerInside) {
      const range = selection.getRangeAt(0);
      const anchorRect = range.getBoundingClientRect();
      const hasCaretRect = anchorRect && (anchorRect.width > 0 || anchorRect.height > 0);
      if (hasCaretRect) {
        before = anchorRect.top + anchorRect.height / 2 < blockMid;
      } else if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
        const anchorElement = selection.anchorNode.parentElement;
        if (anchorElement && block.contains(anchorElement)) {
          const anchorBounds = anchorElement.getBoundingClientRect();
          before = anchorBounds.top + anchorBounds.height / 2 < blockMid;
        }
      }
    }

    controls.setLineControl({
      block,
      top: rect.top,
      left: Math.max(8, rect.left - 30),
      before,
      nearLeft: clientX <= rect.left + 140,
      hasContent: !isLineEmpty(block),
      inside: false,
      pointerY: clientY,
    });
  }, [blockSelector, controls, editorRef, getLineControlBlock, isLineEmpty, isRootEditorBlock, setPlaceholderBlock]);

  const updateLineControl = useCallback((event: MouseEvent<HTMLDivElement>) => {
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    if (controls.isDraggingLine) return;
    updateLineControlAt(event.clientX, event.clientY);
  }, [controls.isDraggingLine, lastPointerRef, updateLineControlAt]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleScroll = () => {
      if (controls.draggedLineRef.current) return;
      if (lastPointerRef.current === null) return;
      const editor = editorRef.current;
      if (!editor) return;
      const raf = window.requestAnimationFrame(() => {
        updateLineControlAt(lastPointerRef.current.x, lastPointerRef.current.y);
      });
      return () => window.cancelAnimationFrame(raf);
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [controls.draggedLineRef, editorRef, lastPointerRef, updateLineControlAt]);

  const completeLineDrag = useCallback((block: HTMLElement, commit: boolean) => {
    const dragged = controls.draggedLineRef.current;
    if (!dragged) return;
    const drop = controls.lineDropRef.current;
    if (commit && controls.didDragLineRef.current && drop) {
      if (duplicateDragRef.current) {
        duplicateLine(drop.block, drop.before, drop.inside);
      } else {
        moveLine(drop.block, drop.before, drop.inside);
      }
    }
    controls.draggedLinesRef.current.forEach((line) => {
      line.removeAttribute("data-line-dragging");
      line.removeAttribute("data-line-selected");
    });
    dragged.removeAttribute("data-line-dragging");
    editorRef.current?.querySelector("[data-line-drop-target]")?.removeAttribute("data-line-drop-target");
    controls.draggedLineRef.current = null;
    controls.lineDropRef.current = null;
    clearDragPreview();
    document.body.style.cursor = "default";
    controls.setIsDraggingLine(false);
    controls.setLineControl(null);
    if (commit && !controls.didDragLineRef.current && !duplicateDragRef.current) openLineCommands(block);
    duplicateDragRef.current = false;
    controls.didDragLineRef.current = false;
  }, [clearDragPreview, controls, duplicateLine, editorRef, moveLine, openLineCommands]);

  const startLineDrag = useCallback((block: HTMLElement, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectionToolbar(null);
    duplicateDragRef.current = event.altKey;
    if (isLineEmpty(block)) {
      if (!hasTextLineAfter(block)) removeLine(block);
      else openLineCommands(block);
      return;
    }
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const draggedLines = selected.includes(block) ? selected : [block];
    controls.draggedLinesRef.current = draggedLines;
    controls.draggedLineRef.current = block;
    controls.didDragLineRef.current = false;
    controls.lineDropRef.current = null;
    draggedLines.forEach((line) => line.setAttribute("data-line-dragging", "true"));
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = duplicateDragRef.current ? "copy" : "grabbing";
    updateDragPreview(block, event.clientX, event.clientY);
    controls.setIsDraggingLine(true);
  }, [controls, hasTextLineAfter, isLineEmpty, openLineCommands, removeLine, selectedLineBlocks, setSelectionToolbar, updateDragPreview]);

  const moveLineDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const dragged = controls.draggedLineRef.current;
    const editor = editorRef.current;
    if (!dragged || !editor) return;
    event.preventDefault();
    updateDragPreview(dragged, event.clientX, event.clientY);
    const drop = getEditorBlock(document.elementFromPoint(event.clientX, event.clientY));
    const target = drop;
    if (!target || target === dragged) return;
    controls.didDragLineRef.current = true;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const inside = target.matches("[data-globe]") && event.clientX > rect.left + 48 && event.clientY >= rect.top && event.clientY <= rect.bottom;
    editor.querySelector("[data-line-drop-target]")?.removeAttribute("data-line-drop-target");
    target.setAttribute("data-line-drop-target", "true");
    controls.lineDropRef.current = { block: target, before, inside };
    controls.setLineControl({
      block: target,
      top: rect.top + Math.max(0, (rect.height - 24) / 2),
      left: Math.max(8, rect.left - 68),
      before,
      nearLeft: false,
      hasContent: true,
      inside,
    });
  }, [controls, editorRef, getEditorBlock, updateDragPreview]);

  const finishLineDrag = useCallback((block: HTMLElement, event: PointerEvent<HTMLButtonElement>) => {
    if (!controls.draggedLineRef.current) return;
    event.preventDefault();
    completeLineDrag(block, true);
  }, [completeLineDrag, controls.draggedLineRef]);

  return {
    dragPreviewRef,
    generatedLinesRef,
    rememberGeneratedLine,
    clearGeneratedLines,
    insertLine,
    ensureEditorLine,
    removeLine,
    hasTextLineAfter,
    deleteSelectedLine,
    openLineCommands,
    duplicateLine,
    updateDragPreview,
    clearDragPreview,
    moveLine,
    updateLineControlAt,
    updateLineControl,
    startLineDrag,
    moveLineDrag,
    finishLineDrag,
    completeLineDrag,
  };
}
