import { useLocale } from "../i18n/LocaleContext";
import { useRef } from "react";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";

export interface HisContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface HisContextMenuProps {
  x: number;
  y: number;
  items: HisContextMenuItem[];
  onClose: () => void;
}

export function withExitAction(items: HisContextMenuItem[], label: string): HisContextMenuItem[] {
  return [...items, { id: "close-menu", label, onSelect: () => {} }];
}

export default function HisContextMenu({ x, y, items, onClose }: HisContextMenuProps) {
  const { t } = useLocale();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useDismissibleLayer(menuRef, onClose);

  return (
    <div ref={menuRef} className="his-context-menu" role="menu" style={{ top: y, left: x }} onContextMenu={(event) => event.preventDefault()}>
      {withExitAction(items, t("context.exit")).map((item) => (
        <button type="button" role="menuitem" key={item.id} className={item.danger ? "is-danger" : ""} disabled={item.disabled} onClick={(event) => {
          if (item.disabled) return;
          event.stopPropagation();
          item.onSelect();
          onClose();
        }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
