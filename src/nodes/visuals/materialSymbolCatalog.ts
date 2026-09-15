import { normalizeSearchText } from "../../utils/searchText";
import { scoreSemanticQuery } from "./iconSemanticSearch";
import { MATERIAL_SYMBOL_NAMES } from "./materialSymbolNames.generated";
import materialSearchMetadata from "./materialSearchMetadata.generated.json";

export type MaterialSymbolName = (typeof MATERIAL_SYMBOL_NAMES)[number];

export function isMaterialSymbolName(name: string): name is MaterialSymbolName {
  return (MATERIAL_SYMBOL_NAMES as readonly string[]).includes(name);
}

export function searchMaterialSymbols(query: string): MaterialSymbolName[] {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return [...MATERIAL_SYMBOL_NAMES];
  return MATERIAL_SYMBOL_NAMES.map((name) => {
    const metadata = (materialSearchMetadata as Record<string, string>)[name] ?? "";
    return { name, score: scoreSemanticQuery(name, metadata, normalizedQuery) };
  }).filter((result): result is { name: MaterialSymbolName; score: number } => result.score !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((result) => result.name);
}

export function formatMaterialSymbolName(name: string): string {
  return name.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
