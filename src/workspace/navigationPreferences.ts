export const DEFAULT_SIDEBAR_WIDTH = 350;
export const MIN_SIDEBAR_WIDTH = 280;
export const MAX_SIDEBAR_WIDTH = 440;

export const loreExpansionStorageKey = (projectKey: string) =>
  `hisfuture.project.lore-expansion.${projectKey}`;

export const sidebarWidthStorageKey = (projectKey: string) =>
  `hisfuture.project.sidebar-width.${projectKey}`;

export function parseLoreExpansion(value: string | null): Record<string, boolean> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, expanded]) => Boolean(id) && expanded === true),
    );
  } catch {
    return {};
  }
}

export function serializeLoreExpansion(expanded: Record<string, boolean>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(expanded).filter(([id, isExpanded]) => Boolean(id) && isExpanded),
  ));
}

export function parseSidebarWidth(value: string | null, fallback = DEFAULT_SIDEBAR_WIDTH): number {
  const parsed = Number(value);
  const width = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}
