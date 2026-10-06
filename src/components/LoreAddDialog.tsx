import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";
import { PrimaryNodeName } from "../nodes/PrimaryNodeName";

export default function LoreAddDialog({ nodes, onAdd, onClose, title, onRequestCreate }: {
  nodes: NodeItem[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
  title?: string;
  onRequestCreate: () => void;
}) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"existing" | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const available = nodes.filter((node) => node.loreHidden);
  const filtered = available.filter((node) => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <dialog ref={dialogRef} className="lore-add-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="lore-add-title">
    <div className="lore-add-dialog__content">
      <header><h2 id="lore-add-title">{title ?? t("lore.dialog.title")}</h2><button type="button" onClick={onClose} aria-label={t("common.actions.close")}>×</button></header>
      <div className="lore-add-dialog__choices">
        <button type="button" aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>{t("lore.dialog.existing")}</button>
        <button type="button" onClick={onRequestCreate}>{t("lore.dialog.new")}</button>
      </div>
      {mode === "existing" && <>
        <p>{t("lore.dialog.explanation")}</p>
        <input aria-label={t("lore.dialog.search")} placeholder={t("lore.dialog.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="lore-add-dialog__list">
          {filtered.map((node) => <label key={node.id}>
            <input type="checkbox" checked={selected.includes(node.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))} />
            <span><PrimaryNodeName node={node}>{node.name}</PrimaryNodeName><small>{getNodeDisplayLabel(node.type, t)}</small></span>
          </label>)}
          {!filtered.length && <p>{t(available.length ? "lore.dialog.noMatches" : "lore.dialog.allAdded")}</p>}
        </div>
        <button type="button" disabled={!selected.length} onClick={() => { onAdd(selected); onClose(); }}>{t("lore.dialog.add")}{selected.length ? ` (${selected.length})` : ""}</button>
      </>}
    </div>
  </dialog>;
}
