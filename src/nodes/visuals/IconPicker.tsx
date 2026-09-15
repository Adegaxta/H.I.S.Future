import { lazy, Suspense, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import type { IconVisualProvider } from "./types";

const LucideIconPicker = lazy(() => import("./LucideIconPicker").then((module) => ({ default: module.LucideIconPicker })));
const MaterialSymbolPicker = lazy(() => import("./MaterialSymbolPicker").then((module) => ({ default: module.MaterialSymbolPicker })));

export function IconPicker({ onSelect }: { onSelect: (provider: IconVisualProvider, name: string) => void }) {
  const { t } = useLocale();
  const [provider, setProvider] = useState<IconVisualProvider>("lucide");
  const [query, setQuery] = useState("");

  return (
    <div className="node-visual-picker">
      <div className="node-visual-picker__styles" role="tablist" aria-label={t("page.icons.provider")}>
        <button type="button" className={provider === "lucide" ? "is-active" : ""} onClick={() => setProvider("lucide")}>{t("page.icons.lucide")}</button>
        <button type="button" className={provider === "material-symbols" ? "is-active" : ""} onClick={() => setProvider("material-symbols")}>{t("page.icons.materialSymbols")}</button>
      </div>
      <Suspense fallback={<div className="page-image-picker__empty">{t("page.visuals.loading")}</div>}>
        {provider === "lucide"
          ? <LucideIconPicker query={query} onQueryChange={setQuery} onSelect={(name) => onSelect("lucide", name)} />
          : <MaterialSymbolPicker query={query} onQueryChange={setQuery} onSelect={(name) => onSelect("material-symbols", name)} />}
      </Suspense>
    </div>
  );
}
