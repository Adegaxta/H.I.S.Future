export const EDITOR_STRUCTURAL_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-globe], [data-page-index], [data-mention-id][data-mention-mode="full"]';

// A selectable line never includes the Globe wrapper itself. Its inner lines are
// selected independently, preventing parent/child blocks from being acted on twice.
export const EDITOR_SELECTABLE_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, blockquote, li, [data-divider], [data-page-index], [data-mention-id][data-mention-mode="full"]';

export const EDITOR_NON_EDITABLE_BLOCK_SELECTOR =
  '[data-divider], [data-page-index], [data-mention-id][data-mention-mode="full"]';

export const EDITOR_TRANSIENT_BLOCK_ATTRIBUTES = [
  "data-line-selected",
  "data-line-dragging",
  "data-line-drop-target",
] as const;

export const EDITOR_TRANSIENT_BLOCK_SELECTOR = EDITOR_TRANSIENT_BLOCK_ATTRIBUTES
  .map((attribute) => `[${attribute}]`)
  .join(", ");

export function keepOutermostBlocks<T extends { contains(other: T): boolean }>(
  blocks: readonly T[],
): T[] {
  return blocks.filter((candidate) =>
    !blocks.some((other) => other !== candidate && other.contains(candidate)),
  );
}
