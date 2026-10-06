import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useLocale } from "../i18n/LocaleContext";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { NODE_REGISTRY, getNodeDisplayLabel, hasNodeCapability } from "../nodes/registry";
import ExistingNodePicker from "./ExistingNodePicker";
import { NodeIcon } from "../nodes/NodeIcon";
import { getNodalMeta } from "../nodes/metadata";
import { isVaultPrimaryNode } from "../nodes/project/domain";
import { wouldCreateCycle } from "../utils/nodeTree";
import { listTags } from "../tags/repository";
import { TagChip } from "../tags/TagChip";
import type { Tag } from "../tags/types";
import type { NodeCreationDraft } from "../nodes/creation";
import plus from "../assets/third-party/Lucide.dev/icons/circle-plus.svg";
import cancel from "../assets/third-party/Lucide.dev/icons/circle-x.svg";
import "../tags/styles.css";
import "./nodeCreation.css";

export default function NodeCreationPanel({ nodes, initialType, initialParentId = null, onCreate, onClose }: {
  nodes: NodeItem[]; initialType: BaseNodeType; initialParentId?: string | null;
  onCreate: (draft: NodeCreationDraft) => Promise<unknown>; onClose: () => void;
}) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(initialType);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [parentId, setParentId] = useState(initialParentId);
  const [childId, setChildId] = useState<string | null>(null);
  const [confirmedChildParentId, setConfirmedChildParentId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<NodeItem | null>(null);
  const [picker, setPicker] = useState<"parent" | "child" | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [tagsFailed, setTagsFailed] = useState(false);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  useEffect(() => { let active = true; void listTags().then(value => { if (active) setTags(value); }).catch(() => { if (active) setTagsFailed(true); }); return () => { active = false; }; }, []);
  const supportsTags = hasNodeCapability(type, "tags");
  const eligible = nodes.filter(node => !isVaultPrimaryNode(node));
  const children = eligible.filter(node => !getNodalMeta(node.content).pinned && !getNodalMeta(node.content).protected && (!parentId || !wouldCreateCycle(nodes, node.id, parentId)));
  const recommend = (items: NodeItem[]) => [...items].sort((a, b) => Number(b.id === initialParentId) - Number(a.id === initialParentId) || a.order - b.order || a.name.localeCompare(b.name)).slice(0, 5);
  const selectChild = (id: string | null) => {
    setHint(false);
    const node = nodes.find(item => item.id === id);
    if (node?.parentId) { setConflict(node); return; }
    setChildId(id); setConfirmedChildParentId(null);
  };
  const selectParent = (id: string | null) => { setParentId(id); if (childId && id && wouldCreateCycle(nodes, childId, id)) { setChildId(null); setConfirmedChildParentId(null); } };
  const create = async (destination: "lore" | "vault") => {
    if (!name.trim() || busy || conflict || templateOpen || picker) return;
    setBusy(true); setError(false);
    try { await onCreate({ name, description, type, tagIds, parentId, childId, confirmedChildParentId, destination }); onClose(); }
    catch { setError(true); setBusy(false); }
  };
  const nodeSection = (kind: "parent" | "child") => {
    const items = kind === "parent" ? nodes : children;
    const selected = kind === "parent" ? parentId : childId;
    const choose = kind === "parent" ? selectParent : selectChild;
    return <div className="node-creation__row"><label htmlFor={`${titleId}-${kind}`}>{t(`nodeCreation.${kind}`)}</label><div className="node-creation__recommendations">
      <button type="button" id={`${titleId}-${kind}`} data-node-id={selected ?? ""} className="node-creation__node-choice" onClick={() => setPicker(kind)}>{selected ? nodes.find(node => node.id === selected)?.name : t("nodeCreation.chooseNode")}</button>
      <div className="node-creation__divider" /><span>{t("nodeCreation.recommended")}</span><div className="node-creation__items">{recommend(items).map(node => <button type="button" key={node.id} title={node.name} aria-label={node.name} aria-pressed={selected === node.id} onClick={() => choose(selected === node.id ? null : node.id)}><span style={{ color: NODE_REGISTRY.get(node.type).color }}><NodeIcon type={node.type} /></span><span>{node.name}</span></button>)}{!items.length && <small>{t("nodeCreation.empty")}</small>}</div>
    </div></div>;
  };
  return <dialog ref={ref} className="node-creation" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (busy) return; if (templateOpen) setTemplateOpen(false); else if (conflict) setConflict(null); else onClose(); }} onPointerDown={event => { if (event.target === event.currentTarget && !busy) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id={titleId}>{t("nodeCreation.title")}</h2></header>
    <form onSubmit={event => { event.preventDefault(); void create("lore"); }}>
      <fieldset disabled={busy || templateOpen || !!conflict} className="node-creation__body">
        <div className="node-creation__row"><label htmlFor={`${titleId}-name`}>{t("nodeCreation.name")}</label><input id={`${titleId}-name`} autoFocus required value={name} onChange={event => setName(event.target.value)} /></div>
        <div className="node-creation__row"><label htmlFor={`${titleId}-description`}>{t("nodeCreation.description")}</label><input id={`${titleId}-description`} placeholder={t("nodeCreation.optional")} value={description} onChange={event => setDescription(event.target.value)} /></div>
        <div className="node-creation__row node-creation__separated"><span>{t("nodeCreation.type")}</span><div className="node-creation__types">{NODE_REGISTRY.all().filter(definition => definition.type !== "tempo").sort((a, b) => (a.creation.order ?? 100) - (b.creation.order ?? 100)).map(definition => <button type="button" key={definition.type} data-type={definition.type} style={{ color: definition.color } as CSSProperties} disabled={!definition.creation.available} title={getNodeDisplayLabel(definition.type, t)} aria-label={getNodeDisplayLabel(definition.type, t)} aria-pressed={type === definition.type} onClick={() => { setType(definition.type); if (!hasNodeCapability(definition.type, "tags")) setTagIds([]); }}><NodeIcon type={definition.type} /></button>)}</div></div>
        <div className="node-creation__row node-creation__separated"><label htmlFor={`${titleId}-tags`}>{t("nodeCreation.tags")}</label><div className="node-creation__recommendations"><input disabled={!supportsTags} id={`${titleId}-tags`} placeholder={t("tags.search")} value={tagQuery} onChange={event => setTagQuery(event.target.value)} /><div className="node-creation__items">{tags.filter(tag => tagIds.includes(tag.id)).map(tag => <button type="button" disabled={!supportsTags} key={tag.id} onClick={() => setTagIds(ids => ids.filter(id => id !== tag.id))}><TagChip tag={tag} selected /></button>)}</div><div className="node-creation__divider" /><span>{t("nodeCreation.recommended")}</span><div className="node-creation__items node-creation__tag-results">{tags.filter(tag => !tagIds.includes(tag.id) && tag.name.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase())).map(tag => <button type="button" disabled={!supportsTags} key={tag.id} onClick={() => setTagIds(ids => [...new Set([...ids, tag.id])])}><TagChip tag={tag} /></button>)}{!supportsTags && <small>{t("nodeCreation.noTags")}</small>}{!tags.length && supportsTags && <small>{t(tagsFailed ? "nodeCreation.error" : "nodeCreation.empty")}</small>}</div></div></div>
        <div className="node-creation__row"><span>{t("nodeCreation.template")}</span><button className="node-creation__choose" type="button" onClick={() => setTemplateOpen(true)}>{t("nodeCreation.chooseTemplate")}</button></div>
        <div className="node-creation__separated">{nodeSection("parent")}{nodeSection("child")}</div>
        {hint && <p role="status">{t("nodeCreation.mentionHint")}</p>}
        {error && <p role="alert">{t("nodeCreation.error")}</p>}
      </fieldset>
      <footer><button type="submit" disabled={!name.trim() || busy || !!conflict || templateOpen}><img src={plus} alt="" />{t(busy ? "nodeCreation.saving" : "nodeCreation.lore")}</button><button type="button" disabled={!name.trim() || busy || !!conflict || templateOpen} onClick={() => void create("vault")}><img src={plus} alt="" />{t("nodeCreation.vault")}</button><button className="node-creation__cancel" type="button" disabled={busy || templateOpen || !!conflict} onClick={onClose}><img src={cancel} alt="" />{t("nodeCreation.cancel")}</button></footer>
    </form>
    {picker && <ExistingNodePicker nodes={picker === "parent" ? nodes : children} selectedId={picker === "parent" ? parentId : childId} onSelect={id => { const kind = picker; setPicker(null); if (kind === "parent") selectParent(id); else selectChild(id); }} onClose={() => setPicker(null)} />}
    {(templateOpen || conflict) && <div className="node-creation__suboverlay"><section role="dialog" aria-modal="true" aria-label={t(templateOpen ? "nodeCreation.template" : "nodeCreation.child")}>
      {templateOpen ? <><p>{t("nodeCreation.noTemplates")}</p><button type="button" autoFocus onClick={() => setTemplateOpen(false)}>{t("nodeCreation.close")}</button></> : conflict && <><p>{t("nodeCreation.conflict", { child: conflict.name, parent: nodes.find(node => node.id === conflict.parentId)?.name ?? conflict.parentId ?? "" })}</p><div><button type="button" autoFocus onClick={() => { setChildId(conflict.id); setConfirmedChildParentId(conflict.parentId); setConflict(null); }}>{t("nodeCreation.move")}</button><button type="button" onClick={() => { setChildId(null); setConfirmedChildParentId(null); setHint(true); setConflict(null); }}>{t("nodeCreation.mention")}</button><button type="button" onClick={() => setConflict(null)}>{t("nodeCreation.cancel")}</button></div></>}
    </section></div>}
  </dialog>;
}
