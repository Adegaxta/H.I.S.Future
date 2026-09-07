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
import { findImportableFile, isImportableDragItem } from "../project/fileNodeImporter";
import { formatPastedText, sanitizeEditorHtml, anytypeClipboardToHtml } from "../utils/editorHtml";
import { useBlockControls } from "./useBlockControls";
import { useEditorBlocks } from "./useEditorBlocks";
import { useEditorBlockSelection } from "./useEditorBlockSelection";
import { useEditorMentions } from "./useEditorMentions";
import { useEditorPickers } from "./useEditorPickers";
import { useRichTextEditor } from "./useRichTextEditor";
import draftAsset from "../assets/third-party/google-material/icons/draft.svg";
import { createEmptyEditorPickerSession, getEditorPickerTrigger, isSameMentionTriggerRange, type MentionTriggerRange } from "../utils/editorPickerSession";

interface EditorControllerOptions {
  node: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  editorRef: RefObject<HTMLDivElement | null>;
  onContentChange: (id: string, html: string) => void;
  setSelectedId: (id: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenDeletedNode: (id: string) => void;
  onFileImport?: (file: File, parentId?: string | null) => Promise<NodeItem | null> | NodeItem | null;
  onCreatePastedNode?: (name: string) => NodeItem | null;
  onSlashCommand?: (tag: string) => boolean;
}

const blockSelector =
  'p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-globe], [data-page-index], [data-mention-id][data-mention-mode="full"]';
const textLineSelector =
  'p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-globe], [data-page-index], [data-mention-id][data-mention-mode="full"]';

export function useEditorController({
  node,
  nodes,
  deletedNodes,
  editorRef,
  onContentChange,
  setSelectedId,
  setExpanded,
  onOpenDeletedNode,
  onFileImport,
  onCreatePastedNode,
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
  const mentionTriggerRangeRef = useRef<MentionTriggerRange | null>(null);
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
      ? (element.closest('p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-page-index], [data-mention-id][data-mention-mode="full"]') as HTMLElement | null)
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
    block.matches('[data-divider], [data-globe], [data-page-index], [data-mention-id][data-mention-mode="full"]');
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
        if (!isNonEditableBlockType(line)) line.contentEditable = "true";
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
  const normalizeGlobes = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let changed = false;
    editor.querySelectorAll<HTMLElement>("[data-globe]").forEach((globe) => {
      if (globe.contentEditable !== "true") {
        globe.contentEditable = "true";
        changed = true;
      }

      const content = globe.querySelector<HTMLElement>("[data-globe-content]");
      if (!content) return;
      if (content.contentEditable !== "true") {
        content.contentEditable = "true";
        changed = true;
      }

      content.querySelectorAll<HTMLElement>(textLineSelector).forEach((line) => {
        if (line.matches("[data-divider], [data-page-index]")) {
          if (line.contentEditable !== "false") {
            line.contentEditable = "false";
            changed = true;
          }
          return;
        }
        if (line.matches("[data-line-selected], [data-line-dragging]")) return;
        if (line.contentEditable !== "true") {
          line.contentEditable = "true";
          changed = true;
        }
      });

      globe.querySelectorAll<HTMLElement>("[data-globe-icon]").forEach((icon) => {
        if (icon.contentEditable !== "false") {
          icon.contentEditable = "false";
          changed = true;
        }
      });
    });
    return changed;
  };
  const resetEditorPickers = () => {
    const empty = createEmptyEditorPickerSession();
    pickers.setSlashPicker(empty.slashPicker);
    pickers.setCallPicker(empty.callPicker);
    pickers.setSlashPickerIndex(empty.slashPickerIndex);
    pickers.setCallPickerIndex(empty.callPickerIndex);
    pickers.setImageMentionChoice(empty.imageMentionChoice);
    pickers.setPickerPosition(empty.pickerPosition);
    mentionTriggerRangeRef.current = empty.mentionTriggerRange;
  };
  const dismissEditorMenus = () => {
    resetEditorPickers();
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
    insertNodeReference,
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

  const replacePastedIndices = (roots: Node[]) => {
    const importedIndices = new Set<HTMLElement>();
    roots.forEach((root) => {
      if (root instanceof HTMLElement && root.matches("[data-page-index]")) {
        importedIndices.add(root);
      }
      if (root instanceof Element) {
        root.querySelectorAll<HTMLElement>("[data-page-index]").forEach((index) => importedIndices.add(index));
      }
    });
    const replacements = new Map<Node, HTMLElement>();
    importedIndices.forEach((index) => {
      const scopeRoot = index.dataset.pageIndexSource === "anytype"
        ? null
        : index.closest<HTMLElement>("[data-globe-content]");
      const replacement = buildPageIndexBlock(scopeRoot);
      index.replaceWith(replacement);
      replacements.set(index, replacement);
    });
    return replacements;
  };

  const replacePastedMentions = (root: Node) => {
    const knownNodes = nodes
      .filter((item) => item.name.trim())
      .sort((left, right) => right.name.trim().length - left.name.trim().length);
    const createdNodes = new Map<string, NodeItem>();
    if (root instanceof Element || root instanceof DocumentFragment) {
      root.querySelectorAll<HTMLElement>("[data-anytype-mention]").forEach((mention) => {
        const name = (mention.textContent || "").replace(/\s+/g, " ").trim();
        if (!name) {
          mention.remove();
          return;
        }
        const normalizedName = name.toLocaleLowerCase();
        const existing = knownNodes.find(
          (item) => item.name.trim().toLocaleLowerCase() === normalizedName,
        );
        const target = existing || createdNodes.get(normalizedName) || onCreatePastedNode?.(name) || null;
        if (!target) {
          mention.replaceWith(document.createTextNode(name));
          return;
        }
        if (!existing) createdNodes.set(normalizedName, target);
        const replacement = createMention(target);
        Array.from(replacement.childNodes).forEach((child) => {
          if (!(child instanceof HTMLImageElement)) child.remove();
        });
        Array.from(mention.childNodes).forEach((child) => {
          replacement.appendChild(child.cloneNode(true));
        });
        mention.replaceWith(replacement);
      });
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }

    textNodes.forEach((textNode) => {
      const parent = textNode.parentElement;
      if (!parent || parent.closest("[data-globe-icon], [data-page-index], [data-mention-id], .editor-mention")) return;
      const text = textNode.textContent || "";
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let changed = false;

      while (cursor < text.length) {
        const atIndex = text.indexOf("@", cursor);
        if (atIndex < 0) break;
        if (atIndex > 0 && !/\s/.test(text[atIndex - 1] || "")) {
          cursor = atIndex + 1;
          continue;
        }

        const matchingNode = knownNodes.find((item) => {
          const name = item.name.trim();
          const end = atIndex + 1 + name.length;
          const candidate = text.slice(atIndex + 1, end);
          const nextCharacter = text[end] || "";
          return candidate.toLocaleLowerCase() === name.toLocaleLowerCase() &&
            (!nextCharacter || /[\s.,;:!?()[\]{}]/.test(nextCharacter));
        });
        const matchingName = matchingNode?.name.trim() ||
          text.slice(atIndex + 1).match(/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9._-]*/)?.[0] || "";
        if (!matchingName) {
          cursor = atIndex + 1;
          continue;
        }

        const normalizedName = matchingName.toLocaleLowerCase();
        const target = matchingNode || createdNodes.get(normalizedName) || onCreatePastedNode?.(matchingName) || null;
        if (!target) {
          cursor = atIndex + 1;
          continue;
        }
        if (!matchingNode) createdNodes.set(normalizedName, target);
        const end = atIndex + 1 + matchingName.length;
        fragment.appendChild(document.createTextNode(text.slice(cursor, atIndex)));
        fragment.appendChild(createMention(target));
        cursor = end;
        changed = true;
      }

      if (!changed) return;
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(fragment, textNode);
    });
  };

  const prepareAnytypeImages = async (anytypeHtml: string, clipboardHtml: string) => {
    const source = new DOMParser().parseFromString(anytypeHtml, "text/html");
    const placeholders = Array.from(
      source.querySelectorAll<HTMLElement>("[data-anytype-file-id]"),
    );
    if (!placeholders.length) return anytypeHtml;

    const clipboard = new DOMParser().parseFromString(clipboardHtml, "text/html");
    const images = Array.from(clipboard.querySelectorAll<HTMLImageElement>("img"))
      .map((image) => image.getAttribute("src")?.trim() || "")
      .filter((src) => src.startsWith("data:image/"));

    for (let index = 0; index < placeholders.length; index += 1) {
      const placeholder = placeholders[index];
      const src = images[index];
      if (!src || !onFileImport) {
        placeholder.remove();
        continue;
      }
      try {
        const separator = src.indexOf(",");
        if (separator < 0) {
          placeholder.remove();
          continue;
        }
        const metadata = src.slice(5, separator);
        const mime = metadata.split(";")[0] || "image/png";
        const encoded = src.slice(separator + 1).replace(/\s+/g, "");
        const bytes = metadata.toLowerCase().includes(";base64")
          ? Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
          : new TextEncoder().encode(decodeURIComponent(src.slice(separator + 1)));
        const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
        const file = new File([bytes], `Imagen de Anytype ${index + 1}.${extension}`, { type: mime });
        const target = await onFileImport(file, node.parentId ?? null);
        if (target) placeholder.replaceWith(createMention(target, "full"));
        else placeholder.remove();
      } catch (error) {
        console.error("No se pudo importar una imagen del clipboard de Anytype.", error);
        placeholder.remove();
      }
    }
    return source.body.innerHTML;
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
    const file = findImportableFile(event.dataTransfer);
    if (file && onFileImport) {
      event.preventDefault();
      const x = event.clientX;
      const y = event.clientY;
      controls.clearBlockControls();
      void Promise.resolve(onFileImport(file, node.parentId ?? null)).then((created) => {
        if (created) insertNodeReference(created, x, y);
      });
      return;
    }
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
    if (Array.from(event.dataTransfer.items).some(isImportableDragItem)) {
      event.dataTransfer.dropEffect = "copy";
      controls.setLineControl(null);
      return;
    }
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
      ) {
        resetEditorPickers();
        return;
      }
      const length = pickers.callPicker.query.length + 1;
      if (selection.focusOffset < length) {
        resetEditorPickers();
        return;
      }
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
    } else if (value === "UL") {
      const blocks = actionBlocks.length
        ? actionBlocks
        : [getEditorBlock(selection.focusNode)].filter(Boolean) as HTMLElement[];
      if (blocks.length) captureStructuralUndo();
      if (!blocks.length) {
        document.execCommand("insertUnorderedList", false);
      } else {
        blocks.forEach((block) => {
          const blockRange = document.createRange();
          blockRange.selectNodeContents(block);
          selection.removeAllRanges();
          selection.addRange(blockRange);
          document.execCommand("insertUnorderedList", false);
        });
      }
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
      if (block?.matches("li")) return;
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
      resetEditorPickers();
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
      resetEditorPickers();
      return;
    }
    const trigger = getEditorPickerTrigger(text);
    if (trigger?.type === "slash") {
      mentionTriggerRangeRef.current = null;
      pickers.setImageMentionChoice(null);
      pickers.setSlashPicker({ query: trigger.query, hasTrigger: true });
      pickers.setSlashPickerIndex(0);
      pickers.setCallPicker(null);
      pickers.setCallPickerIndex(0);
      return;
    }
    pickers.setSlashPicker(null);
    pickers.setSlashPickerIndex(0);
    if (trigger?.type === "mention") {
      const triggerOffset = selection.focusOffset - trigger.query.length - 1;
      if (!isSameMentionTriggerRange(mentionTriggerRangeRef.current, selection.focusNode, triggerOffset)) {
        pickers.setImageMentionChoice(null);
        pickers.setCallPickerIndex(0);
      }
      mentionTriggerRangeRef.current = { container: selection.focusNode, triggerOffset };
      pickers.setCallPicker({ query: trigger.query });
      return;
    }
    resetEditorPickers();
  };
  useEffect(() => {
    if (!pickers.callPicker && !pickers.imageMentionChoice && !pickers.slashPicker) return;
    const handleSelectionChange = () => updatePickers();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [pickers.callPicker, pickers.imageMentionChoice, pickers.slashPicker]);
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    clearLineSelection();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
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
        const pastedRoots = Array.from(fragment.childNodes);
        const lastInserted = fragment.lastElementChild;
        replacePastedMentions(fragment);
        range.insertNode(fragment);
        const indexReplacements = replacePastedIndices(pastedRoots);
        const nextLine = (lastInserted && indexReplacements.get(lastInserted)) || lastInserted || originalNextLine;
        if (nextLine && nextLine !== originalNextLine) {
  const nextRange = document.createRange();
  nextRange.selectNodeContents(nextLine);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
}
      } else {
        const editor = editorRef.current;
        const previousIndices = new Set(
          editor ? Array.from(editor.querySelectorAll<HTMLElement>("[data-page-index]")) : [],
        );
        document.execCommand("insertHTML", false, clean);
        if (editor) {
          const pastedIndices = Array.from(editor.querySelectorAll<HTMLElement>("[data-page-index]"))
            .filter((index) => !previousIndices.has(index));
          replacePastedIndices(pastedIndices);
        }
      }
      syncContent();
    };
    const image = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    if (image) {
      const file = image.getAsFile();
      if (file && onFileImport) {
        const createdNode = onFileImport(file, node.parentId ?? null);
        Promise.resolve(createdNode).then((target) => {
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
    const anytypeJson = event.clipboardData.getData("application/json");
    if (anytypeJson) {
      const anytypeHtml = anytypeClipboardToHtml(anytypeJson);
      if (anytypeHtml) {
        const clipboardHtml = event.clipboardData.getData("text/html");
        void prepareAnytypeImages(anytypeHtml, clipboardHtml).then(insert);
        return;
      }
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
  const repairEditorLines = () => {
    const dividersChanged = normalizeDividers();
    const globesChanged = normalizeGlobes();
    return dividersChanged || globesChanged;
  };
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
