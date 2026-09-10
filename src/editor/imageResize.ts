export function isResizableEditorImage(image: HTMLImageElement | null): boolean {
  if (!image || image.closest("[data-globe-icon]")) return false;
  const mention = image.closest<HTMLElement>("[data-mention-id]");
  if (mention) return mention.dataset.mentionMode === "full";
  return !image.closest(".editor-mention, [data-no-resize='true']");
}
