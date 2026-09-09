import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { getNodalMeta } from "../nodes/metadata";
import type { RelationRole } from "../nodes/relationTypes";
import { normalizeSearchText } from "../utils/searchText";
import { NodeIcon } from "../nodes/NodeIcon";
import { UiIcon } from "../ui/Icon";
import { fileImportAccept } from "../project/fileImportRegistry";

const assets = import.meta.glob<string>("../assets/third-party/google-material/icons/*.svg", { eager: true, query: "?url", import: "default" });
export type NodalIconName = "syllable" | "classroom" | "classes_video" | "content" | "Evaluation" | "add_video" | "add_link" | "material" | "task" | "state" | "undated" | "download" | "delete" | "extension" | "storage" | "audio_capture" | "link_1" | "link_2";
export function NodalIcon({ name }: { name: NodalIconName }) {
  return <span aria-hidden="true" className="sidebar-icon nodal-icon" style={{ "--icon-url": `url("${assets[`../assets/third-party/google-material/icons/${name}.svg`]}")` } as CSSProperties} />;
}
export interface NodalViewProps {
  node: NodeItem;
  nodes: NodeItem[];
  onMutate: (update: (nodes: NodeItem[]) => NodeItem[]) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onImport: (file: File) => Promise<NodeItem | null>;
}
export function NodeReference({ node, nodes, onOpen, label }: { node: NodeItem; nodes: NodeItem[]; onOpen: (id: string) => void; label?: ReactNode }) {
  const type = getEffectiveNodeType(nodes, node);
  return <button type="button" className="node-reference" data-mention-id={node.id} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties} title={node.name} onClick={() => onOpen(node.id)}><NodeIcon type={type} /><span>{label ?? node.name}</span></button>;
}
export function NodeReferenceList({ source, role, nodes, onOpen, onRemove, query = "" }: {
  source: NodeItem; role: RelationRole; nodes: NodeItem[]; onOpen: (id: string) => void;
  onRemove: (id: string) => void; query?: string;
}) {
  const { t } = useLocale();
  const relations = getNodalMeta(source.content).relations.filter((r) => r.role === role);
  return <div className="node-reference-list">{relations.map((relation) => {
    const target = nodes.find((n) => n.id === relation.targetId);
    if (target && !normalizeSearchText(target.name).includes(normalizeSearchText(query))) return null;
    return <div key={relation.targetId} className="node-reference-row">
      {target ? <NodeReference node={target} nodes={nodes} onOpen={onOpen} /> : <span className="nodal-message">{t("nodal.missing")}</span>}
      <button type="button" className="nodal-unlink" aria-label={t("nodal.unlink")} title={t("nodal.unlink")} onClick={() => onRemove(relation.targetId)}>×</button>
    </div>;
  })}{!relations.length && <p className="nodal-message">{t("nodal.empty")}</p>}</div>;
}

export function NodePicker({ nodes, types, onChoose, onCreate, onImport, onClose }: {
  nodes: NodeItem[]; types?: BaseNodeType[]; onChoose: (id: string) => void;
  onCreate?: (name: string, type: BaseNodeType) => void;
  onImport?: (file: File) => Promise<NodeItem | null>; onClose: () => void;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const availableTypes = NODE_REGISTRY.availableForCreation().filter((d) => !types || types.includes(d.type));
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<BaseNodeType>(availableTypes[0]?.type ?? "pagina");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; ref.current?.showModal(); return () => { mounted.current = false; ref.current?.close(); }; }, []);
  const filtered = nodes.filter((n) => (!types || types.includes(n.type)) && normalizeSearchText(n.name).includes(normalizeSearchText(query)));
  const importAccept = fileImportAccept(types);
  return <dialog ref={ref} className="lore-add-dialog node-picker" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }} aria-label={t("nodal.choose")}>
    <div className="lore-add-dialog__content"><header><h2>{t("nodal.choose")}</h2><button disabled={busy} onClick={onClose} aria-label={t("nodal.close")}>×</button></header>
      <label className="nodal-search"><UiIcon name="search" /><input autoFocus placeholder={t("nodal.search")} aria-label={t("nodal.search")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="lore-add-dialog__list">{filtered.map((n) => <button disabled={busy} type="button" key={n.id} className="node-reference" style={{ "--node-color": getNodeDefinition(getEffectiveNodeType(nodes, n)).color } as CSSProperties} onClick={() => { onChoose(n.id); onClose(); }}><NodeIcon type={getEffectiveNodeType(nodes, n)} /><span>{n.name}</span><small>{getNodeDisplayLabel(n.type, t)}</small></button>)}{!filtered.length && <p>{t("nodal.empty")}</p>}</div>
      {onCreate && availableTypes.length > 0 && <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim(), type); onClose(); } }}>
        <label>{t("nodal.name")}<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        {availableTypes.length > 1 && <label>{t("nodal.type")}<select value={type} onChange={(e) => setType(e.target.value as BaseNodeType)}>{availableTypes.map((d) => <option value={d.type} key={d.type}>{t(d.labelKey)}</option>)}</select></label>}
        <button disabled={busy || !name.trim()} type="submit">{t("nodal.create")}</button>
      </form>}
      {onImport && importAccept && <label className="nodal-file-action">{t("nodal.import")}<input disabled={busy} type="file" accept={importAccept} onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(false);
        try { const imported = await onImport(file); if (!mounted.current) return; if (!imported || (types && !types.includes(imported.type))) throw new Error(); onChoose(imported.id); onClose(); }
        catch { if (mounted.current) setError(true); } finally { if (mounted.current) setBusy(false); }
      }} /></label>}
      {error && <p role="alert">{t("nodal.failed")}</p>}
    </div>
  </dialog>;
}
