import { useEffect, useId, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { getNodeDisplayLabel, getNodeDefinition } from "../nodes/registry";
import { NodeIcon } from "../nodes/NodeIcon";
import { PrimaryNodeName } from "../nodes/PrimaryNodeName";

export default function ExistingNodePicker({ nodes, selectedId, onSelect, onClose }: {
  nodes: NodeItem[]; selectedId: string | null;
  onSelect: (id: string | null) => void; onClose: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(selectedId);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const filtered = nodes.filter(node => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <dialog ref={ref} className="existing-node-picker" aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onPointerDown={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) { event.stopPropagation(); onClose(); }
  }}>
    <header><h2 id={id}>{t("nodeCreation.selectNode")}</h2><button type="button" aria-label={t("common.actions.close")} onClick={onClose}>×</button></header>
    <input autoFocus type="search" placeholder={t("lore.dialog.searchPlaceholder")} aria-label={t("lore.dialog.search")} value={query} onChange={event => setQuery(event.target.value)} />
    <div className="existing-node-picker__list">
      {filtered.map(node => <label key={node.id} className={selected === node.id ? "is-selected" : ""}>
        <input type="radio" name={id} value={node.id} checked={selected === node.id} onChange={() => setSelected(node.id)} />
        <span style={{ color: getNodeDefinition(node.type).color }}><NodeIcon type={node.type} /></span>
        <span className="existing-node-picker__name"><PrimaryNodeName node={node}>{node.name}</PrimaryNodeName><small>{getNodeDisplayLabel(node.type, t)}</small></span>
      </label>)}
      {!filtered.length && <p>{t("nodeCreation.empty")}</p>}
    </div>
    <footer><button type="button" disabled={!selected} onClick={() => onSelect(selected)}>{t("nodeCreation.choose")}</button><button type="button" onClick={() => onSelect(null)}>{t("nodeCreation.clear")}</button><button className="node-creation__cancel" type="button" onClick={onClose}>{t("nodeCreation.cancel")}</button></footer>
  </dialog>;
}
