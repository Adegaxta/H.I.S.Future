import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject, WheelEvent } from "react";
import { createPortal } from "react-dom";
import type { NodeItem } from "../types/nodes";
import { getNodeDefinition } from "../defs/nodeTypes";
import { getImageResourceInfo } from "../utils/imageResource";
import { getEffectiveNodeType } from "../utils/nodeTree";
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
import moreVertAsset from "../assets/third-party/google-material/icons/more_vert.svg";
import dragIndicatorAsset from "../assets/third-party/google-material/icons/drag_indicator.svg";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { isResizableEditorImage } from "./imageResize";
import type { HisContextMenuItem } from "../components/HisContextMenu";
import { getPageMeta } from "../utils/pageMeta";
import PageBlockContextMenu from "./PageBlockContextMenu";
import { addTableControl, findTableControl } from "./table";
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
  onCreatePastedNode,
  onSlashCommand,
  readOnly = false,
  mode = "interactive",
  className,
  style,
  beforeContent,
}: RichTextEditorProps) {
  const { t } = useLocale();
  // Editing a page changes the nodes array frequently, but mention labels and
  // image resources usually do not. Keep that expensive DOM reconciliation
  // dormant until one of those resources actually changes.
  const mentionResourceVersion = useMemo(() => nodes.map((item) =>
    `${item.id}\u0000${item.type}\u0000${item.name}\u0000${item.type === "imagen" ? getMentionResourceIdentity(item) : item.type === "pagina" ? getPageMeta(item.content).iconNodeId ?? "" : ""}`,
  ).join("\u0001"), [nodes]);
  const [editorContextMenu, setEditorContextMenu] = useState<{
    imageNodeId: string | null;
    mention: HTMLElement | null;
    block: HTMLElement;
    mode: "inserted" | "full" | null;
    top: number;
    left: number;
  } | null>(null);
  const [blockColorMenu, setBlockColorMenu] = useState<{
    top: number;
    left: number;
    block: HTMLElement | null;
    kind?: "text" | "background" | "border";
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
    onSlashCommand,
  });
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
      if (mentionedNode) {
        mention.style.setProperty("--mention-color", getNodeDefinition(mentionedNode.type).color);
      }
      if (mentionedNode?.type === "pagina") {
        const iconNodeId = getPageMeta(mentionedNode.content).iconNodeId;
        const iconResource = iconNodeId ? imageNodes.get(iconNodeId) : null;
        if (iconResource) {
          if (!image) {
            image = document.createElement("img");
            mention.insertBefore(image, mention.firstChild);
            changed = true;
          }
          if (!image.classList.contains("editor-mention__icon") || image.dataset.noResize !== "true") {
            image.classList.add("editor-mention__icon");
            image.dataset.noResize = "true";
            changed = true;
          }
          if (image.src !== iconResource.src) {
            image.src = iconResource.src;
            image.alt = mentionedNode.name;
            changed = true;
          }
        } else if (image) {
          image.remove();
          changed = true;
        }
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
      ["color", "opacity", "text-decoration", "text-underline-offset", "cursor", "gap"].forEach((property) => {
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
  const changeGlobeIcon = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const icon = (event.target as HTMLElement).closest("[data-globe-icon]");
    if (!icon || !editorRef.current?.contains(icon)) return;
    event.preventDefault();
    event.stopPropagation();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") return;
        const image = document.createElement("img");
        image.src = reader.result;
        image.alt = "Icono del globo";
        icon.replaceChildren(image);
        controller.syncContent();
      });
      reader.readAsDataURL(file);
    });
    input.click();
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
    pageBlockClipboardHtml = clone.outerHTML;
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
  const mutateContextBlock = (
    block: HTMLElement,
    mutation: (target: HTMLElement) => HTMLElement | void,
  ) => {
    if (!block.isConnected) return;
    let next = block;
    preserveEditorViewport(() => {
      controller.captureStructuralUndo();
      next = mutation(block) || block;
      controller.syncContent();
    });
    setEditorContextMenu((current) => current && current.block === block ? { ...current, block: next } : current);
  };
  const deleteContextBlock = (block: HTMLElement) => {
    const selected = controller.selectedLineBlocks.filter((line) => line.isConnected);
    if (selected.includes(block)) controller.deleteSelectedLine();
    else controller.removeLine(block);
  };
  const getAestheticTarget = (block: HTMLElement) => block.matches("[data-globe]")
    ? block.querySelector<HTMLElement>("[data-globe-content] > p, [data-globe-content] > h1, [data-globe-content] > h2, [data-globe-content] > h3, [data-globe-content] > h4, [data-globe-content] > h5, [data-globe-content] > h6, [data-globe-content] > blockquote, [data-globe-content] > li, [data-globe-content] > pre") ?? block
    : block;
  const toggleContextCapability = (block: HTMLElement, capability: PageBlockCapabilityDefinition) => {
    if (capability.id === "globe") {
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
    mutateContextBlock(getAestheticTarget(block), (target) => togglePageBlockCapability(target, capability));
  };
  const resetContextAesthetics = (block: HTMLElement) => {
    if (!block.isConnected) return;
    preserveEditorViewport(() => {
      controller.captureStructuralUndo();
      let target = getAestheticTarget(block);
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
    const actionBlock = mention || block;
    controller.resetEditorPickers();
    setBlockColorMenu(null);
    setBlockTextDevTree(BLOCK_TEXT_DEV_REGISTRY.closeTree());
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
              const next = event.relatedTarget as Element | null;
              if (!next?.closest(".editor-content, [data-line-control], [data-picker]")) {
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
            boxShadow: controller.lineControl.inside ? "0 0 8px #4DD8C0" : "none",
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
      {!readOnly && controller.selectionToolbar && (
        <SelectionToolbar controller={controller} />
      )}
      <div
        ref={editorRef}
        className={`editor-content${className ? ` ${className}` : ""}`}
        data-block-selecting={controller.blockSelection ? "true" : undefined}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        style={style}
        onFocus={readOnly ? undefined : controller.updatePlaceholder}
        onInput={(event) => {
          const changedSyncBlock = (event.target as HTMLElement).closest<HTMLElement>("[data-his-synced]");
          const syncId = changedSyncBlock?.dataset.hisSynced;
          if (changedSyncBlock && syncId) {
            editorRef.current?.querySelectorAll<HTMLElement>(`[data-his-synced="${CSS.escape(syncId)}"]`).forEach((peer) => {
              if (peer !== changedSyncBlock && peer.innerHTML !== changedSyncBlock.innerHTML) peer.innerHTML = changedSyncBlock.innerHTML;
            });
          }
          controller.clearGeneratedLines();
          controller.clearStructuralUndo();
          if (event.currentTarget.childElementCount === 0) {
            controller.ensureEditorLine();
          }
          controller.scheduleContentSync();
          controller.updatePlaceholder();
          controller.updatePickers();
        }}
        onPaste={readOnly ? undefined : controller.onPaste}
        onContextMenu={(event) => {
          if (readOnly) return;
          const block = controller.getEditorBlock(event.target as Node);
          if (!block) return;
          event.preventDefault();
          event.stopPropagation();
          openEditorBlockContextMenu(block, event.clientX, event.clientY, (event.target as HTMLElement).closest<HTMLElement>("[data-mention-id]"));
        }}
        onMouseMove={readOnly ? undefined : controller.updateLineControl}
        onMouseLeave={(event) => {
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
          const target = event.target as HTMLElement;
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
          changeGlobeIcon(event);
          if (!readOnly && controller.ensureEditorLine()) {
            controller.syncContent();
          }
          if (clickedDivider) controller.setPlaceholderBlock?.(null);
          else controller.updatePlaceholder();
        }}
        onKeyDown={readOnly ? undefined : controller.onKeyDown}
        onBeforeInput={
          readOnly
            ? undefined
            : (event) => {
                const input = event.nativeEvent as InputEvent;
                const inputType =
                  typeof input.inputType === "string" ? input.inputType : "";
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
          if (relatedTarget instanceof Element && relatedTarget.closest(".his-context-menu")) {
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
          const tableControl = findTableControl(event.target as HTMLElement);
          if (tableControl) {
            event.preventDefault();
            event.stopPropagation();
            controller.captureStructuralUndo();
            addTableControl(tableControl);
            controller.syncContent();
            return;
          }
          controller.onEditorPointerDown(event);
        }}
        onPointerMove={
          readOnly
            ? undefined
            : (event) => {
                controller.onEditorPointerMove(event);
                controller.onEditorSelectionMove(event);
              }
        }
        onPointerUp={readOnly ? undefined : controller.onEditorPointerUp}
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
      {controller.pickerPosition &&
        controller.callPicker &&
        !controller.imageMentionChoice &&
        controller.callCandidates.length > 0 && (
          <PickerMenu
            title={t("editor.commands.linkNode")}
            position={controller.pickerPosition}
            items={controller.callCandidates.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            activeIndex={controller.callPickerIndex}
            onSelect={(id) => {
              const target = nodes.find((item) => item.id === id);
              if (target?.type === "imagen") controller.setImageMentionChoice(id);
              else controller.executePickerAction("mention", id);
            }}
            colorFor={(id) =>
              getNodeDefinition(
                getEffectiveNodeType(
                  nodes,
                  nodes.find((item) => item.id === id)!,
                )
              ).color
            }
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
      {editorContextMenu && (
        <PageBlockContextMenu
          x={editorContextMenu.left}
          y={editorContextMenu.top}
          block={editorContextMenu.block}
          capabilityBlock={getAestheticTarget(editorContextMenu.block)}
          supportsAesthetics={!editorContextMenu.imageNodeId && editorContextMenu.block.matches("p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, [data-globe]")}
          imageItems={editorContextImageItems.filter((item) => item.id !== "image-delete")}
          onClose={closeEditorContextMenu}
          onCapability={(capability) => toggleContextCapability(editorContextMenu.block, capability)}
          onColumns={(count) => mutateContextBlock(getAestheticTarget(editorContextMenu.block), (block) => setPageBlockColumnCount(block, count))}
          onResetAesthetics={() => resetContextAesthetics(editorContextMenu.block)}
          onOpenColors={(kind) => {
            setBlockColorMenu({ top: editorContextMenu.top, left: editorContextMenu.left + 274, block: editorContextMenu.block, kind });
          }}
          onResetColors={() => mutateContextBlock(editorContextMenu.block, (block) => {
            block.style.removeProperty("color");
            block.style.removeProperty("background-color");
            block.style.removeProperty("border-color");
          })}
          onConversion={() => {
            const block = editorContextMenu.block;
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
            if (target?.isConnected) mutateContextBlock(target, (block) => {
              if (color) block.style.color = color;
              else block.style.removeProperty("color");
            });
            else controller.applyTextColor(color);
            closeBlockTextDevTree();
          }}
          onApplyBackground={(color) => {
            const target = blockColorMenu?.block ?? findBlockTextDevChild("block-text-color-option")?.block ?? null;
            if (target && blockColorMenu?.kind === "border") {
              mutateContextBlock(target, (block) => {
                if (color) block.style.borderColor = color;
                else block.style.removeProperty("border-color");
              });
            } else controller.applyBlockBackgroundColor(color, target);
            closeBlockTextDevTree();
          }}
        />
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
        background: "#1A1D21",
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        zIndex: 35,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px" }}>
        <div style={{ fontSize: "10px", color: "#5A5F66", letterSpacing: "0.1em" }}>{t("editor.colors.title")}</div>
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
                  boxShadow: "0 0 0 0 rgba(77,216,192,0)",
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
                  boxShadow: "0 0 0 0 rgba(77,216,192,0)",
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
        background: "#1A1D21",
        border: "none",
        borderRadius: 0,
        zIndex: 30,
      }}
    >
      {formats.map((format) => (
        <button
          key={format.command}
          type="button"
          title={format.title}
          onMouseDown={(event) => {
            event.preventDefault();
            controller.applyTextFormat(format.command);
          }}
          style={{
            width: "30px",
            height: "30px",
            border: "none",
            background: "transparent",
            color: "#E8E9EA",
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
        </button>
      ))}
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
          background: "#111518",
          color: "#E8E9EA",
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
          onMouseDown={(event) => event.preventDefault()}
          style={{
            position: "fixed",
            top: Math.min(controller.selectionToolbar!.top + 42, window.innerHeight - 340),
            left: Math.min(controller.selectionToolbar!.left + 150, window.innerWidth - 270),
            width: "240px",
            padding: "8px",
            background: "#1A1D21",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
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
