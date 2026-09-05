import { useEffect, useRef, useState } from "react";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { NODE_REGISTRY, getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";

export default function LoreAddDialog({ nodes, onAdd, onCreate, onClose }: {
  nodes: NodeItem[];
  onAdd: (ids: string[]) => void;
  onCreate: (name: string, type: BaseNodeType) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"existing" | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<BaseNodeType>("pagina");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const available = nodes.filter((node) => node.loreHidden);
  const filtered = available.filter((node) => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <dialog ref={dialogRef} className="lore-add-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="lore-add-title">
    <div className="lore-add-dialog__content">
      <header><h2 id="lore-add-title">Añadir a Lore</h2><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="lore-add-dialog__choices">
        <button type="button" aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Añadir existentes</button>
        <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>Crear nuevo</button>
      </div>
      {mode === "existing" && <>
        <p>Los nodos mantienen su contenido y conexiones. Al añadir una carpeta se recupera también su rama.</p>
        <input aria-label="Buscar nodos existentes" placeholder="Buscar nodos…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="lore-add-dialog__list">
          {filtered.map((node) => <label key={node.id}>
            <input type="checkbox" checked={selected.includes(node.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))} />
            <span>{node.name}<small>{getNodeDisplayLabel(node.type, t)}</small></span>
          </label>)}
          {!filtered.length && <p>{available.length ? "No hay coincidencias." : "Todos los nodos del proyecto ya están en Lore. Puedes crear uno nuevo."}</p>}
        </div>
        <button type="button" disabled={!selected.length} onClick={() => { onAdd(selected); onClose(); }}>Añadir{selected.length ? ` (${selected.length})` : ""}</button>
      </>}
      {mode === "new" && <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim(), type); onClose(); } }}>
        <label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as BaseNodeType)}>{NODE_REGISTRY.availableForCreation().map((definition) => <option key={definition.type} value={definition.type}>{getNodeDisplayLabel(definition.type, t)}</option>)}</select></label>
        <button type="submit" disabled={!name.trim()}>Crear Nodo</button>
      </form>}
    </div>
  </dialog>;
}
