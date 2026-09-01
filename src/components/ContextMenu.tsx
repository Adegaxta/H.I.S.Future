import type { ContextMenuState } from "../types/nodes";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";

interface ContextMenuProps {
  menu: ContextMenuState;
  onCreate: (parentId: string | null) => void;
  onView: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export default function ContextMenu({ menu, onCreate, onView, onDelete, onClose }: ContextMenuProps) {
  const items: HisContextMenuItem[] = [
    {
      id: "create",
      label: `Crear nodo ${menu.nodeId ? "dentro" : "raíz"}`,
      onSelect: () => onCreate(menu.nodeId),
    },
    ...(menu.nodeId ? [
      { id: "view", label: "Vista", onSelect: () => onView(menu.nodeId!) },
      { id: "delete", label: "Eliminar nodo", danger: true, onSelect: () => onDelete(menu.nodeId!) },
    ] : []),
  ];
  return <HisContextMenu x={menu.x} y={menu.y} items={items} onClose={onClose} />;
}
