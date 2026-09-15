import englishData from "emojibase-data/en/compact.json";
import englishMessages from "emojibase-data/en/messages.json";
import spanishData from "emojibase-data/es/compact.json";
import spanishMessages from "emojibase-data/es/messages.json";
import { normalizeSearchText } from "../../utils/searchText";

interface CompactEmoji {
  unicode: string;
  label: string;
  tags?: string[];
  group?: number;
  order?: number;
}

interface EmojiMessages {
  groups: Array<{ message: string; order: number }>;
}

export interface EmojiCatalogItem {
  emoji: string;
  name: string;
  keywords: string[];
  category: number;
}

export interface EmojiCategory {
  id: number;
  label: string;
}

const datasets = { en: englishData as CompactEmoji[], es: spanishData as CompactEmoji[] };
const messages = { en: englishMessages as EmojiMessages, es: spanishMessages as EmojiMessages };

export function getEmojiCatalog(locale: "en" | "es"): EmojiCatalogItem[] {
  return datasets[locale]
    .filter((item) => typeof item.group === "number" && item.group !== 2 && typeof item.order === "number")
    .map((item) => ({
      emoji: item.unicode,
      name: item.label,
      keywords: item.tags ?? [],
      category: item.group as number,
    }));
}

export function getEmojiCategories(locale: "en" | "es"): EmojiCategory[] {
  return messages[locale].groups
    .filter((group) => group.order !== 2)
    .map((group) => ({ id: group.order, label: group.message }));
}

export function searchEmojis(items: readonly EmojiCatalogItem[], query: string, category: number | null): EmojiCatalogItem[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== null && item.category !== category) return false;
    if (terms.length === 0) return true;
    const searchable = normalizeSearchText([item.name, ...item.keywords].join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
