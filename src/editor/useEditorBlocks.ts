import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MouseEvent, PointerEvent, SetStateAction } from "react";
import type { LineControlState, PickerState } from "./types";

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
  lineCommandsOpenRef: React.MutableRefObject<boolean>;
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

function getEditorVisibleBounds(editor: HTMLElement) {
  const editorRect = editor.getBoundingClientRect();
  const scrollViewport = editor.closest<HTMLElement>(".workspace-main");
  const viewportRect = scrollViewport?.getBoundingClientRect();
  const workspaceHeader = document.querySelector<HTMLElement>(".workspace-header");
  const headerRect = workspaceHeader?.getBoundingClientRect();
  const headerOverlapsEditor = Boolean(
    headerRect &&
    headerRect.right > editorRect.left &&
    headerRect.left < editorRect.right,
  );

  return {
    top: Math.max(
      0,
      editorRect.top,
      viewportRect?.top ?? 0,
      headerOverlapsEditor ? headerRect!.bottom : 0,
    ),
    right: Math.min(window.innerWidth, editorRect.right, viewportRect?.right ?? window.innerWidth),
    bottom: Math.min(window.innerHeight, editorRect.bottom, viewportRect?.bottom ?? window.innerHeight),
    left: Math.max(0, viewportRect?.left ?? 0),
  };
}

const NON_CONTINUING_BLOCK_ATTRIBUTES = new Set([
  "data-his-synced",
  "data-his-todo-checked",
  "data-his-collapsed",
  "data-his-column",
  "data-his-column-layout",
]);

function copyContinuingBlockAttributes(source: HTMLElement, target: HTMLElement) {
  Array.from(source.attributes)
    .filter(({ name }) => name === "style" || (name.startsWith("data-his-") && !NON_CONTINUING_BLOCK_ATTRIBUTES.has(name)))
    .forEach(({ name, value }) => target.setAttribute(name, value));
}

function ensureDropdownContent(block: HTMLElement) {
  if (!block.hasAttribute("data-his-dropdown") || block.querySelector(":scope > [data-his-dropdown-content]")) return;
  const content = document.createElement("span");
  content.dataset.hisDropdownContent = "true";
  while (block.firstChild) content.appendChild(block.firstChild);
  block.appendChild(content);
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
  lineCommandsOpenRef,
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
  const pendingLineDragRef = useRef<{
    block: HTMLElement;
    button: HTMLButtonElement;
    pointerId: number;
    clientX: number;
    clientY: number;
    altKey: boolean;
    timer: number;
  } | null>(null);
  const lineControlRef = useRef<LineControlState | null>(controls.lineControl);
  lineControlRef.current = controls.lineControl;

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
    copyContinuingBlockAttributes(block, line);
    line.appendChild(document.createElement("br"));
    ensureDropdownContent(line);
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

  const splitLineAtSelection = useCallback((block: HTMLElement) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !editor.contains(block) || !selection?.rangeCount) return false;

    const selectedRange = selection.getRangeAt(0);
    const startsInsideBlock = selectedRange.startContainer === block || block.contains(selectedRange.startContainer);
    const endsInsideBlock = selectedRange.endContainer === block || block.contains(selectedRange.endContainer);
    if (!startsInsideBlock || !endsInsideBlock) return false;

    captureStructuralUndo();
    const caretRange = selectedRange.cloneRange();
    if (!caretRange.collapsed) {
      caretRange.deleteContents();
      caretRange.collapse(true);
    }

    const trailingRange = document.createRange();
    trailingRange.setStart(caretRange.startContainer, caretRange.startOffset);
    trailingRange.setEnd(block, block.childNodes.length);
    const trailingContent = trailingRange.extractContents();
    const hasTrailingContent = Boolean(
      trailingContent.textContent?.replace(/\u200b/g, "").trim() ||
      trailingContent.querySelector("img, [data-mention-id], [data-globe-icon]"),
    );
    const isHeading = /^H[1-6]$/.test(block.tagName);
    const nextLine = document.createElement(isHeading && !hasTrailingContent ? "p" : block.tagName.toLowerCase());

    copyContinuingBlockAttributes(block, nextLine);
    nextLine.appendChild(trailingContent);
    ensureDropdownContent(nextLine);
    if (isLineEmpty(block)) block.replaceChildren(document.createElement("br"));
    if (isLineEmpty(nextLine)) nextLine.replaceChildren(document.createElement("br"));
    block.parentNode?.insertBefore(nextLine, block.nextSibling);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(nextLine);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    editor.focus();
    rememberGeneratedLine(nextLine);
    updatePlaceholder();
    nextLine.scrollIntoView({ block: "nearest" });
    syncContent();
    controls.setLineControl(null);
    return true;
  }, [captureStructuralUndo, controls, editorRef, isLineEmpty, rememberGeneratedLine, syncContent, updatePlaceholder]);

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

  const removeLine = useCallback((
    block: HTMLElement,
    caretAtEnd = false,
    options: { captureUndo?: boolean; sync?: boolean } = {},
  ) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(block)) return;
    if (options.captureUndo !== false) captureStructuralUndo();
    const globeContent = block.closest("[data-globe-content]") as HTMLElement | null;
    const column = block.closest("[data-his-column]") as HTMLElement | null;
    const localScope = globeContent ?? column;
    const rootCandidates = localScope
      ? Array.from(localScope.children).filter(
          (candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.matches(blockSelector),
        )
      : Array.from(editor.querySelectorAll<HTMLElement>(textLineSelector)).filter(isRootEditorBlock);
    const candidates = rootCandidates.filter((line) => line !== block && !block.contains(line));
    const nextLine = candidates.find(
      (line) => block.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const previousLine = [...candidates].reverse().find(
      (line) => block.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING,
    );
    block.remove();
    let focusLine = nextLine || previousLine;
    if (!candidates.length && column && !globeContent) {
      const layout = column.parentElement?.matches("[data-his-column-layout]")
        ? column.parentElement
        : null;
      const layoutParent = layout?.parentNode ?? null;
      const columnsBeforeRemoval = layout
        ? Array.from(layout.querySelectorAll<HTMLElement>(":scope > [data-his-column]"))
        : [];
      const removedIndex = columnsBeforeRemoval.indexOf(column);
      column.remove();
      const remainingColumns = layout
        ? Array.from(layout.querySelectorAll<HTMLElement>(":scope > [data-his-column]"))
        : [];

      if (layout && layoutParent && remainingColumns.length === 1) {
        const remaining = remainingColumns[0];
        const remainingBlocks = Array.from(remaining.childNodes);
        remainingBlocks.forEach((child) => layoutParent.insertBefore(child, layout));
        layout.remove();
        focusLine = remainingBlocks
          .map((child) => child instanceof HTMLElement
            ? child.matches(textLineSelector) ? child : child.querySelector<HTMLElement>(textLineSelector)
            : null)
          .find((line): line is HTMLElement => Boolean(line));
      } else if (layout && layoutParent && remainingColumns.length === 0) {
        const line = document.createElement("p");
        line.contentEditable = "true";
        line.appendChild(document.createElement("br"));
        layoutParent.insertBefore(line, layout);
        layout.remove();
        rememberGeneratedLine(line);
        focusLine = line;
      } else if (remainingColumns.length > 1) {
        const adjacent = remainingColumns[Math.min(Math.max(removedIndex, 0), remainingColumns.length - 1)]
          ?? remainingColumns[remainingColumns.length - 1];
        focusLine = adjacent.querySelector<HTMLElement>(textLineSelector) ?? undefined;
      }
    } else if (!candidates.length) {
      const line = document.createElement("p");
      line.removeAttribute("style");
      line.appendChild(document.createElement("br"));
      line.contentEditable = "true";
      if (localScope) {
        localScope.appendChild(line);
      } else {
        editor.appendChild(line);
      }
      focusLine = line;
    }
    if (focusLine && !focusLine.matches("[data-divider]")) {
      const range = document.createRange();
      range.selectNodeContents(focusLine);
      range.collapse(!caretAtEnd);
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
    updatePlaceholder();
    if (options.sync !== false) syncContent();
  }, [blockSelector, captureStructuralUndo, clearLineSelection, controls, editorRef, isRootEditorBlock, rememberGeneratedLine, setPlaceholderBlock, syncContent, textLineSelector, updatePlaceholder]);

  const deleteSelectedLine = useCallback(() => {
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const targets = blocks.length
      ? blocks
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : [];
    if (!targets.length) return;
    captureStructuralUndo();
    targets.forEach((block) => removeLine(block, false, { captureUndo: false, sync: false }));
    syncContent();
    pickers.setPickerPosition(null);
    pickers.setSlashPicker(null);
    setLineActionBlock(null);
  }, [captureStructuralUndo, lineActionBlock, pickers, removeLine, selectedLineBlocks, setLineActionBlock, syncContent]);

  const openLineCommands = useCallback((block: HTMLElement, anchor?: HTMLElement) => {
    lineCommandsOpenRef.current = true;
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    const range = document.createRange();
    if (block.matches('[data-globe], [data-divider], [data-mention-id][data-mention-mode="full"]'))
      range.selectNode(block);
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
  }, [clearLineSelection, editorRef, imageResizeRef, lineCommandsOpenRef, pickers, selectedLineBlocks, setLineActionBlock, setSelectedLineBlocks, setSelectionToolbar]);

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
      if (line.matches('[data-divider], [data-mention-id][data-mention-mode="full"]'))
        line.contentEditable = "false";
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
      preview.className = "editor-content editor-drag-preview";
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
    const isGlobe = block.matches("[data-globe]");
    clone.removeAttribute("data-line-dragging");
    clone.removeAttribute("data-line-selected");
    clone.removeAttribute("data-line-drop-target");
    clone.style.pointerEvents = "none";
    clone.style.position = "relative";
    clone.style.margin = isGlobe ? computed.margin : "0";
    clone.style.display = isGlobe ? "grid" : "block";
    clone.style.width = isGlobe ? "auto" : "100%";
    clone.style.minWidth = "0";
    clone.style.maxWidth = "none";
    clone.style.minHeight = "0";
    clone.style.height = "auto";
    clone.style.overflow = "visible";
    clone.style.filter = "none";
    if (!isGlobe) {
      clone.style.padding = "0";
      clone.style.border = "none";
      clone.style.background = "transparent";
      clone.style.boxShadow = "none";
      clone.style.borderRadius = "0";
    }
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

  const activateLineDrag = useCallback((pending: NonNullable<typeof pendingLineDragRef.current>) => {
    const { block, button, pointerId, clientX, clientY, altKey } = pending;
    setSelectionToolbar(null);
    duplicateDragRef.current = altKey;
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const draggedLines = selected.includes(block) ? selected : [block];
    controls.draggedLinesRef.current = draggedLines;
    controls.draggedLineRef.current = block;
    controls.didDragLineRef.current = false;
    controls.lineDropRef.current = null;
    draggedLines.forEach((line) => line.setAttribute("data-line-dragging", "true"));
    if (!button.hasPointerCapture(pointerId)) button.setPointerCapture(pointerId);
    document.body.style.cursor = duplicateDragRef.current ? "copy" : "grabbing";
    updateDragPreview(block, clientX, clientY);
    controls.setIsDraggingLine(true);
  }, [controls, selectedLineBlocks, setSelectionToolbar, updateDragPreview]);

  const moveLine = useCallback((target: HTMLElement, before: boolean, inside = false) => {
    const dragged = controls.draggedLineRef.current;
    if (!dragged || dragged === target || dragged.contains(target)) return;
    const draggedLines = controls.draggedLinesRef.current.length
      ? controls.draggedLinesRef.current
      : [dragged];
    if (draggedLines.includes(target)) return;
    captureStructuralUndo();
    const sourceScopes = Array.from(new Set(draggedLines.map((line) =>
      line.closest<HTMLElement>("[data-globe-content], [data-his-column]"),
    ).filter((scope): scope is HTMLElement => Boolean(scope))));
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
    sourceScopes.forEach((scope) => {
      const hasBlock = Array.from(scope.children).some((child) => child.matches(blockSelector));
      if (hasBlock) return;
      const line = document.createElement("p");
      line.contentEditable = "true";
      line.appendChild(document.createElement("br"));
      scope.appendChild(line);
      rememberGeneratedLine(line);
    });
    draggedLines.forEach((line) => {
      line.removeAttribute("data-line-dragging");
      line.removeAttribute("data-line-selected");
    });
    target.removeAttribute("data-line-drop-target");
    syncContent();
    controls.draggedLineRef.current = null;
    controls.draggedLinesRef.current = [];
    setSelectedLineBlocks([]);
  }, [blockSelector, captureStructuralUndo, controls, rememberGeneratedLine, setSelectedLineBlocks, syncContent]);

  const updateLineControlAt = useCallback((clientX: number, clientY: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    const editorRect = editor.getBoundingClientRect();
    const visibleBounds = getEditorVisibleBounds(editor);
    const insideExtendedEditor =
      clientY >= visibleBounds.top &&
      clientY <= visibleBounds.bottom &&
      clientX >= Math.max(visibleBounds.left, editorRect.left - 180) &&
      clientX <= Math.min(visibleBounds.right, editorRect.right + 24);
    if (!insideExtendedEditor) {
      controls.setLineControl(null);
      return;
    }

    const elementsUnderPointer = Array.from(document.elementsFromPoint(clientX, clientY));
    const target = document.elementFromPoint(clientX, clientY);
    const isOverGlobeIcon = elementsUnderPointer.some((element) =>
      Boolean(element.closest("[data-globe-icon]")),
    );

    // Dentro de un globo, el boton y todo el espacio horizontal hasta el texto
    // pertenecen a la linea interna. Asi el wrapper del globo no roba el hover
    // mientras el puntero cruza ese pequeno corredor.
    const pointerGlobe = target?.closest<HTMLElement>("[data-globe]") ?? null;
    const pointerGlobeContent = pointerGlobe?.querySelector<HTMLElement>(
      ":scope > [data-globe-content]",
    ) ?? null;
    const nestedLine = isOverGlobeIcon || !pointerGlobeContent
      ? null
      : Array.from(pointerGlobeContent.querySelectorAll<HTMLElement>(textLineSelector))
          .filter((candidate) => {
            const globeContent = candidate.closest<HTMLElement>("[data-globe-content]");
            if (globeContent !== pointerGlobeContent) return false;
            const lineRect = candidate.getBoundingClientRect();
            const contentRect = globeContent.getBoundingClientRect();
            const controlLeft = Math.max(8, contentRect.left - 28);
            return (
              clientY >= lineRect.top &&
              clientY <= lineRect.bottom &&
              clientX >= controlLeft &&
              clientX <= contentRect.right + 24
            );
          })[0] ?? null;

    let block = nestedLine ?? getLineControlBlock(target);

    if (!block) {
      block = elementsUnderPointer
      .map((element) => element.closest(blockSelector) as HTMLElement | null)
      .find((candidate): candidate is HTMLElement => {
        if (!candidate || candidate === editor || !editor.contains(candidate)) return false;
        return isRootEditorBlock(candidate);
      }) ?? null;
    }

    if (!block) {
      block = getLineControlBlock(target);
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
    const controlContainer = block.closest<HTMLElement>("[data-globe-content], [data-his-column]") ?? editor;
    const controlContainerRect = controlContainer.getBoundingClientRect();
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

    const nextControl = {
      block,
      top: rect.top,
      left: Math.max(8, controlContainerRect.left - 28),
      before,
      nearLeft: clientX <= rect.left + 140,
      hasContent: !isLineEmpty(block),
      inside: false,
      pointerY: clientY,
    };
    controls.setLineControl((current) =>
      current &&
      current.block === nextControl.block &&
      current.top === nextControl.top &&
      current.left === nextControl.left &&
      current.hasContent === nextControl.hasContent &&
      !current.inside
        ? current
        : nextControl,
    );
  }, [blockSelector, controls, editorRef, getLineControlBlock, isLineEmpty, isRootEditorBlock, setPlaceholderBlock]);

  const updateLineControl = useCallback((event: MouseEvent<HTMLDivElement>) => {
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    if (controls.isDraggingLine) return;
    updateLineControlAt(event.clientX, event.clientY);
  }, [controls.isDraggingLine, lastPointerRef, updateLineControlAt]);

  useEffect(() => {
    let scrollFrame: number | null = null;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      if (controls.draggedLineRef.current) return;
      if (event.target instanceof Element && event.target.closest("[data-line-control]")) return;
      updateLineControlAt(event.clientX, event.clientY);
    };
    const handleScroll = () => {
      if (controls.draggedLineRef.current) return;
      const editor = editorRef.current;
      const current = lineControlRef.current;
      if (!editor || !current) return;
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        const latest = lineControlRef.current;
        if (!latest || latest.block !== current.block) return;
        if (!current.block.isConnected || !editor.contains(current.block)) {
          controls.setLineControl(null);
          return;
        }
        const rect = current.block.getBoundingClientRect();
        const visibleBounds = getEditorVisibleBounds(editor);
        if (rect.bottom <= visibleBounds.top || rect.top >= visibleBounds.bottom) {
          controls.setLineControl(null);
          return;
        }
        const controlContainer = current.block.closest<HTMLElement>("[data-globe-content], [data-his-column]") ?? editor;
        const controlContainerRect = controlContainer.getBoundingClientRect();
        controls.setLineControl((value) =>
          value?.block === current.block
            ? {
                ...value,
                top: rect.top,
                left: Math.max(8, controlContainerRect.left - 28),
              }
            : value,
        );
      });
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [controls.draggedLineRef, controls.setLineControl, editorRef, lastPointerRef, updateLineControlAt]);

  const completeLineDrag = useCallback((_block: HTMLElement, commit: boolean) => {
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
    duplicateDragRef.current = false;
    controls.didDragLineRef.current = false;
  }, [clearDragPreview, controls, duplicateLine, editorRef, moveLine]);

  const startLineDrag = useCallback((block: HTMLElement, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const previous = pendingLineDragRef.current;
    if (previous) window.clearTimeout(previous.timer);
    const pending = {
      block,
      button: event.currentTarget,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: event.altKey,
      timer: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingLineDragRef.current = pending;
    pending.timer = window.setTimeout(() => {
      if (pendingLineDragRef.current !== pending) return;
      pendingLineDragRef.current = null;
      activateLineDrag(pending);
    }, 180);
  }, [activateLineDrag]);

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
    const pending = pendingLineDragRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      pendingLineDragRef.current = null;
      return;
    }
    if (!controls.draggedLineRef.current) return;
    event.preventDefault();
    completeLineDrag(block, true);
  }, [completeLineDrag, controls.draggedLineRef]);

  useEffect(() => {
    if (!controls.isDraggingLine) return;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      moveLineDrag(event as unknown as PointerEvent<HTMLButtonElement>);
    };
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      const dragged = controls.draggedLineRef.current;
      if (!dragged) return;
      event.preventDefault();
      completeLineDrag(dragged, true);
    };
    const handlePointerCancel = () => {
      const dragged = controls.draggedLineRef.current;
      if (dragged) completeLineDrag(dragged, false);
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [completeLineDrag, controls.draggedLineRef, controls.isDraggingLine, moveLineDrag]);

  const cancelLineDrag = useCallback(() => {
    const pending = pendingLineDragRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      pendingLineDragRef.current = null;
    }
  }, []);

  return {
    dragPreviewRef,
    generatedLinesRef,
    rememberGeneratedLine,
    clearGeneratedLines,
    insertLine,
    splitLineAtSelection,
    ensureEditorLine,
    removeLine,
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
    cancelLineDrag,
    completeLineDrag,
  };
}
