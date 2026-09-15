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
    if (!Number.isFinite(width) || width! < 40) return;
    image.style.width = `${width}px`;
    image.style.maxWidth = "none";
  });
}
