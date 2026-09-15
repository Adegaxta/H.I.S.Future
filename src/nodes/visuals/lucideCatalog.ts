import dynamicIconImports from "lucide-react/dynamicIconImports.mjs";
import { normalizeSearchText } from "../../utils/searchText";
import { scoreSemanticQuery } from "./iconSemanticSearch";
import lucideSearchMetadata from "./lucideSearchMetadata.generated.json";

export type LucideIconName = keyof typeof dynamicIconImports;

export const LUCIDE_ICON_NAMES = Object.freeze(Object.keys(dynamicIconImports) as LucideIconName[]);

export function isLucideIconName(name: string): name is LucideIconName {
  return name in dynamicIconImports;
}

export function searchLucideIcons(query: string): LucideIconName[] {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return [...LUCIDE_ICON_NAMES];
  return LUCIDE_ICON_NAMES.map((name) => {
    const metadata = (lucideSearchMetadata as Record<string, string>)[name] ?? "";
    return { name, score: scoreSemanticQuery(name, metadata, normalizedQuery) };
  }).filter((result): result is { name: LucideIconName; score: number } => result.score !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((result) => result.name);
}

export function formatLucideIconName(name: string): string {
  return name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
