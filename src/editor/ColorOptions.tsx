import { useState } from "react";
import { EDITOR_BACKGROUND_COLORS, EDITOR_TEXT_COLORS } from "../defs/palette";
import { useLocale } from "../i18n/LocaleContext";

export type ColorTarget = "text" | "background" | "border";

/** One palette, scoped to one property; the parent owns positioning and dismissal. */
export default function ColorOptions({ kind, onApply }: { kind: ColorTarget; onApply: (color: string) => void }) {
  const { t } = useLocale();
  const [custom, setCustom] = useState("#FFFFFF");
  const colors = kind === "background" ? EDITOR_BACKGROUND_COLORS : EDITOR_TEXT_COLORS;
  const applyCustom = () => {
    const color = custom.trim().replace(/^#?/, "#");
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) onApply(color);
  };
  return <div className="his-color-options" data-color-target={kind}>
    <button type="button" onClick={() => onApply("")}>{t("editor.colors.default")}</button>
    {(Object.keys(colors) as (keyof typeof colors)[]).filter((name) => name !== "gray").map((name) => <button type="button" key={name} style={{ color: colors[name] }} onClick={() => onApply(colors[name])}>
      <span className="his-color-options__swatch" style={{ background: colors[name] }} />
      {t(`editor.colors.${name}`)}
    </button>)}
    <form onSubmit={(event) => { event.preventDefault(); applyCustom(); }}>
      <input aria-label="Color personalizado" value={custom} onChange={(event) => setCustom(event.target.value)} />
      <button type="submit">OK</button>
    </form>
  </div>;
}
