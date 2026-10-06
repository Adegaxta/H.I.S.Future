import { applyDomImagePresentation } from "../utils/domImagePresentation";
import { useCallback, useLayoutEffect } from "react";
import type {
  Dispatch,
  PointerEvent,
  MouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { NodeItem } from "../types/nodes";
import {
  clampEditorImageWidth,
  ensureEditorImageBlockId,
  getEditorImageMaxWidth,
  isResizableEditorImage,
} from "./imageResize";
import { dynamicIconImports } from "lucide-react/dynamic.mjs";
import { resolveNodeCustomVisual, useNodeCustomVisuals } from "../nodes/nodeIconSource";
import type { ResolvedNodeVisual } from "../nodes/visuals/types";
import { IMAGE_PLACEHOLDER_ATTRIBUTE } from "../utils/imageRuntimeResolver";

type LucideIconData = {
  size?: number;
  node?: Array<[string, Record<string, string | number>]>;
};

const toSvgAttribute = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const mentionVisualSignatures = new WeakMap<HTMLElement, string>();

function ensureMentionLabel(mention: HTMLElement): HTMLElement | null {
  const existing = mention.querySelector<HTMLElement>(":scope > .editor-mention__label");
  if (existing) return existing;
  const content = Array.from(mention.childNodes).filter((node) =>
    !(node instanceof Element && node.matches("[data-mention-node-visual], .editor-mention__icon, .editor-mention__node-icon, .node-visual")),
  );
  if (!content.length) return null;
  const label = document.createElement("span");
  label.className = "editor-mention__label";
  content.forEach((node) => label.appendChild(node));
  mention.appendChild(label);
  return label;
}

function renderLucideVisual(host: HTMLElement, name: string): void {
  const loader = (dynamicIconImports as Record<string, (() => Promise<unknown>) | undefined>)[name];
  if (!loader) return;
  void loader().then((module) => {
    if (!host.parentElement) return;
    const data = (module as { __iconData?: LucideIconData }).__iconData;
    if (!data?.node) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${data.size ?? 24} ${data.size ?? 24}`);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    data.node.forEach(([tag, attributes]) => {
      const child = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attributes).forEach(([attribute, value]) => {
        if (attribute !== "key") child.setAttribute(toSvgAttribute(attribute), String(value));
      });
      svg.appendChild(child);
    });
    host.replaceChildren(svg);
  }).catch(() => undefined);
}

function createMentionVisual(visual: ResolvedNodeVisual | undefined, type: NodeItem["type"]): HTMLElement {
  let icon: HTMLElement;
  if (visual?.kind === "image") {
    const image = document.createElement("img");
    image.src = visual.src;
    image.alt = "";
    icon = image;
  } else {
    const span = document.createElement("span");
    if (visual?.kind === "emoji") {
      span.textContent = visual.value;
      span.classList.add("node-visual", "node-visual--emoji", `node-visual--${visual.style}`);
    } else if (visual?.kind === "icon" && visual.provider === "material-symbols") {
      span.textContent = visual.name;
      span.classList.add("material-symbols-rounded", "node-visual", "node-visual--material-symbols");
    } else if (visual?.kind === "icon") {
      span.classList.add("node-visual", "node-visual--lucide");
      renderLucideVisual(span, visual.name);
    } else {
      span.classList.add("sidebar-icon", "node-type-icon", `node-type-icon--${type}`);
    }
    icon = span;
  }
  if (icon instanceof HTMLImageElement) {
    const wrapper = document.createElement("span");
    wrapper.appendChild(icon);
    icon = wrapper;
  }
  icon.classList.add("editor-mention__visual", "editor-mention__node-icon");
  icon.dataset.mentionNodeVisual = "true";
  icon.dataset.editorUi = "true";
  icon.dataset.noResize = "true";
  icon.setAttribute("aria-hidden", "true");
  if (visual?.kind === "image" && visual.presentation) {
    icon.classList.add("his-presented-image");
    const image = icon.querySelector<HTMLImageElement>("img");
    if (image) applyDomImagePresentation(image, visual.presentation);
  }
  return icon;
}

function syncMentionVisual(mention: HTMLElement, target: NodeItem, nodes: readonly NodeItem[], resolvedVisual?: ResolvedNodeVisual): void {
  if (target.type === "imagen") return;
  const visual = resolvedVisual ?? resolveNodeCustomVisual(target, nodes);
  const signature = JSON.stringify([target.type, visual ?? null]);
  const hasVisual = Boolean(mention.querySelector(":scope > [data-mention-node-visual]"));
  if (mentionVisualSignatures.get(mention) === signature && hasVisual) return;
  Array.from(mention.children).forEach((child) => {
    if (child.matches("[data-mention-node-visual], .editor-mention__icon, .editor-mention__node-icon, .node-visual")) child.remove();
  });
  const label = ensureMentionLabel(mention);
  // Every node mention owns a real node icon. The fallback comes from the node
  // type, while a custom visual replaces it without changing stored text.
  mention.insertBefore(createMentionVisual(visual, target.type), label ?? mention.firstChild);
  mentionVisualSignatures.set(mention, signature);
}

interface UseEditorMentionsOptions {
  activeNodeId: string;
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
    blockId: string;
    blockIdCreated: boolean;
  } | null>;
  controls: {
    clearBlockControls: () => void;
  };
  captureStructuralUndo: () => void;
}

export function useEditorMentions({
  activeNodeId,
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
  const customVisuals = useNodeCustomVisuals(nodes);
  const createMention = useCallback((target: NodeItem, imageMode: "inserted" | "full" = "inserted") => {
    const mention = document.createElement("span");
    mention.contentEditable = "false";
    mention.className = "editor-mention";
    mention.dataset.mentionId = target.id;
    mention.dataset.noResize = "true";
    mention.title = target.name;
    mention.setAttribute("aria-label", target.name);
    if (target.type === "imagen") mention.dataset.mentionMode = imageMode;
    if (deletedNodes.some((item) => item.id === target.id)) {
      mention.dataset.deletedMention = "true";
    }

    if (target.type === "pagina") {
      mention.appendChild(document.createTextNode(target.name));
      syncMentionVisual(mention, target, nodes, customVisuals.get(target.id));
      return mention;
    }

    if (target.type === "imagen") {
      const image = document.createElement("img");
      image.setAttribute(IMAGE_PLACEHOLDER_ATTRIBUTE, "true");
      image.alt = target.name;
      if (imageMode === "inserted") image.className = "editor-mention__icon";
      image.dataset.noResize = "true";
      if (imageMode === "full") ensureEditorImageBlockId(image);
      mention.appendChild(image);
      if (imageMode === "inserted") {
        mention.appendChild(document.createTextNode(target.name));
        ensureMentionLabel(mention);
      }
      return mention;
    }

    mention.appendChild(document.createTextNode(target.name));
    syncMentionVisual(mention, target, nodes, customVisuals.get(target.id));
    return mention;
  }, [customVisuals, deletedNodes, nodes]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const targets = new Map(nodes.map((target) => [target.id, target]));
    const hydrate = () => {
      editor.querySelectorAll<HTMLElement>("[data-mention-id]").forEach((mention) => {
        const target = targets.get(mention.dataset.mentionId ?? "");
        if (!target || target.type === "imagen") return;
        ensureMentionLabel(mention);
        syncMentionVisual(mention, target, nodes, customVisuals.get(target.id));
      });
    };
    // Content loads before this layout effect, so icons exist before painting.
    hydrate();
    // Undo and paste can restore persisted HTML without its runtime visuals.
    const observer = new MutationObserver(hydrate);
    observer.observe(editor, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeNodeId, customVisuals, editorRef, nodes]);

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

  const onMentionPointerDown = useCallback((event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
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
    if (event.button !== 2 && image && isResizableEditorImage(image) && editorRef.current?.contains(image)) {
      event.preventDefault();
      event.stopPropagation();
      const identity = ensureEditorImageBlockId(image, editorRef.current);
      imageResizeRef.current = {
        image,
        startX: event.clientX,
        startWidth: image.getBoundingClientRect().width,
        blockId: identity.blockId,
        blockIdCreated: identity.created,
      };
      document.body.style.cursor = "ew-resize";
      return;
    }
    if (target.closest("[data-mention-id]") || target.closest(".editor-mention") || target.closest("[data-no-resize='true']")) {
      if (target.closest("[data-mention-id]")) onMentionPointerDown(event);
      // Atomic Calls navigate on press; ordinary text keeps native gestures.
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

    if (image && !isResizableEditorImage(image)) {
      if (imageResizeRef.current && imageResizeRef.current.image === image) {
        imageResizeRef.current = null;
        document.body.style.cursor = "default";
      }
      return;
    }

    onMentionPointerDown(event);
  }, [editorRef, imageResizeRef, onMentionPointerDown]);

  const alignImage = useCallback((alignment: "left" | "center" | "right") => {
    const selected = selectedLineBlocks.filter((line) => line.isConnected);
    const blocks = selected.includes(lineActionBlock!)
      ? selected
      : lineActionBlock
        ? [lineActionBlock]
        : [];
    const imageBlocks = blocks.filter((block) =>
      Array.from(block.querySelectorAll<HTMLImageElement>("img")).some(isResizableEditorImage),
    );
    if (!imageBlocks.length) return;
    captureStructuralUndo();
    imageBlocks.forEach((block) => {
      const fullMentions = Array.from(
        block.matches('[data-mention-id][data-mention-mode="full"]')
          ? [block]
          : block.querySelectorAll<HTMLElement>('[data-mention-id][data-mention-mode="full"]'),
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
    if (!isResizableEditorImage(resize.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const width = clampEditorImageWidth(
      resize.startWidth + event.clientX - resize.startX,
      getEditorImageMaxWidth(resize.image, editor),
    );
    resize.image.style.width = `${width}px`;
    resize.image.style.maxWidth = "100%";
    return;
  }, [editorRef, imageResizeRef]);

  const onEditorPointerUp = useCallback(() => {
    if (!imageResizeRef.current) return;
    if (!isResizableEditorImage(imageResizeRef.current.image)) {
      imageResizeRef.current = null;
      document.body.style.cursor = "default";
      return;
    }
    imageResizeRef.current = null;
    document.body.style.cursor = "default";
    syncContent();
  }, [imageResizeRef, syncContent]);

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
  };
}
