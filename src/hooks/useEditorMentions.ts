import { useCallback } from "react";
import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { NodeItem } from "../types/nodes";
import { getNodeDefinition } from "../defs/nodeTypes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { getPageMeta } from "../utils/pageMeta";

interface UseEditorMentionsOptions {
  editorRef: RefObject<HTMLDivElement | null>;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  selectedLineBlocks: HTMLElement[];
  lineActionBlock: HTMLElement | null;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedId: (id: string) => void;
  onOpenDeletedNode: (id: string) => void;
  setFocusedNodeId: Dispatch<SetStateAction<string | null>>;
  syncContent: () => void;
  imageResizeRef: React.MutableRefObject<{
    image: HTMLImageElement;
    startX: number;
    startWidth: number;
  } | null>;
  controls: {
    clearBlockControls: () => void;
  };
  captureStructuralUndo: () => void;
}

export function useEditorMentions({
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
}: UseEditorMentionsOptions) {
  const isMentionImage = useCallback((element: HTMLElement | null) => {
    if (!element) return false;
    const mention = element.closest<HTMLElement>("[data-mention-id]");
    if (mention) return mention.dataset.mentionMode !== "full";
    return Boolean(
      element.closest(".editor-mention") ||
      element.classList.contains("editor-mention__icon"),
    );
  }, []);

  const createMention = useCallback((target: NodeItem, imageMode: "inserted" | "full" = "inserted") => {
    const mention = document.createElement("span");
    mention.contentEditable = "false";
    mention.className = "editor-mention";
    mention.dataset.mentionId = target.id;
    mention.dataset.noResize = "true";
    mention.title = target.name;
    mention.setAttribute("aria-label", target.name);
    if (target.type === "imagen") mention.dataset.mentionMode = imageMode;
    mention.style.color = getNodeDefinition(
      getEffectiveNodeType(nodes, target),
    ).color;
    if (deletedNodes.some((item) => item.id === target.id)) {
      mention.style.color = "#D84D4D";
      mention.style.opacity = "0.6";
    }
    mention.style.textDecoration = "underline";
    mention.style.textUnderlineOffset = "3px";
    mention.style.cursor = "pointer";
    mention.style.gap = "0.35em";

    if (target.type === "pagina") {
      const pageMeta = getPageMeta(target.content);
      const iconNode = pageMeta.iconNodeId ? nodes.find((item) => item.id === pageMeta.iconNodeId) : null;
      const source = iconNode ? new DOMParser().parseFromString(iconNode.content, "text/html").querySelector("img")?.getAttribute("src") : null;
      if (source) {
        const icon = document.createElement("img");
        icon.src = source;
        icon.alt = target.name;
        icon.className = "editor-mention__icon";
        icon.dataset.noResize = "true";
        mention.appendChild(icon);
      }
      mention.appendChild(document.createTextNode(target.name));
      return mention;
    }

    if (target.type === "imagen") {
      const source = new DOMParser().parseFromString(target.content, "text/html").querySelector("img")?.getAttribute("src");
      if (source) {
        const image = document.createElement("img");
        image.src = source;
        image.alt = target.name;
        image.dataset.noResize = "true";
        mention.appendChild(image);
      } else mention.textContent = target.name;
      return mention;
    }

    mention.textContent = target.name;
    return mention;
  }, [deletedNodes, nodes]);

  const getAdjacentRangeCharacter = useCallback((range: Range, side: "left" | "right") => {
    const container = range.startContainer;
    const offset = range.startOffset;

    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || "";
      if (side === "left") {
        return offset > 0 ? text[offset - 1] ?? null : null;
      }
      return offset < text.length ? text[offset] ?? null : null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const children = Array.from(container.childNodes);
      if (side === "left") {
        const previous = children[Math.max(0, offset - 1)] ?? null;
        if (!previous) return null;
        if (previous.textContent) return previous.textContent.slice(-1) || null;
        return null;
      }
      const next = children[Math.min(children.length - 1, offset)] ?? null;
      if (!next) return null;
      if (next.textContent) return next.textContent.charAt(0) || null;
      return null;
    }

    return null;
  }, []);

  const insertMentionWithSpacing = useCallback((range: Range, mention: HTMLElement) => {
    const beforeChar = getAdjacentRangeCharacter(range, "left");
    const afterChar = getAdjacentRangeCharacter(range, "right");
    const needsBeforeSpace = Boolean(beforeChar && !/\s/.test(beforeChar));
    const needsAfterSpace = !(afterChar && /[.,;:!?)\]}]/.test(afterChar)) && Boolean(afterChar && !/\s/.test(afterChar));

    if (needsBeforeSpace) {
      const before = document.createTextNode(" ");
      range.insertNode(before);
      range.setStartAfter(before);
      range.collapse(true);
    }

    range.insertNode(mention);
    range.setStartAfter(mention);
    range.collapse(true);

    if (needsAfterSpace) {
      const after = document.createTextNode(" ");
      range.insertNode(after);
      range.setStartAfter(after);
      range.collapse(true);
    }
  }, [getAdjacentRangeCharacter]);

  const insertNodeReference = useCallback((target: NodeItem, x: number, y: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const point = document.caretRangeFromPoint?.(x, y);
    const range = point || document.createRange();
    if (!point) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const mention = createMention(target);
    range.deleteContents();
    insertMentionWithSpacing(range, mention);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    syncContent();
    controls.clearBlockControls();
  }, [controls, createMention, editorRef, insertMentionWithSpacing, syncContent]);

  const insertNodeMention = useCallback((nodeId: string, x: number, y: number) => {
    const target = nodes.find((item) => item.id === nodeId);
    if (target) insertNodeReference(target, x, y);
  }, [insertNodeReference, nodes]);

  const onMentionPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-mention-id]",
    );
    const id = target?.dataset.mentionId;
    const mentioned = nodes.find((item) => item.id === id);
    const deletedMention = deletedNodes.find((item) => item.id === id);
    if (!id || (!mentioned && !deletedMention)) return;
    event.stopPropagation();
    if (deletedMention) {
      onOpenDeletedNode(deletedMention.id);
      return;
    }
    if (mentioned?.type === "imagen") return;
    const expanded: Record<string, boolean> = {};
    let current: NodeItem | undefined = mentioned;
    while (current?.parentId) {
      expanded[current.parentId] = true;
      current = nodes.find((item) => item.id === current?.parentId);
    }
    setExpanded((value) => ({ ...value, ...expanded }));
    setFocusedNodeId(id);
    if (mentioned) setSelectedId(id);
  }, [deletedNodes, nodes, onOpenDeletedNode, setExpanded, setFocusedNodeId, setSelectedId]);

  const onEditorPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const image = target.closest<HTMLImageElement>("img");
    const fullImageMention = image?.closest<HTMLElement>(
      '[data-mention-id][data-mention-mode="full"]',
    );
    if (event.button !== 2 && image && fullImageMention && editorRef.current?.contains(image)) {
      event.preventDefault();
      event.stopPropagation();
      imageResizeRef.current = {
        image,
        startX: event.clientX,
        startWidth: image.getBoundingClientRect().width,
      };
      document.body.style.cursor = "ew-resize";
      return;
    }
    if (target.closest("[data-mention-id]") || target.closest(".editor-mention") || target.closest("[data-no-resize='true']")) {
      if (target.closest("[data-mention-id]")) {
        onMentionPointerDown(event);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target.closest("[data-globe-icon]")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target.closest("[data-page-index-item]")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target.closest("[data-page-index]")) {
      event.stopPropagation();
    }

    const isMentionResizeDisabled = isMentionImage(image);
    if (isMentionResizeDisabled) {
      if (imageResizeRef.current && imageResizeRef.current.image === image) {
        imageResizeRef.current = null;
        document.body.style.cursor = "default";
      }
      return;
    }
    if (event.button !== 2 && image && editorRef.current?.contains(image)) {
      event.preventDefault();
      event.stopPropagation();
      imageResizeRef.current = {
        image,
        startX: event.clientX,
        startWidth: image.getBoundingClientRect().width,
      };
      document.body.style.cursor = "ew-resize";
      return;
    }

    onMentionPointerDown(event);
  }, [editorRef, imageResizeRef, isMentionImage, onMentionPointerDown]);

  const alignImage = useCallback((alignment: "left" | "center" | "right") => {
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const blocks = selected.includes(lineActionBlock!)
      ? selected
      : lineActionBlock
        ? [lineActionBlock]
        : [];
    const imageBlocks = blocks.filter((block) =>
      Array.from(block.querySelectorAll("img")).some((image) => {
        if (image.closest("[data-globe-icon]")) return false;
        const mention = image.closest<HTMLElement>("[data-mention-id]");
        return !mention || mention.dataset.mentionMode === "full";
      }),
    );
    if (!imageBlocks.length) return;
    captureStructuralUndo();
    imageBlocks.forEach((block) => {
      const fullMentions = Array.from(
        block.querySelectorAll<HTMLElement>('[data-mention-id][data-mention-mode="full"]'),
      );
      if (fullMentions.length) {
        fullMentions.forEach((mention) => {
          mention.dataset.mentionAlign = alignment;
          const image = mention.querySelector<HTMLImageElement>("img");
          if (!image) return;
          image.style.marginLeft = alignment === "right" || alignment === "center" ? "auto" : "0";
          image.style.marginRight = alignment === "left" || alignment === "center" ? "auto" : "0";
        });
      } else {
        block.style.textAlign = alignment;
      }
    });
    syncContent();
  }, [captureStructuralUndo, lineActionBlock, selectedLineBlocks, syncContent]);

  const onEditorPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const resize = imageResizeRef.current;
    if (!resize) return;
    if (isMentionImage(resize.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    event.preventDefault();
    const width = Math.max(40, resize.startWidth + event.clientX - resize.startX);
    resize.image.style.width = `${width}px`;
    resize.image.style.maxWidth = "none";
    return;
  }, [imageResizeRef, isMentionImage]);

  const onEditorPointerUp = useCallback(() => {
    if (!imageResizeRef.current) return;
    if (isMentionImage(imageResizeRef.current.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    syncContent();
  }, [imageResizeRef, isMentionImage, syncContent]);

  return {
    createMention,
    insertMentionWithSpacing,
    insertNodeMention,
    insertNodeReference,
    onMentionPointerDown,
    onEditorPointerDown,
    onEditorPointerMove,
    onEditorPointerUp,
    alignImage,
    isMentionImage,
  };
}
