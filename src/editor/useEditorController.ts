import { useEffect, useRef, useState } from "react";
import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { useNodeScopedEditorHistory } from "./useEditorHistory";
import { useEditorSelection } from "./useEditorSelection";
import type { NodeItem } from "../types/nodes";
import type { PickerState } from "./types";
import { findImportableFile, isImportableDragItem } from "../project/fileNodeImporter";
import { formatPastedText, sanitizeEditorHtml, anytypeClipboardToHtml } from "./html";
import { useBlockControls } from "./useBlockControls";
import { useEditorBlocks } from "./useEditorBlocks";
import { useEditorBlockSelection, type BlockSelectionOrigin } from "./useEditorBlockSelection";
import { useEditorMentions } from "./useEditorMentions";
import { useEditorPickers } from "./useEditorPickers";
import { useRichTextEditor } from "./useRichTextEditor";
import draftAsset from "../assets/third-party/google-material/icons/draft.svg";
import { createEmptyEditorPickerSession, getEditorPickerTrigger, isSameMentionTriggerRange, type MentionTriggerRange } from "./pickerSession";
import { EDITOR_NON_EDITABLE_BLOCK_SELECTOR, EDITOR_SELECTABLE_BLOCK_SELECTOR, EDITOR_STRUCTURAL_BLOCK_SELECTOR } from "./blockModel";
import { applyEditorImageLayouts, isResizableEditorImage } from "./imageResize";
import { focusPageHeading } from "./pageIndexNavigation";
import { loadEditorImageLayouts, saveEditorImageLayout } from "../project/editorLayoutRepository";
import { getImageResourceInfo } from "../utils/imageResource";

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

const blockSelector = EDITOR_STRUCTURAL_BLOCK_SELECTOR;
const textLineSelector = EDITOR_SELECTABLE_BLOCK_SELECTOR;

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
    blockId: string;
    blockIdCreated: boolean;
  } | null>(null);
  const imageLayoutInteractedRef = useRef(false);
  const imageRepairInFlightRef = useRef(new Set<string>());
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const blockSelectionRef = useRef<BlockSelectionOrigin | null>(null);
  const generatedLinesRef = useRef<HTMLElement[]>([]);
  const lineCommandsOpenRef = useRef(false);
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

  useEffect(() => {
    let disposed = false;
    imageLayoutInteractedRef.current = false;
    void loadEditorImageLayouts(node.id).then((layouts) => {
      const editor = editorRef.current;
      if (disposed || imageLayoutInteractedRef.current || !editor || editor.dataset.activeId !== node.id) return;
      applyEditorImageLayouts(editor, layouts);
    }).catch((error) => console.error("No se pudo restaurar el tamaño de las imágenes", error));
    return () => { disposed = true; };
  }, [editorRef, node.id]);

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
      ? (element.closest(textLineSelector) as HTMLElement | null)
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
    block.matches(EDITOR_NON_EDITABLE_BLOCK_SELECTOR);
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
      editorRef.current?.focus();
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
    const preservedSelection = selectedLineBlocks.filter((line) => line.isConnected);
    clearTransientEditorState();
    structuralHistory.push(editor.innerHTML);
    preservedSelection.forEach((line) => {
      if (!line.isConnected) return;
      line.setAttribute("data-line-selected", "true");
      line.contentEditable = "false";
    });
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
  const normalizeEditableLines = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let changed = false;
    editor.querySelectorAll<HTMLElement>(textLineSelector).forEach((line) => {
      const shouldBeEditable = !isNonEditableBlockType(line) &&
        !line.matches("[data-line-selected], [data-line-dragging]");
      const expected = shouldBeEditable ? "true" : "false";
      if (line.contentEditable === expected) return;
      line.contentEditable = expected;
      changed = true;
    });
    return changed;
  };
  const resetEditorPickers = () => {
    if (
      !pickers.slashPicker &&
      !pickers.callPicker &&
      pickers.slashPickerIndex === 0 &&
      pickers.callPickerIndex === 0 &&
      !pickers.imageMentionChoice &&
      !pickers.pickerPosition &&
      !mentionTriggerRangeRef.current
    ) {
      return;
    }
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
    lineCommandsOpenRef.current = false;
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
      if (!target?.closest("[data-picker], [data-line-control], .his-context-menu")) {
        dismissEditorMenus();
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.visibilityState === "hidden") {
        return;
      }
      const blocks = selectedLineBlocks.filter((line) => line.isConnected);
      const hasSelectionMode = blocks.length > 0;
      const editor = editorRef.current;
      const targetIsInsideEditor = Boolean(
        editor && event.target instanceof Node && editor.contains(event.target),
      );
      if ((!targetIsInsideEditor || hasSelectionMode) && (event.ctrlKey || event.metaKey)) {
        const key = event.key.toLowerCase();
        const isUndo = key === "z" && !event.shiftKey;
        const isRedo = key === "y" || (key === "z" && event.shiftKey);
        if (isUndo && (restoreStructuralUndo() || restoreEditorUndo())) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (isRedo && (restoreStructuralRedo() || restoreEditorRedo())) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
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
  const applyBlockBackgroundColor = (color: string, targetBlock?: HTMLElement | null) => {
    pushEditorHistory();
    const selection = window.getSelection();
    if (!targetBlock && selection && selection.rangeCount && !selection.isCollapsed) {
      document.execCommand("backColor", false, color || "transparent");
      window.requestAnimationFrame(() => {
        syncContent();
        updateSelectionToolbar();
      });
      return;
    }
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const blocks = targetBlock?.isConnected
      ? [targetBlock]
      : selected.length
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
    window.requestAnimationFrame(() => {
      syncContent();
      updateSelectionToolbar();
    });
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
  });

  const {
    insertLine,
    splitLineAtSelection,
    ensureEditorLine,
    removeLine,
    deleteSelectedLine,
    openLineCommands,
    moveLine,
    updateLineControl,
    startLineDrag,
    moveLineDrag,
    finishLineDrag,
    cancelLineDrag,
  } = editorBlocks;

  useEffect(() => {
    const handleCut = (event: globalThis.ClipboardEvent) => {
      const blocks = selectedLineBlocks.filter((line) => line.isConnected);
      if (!blocks.length) return;
      const container = document.createElement("div");
      blocks.forEach((block) => {
        const clone = block.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-line-selected");
        clone.contentEditable = "true";
        container.appendChild(clone);
      });
      event.clipboardData?.setData("text/html", container.innerHTML);
      event.clipboardData?.setData("text/plain", blocks.map((block) => block.textContent || "").join("\n"));
      event.preventDefault();
      deleteSelectedLine();
    };
    document.addEventListener("cut", handleCut);
    return () => document.removeEventListener("cut", handleCut);
  }, [deleteSelectedLine, selectedLineBlocks]);

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

  const {
    beginSelection,
    clearSelectionBox,
    finalizeSelectionBox: finalizeBlockSelectionBox,
    onEditorSelectionMove: onBlockSelectionMove,
  } = blockSelectionController;

  useEffect(() => {
    let restoreEditorFocus = false;
    let restoreFrame = 0;
    const resetInterruptedInteraction = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      restoreEditorFocus = Boolean(
        editor && (
          editor.contains(document.activeElement) ||
          (selection?.anchorNode && editor.contains(selection.anchorNode))
        ),
      );
      clearSelectionBox();
      cancelLineDrag();
      imageResizeRef.current = null;
      controls.clearBlockControls();
      document.body.style.cursor = "default";
    };
    const restoreInteraction = () => {
      window.cancelAnimationFrame(restoreFrame);
      restoreFrame = window.requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (restoreEditorFocus && editor?.isConnected && !document.querySelector("[data-picker], .his-context-menu")) {
          editor.focus({ preventScroll: true });
        }
        document.body.style.cursor = "default";
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") resetInterruptedInteraction();
      else restoreInteraction();
    };
    window.addEventListener("blur", resetInterruptedInteraction);
    window.addEventListener("focus", restoreInteraction);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.removeEventListener("blur", resetInterruptedInteraction);
      window.removeEventListener("focus", restoreInteraction);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cancelLineDrag, clearSelectionBox, controls.clearBlockControls, editorRef]);

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
    block.style.padding = "4px 0";
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

  const normalizePageIndices = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let changed = false;
    editor.querySelectorAll<HTMLElement>("[data-page-index]").forEach((index) => {
      ["border-top", "border-bottom"].forEach((property) => {
        if (!index.style.getPropertyValue(property)) return;
        index.style.removeProperty(property);
        changed = true;
      });
    });
    return changed;
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

  const imageSourceToFile = async (source: string, fallbackName: string) => {
    if (source.startsWith("data:image/")) {
      const separator = source.indexOf(",");
      if (separator < 0) return null;
      const metadata = source.slice(5, separator);
      const mime = metadata.split(";")[0] || "image/png";
      const encoded = source.slice(separator + 1).replace(/\s+/g, "");
      const bytes = metadata.toLowerCase().includes(";base64")
        ? Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(source.slice(separator + 1)));
      const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
      return new File([bytes], `${fallbackName}.${extension}`, { type: mime });
    }
    if (!/^(?:blob:|https?:)/i.test(source)) return null;
    const response = await fetch(source);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const urlName = (() => {
      try { return new URL(source).pathname.split("/").filter(Boolean).pop() || ""; }
      catch { return ""; }
    })();
    const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const name = /\.[a-z0-9]{2,5}$/i.test(urlName) ? urlName : `${fallbackName}.${extension}`;
    return new File([blob], name, { type: blob.type });
  };

  const repairUnlinkedEditorImages = async () => {
    const editor = editorRef.current;
    if (!editor || !onFileImport) return false;
    const candidates = Array.from(editor.querySelectorAll<HTMLImageElement>("img")).filter((image) =>
      !image.closest("[data-mention-id], [data-globe-icon]") &&
      image.dataset.noResize !== "true" &&
      image.dataset.imageRepair !== "pending",
    );
    if (!candidates.length) return false;

    const existingBySource = new Map<string, NodeItem>();
    nodes.filter((item) => item.type === "imagen").forEach((item) => {
      const resource = getImageResourceInfo(item.content, item.name);
      if (resource?.src) existingBySource.set(resource.src, item);
    });
    let changed = false;
    const groups = new Map<string, HTMLImageElement[]>();
    candidates.forEach((image) => {
      const source = image.getAttribute("src")?.trim() || image.src;
      if (!source) return;
      groups.set(source, [...(groups.get(source) || []), image]);
      image.dataset.imageRepair = "pending";
    });

    for (const [source, images] of groups) {
      if (imageRepairInFlightRef.current.has(source)) continue;
      imageRepairInFlightRef.current.add(source);
      try {
        let target = existingBySource.get(source) || existingBySource.get(images[0]?.src || "") || null;
        if (!target) {
          const fallbackName = images[0]?.alt.trim() || "Imagen importada";
          const file = await imageSourceToFile(source, fallbackName);
          if (file) target = await onFileImport(file, node.parentId ?? null);
        }
        if (!target) {
          images.forEach((image) => delete image.dataset.imageRepair);
          continue;
        }
        images.forEach((image) => {
          if (!image.isConnected || !editor.contains(image)) return;
          const mention = createMention(target!, "full");
          const parent = image.parentElement;
          const parentOnlyContainsImage = Boolean(
            parent?.matches("p, div") &&
            !parent.textContent?.trim() &&
            parent.querySelectorAll("img").length === 1 &&
            parent.children.length === 1,
          );
          if (parentOnlyContainsImage && parent && parent !== editor) parent.replaceWith(mention);
          else image.replaceWith(mention);
          changed = true;
        });
      } catch (error) {
        console.warn("No se pudo convertir una imagen pegada en Nodo Imagen.", error);
        images.forEach((image) => delete image.dataset.imageRepair);
      } finally {
        imageRepairInFlightRef.current.delete(source);
      }
    }
    if (changed) syncContent();
    return changed;
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
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    if (editor instanceof HTMLElement) editor.blur();
    target.blur();
    focusPageHeading(target);
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
        captureStructuralUndo();
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
      removeLine(activeBlock || lineActionBlock, event.key === "Backspace", {
        captureUndo: !event.repeat,
        sync: false,
      });
      scheduleContentSync(180, true);
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
      removeLine(activeBlock, event.key === "Backspace", {
        captureUndo: !event.repeat,
        sync: false,
      });
      scheduleContentSync(180, true);
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
        if (splitLineAtSelection(block)) return;
        if (globeContent && block.closest("[data-globe-content]") === globeContent) {
          insertLine(block, false);
          return;
        }
        insertLine(block, false);
      }
    }
  };
  const updatePickers = () => {
    if (lineCommandsOpenRef.current) return;
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      selection.focusNode?.nodeType !== Node.TEXT_NODE
    ) {
      resetEditorPickers();
      return;
    }
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
    if (!trigger) {
      resetEditorPickers();
      return;
    }

    // Reading the caret rectangle forces browser layout. Keep it entirely out of
    // the normal typing path and only pay that cost while a picker is visible.
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const nextPickerPosition = {
      top:
        rect.bottom + 228 <= window.innerHeight
          ? rect.bottom + 8
          : Math.max(8, rect.top - 228),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 228),
    };
    pickers.setPickerPosition((current) =>
      current?.top === nextPickerPosition.top && current.left === nextPickerPosition.left
        ? current
        : nextPickerPosition,
    );
    if (trigger?.type === "slash") {
      mentionTriggerRangeRef.current = null;
      pickers.setImageMentionChoice(null);
      pickers.setSlashPicker((current) =>
        current?.query === trigger.query && current.hasTrigger
          ? current
          : { query: trigger.query, hasTrigger: true },
      );
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
      pickers.setCallPicker((current) =>
        current?.query === trigger.query ? current : { query: trigger.query },
      );
      return;
    }
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
        const pastedContainer = document.createElement("div");
        pastedContainer.innerHTML = clean;
        replacePastedMentions(pastedContainer);
        document.execCommand("insertHTML", false, pastedContainer.innerHTML);
        if (editor) {
          const pastedIndices = Array.from(editor.querySelectorAll<HTMLElement>("[data-page-index]"))
            .filter((index) => !previousIndices.has(index));
          replacePastedIndices(pastedIndices);
        }
      }
      syncContent();
      void repairUnlinkedEditorImages();
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
    if (imageResizeRef.current) imageLayoutInteractedRef.current = true;
  };

  const onEditorSelectionMove = (event: React.PointerEvent<HTMLDivElement>) => {
    onBlockSelectionMove(event);
  };

  const onEditorPointerUp = () => {
    finalizeBlockSelectionBox();
    const resize = imageResizeRef.current;
    if (!resize) return;
    if (!isResizableEditorImage(resize.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    const width = Math.max(40, Number.parseFloat(resize.image.style.width) || resize.image.getBoundingClientRect().width);
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    void saveEditorImageLayout({ nodeId: node.id, blockId: resize.blockId, width })
      .catch((error) => {
        console.error("No se pudo guardar el tamaño de la imagen", error);
        scheduleContentSync(0, true);
      });
    // Legacy images need one compatible HTML snapshot to persist their new
    // stable identity. Every later resize writes only the small layout row.
    if (resize.blockIdCreated) syncContent();
  };
  const focusOrCreatePageLine = () => {
    const editor = editorRef.current;
    if (!editor || node.type !== "pagina") return;
    const lines = Array.from(
      editor.querySelectorAll<HTMLElement>(textLineSelector),
    ).filter((line) => isRootEditorBlock(line) && !line.matches("[data-divider]"));
    // Clicking the whitespace below a page must continue at the end. Reusing an
    // unrelated empty block higher in the document makes the caret appear to jump.
    let line = lines.length > 0 && isLineEmpty(lines[lines.length - 1])
      ? lines[lines.length - 1]
      : undefined;
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
    const indicesChanged = normalizePageIndices();
    // Runtime editability is deliberately not persisted. Reporting it as a
    // document repair would rewrite a large imported page every time it opens.
    normalizeEditableLines();
    return dividersChanged || globesChanged || indicesChanged;
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
    cancelLineDrag,
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
    resetEditorPickers,
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
    captureStructuralUndo,
    buildPageIndexBlock,
    focusPageIndexEntry,
    repairUnlinkedEditorImages,
    
  };
}
