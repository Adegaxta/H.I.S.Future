export interface PageMeta {
  description: string;
  iconNodeId: string | null;
  coverNodeId: string | null;
  hideDescription: boolean;
}

const META_PREFIX = "<!--hisfuture-page-meta:";
const META_SUFFIX = "-->";

export const DEFAULT_PAGE_META: PageMeta = {
  description: "",
  iconNodeId: null,
  coverNodeId: null,
  hideDescription: false,
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
    };
  } catch {
    return { ...DEFAULT_PAGE_META };
  }
}

export function setPageMeta(content: string, meta: PageMeta): string {
  const serialized = `${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}`;
  const pattern = /<!--hisfuture-page-meta:[\s\S]*?-->/;
  return pattern.test(content)
    ? content.replace(pattern, serialized)
    : `${serialized}${content}`;
}