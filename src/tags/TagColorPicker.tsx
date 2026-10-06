import type { CSSProperties } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { TAG_COLOR_PALETTE } from "./palette";

export function TagColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const { t } = useLocale();
  return (
    <div className="tag-color-picker">
      <div className="tag-color-picker__palette" role="radiogroup" aria-label={t("tags.color")}>
        {TAG_COLOR_PALETTE.map((color) => (
          <button
            type="button"
            key={color}
            role="radio"
            aria-checked={value.toUpperCase() === color.toUpperCase()}
            className={value.toUpperCase() === color.toUpperCase() ? "is-selected" : ""}
            style={{ "--tag-color": color } as CSSProperties}
            onClick={() => onChange(color)}
            aria-label={color}
          />
        ))}
      </div>
      <label className="tag-color-picker__custom">
        <span>{t("tags.customColor")}</span>
        <span className="tag-color-picker__custom-value">{value.toUpperCase()}</span>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={t("tags.customColor")} />
      </label>
    </div>
  );
}
