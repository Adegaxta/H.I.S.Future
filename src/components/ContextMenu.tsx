import { useEffect, useRef } from "react";
import type { ContextMenuState } from "../types/nodes";

interface ContextMenuProps {
  menu: ContextMenuState;
  onCreate: (parentId: string | null) => void;
  onView: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export default function ContextMenu({
  menu,
  onCreate,
  onView,
  onDelete,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menu.y,
        left: menu.x,
        background: "#1A1D21",
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        padding: "4px",
        zIndex: 9999,
        boxShadow: "0 8px 16px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        minWidth: "140px",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        className="ctx-menu-btn"
        onClick={(event) => {
          event.stopPropagation();
          onCreate(menu.nodeId);
          onClose();
        }}
      >
        Crear nodo {menu.nodeId ? "dentro" : "raíz"}
      </button>
      {menu.nodeId && (
        <button
          className="ctx-menu-btn"
          onClick={(event) => {
            event.stopPropagation();
            onView(menu.nodeId!);
            onClose();
          }}
        >
          Vista
        </button>
      )}
      {menu.nodeId && (
        <button
          className="ctx-menu-btn danger"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(menu.nodeId!);
            onClose();
          }}
        >
          Eliminar nodo
        </button>
      )}
    </div>
  );
}
