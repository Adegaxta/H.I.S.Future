import { mutedEditorBackground } from "./blockColors";
import { useEffect, useRef, useState } from "react";
import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { useNodeScopedEditorHistory } from "./useEditorHistory";
import { useEditorSelection } from "./useEditorSelection";
import type { SelectionToolbarState } from "./useEditorSelection";
import { rangeBelongsToEditor, type InlineFormatCommand } from "./inlineMarks";
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
import { stripTransientEditorState } from "./serialization";
import draftAsset from "../assets/third-party/google-material/icons/draft.svg";
import { createEmptyEditorPickerSession, getEditorPickerTrigger, isSameMentionTriggerRange, type MentionTriggerRange } from "./pickerSession";
import { EDITOR_NON_EDITABLE_BLOCK_SELECTOR, EDITOR_SELECTABLE_BLOCK_SELECTOR, EDITOR_STRUCTURAL_BLOCK_SELECTOR, EDITOR_UI_SELECTOR } from "./blockModel";
import {
  applyEditorImageLayouts,
  clampEditorImageWidth,
  getEditorImageMaxWidth,
  isResizableEditorImage,
} from "./imageResize";
import { focusPageHeading } from "./pageIndexNavigation";
import { loadEditorImageLayouts, saveEditorImageLayout } from "../project/editorLayoutRepository";
import { getImageResourceInfo } from "../utils/imageResource";
import { ensureTableRuntime, getTableRootFromNode, insertTableIntoBlock, isTableEditingTarget } from "./table";

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
  recentNodes?: NodeItem[];
  onMentionCreate?: (kind: "here" | "in") => void;
  onCreatePastedNode?: (name: string) => NodeItem | null;
  onSlashCommand?: (tag: string) => boolean;
}

const blockSelector = EDITOR_STRUCTURAL_BLOCK_SELECTOR;
const textLineSelector = EDITOR_SELECTABLE_BLOCK_SELECTOR;

interface EditorSelectionSnapshot {
  anchorPath: number[];
  anchorOffset: number;
  focusPath: number[];
  focusOffset: number;
}

interface EditorSnapshot {
  html: string;
  selection: EditorSelectionSnapshot | null;
}

const sameEditorSnapshot = (left: EditorSnapshot, right: EditorSnapshot) =>
  left.html === right.html;

function getNodePath(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function getNodeAtPath(root: Node, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const next: Node | undefined = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

function clampSelectionOffset(node: Node, offset: number) {
  const maximum = node.nodeType === Node.TEXT_NODE
    ? (node.textContent?.length ?? 0)
    : node.childNodes.length;
  return Math.max(0, Math.min(offset, maximum));
}

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
  recentNodes,
  onMentionCreate,
  onSlashCommand,
}: EditorControllerOptions) {
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const savedTextRangeRef = useRef<Range | null>(null);
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
  // Text, formatting and structural edits must share one chronological stack.
  // Separate stacks made Ctrl+Z prefer an old structural change and skip newer
  // text/formatting changes, which looked like several actions disappearing.
  const editorHistory = useNodeScopedEditorHistory<EditorSnapshot>(
    node.id,
    100,
    sameEditorSnapshot,
  );
  const inputHistoryGroupRef = useRef<{
    kind: "insert" | "delete" | "other";
    at: number;
    closed: boolean;
  } | null>(null);
  const [blockSelection, setBlockSelection] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const pickers = useEditorPickers(nodes, recentNodes);
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
  const getAvailableTableWidth = () => {
    const editor = editorRef.current;
    if (!editor) return 0;
    const styles = getComputedStyle(editor);
    const horizontalPadding = Number.parseFloat(styles.paddingLeft || "0") + Number.parseFloat(styles.paddingRight || "0");
    return Math.max(0, editor.getBoundingClientRect().width - horizontalPadding - 32);
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
    const table = getTableRootFromNode(element);
    if (table && editor.contains(table)) {
      const owner = table.parentElement?.closest<HTMLElement>(textLineSelector);
      return owner && editor.contains(owner) ? owner : table;
    }
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
    const editor = editorRef.current;
    if (!editor || !editor.contains(block)) return;
    const identity = block.dataset.editorBlockIdentity ||= crypto.randomUUID();
    window.getSelection()?.removeAllRanges();
    savedTextRangeRef.current = null;
    setSelectionToolbar(null);
    const selectedIds = new Set(Array.from(editor.querySelectorAll<HTMLElement>("[data-line-selected]"))
      .map((line) => line.dataset.editorBlockIdentity ||= crypto.randomUUID()));
    if (selectedIds.has(identity)) selectedIds.delete(identity);
    else selectedIds.add(identity);
    clearLineSelection();
    const next = Array.from(editor.querySelectorAll<HTMLElement>("[data-editor-block-identity]"))
      .filter((line) => selectedIds.has(line.dataset.editorBlockIdentity!));
    next.forEach((line) => {
      line.setAttribute("data-line-selected", "true");
      line.contentEditable = "false";
    });
    setSelectedLineBlocks(next);
    editor.focus({ preventScroll: true });
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
  const captureSelectionSnapshot = (editor: HTMLElement): EditorSelectionSnapshot | null => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return null;
    if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;
    const anchorPath = getNodePath(editor, selection.anchorNode);
    const focusPath = getNodePath(editor, selection.focusNode);
    if (!anchorPath || !focusPath) return null;
    return {
      anchorPath,
      anchorOffset: selection.anchorOffset,
      focusPath,
      focusOffset: selection.focusOffset,
    };
  };
  const captureEditorSnapshot = (editor: HTMLElement): EditorSnapshot => ({
    html: stripTransientEditorState(editor.innerHTML),
    selection: captureSelectionSnapshot(editor),
  });
  const restoreSelectionSnapshot = (editor: HTMLElement, snapshot: EditorSelectionSnapshot | null) => {
    const selection = window.getSelection();
    if (!selection) return;
    const anchor = snapshot ? getNodeAtPath(editor, snapshot.anchorPath) : null;
    const focus = snapshot ? getNodeAtPath(editor, snapshot.focusPath) : null;
    if (anchor && focus && snapshot) {
      selection.setBaseAndExtent(
        anchor,
        clampSelectionOffset(anchor, snapshot.anchorOffset),
        focus,
        clampSelectionOffset(focus, snapshot.focusOffset),
      );
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const restoreEditorSnapshot = (snapshot: EditorSnapshot) => {
    const editor = editorRef.current;
    if (!editor) return;
    clearTransientEditorState();
    controls.clearBlockControls();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
    editor.innerHTML = snapshot.html;
    ensureTableRuntime(editor);
    clearGeneratedLines();
    editor.focus();
    restoreSelectionSnapshot(editor, snapshot.selection);
    syncContent();
    updatePlaceholder();
  };
  const captureStructuralUndo = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const preservedSelection = selectedLineBlocks.filter((line) => line.isConnected);
    clearTransientEditorState();
    inputHistoryGroupRef.current = null;
    editorHistory.push(captureEditorSnapshot(editor));
    preservedSelection.forEach((line) => {
      if (!line.isConnected) return;
      line.setAttribute("data-line-selected", "true");
      line.contentEditable = "false";
    });
  };
  const restoreStructuralUndo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const previous = editorHistory.undo(captureEditorSnapshot(editor));
    if (previous === undefined) return false;
    inputHistoryGroupRef.current = null;
    restoreEditorSnapshot(previous);
    return true;
  };
  const restoreStructuralRedo = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    const next = editorHistory.redo(captureEditorSnapshot(editor));
    if (next === undefined) return false;
    inputHistoryGroupRef.current = null;
    restoreEditorSnapshot(next);
    return true;
  };
  const pushEditorHistory = () => {
    const editor = editorRef.current;
    if (!editor) return;
    inputHistoryGroupRef.current = null;
    editorHistory.push(captureEditorSnapshot(editor));
  };
  const restoreEditorUndo = restoreStructuralUndo;
  const restoreEditorRedo = restoreStructuralRedo;
  const captureInputUndo = (inputType: string, data: string | null = null) => {
    if (inputType === "historyUndo") {
      restoreEditorUndo();
      return;
    }
    if (inputType === "historyRedo") {
      restoreEditorRedo();
      return;
    }
    const kind = inputType.startsWith("insert")
      ? "insert"
      : inputType.startsWith("delete")
        ? "delete"
        : "other";
    const now = performance.now();
    const previous = inputHistoryGroupRef.current;
    const beginsGroup = kind === "other" || !previous || previous.closed ||
      previous.kind !== kind || now - previous.at > 1_000;
    if (beginsGroup) pushEditorHistory();
    inputHistoryGroupRef.current = {
      kind,
      at: now,
      // Match the useful part of native editor history: ordinary typing is
      // grouped into words, while commands/paste remain isolated actions.
      closed: kind === "other" || (kind === "insert" && Boolean(data && /\s/u.test(data))),
    };
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
      if (!target?.closest("[data-picker], [data-line-control], .his-context-menu, .page-context-menu-layer, [data-color-picker], [data-selection-toolbar]")) {
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
        const html = stripTransientEditorState(container.innerHTML);
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
      const html = stripTransientEditorState(container.innerHTML);
      if (!html) return;
      event.clipboardData?.setData("text/html", html);
      event.clipboardData?.setData("text/plain", selection.toString());
      event.preventDefault();
    };
    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, [selectedLineBlocks]);

  const restoreTextSelection = () => {
    const editor = editorRef.current;
    const range = savedTextRangeRef.current;
    const selection = window.getSelection();
    if (!editor || !range || !selection || !rangeBelongsToEditor(range, editor)) return selection;
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());
    return selection;
  };
  const applyMentionFormat = (range: Range, command: InlineFormatCommand, enabled: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>(".editor-mention").forEach((mention) => {
      try {
        if (!range.intersectsNode(mention)) return;
      } catch {
        return;
      }
      const label = mention.querySelector<HTMLElement>(":scope > .editor-mention__label");
      if (!label) return;
      if (command === "bold") {
        label.style.removeProperty("font-weight");
        mention.style.fontWeight = enabled ? "bold" : "";
      } else if (command === "italic") {
        label.style.removeProperty("font-style");
        mention.style.fontStyle = enabled ? "italic" : "";
      }
      else if (command === "underline") {
        if (enabled) mention.dataset.mentionUserUnderline = "true";
        else mention.removeAttribute("data-mention-user-underline");
      } else if (command === "strikeThrough") {
        if (enabled) mention.dataset.mentionStrike = "true";
        else mention.removeAttribute("data-mention-strike");
      }
    });
  };
  const applyMentionTextColor = (range: Range, color: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>(".editor-mention").forEach((mention) => {
      try {
        if (!range.intersectsNode(mention)) return;
      } catch {
        return;
      }
      const label = mention.querySelector<HTMLElement>(":scope > .editor-mention__label");
      if (!label) return;
      if (color) mention.style.color = color;
      else mention.style.removeProperty("color");
      label.style.removeProperty("color");
    });
  };
  const applyTextFormat = (command: InlineFormatCommand) => {
    pushEditorHistory();
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const selection = selectionToolbar ? restoreTextSelection() || window.getSelection() : window.getSelection();
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
        const enableMentionFormat = !document.queryCommandState(command);
        document.execCommand(command, false);
        applyMentionFormat(range, command, enableMentionFormat);
      });
    } else if (selection && selection.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0).cloneRange();
      const enableMentionFormat = selectionToolbar?.marks[command] !== "on";
      document.execCommand(command, false);
      applyMentionFormat(range, command, enableMentionFormat);
    }
    syncContent();
    window.requestAnimationFrame(updateSelectionToolbar);
  };
  const applyTextColor = (color: string) => {
    pushEditorHistory();
    const blocks = selectedLineBlocks.filter((line) => line.isConnected);
    const selection = selectionToolbar ? restoreTextSelection() || window.getSelection() : window.getSelection();
    const targetBlocks = blocks.length
      ? blocks
      : lineActionBlock && lineActionBlock.isConnected
        ? [lineActionBlock]
        : (() => {
            const block = getEditorBlock(selection?.focusNode || null) || null;
            return block ? [block] : [];
          })();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0).cloneRange();
      document.execCommand("foreColor", false, color);
      applyMentionTextColor(range, color);
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
      document.execCommand("backColor", false, mutedEditorBackground(color) || "transparent");
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
      if (color) block.style.backgroundColor = mutedEditorBackground(color);
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
    savedTextRangeRef,
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
      event.clipboardData?.setData("text/html", stripTransientEditorState(container.innerHTML));
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
    activeNodeId: node.id,
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

  const normalizePageIndices = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let changed = false;
    const headings = Array.from(editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [data-heading], .editor-heading, .heading"))
      .filter((heading) => !heading.closest("[data-page-index], [data-globe]") && Boolean(heading.textContent?.trim()));
    editor.querySelectorAll<HTMLElement>("[data-page-index]").forEach((index) => {
      const suppliedItems = index.getAttribute("data-page-index-source") === "anytype"
        ? Array.from(index.querySelectorAll<HTMLElement>("[data-page-index-item]"))
        : [];
      const fragment = document.createDocumentFragment();
      const entries = suppliedItems.length
        ? suppliedItems.map((item) => ({
          label: item.querySelector<HTMLElement>(".editor-page-index__label")?.textContent?.trim() || item.textContent?.trim() || "",
          level: item.getAttribute("data-page-index-level"),
        }))
        : headings.map((heading) => ({
          label: heading.textContent?.replace(/\s+/g, " ").trim() || "",
          level: null,
        }));
      const usedHeadings = new Set<HTMLElement>();
      entries.forEach(({ label: entryLabel, level }, entryIndex) => {
        const heading = headings.find((candidate) =>
          !usedHeadings.has(candidate) &&
          candidate.textContent?.replace(/\s+/g, " ").trim() === entryLabel,
        );
        if (heading) usedHeadings.add(heading);
        const headingIndex = heading ? headings.indexOf(heading) : entryIndex;
        const id = heading?.dataset.pageIndexId || `his-page-index-${headingIndex}`;
        if (heading) heading.dataset.pageIndexId = id;
        const item = document.createElement("div");
        item.dataset.pageIndexItem = "true";
        if (heading) item.dataset.pageId = id;
        if (level !== null) item.dataset.pageIndexLevel = level;
        item.className = "editor-page-index__item";
        item.contentEditable = "false";
        const marker = document.createElement("span");
        marker.className = "editor-page-index__marker";
        marker.textContent = "•";
        const labelElement = document.createElement("span");
        labelElement.className = "editor-page-index__label";
        labelElement.textContent = entryLabel;
        item.append(marker, labelElement);
        fragment.appendChild(item);
      });
      const nextHtml = Array.from(fragment.childNodes).map((child) => (child as HTMLElement).outerHTML).join("");
      if (index.innerHTML !== nextHtml) {
        index.replaceChildren(fragment);
        index.contentEditable = "false";
        changed = true;
      }
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
        const sourceId = placeholder.dataset.anytypeFileId?.trim();
        const identity = sourceId ? sourceId.slice(0, 8) : String(index + 1);
        const file = new File([bytes], `Imagen de Anytype ${identity}.${extension}`, { type: mime });
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
      !image.closest(EDITOR_UI_SELECTOR) &&
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
          images.forEach((image) => {
            if (/^(?:data:|blob:)/i.test(source)) {
              image.remove();
              changed = true;
            } else delete image.dataset.imageRepair;
          });
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
        images.forEach((image) => {
          if (/^(?:data:|blob:)/i.test(source)) {
            image.remove();
            changed = true;
          } else delete image.dataset.imageRepair;
        });
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
  const insertCreatedMention = (target: NodeItem, caret: Range, query: string, destination?: NodeItem) => {
    const editor = editorRef.current;
    if (!editor || !editor.contains(caret.startContainer) || caret.startContainer.nodeType !== Node.TEXT_NODE || caret.startOffset < query.length + 1) return;
    pushEditorHistory();
    const range = caret.cloneRange();
    range.setStart(caret.startContainer, caret.startOffset - query.length - 1);
    range.deleteContents();
    insertMentionWithSpacing(range, createMention(target));
    if (destination) {
      const paragraph = document.createElement("p");
      paragraph.appendChild(createMention(target));
      if (destination.id === node.id) editor.appendChild(paragraph);
      else onContentChange(destination.id, destination.content + stripTransientEditorState(paragraph.outerHTML));
    }
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    syncContent();
    dismissEditorMenus();
  };
  const executePickerAction = (
    type: "slash" | "mention",
    value: string,
    imageMode: "inserted" | "full" = "inserted",
  ) => {
    pushEditorHistory();
    const selection = window.getSelection();
    const isGlobeCommand = type === "slash" && (value === "GLOBO" || value === "GLOBO_INDIVIDUAL");
    if (!selection || (!selection.focusNode && !isGlobeCommand)) return;
    if (type === "mention") {
      if (!selection?.focusNode || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
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
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const hasTrigger = pickers.slashPicker?.hasTrigger !== false;
    const length =
      hasTrigger && pickers.slashPicker
        ? pickers.slashPicker.query.length + 1
        : 0;
    if (range && selection?.focusNode && hasTrigger && selection.focusOffset >= length) {
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
      (selection.focusNode ? getEditorBlock(selection.focusNode) : null) ||
      lineActionBlock ||
      (focusWithinGlobe?.querySelector<HTMLElement>(textLineSelector) || focusWithinGlobe) ||
      lineActionBlock;
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

    if (value === "INDICE") {
      captureStructuralUndo();
      const blocks = validActionBlocks.length ? validActionBlocks : [currentBlock].filter(Boolean) as HTMLElement[];
      blocks.forEach((block) => {
        const index = document.createElement("div");
        index.dataset.pageIndex = "true";
        index.className = "editor-page-index";
        index.contentEditable = "false";
        block.replaceWith(index);
      });
      normalizePageIndices();
    } else if (value === "DIVISOR") {
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
          if (block.tagName === "P") {
            const generatedList = block.querySelector(":scope > ul");
            if (generatedList) block.replaceWith(generatedList);
          }
        });
      }
    } else if (value === "TABLA") {
      const blocks = validActionBlocks.length ? validActionBlocks : [currentBlock].filter(Boolean) as HTMLElement[];
      if (!blocks.length) return;
      captureStructuralUndo();
      blocks.forEach((block) => insertTableIntoBlock(block, getAvailableTableWidth()));
    } else if (value === "GLOBO" || value === "GLOBO_INDIVIDUAL") {
      const blocks = actionBlocks.length
        ? actionBlocks
        : [selection.focusNode ? getEditorBlock(selection.focusNode) : null].filter(Boolean) as HTMLElement[];
      if (!blocks.length) {
        syncContent();
        dismissEditorMenus();
        return;
      }
      const orderedBlocks = [...blocks].sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const caretBlock = orderedBlocks.find((block) =>
        activeRange && (block === activeRange.startContainer || block.contains(activeRange.startContainer)),
      ) ?? orderedBlocks[0];
      let caretOffset = 0;
      if (activeRange && (caretBlock === activeRange.startContainer || caretBlock.contains(activeRange.startContainer))) {
        const prefixRange = document.createRange();
        prefixRange.selectNodeContents(caretBlock);
        prefixRange.setEnd(activeRange.startContainer, activeRange.startOffset);
        caretOffset = prefixRange.toString().length;
      }
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
        const isListItem = block.matches("li") && Boolean(block.parentElement?.matches("ul, ol"));
        if (isListItem) block.replaceChildren(globe);
        else block.replaceWith(globe);
        return { content, line: cleanLine };
      };
      let caretLine: HTMLElement | null = null;
      if (value === "GLOBO_INDIVIDUAL") {
        blocks.forEach((block) => {
          const created = createGlobe(block);
          if (block === caretBlock && created) caretLine = created.line;
        });
      } else {
        const anchor = orderedBlocks.find(
          (block) => !block.matches("[data-globe], [data-divider]"),
        );
        const first = anchor && createGlobe(anchor);
        if (first) {
          caretLine = caretBlock === anchor ? first.line : null;
          orderedBlocks.forEach((block) => {
            if (block === anchor || block.matches("[data-globe]")) return;
            if (block.matches("li") && block.parentElement?.matches("ul, ol")) {
              const list = block.parentElement;
              const paragraph = document.createElement("p");
              while (block.firstChild) paragraph.appendChild(block.firstChild);
              if (!paragraph.hasChildNodes()) paragraph.appendChild(document.createElement("br"));
              first.content.appendChild(paragraph);
              if (block === caretBlock) caretLine = paragraph;
              block.remove();
              if (!list.querySelector(":scope > li")) list.remove();
              return;
            }
            first.content.appendChild(block);
            if (block === caretBlock) caretLine = block;
          });
        }
      }
      if (caretLine) {
        const walker = document.createTreeWalker(caretLine, NodeFilter.SHOW_TEXT);
        let remaining = caretOffset;
        let textNode = walker.nextNode();
        let caretRange: Range | null = null;
        while (textNode) {
          const text = textNode as Text;
          if (remaining <= text.length) {
            caretRange = document.createRange();
            caretRange.setStart(text, remaining);
            caretRange.collapse(true);
            break;
          }
          remaining -= text.length;
          textNode = walker.nextNode();
        }
        if (!caretRange) {
          caretRange = document.createRange();
          caretRange.selectNodeContents(caretLine);
          caretRange.collapse(false);
        }
        selection?.removeAllRanges();
        selection?.addRange(caretRange);
        editorRef.current?.focus({ preventScroll: true });
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
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      isTableEditingTarget(
        selection?.focusNode || (event.target instanceof Node ? event.target : null),
      ) &&
      !selectedBlocks.length
    ) {
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
    const createActions = pickers.callPicker?.query.trim() && onMentionCreate ? 2 : 0;
    const candidateCount = candidates.length + createActions;
    if (picker) {
      if (!candidateCount) {
        if (event.key === "Escape") {
          dismissEditorMenus();
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          event.key === "ArrowDown"
            ? (index + 1) % candidateCount
            : (index - 1 + candidateCount) % candidateCount;
        (pickers.slashPicker
          ? pickers.setSlashPickerIndex
          : pickers.setCallPickerIndex)(next);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (pickers.slashPicker)
          executePickerAction("slash", pickers.slashCandidates[index].tag);
        else if (index >= pickers.callCandidates.length) onMentionCreate?.(index === pickers.callCandidates.length ? "here" : "in");
        else executePickerAction("mention", pickers.callCandidates[index].id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        dismissEditorMenus();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const next = (index + (event.shiftKey ? -1 : 1) + candidateCount) % candidateCount;
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
      if (pickers.callPicker?.query !== trigger.query) pickers.setCallPickerIndex(0);
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
    const pasteEditor = editorRef.current;
    const liveSelection = window.getSelection();
    const liveRange = liveSelection?.rangeCount ? liveSelection.getRangeAt(0) : null;
    const pasteRange = pasteEditor && liveRange && rangeBelongsToEditor(liveRange, pasteEditor)
      ? liveRange.cloneRange() : null;
    if (!pasteRange) return;
    const pasteActiveId = pasteEditor?.getAttribute("data-active-id");
    pushEditorHistory();
    clearLineSelection();
    setSelectedLineBlocks([]);
    setLineActionBlock(null);
    const insert = (html: string) => {
      const clean = sanitizeEditorHtml(html);
      if (!clean) return;
      const editor = editorRef.current;
      if (!editor || editor !== pasteEditor || editor.getAttribute("data-active-id") !== pasteActiveId ||
          !rangeBelongsToEditor(pasteRange, editor)) return;
      const pastedContainer = document.createElement("div");
      pastedContainer.innerHTML = clean;
      replacePastedMentions(pastedContainer);
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(pasteRange);
      document.execCommand("insertHTML", false, pastedContainer.innerHTML);
      normalizePageIndices();
      if (editorRef.current) ensureTableRuntime(editorRef.current);
      void repairUnlinkedEditorImages().then((repaired) => {
        if (!repaired) syncContent();
      });
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
          const range = pasteRange;
          if (!selection || editorRef.current !== pasteEditor || pasteEditor?.getAttribute("data-active-id") !== pasteActiveId || !pasteEditor || !rangeBelongsToEditor(range, pasteEditor)) return;
          const mention = createMention(target, "full");
          range.deleteContents();
          insertMentionWithSpacing(range, mention);
          selection.removeAllRanges();
          selection.addRange(range);
          syncContent();
        });
        return;
      }
      if (file) console.warn("No hay un importador de recursos disponible para la imagen pegada.");
      return;
    }
    const anytypeJson = event.clipboardData.getData("application/json");
    if (anytypeJson) {
      const clipboardHtml = event.clipboardData.getData("text/html");
      const anytypeHtml = anytypeClipboardToHtml(anytypeJson, getAvailableTableWidth(), clipboardHtml);
      if (anytypeHtml) {
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
    const editor = editorRef.current;
    const target = event.target as HTMLElement;
    const block = getEditorBlock(target);
    if (event.button === 0 && (event.ctrlKey || event.metaKey) && editor?.contains(target) && block &&
        !target.closest("[data-mention-id], [data-page-index], [data-his-table-cell], [data-editor-ui], button")) {
      event.preventDefault();
      return;
    }
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
    const editor = editorRef.current;
    const width = editor
      ? clampEditorImageWidth(
        resize.image.getBoundingClientRect().width,
        getEditorImageMaxWidth(resize.image, editor),
      )
      : Math.max(40, resize.image.getBoundingClientRect().width);
    resize.image.style.width = `${width}px`;
    resize.image.style.maxWidth = "100%";
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
    insertCreatedMention,
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
    captureStructuralUndo,
    captureInputUndo,
    focusPageIndexEntry,
    repairUnlinkedEditorImages,
    
  };
}
