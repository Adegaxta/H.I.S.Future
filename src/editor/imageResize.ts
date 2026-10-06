export function isResizableEditorImage(image: HTMLImageElement | null): boolean {
  if (!image || image.closest("[data-globe-icon]")) return false;
  const mention = image.closest<HTMLElement>("[data-mention-id]");
  if (mention) return mention.dataset.mentionMode === "full";
  return !image.closest(".editor-mention, [data-no-resize='true']");
}

export interface EditorImageLayout {
  nodeId: string;
  blockId: string;
  width: number;
}

const MIN_EDITOR_IMAGE_WIDTH = 40;
const IMAGE_WIDTH_CONTAINER_SELECTOR = "[data-his-table-cell], [data-his-column], [data-globe-content]";

export function clampEditorImageWidth(width: number, maxWidth: number): number {
  const safeWidth = Number.isFinite(width) ? width : MIN_EDITOR_IMAGE_WIDTH;
  const minimum = Math.max(0, Math.min(MIN_EDITOR_IMAGE_WIDTH, maxWidth));
  return Math.max(minimum, Math.min(safeWidth, maxWidth));
}

export function getEditorImageMaxWidth(
  image: HTMLImageElement,
  editor: HTMLElement,
): number {
  const container = image.closest<HTMLElement>(IMAGE_WIDTH_CONTAINER_SELECTOR) ?? editor;
  const style = window.getComputedStyle(container);
  const horizontalInsets = Number.parseFloat(style.paddingLeft)
    + Number.parseFloat(style.paddingRight)
    + Number.parseFloat(style.borderLeftWidth)
    + Number.parseFloat(style.borderRightWidth);
  const measuredWidth = container.getBoundingClientRect().width - horizontalInsets;
  // A detached/hidden editor can briefly measure as zero while a node opens.
  // max-width: 100% remains the final safety net until layout is available.
  return Number.isFinite(measuredWidth) && measuredWidth > 0
    ? measuredWidth
    : Number.POSITIVE_INFINITY;
}

function newBlockId(): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `image-${suffix}`;
}

export function ensureEditorImageBlockId(
  image: HTMLImageElement,
  editor?: HTMLElement | null,
): { blockId: string; created: boolean } {
  const current = image.dataset.blockId?.trim();
  const duplicated = current && editor
    ? Array.from(editor.querySelectorAll<HTMLImageElement>("img[data-block-id]"))
      .some((candidate) => candidate !== image && candidate.dataset.blockId === current)
    : false;
  if (current && !duplicated) return { blockId: current, created: false };
  const blockId = newBlockId();
  image.dataset.blockId = blockId;
  return { blockId, created: true };
}

export function applyEditorImageLayouts(editor: HTMLElement, layouts: EditorImageLayout[]): void {
  const widths = new Map(layouts.map((layout) => [layout.blockId, layout.width]));
  editor.querySelectorAll<HTMLImageElement>("img[data-block-id]").forEach((image) => {
    const width = widths.get(image.dataset.blockId || "");
    if (!Number.isFinite(width) || width! < MIN_EDITOR_IMAGE_WIDTH) return;
    const clampedWidth = clampEditorImageWidth(width!, getEditorImageMaxWidth(image, editor));
    image.style.width = `${clampedWidth}px`;
    image.style.maxWidth = "100%";
  });
}
