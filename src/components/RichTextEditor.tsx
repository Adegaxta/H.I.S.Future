import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodeDefinition } from "../defs/nodeTypes";
import { getImageResourceInfo } from "../utils/imageResource";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useEditorController } from "../hooks/useEditorController";
import {
  EDITOR_BACKGROUND_COLORS,
  EDITOR_TEXT_COLORS,
} from "../defs/palette";
import {
  BLOCK_TEXT_DEV_REGISTRY,
  clampFloatNodePosition,
  type BlockTextDevNodeKind,
  type BlockTextDevNodeTree,
} from "../defs/devNodes";
import draftAsset from "../assets/third-party/google-material/icons/draft.svg";

function hasAlignableImage(block: Element | null): boolean {
  if (!block) return false;
  return Array.from(block.querySelectorAll("img")).some((image) => {
    if (image.closest("[data-globe-icon]")) return false;
    if (image.closest(".editor-mention") || image.closest("[data-mention-id]") || image.closest("[data-no-resize='true']")) return false;
    const mention = image.closest<HTMLElement>("[data-mention-id]");
    return !mention || mention.dataset.mentionMode === "full";
  });
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
  style: CSSProperties;
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
  style,
}: RichTextEditorProps) {
  const [imageMentionChoice, setImageMentionChoice] = useState<string | null>(null);
  const [imageContextMenu, setImageContextMenu] = useState<{
    id: string;
    mode: "inserted" | "full";
    top: number;
    left: number;
  } | null>(null);
  const [blockColorMenu, setBlockColorMenu] = useState<{
    top: number;
    left: number;
    block: HTMLElement | null;
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
      Boolean(imageContextMenu) ||
      Boolean(imageMentionChoice) ||
      Boolean((controller.slashPicker || controller.callPicker) && controller.pickerPosition);
    if (!menuOpen) return;

    const popupSelector = "[data-picker], [data-color-picker], [data-image-context-menu], [data-selection-toolbar]";
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
  }, [blockColorMenu, blockTextDevTree.root, controller.callPicker, controller.pickerPosition, controller.slashPicker, imageContextMenu, imageMentionChoice]);

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
      Boolean(imageContextMenu) ||
      Boolean(imageMentionChoice) ||
      Boolean(controller.pickerPosition && (controller.slashPicker || controller.callPicker));
    if (hasVisiblePopover) return;
    setBlockTextDevTree((current) => {
      if (!current.root && current.children.length === 0) return current;
      return BLOCK_TEXT_DEV_REGISTRY.closeTree();
    });
  }, [blockColorMenu, controller.callPicker, controller.pickerPosition, controller.slashPicker, imageContextMenu, imageMentionChoice]);
  useEffect(() => {
    if (!imageContextMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Element) || !target.closest('[data-image-context-menu="true"]')) {
        setImageContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageContextMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageContextMenu]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => controller.updatePlaceholder());
    return () => cancelAnimationFrame(frame);
  }, [node.id]);
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
      const image = mention.querySelector<HTMLImageElement>("img");
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
  }, [deletedNodes, editorRef, node.id, nodes]);
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
  return (
    <div
      className="editor-selection-surface"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        controller.onEditorPointerDown(event);
      }}
      onPointerMove={(event) => {
        if (event.target !== event.currentTarget) return;
        controller.onEditorPointerMove(event);
        controller.onEditorSelectionMove(event);
      }}
      onPointerUp={(event) => {
        if (event.target !== event.currentTarget) return;
        controller.onEditorPointerUp();
      }}
      onClick={(event) => {
        if (readOnly || event.target !== event.currentTarget || controller.selectedLineBlocks.length > 0) return;
        controller.focusOrCreatePageLine();
      }}
    >
      <>
      {!readOnly && controller.lineControl && !controller.isDraggingLine && (
        <div
          aria-hidden="true"
          data-line-gutter="true"
          onPointerEnter={() =>
            controller.setLineControl({
              ...controller.lineControl!,
              nearLeft: true,
            })
          }
          onPointerMove={() =>
            controller.setLineControl({
              ...controller.lineControl!,
              nearLeft: true,
            })
          }
          onPointerLeave={(event) => {
            const next = event.relatedTarget as Element | null;
            if (
              !next?.closest(
                ".editor-content, [data-line-control], [data-line-gutter]",
              )
            ) {
              controller.setLineControl(null);
            }
          }}
          style={{
            position: "fixed",
            top: controller.lineControl.block.getBoundingClientRect().top,
            left: Math.max(
              0,
              controller.lineControl.block.getBoundingClientRect().left - 112,
            ),
            width: "124px",
            height: `${Math.max(28, controller.lineControl.block.getBoundingClientRect().height)}px`,
            zIndex: 23,
            pointerEvents: "none",
          }}
        />
      )}
      {controller.isDraggingLine &&
        controller.lineControl &&
        [controller.draggedLineRef.current || controller.lineControl.block].map((block, index) => {
          const rect = block.getBoundingClientRect();
          const isDivider = block.matches("[data-divider]");
          return (
            <button
              key={`${block.tagName}-${index}`}
              type="button"
              data-line-control="true"
              title="Mover línea"
              onWheel={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event) => controller.startLineDrag(block, event)}
              onPointerMove={controller.moveLineDrag}
              onPointerUp={(event) => controller.finishLineDrag(block, event)}
              style={{
                position: "fixed",
                top: Math.max(0, Math.min(window.innerHeight - Math.max(24, rect.height), rect.top)),
                left: rect.left - 56,
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
              {isDivider ? "○" : "⋮"}
            </button>
          );
        })}
      {controller.lineControl && (
        <button
          type="button"
          data-line-control="true"
          title="Opciones de línea"
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            controller.startLineDrag(controller.lineControl!.block, event);
          }}
          onPointerMove={controller.moveLineDrag}
          onPointerUp={(event) =>
            controller.finishLineDrag(controller.lineControl!.block, event)
          }
          onClick={(event) =>
            controller.openLineCommands(
              controller.lineControl!.block,
              event.currentTarget,
            )
          }
          style={{
            position: "fixed",
            top: Math.max(
              0,
              Math.min(
                window.innerHeight -
                  Math.max(24, controller.lineControl.block.getBoundingClientRect().height),
                controller.lineControl.block.getBoundingClientRect().top,
              ),
            ),
            left: Math.max(8, controller.lineControl.block.getBoundingClientRect().left - 30),
            width: "24px",
            height: `${Math.max(24, controller.lineControl.block.getBoundingClientRect().height)}px`,
            padding: 0,
            border: "1px solid #343940",
            borderRadius: "3px",
            background: "transparent",
            color: "#7A7F87",
            fontSize: "16px",
            cursor: "pointer",
            zIndex: 25,
          }}
        >
          {controller.lineControl.block.matches("[data-divider]") ? "○" : "⋮"}
        </button>
      )}
      {controller.lineControl?.nearLeft && !controller.isDraggingLine && (
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
      {controller.lineControl?.nearLeft && !controller.isDraggingLine && (
        <button
          type="button"
          data-line-control="true"
          title={
            controller.lineControl.before
              ? "Insertar línea arriba"
              : "Insertar línea abajo"
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            controller.insertLine(
              controller.lineControl!.block,
              controller.lineControl!.before,
            )
          }
          style={{
            position: "fixed",
            top: (controller.lineControl.pointerY ??
              controller.lineControl.block.getBoundingClientRect().top) - 15,
            left: controller.lineControl.left + 24,
            width: "30px",
            height: "30px",
            border: "none",
            background: "transparent",
            color: "#4DD8C0",
            fontSize: "20px",
            cursor: "pointer",
            zIndex: 26,
          }}
        >
          +
        </button>
      )}
      {controller.blockSelection && (
        <div
          aria-hidden="true"
          className="editor-block-selection"
          style={{
            left: controller.blockSelection.left,
            top: controller.blockSelection.top,
            width: controller.blockSelection.width,
            height: controller.blockSelection.height,
          }}
        />
      )}
      {!readOnly && controller.selectionToolbar && (
        <SelectionToolbar controller={controller} />
      )}
      <div
        ref={editorRef}
        className="editor-content"
        data-block-selecting={controller.blockSelection ? "true" : undefined}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        style={style}
        onFocus={readOnly ? undefined : controller.updatePlaceholder}
        onInput={() => {
          controller.clearGeneratedLines();
          controller.clearStructuralUndo();
          controller.ensureEditorLine();
          controller.scheduleContentSync();
          controller.updatePlaceholder();
          controller.updatePickers();
        }}
        onPaste={readOnly ? undefined : controller.onPaste}
        onContextMenu={(event) => {
          const mention = (event.target as HTMLElement).closest<HTMLElement>("[data-mention-id]");
          const id = mention?.dataset.mentionId;
          const target = id ? nodes.find((item) => item.id === id) : null;
          if (target?.type === "imagen") {
            event.preventDefault();
            event.stopPropagation();
            if (mention?.dataset.mentionMode === "full") {
              controller.setLineActionBlock(mention);
            }
            setImageContextMenu({
              id: target.id,
              mode: mention?.dataset.mentionMode === "full" ? "full" : "inserted",
              top: event.clientY,
              left: event.clientX,
            });
          }
        }}
        onMouseMove={readOnly ? undefined : controller.updateLineControl}
        onMouseLeave={(event) => {
          const related = event.relatedTarget;
          if (
            !(related instanceof Element) ||
            !related.closest(
              "[data-line-control], [data-line-gutter], [data-picker]",
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
          if (!readOnly && clickedBlock && clickedBlock.matches("p, h1, h2, h3, h4, blockquote, li, [data-page-index]")) {
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
        onBlur={() => {
          if (!readOnly && controller.ensureEditorLine()) {
            controller.syncContent();
          }
          controller.syncContent();
          controller.updatePlaceholder();
          if (document.visibilityState === "hidden" || !document.hasFocus()) {
            return;
          }
          controller.dismissEditorMenus();
        }}
        onPointerDown={readOnly ? undefined : controller.onEditorPointerDown}
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
              title={hasAlignableImage(controller.lineActionBlock) || controller.selectedLineBlocks.some((block) => hasAlignableImage(block)) ? "OPCIONES DE IMAGEN" : "COMANDOS BÁSICOS"}
              position={blockTextDevTree.root?.position ?? controller.pickerPosition ?? { top: 120, left: 120 }}
              items={hasAlignableImage(controller.lineActionBlock) || controller.selectedLineBlocks.some((block) => hasAlignableImage(block)) ? [] : controller.slashCandidates.map((item) => ({
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
                showImageActions={hasAlignableImage(controller.lineActionBlock) || controller.selectedLineBlocks.some((block) => hasAlignableImage(block))}
                onAlignImage={controller.alignImage}
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
            showImageActions={hasAlignableImage(controller.lineActionBlock)}
            onAlignImage={controller.alignImage}
          />
        )}
      {controller.pickerPosition &&
        controller.callPicker &&
        !imageMentionChoice &&
        controller.callCandidates.length > 0 && (
          <PickerMenu
            title="ENLAZAR A NODO"
            position={controller.pickerPosition}
            items={controller.callCandidates.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            activeIndex={controller.callPickerIndex}
            onSelect={(id) => {
              const target = nodes.find((item) => item.id === id);
              if (target?.type === "imagen") setImageMentionChoice(id);
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
      {imageMentionChoice && controller.pickerPosition && (
        <ImageMentionModeMenu
          position={controller.pickerPosition}
          onSelect={(mode) => {
            controller.executePickerAction("mention", imageMentionChoice, mode);
            setImageMentionChoice(null);
          }}
          onCancel={() => setImageMentionChoice(null)}
        />
      )}
      {imageContextMenu && (
        <ImageMentionContextMenu
          menu={imageContextMenu}
          onView={() => {
            onOpenNodeView(imageContextMenu.id, imageContextMenu.left, imageContextMenu.top);
            setImageContextMenu(null);
          }}
          onAlign={(alignment) => {
            const mention = editorRef.current?.querySelector<HTMLElement>(
              `[data-mention-id="${CSS.escape(imageContextMenu.id)}"]`,
            );
            if (mention && imageContextMenu.mode === "full") {
              const image = mention.querySelector<HTMLImageElement>("img");
              mention.dataset.mentionAlign = alignment;
              mention.style.textAlign = alignment;
              if (image) {
                image.style.marginLeft = alignment === "right" || alignment === "center" ? "auto" : "0";
                image.style.marginRight = alignment === "left" || alignment === "center" ? "auto" : "0";
              }
              controller.syncContent();
            }
            setImageContextMenu(null);
          }}
          onDelete={() => {
            controller.deleteSelectedLine();
            setImageContextMenu(null);
          }}
          onClose={() => setImageContextMenu(null)}
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
            controller.applyTextColor(color);
            closeBlockTextDevTree();
          }}
          onApplyBackground={(color) => {
            controller.applyBlockBackgroundColor(color);
            closeBlockTextDevTree();
          }}
        />
      )}
      </>
    </div>
  );
}

const TEXT_COLOR_SWATCHES = [
  { name: "Predeterminado", value: "" },
  { name: "Gris", value: EDITOR_TEXT_COLORS.grey },
  { name: "Marrón", value: EDITOR_TEXT_COLORS.brown },
  { name: "Naranja", value: EDITOR_TEXT_COLORS.orange },
  { name: "Amarillo", value: EDITOR_TEXT_COLORS.yellow },
  { name: "Ámbar", value: EDITOR_TEXT_COLORS.amber },
  { name: "Verde azulado", value: EDITOR_TEXT_COLORS.teal },
  { name: "Verde", value: EDITOR_TEXT_COLORS.green },
  { name: "Azul", value: EDITOR_TEXT_COLORS.blue },
  { name: "Celeste", value: EDITOR_TEXT_COLORS.ice },
  { name: "Morado", value: EDITOR_TEXT_COLORS.purple },
  { name: "Rosa", value: EDITOR_TEXT_COLORS.pink },
  { name: "Rojo", value: EDITOR_TEXT_COLORS.red },
] as const;

const BLOCK_BACKGROUND_SWATCHES = [
  { name: "Predeterminado", value: "" },
  { name: "Fondo gris", value: EDITOR_BACKGROUND_COLORS.gray },
  { name: "Fondo marrón", value: EDITOR_BACKGROUND_COLORS.brown },
  { name: "Fondo naranja", value: EDITOR_BACKGROUND_COLORS.orange },
  { name: "Fondo amarillo", value: EDITOR_BACKGROUND_COLORS.yellow },
  { name: "Fondo verde", value: EDITOR_BACKGROUND_COLORS.green },
  { name: "Fondo azul", value: EDITOR_BACKGROUND_COLORS.blue },
  { name: "Fondo celeste", value: EDITOR_BACKGROUND_COLORS.ice },
  { name: "Fondo morado", value: EDITOR_BACKGROUND_COLORS.purple },
  { name: "Fondo rosa", value: EDITOR_BACKGROUND_COLORS.pink },
  { name: "Fondo rojo", value: EDITOR_BACKGROUND_COLORS.red },
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
        border: "1px solid #2A2E33",
        borderRadius: "6px",
        boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
        zIndex: 35,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px" }}>
        <div style={{ fontSize: "10px", color: "#5A5F66", letterSpacing: "0.1em" }}>COLORES</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span title="Color actual del texto" style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.25)", background: currentTextColor }} />
          <span title="Fondo actual del texto" style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", border: currentBackgroundColor === "transparent" ? "1px dashed rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.25)", background: currentBackgroundColor === "transparent" ? "transparent" : currentBackgroundColor }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); onClose(); }} style={{ border: "none", background: "transparent", color: "#9AA0A6", cursor: "pointer", fontSize: "11px" }}>Cerrar</button>
        </div>
      </div>
      {recentColors.length > 0 && (
        <div style={{ padding: "0 0 8px" }}>
          <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>USADO RECIENTEMENTE</div>
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
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>COLORES DE TEXTO</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {TEXT_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              onMouseDown={(event) => { event.preventDefault(); applyTextColor(swatch.value); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "5px 6px",
                border: "1px solid transparent",
                borderRadius: "6px",
                background: "transparent",
                color: "#E8E9EA",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease",
              }}
              onMouseEnter={(event) => {
                const target = event.currentTarget;
                target.style.background = "rgba(255,255,255,0.04)";
                target.style.borderColor = "rgba(77,216,192,0.45)";
                target.style.transform = "translateX(1px)";
              }}
              onMouseLeave={(event) => {
                const target = event.currentTarget;
                target.style.background = "transparent";
                target.style.borderColor = "transparent";
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
              <span style={{ fontSize: "11px", flex: 1 }}>{swatch.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #2A2E33", paddingTop: "8px" }}>
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>PERSONALIZADO</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="text" value={customTextColor} onChange={(event) => setCustomTextColor(event.target.value)} placeholder="#AABBCC" style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "1px solid #3A3F45", borderRadius: "4px", background: "#121417", color: "#E8E9EA", fontSize: "11px" }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); applyTextColor(customTextColor); }} style={{ padding: "6px 8px", border: "1px solid #3A3F45", borderRadius: "4px", background: "#20262B", color: "#E8E9EA", cursor: "pointer", fontSize: "11px" }}>OK</button>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #2A2E33", paddingTop: "8px", marginTop: "8px" }}>
        <div style={{ fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em", padding: "0 4px 4px" }}>FONDO DE TEXTO</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {BLOCK_BACKGROUND_SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              onMouseDown={(event) => { event.preventDefault(); onApplyBackground(swatch.value); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "5px 6px",
                border: "1px solid transparent",
                borderRadius: "6px",
                background: "transparent",
                color: "#E8E9EA",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease",
              }}
              onMouseEnter={(event) => {
                const target = event.currentTarget;
                target.style.background = "rgba(255,255,255,0.04)";
                target.style.borderColor = "rgba(77,216,192,0.45)";
                target.style.transform = "translateX(1px)";
              }}
              onMouseLeave={(event) => {
                const target = event.currentTarget;
                target.style.background = "transparent";
                target.style.borderColor = "transparent";
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
              <span style={{ fontSize: "11px", flex: 1 }}>{swatch.name}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px" }}>
          <input type="text" value={customBackgroundColor} onChange={(event) => setCustomBackgroundColor(event.target.value)} placeholder="#D9E8FF" style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "1px solid #3A3F45", borderRadius: "4px", background: "#121417", color: "#E8E9EA", fontSize: "11px" }} />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); const cleaned = normalizeHexColor(customBackgroundColor); if (cleaned) onApplyBackground(cleaned); }} style={{ padding: "6px 8px", border: "1px solid #3A3F45", borderRadius: "4px", background: "#20262B", color: "#E8E9EA", cursor: "pointer", fontSize: "11px" }}>OK</button>
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
    { command: "bold" as const, label: "B", title: "Negrita" },
    { command: "italic" as const, label: "I", title: "Cursiva" },
    { command: "underline" as const, label: "U", title: "Subrayado" },
    { command: "strikeThrough" as const, label: "S", title: "Tachado" },
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
        border: "1px solid #343940",
        borderRadius: "5px",
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
        title="Color"
        onMouseDown={(event) => {
          event.preventDefault();
          setColorMenuOpen((value) => !value);
        }}
        style={{
          width: "30px",
          height: "30px",
          border: "none",
          borderRadius: "4px",
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
            border: "1px solid #2A2E33",
            borderRadius: "6px",
            boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
            zIndex: 35,
          }}
        >
          <div style={{ padding: "4px 8px 6px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>MUESTRAS</div>
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
                title={swatch.name}
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
          <div style={{ borderTop: "1px solid #2A2E33", margin: "8px 0 6px", paddingTop: "8px" }}>
            <div style={{ padding: "0 8px 4px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>PERSONALIZADO</div>
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
                  border: "1px solid #3A3F45",
                  borderRadius: "4px",
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
                  border: "1px solid #3A3F45",
                  borderRadius: "4px",
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
          <div style={{ borderTop: "1px solid #2A2E33", margin: "8px 0 6px", paddingTop: "8px" }}>
            <div style={{ padding: "0 8px 4px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.12em" }}>COLOR DE FONDO</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "6px", padding: "0 4px" }}>
              {BLOCK_BACKGROUND_SWATCHES.map((swatch) => (
                <button
                  key={swatch.name}
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
                  title={swatch.name}
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
                  border: "1px solid #3A3F45",
                  borderRadius: "4px",
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
                  border: "1px solid #3A3F45",
                  borderRadius: "4px",
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
  return (
    <div
      data-picker="true"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        minWidth: "240px",
        padding: "8px",
        background: "#1A1D21",
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
        zIndex: 21,
      }}
    >
      <div style={{ padding: "4px 8px 8px", fontSize: "10px", color: "#5A5F66", letterSpacing: "0.1em" }}>
        TIPO DE NODO IMAGEN
      </div>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onSelect("inserted"); }} style={mentionModeButtonStyle}>
        <strong>Insertado</strong>
        <small>Miniatura dentro de la línea</small>
      </button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onSelect("full"); }} style={mentionModeButtonStyle}>
        <strong>Completo</strong>
        <small>Imagen real ajustada al editor</small>
      </button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onCancel(); }} style={{ ...mentionModeButtonStyle, color: "#7A7F87" }}>
        Cancelar
      </button>
    </div>
  );
}

function ImageMentionContextMenu({
  menu,
  onView,
  onAlign,
  onDelete,
  onClose,
}: {
  menu: { mode: "inserted" | "full"; top: number; left: number };
  onView: () => void;
  onAlign: (alignment: "left" | "center" | "right") => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      data-picker="true"
      data-image-context-menu="true"
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        top: menu.top,
        left: menu.left,
        minWidth: "190px",
        padding: "4px",
        background: "#1A1D21",
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
        zIndex: 22,
      }}
    >
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onView(); }} style={mentionContextButtonStyle}>
        Vista
      </button>
      <div style={{ borderTop: "1px solid #2A2E33", margin: "4px 0" }} />
      <div style={{ padding: "5px 8px 3px", fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em" }}>
        ALINEACIÓN
      </div>
      {(["left", "center", "right"] as const).map((alignment) => (
        <button
          key={alignment}
          type="button"
          disabled={menu.mode !== "full"}
          title={menu.mode === "full" ? undefined : "Disponible solo para imágenes completas"}
          onMouseDown={(event) => { event.preventDefault(); onAlign(alignment); }}
          style={{ ...mentionContextButtonStyle, opacity: menu.mode === "full" ? 1 : 0.4, cursor: menu.mode === "full" ? "pointer" : "not-allowed" }}
        >
          {alignment === "left" ? "Izquierda" : alignment === "center" ? "Centro" : "Derecha"}
        </button>
      ))}
      <div style={{ borderTop: "1px solid #2A2E33", margin: "4px 0" }} />
      <button
        type="button"
        disabled={menu.mode !== "full"}
        title={menu.mode === "full" ? undefined : "Disponible solo para imágenes completas"}
        onMouseDown={(event) => { event.preventDefault(); onDelete(); }}
        style={{ ...mentionContextButtonStyle, color: "#D84D4D", opacity: menu.mode === "full" ? 1 : 0.4, cursor: menu.mode === "full" ? "pointer" : "not-allowed" }}
      >
        Eliminar bloque
      </button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onClose(); }} style={{ ...mentionContextButtonStyle, color: "#7A7F87" }}>
        Cerrar
      </button>
    </div>
  );
}

const mentionContextButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 8px",
  border: "none",
  borderRadius: "3px",
  background: "transparent",
  color: "#E8E9EA",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "11px",
};

const mentionModeButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "3px",
  width: "100%",
  padding: "8px",
  border: "none",
  borderRadius: "3px",
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
  showImageActions = false,
  onAlignImage,
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
  showImageActions?: boolean;
  onAlignImage?: (alignment: "left" | "center" | "right") => void;
}) {
  const categories = items.reduce<Record<string, typeof items>>((groups, item) => {
    const category = item.category || "Otros";
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
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
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
                  target.style.borderColor = "rgba(77,216,192,0.45)";
                  target.style.transform = "translateX(1px)";
                }}
                onMouseLeave={(event) => {
                  const target = event.currentTarget;
                  target.style.background = itemIndex === activeIndex ? "#252B2D" : "transparent";
                  target.style.borderColor = "transparent";
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
                  border: "1px solid transparent",
                  borderRadius: "3px",
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
                    border: "1px solid #2A2E33",
                    borderRadius: "3px",
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
      {showImageActions && onAlignImage && (
        <div style={{ borderTop: "1px solid #2A2E33", marginTop: "4px", paddingTop: "4px" }}>
          <div style={{ padding: "7px 8px 3px", fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em" }}>IMAGEN</div>
          <div style={{ padding: "0 8px 4px", fontSize: "11px", color: "#E8E9EA" }}>Alinear</div>
          <div style={{ display: "flex", gap: "4px", padding: "0 4px 4px" }}>
            {(["left", "center", "right"] as const).map((alignment) => (
              <button
                key={alignment}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onAlignImage(alignment);
                }}
                style={{ flex: 1, padding: "5px 3px", border: "1px solid #343940", borderRadius: "3px", background: "transparent", color: "#E8E9EA", cursor: "pointer", fontSize: "11px" }}
              >
                {alignment === "left" ? "Izquierda" : alignment === "center" ? "Centro" : "Derecha"}
              </button>
            ))}
          </div>
        </div>
      )}
      {showDeleteLine && onDeleteLine && (
        <button
          type="button"
          onMouseEnter={(event) => {
            const target = event.currentTarget;
            target.style.background = "rgba(255,255,255,0.04)";
            target.style.borderColor = "rgba(77,216,192,0.45)";
            target.style.transform = "translateX(1px)";
          }}
          onMouseLeave={(event) => {
            const target = event.currentTarget;
            target.style.background = "transparent";
            target.style.borderColor = "transparent";
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
            border: "1px solid transparent",
            borderTop: "1px solid #2A2E33",
            background: "transparent",
            color: "#D87878",
            textAlign: "left",
            cursor: "pointer",
            borderRadius: "3px",
            transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease",
          }}
        >
          Eliminar línea de texto
        </button>
      )}
    </div>
  );
}

function LineActionMenu({
  position,
  onDeleteLine,
  showImageActions = false,
  onAlignImage,
}: {
  position: { top: number; left: number };
  onDeleteLine: () => void;
  showImageActions?: boolean;
  onAlignImage?: (alignment: "left" | "center" | "right") => void;
}) {
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
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
        zIndex: 20,
      }}
    >
      {showImageActions && onAlignImage && (
        <>
          <div style={{ padding: "7px 8px 3px", fontSize: "9px", color: "#5A5F66", letterSpacing: "0.1em" }}>IMAGEN</div>
          <div style={{ padding: "0 8px 4px", fontSize: "11px", color: "#E8E9EA" }}>Alinear</div>
          <div style={{ display: "flex", gap: "4px", padding: "0 4px 4px" }}>
            {(["left", "center", "right"] as const).map((alignment) => (
              <button
                key={alignment}
                type="button"
                onMouseEnter={(event) => {
                  const target = event.currentTarget;
                  target.style.background = "rgba(255,255,255,0.04)";
                  target.style.borderColor = "rgba(77,216,192,0.45)";
                  target.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(event) => {
                  const target = event.currentTarget;
                  target.style.background = "transparent";
                  target.style.borderColor = "#343940";
                  target.style.transform = "translateY(0)";
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onAlignImage(alignment);
                }}
                style={{ flex: 1, padding: "5px 3px", border: "1px solid #343940", borderRadius: "3px", background: "transparent", color: "#E8E9EA", cursor: "pointer", fontSize: "11px", transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease" }}
              >
                {alignment === "left" ? "Izquierda" : alignment === "center" ? "Centro" : "Derecha"}
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #2A2E33", margin: "4px 0" }} />
        </>
      )}
      <button
        type="button"
        onMouseEnter={(event) => {
          const target = event.currentTarget;
          target.style.background = "rgba(255,255,255,0.04)";
          target.style.borderColor = "rgba(77,216,192,0.45)";
          target.style.transform = "translateX(1px)";
        }}
        onMouseLeave={(event) => {
          const target = event.currentTarget;
          target.style.background = "transparent";
          target.style.borderColor = "transparent";
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
          border: "1px solid transparent",
          background: "transparent",
          color: "#D87878",
          textAlign: "left",
          cursor: "pointer",
          borderRadius: "3px",
          transition: "background 0.12s ease, border-color 0.12s ease, transform 0.12s ease",
        }}
      >
        Eliminar línea de texto
      </button>
    </div>
  );
}
