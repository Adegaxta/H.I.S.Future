import { useEffect, useRef } from "react";

export interface HisContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

interface HisContextMenuProps {
  x: number;
  y: number;
  items: HisContextMenuItem[];
  onClose: () => void;
}

export default function HisContextMenu({ x, y, items, onClose }: HisContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className="his-context-menu" role="menu" style={{ top: y, left: x }} onContextMenu={(event) => event.preventDefault()}>
      {items.map((item) => (
        <button type="button" role="menuitem" key={item.id} className={item.danger ? "is-danger" : ""} onClick={(event) => {
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
