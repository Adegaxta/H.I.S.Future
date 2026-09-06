import { stringifyHtmlMetadata } from "./htmlMetadata";
export interface PageMeta {
  description: string;
  iconNodeId: string | null;
  coverNodeId: string | null;
  hideDescription: boolean;
  blockWidth: number;
  headerPosition: "left" | "center" | "right";
  textPosition: "left" | "center" | "right";
}

const META_PREFIX = "<!--hisfuture-page-meta:";
const META_SUFFIX = "-->";

export const DEFAULT_PAGE_META: PageMeta = {
  description: "",
  iconNodeId: null,
  coverNodeId: null,
  hideDescription: false,
  blockWidth: 200,
  headerPosition: "left",
  textPosition: "center",
};

export function getPageMeta(content: string): PageMeta {
  const start = content.indexOf(META_PREFIX);
  if (start < 0) return { ...DEFAULT_PAGE_META };
  const end = content.indexOf(META_SUFFIX, start + META_PREFIX.length);
  if (end < 0) return { ...DEFAULT_PAGE_META };
  try {
    const parsed = JSON.parse(content.slice(start + META_PREFIX.length, end)) as Partial<PageMeta>;
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      iconNodeId: typeof parsed.iconNodeId === "string" ? parsed.iconNodeId : null,
      coverNodeId: typeof parsed.coverNodeId === "string" ? parsed.coverNodeId : null,
      hideDescription: parsed.hideDescription === true,
      blockWidth: typeof parsed.blockWidth === "number"
        ? Math.min(200, Math.max(100, parsed.blockWidth))
        : DEFAULT_PAGE_META.blockWidth,
      headerPosition: parsed.headerPosition === "center" || parsed.headerPosition === "right"
        ? parsed.headerPosition
        : DEFAULT_PAGE_META.headerPosition,
      textPosition: parsed.textPosition === "left" || parsed.textPosition === "right"
        ? parsed.textPosition
        : DEFAULT_PAGE_META.textPosition,
    };
  } catch {
    return { ...DEFAULT_PAGE_META };
  }
}

export function setPageMeta(content: string, meta: PageMeta): string {
  const serialized = `${META_PREFIX}${stringifyHtmlMetadata(meta)}${META_SUFFIX}`;
  const pattern = /<!--hisfuture-page-meta:[\s\S]*?-->/;
  return pattern.test(content)
    ? content.replace(pattern, () => serialized)
    : `${serialized}${content}`;
}