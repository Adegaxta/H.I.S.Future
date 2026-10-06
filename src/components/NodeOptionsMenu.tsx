import starAsset from "../assets/third-party/google-material/icons/star.svg";
import pinAsset from "../assets/third-party/Lucide.dev/icons/pin.svg";
import graphAsset from "../assets/third-party/google-material/icons/graph_4_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import folderAsset from "../assets/third-party/google-material/icons/create_folder_node.svg";
import packagePlusAsset from "../assets/third-party/Lucide.dev/icons/package-plus.svg";
import packageOpenAsset from "../assets/third-party/Lucide.dev/icons/package-open.svg";
import fileStackAsset from "../assets/third-party/Lucide.dev/icons/file-stack.svg";
import deleteAsset from "../assets/third-party/google-material/icons/delete.svg";
import lockAsset from "../assets/third-party/google-material/icons/lock_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import fileClockAsset from "../assets/third-party/Lucide.dev/icons/file-clock.svg";
import searchAsset from "../assets/third-party/google-material/icons/search.svg";
import printAsset from "../assets/third-party/google-material/icons/print_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import fileDownAsset from "../assets/third-party/Lucide.dev/icons/file-down.svg";
import { useLayoutEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodalMeta } from "../nodes/metadata";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";

export interface NodeOptionsMenuProps {
  node: NodeItem;
  x: number;
  y: number;
  onClose: () => void;
  onTogglePrimary: () => void;
  onToggleMeta: (key: "favorite" | "pinned" | "protected") => void;
  onCreateLink: () => void;
  onAddToFolder: () => void;
  onSaveTemplate: () => void;
  onLoadTemplate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSearch: () => void;
  onExport: () => void;
}

type MenuAction = { id: string; label: string; icon: string; disabled?: boolean; onClick?: () => void };
type MenuGroup = { id: string; actions: MenuAction[] };

function ActionRow({ action }: { action: MenuAction }) {
  return <button type="button" className="node-options__row" disabled={action.disabled} onClick={action.onClick}>
    <img className="node-options__icon" src={action.icon} alt="" />
    <span>{action.label}</span>
  </button>;
}

export default function NodeOptionsMenu({ node, x, y, onClose, onTogglePrimary, onToggleMeta, onCreateLink, onAddToFolder, onSaveTemplate, onLoadTemplate, onDuplicate, onDelete, onSearch, onExport }: NodeOptionsMenuProps) {
  const meta = getNodalMeta(node.content);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useDismissibleLayer(menuRef, onClose);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 12;
    const rect = menu.getBoundingClientRect();
    setPosition({ left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)), top: Math.max(48, Math.min(y, window.innerHeight - rect.height - margin)) });
  }, [x, y]);
  const closeAfter = (action?: () => void) => () => { action?.(); onClose(); };
  const groups: MenuGroup[] = [
    { id: "organization", actions: [
      { id: "primary", label: meta.role === "vault-primary" ? "Quitar como nodo principal" : "Añadir como nodo principal", icon: starAsset, onClick: closeAfter(onTogglePrimary) },
      { id: "favorite", label: meta.favorite ? "Quitar favorito" : "Favorito", icon: starAsset, onClick: closeAfter(() => onToggleMeta("favorite")) },
      { id: "pin", label: meta.pinned ? "Desanclar Nodo" : "Anclar Nodo", icon: pinAsset, onClick: closeAfter(() => onToggleMeta("pinned")) },
      { id: "link", label: "Crear enlace en otro Nodo", icon: graphAsset, onClick: closeAfter(onCreateLink) },
      { id: "folder", label: "Añadir a carpeta", icon: folderAsset, onClick: closeAfter(onAddToFolder) },
      { id: "save-template", label: "Usar como plantilla", icon: packagePlusAsset, onClick: closeAfter(onSaveTemplate) },
      { id: "load-template", label: "Cargar plantilla", icon: packageOpenAsset, onClick: closeAfter(onLoadTemplate) },
      { id: "duplicate", label: "Duplicar", icon: fileStackAsset, onClick: closeAfter(onDuplicate) },
      { id: "delete", label: "Eliminar", icon: deleteAsset, disabled: meta.protected, onClick: closeAfter(onDelete) },
    ] },
    { id: "node", actions: [
      { id: "protect", label: meta.protected ? "Desproteger Nodo" : "Proteger Nodo", icon: lockAsset, onClick: closeAfter(() => onToggleMeta("protected")) },
      { id: "history", label: "Historial", icon: fileClockAsset, disabled: true },
      { id: "search", label: "Buscar", icon: searchAsset, onClick: closeAfter(onSearch) },
    ] },
    { id: "output", actions: [
      { id: "print", label: "Imprimir", icon: printAsset, disabled: true },
      { id: "export", label: "Exportar", icon: fileDownAsset, onClick: closeAfter(onExport) },
    ] },
  ];
  return <div ref={menuRef} className="node-options-layer" role="dialog" aria-label="Opciones de Nodo" style={position} onPointerDown={(event) => event.stopPropagation()}>
    <div className="node-options__title">Opciones de Nodo</div>
    <div className="node-options">
      {groups.map((group) => <section className="node-options__group" key={group.id} data-menu-group={group.id}>
        {group.actions.map((action) => <ActionRow action={action} key={action.id} />)}
      </section>)}
    </div>
  </div>;
}
