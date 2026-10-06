export const EDITOR_STRUCTURAL_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, [data-divider], [data-globe], [data-page-index], [data-his-table], [data-mention-id][data-mention-mode="full"]';

// A selectable line never includes the Globe wrapper itself. Its inner lines are
// selected independently, preventing parent/child blocks from being acted on twice.
export const EDITOR_SELECTABLE_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, [data-divider], [data-page-index], [data-mention-id][data-mention-mode="full"]';

export const EDITOR_NON_EDITABLE_BLOCK_SELECTOR =
  '[data-divider], [data-page-index], [data-mention-id][data-mention-mode="full"]';

export const EDITOR_TRANSIENT_BLOCK_ATTRIBUTES = [
  "data-editor-block-identity",
  "data-line-selected",
  "data-line-dragging",
  "data-line-drop-target",
  "data-his-table-active",
  "data-his-table-selected",
  "data-his-table-selection-edge",
  "data-his-table-unit-selected",
  "data-his-table-unit-edge",
  "data-his-table-hovered",
  "data-his-table-resize-edge",
  "data-his-table-resize-dragging",
  "data-his-table-dragging",
  "data-his-table-drop-target",
  "data-mention-selected",
] as const;

export const EDITOR_TRANSIENT_BLOCK_SELECTOR = EDITOR_TRANSIENT_BLOCK_ATTRIBUTES
  .map((attribute) => `[${attribute}]`)
  .join(", ");

export const EDITOR_UI_SELECTOR = "[data-editor-ui]";

export function keepOutermostBlocks<T extends { contains(other: T): boolean }>(
  blocks: readonly T[],
): T[] {
  return blocks.filter((candidate) =>
    !blocks.some((other) => other !== candidate && other.contains(candidate)),
  );
}
