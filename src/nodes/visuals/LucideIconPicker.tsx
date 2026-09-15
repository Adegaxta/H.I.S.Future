import { useDeferredValue, useEffect, useMemo, useState, type UIEvent } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { formatLucideIconName, searchLucideIcons, type LucideIconName } from "./lucideCatalog";
import { NodeVisualRenderer } from "./NodeVisualRenderer";

const PAGE_SIZE = 80;

interface LucideIconPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (name: LucideIconName) => void;
}

export function LucideIconPicker({ query, onQueryChange, onSelect }: LucideIconPickerProps) {
  const { t } = useLocale();
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const results = useMemo(() => searchLucideIcons(deferredQuery), [deferredQuery]);

  useEffect(() => setLimit(PAGE_SIZE), [deferredQuery]);

  const loadNextPage = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 120) {
      setLimit((current) => Math.min(results.length, current + PAGE_SIZE));
    }
  };

  return (
    <div className="node-visual-picker">
      <input
        className="node-visual-picker__search"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("page.icons.searchPlaceholder")}
        aria-label={t("page.icons.searchPlaceholder")}
      />
      <div className="node-visual-picker__scroll" onScroll={loadNextPage}>
        <div className="node-visual-picker__grid node-visual-picker__grid--icons">
          {results.slice(0, limit).map((name) => (
            <button type="button" key={name} onClick={() => onSelect(name)} title={formatLucideIconName(name)} aria-label={formatLucideIconName(name)}>
              <NodeVisualRenderer visual={{ kind: "icon", provider: "lucide", name }} />
            </button>
          ))}
        </div>
        {results.length === 0 && <div className="page-image-picker__empty">{t("page.icons.empty")}</div>}
      </div>
    </div>
  );
}
