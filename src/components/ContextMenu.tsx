import type { ContextMenuState } from "../types/nodes";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";

interface ContextMenuProps {
  menu: ContextMenuState;
  onCreate: (parentId: string | null) => void;
  onView: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  removeCount?: number;
}

export default function ContextMenu({ menu, onCreate, onView, onDelete, onClose, removeCount }: ContextMenuProps) {
  const items: HisContextMenuItem[] = [
    {
      id: "create",
      label: `Crear nodo ${menu.nodeId ? "dentro" : "raíz"}`,
      onSelect: () => onCreate(menu.nodeId),
    },
    ...(menu.nodeId ? [
      { id: "view", label: "Vista", onSelect: () => onView(menu.nodeId!) },
      { id: "delete", label: removeCount !== undefined ? removeCount > 1 ? `Quitar ${removeCount} Nodos` : "Quitar Nodo" : "Eliminar Nodo", danger: removeCount === undefined, onSelect: () => onDelete(menu.nodeId!) },
    ] : []),
  ];
  return <HisContextMenu x={menu.x} y={menu.y} items={items} onClose={onClose} />;
}
