import { useDeferredValue, useEffect, useMemo, useState, type UIEvent } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { getEmojiCatalog, getEmojiCategories, searchEmojis } from "./emojiCatalog";
import { NodeVisualRenderer } from "./NodeVisualRenderer";
import type { EmojiVisualStyle } from "./types";

const PAGE_SIZE = 240;

export function EmojiPicker({ onSelect }: { onSelect: (value: string, style: EmojiVisualStyle) => void }) {
  const { locale, t } = useLocale();
  const catalogLocale = locale === "es" ? "es" : "en";
  const catalog = useMemo(() => getEmojiCatalog(catalogLocale), [catalogLocale]);
  const categories = useMemo(() => getEmojiCategories(catalogLocale), [catalogLocale]);
  const [style, setStyle] = useState<EmojiVisualStyle>("noto");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const results = useMemo(() => searchEmojis(catalog, deferredQuery, category), [catalog, category, deferredQuery]);

  useEffect(() => setLimit(PAGE_SIZE), [category, deferredQuery]);

  const loadNextPage = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 120) {
      setLimit((current) => Math.min(results.length, current + PAGE_SIZE));
    }
  };

  return (
    <div className="node-visual-picker">
      <div className="node-visual-picker__styles" role="group" aria-label={t("page.emojis.style")}>
        <button type="button" className={style === "noto" ? "is-active" : ""} onClick={() => setStyle("noto")}>{t("page.emojis.noto")}</button>
        <button type="button" className={style === "twemoji" ? "is-active" : ""} onClick={() => setStyle("twemoji")}>{t("page.emojis.twemoji")}</button>
      </div>
      <div className="node-visual-picker__filters">
        <input
          className="node-visual-picker__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("page.emojis.searchPlaceholder")}
          aria-label={t("page.emojis.searchPlaceholder")}
        />
        <select value={category ?? ""} onChange={(event) => setCategory(event.target.value === "" ? null : Number(event.target.value))} aria-label={t("page.emojis.category")}>
          <option value="">{t("page.emojis.allCategories")}</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className="node-visual-picker__scroll" onScroll={loadNextPage}>
        <div className="node-visual-picker__grid node-visual-picker__grid--emojis">
          {results.slice(0, limit).map((item) => (
            <button type="button" key={`${item.emoji}-${item.name}`} onClick={() => onSelect(item.emoji, style)} title={item.name} aria-label={item.name}>
              <NodeVisualRenderer visual={{ kind: "emoji", value: item.emoji, style }} />
            </button>
          ))}
        </div>
        {results.length === 0 && <div className="page-image-picker__empty">{t("page.emojis.empty")}</div>}
      </div>
    </div>
  );
}
