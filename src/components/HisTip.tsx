import { useState } from "react";
import { useLocale } from "../i18n/LocaleContext";

interface HisTipProps {
  children: React.ReactNode;
  storageKey?: string;
  className?: string;
}

export default function HisTip({ children, storageKey, className = "" }: HisTipProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(() => !storageKey || localStorage.getItem(storageKey) !== "dismissed");
  if (!visible) return null;
  return (
    <aside className={`his-tip${className ? ` ${className}` : ""}`} role="note">
      <span>{t("tips.label")}</span>
      <p>{children}</p>
      <button type="button" onClick={() => {
        if (storageKey) localStorage.setItem(storageKey, "dismissed");
        setVisible(false);
      }} aria-label={t("tips.close")}>×</button>
    </aside>
  );
}
