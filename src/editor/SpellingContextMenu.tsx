import { useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { clampContextMenuPosition } from "../components/HisContextMenu";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import type { EditorSpellingMenu } from "./useEditorSpelling";

export default function SpellingContextMenu({ menu, onClose, onCorrect, onAdd }: {
  menu: EditorSpellingMenu; onClose: () => void; onCorrect: (suggestion: string) => void; onAdd: () => Promise<void>;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useDismissibleLayer(ref, onClose);
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPosition(clampContextMenuPosition(menu.x, menu.y, rect.width, rect.height, window.innerWidth, window.innerHeight));
  }, [menu, error]);
  return <div ref={ref} className="his-context-menu his-spelling-menu" role="menu" aria-label={t("editor.spelling.suggestions")} style={position} onContextMenu={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
    <div className="his-context-menu__group">
      {menu.suggestions.map((suggestion) => <button key={suggestion} type="button" role="menuitem" disabled={busy} onClick={() => onCorrect(suggestion)}>{suggestion}</button>)}
    </div>
    <div className="his-context-menu__group">
      <button type="button" role="menuitem" disabled={busy} onClick={() => {
        setBusy(true); setError(false);
        void onAdd().catch(() => { setError(true); setBusy(false); });
      }}>{t("editor.spelling.addToDictionary")}</button>
      {error && <div role="alert" className="his-spelling-menu__error">{t("editor.spelling.addFailed")}</div>}
    </div>
  </div>;
}
