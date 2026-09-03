import { useEffect, useRef, useState } from "react";
import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { useNodeScopedEditorHistory } from "./useEditorHistory";
import { useEditorSelection } from "./useEditorSelection";
import type { NodeItem, PickerState } from "../types/nodes";
import { formatPastedText, sanitizeEditorHtml } from "../utils/editorHtml";
import { useBlockControls } from "./useBlockControls";
import { useEditorBlocks } from "./useEditorBlocks";
import { useEditorBlockSelection } from "./useEditorBlockSelection";
import { useEditorMentions } from "./useEditorMentions";
import { useEditorPickers } from "./useEditorPickers";
import { useRichTextEditor } from "./useRichTextEditor";
import draftAsset from "../assets/icons/draft.svg";

interface EditorControllerOptions {
  node: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  editorRef: RefObject<HTMLDivElement | null>;
  onContentChange: (id: string, html: string) => void;
  setSelectedId: (id: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenDeletedNode: (id: string) => void;
  onImageFilePaste?: (file: File, parentId?: string | null) => Promise<string | null> | string | null;
  onSlashCommand?: (tag: string) => boolean;
}

const blockSelector =
  "p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-globe], [data-page-index]";
const textLineSelector = "p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-globe], [data-page-index]";

export function useEditorController({
  node,
  nodes,
  deletedNodes,
  editorRef,
  onContentChange,
  setSelectedId,
  setExpanded,
  onOpenDeletedNode,
  onImageFilePaste,
  onSlashCommand,
}: EditorControllerOptions) {
  const [selectionToolbar, setSelectionToolbar] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [placeholderBlock, setPlaceholderBlock] = useState<HTMLElement | null>(
    null,
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [lineActionBlock, setLineActionBlock] = useState<HTMLElement | null>(
    null,
  );
  const [selectedLineBlocks, setSelectedLineBlocks] = useState<HTMLElement[]>(
    [],
  );
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageResizeRef = useRef<{
    image: HTMLImageElement;
    startX: number;
    startWidth: number;
  } | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const scrollFrameRef = useRef<number | null>(null);
  const blockSelectionRef = useRef<{ x: number; y: number } | null>(null);
  const generatedLinesRef = useRef<HTMLElement[]>([]);
  const structuralHistory = useNodeScopedEditorHistory<string>(node.id, 20);
  const editorHistory = useNodeScopedEditorHistory<string>(node.id, 50);
  const [blockSelection, setBlockSelection] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const pickers = useEditorPickers(nodes);
  const controls = useBlockControls();
  const { syncContent, scheduleContentSync } = useRichTextEditor({
    node,
    onContentChange,
    editorRef,
  });

  const getEditorBlock = (source: Node | null) => {
    const editor = editorRef.current;
    if (!editor || !source) return null;
    const element =
      source.nodeType === Node.ELEMENT_NODE
        ? (source as HTMLElement)
        : source.parentElement;
    if (!element) return null;

    const globeContent = element.closest("[data-globe-content]") as HTMLElement | null;
    const localBlock = globeContent
      ? (element.closest("p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-page-index]") as HTMLElement | null)
      : null;
    if (globeContent && localBlock && globeContent.contains(localBlock)) {
      return localBlock;
    }

    const block = element.closest(blockSelector) as HTMLElement | null;
    return block && block !== editor && editor.contains(block) ? block : null;
  };
    const getTextEditorBlock = (source: Node | null) => {
    const editor = editorRef.current;
    if (!editor || !source) return null;
    const element =
      source.nodeType === Node.ELEMENT_NODE
        ? (source as HTMLElement)
        : source.parentElement;
    if (!element) return null;
    const direct = element.closest(textLineSelector) as HTMLElement | null;
    if (direct && editor.contains(direct)) return direct;
    const globeContent = element.closest("[data-globe-content]") as HTMLElement | null;
    if (globeContent && editor.contains(globeContent)) {
      const fallback = globeContent.querySelector<HTMLElement>(textLineSelector);
      if (fallback) return fallback;
    }
    return null;
  };
  const getLineControlBlock = (source: Node | null) => {
    const editor = editorRef.current;
    if (!editor || !source) return null;
    const element =
      source.nodeType === Node.ELEMENT_NODE
        ? (source as HTMLElement)
        : source.parentElement;
    const line = element?.closest(textLineSelector) as HTMLElement | null;
    if (line && editor.contains(line)) return line;
    const globe = element?.closest("[data-globe]") as HTMLElement | null;
    return globe && editor.contains(globe) ? globe : null;
  };
  const getLineDrop = (source: Node | null, clientX: number, clientY: number) => {
    const line = getLineControlBlock(source);
    const globe = line?.closest<HTMLElement>("[data-globe]");
    if (line && globe && line !== globe) {
      const rect = line.getBoundingClientRect();
      return {
        block: line,
        before: clientY < rect.top + rect.height / 2,
        inside: false,
      };
    }
    const block = getEditorBlock(source);
    if (!block) return null;
    const rect = block.getBoundingClientRect();
    return {
      block,
      before: clientY < rect.top + rect.height / 2,
      inside:
        block.matches("[data-globe]") &&
        clientX > rect.left + 48 &&
        clientY >= rect.top &&
        clientY <= rect.bottom,
    };
  };
  const isRootEditorBlock = (block: HTMLElement) =>
    !block.parentElement?.closest(blockSelector);
    const isNonEditableBlockType = (block: HTMLElement) =>
    block.matches("[data-divider], [data-globe], [data-page-index]");
  const clearTransientEditorState = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor
      .querySelectorAll<HTMLElement>(
        "[data-line-dragging], [data-line-drop-target], [data-line-selected]",
      )
      .forEach((line) => {
        line.removeAttribute("data-line-dragging");
        line.removeAttribute("data-line-drop-target");
        line.removeAttribute("data-line-selected");
        line.contentEditable = "true";
      });
    document.body.style.cursor = "default";
  };
  const clearNativeSelection = () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
    const clearLineSelection = () =>
    editorRef.current
      ?.querySelectorAll<HTMLElement>("[data-line-selected]")
      .forEach((line) => {
        line.removeAttribute("data-line-selected");
        if (!isNonEditableBlockType(line)) line.contentEditable = "true";
      });

  const toggleLineSelection = (block: HTMLElement) => {
    clearNativeSelection();
    setSelectedLineBlocks((current) => {
      const alreadySelected = current.includes(block);
      const next = alreadySelected
        ? current.filter((line) => line !== block)
        : [...current, block];

      current.forEach((line) => {
        line.removeAttribute("data-line-selected");
        if (!isNonEditableBlockType(line)) line.contentEditable = "true";
      });

      const finalSelection = current.length > 1 && alreadySelected
        ? current.filter((line) => line !== block)
        : next;

      finalSelection.forEach((line) => {
        line.setAttribute("data-line-selected", "true");
        line.contentEditable = "false";
      });
      return finalSelection;
    });
  };

  const rememberGeneratedLine = (line: HTMLElement) => {
    generatedLinesRef.current = [
      ...generatedLinesRef.current.filter((item) => item.isConnected),
      line,
    ];
  };
  const clearGeneratedLines = () => {
    generatedLinesRef.current = [];
  };
  const captureStructuralUndo = () => {
    const editor = editorRef.current;
    if (!editor) return;
    clearTransientEditorState();
    structuralHistory.push(editor.innerHTML);
  };
  const restoreStructuralUndo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const previous = structuralHistory.undo(editor.innerHTML);
    if (previous === undefined) return false;
    clearTransientEditorState();
    controls.clearBlockControls();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
    editor.innerHTML = previous;
    clearGeneratedLines();
    editor.focus();
    syncContent();
    updatePlaceholder();
    return true;
  };
  const restoreStructuralRedo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const next = structuralHistory.redo(editor.innerHTML);
    if (next === undefined) return false;
    clearTransientEditorState();
    controls.clearBlockControls();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
    editor.innerHTML = next;
    clearGeneratedLines();
    editor.focus();
    syncContent();
    updatePlaceholder();
    return true;
  };
  const pushEditorHistory = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editorHistory.push(editor.innerHTML);
  };
  const restoreEditorUndo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const previous = editorHistory.undo(editor.innerHTML);
    if (previous === undefined) return false;
    editor.innerHTML = previous;
    editor.focus();
    syncContent();
    updatePlaceholder();
    return true;
  };
  const restoreEditorRedo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const next = editorHistory.redo(editor.innerHTML);
    if (next === undefined) return false;
    editor.innerHTML = next;
    editor.focus();
    syncContent();
    updatePlaceholder();
    return true;
  };
  const clearStructuralUndo = () => {
    structuralHistory.reset();
  };
  const normalizeDividers = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let changed = false;
    editor.querySelectorAll<HTMLElement>("hr").forEach((hr) => {
      const parent = hr.parentElement;
      if (parent?.matches("[data-divider]") && parent.children.length === 1) {
        parent.contentEditable = "false";
        return;
      }
      const divider = document.createElement("div");
      divider.dataset.divider = "true";
      divider.contentEditable = "false";
      divider.appendChild(hr.cloneNode(true));
      if (parent) parent.replaceChild(divider, hr);
      else editor.replaceChild(divider, hr);
      changed = true;
    });
    editor.querySelectorAll<HTMLElement>("[data-divider]").forEach((divider) => {
      if (divider.contentEditable !== "false") {
        divider.contentEditable = "false";
        changed = true;
      }
      if (!divider.querySelector("hr")) {
        const hr = document.createElement("hr");
        divider.replaceChildren(hr);
        changed = true;
      }
    });
    return changed;
  };
  const dismissEditorMenus = () => {
    pickers.setSlashPicker(null);
    pickers.setCallPicker(null);
    pickers.setPickerPosition(null);
    clearLineSelection();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
  };

  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        return;
      }
      const target = event.target as Element | null;
      if (
        selectedLineBlocks.length &&
        target?.closest(`.editor-content ${textLineSelector}`)
      ) {
        return;
      }
      if (!target?.closest("[data-picker], [data-line-control]")) {
        dismissEditorMenus();
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.visibilityState === "hidden") {
        return;
      }
      const blocks = selectedLineBlocks.filter((line) => line.isConnected);
      const hasSelectionMode = blocks.length > 0;
      if (event.key === "Escape") {
        dismissEditorMenus();
        return;
      }
      const isTextInput =
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea") || event.target.isContentEditable);
      if ((event.key === "Delete" || event.key === "Backspace") && hasSelectionMode && !isTextInput) {
        event.preventDefault();
        event.stopPropagation();
        deleteSelectedLine();
        return;
      }
      if (!document.hasFocus() && !hasSelectionMode) {
        return;
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedLineBlocks]);

  useEffect(() => {
    const handleGlobalSelectAll = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== "a" || !(event.ctrlKey || event.metaKey)) return;
      const editor = editorRef.current;
      if (!editor || editor.contentEditable !== "true") return;
      const active = document.activeElement;
      if (active && editor.contains(active)) return;
      if (isTextEntryElement(active)) return;
      event.preventDefault();
      selectAllBlocks();
    };
    document.addEventListener("keydown", handleGlobalSelectAll, true);
    return () => document.removeEventListener("keydown", handleGlobalSelectAll, true);
  }, []);

  useEffect(() => {
  const handleCopy = (event: globalThis.ClipboardEvent) => {
      const blocks = selectedLineBlocks.filter((line) => line.isConnected);
      if (blocks.length) {
        const container = document.createElement("div");
        blocks.forEach((block) => {
          const clone = block.cloneNode(true) as HTMLElement;
          clone.removeAttribute("data-line-selected");
          clone.contentEditable = "true";
          container.appendChild(clone);
        });
        container.querySelectorAll<HTMLElement>("[data-line-selected]").forEach((element) => {
          element.removeAttribute("data-line-selected");
          element.contentEditable = "true";
        });
        const html = container.innerHTML;
        const text = blocks.map((block) => block.textContent || "").join("\n");
        event.clipboardData?.setData("text/html", html);
        event.clipboardData?.setData("text/plain", text);
        event.preventDefault();
        return;
      }
      // Copia de una seleccion de texto normal (sin usar el selector de lineas).
      // El navegador inyecta aqui el background-color COMPUTADO del contenedor
      // (p. ej. el fondo oscuro del editor) como estilo inline del fragmento por
      // defecto, lo que el sanitizador de pegado interpreta luego como un resaltado
      // real. Construimos el HTML desde el DOM tal cual esta (sin estilos
      // computados anadidos) para que el viaje HIS -> portapapeles -> HIS no
      // arrastre ese artefacto, conservando el formato realmente aplicado (negrita,
      // cursiva, enlaces, menciones, fondos de bloque, etc.).
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (
        !editor ||
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0
      )
        return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      const container = document.createElement("div");
      container.appendChild(range.cloneContents());
      container
        .querySelectorAll<HTMLElement>("[data-line-selected], [data-line-dragging], [data-line-drop-target]")
        .forEach((element) => {
          element.removeAttribute("data-line-selected");
          element.removeAttribute("data-line-dragging");
          element.removeAttribute("data-line-drop-target");
        });
      const html = container.innerHTML;
      if (!html) return;
      event.clipboardData?.setData("text/html", html);
      event.clipboardData?.setData("text/plain", selection.toString());
      event.preventDefault();
    };
    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, [selectedLineBlocks]);

  const applyTextFormat = (
    command: "bold" | "italic" | "underline" | "strikeThrough",
  ) => {
    const selection = window.getSelection();
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const targetBlocks = blocks.length
      ? blocks
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : [];
    if (targetBlocks.length && (!selection || selection.isCollapsed || !selection.toString().trim())) {
      targetBlocks.forEach((block) => {
        if (block.matches("[data-divider]")) return;
        const range = document.createRange();
        range.selectNodeContents(block);
        selection?.removeAllRanges();
        if (selection) selection.addRange(range);
        document.execCommand(command, false);
      });
    } else if (selection && selection.rangeCount && !selection.isCollapsed) {
      document.execCommand(command, false);
    }
    syncContent();
    updateSelectionToolbar();
  };
  const applyTextColor = (color: string) => {
    pushEditorHistory();
    const selection = window.getSelection();
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const targetBlocks = blocks.length
      ? blocks
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : (() => {
            const block = getEditorBlock(selection?.focusNode || null) || null;
            return block ? [block] : [];
          })();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      document.execCommand("foreColor", false, color);
    } else {
      targetBlocks.forEach((block) => {
        if (!block.matches("[data-divider]")) block.style.color = color;
      });
    }
    syncContent();
    updateSelectionToolbar();
  };
  const applyBlockBackgroundColor = (color: string) => {
    pushEditorHistory();
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const blocks = selected.length
      ? selected
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : (() => {
            const selection = window.getSelection();
            const block = selection?.focusNode ? getEditorBlock(selection.focusNode) : null;
            return block ? [block] : [];
          })();
    blocks.forEach((block) => {
      if (color) block.style.backgroundColor = color;
      else block.style.removeProperty("background-color");
    });
    syncContent();
    updateSelectionToolbar();
  };
  const isLineEmpty = (block: HTMLElement) =>
    !block.matches("[data-divider]") &&
    !block.textContent?.trim() &&
    !block.querySelector("img, .editor-mention");

  const { isTextEntryElement, selectAllBlocks, updateSelectionToolbar: updateSelectionToolbarFromHook, updatePlaceholder: updatePlaceholderFromHook } = useEditorSelection({
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
  });
  const updatePlaceholder = updatePlaceholderFromHook;
  const updateSelectionToolbar = updateSelectionToolbarFromHook;

  const editorBlocks = useEditorBlocks({
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
  });

  const {
    insertLine,
    ensureEditorLine,
    removeLine,
    deleteSelectedLine,
    openLineCommands,
    moveLine,
    updateLineControlAt,
    updateLineControl,
    startLineDrag,
    moveLineDrag,
    finishLineDrag,
  } = editorBlocks;

  const blockSelectionController = useEditorBlockSelection({
    editorRef,
    textLineSelector,
    setSelectedLineBlocks,
    getTextEditorBlock,
    clearLineSelection,
    blockSelectionRef,
    blockSelection,
    setBlockSelection,
    selectedLineBlocks,
  });

  const { beginSelection, finalizeSelectionBox: finalizeBlockSelectionBox, onEditorSelectionMove: onBlockSelectionMove } = blockSelectionController;

  const mentionController = useEditorMentions({
    editorRef,
    nodes,
    deletedNodes,
    selectedLineBlocks,
    lineActionBlock,
    setExpanded,
    setSelectedId,
    onOpenDeletedNode,
    setFocusedNodeId,
    syncContent,
    imageResizeRef,
    controls,
    captureStructuralUndo,
  });

  const {
    createMention,
    insertMentionWithSpacing,
    insertNodeMention,
    onMentionPointerDown,
    onEditorPointerDown: onMentionEditorPointerDown,
    onEditorPointerMove,
    alignImage,
  } = mentionController;

  const isMentionImageLegacy = (element: HTMLElement | null) => {
    if (!element) return false;
    const mention = element.closest<HTMLElement>("[data-mention-id]");
    if (mention) return mention.dataset.mentionMode !== "full";
    return Boolean(
      element.closest(".editor-mention") ||
      element.classList.contains("editor-mention__icon"),
    );
  };
  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleScroll = () => {
      if (controls.draggedLineRef.current) return;
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateLineControlAt(lastPointerRef.current.x, lastPointerRef.current.y);
      });
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("scroll", handleScroll, true);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [updateLineControlAt]);


  const getCurrentPageIndexEntries = (scopeRoot?: HTMLElement | null) => {
    const editor = editorRef.current;
    if (!editor) return [];

    const scopeTarget = scopeRoot && scopeRoot.isConnected ? scopeRoot : editor;
    const headingSelectors = "h1, h2, h3, h4, h5, h6, [data-heading], .editor-heading, .heading";
    const headings = Array.from(scopeTarget.querySelectorAll<HTMLElement>(headingSelectors)).filter((heading) => {
      if (!editor.contains(heading)) return false;
      if (heading.closest("[data-page-index]")) return false;
      if (scopeRoot && !scopeRoot.contains(heading)) return false;
      if (!scopeRoot && heading.closest("[data-globe]")) return false;
      const text = heading.textContent?.replace(/\s+/g, " ").trim();
      return Boolean(text && text.length > 0);
    });

    if (!headings.length) return [];

    const scopeToken = scopeRoot
      ? `${node.id}-globe-${Math.random().toString(36).slice(2, 8)}`
      : `${node.id}-page`;

    return headings.map((heading, index) => {
      const id = heading.id || `${scopeToken}-heading-${index}`;
      if (!heading.id) heading.id = id;
      heading.dataset.pageIndexId = id;
      return {
        index,
        id,
        label: heading.textContent?.replace(/\s+/g, " ").trim() || `Sección ${index + 1}`,
        level: Number.parseInt(heading.tagName.replace("H", ""), 10) || 1,
      };
    });
  };

  const insertStructuralBlockAfter = (anchor: HTMLElement, block: HTMLElement) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(anchor)) return null;
    const globeContent = anchor.closest("[data-globe-content]") as HTMLElement | null;
    if (globeContent) {
      globeContent.insertBefore(block, anchor.nextSibling ?? null);
      return block;
    }
    const globe = anchor.closest("[data-globe]") as HTMLElement | null;
    if (globe && globe.parentElement) {
      globe.parentElement.insertBefore(block, globe.nextSibling);
      return block;
    }
    const parent = anchor.parentElement;
    if (parent) {
      parent.insertBefore(block, anchor.nextSibling);
      return block;
    }
    editor.appendChild(block);
    return block;
  };

  const focusFreshParagraphAfter = (afterNode: Node | null) => {
    const editor = editorRef.current;
    if (!editor) return;
    const line = document.createElement("p");
    line.appendChild(document.createElement("br"));
    line.removeAttribute("style");
    if (afterNode && afterNode.parentNode) {
      afterNode.parentNode.insertBefore(line, afterNode.nextSibling);
    } else {
      editor.appendChild(line);
    }
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    line.scrollIntoView({ block: "nearest" });
    updatePlaceholder();
  };

  const buildPageIndexBlock = (scopeRoot?: HTMLElement | null) => {
    const block = document.createElement("div");
    block.dataset.pageIndex = "true";
    block.className = "editor-page-index";
    block.contentEditable = "false";
    block.style.userSelect = "none";
    block.style.margin = "12px 0";
    block.style.padding = "8px 0 4px";
    block.style.borderTop = "1px solid rgba(232, 233, 234, 0.18)";
    block.style.borderBottom = "1px solid rgba(232, 233, 234, 0.12)";
    block.setAttribute("aria-hidden", "true");

    const entries = getCurrentPageIndexEntries(scopeRoot);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "editor-page-index__empty";
      empty.textContent = "Sin secciones";
      block.appendChild(empty);
      return block;
    }

    entries.forEach(({ id, label, level }) => {
      const row = document.createElement("div");
      row.dataset.pageIndexItem = "true";
      row.dataset.pageId = id;
      row.className = "editor-page-index__item";
      row.contentEditable = "false";
      row.style.marginLeft = `${Math.max(0, level - 1) * 14}px`;
      row.tabIndex = 0;
      row.setAttribute("role", "link");
      row.setAttribute("aria-label", `Ir a la sección ${label}`);
      row.style.userSelect = "none";

      const marker = document.createElement("span");
      marker.className = "editor-page-index__marker";
      marker.textContent = "•";
      row.appendChild(marker);

      const name = document.createElement("span");
      name.className = "editor-page-index__label";
      name.textContent = label;
      row.appendChild(name);

            
            block.appendChild(row);
    });

    return block;
  };

    const focusPageIndexEntry = (id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const candidates = Array.from(
      editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [data-heading], .editor-heading, .heading"),
    ).filter((heading) => {
      if (heading.closest("[data-page-index]")) return false;
      if (heading.closest("[data-globe]")) return false;
      return true;
    });
    const matching = candidates.find((heading) => heading.id === id || heading.dataset.pageIndexId === id)
      ?? document.getElementById(id);
    if (!matching) return;
    const target = document.getElementById(id) || matching;
    if (!target.id) target.id = id;
    target.setAttribute("tabindex", "-1");
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    if (editor instanceof HTMLElement) editor.blur();
    target.blur();
    const rect = target.getBoundingClientRect();
    const targetTop = rect.top + window.scrollY - 96;
    const distance = Math.max(0, targetTop - window.scrollY);

    if (distance > 2600) {
      window.scrollTo({ top: targetTop, behavior: "auto" });
    } else if (distance > 900) {
      const acceleratedTop = window.scrollY + Math.min(
        distance,
        200 + Math.pow(distance / 260, 1.9) * 18,
      );
      window.scrollTo({ top: acceleratedTop, behavior: "auto" });
    } else {
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    }

    target.scrollIntoView({ block: "start", behavior: "smooth" });
    const previous = target.style.boxShadow;
    const previousBg = target.style.background;
    const highlightMs = Math.min(2200, 500 + Math.pow(Math.max(0, distance) / 260, 1.55) * 90);
    target.style.boxShadow = "0 0 0 2px rgba(77, 216, 192, 0.7)";
    target.style.background = "rgba(77, 216, 192, 0.08)";
    window.setTimeout(() => {
      target.style.boxShadow = previous;
      target.style.background = previousBg;
    }, highlightMs);
  };


  const onEditorDrop = (event: DragEvent<HTMLDivElement>) => {
    const nodeId = event.dataTransfer.getData("application/x-hisfuture-node") ||
      event.dataTransfer.getData("text/plain");
    event.preventDefault();
    if (!nodeId) {
      if (controls.lineControl)
        moveLine(controls.lineControl.block, controls.lineControl.before);
      controls.clearBlockControls();
      return;
    }
    insertNodeMention(nodeId, event.clientX, event.clientY);
  };
  const updateLineDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (
      Array.from(event.dataTransfer.types).includes(
        "application/x-hisfuture-node",
      )
    ) {
      event.dataTransfer.dropEffect = "copy";
      controls.setLineControl(null);
      return;
    }
    event.dataTransfer.dropEffect = "move";
    const editor = editorRef.current;
    const drop = getLineDrop(event.target as Node, event.clientX, event.clientY);
    if (!editor || !drop || drop.block === controls.draggedLineRef.current) return;
    const { block, before, inside } = drop;
    const rect = block.getBoundingClientRect();
    editor
      .querySelector("[data-line-drop-target]")
      ?.removeAttribute("data-line-drop-target");
    block.setAttribute("data-line-drop-target", "true");
    controls.setLineControl({
      block,
      top: rect.top + Math.max(0, (rect.height - 24) / 2),
      left: Math.max(8, rect.left - 68),
      before,
      nearLeft: false,
      hasContent: true,
      inside,
      pointerY: event.clientY,
    });
  };
  const executePickerAction = (
    type: "slash" | "mention",
    value: string,
    imageMode: "inserted" | "full" = "inserted",
  ) => {
    pushEditorHistory();
    const selection = window.getSelection();
    if (!selection?.focusNode) return;
    const range = selection.getRangeAt(0);
    if (type === "mention") {
      const target = nodes.find((item) => item.id === value);
      const textNode = selection.focusNode;
      if (
        !target ||
        textNode.nodeType !== Node.TEXT_NODE ||
        !pickers.callPicker
      )
        return;
      const length = pickers.callPicker.query.length + 1;
      if (selection.focusOffset < length) return;
      range.setStart(textNode, selection.focusOffset - length);
      range.setEnd(textNode, selection.focusOffset);
      range.deleteContents();
      const mention = createMention(target, imageMode);
      insertMentionWithSpacing(range, mention);
      selection.removeAllRanges();
      selection.addRange(range);
      syncContent();
      dismissEditorMenus();
      return;
    }
    const hasTrigger = pickers.slashPicker?.hasTrigger !== false;
    const length =
      hasTrigger && pickers.slashPicker
        ? pickers.slashPicker.query.length + 1
        : 0;
    if (hasTrigger && selection.focusOffset >= length) {
      range.setStart(selection.focusNode, selection.focusOffset - length);
      range.setEnd(selection.focusNode, selection.focusOffset);
      document.execCommand("delete", false);
    }
    if (onSlashCommand?.(value)) {
      syncContent();
      dismissEditorMenus();
      return;
    }
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const actionBlocks = selected.includes(lineActionBlock!)
      ? selected
      : lineActionBlock
        ? [lineActionBlock]
        : [];
    const selectionElement =
      selection.focusNode?.nodeType === Node.ELEMENT_NODE
        ? (selection.focusNode as HTMLElement)
        : selection.focusNode?.parentElement;
    const focusWithinGlobe = selectionElement?.closest("[data-globe-content]") as HTMLElement | null;
    const currentBlock =
      (focusWithinGlobe
        ? focusWithinGlobe.querySelector<HTMLElement>(textLineSelector) || focusWithinGlobe
        : getEditorBlock(selection.focusNode) || lineActionBlock) ?? lineActionBlock;
    const resolveInsertionTarget = (block: HTMLElement) => {
      const globeContent = block.closest("[data-globe-content]") as HTMLElement | null;
      if (globeContent) {
        return block.closest(textLineSelector) || globeContent;
      }
      if (block.matches("[data-globe]")) {
        return block.querySelector<HTMLElement>(textLineSelector) || block;
      }
      return block;
    };
    const validActionBlocks = (actionBlocks.length ? actionBlocks : currentBlock ? [currentBlock] : []).filter((block): block is HTMLElement => {
      if (!block || block.matches("[data-globe], [data-divider]")) return false;
      return !block.closest("[data-page-index]");
    }).map(resolveInsertionTarget).filter((block, index, list) => list.indexOf(block) === index) as HTMLElement[];

    if (value === "DIVISOR") {
      captureStructuralUndo();
      const blocks = validActionBlocks.length ? validActionBlocks : [currentBlock].filter(Boolean) as HTMLElement[];
      blocks.forEach((block) => {
        const divider = document.createElement("div");
        divider.dataset.divider = "true";
        divider.contentEditable = "false";
        divider.appendChild(document.createElement("hr"));
        const after = document.createElement("p");
        after.appendChild(document.createElement("br"));
        after.removeAttribute("style");
        insertStructuralBlockAfter(block, divider);
        const parent = divider.parentElement ?? block.parentElement;
        if (parent) parent.insertBefore(after, divider.nextSibling ?? null);
        rememberGeneratedLine(divider);
      });
      if (blocks.length) focusFreshParagraphAfter(blocks[0].nextSibling || blocks[0]);
    } else if (value === "INDICE") {
      const blocks = validActionBlocks.length ? validActionBlocks : [currentBlock].filter(Boolean) as HTMLElement[];
      if (!blocks.length) return;
      captureStructuralUndo();
      blocks.forEach((block) => {
        const globeContent = block.closest("[data-globe-content]") as HTMLElement | null;
        const indexBlock = buildPageIndexBlock(globeContent ?? null);
        if (globeContent) {
          const target = block.matches("p, h1, h2, h3, h4, blockquote, li") ? block : globeContent.lastElementChild || block;
          const nextSibling = target.nextSibling;
          target.parentElement?.insertBefore(indexBlock, nextSibling ?? null);
          return;
        }

        const parent = block.parentElement;
        if (!parent) return;
        const nextSibling = block.nextSibling;
        block.replaceWith(indexBlock);
        if (nextSibling && indexBlock.parentElement && nextSibling.parentElement === indexBlock.parentElement) {
          const sibling = nextSibling as HTMLElement | ChildNode;
          const target = sibling as Node;
          if (target && target.parentNode === indexBlock.parentNode && indexBlock.nextSibling !== target) {
            indexBlock.parentNode?.insertBefore(target, indexBlock.nextSibling);
          }
        }
      });
    } else if (value === "GLOBO" || value === "GLOBO_INDIVIDUAL") {
      const blocks = actionBlocks.length ? actionBlocks : [getEditorBlock(selection.focusNode)].filter(Boolean) as HTMLElement[];
      if (blocks.length) captureStructuralUndo();
      const createGlobe = (block: HTMLElement) => {
        if (block.matches("[data-globe], [data-divider]")) return;
        const content = document.createElement("div");
        content.dataset.globeContent = "true";
        const cleanLine = document.createElement("p");
        cleanLine.removeAttribute("style");
        cleanLine.contentEditable = "true";
        if (block.textContent?.trim()) {
          while (block.firstChild) cleanLine.appendChild(block.firstChild);
        } else {
          cleanLine.appendChild(document.createElement("br"));
        }
        content.appendChild(cleanLine);
        const globe = document.createElement("div");
        globe.dataset.globe = "true";
        const icon = document.createElement("span");
        icon.dataset.globeIcon = "true";
        icon.contentEditable = "false";
        const image = document.createElement("img");
        image.src = draftAsset;
        image.alt = "Draft";
        icon.appendChild(image);
        globe.append(icon, content);
        block.replaceWith(globe);
        return { content };
      };
      if (value === "GLOBO_INDIVIDUAL") {
        blocks.forEach((block) => createGlobe(block));
      } else {
        const orderedBlocks = [...blocks].sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
        );
        const anchor = orderedBlocks.find(
          (block) => !block.matches("[data-globe], [data-divider]"),
        );
        const first = anchor && createGlobe(anchor);
        if (first) {
          orderedBlocks.forEach((block) => {
            if (block !== anchor && !block.matches("[data-globe]"))
              first.content.appendChild(block);
          });
        }
      }
    } else {
      const blocks = actionBlocks.length ? actionBlocks : [getEditorBlock(selection.focusNode)].filter(Boolean) as HTMLElement[];
      blocks.forEach((block) => {
        const blockRange = document.createRange();
        blockRange.selectNodeContents(block);
        blockRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(blockRange);
        document.execCommand("formatBlock", false, `<${value.toLowerCase()}>`);
      });
    }
    syncContent();
    dismissEditorMenus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const indexItem = (event.target as HTMLElement).closest<HTMLElement>("[data-page-index-item]");
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissEditorMenus();
      clearNativeSelection();
      setSelectionToolbar(null);
      setPlaceholderBlock(null);
      return;
    }
    if (indexItem && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const id = indexItem.dataset.pageId;
      if (id) focusPageIndexEntry(id);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      if (restoreStructuralUndo()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (restoreEditorUndo()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
      if (restoreStructuralRedo()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (restoreEditorRedo()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const selection = window.getSelection();
    const activeBlock = getEditorBlock(selection?.focusNode || null);
    const iconTarget = (event.target as HTMLElement).closest("[data-globe-icon]");
    const iconSelection = selection?.anchorNode?.parentElement?.closest(
      "[data-globe-icon]",
    );
    const selectedBlocks = selectedLineBlocks.filter((line) => line.isConnected);
    if ((event.key === "Delete" || event.key === "Backspace") && selectedBlocks.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedLine();
      return;
    }
    if (event.key === "Tab") {
      if (selectedBlocks.length) {
        event.preventDefault();
        selectedBlocks.forEach((block) => {
          const currentMargin = Number.parseFloat(block.style.marginLeft || "0");
          const nextMargin = Math.max(0, currentMargin + (event.shiftKey ? -24 : 24));
          block.style.marginLeft = nextMargin ? `${nextMargin}px` : "";
        });
        syncContent();
        return;
      }
      if (selection?.rangeCount && !selection.isCollapsed && editorRef.current?.contains(selection.anchorNode)) {
        event.preventDefault();
        const range = selection.getRangeAt(0);
        if (event.shiftKey) {
          const selectedText = range.toString();
          const indentation = selectedText.match(/^(?:\t| {1,4})/);
          if (indentation) {
            range.setStart(range.startContainer, range.startOffset);
            range.deleteContents();
            range.insertNode(document.createTextNode(selectedText.slice(indentation[0].length)));
          }
        } else {
          range.deleteContents();
          range.insertNode(document.createTextNode("\t"));
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        syncContent();
        return;
      }
    }
    if (
      iconTarget ||
      iconSelection ||
      ((event.key === "Delete" || event.key === "Backspace") &&
        lineActionBlock?.matches("[data-globe]"))
    ) {
      event.preventDefault();
      return;
    }
        if (event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) {
      const selection = window.getSelection();
      const block = getTextEditorBlock(selection?.focusNode || null);
      const isEditingText =
        Boolean(block) &&
        block!.contentEditable !== "false" &&
        Boolean(selection?.focusNode && editorRef.current?.contains(selection.focusNode));
      if (!isEditingText) {
        event.preventDefault();
        selectAllBlocks();
        return;
      }
    }
    if (
      lineActionBlock &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      event.preventDefault();
      removeLine(activeBlock || lineActionBlock, event.key === "Backspace");
      pickers.setPickerPosition(null);
      pickers.setSlashPicker(null);
      setLineActionBlock(null);
      return;
    }
    if (
      activeBlock &&
      (event.key === "Delete" || event.key === "Backspace") &&
      isLineEmpty(activeBlock)
    ) {
      event.preventDefault();
      removeLine(activeBlock, event.key === "Backspace");
      return;
    }
    const picker: PickerState | null =
      pickers.slashPicker || pickers.callPicker;
    const candidates = pickers.slashPicker
      ? pickers.slashCandidates
      : pickers.callCandidates;
    const index = pickers.slashPicker
      ? pickers.slashPickerIndex
      : pickers.callPickerIndex;
    if (picker) {
      if (!candidates.length) {
        if (event.key === "Escape") {
          dismissEditorMenus();
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          event.key === "ArrowDown"
            ? (index + 1) % candidates.length
            : (index - 1 + candidates.length) % candidates.length;
        (pickers.slashPicker
          ? pickers.setSlashPickerIndex
          : pickers.setCallPickerIndex)(next);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (pickers.slashPicker)
          executePickerAction("slash", pickers.slashCandidates[index].tag);
        else executePickerAction("mention", pickers.callCandidates[index].id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        dismissEditorMenus();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const next = (index + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length;
        (pickers.slashPicker
          ? pickers.setSlashPickerIndex
          : pickers.setCallPickerIndex)(next);
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const selection = window.getSelection();
      const focus = selection?.focusNode || null;
      const block = getEditorBlock(focus);
      const globeContent = focus?.parentElement?.closest("[data-globe-content]") as HTMLElement | null;
      if (block) {
        event.preventDefault();
        if (globeContent && block.closest("[data-globe-content]") === globeContent) {
          insertLine(block, false);
          return;
        }
        insertLine(block, false);
      }
    }
  };
  const updatePickers = () => {
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      selection.focusNode?.nodeType !== Node.TEXT_NODE
    ) {
      pickers.setPickerPosition(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    pickers.setPickerPosition({
      top:
        rect.bottom + 228 <= window.innerHeight
          ? rect.bottom + 8
          : Math.max(8, rect.top - 228),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 228),
    });
    const text =
      selection.focusNode.textContent?.slice(0, selection.focusOffset) || "";
    const inPageIndexContext = Boolean(
      selection.focusNode.parentElement?.closest("[data-page-index]") ||
      selection.anchorNode?.parentElement?.closest("[data-page-index]")
    );
    if (inPageIndexContext) {
      pickers.setSlashPicker(null);
      pickers.setCallPicker(null);
      pickers.setPickerPosition(null);
      return;
    }
    const slash = text.match(/(?:^|\n|\s)\/([a-zA-Z0-9]*)$/);
    if (slash) {
      pickers.setSlashPicker({ query: slash[1], hasTrigger: true });
      pickers.setSlashPickerIndex(0);
      pickers.setCallPicker(null);
      return;
    }
    pickers.setSlashPicker(null);
    const mention = text.match(/(?:^|\s)@([^\s@]*)$/);
    if (mention) {
      pickers.setCallPicker({ query: mention[1] });
      pickers.setCallPickerIndex(0);
      return;
    }
    pickers.setCallPicker(null);
    pickers.setPickerPosition(null);
  };
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const insert = (html: string) => {
      const clean = sanitizeEditorHtml(html);
      if (!clean) return;
      const selection = window.getSelection();
      const block = getEditorBlock(selection?.focusNode || null);
      const hasBlockContent = /<(?:div|h[1-6]|li|ol|p|pre|table|ul)\b/i.test(clean);
      if (block && hasBlockContent && !block.matches("[data-divider], [data-globe]")) {
        const originalNextLine = block.nextElementSibling;
        const range = document.createRange();
        range.selectNode(block);
        range.collapse(false);
        const fragment = range.createContextualFragment(clean);
        const lastInserted = fragment.lastElementChild;
        range.insertNode(fragment);
        const nextLine = lastInserted || originalNextLine;
        if (nextLine && nextLine !== originalNextLine) {
  const nextRange = document.createRange();
  nextRange.selectNodeContents(nextLine);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
}
      } else {
        document.execCommand("insertHTML", false, clean);
      }
      syncContent();
    };
    const image = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    if (image) {
      const file = image.getAsFile();
      if (file && onImageFilePaste) {
        const createdId = onImageFilePaste(file, node.parentId ?? null);
        Promise.resolve(createdId).then((id) => {
          if (!id) return;
          const target = nodes.find((item) => item.id === id);
          if (!target) return;
          const selection = window.getSelection();
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
          if (!selection || !range) return;
          const mention = createMention(target, "full");
          range.deleteContents();
          insertMentionWithSpacing(range, mention);
          selection.removeAllRanges();
          selection.addRange(range);
          syncContent();
        });
        return;
      }
      if (file) {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          if (typeof reader.result === "string")
            insert(`<img src="${reader.result}" alt="Imagen pegada" />`);
        });
        reader.readAsDataURL(file);
      }
      return;
    }
    const html = event.clipboardData.getData("text/html");
    if (html) {
      insert(html);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    insert(formatPastedText(text));
  };

  const onEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (beginSelection(event)) {
      return;
    }
    onMentionEditorPointerDown(event);
  };

  const onEditorSelectionMove = (event: React.PointerEvent<HTMLDivElement>) => {
    onBlockSelectionMove(event);
  };

  const onEditorPointerUp = () => {
    finalizeBlockSelectionBox();
    if (!imageResizeRef.current) return;
    if (isMentionImageLegacy(imageResizeRef.current.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    syncContent();
  };
  const focusOrCreatePageLine = () => {
    const editor = editorRef.current;
    if (!editor || node.type !== "pagina") return;
    const lines = Array.from(
      editor.querySelectorAll<HTMLElement>(textLineSelector),
    ).filter((line) => isRootEditorBlock(line) && !line.matches("[data-divider]"));
    let line = lines.find((candidate) => isLineEmpty(candidate));
    if (!line) {
      line = document.createElement("p");
      line.appendChild(document.createElement("br"));
      editor.appendChild(line);
      syncContent();
    }
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    updatePlaceholder();
  };
  const repairEditorLines = () => normalizeDividers();
  useEffect(() => {
    if (!focusedNodeId) return;
    nodeRefs.current[focusedNodeId]?.scrollIntoView({ block: "nearest" });
    const timer = window.setTimeout(() => setFocusedNodeId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [focusedNodeId]);


  
  return {
    ...pickers,
    ...controls,
    selectionToolbar,
    applyTextFormat,
    applyTextColor,
    applyBlockBackgroundColor,
    focusedNodeId,
    nodeRefs,
    syncContent,
    scheduleContentSync,
    getEditorBlock,
    updatePlaceholder,
    updateSelectionToolbar,
    insertLine,
    removeLine,
    moveLine,
    updateLineControl,
    ensureEditorLine,
    updateLineDrop,
    startLineDrag,
    moveLineDrag,
    finishLineDrag,
    lineActionBlock,
    setLineActionBlock,
    setPlaceholderBlock,
    deleteSelectedLine,
    alignImage,
    openLineCommands,
    onEditorDrop,
    insertNodeMention,
    placeholderBlock,
    dismissEditorMenus,
    executePickerAction,
    onKeyDown,
    updatePickers,
    onPaste,
    onMentionPointerDown,
    onEditorPointerDown,
    onEditorPointerMove,
    onEditorPointerUp,
    blockSelection,
    onEditorSelectionMove,
    selectedLineBlocks,
    setSelectedLineBlocks,
    toggleLineSelection,
    clearLineSelection,
    repairEditorLines,
    clearGeneratedLines,
    focusOrCreatePageLine,
    clearStructuralUndo,
    buildPageIndexBlock,
    focusPageIndexEntry,
    
  };
}
