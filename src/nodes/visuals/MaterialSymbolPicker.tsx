import { useDeferredValue, useEffect, useMemo, useState, type UIEvent } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { formatMaterialSymbolName, searchMaterialSymbols, type MaterialSymbolName } from "./materialSymbolCatalog";
import { NodeVisualRenderer } from "./NodeVisualRenderer";

const PAGE_SIZE = 80;

interface MaterialSymbolPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (name: MaterialSymbolName) => void;
}

export function MaterialSymbolPicker({ query, onQueryChange, onSelect }: MaterialSymbolPickerProps) {
  const { t } = useLocale();
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const results = useMemo(() => searchMaterialSymbols(deferredQuery), [deferredQuery]);

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
        placeholder={t("page.icons.materialSearchPlaceholder")}
        aria-label={t("page.icons.materialSearchPlaceholder")}
      />
      <div className="node-visual-picker__scroll" onScroll={loadNextPage}>
        <div className="node-visual-picker__grid node-visual-picker__grid--icons">
          {results.slice(0, limit).map((name) => (
            <button type="button" key={name} onClick={() => onSelect(name)} title={formatMaterialSymbolName(name)} aria-label={formatMaterialSymbolName(name)}>
              <NodeVisualRenderer visual={{ kind: "icon", provider: "material-symbols", name }} />
            </button>
          ))}
        </div>
        {results.length === 0 && <div className="page-image-picker__empty">{t("page.icons.empty")}</div>}
      </div>
    </div>
  );
}
