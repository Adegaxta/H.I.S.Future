import { useLayoutEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { NodeIcon } from "../nodes/NodeIcon";
import { useNodeCustomVisuals } from "../nodes/nodeIconSource";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { normalizeSearchText } from "../utils/searchText";
import { getNodalMeta } from "../nodes/metadata";
import { useResolvedImageSource } from "../utils/imageRuntimeResolver";

type Position = { top: number; left: number; caretTop?: number; caretBottom?: number };
function useMenuPosition(position: Position, width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState(position);
  useLayoutEffect(() => {
    const place = () => setPlaced(current => {
      const menuHeight = ref.current?.offsetHeight ?? 340;
      const caretTop = position.caretTop ?? (position.top - 24);
      const caretBottom = position.caretBottom ?? position.top;

      let top: number;
      if (caretBottom + menuHeight + 8 <= window.innerHeight) {
        top = caretBottom + 8;
      } else if (caretTop - menuHeight - 8 >= 8) {
        top = caretTop - menuHeight - 8;
      } else {
        const spaceBelow = window.innerHeight - (caretBottom + 8);
        const spaceAbove = caretTop - 8;
        if (spaceBelow >= spaceAbove) {
          top = caretBottom + 8;
        } else {
          top = Math.max(8, caretTop - menuHeight - 8);
        }
      }
      const left = Math.max(8, Math.min(position.left, window.innerWidth - width - 8));
      const next = { top, left };
      return current.left === next.left && current.top === next.top ? current : next;
    });
    place(); window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, [position.top, position.left, position.caretTop, position.caretBottom, width]);
  return { ref, placed };
}

function MentionCandidateImagePreview({ node }: { node: NodeItem }) {
  const { src } = useResolvedImageSource(node);
  if (!src) {
    return (
      <div className="mention-menu__image-placeholder">
        <span className="sidebar-icon node-type-icon node-type-icon--imagen" style={{ width: 32, height: 32, display: "inline-block" }} />
      </div>
    );
  }
  return <img src={src} alt={node.name} className="mention-menu__image-thumb" />;
}

export default function MentionMenu({ position, query, nodes, candidates, activeIndex, onActiveIndexChange, canCreate, onSelect, onCreate, onClose }: {
  position: Position; query: string; nodes: NodeItem[]; candidates: NodeItem[]; activeIndex: number;
  onActiveIndexChange?: (index: number) => void;
  canCreate: boolean; onSelect: (id: string) => void; onCreate: (kind: "here" | "in") => void; onClose: () => void;
}) {
  const { t } = useLocale();
  const { ref, placed } = useMenuPosition(position, 340);
  const visuals = useNodeCustomVisuals(nodes);
  const [help, setHelp] = useState<"here" | "in" | null>(null);
  useDismissibleLayer(ref, onClose);
  const name = query.replace(/\u00a0/g, " ").trim();
  const activeCandidate = activeIndex >= 0 && activeIndex < candidates.length ? candidates[activeIndex] : null;
  const isImageCandidate = activeCandidate ? getEffectiveNodeType(nodes, activeCandidate) === "imagen" : false;
  const helpKind = help ?? (name && activeIndex >= candidates.length ? activeIndex === candidates.length ? "here" : "in" : null);
  const isLeft = placed.left + 570 > window.innerWidth;
  const isBottom = placed.top + 340 > window.innerHeight;
  const helpPositionClass = `${isLeft ? " is-left" : ""}${isBottom ? " is-bottom" : ""}`;

  return <div ref={ref} className="his-context-menu mention-menu" data-picker="true" data-mention-menu="true" role="menu" style={placed}>
    {(candidates.length > 0 || !name) && <div className="his-context-menu__group">
      <div className="his-context-menu__label">{t("editor.mention.linkNode")}{!name && <span> · {t("editor.mention.recent")}</span>}</div>
      {!candidates.length && <small className="mention-menu__hint">{t("editor.mention.noRecent")}</small>}
      <div className="mention-menu__results">
        {candidates.map((item, index) => <button type="button" role="menuitem" key={item.id} data-picker-menu-item={item.id} className={index === activeIndex ? "is-active" : ""}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }}
          onMouseEnter={() => { setHelp(null); onActiveIndexChange?.(index); }}
          onMouseDown={event => { event.preventDefault(); onSelect(item.id); }}>
          <NodeIcon type={getEffectiveNodeType(nodes, item)} visual={visuals.get(item.id)} />
          <span className="mention-menu__node"><span>{item.name}</span><small>{nodes.find(n => n.id === item.parentId)?.name}</small></span>
        </button>)}
      </div>
    </div>}
    {canCreate && <div className="his-context-menu__group">
      <div className="his-context-menu__label">{t("editor.mention.createSection")}</div>
      {(["here", "in"] as const).map((kind, offset) => <button role="menuitem" key={kind} data-mention-create={kind} disabled={!name}
        className={activeIndex === candidates.length + offset ? "is-active" : ""}
        onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && name) { event.preventDefault(); onCreate(kind); } }}
        onMouseEnter={() => { onActiveIndexChange?.(candidates.length + offset); setHelp(kind); }}
        onFocus={() => { onActiveIndexChange?.(candidates.length + offset); setHelp(kind); }}
        onMouseDown={event => { event.preventDefault(); if (name) onCreate(kind); }}>
        <span className="mention-menu__action-icon" aria-hidden="true">{kind === "here" ? "+" : "↗"}</span>
        <span className="mention-menu__action-text">
          {t(kind === "here" ? "editor.mention.createHere" : "editor.mention.createIn")}
          {name ? ` «${name.length > 24 ? `${name.slice(0, 24)}…` : name}»${kind === "in" ? "…" : ""}` : "…"}
        </span>
      </button>)}
      {!name && <small className="mention-menu__hint">{t("editor.mention.typeName")}</small>}
    </div>}
    {helpKind ? (
      <aside className={`mention-menu__help${helpPositionClass}`} role="tooltip">
        <span className="mention-menu__help-icon" aria-hidden="true">{helpKind === "here" ? "+" : "↗"}</span>
        <strong>{t(helpKind === "here" ? "editor.mention.createHere" : "editor.mention.createIn")}</strong>
        <p>{t(helpKind === "here" ? "editor.mention.helpHere" : "editor.mention.helpIn")}</p>
      </aside>
    ) : isImageCandidate && activeCandidate ? (
      <aside className={`mention-menu__help mention-menu__help--image${helpPositionClass}`} role="tooltip">
        <div className="mention-menu__image-preview-frame">
          <MentionCandidateImagePreview node={activeCandidate} />
        </div>
        <strong className="mention-menu__image-preview-title">{activeCandidate.name}</strong>
        <p className="mention-menu__image-preview-desc">
          {t("editor.image.previewHelp")}
        </p>
      </aside>
    ) : null}
  </div>;
}

export function MentionDestinationMenu({ position, name, nodes, onSelect, onClose }: {
  position: Position; name: string; nodes: NodeItem[]; onSelect: (node: NodeItem) => void; onClose: () => void;
}) {
  const { t } = useLocale();
  const { ref, placed } = useMenuPosition(position, 380);
  const visuals = useNodeCustomVisuals(nodes);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useDismissibleLayer(ref, onClose);
  const children = (node: NodeItem) => {
    const links = new Set(Array.from(node.content.matchAll(/data-mention-id=["']([^"']+)["']/g), match => match[1]));
    return nodes.filter(item => item.parentId === node.id || links.has(item.id)).sort((a, b) => a.order - b.order);
  };
  const canReceive = (node: NodeItem) => (node.type === "pagina" || node.type === "proyecto" || node.type === "tempo") && !getNodalMeta(node.content).protected;
  const renderNode = (node: NodeItem, depth: number, ancestors: Set<string>) => {
    if (ancestors.has(node.id)) return null;
    const nextAncestors = new Set([...ancestors, node.id]);
    const related = children(node).filter(item => !nextAncestors.has(item.id));
    const open = expanded.has(node.id);
    return <div key={node.id}>
      <div className="mention-menu__tree-row" style={{ paddingLeft: depth * 16 }}>
        <button className="mention-menu__expand" type="button" disabled={!related.length} aria-label={t(open ? "editor.mention.collapse" : "editor.mention.expand")} aria-expanded={open}
          onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{related.length ? open ? "⌄" : "›" : ""}</button>
        <button type="button" disabled={!canReceive(node)} onClick={() => onSelect(node)}>
          <NodeIcon type={getEffectiveNodeType(nodes, node)} visual={visuals.get(node.id)} /><span>{node.name}</span>
        </button>
      </div>
      {!query && open && related.map(item => renderNode(item, depth + 1, nextAncestors))}
    </div>;
  };
  const visible = query.trim()
    ? nodes.filter(node => normalizeSearchText(node.name).includes(normalizeSearchText(query.trim())))
    : nodes.filter(node => !node.parentId || !nodes.some(parent => parent.id === node.parentId)).sort((a, b) => a.order - b.order);
  return <div ref={ref} className="his-context-menu mention-menu mention-menu--destination" data-mention-destination="true" role="dialog" aria-label={t("editor.mention.destination")} style={placed}>
    <div className="mention-menu__destination-title">{t("editor.mention.createIn")} «{name}»</div>
    <input autoFocus onKeyDown={event => {
      if (event.key === "Enter") { const target = visible.find(canReceive); if (target) { event.preventDefault(); onSelect(target); } }
      if (event.key === "ArrowDown") { event.preventDefault(); ref.current?.querySelector<HTMLButtonElement>(".mention-menu__tree-row button:not(.mention-menu__expand):not(:disabled)")?.focus(); }
    }} value={query} onChange={event => setQuery(event.target.value)} placeholder={t("editor.mention.searchDestination")} aria-label={t("editor.mention.searchDestination")} />
    <div className="his-context-menu__label">{t("editor.mention.destination")}</div>
    <div className="mention-menu__tree">{visible.map(node => renderNode(node, 0, new Set()))}{!visible.length && <p className="mention-menu__hint">{t("editor.mention.noDestinations")}</p>}</div>
    <button type="button" onClick={onClose}>{t("editor.mention.cancel")}</button>
  </div>;
}
