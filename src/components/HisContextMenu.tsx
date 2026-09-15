import { useLocale } from "../i18n/LocaleContext";
import { useLayoutEffect, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";

export interface HisContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface HisContextMenuGroup {
  id: string;
  label?: string;
  items: HisContextMenuItem[];
}

interface HisContextMenuProps {
  x: number;
  y: number;
  items: HisContextMenuItem[];
  groups?: HisContextMenuGroup[];
  onClose: () => void;
}

export function clampContextMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
) {
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - height - margin)),
  };
}

export function withExitAction(items: HisContextMenuItem[], label: string): HisContextMenuItem[] {
  return [...items, { id: "close-menu", label, onSelect: () => {} }];
}

export default function HisContextMenu({ x, y, items, groups = [], onClose }: HisContextMenuProps) {
  const { t } = useLocale();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const menuGroups = [
    ...groups,
    ...(items.length ? [{ id: "default", items }] : []),
  ];
  const visibleGroups = menuGroups.length ? menuGroups : [{ id: "default", items: [] }];
  const lastGroupIndex = visibleGroups.length - 1;

  useDismissibleLayer(menuRef, onClose);

  useLayoutEffect(() => {
    const keepInsideViewport = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const margin = 8;
      const rect = menu.getBoundingClientRect();
      const next = clampContextMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight, margin);
      setPosition((current) => current.left === next.left && current.top === next.top ? current : next);
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [x, y, items, groups]);

  return (
    <div ref={menuRef} className="his-context-menu" role="menu" style={position} onContextMenu={(event) => event.preventDefault()}>
      {visibleGroups.map((group, groupIndex) => {
        const groupItems = groupIndex === lastGroupIndex
          ? withExitAction(group.items, t("context.exit"))
          : group.items;
        return (
          <div className="his-context-menu__group" key={group.id}>
            {group.label && <div className="his-context-menu__label">{group.label}</div>}
            {groupItems.map((item) => (
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
      })}
    </div>
  );
}
