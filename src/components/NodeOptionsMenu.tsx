import starAsset from "../assets/third-party/google-material/icons/star.svg";
import asteriskAsset from "../assets/third-party/google-material/icons/asterisk.svg";
import addAsset from "../assets/third-party/google-material/icons/add.svg";
import removeAsset from "../assets/third-party/google-material/icons/remove.svg";
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
import fileCogAsset from "../assets/third-party/Lucide.dev/icons/file-cog.svg";
import { useLayoutEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodalMeta } from "../nodes/metadata";

export interface NodeOptionsMenuProps {
  node: NodeItem;
  x: number;
  y: number;
  onClose: () => void;
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

type MenuAction = { label: string; icon: string; disabled?: boolean; onClick?: () => void };

function Symbol({ kind }: { kind: "asterisk" | "add" | "remove" | "double-add" }) {
  if (kind === "double-add") return <span className="node-options__symbol node-options__symbol--double"><img src={addAsset} alt="" /><img src={addAsset} alt="" /></span>;
  const source = kind === "asterisk" ? asteriskAsset : kind === "remove" ? removeAsset : addAsset;
  return <img className="node-options__symbol" src={source} alt="" />;
}

function ActionRow({ action, symbol }: { action: MenuAction; symbol: "asterisk" | "add" | "remove" | "double-add" }) {
  return <button type="button" className="node-options__row" disabled={action.disabled} onClick={action.onClick}>
    <img className="node-options__icon" src={action.icon} alt="" />
    <span>{action.label}</span>
    <Symbol kind={symbol} />
  </button>;
}

export default function NodeOptionsMenu({ node, x, y, onClose, onToggleMeta, onCreateLink, onAddToFolder, onSaveTemplate, onLoadTemplate, onDuplicate, onDelete, onSearch, onExport }: NodeOptionsMenuProps) {
  const meta = getNodalMeta(node.content);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 12;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(48, Math.min(y, window.innerHeight - rect.height - margin)),
    });
  }, [x, y]);
  useLayoutEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  const closeAfter = (action?: () => void) => () => { action?.(); onClose(); };
  const actions: MenuAction[] = [
    { label: meta.favorite ? "Quitar favorito" : "Favorito", icon: starAsset, onClick: closeAfter(() => onToggleMeta("favorite")) },
    { label: meta.pinned ? "Desanclar Nodo" : "Anclar Nodo", icon: pinAsset, onClick: closeAfter(() => onToggleMeta("pinned")) },
    { label: "Crear enlace en otro Nodo", icon: graphAsset, onClick: closeAfter(onCreateLink) },
    { label: "Añadir a carpeta", icon: folderAsset, onClick: closeAfter(onAddToFolder) },
    { label: "Usar como plantilla", icon: packagePlusAsset, onClick: closeAfter(onSaveTemplate) },
    { label: "Cargar plantilla", icon: packageOpenAsset, onClick: closeAfter(onLoadTemplate) },
    { label: "Duplicar", icon: fileStackAsset, onClick: closeAfter(onDuplicate) },
    { label: "Eliminar", icon: deleteAsset, disabled: meta.protected, onClick: closeAfter(onDelete) },
  ];
  return <div ref={menuRef} className="node-options" role="dialog" aria-label="Opciones de Nodo" style={position} onPointerDown={(event) => event.stopPropagation()}>
    <header className="node-options__header"><img src={fileCogAsset} alt="" /><strong>Opciones de Nodo</strong></header>
    <div className="node-options__rule" />
    <ActionRow action={actions[0]} symbol="asterisk" />
    <ActionRow action={actions[1]} symbol="asterisk" />
    <ActionRow action={actions[2]} symbol="add" />
    <ActionRow action={actions[3]} symbol="add" />
    <ActionRow action={actions[4]} symbol="add" />
    <ActionRow action={actions[5]} symbol="add" />
    <ActionRow action={actions[6]} symbol="double-add" />
    <ActionRow action={actions[7]} symbol="remove" />
    <div className="node-options__rule" />
    <ActionRow action={{ label: meta.protected ? "Desproteger Nodo" : "Proteger Nodo", icon: lockAsset, onClick: closeAfter(() => onToggleMeta("protected")) }} symbol="asterisk" />
    <ActionRow action={{ label: "Historial", icon: fileClockAsset, disabled: true }} symbol="asterisk" />
    <ActionRow action={{ label: "Buscar", icon: searchAsset, onClick: closeAfter(onSearch) }} symbol="asterisk" />
    <div className="node-options__rule" />
    <ActionRow action={{ label: "Imprimir", icon: printAsset, disabled: true }} symbol="add" />
    <ActionRow action={{ label: "Exportar", icon: fileDownAsset, onClick: closeAfter(onExport) }} symbol="add" />
  </div>;
}
