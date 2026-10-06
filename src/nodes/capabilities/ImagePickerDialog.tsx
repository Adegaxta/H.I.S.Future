import type { ReactNode } from "react";
import { useLocale } from "../../i18n/LocaleContext";

/** Shared shell for the existing icon/cover selector. */
export function ImagePickerDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLocale();
  return <div className="page-image-picker" role="dialog" aria-modal="true" aria-label={title}>
    <div className="page-image-picker__panel">
      <div className="page-image-picker__header"><strong>{title}</strong><button type="button" onClick={onClose} aria-label={t("common.actions.close")}>X</button></div>
      {children}
    </div>
  </div>;
}
