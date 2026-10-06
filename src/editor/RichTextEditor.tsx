import MentionMenu, { MentionDestinationMenu } from "./MentionMenu";
import SpellingContextMenu from "./SpellingContextMenu";
import { useEditorSpelling } from "./useEditorSpelling";
import { applyEditorBlockColor, resetEditorBlockColors } from "./blockColors";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject, WheelEvent } from "react";
import { createPortal } from "react-dom";
import type { NodeItem } from "../types/nodes";
import { getImageResourceInfo } from "../utils/imageResource";
import { hydrateEditorImageMentions, releaseEditorImageMentions } from "../utils/imageRuntimeResolver";
import { stripTransientEditorState } from "./serialization";
import { useLocale } from "../i18n/LocaleContext";
import { useEditorController } from "./useEditorController";
import {
  EDITOR_BACKGROUND_COLORS,
  EDITOR_TEXT_COLORS,
} from "../defs/palette";
import {
  BLOCK_TEXT_DEV_REGISTRY,
  clampFloatNodePosition,
  type BlockTextDevNodeKind,
  type BlockTextDevNodeTree,
} from "./menuTree";
import draftAsset from "../assets/third-party/google-material/icons/draft.svg";
import moreHorizAsset from "../assets/third-party/google-material/icons/more_horiz.svg";
import moreVertAsset from "../assets/third-party/google-material/icons/more_vert.svg";
import dragIndicatorAsset from "../assets/third-party/google-material/icons/drag_indicator.svg";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { isResizableEditorImage } from "./imageResize";
import type { HisContextMenuItem } from "../components/HisContextMenu";
import { getPageMeta } from "../utils/pageMeta";
import { IconCapabilityPicker } from "../nodes/capabilities/IconCapabilityPicker";
import { applyGlobeIconState, clearNodeIcon, readGlobeIconState, selectGlobeEmoji, selectGlobeGlyph, selectGlobeImage } from "./globeIcon";
import { hasPageBlockCapability } from "./blockCapabilities";
import type { UnsplashImageSelection } from "../integrations/unsplash/types";
import { NodeVisualRenderer } from "../nodes/visuals/NodeVisualRenderer";
import { resolveNodeIcon } from "../nodes/capabilities/icon";
import type { ResolvedNodeVisual } from "../nodes/visuals/types";
import PageBlockContextMenu from "./PageBlockContextMenu";
import { addTableControl, ensureTableRuntime, findTableControl, getEditableBlockFromTableCell, getTableRootFromNode, setHoveredTableHandles, setTableColumnCount, updateTableOverflowState } from "./table";
import TableOptionsMenu, { type TableMenuState } from "./TableOptionsMenu";
import ColorOptions from "./ColorOptions";
import { applyTableColor, markTableDropTarget, moveTableColumnTo, moveTableRowTo, resolveTableTarget } from "./tableActions";
import { clipboardToMatrix, pasteMatrixAtCell, selectedCellsToMatrix, writeCellMatrixToClipboard } from "./tableClipboard";
import { clearTableCellSelection, focusTableCell, focusTableCellAtPoint, getActiveTableCell, getSelectedTableCells, moveTableCellFocus, selectTableUnit, setActiveTableCell, syncActiveTableCellFromSelection, toggleTableCellSelection } from "./tableSelection";
import {
  resetPageBlockAesthetics,
  setPageBlockColumnCount,
  togglePageBlockCapability,
  type PageBlockCapabilityDefinition,
} from "./blockCapabilities";

let pageBlockClipboardHtml = "";

const mentionResourceIdentities = new WeakMap<NodeItem, number>();
let nextMentionResourceIdentity = 1;

function getMentionResourceIdentity(node: NodeItem): number {
  const existing = mentionResourceIdentities.get(node);
  if (existing !== undefined) return existing;
  const identity = nextMentionResourceIdentity++;
  mentionResourceIdentities.set(node, identity);
  return identity;
}

function hasAlignableImage(block: Element | null): boolean {
  return Boolean(block && Array.from(block.querySelectorAll<HTMLImageElement>("img")).some(isResizableEditorImage));
}

function getSelectedTableCellsButtonPosition(cells: readonly HTMLElement[]): { left: number; top: number } | null {
  const connected = cells.filter((cell) => cell.isConnected);
  if (!connected.length) return null;
  const rects = connected.map((cell) => cell.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  return {
    left: Math.max(8, Math.min(window.innerWidth - 36, left + (right - left) / 2 - 14)),
    top: Math.max(8, top - 28),
  };
}

function LineControlIcon({ kind }: { kind: "more" | "drag" }) {
  return (
    <img
      aria-hidden="true"
      alt=""
      className={`editor-line-control-icon editor-line-control-icon--${kind}`}
      draggable={false}
      src={kind === "more" ? moreVertAsset : dragIndicatorAsset}
    />
  );
}

function forwardEditorControlWheel(
  event: WheelEvent<HTMLElement>,
  editor: HTMLElement | null,
) {
  if (!editor) return;
  let scrollParent = editor.parentElement;
  while (scrollParent) {
    const overflowY = getComputedStyle(scrollParent).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      scrollParent.scrollHeight > scrollParent.clientHeight
    ) {
      event.preventDefault();
      scrollParent.scrollBy({ left: event.deltaX, top: event.deltaY });
      return;
    }
    scrollParent = scrollParent.parentElement;
  }
}

interface RichTextEditorProps {
  node: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  editorRef: RefObject<HTMLDivElement | null>;
  onContentChange: (nodeId: string, html: string) => void;
  setSelectedId: (id: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pendingNodeDrop: { nodeId: string; x: number; y: number } | null;
  onNodeDropHandled: () => void;
  onOpenDeletedNode: (id: string) => void;
  onOpenNodeView: (id: string, x: number, y: number) => void;
  onFileImport?: (file: File, parentId?: string | null) => Promise<NodeItem | null> | NodeItem | null;
  onCreateImageFromUnsplash?: (selection: UnsplashImageSelection) => Promise<string | null>;
  recentNodes?: NodeItem[];
  onCreateMentionNode?: (name: string, parentId: string | null) => NodeItem | null;
  onCreatePastedNode?: (name: string) => NodeItem | null;
  onSlashCommand?: (tag: string) => boolean;
  readOnly?: boolean;
  mode?: "interactive" | "print";
  className?: string;
  style: CSSProperties;
  beforeContent?: ReactNode;
}

export default function RichTextEditor({
  node,
  nodes,
  deletedNodes,
  editorRef,
  onContentChange,
  setSelectedId,
  setExpanded,
  pendingNodeDrop,
  onNodeDropHandled,
  onOpenDeletedNode,
  onOpenNodeView,
  onFileImport,
  onCreateImageFromUnsplash,
  onCreatePastedNode,
  recentNodes,
  onCreateMentionNode,
  onSlashCommand,
  readOnly = false,
  mode = "interactive",
  className,
  style,
  beforeContent,
}: RichTextEditorProps) {
  const { t, locale } = useLocale();
  const [mentionDestination, setMentionDestination] = useState<{ query: string; name: string; range: Range; position: { top: number; left: number } } | null>(null);
  useEffect(() => setMentionDestination(null), [node.id]);
  // Editing a page changes the nodes array frequently, but mention labels and
  // image resources usually do not. Keep that expensive DOM reconciliation
  // dormant until one of those resources actually changes.
  const mentionResourceVersion = useMemo(() => nodes.map((item) => {
    if (item.type === "imagen") return `${item.id}\u0000${item.type}\u0000${item.name}\u0000${getMentionResourceIdentity(item)}`;
    const { iconNodeId, iconVisual } = getPageMeta(item.content);
    return `${item.id}\u0000${item.type}\u0000${item.name}\u0000${JSON.stringify([iconNodeId, iconVisual])}`;
  }).join("\u0001"), [nodes]);
  const [editorContextMenu, setEditorContextMenu] = useState<{
    imageNodeId: string | null;
    mention: HTMLElement | null;
    block: HTMLElement;
    mode: "inserted" | "full" | null;
    top: number;
    left: number;
  } | null>(null);
  const [tableMenu, setTableMenu] = useState<TableMenuState | null>(null);
  const [selectedTableCells, setSelectedTableCells] = useState<HTMLElement[]>([]);
  const [, setTableSelectionGeometryVersion] = useState(0);
  const tableDragRef = useRef<{
    kind: "cell" | "row" | "column";
    source: ReturnType<typeof resolveTableTarget>;
    destination: ReturnType<typeof resolveTableTarget>;
    handle: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [globeIconPicker, setGlobeIconPicker] = useState<{ globe: HTMLElement; tab: "local" | "emoji" | "icon" | "unsplash" } | null>(null);
  const [globeIconVisual, setGlobeIconVisual] = useState<{ target: HTMLElement; visual: ResolvedNodeVisual } | null>(null);
  const [blockColorMenu, setBlockColorMenu] = useState<{
    top: number;
    left: number;
    block: HTMLElement | null;
    kind?: "text" | "background" | "border";
    cells?: HTMLElement[];
  } | null>(null);
  const [blockTextDevTree, setBlockTextDevTree] = useState<BlockTextDevNodeTree>(
    BLOCK_TEXT_DEV_REGISTRY.closeTree(),
  );
  const findBlockTextDevChild = (kind: BlockTextDevNodeKind) =>
    BLOCK_TEXT_DEV_REGISTRY.findChild(blockTextDevTree, kind);
  const closeBlockTextDevTree = () => {
    setBlockTextDevTree(BLOCK_TEXT_DEV_REGISTRY.closeTree());
    setBlockColorMenu(null);
    controller.dismissEditorMenus();
  };
  const closeBlockTextDevChild = (kind: BlockTextDevNodeKind) => {
    setBlockTextDevTree((current) => BLOCK_TEXT_DEV_REGISTRY.closeChild(current, kind));
    if (kind === "block-text-color-option") {
      setBlockColorMenu(null);
    }
  };
  const openBlockTextMenu = (position: { top: number; left: number }) => {
    const safe = clampFloatNodePosition(position.top, position.left, 260, 420);
    setBlockTextDevTree(BLOCK_TEXT_DEV_REGISTRY.createTree(
      BLOCK_TEXT_DEV_REGISTRY.createRoot(safe, controller.lineActionBlock ?? null),
      [],
    ));
  };
  const openBlockTextColorOption = (position: { top: number; left: number }, block: HTMLElement | null) => {
    const safe = clampFloatNodePosition(position.top, position.left, 260, 340);
    setBlockTextDevTree((current) => {
      const child = BLOCK_TEXT_DEV_REGISTRY.createChild(current.root, "block-text-color-option", safe, block);
      if (!child) return current;
      return BLOCK_TEXT_DEV_REGISTRY.attachChild(current, child);
    });
  };
  const controller = useEditorController({
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
    onMentionCreate: onCreateMentionNode ? beginMentionCreation : undefined,
    onSlashCommand,
  });
  function beginMentionCreation(kind: "here" | "in") {
    const query = controller.callPicker?.query;
    const selection = window.getSelection();
    if (!query?.trim() || !selection?.rangeCount || !onCreateMentionNode || !editorRef.current?.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0).cloneRange();
    const name = query.replace(/\u00a0/g, " ").trim();
    if (kind === "in") {
      setMentionDestination({ query, name, range, position: controller.pickerPosition ?? { top: 100, left: 100 } });
      controller.dismissEditorMenus();
    } else {
      const target = onCreateMentionNode(name, null);
      if (target) controller.insertCreatedMention(target, range, query);
    }
  }
  function closeMentionDestination() {
    const pending = mentionDestination;
    setMentionDestination(null);
    if (pending && editorRef.current?.contains(pending.range.startContainer)) {
      editorRef.current.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(pending.range);
    }
  }
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const handleSelectionChange = () => {
      const cell = syncActiveTableCellFromSelection(editor);
      if (cell) setSelectedTableCells(getSelectedTableCells(editor));
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [editorRef, node.id, readOnly]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const handleCopy = (event: ClipboardEvent) => {
      const native = window.getSelection();
      if (native && !native.isCollapsed && native.toString()) return;
      const matrix = selectedCellsToMatrix(editor);
      if (!matrix.length) return;
      if (writeCellMatrixToClipboard(event, matrix)) event.stopImmediatePropagation();
    };
    document.addEventListener("copy", handleCopy, true);
    return () => document.removeEventListener("copy", handleCopy, true);
  }, [editorRef, node.id, readOnly, selectedTableCells]);
  useEffect(() => {
    const connected = selectedTableCells.filter((cell) => cell.isConnected);
    if (!connected.length) return;
    const update = () => setTableSelectionGeometryVersion((version) => version + 1);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    connected.forEach((cell) => observer?.observe(cell));
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [selectedTableCells]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const beforeChange = () => controller.captureStructuralUndo();
    const afterChange = () => controller.syncContent();
    editor.addEventListener("his-table-before-change", beforeChange);
    editor.addEventListener("his-table-change", afterChange);
    return () => {
      editor.removeEventListener("his-table-before-change", beforeChange);
      editor.removeEventListener("his-table-change", afterChange);
    };
  }, [editorRef, node.id, readOnly, controller.captureStructuralUndo, controller.syncContent]);
  useEffect(() => {
    const menuOpen = Boolean(blockTextDevTree.root) ||
      Boolean(blockColorMenu) ||
      Boolean(editorContextMenu) ||
      Boolean(controller.imageMentionChoice) ||
      Boolean((controller.slashPicker || controller.callPicker) && controller.pickerPosition);
    if (!menuOpen) return;

    const popupSelector = "[data-picker], [data-color-picker], [data-selection-toolbar], [data-line-control], .his-context-menu";
    const isInsidePopup = (target: EventTarget | null) => target instanceof Element && target.closest(popupSelector) !== null;
    const preventOutsideScroll = (event: Event) => {
      if (isInsidePopup(event.target)) return;
      event.preventDefault();
    };
    const preventScrollKeys = (event: KeyboardEvent) => {
      if (isInsidePopup(event.target)) return;
      if (controller.callPicker && event.target instanceof Node && editorRef.current?.contains(event.target) && [" ", "Spacebar", "Home", "End"].includes(event.key)) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"].includes(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventOutsideScroll, { passive: false });
    window.addEventListener("touchmove", preventOutsideScroll, { passive: false });
    document.addEventListener("keydown", preventScrollKeys);

    return () => {
      window.removeEventListener("wheel", preventOutsideScroll);
      window.removeEventListener("touchmove", preventOutsideScroll);
      document.removeEventListener("keydown", preventScrollKeys);
    };
  }, [blockColorMenu, blockTextDevTree.root, controller.callPicker, controller.imageMentionChoice, controller.pickerPosition, controller.slashPicker, editorContextMenu]);

  useEffect(() => {
    if (!controller.pickerPosition && !blockColorMenu && !blockTextDevTree.root) return;
    if (!controller.pickerPosition && !blockTextDevTree.root) return;
    if (!blockTextDevTree.root && controller.pickerPosition) {
      openBlockTextMenu(controller.pickerPosition);
    }
  }, [blockColorMenu, controller.pickerPosition, blockTextDevTree.root]);
  useEffect(() => {
    // No incluir blockTextDevTree.root aqui: es el propio estado que este efecto cierra,
    // asi que usarlo como condicion de "sigue visible" lo dejaba atascado para siempre.
    const hasVisiblePopover = Boolean(blockColorMenu) ||
      Boolean(editorContextMenu) ||
      Boolean(controller.imageMentionChoice) ||
      Boolean(controller.pickerPosition && (controller.slashPicker || controller.callPicker));
    if (hasVisiblePopover) return;
    setBlockTextDevTree((current) => {
      if (!current.root && current.children.length === 0) return current;
      return BLOCK_TEXT_DEV_REGISTRY.closeTree();
    });
  }, [blockColorMenu, controller.callPicker, controller.imageMentionChoice, controller.pickerPosition, controller.slashPicker, editorContextMenu]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => controller.updatePlaceholder());
    return () => cancelAnimationFrame(frame);
  }, [node.id]);
  useEffect(() => {
    if (readOnly) return;
    const frame = requestAnimationFrame(() => {
      void controller.repairUnlinkedEditorImages();
    });
    return () => cancelAnimationFrame(frame);
  }, [node.id, readOnly]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;
    editor.querySelectorAll<HTMLElement>("[data-editor-placeholder]").forEach((block) => block.removeAttribute("data-editor-placeholder"));
    const block = controller.placeholderBlock;
    if (
      block &&
      editor.contains(block) &&
      !block.closest("[data-his-table-cell]") &&
      !block.textContent?.trim() &&
      !block.querySelector("img, .editor-mention")
    ) {
      block.dataset.editorPlaceholder = "Usa @ para enlazar nodos o / para comandos";
    }
    return () => block?.removeAttribute("data-editor-placeholder");
  }, [controller.placeholderBlock, editorRef, node.id]);
  // Ref indirecta: evita que el MutationObserver quede con un closure viejo
  // de `controller`/`node` (que revertía metadata reciente de la cabecera).
  const repairRef = useRef(() => {});
  repairRef.current = () => {
    const dividersChanged = controller.repairEditorLines();
    if (controller.ensureEditorLine()) controller.syncContent();
    else if (dividersChanged) controller.syncContent();
    controller.updatePlaceholder();
  };
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    repairRef.current();
    const observer = new MutationObserver(() => repairRef.current());
    observer.observe(editor, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editorRef, node.id, readOnly]);
  useEffect(() => {
    if (!pendingNodeDrop) return;
    controller.insertNodeMention(
      pendingNodeDrop.nodeId,
      pendingNodeDrop.x,
      pendingNodeDrop.y,
    );
    onNodeDropHandled();
  }, [onNodeDropHandled, pendingNodeDrop]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let disposed = false;
    const hydrate = () => {
      if (disposed) return;
      void hydrateEditorImageMentions(editor, nodes).catch((error) =>
        console.error("No se pudieron hidratar las imágenes del editor.", error),
      );
    };
    hydrate();
    const observer = new MutationObserver(hydrate);
    observer.observe(editor, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
      releaseEditorImageMentions(editor);
    };
  }, [editorRef, mentionResourceVersion, node.id]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let changed = false;
    const imageNodes = new Map(
      nodes
        .filter((item) => item.type === "imagen")
        .map((item) => [item.id, getImageResourceInfo(item.content, item.name)]),
    );
    editor.querySelectorAll<HTMLElement>("[data-mention-id]").forEach((mention) => {
      const resource = imageNodes.get(mention.dataset.mentionId || "");
      const mentionedNode = nodes.find((item) => item.id === mention.dataset.mentionId);
      let image = mention.querySelector<HTMLImageElement>("img");
      if (mentionedNode && (mention.title !== mentionedNode.name || mention.getAttribute("aria-label") !== mentionedNode.name)) {
        mention.title = mentionedNode.name;
        mention.setAttribute("aria-label", mentionedNode.name);
        changed = true;
      }
      if (resource && image && image.src !== resource.src) {
        image.src = resource.src;
        image.alt = resource.fileName;
        changed = true;
      }
    });
    if (changed) controller.syncContent();
  }, [editorRef, mentionResourceVersion, node.id]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let changed = false;
    editor.querySelectorAll<HTMLElement>("[data-mention-id]").forEach((mention) => {
      const isDeleted = deletedNodes.some(
        (deletedNode) => deletedNode.id === mention.dataset.mentionId,
      );
      ["opacity", "cursor", "gap"].forEach((property) => {
        if (!mention.style.getPropertyValue(property)) return;
        mention.style.removeProperty(property);
        changed = true;
      });
      if (isDeleted) {
        if (mention.dataset.deletedMention !== "true") {
          mention.dataset.deletedMention = "true";
          changed = true;
        }
      } else if (mention.dataset.deletedMention) {
        delete mention.dataset.deletedMention;
        changed = true;
      }
    });
    if (changed) controller.syncContent();
  }, [deletedNodes, editorRef, node.id]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const icons = editor.querySelectorAll<HTMLElement>("[data-globe-icon]");
    const preventIconSelection = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    icons.forEach((icon) => {
      icon.addEventListener("selectstart", preventIconSelection);
      icon.addEventListener("dragstart", preventIconSelection);
    });
    return () => {
      icons.forEach((icon) => {
        icon.removeEventListener("selectstart", preventIconSelection);
        icon.removeEventListener("dragstart", preventIconSelection);
      });
    };
  }, [editorRef, node.id]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const repairGlobeIcons = () => {
      editor.querySelectorAll<HTMLElement>("[data-globe]").forEach((globe) => {
        if (globe.querySelector("[data-globe-icon]")) return;
        const icon = document.createElement("span");
        icon.dataset.globeIcon = "true";
        icon.contentEditable = "false";
        const image = document.createElement("img");
        image.src = draftAsset;
        image.alt = "Draft";
        icon.appendChild(image);
        globe.insertBefore(icon, globe.firstChild);
        controller.syncContent();
      });
    };
    const observer = new MutationObserver(repairGlobeIcons);
    observer.observe(editor, { childList: true, subtree: true });
    repairGlobeIcons();
    return () => observer.disconnect();
  }, [editorRef, node.id, readOnly]);
  const openGlobeIconPicker = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const icon = (event.target as HTMLElement).closest<HTMLElement>("[data-globe-icon]");
    const globe = icon?.closest<HTMLElement>("[data-globe]");
    if (!icon || !globe || !editorRef.current?.contains(icon) || !hasPageBlockCapability(globe, "icon")) return;
    event.preventDefault();
    event.stopPropagation();
    const state = readGlobeIconState(globe);
    const visual = resolveNodeIcon(state, nodes);
    setGlobeIconVisual(visual ? { target: icon, visual } : null);
    setGlobeIconPicker({ globe, tab: "local" });
  };

  const updateGlobeIcon = (state: ReturnType<typeof readGlobeIconState>) => {
    if (!globeIconPicker) return;
    applyGlobeIconState(globeIconPicker.globe, state, nodes);
    const target = globeIconPicker.globe.querySelector<HTMLElement>(":scope > [data-globe-icon]");
    const visual = resolveNodeIcon(state, nodes);
    setGlobeIconVisual(target && visual ? { target, visual } : null);
    controller.syncContent();
    setGlobeIconPicker(null);
  };
  const closeEditorContextMenu = () => {
    setEditorContextMenu(null);
    controller.setLineActionBlock(null);
  };
  const preserveEditorViewport = (action: () => void) => {
    const scrollHost = editorRef.current?.closest<HTMLElement>(".workspace-main") ?? null;
    const scrollTop = scrollHost?.scrollTop ?? 0;
    const scrollLeft = scrollHost?.scrollLeft ?? 0;
    action();
    if (!scrollHost) return;
    const restore = () => {
      scrollHost.scrollTop = scrollTop;
      scrollHost.scrollLeft = scrollLeft;
    };
    restore();
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
  };
  const alignImage = (mention: HTMLElement, alignment: "left" | "center" | "right") => {
    if (!mention.isConnected) return;
    const image = mention.querySelector<HTMLImageElement>("img");
    mention.dataset.mentionAlign = alignment;
    if (image) {
      image.style.marginLeft = alignment === "right" || alignment === "center" ? "auto" : "0";
      image.style.marginRight = alignment === "left" || alignment === "center" ? "auto" : "0";
    }
    window.requestAnimationFrame(() => {
      if (mention.isConnected) controller.syncContent();
    });
  };
  const buildImageContextItems = ({
    imageNodeId,
    mention,
    mode,
    top,
    left,
  }: {
    imageNodeId: string;
    mention: HTMLElement;
    mode: "inserted" | "full";
    top: number;
    left: number;
  }): HisContextMenuItem[] => [
        {
          id: "image-view",
          label: t("editor.image.view"),
          onSelect: () => onOpenNodeView(imageNodeId, left, top),
        },
        ...(mode === "full"
          ? (["left", "center", "right"] as const).map((alignment) => ({
              id: `image-align-${alignment}`,
              label: t(`editor.image.${alignment}`),
              onSelect: () => alignImage(mention, alignment),
            }))
          : []),
        {
          id: "image-delete",
          label: t("editor.image.deleteBlock"),
          danger: true,
          onSelect: controller.deleteSelectedLine,
        },
      ];
  const editorContextImageItems: HisContextMenuItem[] = editorContextMenu?.imageNodeId && editorContextMenu.mention && editorContextMenu.mode
    ? buildImageContextItems({
        imageNodeId: editorContextMenu.imageNodeId,
        mention: editorContextMenu.mention,
        mode: editorContextMenu.mode,
        top: editorContextMenu.top,
        left: editorContextMenu.left,
      })
    : [];
  const copyContextBlock = (block: HTMLElement) => {
    const clone = block.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-line-selected");
    clone.removeAttribute("data-line-dragging");
    clone.removeAttribute("data-line-drop-target");
    pageBlockClipboardHtml = stripTransientEditorState(clone.outerHTML);
    void navigator.clipboard?.writeText(block.textContent || "").catch(() => {});
  };
  const duplicateContextBlock = (block: HTMLElement) => {
    if (!block.isConnected) return;
    controller.captureStructuralUndo();
    const clone = block.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-line-selected");
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    block.parentNode?.insertBefore(clone, block.nextSibling);
    controller.syncContent();
  };
  const pasteContextBlock = (block: HTMLElement) => {
    if (!block.isConnected || !pageBlockClipboardHtml) return;
    const template = document.createElement("template");
    template.innerHTML = pageBlockClipboardHtml;
    const pasted = template.content.firstElementChild?.cloneNode(true);
    if (!(pasted instanceof HTMLElement)) return;
    controller.captureStructuralUndo();
    block.parentNode?.insertBefore(pasted, block.nextSibling);
    controller.syncContent();
  };
  const ensureCellContentBlock = getEditableBlockFromTableCell;
  const mutateContextBlock = (
    block: HTMLElement,
    mutation: (target: HTMLElement) => HTMLElement | void,
  ) => {
    if (!block.isConnected) return;
    const selected = controller.selectedLineBlocks.filter((line) => line.isConnected);
    const targets = selected.includes(block) ? selected : [block];
    const replacements = new Map<HTMLElement, HTMLElement>();
    preserveEditorViewport(() => {
      controller.captureStructuralUndo();
      targets.forEach((source) => {
        const target = source.matches("[data-his-table-cell]") ? ensureCellContentBlock(source) : source;
        replacements.set(source, mutation(target) || target);
      });
      if (selected.includes(block)) controller.setSelectedLineBlocks(selected.map((line) => replacements.get(line) ?? line));
      controller.syncContent();
    });
    setEditorContextMenu((current) => current && current.block === block ? { ...current, block: replacements.get(block) ?? block } : current);
  };
  const deleteContextBlock = (block: HTMLElement) => {
    const selected = controller.selectedLineBlocks.filter((line) => line.isConnected);
    const table = getTableRootFromNode(block);
    if (table) controller.removeLine(table);
    else if (selected.includes(block)) controller.deleteSelectedLine();
    else controller.removeLine(block);
  };
  const getAestheticTarget = (block: HTMLElement) => block.matches("[data-globe]")
    ? block.querySelector<HTMLElement>("[data-globe-content] > p, [data-globe-content] > h1, [data-globe-content] > h2, [data-globe-content] > h3, [data-globe-content] > h4, [data-globe-content] > h5, [data-globe-content] > h6, [data-globe-content] > blockquote, [data-globe-content] > li, [data-globe-content] > pre") ?? block
    : block.matches("[data-his-table-cell]") ? block.querySelector<HTMLElement>(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > li, :scope > pre") ?? block
    : block;
  const getTableOwnerBlock = (block: HTMLElement) => {
    const table = getTableRootFromNode(block);
    if (!table) return block;
    return table.parentElement?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, blockquote, li, pre") ?? table;
  };
  const toggleContextCapability = (block: HTMLElement, capability: PageBlockCapabilityDefinition) => {
    if (capability.id === "globe") {
      if (block.matches("[data-his-table-cell]")) return;
      const nativeGlobe = block.closest<HTMLElement>("[data-globe]");
      if (nativeGlobe) {
        const content = nativeGlobe.querySelector<HTMLElement>(":scope > [data-globe-content]");
        if (!content) return;
        preserveEditorViewport(() => {
          controller.captureStructuralUndo();
          nativeGlobe.replaceWith(...Array.from(content.childNodes));
          controller.syncContent();
        });
        closeEditorContextMenu();
        return;
      }
      if (!block.isConnected || block.matches("[data-divider]")) return;
      preserveEditorViewport(() => {
        controller.captureStructuralUndo();
        const content = document.createElement("div");
        content.dataset.globeContent = "true";
        const globe = document.createElement("div");
        globe.dataset.globe = "true";
        const icon = document.createElement("span");
        icon.dataset.globeIcon = "true";
        icon.contentEditable = "false";
        const image = document.createElement("img");
        image.src = draftAsset;
        image.alt = "Draft";
        icon.appendChild(image);
        block.replaceWith(globe);
        block.contentEditable = "true";
        content.appendChild(block);
        globe.append(icon, content);
        controller.syncContent();
      });
      closeEditorContextMenu();
      return;
    }
    mutateContextBlock(block, (target) => togglePageBlockCapability(
      target.matches("[data-his-table-cell]") ? ensureCellContentBlock(target) : getAestheticTarget(target),
      capability,
    ));
  };
  const resetContextAesthetics = (block: HTMLElement) => {
    if (!block.isConnected) return;
    preserveEditorViewport(() => {
      controller.captureStructuralUndo();
      let target = block.matches("[data-his-table-cell]") ? ensureCellContentBlock(block) : getAestheticTarget(block);
      if (target.closest("[data-his-column-layout]")) setPageBlockColumnCount(target, 1);
      target = resetPageBlockAesthetics(target);
      const nativeGlobe = target.closest<HTMLElement>("[data-globe]") ?? (block.matches("[data-globe]") ? block : null);
      const content = nativeGlobe?.querySelector<HTMLElement>(":scope > [data-globe-content]");
      if (nativeGlobe && content) nativeGlobe.replaceWith(...Array.from(content.childNodes));
      controller.syncContent();
    });
  };
  const openEditorBlockContextMenu = (block: HTMLElement, left: number, top: number, preferredMention?: HTMLElement | null) => {
    const nestedFullMention = hasAlignableImage(block)
      ? block.querySelector<HTMLElement>('[data-mention-id][data-mention-mode="full"]')
      : null;
    const mention = preferredMention ?? (block.matches("[data-mention-id]") ? block : nestedFullMention);
    const id = mention?.dataset.mentionId;
    const target = id ? nodes.find((item) => item.id === id) : null;
    const actionBlock = mention || (block.matches("[data-his-table-cell]") ? block : getTableOwnerBlock(block));
    controller.resetEditorPickers();
    setBlockColorMenu(null);
    setBlockTextDevTree(BLOCK_TEXT_DEV_REGISTRY.closeTree());
    const selected = controller.selectedLineBlocks.filter((line) => line.isConnected);
    if (!selected.includes(actionBlock)) {
      controller.clearLineSelection();
      window.getSelection()?.removeAllRanges();
      actionBlock.dataset.editorBlockIdentity ||= crypto.randomUUID();
      actionBlock.dataset.lineSelected = "true";
      actionBlock.contentEditable = "false";
      controller.setSelectedLineBlocks([actionBlock]);
    }
    controller.setLineActionBlock(actionBlock);
    setEditorContextMenu({
      imageNodeId: target?.type === "imagen" ? target.id : null,
      mention,
      block: actionBlock,
      mode: target?.type === "imagen" ? mention?.dataset.mentionMode === "full" ? "full" : "inserted" : null,
      top,
      left,
    });
  };
  const spelling = useEditorSpelling({ editorRef, nodeId: node.id, locale, enabled: !readOnly && mode === "interactive", replace: (range, suggestion) => {
    const editor = editorRef.current;
    if (!editor) return;
    controller.captureStructuralUndo();
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range.cloneRange());
    document.execCommand("insertText", false, suggestion);
    controller.syncContent();
    controller.updatePlaceholder();
  } });
  const closeTableMenu = () => {
    editorRef.current?.querySelectorAll<HTMLElement>("[data-his-table-handle][aria-expanded=true]").forEach((handle) => handle.removeAttribute("aria-expanded"));
    setTableMenu(null);
  };
  const openTableMenu = (source: HTMLElement, context: "cell" | "row" | "column", x: number, y: number) => {
    const target = resolveTableTarget(source);
    if (!target) return false;
    editorRef.current?.querySelectorAll<HTMLElement>("[data-his-table-handle][aria-expanded=true]").forEach((handle) => handle.removeAttribute("aria-expanded"));
    source.closest<HTMLElement>("[data-his-table-handle]")?.setAttribute("aria-expanded", "true");
    setActiveTableCell(editorRef.current!, target.cell);
    setTableMenu({ context, target, x, y });
    setEditorContextMenu(null);
    setBlockColorMenu(null);
    return true;
  };
  const mutateTable = (mutation: () => void) => {
    const editor = editorRef.current;
    if (!editor) return;
    controller.captureStructuralUndo();
    mutation();
    ensureTableRuntime(editor);
    setSelectedTableCells(getSelectedTableCells(editor));
    controller.syncContent();
  };
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const updateHoveredHandles = (event: Event) => {
      setHoveredTableHandles(editor, event.target as Node | null);
    };
    const clearHoveredHandles = () => setHoveredTableHandles(editor, null);
    editor.addEventListener("pointerover", updateHoveredHandles, true);
    editor.addEventListener("mousemove", updateHoveredHandles, true);
    editor.addEventListener("mouseleave", clearHoveredHandles);
    return () => {
      editor.removeEventListener("pointerover", updateHoveredHandles, true);
      editor.removeEventListener("mousemove", updateHoveredHandles, true);
      editor.removeEventListener("mouseleave", clearHoveredHandles);
    };
  }, [editorRef, node.id, readOnly]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const clearSelectionOutsideTableControls = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".his-table-menu-layer, .his-table-multi-selection-handle, [data-color-picker]")) return;
      if (target.closest("[data-his-table-handle]")) return;
      const clickedCell = target.closest<HTMLElement>("[data-his-table-cell]");
      if (clickedCell && editor.contains(clickedCell) && (event.ctrlKey || event.metaKey)) return;

      clearTableCellSelection(editor);
      setSelectedTableCells([]);
      editor.querySelectorAll<HTMLElement>("[data-his-table-handle][aria-expanded=true]").forEach((handle) => handle.removeAttribute("aria-expanded"));
      setTableMenu(null);
      if (!clickedCell || !editor.contains(clickedCell)) setActiveTableCell(editor, null);
    };
    document.addEventListener("pointerdown", clearSelectionOutsideTableControls, true);
    return () => document.removeEventListener("pointerdown", clearSelectionOutsideTableControls, true);
  }, [editorRef, node.id, readOnly]);
  const formatTableCells = (command: "bold" | "italic" | "underline" | "strikeThrough", cells: HTMLElement[]) => {
    if (!cells.length) return;
    mutateTable(() => {
      const selection = window.getSelection();
      cells.forEach((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand(command, false);
      });
      selection?.removeAllRanges();
    });
  };
  const clearTableDragUi = () => {
    const editor = editorRef.current;
    editor?.querySelectorAll<HTMLElement>("[data-his-table-dragging], [data-his-table-drop-target]").forEach((item) => {
      item.removeAttribute("data-his-table-dragging");
      item.removeAttribute("data-his-table-drop-target");
    });
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  const updateTableDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (drag.kind === "cell") {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return true;
    drag.moved = true;
    drag.handle.dataset.hisTableDragging = "true";
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    const destination = resolveTableTarget(hovered);
    if (!destination || destination.table !== drag.source?.table) return true;
    drag.destination = destination;
    markTableDropTarget(destination, drag.kind);
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  const finishTableDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = tableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.source) return false;
    tableDragRef.current = null;
    clearTableDragUi();
    if (!cancelled && drag.moved && drag.destination) {
      mutateTable(() => drag.kind === "row" ? moveTableRowTo(drag.source!, drag.destination!) : moveTableColumnTo(drag.source!, drag.destination!));
    } else if (!cancelled && !drag.moved) {
      if (drag.kind !== "cell") {
        const editor = editorRef.current!;
        selectTableUnit(editor, drag.source, drag.kind, drag.handle);
        setSelectedTableCells([]);
      }
      const rect = drag.handle.getBoundingClientRect();
      openTableMenu(drag.handle, drag.kind, rect.right + 8, rect.top);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  const selectedTableCellsButtonPosition = getSelectedTableCellsButtonPosition(selectedTableCells);
  return (
    <div
      className={`editor-selection-surface${className ? ` ${className}-surface` : ""}`}
      data-editor-mode={mode}
      onPointerDown={(event) => {
        controller.onEditorPointerDown(event);
      }}
      onPointerMove={(event) => {
        controller.onEditorPointerMove(event);
        controller.onEditorSelectionMove(event);
      }}
      onPointerUp={() => {
        controller.onEditorPointerUp();
      }}
      onClick={(event) => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount && editorRef.current?.contains(selection.anchorNode) && editorRef.current?.contains(selection.focusNode)) return;
        if (readOnly || event.target !== event.currentTarget || controller.selectedLineBlocks.length > 0) return;
        controller.focusOrCreatePageLine();
      }}
    >
      {beforeContent}
      <>
      {controller.isDraggingLine &&
        controller.lineControl &&
        [controller.draggedLineRef.current || controller.lineControl.block].map((block, index) => {
          const rect = block.getBoundingClientRect();
          return (
            <button
              key={`${block.tagName}-${index}`}
              type="button"
              data-line-control="true"
              data-line-control-mode="drag"
              title={t("editor.line.move")}
              onPointerDown={(event) => controller.startLineDrag(block, event)}
              onPointerMove={controller.moveLineDrag}
              onPointerUp={(event) => controller.finishLineDrag(block, event)}
              onPointerCancel={controller.cancelLineDrag}
              style={{
                position: "fixed",
                top: Math.max(0, Math.min(window.innerHeight - Math.max(24, rect.height), rect.top)),
                left: controller.lineControl!.left,
                width: "24px",
                height: `${Math.max(24, rect.height)}px`,
                padding: 0,
                border: "none",
                background: "transparent",
                color: "#7A7F87",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "grab",
                zIndex: 27,
              }}
            >
              <LineControlIcon kind="drag" />
            </button>
          );
        })}
      {controller.lineControl && !controller.isDraggingLine && (() => {
        const lineControl = controller.lineControl;
        const rect = lineControl.block.getBoundingClientRect();
        const height = Math.max(24, rect.height);
        return (
          <div
            data-line-control="true"
            className={`editor-line-control-cluster${height <= 32 ? " editor-line-control-cluster--compact" : ""}`}
            onWheel={(event) => forwardEditorControlWheel(event, editorRef.current)}
            onPointerLeave={(event) => {
              const next = event.relatedTarget;
              if (!(next instanceof Element) || !next.closest(".editor-content, [data-line-control], [data-picker]")) {
                controller.setLineControl(null);
              }
            }}
            style={{
              position: "fixed",
              top: lineControl.top,
              left: lineControl.left,
              width: "28px",
              height: `${height}px`,
              zIndex: 4,
            }}
          >
            <button
              type="button"
              data-line-control="true"
              data-line-insert="above"
              className="editor-line-control-insert editor-line-control-insert--above"
              title={t("editor.line.insertAbove")}
              aria-label={t("editor.line.insertAbove")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                controller.insertLine(lineControl.block, true);
              }}
            >
              +
            </button>
            <button
              type="button"
              data-line-control="true"
              className="editor-line-control-menu"
              title={t("editor.line.options")}
              aria-label={t("editor.line.options")}
              onPointerDown={(event) => controller.startLineDrag(lineControl.block, event)}
              onPointerMove={controller.moveLineDrag}
              onPointerUp={(event) => controller.finishLineDrag(lineControl.block, event)}
              onPointerCancel={controller.cancelLineDrag}
              onClick={(event) => {
                event.stopPropagation();
                const anchor = event.currentTarget.getBoundingClientRect();
                openEditorBlockContextMenu(lineControl.block, anchor.right + 8, anchor.top);
              }}
            >
              <LineControlIcon kind="more" />
              <LineControlIcon kind="drag" />
            </button>
            <button
              type="button"
              data-line-control="true"
              data-line-insert="below"
              className="editor-line-control-insert editor-line-control-insert--below"
              title={t("editor.line.insertBelow")}
              aria-label={t("editor.line.insertBelow")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                controller.insertLine(lineControl.block, false);
              }}
            >
              +
            </button>
          </div>
        );
      })()}
      {controller.isDraggingLine && controller.lineControl && (
        <div
          aria-hidden="true"
          data-line-preview="true"
          className="editor-line-preview"
          style={{
            top: controller.lineControl.inside
              ? controller.lineControl.pointerY ?? controller.lineControl.block.getBoundingClientRect().top
              : controller.lineControl.before
                ? controller.lineControl.block.getBoundingClientRect().top - 1
                : controller.lineControl.block.getBoundingClientRect().bottom - 1,
            left: controller.lineControl.inside
              ? controller.lineControl.block.getBoundingClientRect().left + 48
              : controller.lineControl.block.getBoundingClientRect().left,
            right: 24,
            boxShadow: controller.lineControl.inside ? "0 0 8px var(--his-accent)" : "none",
          }}
        />
      )}
      {controller.blockSelection && createPortal(
        <div
          aria-hidden="true"
          className="editor-block-selection"
          style={{
            left: controller.blockSelection.left,
            top: controller.blockSelection.top,
            width: controller.blockSelection.width,
            height: controller.blockSelection.height,
          }}
        />,
        document.body,
      )}
      {!readOnly && !spelling.menu && controller.selectionToolbar && (
        <SelectionToolbar controller={controller} />
      )}
      <div
        ref={editorRef}
        className={`editor-content${className ? ` ${className}` : ""}`}
        data-block-selecting={controller.blockSelection ? "true" : undefined}
        contentEditable={!readOnly}
        lang={locale === "es" ? "es-ES" : "en-US"}
        spellCheck={!readOnly}
        autoCorrect="on"
        suppressContentEditableWarning
        style={style}
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-mention-id], [data-editor-ui], [data-page-index], button, img")) return;
          const block = target.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, [data-his-table-cell]");
          if (!block || !event.currentTarget.contains(block)) return;
          event.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(block);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }}
        onFocus={readOnly ? undefined : controller.updatePlaceholder}
        onInput={(event) => {
          const table = getTableRootFromNode(event.target as HTMLElement);
          if (table) updateTableOverflowState(table);
          const changedSyncBlock = (event.target as HTMLElement).closest<HTMLElement>("[data-his-synced]");
          const syncId = changedSyncBlock?.dataset.hisSynced;
          if (changedSyncBlock && syncId) {
            editorRef.current?.querySelectorAll<HTMLElement>(`[data-his-synced="${CSS.escape(syncId)}"]`).forEach((peer) => {
              if (peer !== changedSyncBlock && peer.innerHTML !== changedSyncBlock.innerHTML) peer.innerHTML = changedSyncBlock.innerHTML;
            });
          }
          controller.clearGeneratedLines();
          if (event.currentTarget.childElementCount === 0) {
            controller.ensureEditorLine();
          }
          controller.scheduleContentSync();
          controller.updatePlaceholder();
          controller.updatePickers();
        }}
        onPaste={readOnly ? undefined : (event) => {
          const editor = editorRef.current;
          const active = editor ? getActiveTableCell(editor) : null;
          const selection = window.getSelection();
          const replacesText = Boolean(selection?.rangeCount && !selection.isCollapsed &&
            editor?.contains(selection.getRangeAt(0).startContainer) &&
            editor?.contains(selection.getRangeAt(0).endContainer));
          if (editor && active && !replacesText) {
            const matrix = clipboardToMatrix(event.clipboardData);
            if (matrix.length) {
              event.preventDefault();
              mutateTable(() => pasteMatrixAtCell(active, matrix));
              return;
            }
          }
          controller.onPaste(event);
        }}
        onContextMenu={(event) => {
          if (readOnly) return;
          const target = event.target as HTMLElement;
          const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-his-table-cell]");
          if (cell) {
            event.preventDefault();
            event.stopPropagation();
            openTableMenu(cell, "cell", event.clientX, event.clientY);
            return;
          }
          const block = controller.getEditorBlock(event.target as Node) ||
            target.closest<HTMLElement>("[data-his-table-cell]");
          if (!block) return;
          event.preventDefault();
          event.stopPropagation();
          const openBlock = () => openEditorBlockContextMenu(block, event.clientX, event.clientY, target.closest<HTMLElement>("[data-mention-id]"));
          const selected = controller.selectedLineBlocks.filter((line) => line.isConnected);
          if (!selected.length && !event.shiftKey && !target.closest("[data-mention-id], [data-editor-ui], [data-page-index], [data-divider]") &&
              spelling.request(event.clientX, event.clientY, openBlock)) {
            setEditorContextMenu(null);
            return;
          }
          openBlock();
        }}
        onMouseMove={readOnly ? undefined : controller.updateLineControl}
        onMouseLeave={(event) => {
          if (!readOnly && editorRef.current) setHoveredTableHandles(editorRef.current, null);
          const related = event.relatedTarget;
          if (
            !(related instanceof Element) ||
            !related.closest(
              "[data-line-control], [data-picker]",
            )
          ) {
            controller.setLineControl(null);
          }
        }}
        onDragOver={readOnly ? undefined : controller.updateLineDrop}
        onDrop={readOnly ? undefined : controller.onEditorDrop}
        onMouseUp={readOnly ? undefined : controller.updateSelectionToolbar}
        onKeyUp={() => {
          if (controller.ensureEditorLine()) controller.syncContent();
          controller.updateSelectionToolbar();
          controller.updatePlaceholder();
        }}
        onClick={(event) => {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.rangeCount && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)) {
            event.stopPropagation();
            return;
          }
          const target = event.target as HTMLElement;
          if (target.closest("[data-mention-id]")) {
            return;
          }
          const clickedCell = target.closest<HTMLElement>("[data-his-table-cell]");
          if (!readOnly && clickedCell && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.stopPropagation();
            toggleTableCellSelection(event.currentTarget, clickedCell);
            setSelectedTableCells(getSelectedTableCells(event.currentTarget));
            controller.clearLineSelection?.();
            controller.setSelectedLineBlocks?.([]);
            return;
          }
          if (!readOnly && clickedCell) {
            setActiveTableCell(event.currentTarget, clickedCell);
            if (getSelectedTableCells(event.currentTarget).length) {
              clearTableCellSelection(event.currentTarget);
              setSelectedTableCells([]);
            }
            if (target === clickedCell) {
              focusTableCell(clickedCell, true);
            } else if (!target.closest("[data-editor-ui], a, button, input, textarea, select")) {
              window.requestAnimationFrame(() => {
                const selection = window.getSelection();
                const focusedCell = selection?.rangeCount ? selection.focusNode?.parentElement?.closest<HTMLElement>("[data-his-table-cell]") ?? null : null;
                const landedOnCellShell = selection?.focusNode === clickedCell;
                if ((focusedCell !== clickedCell || landedOnCellShell) && clickedCell.isConnected)
                  focusTableCellAtPoint(clickedCell, event.clientX, event.clientY);
              });
            }
          }
          const dropdown = target.closest<HTMLElement>("[data-his-dropdown]");
          const todo = target.closest<HTMLElement>('[data-his-list="todo"]');
          if (!readOnly && todo && event.clientX <= todo.getBoundingClientRect().left + 28) {
            event.preventDefault();
            controller.captureStructuralUndo();
            todo.toggleAttribute("data-his-todo-checked");
            controller.syncContent();
            return;
          }
          if (!readOnly && dropdown && event.clientX <= dropdown.getBoundingClientRect().left + 28) {
            event.preventDefault();
            controller.captureStructuralUndo();
            dropdown.toggleAttribute("data-his-collapsed");
            controller.syncContent();
            return;
          }
          const clickedDivider = Boolean(target.closest("[data-divider]"));
          const indexItem = target.closest<HTMLElement>("[data-page-index-item]");
          if (indexItem) {
            event.preventDefault();
            event.stopPropagation();
            const id = indexItem.dataset.pageId;
            if (id) controller.focusPageIndexEntry(id);
            return;
          }
          if (!readOnly && event.target === event.currentTarget && controller.selectedLineBlocks.length === 0) {
            controller.focusOrCreatePageLine();
          }
          const clickedBlock = controller.getEditorBlock?.(event.target as Node) ?? null;
          if (!readOnly && clickedBlock && (event.ctrlKey || event.metaKey) && !clickedBlock.matches("[data-page-index]")) {
            event.preventDefault();
            event.stopPropagation();
            controller.toggleLineSelection(clickedBlock);
            controller.setLineActionBlock?.(null);
            return;
          }
          if (!readOnly && clickedBlock && clickedBlock.matches("p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, [data-page-index], [data-mention-id][data-mention-mode='full']")) {
            const currentSelected = controller.selectedLineBlocks.filter((line) => line.isConnected);
            if (currentSelected.length > 0) {
              const isWithinCurrentSelection = currentSelected.includes(clickedBlock);
              if (!(event.ctrlKey || event.metaKey) && !isWithinCurrentSelection) {
                controller.clearLineSelection?.();
                controller.setSelectedLineBlocks?.([]);
                controller.setLineActionBlock?.(null);
              }
              return;
            }
          }
          openGlobeIconPicker(event);
          if (!readOnly && controller.ensureEditorLine()) {
            controller.syncContent();
          }
          if (clickedDivider) controller.setPlaceholderBlock?.(null);
          else controller.updatePlaceholder();
        }}
        onKeyDown={readOnly ? undefined : (event) => {
          const editor = editorRef.current;
          const active = editor ? getActiveTableCell(editor) : null;
          if (event.key === "Escape" && tableDragRef.current) {
            tableDragRef.current = null;
            clearTableDragUi();
          }
          if (event.key === "Tab" && active) {
            const next = moveTableCellFocus(active, event.shiftKey);
            if (next) {
              event.preventDefault();
              event.stopPropagation();
              setActiveTableCell(editor!, next);
              return;
            }
          }
          if (event.key === "Escape" && editor && (tableMenu || getSelectedTableCells(editor).length)) {
            event.preventDefault();
            event.stopPropagation();
            closeTableMenu();
            clearTableCellSelection(editor);
            setSelectedTableCells([]);
            return;
          }
          controller.onKeyDown(event);
        }}
        onBeforeInput={
          readOnly
            ? undefined
            : (event) => {
                const input = event.nativeEvent as InputEvent;
                const inputType =
                  typeof input.inputType === "string" ? input.inputType : "";
                if (inputType === "historyUndo" || inputType === "historyRedo") {
                  event.preventDefault();
                  controller.captureInputUndo(inputType, input.data);
                  return;
                }
                controller.captureInputUndo(inputType, input.data);
                if (!inputType.startsWith("delete")) return;
                const selection = window.getSelection();
                if (!selection?.rangeCount) return;
                const range = selection.getRangeAt(0);
                const icon = editorRef.current?.querySelector("[data-globe-icon]");
                if (!icon) return;
                let touchesIcon = false;
                try {
                  touchesIcon = range.intersectsNode(icon);
                } catch {
                  touchesIcon = false;
                }
                const container = range.startContainer.parentElement;
                const adjacentIcon =
                  range.collapsed &&
                  (container?.closest("[data-globe-icon]") ||
                    container?.previousElementSibling?.matches("[data-globe-icon]") ||
                    container?.nextElementSibling?.matches("[data-globe-icon]"));
                if (touchesIcon || adjacentIcon) event.preventDefault();
              }
        }
        onBlur={(event) => {
          const relatedTarget = event.relatedTarget;
          if (relatedTarget instanceof Element && relatedTarget.closest(".his-context-menu, .page-context-menu-layer, [data-color-picker]")) {
            return;
          }
          if (!readOnly) controller.ensureEditorLine();
          controller.syncContent();
          controller.updatePlaceholder();
          if (document.visibilityState === "hidden" || !document.hasFocus()) {
            return;
          }
          controller.dismissEditorMenus();
        }}
        onPointerDown={readOnly ? undefined : (event) => {
          const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-his-table-handle]");
          if (handle) {
            event.preventDefault();
            event.stopPropagation();
            const kind = handle.dataset.hisTableHandle as "cell" | "row" | "column";
            tableDragRef.current = {
              kind,
              source: resolveTableTarget(handle),
              destination: null,
              handle,
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              moved: false,
            };
            try { handle.setPointerCapture(event.pointerId); } catch {}
            return;
          }
          const tableControl = findTableControl(event.target as HTMLElement);
          if (tableControl) {
            event.preventDefault();
            event.stopPropagation();
            controller.captureStructuralUndo();
            addTableControl(tableControl);
            if (editorRef.current) ensureTableRuntime(editorRef.current);
            updateTableOverflowState(tableControl.table);
            controller.syncContent();
            return;
          }
          controller.onEditorPointerDown(event);
        }}
        onPointerMove={
          readOnly
            ? undefined
             : (event) => {
                if (updateTableDrag(event)) return;
                controller.onEditorPointerMove(event);
                controller.onEditorSelectionMove(event);
              }
        }
        onPointerUp={readOnly ? undefined : (event) => {
          if (finishTableDrag(event)) return;
          controller.onEditorPointerUp();
        }}
        onPointerCancel={readOnly ? undefined : (event) => { finishTableDrag(event, true); }}
      />
      {((blockTextDevTree.root && controller.slashPicker && controller.slashCandidates.length > 0) || (controller.pickerPosition && controller.slashPicker && controller.slashCandidates.length > 0)) && (
            <PickerMenu
              title={t("editor.commands.basic")}
              position={blockTextDevTree.root?.position ?? controller.pickerPosition ?? { top: 120, left: 120 }}
              items={controller.slashCandidates.map((item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon,
                category: item.category,
                tag: item.tag,
              }))}
              activeIndex={controller.slashPickerIndex}
              showDeleteLine={Boolean(controller.lineActionBlock)}
              onDeleteLine={() => {
                controller.deleteSelectedLine();
                closeBlockTextDevTree();
              }}
              onColorMenuOpen={(position) => {
                openBlockTextColorOption(position, controller.lineActionBlock ?? null);
                setBlockColorMenu({
                  top: position.top,
                  left: position.left,
                  block: controller.lineActionBlock ?? null,
                });
              }}
              onSelect={(id) => {
                const item = controller.slashCandidates.find((candidate) => candidate.id === id);
                if (!item) return;
                if (item.tag === "COLOR") {
                  const rect = document.querySelector<HTMLElement>(`[data-picker-menu-item="${CSS.escape(item.id)}"]`)?.getBoundingClientRect();
                  const position = rect
                    ? clampFloatNodePosition(rect.bottom + 8, rect.right + 8, 260, 340)
                    : clampFloatNodePosition((controller.pickerPosition?.top ?? 120), (controller.pickerPosition?.left ?? 120), 260, 340);
                  openBlockTextColorOption(position, controller.lineActionBlock ?? null);
                  setBlockColorMenu({
                    top: position.top,
                    left: position.left,
                    block: controller.lineActionBlock ?? null,
                  });
                  return;
                }
                controller.executePickerAction("slash", item.tag);
                closeBlockTextDevTree();
              }}
            />
        )}
      {controller.pickerPosition &&
        controller.lineActionBlock?.matches("[data-divider]") && (
          <LineActionMenu
            position={controller.pickerPosition}
            onDeleteLine={controller.deleteSelectedLine}
          />
        )}
      {controller.pickerPosition && controller.callPicker && !controller.imageMentionChoice && (
        <MentionMenu
          position={controller.pickerPosition} query={controller.callPicker.query} nodes={nodes}
          candidates={controller.callCandidates} activeIndex={controller.callPickerIndex}
          canCreate={Boolean(onCreateMentionNode)} onCreate={beginMentionCreation}
          onClose={controller.dismissEditorMenus}
          onSelect={(id) => {
            const target = nodes.find(item => item.id === id);
            if (target?.type === "imagen") controller.setImageMentionChoice(id);
            else controller.executePickerAction("mention", id);
          }}
        />
      )}
      {mentionDestination && (
        <MentionDestinationMenu position={mentionDestination.position} name={mentionDestination.name} nodes={nodes}
          onClose={closeMentionDestination}
          onSelect={(destination) => {
            const pending = mentionDestination;
            if (!editorRef.current?.contains(pending.range.startContainer)) return;
            const target = onCreateMentionNode?.(pending.name, null);
            if (target) controller.insertCreatedMention(target, pending.range, pending.query, destination);
            setMentionDestination(null);
          }}
        />
      )}
      {controller.imageMentionChoice && controller.pickerPosition && (
        <ImageMentionModeMenu
          position={controller.pickerPosition}
          onSelect={(mode) => {
            controller.executePickerAction("mention", controller.imageMentionChoice!, mode);
          }}
          onCancel={controller.dismissEditorMenus}
        />
      )}
      {tableMenu && tableMenu.target.cell.isConnected && (
        <TableOptionsMenu
          state={tableMenu}
          selectedCells={selectedTableCells}
          onClose={closeTableMenu}
          onMutate={mutateTable}
          onFormat={formatTableCells}
        />
      )}
      {selectedTableCellsButtonPosition && createPortal(
        <button
          type="button"
          className="his-table-multi-selection-handle"
          style={selectedTableCellsButtonPosition}
          aria-label="Opciones de celdas seleccionadas"
          title="Opciones de celdas seleccionadas"
          data-editor-ui="true"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const target = selectedTableCells.find((cell) => cell.isConnected);
            if (!target) return;
            const rect = event.currentTarget.getBoundingClientRect();
            openTableMenu(target, "cell", rect.left, rect.bottom + 6);
          }}
        >
          <img src={moreHorizAsset} alt="" aria-hidden="true" draggable={false} />
        </button>,
        document.body,
      )}
      {spelling.menu && createPortal(<SpellingContextMenu menu={spelling.menu} onClose={spelling.close} onCorrect={spelling.correct} onAdd={spelling.add} />, document.body)}
      {editorContextMenu && (
        <PageBlockContextMenu
          x={editorContextMenu.left}
          y={editorContextMenu.top}
          block={editorContextMenu.block}
          capabilityBlock={getAestheticTarget(editorContextMenu.block)}
          supportsAesthetics={!editorContextMenu.imageNodeId && getAestheticTarget(editorContextMenu.block).matches("p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, [data-globe]")}
          imageItems={editorContextImageItems.filter((item) => item.id !== "image-delete")}
          onClose={closeEditorContextMenu}
          onCapability={(capability) => toggleContextCapability(editorContextMenu.block, capability)}
          onColumns={(count) => {
            const table = getTableRootFromNode(editorContextMenu.block);
            if (table) {
              controller.captureStructuralUndo();
              setTableColumnCount(table, count);
              updateTableOverflowState(table);
              controller.syncContent();
              return;
            }
            mutateContextBlock(getAestheticTarget(editorContextMenu.block), (block) => setPageBlockColumnCount(block, count));
          }}
          onResetAesthetics={() => resetContextAesthetics(editorContextMenu.block)}
          onApplyColor={(kind, color) => {
            const target = editorContextMenu.block;
            const table = getTableRootFromNode(target);
            const cells = table ? getSelectedTableCells(table) : [];
            if (cells.length) {
              mutateTable(() => applyTableColor(cells, kind, color));
              return;
            }
            mutateContextBlock(target, (block) => applyEditorBlockColor(block, kind, color));
          }}
          onResetColors={() => mutateContextBlock(editorContextMenu.block, resetEditorBlockColors)}
          onConversion={() => {
            const block = editorContextMenu.block.matches("[data-his-table-cell]")
              ? ensureCellContentBlock(editorContextMenu.block)
              : editorContextMenu.block;
            window.requestAnimationFrame(() => controller.openLineCommands(block));
          }}
          onCopy={() => copyContextBlock(editorContextMenu.block)}
          onCut={() => { copyContextBlock(editorContextMenu.block); deleteContextBlock(editorContextMenu.block); }}
          onPaste={() => pasteContextBlock(editorContextMenu.block)}
          onDuplicate={() => duplicateContextBlock(editorContextMenu.block)}
          onInsert={(above) => controller.insertLine(editorContextMenu.block, above)}
          onDelete={() => deleteContextBlock(editorContextMenu.block)}
        />
      )}
      {(blockColorMenu || findBlockTextDevChild("block-text-color-option")) && (
        <ColorPickerMenu
          position={{
            top: findBlockTextDevChild("block-text-color-option")?.position.top ?? blockColorMenu?.top ?? 120,
            left: findBlockTextDevChild("block-text-color-option")?.position.left ?? blockColorMenu?.left ?? 120,
          }}
          block={findBlockTextDevChild("block-text-color-option")?.block ?? blockColorMenu?.block ?? null}
          onClose={() => {
            setBlockColorMenu(null);
            closeBlockTextDevChild("block-text-color-option");
          }}
          onApplyText={(color) => {
            const target = blockColorMenu?.block ?? findBlockTextDevChild("block-text-color-option")?.block ?? null;
            if (blockColorMenu?.cells?.length) mutateTable(() => applyTableColor(blockColorMenu.cells!, "text", color));
            else if (target?.isConnected) mutateContextBlock(target, (block) => {
              if (color) block.style.color = color;
              else block.style.removeProperty("color");
            });
            else controller.applyTextColor(color);
            closeBlockTextDevTree();
          }}
          onApplyBackground={(color) => {
            const target = blockColorMenu?.block ?? findBlockTextDevChild("block-text-color-option")?.block ?? null;
            if (blockColorMenu?.cells?.length) {
              mutateTable(() => applyTableColor(blockColorMenu.cells!, blockColorMenu.kind === "border" ? "border" : "background", color));
            } else if (target && blockColorMenu?.kind === "border") {
              mutateContextBlock(target, (block) => {
                applyEditorBlockColor(block, "border", color);
              });
            } else if (target?.isConnected) mutateContextBlock(target, (block) => applyEditorBlockColor(block, "background", color));
            else controller.applyBlockBackgroundColor(color);
            closeBlockTextDevTree();
          }}
        />
      )}
      {globeIconPicker && (
        <div className="page-image-picker" role="dialog" aria-modal="true" aria-label={t("page.chooseIcon")}>
          <div className="page-image-picker__panel">
            <div className="page-image-picker__header">
              <strong>{t("page.chooseIcon")}</strong>
              <button type="button" onClick={() => setGlobeIconPicker(null)} aria-label={t("common.actions.close")}>X</button>
            </div>
            <IconCapabilityPicker
              nodes={nodes}
              tab={globeIconPicker.tab}
              onTabChange={(tab) => setGlobeIconPicker((current) => current ? { ...current, tab } : current)}
              currentImageId={readGlobeIconState(globeIconPicker.globe).iconNodeId}
              currentPresentation={(() => { const state = readGlobeIconState(globeIconPicker.globe); return state.iconVisual?.kind === "image" ? state.iconVisual.presentation : undefined; })()}
              onImageSelect={(id, presentation, source) => updateGlobeIcon(selectGlobeImage(readGlobeIconState(globeIconPicker.globe), nodes, id, source, presentation))}
              onImageUpload={async (file) => (await onFileImport?.(file, node.parentId))?.id ?? null}
              onUnsplashSelect={async (selection) => (await onCreateImageFromUnsplash?.(selection)) ?? null}
              onEmojiSelect={(value, style) => updateGlobeIcon(selectGlobeEmoji(readGlobeIconState(globeIconPicker.globe), value, style))}
              onIconSelect={(provider, name) => updateGlobeIcon(selectGlobeGlyph(readGlobeIconState(globeIconPicker.globe), provider, name))}
              onClear={() => updateGlobeIcon(clearNodeIcon(readGlobeIconState(globeIconPicker.globe)))}
              clearLabel={t("page.removeIcon")}
            />
          </div>
        </div>
      )}
      {globeIconVisual && globeIconVisual.target.isConnected && createPortal(
        <NodeVisualRenderer visual={globeIconVisual.visual} className="editor-globe-icon-visual" />,
        globeIconVisual.target,
      )}
      </>
    </div>
  );
}

const TEXT_COLOR_SWATCHES = [
  { nameKey: "editor.colors.default", value: "" },
  { nameKey: "editor.colors.grey", value: EDITOR_TEXT_COLORS.grey },
  { nameKey: "editor.colors.brown", value: EDITOR_TEXT_COLORS.brown },
  { nameKey: "editor.colors.orange", value: EDITOR_TEXT_COLORS.orange },
  { nameKey: "editor.colors.yellow", value: EDITOR_TEXT_COLORS.yellow },
  { nameKey: "editor.colors.amber", value: EDITOR_TEXT_COLORS.amber },
  { nameKey: "editor.colors.teal", value: EDITOR_TEXT_COLORS.teal },
  { nameKey: "editor.colors.green", value: EDITOR_TEXT_COLORS.green },
  { nameKey: "editor.colors.blue", value: EDITOR_TEXT_COLORS.blue },
  { nameKey: "editor.colors.ice", value: EDITOR_TEXT_COLORS.ice },
  { nameKey: "editor.colors.purple", value: EDITOR_TEXT_COLORS.purple },
  { nameKey: "editor.colors.pink", value: EDITOR_TEXT_COLORS.pink },
  { nameKey: "editor.colors.red", value: EDITOR_TEXT_COLORS.red },
] as const;

const BLOCK_BACKGROUND_SWATCHES = [
  { nameKey: "editor.colors.default", value: "" },
  { nameKey: "editor.background.grey", value: EDITOR_BACKGROUND_COLORS.gray },
  { nameKey: "editor.background.brown", value: EDITOR_BACKGROUND_COLORS.brown },
  { nameKey: "editor.background.orange", value: EDITOR_BACKGROUND_COLORS.orange },
  { nameKey: "editor.background.yellow", value: EDITOR_BACKGROUND_COLORS.yellow },
  { nameKey: "editor.background.green", value: EDITOR_BACKGROUND_COLORS.green },
  { nameKey: "editor.background.blue", value: EDITOR_BACKGROUND_COLORS.blue },
  { nameKey: "editor.background.ice", value: EDITOR_BACKGROUND_COLORS.ice },
  { nameKey: "editor.background.purple", value: EDITOR_BACKGROUND_COLORS.purple },
  { nameKey: "editor.background.pink", value: EDITOR_BACKGROUND_COLORS.pink },
  { nameKey: "editor.background.red", value: EDITOR_BACKGROUND_COLORS.red },
] as const;

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((char) => char + char).join("")}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toUpperCase();
  return "";
}

function ColorPickerMenu({
  position,
  block,
  onClose,
  onApplyText,
  onApplyBackground,
}: {
  position: { top: number; left: number };
  block: HTMLElement | null;
  onClose: () => void;
  onApplyText: (color: string) => void;
  onApplyBackground: (color: string) => void;
}) {
  const { t } = useLocale();
  const [colorTarget, setColorTarget] = useState<"text" | "background">("text");
  const [customTextColor, setCustomTextColor] = useState("#FFFFFF");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#FFFFFF");
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem("hisfuture-recent-text-colors");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!(target instanceof Element) || !target.closest("[data-color-picker]")) {
        onClose();
      }
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnPointer, true);
    document.addEventListener("keydown", closeOnKey);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer, true);
      document.removeEventListener("keydown", closeOnKey);
    };
  }, [onClose]);

  useEffect(() => {
    try {
      window.localStorage.setItem("hisfuture-recent-text-colors", JSON.stringify(recentColors.slice(0, 6)));
    } catch {
      // ignore localStorage quota issues from temporary UI state
    }
  }, [recentColors]);

  const currentTextColor = block ? (block.style.color || getComputedStyle(block).color || "#E8E9EA") : "#E8E9EA";
  const currentBackgroundColor = block ? (block.style.backgroundColor || getComputedStyle(block).backgroundColor || "transparent") : "transparent";

  const rememberRecent = (color: string) => {
    const cleaned = normalizeHexColor(color);
    if (!cleaned) return;
    setRecentColors((current) => [cleaned, ...current.filter((item) => item !== cleaned)].slice(0, 6));
  };

  const applyTextColor = (color: string) => {
    const cleaned = normalizeHexColor(color);
    if (!cleaned && color !== "") return;
    if (cleaned) rememberRecent(cleaned);
    onApplyText(color === "" ? "" : cleaned);
  };

  const top = Math.min(Math.max(position.top, 18), Math.max(18, window.innerHeight - 360));
  const left = Math.min(Math.max(position.left, 18), Math.max(18, window.innerWidth - 270));

  if (colorTarget) return (
    <div
      data-color-picker="true"
      className="his-table-menu__submenu editor-block-color-menu"
      onMouseDown={(event) => event.preventDefault()}
      style={{ position: "fixed", top, left, zIndex: 80 }}
    >
      <header><span>{colorTarget === "text" ? "Color de texto" : "Color de fondo"}</span></header>
      <div className="editor-block-color-menu__tabs">
        <button type="button" className={colorTarget === "text" ? "is-active" : ""} onMouseDown={(event) => { event.preventDefault(); setColorTarget("text"); }}>Texto</button>
        <button type="button" className={colorTarget === "background" ? "is-active" : ""} onMouseDown={(event) => { event.preventDefault(); setColorTarget("background"); }}>Fondo</button>
      </div>
      <ColorOptions kind={colorTarget} onApply={colorTarget === "text" ? onApplyText : onApplyBackground} />
    </div>
  );

  return (
    <div
      data-color-picker="true"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        width: "min(260px, calc(100vw - 24px))",
        maxHeight: "min(340px, 70vh)",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "8px",
        background: "#121417",
        border: "1px solid #2E3338",
        borderRadius: "10px",
        boxShadow: "none",
        zIndex: 80,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 8px", marginBottom: "8px", borderBottom: "1px solid #343940" }}>
        <div style={{ fontSize: "11px", color: "var(--his-accent)", letterSpacing: "0.08em" }}>{t("editor.colors.title")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span title={t("editor.colors.currentText")} style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.25)", background: currentTextColor }} />
          <span title={t("editor.colors.currentBackground")} style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", border: currentBackgroundColor === "transparent" ? "1px dashed rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.25)", background: currentBackgroundColor === "transparent" ? "transparent" : currentBackgroundColor }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); onClose(); }} style={{ border: "none", background: "transparent", color: "#9AA0A6", cursor: "pointer", fontSize: "11px" }}>{t("common.actions.close")}</button>
        </div>
      </div>
      {recentColors.length > 0 && (
        <div style={{ padding: "0 0 8px" }}>
          <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>{t("editor.colors.recent")}</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {recentColors.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onMouseDown={(event) => { event.preventDefault(); applyTextColor(color); }}
                style={{ width: "18px", height: "18px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: color, cursor: "pointer" }}
              />
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: "0 0 8px" }}>
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>{t("editor.colors.text")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {TEXT_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.nameKey}
              type="button"
              title={t(swatch.nameKey)}
              onMouseDown={(event) => { event.preventDefault(); applyTextColor(swatch.value); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "5px 6px",
                border: "none",
                borderRadius: 0,
                background: "transparent",
                color: "#E8E9EA",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s ease, transform 0.12s ease",
              }}
              onMouseEnter={(event) => {
                const target = event.currentTarget;
                target.style.background = "rgba(255,255,255,0.04)";
                target.style.transform = "translateX(1px)";
              }}
              onMouseLeave={(event) => {
                const target = event.currentTarget;
                target.style.background = "transparent";
                target.style.transform = "translateX(0)";
              }}
            >
              <span
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: swatch.value ? "1px solid rgba(255,255,255,0.2)" : "1px dashed rgba(255,255,255,0.25)",
                  background: swatch.value || "transparent",
                  display: "inline-block",
                  boxShadow: "none",
                  transition: "box-shadow 0.12s ease, transform 0.12s ease",
                }}
              />
              <span style={{ fontSize: "11px", flex: 1 }}>{t(swatch.nameKey)}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ paddingTop: "8px" }}>
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>{t("editor.colors.custom")}</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="text" value={customTextColor} onChange={(event) => setCustomTextColor(event.target.value)} placeholder="#AABBCC" style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "none", borderRadius: 0, background: "#121417", color: "#E8E9EA", fontSize: "11px" }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); applyTextColor(customTextColor); }} style={{ padding: "6px 8px", border: "none", borderRadius: 0, background: "#20262B", color: "#E8E9EA", cursor: "pointer", fontSize: "11px" }}>OK</button>
        </div>
      </div>
      <div style={{ paddingTop: "8px", marginTop: "8px" }}>
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>{t("editor.colors.background")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {BLOCK_BACKGROUND_SWATCHES.map((swatch) => (
            <button
              key={swatch.nameKey}
              type="button"
              title={t(swatch.nameKey)}
              onMouseDown={(event) => { event.preventDefault(); onApplyBackground(swatch.value); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "5px 6px",
                border: "none",
                borderRadius: 0,
                background: "transparent",
                color: "#E8E9EA",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s ease, transform 0.12s ease",
              }}
              onMouseEnter={(event) => {
                const target = event.currentTarget;
                target.style.background = "rgba(255,255,255,0.04)";
                target.style.transform = "translateX(1px)";
              }}
              onMouseLeave={(event) => {
                const target = event.currentTarget;
                target.style.background = "transparent";
                target.style.transform = "translateX(0)";
              }}
            >
              <span
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: swatch.value ? "1px solid rgba(0,0,0,0.2)" : "1px dashed rgba(255,255,255,0.25)",
                  background: swatch.value || "transparent",
                  display: "inline-block",
                  boxShadow: "none",
                  transition: "box-shadow 0.12s ease, transform 0.12s ease",
                }}
              />
              <span style={{ fontSize: "11px", flex: 1 }}>{t(swatch.nameKey)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px" }}>
          <input type="text" value={customBackgroundColor} onChange={(event) => setCustomBackgroundColor(event.target.value)} placeholder="#D9E8FF" style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "none", borderRadius: 0, background: "#121417", color: "#E8E9EA", fontSize: "11px" }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); const cleaned = normalizeHexColor(customBackgroundColor); if (cleaned) onApplyBackground(cleaned); }} style={{ padding: "6px 8px", border: "none", borderRadius: 0, background: "#20262B", color: "#E8E9EA", cursor: "pointer", fontSize: "11px" }}>OK</button>
        </div>
      </div>
    </div>
  );
}

function SelectionToolbar({
  controller,
}: {
  controller: ReturnType<typeof useEditorController>;
}) {
  const { t } = useLocale();
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [customTextColor, setCustomTextColor] = useState("#FFFFFF");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#FFFFFF");
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem("hisfuture-recent-text-colors");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("hisfuture-recent-text-colors", JSON.stringify(recentColors.slice(0, 6)));
    } catch {
      // ignore localStorage quota issues from temporary UI state
    }
  }, [recentColors]);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Element) || !target.closest("[data-color-picker]")) {
        setColorMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [colorMenuOpen]);

  const rememberRecentColor = (color: string) => {
    const cleaned = normalizeHexColor(color);
    if (!cleaned) return;
    setRecentColors((current) => [cleaned, ...current.filter((item) => item !== cleaned)].slice(0, 6));
  };

  const onApplyTextColor = (color: string) => {
    if (color === "") {
      controller.applyTextColor("");
      setColorMenuOpen(false);
      return;
    }
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    controller.applyTextColor(normalized);
    rememberRecentColor(normalized);
    setColorMenuOpen(false);
  };

  const onApplyBackgroundColor = (color: string) => {
    controller.applyBlockBackgroundColor(color || "");
    setColorMenuOpen(false);
  };

  const formats = [
    { command: "bold" as const, label: "B", title: t("editor.format.bold") },
    { command: "italic" as const, label: "I", title: t("editor.format.italic") },
    { command: "underline" as const, label: "U", title: t("editor.format.underline") },
    { command: "strikeThrough" as const, label: "S", title: t("editor.format.strike") },
  ];

  return (
    <div
      data-selection-toolbar="true"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        top: controller.selectionToolbar!.top,
        left: controller.selectionToolbar!.left,
        display: "flex",
        gap: "2px",
        padding: "4px",
        background: "var(--his-popover-surface)",
        border: "1px solid var(--his-border-neutral)",
        borderRadius: "9px",
        boxShadow: "0 12px 28px rgb(0 0 0 / 28%)",
        zIndex: 30,
      }}
    >
      {formats.map((format) => {
        const markState = controller.selectionToolbar!.marks[format.command];
        return <button
          key={format.command}
          type="button"
          title={format.title}
          aria-pressed={markState === "mixed" ? "mixed" : markState === "on"}
          data-mark-state={markState}
          className="editor-selection-toolbar__format"
          onMouseDown={(event) => {
            event.preventDefault();
            controller.applyTextFormat(format.command);
          }}
          style={{
            width: "30px",
            height: "30px",
            border: "1px solid transparent",
            borderRadius: "5px",
            background: markState === "on" ? "color-mix(in srgb, var(--his-accent) 15%, transparent)" : "transparent",
            color: markState === "off" ? "var(--his-icon-neutral)" : "var(--his-accent)",
            fontFamily: "Georgia, serif",
            fontSize: "15px",
            fontWeight: format.command === "bold" ? 700 : 400,
            fontStyle: format.command === "italic" ? "italic" : "normal",
            textDecoration:
              format.command === "underline"
                ? "underline"
                : format.command === "strikeThrough"
                  ? "line-through"
                  : "none",
          }}
        >
          {format.label}
        </button>;
      })}
      <button
        type="button"
        title={t("editor.commands.color")}
        onMouseDown={(event) => {
          event.preventDefault();
          setColorMenuOpen((value) => !value);
        }}
        style={{
          width: "30px",
          height: "30px",
          border: "none",
          borderRadius: 0,
          background: "transparent",
          color: "var(--his-icon-neutral)",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
          position: "relative",
        }}
      >
        A
        <span
          style={{
            position: "absolute",
            left: "8px",
            right: "8px",
            bottom: "4px",
            height: "3px",
            borderRadius: "2px",
            background: `linear-gradient(90deg, ${EDITOR_TEXT_COLORS.grey} 0%, ${EDITOR_TEXT_COLORS.blue} 100%)`,
          }}
        />
      </button>
      {colorMenuOpen && (
        <div
          data-color-picker="true"
          className="his-table-menu__submenu editor-selection-color-menu"
          onMouseDown={(event) => event.preventDefault()}
          style={{
            position: "fixed",
            top: Math.min(controller.selectionToolbar!.top + 42, window.innerHeight - 440),
            left: Math.min(controller.selectionToolbar!.left + 150, window.innerWidth - 240),
            zIndex: 35,
          }}
        >
          <header><span>Color de texto</span></header>
          <ColorOptions kind="text" onApply={onApplyTextColor} />
        </div>
      )}
      {false && colorMenuOpen && (
        <div
          data-color-picker="true"
          onMouseDown={(event) => event.preventDefault()}
          style={{
            position: "fixed",
            top: Math.min(controller.selectionToolbar!.top + 42, window.innerHeight - 340),
            left: Math.min(controller.selectionToolbar!.left + 150, window.innerWidth - 270),
            width: "240px",
            padding: "8px",
            background: "var(--his-popover-surface)",
            border: "1px solid var(--his-border-neutral)",
            borderRadius: "9px",
            boxShadow: "0 12px 28px rgb(0 0 0 / 28%)",
            zIndex: 35,
          }}
        >
          <div style={{ padding: "4px 8px 6px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>{t("editor.colors.swatches")}</div>
          {recentColors.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 4px 8px" }}>
              {recentColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onApplyTextColor(color);
                  }}
                  style={{ width: "20px", height: "20px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "4px", background: color, cursor: "pointer" }}
                />
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "6px", padding: "0 4px" }}>
            {TEXT_COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                title={t(swatch.nameKey)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onApplyTextColor(swatch.value);
                }}
                style={{
                  width: "18px",
                  height: "18px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: "50%",
                  background: swatch.value,
                  cursor: "pointer",
                  justifySelf: "center",
                }}
              />
            ))}
          </div>
          <div style={{ margin: "8px 0 6px", paddingTop: "8px" }}>
            <div style={{ padding: "0 8px 4px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>{t("editor.colors.custom")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 4px" }}>
              <input
                type="text"
                value={customTextColor}
                onChange={(event) => setCustomTextColor(event.target.value)}
                placeholder="#AABBCC"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: 0,
                  background: "#121417",
                  color: "#E8E9EA",
                  fontSize: "11px",
                }}
              />
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onApplyTextColor(customTextColor);
                }}
                style={{
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: 0,
                  background: "#20262B",
                  color: "#E8E9EA",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                OK
              </button>
            </div>
          </div>
          <div style={{ margin: "8px 0 6px", paddingTop: "8px" }}>
            <div style={{ padding: "0 8px 4px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>{t("editor.colors.background")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "6px", padding: "0 4px" }}>
              {BLOCK_BACKGROUND_SWATCHES.map((swatch) => (
                <button
                  key={swatch.nameKey}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onApplyBackgroundColor(swatch.value);
                  }}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: swatch.value ? "1px solid rgba(0,0,0,0.2)" : "1px dashed rgba(255,255,255,0.25)",
                    background: swatch.value || "transparent",
                    cursor: "pointer",
                    justifySelf: "center",
                  }}
                  title={t(swatch.nameKey)}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 4px 0" }}>
              <input
                type="text"
                value={customBackgroundColor}
                onChange={(event) => setCustomBackgroundColor(event.target.value)}
                placeholder="#D9E8FF"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: 0,
                  background: "#121417",
                  color: "#E8E9EA",
                  fontSize: "11px",
                }}
              />
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  const normalized = normalizeHexColor(customBackgroundColor);
                  if (normalized) onApplyBackgroundColor(normalized);
                }}
                style={{
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: 0,
                  background: "#20262B",
                  color: "#E8E9EA",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageMentionModeMenu({
  position,
  onSelect,
  onCancel,
}: {
  position: { top: number; left: number };
  onSelect: (mode: "inserted" | "full") => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismissibleLayer(menuRef, onCancel);
  return (
    <div
      ref={menuRef}
      data-picker="true"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        minWidth: "240px",
        padding: "8px",
        background: "#1A1D21",
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        zIndex: 21,
      }}
    >
      <div style={{ padding: "4px 8px 8px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.1em" }}>
        {t("editor.image.type")}
      </div>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onSelect("inserted"); }} style={mentionModeButtonStyle}>
        <strong>{t("editor.image.inserted")}</strong>
        <small>{t("editor.image.insertedHint")}</small>
      </button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onSelect("full"); }} style={mentionModeButtonStyle}>
        <strong>{t("editor.image.full")}</strong>
        <small>{t("editor.image.fullHint")}</small>
      </button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onCancel(); }} style={{ ...mentionModeButtonStyle, color: "#7A7F87" }}>
        {t("common.actions.cancel")}
      </button>
    </div>
  );
}

const mentionModeButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "3px",
  width: "100%",
  padding: "8px",
  border: "none",
  borderRadius: 0,
  background: "transparent",
  color: "#E8E9EA",
  textAlign: "left",
  cursor: "pointer",
};

function PickerMenu({
  title,
  position,
  items,
  activeIndex,
  onSelect,
  onColorMenuOpen,
  colorFor,
  showDeleteLine = false,
  onDeleteLine,
}: {
  title: string;
  position: { top: number; left: number };
  items: { id: string; label: string; icon?: string; category?: string; tag?: string }[];
  activeIndex: number;
  onSelect: (id: string) => void;
  onColorMenuOpen?: (position: { top: number; left: number }) => void;
  colorFor?: (id: string) => string;
  showDeleteLine?: boolean;
  onDeleteLine?: () => void;
}) {
  const { t } = useLocale();
  const categories = items.reduce<Record<string, typeof items>>((groups, item) => {
    const category = item.category || t("editor.commands.other");
    (groups[category] ||= []).push(item);
    return groups;
  }, {});
  let index = 0;
  return (
    <div
      data-picker="true"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: "min(260px, calc(100vw - 28px))",
        maxHeight: "420px",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "4px",
        background: "#1A1D21",
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        zIndex: 20,
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: "10px",
          color: "#5A5F66",
          letterSpacing: "0.1em",
        }}
      >
        {title}
      </div>
      {Object.entries(categories).map(([category, categoryItems]) => (
        <div key={category}>
          <div style={{ padding: "7px 8px 3px", fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em" }}>{category}</div>
          {categoryItems.map((item) => {
            const itemIndex = index++;
            return (
              <button
                key={item.id}
                data-picker-menu-item={item.id}
                type="button"
                onMouseEnter={(event) => {
                  if (item.tag === "COLOR" && onColorMenuOpen) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    onColorMenuOpen({
                      top: rect.bottom + 8,
                      left: rect.right + 8,
                    });
                  }
                  const target = event.currentTarget;
                  target.style.background = "rgba(255,255,255,0.04)";
                  target.style.transform = "translateX(1px)";
                }}
                onMouseLeave={(event) => {
                  const target = event.currentTarget;
                  target.style.background = itemIndex === activeIndex ? "#252B2D" : "transparent";
                  target.style.transform = "translateX(0)";
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(item.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: 0,
                  background: itemIndex === activeIndex ? "#252B2D" : "transparent",
                  color: "#E8E9EA",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease",
                }}
              >
                <span
                  style={{
                    background: "#121417",
                    border: "none",
                    borderRadius: 0,
                    padding: "2px 6px",
                    fontSize: "10px",
                    color: colorFor ? colorFor(item.id) : "#A7A9AC",
                  }}
                >
                  {item.icon || "•"}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
      {showDeleteLine && onDeleteLine && (
        <button
          type="button"
          onMouseEnter={(event) => {
            const target = event.currentTarget;
            target.style.background = "rgba(255,255,255,0.04)";
            target.style.transform = "translateX(1px)";
          }}
          onMouseLeave={(event) => {
            const target = event.currentTarget;
            target.style.background = "transparent";
            target.style.transform = "translateX(0)";
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            onDeleteLine();
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "7px 8px",
            border: "none",
            background: "transparent",
            color: "#D87878",
            textAlign: "left",
            cursor: "pointer",
            borderRadius: 0,
            transition: "background 0.12s ease, transform 0.12s ease",
          }}
        >
          {t("editor.line.delete")}
        </button>
      )}
    </div>
  );
}

function LineActionMenu({
  position,
  onDeleteLine,
}: {
  position: { top: number; left: number };
  onDeleteLine: () => void;
}) {
  const { t } = useLocale();
  return (
    <div
      data-picker="true"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        minWidth: "160px",
        padding: "4px",
        background: "#1A1D21",
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        zIndex: 20,
      }}
    >
      <button
        type="button"
        onMouseEnter={(event) => {
          const target = event.currentTarget;
          target.style.background = "rgba(255,255,255,0.04)";
          target.style.transform = "translateX(1px)";
        }}
        onMouseLeave={(event) => {
          const target = event.currentTarget;
          target.style.background = "transparent";
          target.style.transform = "translateX(0)";
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          onDeleteLine();
        }}
        style={{
          display: "block",
          width: "100%",
          padding: "7px 8px",
          border: "none",
          background: "transparent",
          color: "#D87878",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: 0,
          transition: "background 0.12s ease, transform 0.12s ease",
        }}
      >
        {t("editor.line.delete")}
      </button>
    </div>
  );
}
