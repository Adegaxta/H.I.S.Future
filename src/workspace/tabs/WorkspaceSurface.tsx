import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import type { ViewRegistry } from "./ViewRegistry";
import { activateTab, addEmptyTab, closeTab, createTab, findPane, findTab, focusPane, moveTab, reorderTab, resizeSplit, updateTab, type DropZone, type WorkspaceLayout, type WorkspaceLayoutNode, type WorkspacePane, type WorkspaceTab } from "./model";
import "./styles.css";

const TAB_MIME = "application/x-his-workspace-tab";

function zoneFromPoint(element: HTMLElement, clientX: number, clientY: number): DropZone {
  const rect = element.getBoundingClientRect();
  const x = (clientX - rect.left) / Math.max(1, rect.width);
  const y = (clientY - rect.top) / Math.max(1, rect.height);
  if (x < 0.25) return "left";
  if (x > 0.75) return "right";
  if (y < 0.25) return "top";
  if (y > 0.75) return "bottom";
  return "center";
}

export function PaneTabBar({ pane, registry, onChange }: { pane: WorkspacePane; registry: ViewRegistry; onChange: (update: WorkspaceLayout | ((current: WorkspaceLayout) => WorkspaceLayout)) => void }) {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [reorderPreview, setReorderPreview] = useState<{ index: number; left: number } | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const updateOverflow = () => {
    const host = tabsRef.current;
    if (host) setOverflow({ left: host.scrollLeft > 1, right: host.scrollLeft + host.clientWidth < host.scrollWidth - 1 });
  };
  useLayoutEffect(() => {
    const host = tabsRef.current;
    if (!host) return;
    host.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(host);
    return () => observer.disconnect();
  }, [pane.activeTabId, pane.tabs.length, Boolean(overflow.left || overflow.right)]);
  const scrollTabs = (direction: number) => tabsRef.current?.scrollBy({ left: direction * Math.max(120, tabsRef.current.clientWidth * .7), behavior: "smooth" });
  const readInsertion = (clientX: number) => {
    const host = tabsRef.current;
    if (!host) return { index: pane.tabs.length, left: 0 };
    const buttons = Array.from(host.querySelectorAll<HTMLElement>(":scope > .workspace-tab"));
    const index = buttons.findIndex((button) => clientX < button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2);
    const safeIndex = index < 0 ? buttons.length : index;
    const boundary = safeIndex < buttons.length ? buttons[safeIndex].getBoundingClientRect().left : buttons[buttons.length - 1]?.getBoundingClientRect().right ?? host.getBoundingClientRect().left;
    return { index: safeIndex, left: boundary - host.getBoundingClientRect().left + host.scrollLeft };
  };
  const handleTabbarDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(TAB_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setReorderPreview(readInsertion(event.clientX));
  };
  const handleTabbarDrop = (event: React.DragEvent<HTMLElement>) => {
    const tabId = event.dataTransfer.getData(TAB_MIME);
    if (!tabId) return;
    event.preventDefault();
    event.stopPropagation();
    const insertion = readInsertion(event.clientX);
    setReorderPreview(null);
    onChange((current) => {
      const source = findTab(current, tabId);
      if (!source) return current;
      if (source.pane.id !== pane.id) return moveTab(current, tabId, pane.id, "center", insertion.index);
      const sourceIndex = source.pane.tabs.findIndex((tab) => tab.id === tabId);
      const targetIndex = insertion.index > sourceIndex ? insertion.index - 1 : insertion.index;
      return reorderTab(current, pane.id, tabId, targetIndex);
    });
  };
  return <div
    className="workspace-pane-tabbar"
    role="tablist"
    aria-label="Pestañas del panel"
    onDragOverCapture={handleTabbarDragOver}
    onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setReorderPreview(null);
    }}
    onDropCapture={handleTabbarDrop}
  >
    {(overflow.left || overflow.right) && <button type="button" disabled={!overflow.left} className="workspace-tabs__scroll" aria-label="Ver pestañas anteriores" onClick={() => scrollTabs(-1)}>‹</button>}
    <div ref={tabsRef} className="workspace-pane-tabbar__tabs" onScroll={updateOverflow} onWheel={event => { if (tabsRef.current && Math.abs(event.deltaY) > Math.abs(event.deltaX)) tabsRef.current.scrollLeft += event.deltaY; }}>
    {pane.tabs.map((tab) => {
      const definition = registry.get(tab.viewType);
      const Icon = definition?.icon;
      const renderedIcon = definition?.renderIcon?.(tab);
      const title = tab.title ?? definition?.resolveTitle?.(tab) ?? definition?.title ?? "Nueva pestaña";
      return <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={pane.activeTabId === tab.id}
        className={`workspace-tab${pane.activeTabId === tab.id ? " is-active" : ""}`}
        draggable
        onDragStart={(event) => { event.dataTransfer.setData(TAB_MIME, tab.id); event.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => setReorderPreview(null)}
        onDragOver={handleTabbarDragOver}
        onDrop={handleTabbarDrop}
        onClick={() => onChange((current) => activateTab(current, pane.id, tab.id))}
      >
        <span className="workspace-tab__icon" aria-hidden="true">
          {renderedIcon ?? (Icon ? <Icon size={13} strokeWidth={1.7} /> : <span className="workspace-tab__empty-icon" />)}
        </span>
        <span className="workspace-tab__title">{title}</span>
        <span
          role="button"
          tabIndex={-1}
          className="workspace-tab__close"
          aria-label={`Cerrar ${title}`}
          title={`Cerrar ${title}`}
          onClick={(event) => { event.stopPropagation(); onChange((current) => closeTab(current, pane.id, tab.id)); }}
        ><X size={12} /></span>
      </button>;
    })}
    {pane.tabs.length === 0 && <span className="workspace-pane-tabbar__empty">Nueva pestaña</span>}
    {reorderPreview && <span className="workspace-tab-reorder-indicator" style={{ left: reorderPreview.left }} aria-hidden="true" />}
    </div>
    {(overflow.left || overflow.right) && <button type="button" disabled={!overflow.right} className="workspace-tabs__scroll" aria-label="Ver pestañas siguientes" onClick={() => scrollTabs(1)}>›</button>}
    <button type="button" className="workspace-tabs__add" aria-label="Nueva pestaña" title="Nueva pestaña" onClick={() => onChange((current) => addEmptyTab(current, pane.id))}><Plus size={15} /></button>
    <div className="workspace-pane-tabbar__spacer" />
  </div>;
}

function EmptyView({ pane, registry, onChange }: { pane: WorkspacePane; registry: ViewRegistry; onChange: (update: (layout: WorkspaceLayout) => WorkspaceLayout) => void }) {
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
  const choose = (type: WorkspaceTab["viewType"], defaultState?: Record<string, unknown>) => {
    if (!type) return;
    onChange((layout) => active
      ? updateTab(layout, active.id, (tab) => ({ ...tab, viewType: type, state: defaultState }))
      : addEmptyTab(layout, pane.id, { ...createTab(type), state: defaultState }));
  };
  return <div className="workspace-view-picker">
    <div className="workspace-view-picker__card">
      <h2>{active ? "Nueva pestaña" : "Abrir vista"}</h2>
      <p>Abrir:</p>
      <div className="workspace-view-picker__options">
        {registry.list().map((definition) => <button key={definition.type} type="button" onClick={() => choose(definition.type, definition.defaultState)}>
          <definition.icon size={18} strokeWidth={1.6} /><span>{definition.title}</span>
        </button>)}
      </div>
    </div>
  </div>;
}

function PaneView({ pane, layout, registry, onChange }: { pane: WorkspacePane; layout: WorkspaceLayout; registry: ViewRegistry; onChange: (update: WorkspaceLayout | ((current: WorkspaceLayout) => WorkspaceLayout)) => void }) {
  const [zone, setZone] = useState<DropZone | null>(null);
  const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
  const activeDefinition = registry.get(active?.viewType ?? null);
  const renderedTabs = pane.tabs.filter((tab) => tab.id === active?.id || registry.get(tab.viewType)?.keepAlive);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(frame);
  }, [active?.id]);
  return <section
    className={`workspace-pane${layout.focusedPaneId === pane.id ? " is-focused" : ""}`}
    data-pane-id={pane.id}
    onPointerDownCapture={() => onChange((current) => current.focusedPaneId === pane.id ? current : focusPane(current, pane.id))}
    onFocusCapture={() => onChange((current) => current.focusedPaneId === pane.id ? current : focusPane(current, pane.id))}
    onDragOver={(event) => { if (!event.dataTransfer.types.includes(TAB_MIME)) return; event.preventDefault(); setZone(zoneFromPoint(event.currentTarget, event.clientX, event.clientY)); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setZone(null); }}
    onDrop={(event) => { const tabId = event.dataTransfer.getData(TAB_MIME); if (!tabId) return; event.preventDefault(); const dropZone = zoneFromPoint(event.currentTarget, event.clientX, event.clientY); setZone(null); onChange((current) => moveTab(current, tabId, pane.id, dropZone)); }}
  >
    <PaneTabBar pane={pane} registry={registry} onChange={onChange} />
    {active && activeDefinition?.contextHeader && (
      <div className="workspace-view-header">
        <span className="workspace-view-header__title">{activeDefinition.resolveContextTitle?.(active) ?? activeDefinition.title}</span>
      </div>
    )}
    <div className="workspace-pane__content" tabIndex={-1}>
      {!active || !activeDefinition ? <EmptyView pane={pane} registry={registry} onChange={(update) => onChange(update)} /> : null}
      {renderedTabs.map((tab) => {
        const definition = registry.get(tab.viewType);
        if (!definition) return null;
        const visible = tab.id === active?.id;
        return <div key={tab.id} data-workspace-view={tab.viewType} className={`workspace-pane__view workspace-pane__view--${tab.viewType}${visible ? " is-active" : " is-hidden"}`} aria-hidden={!visible}>{definition.renderer(tab)}</div>;
      })}
    </div>
    {zone && <div className={`workspace-drop-preview workspace-drop-preview--${zone}`} />}
  </section>;
}

function SplitView({ node, layout, registry, onChange }: { node: Extract<WorkspaceLayoutNode, { kind: "split" }>; layout: WorkspaceLayout; registry: ViewRegistry; onChange: (update: WorkspaceLayout | ((current: WorkspaceLayout) => WorkspaceLayout)) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = dragRatio ?? node.ratio;
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (pointer: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const next = node.direction === "horizontal" ? (pointer.clientX - rect.left) / rect.width : (pointer.clientY - rect.top) / rect.height;
      setDragRatio(Math.max(0.18, Math.min(0.82, next)));
    };
    const end = (pointer: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const next = node.direction === "horizontal" ? (pointer.clientX - rect.left) / rect.width : (pointer.clientY - rect.top) / rect.height;
      const safe = Math.max(0.18, Math.min(0.82, next));
      setDragRatio(null);
      onChange((current) => resizeSplit(current, node.id, safe));
      console.info("[WORKSPACE] pane_resized", { splitId: node.id, ratio: safe });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };
  const style = node.direction === "horizontal"
    ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 5px minmax(0, ${1 - ratio}fr)` }
    : { gridTemplateRows: `minmax(0, ${ratio}fr) 5px minmax(0, ${1 - ratio}fr)` };
  return <div ref={containerRef} className={`workspace-split workspace-split--${node.direction}`} style={style}>
    <WorkspaceNode node={node.children[0]} layout={layout} registry={registry} onChange={onChange} />
    <div className="workspace-split__divider" onPointerDown={startResize} />
    <WorkspaceNode node={node.children[1]} layout={layout} registry={registry} onChange={onChange} />
  </div>;
}

function WorkspaceNode(props: { node: WorkspaceLayoutNode; layout: WorkspaceLayout; registry: ViewRegistry; onChange: (update: WorkspaceLayout | ((current: WorkspaceLayout) => WorkspaceLayout)) => void }) {
  return props.node.kind === "pane" ? <PaneView pane={props.node} layout={props.layout} registry={props.registry} onChange={props.onChange} /> : <SplitView {...props} node={props.node} />;
}

export function WorkspaceSurface({ layout, registry, onChange }: { layout: WorkspaceLayout; registry: ViewRegistry; onChange: React.Dispatch<React.SetStateAction<WorkspaceLayout>> }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const pane = findPane(layout.root, layout.focusedPaneId);
      if (!pane) return;
      if (event.key.toLowerCase() === "t") { event.preventDefault(); onChange((current) => addEmptyTab(current)); }
      else if (event.key.toLowerCase() === "w" && pane.activeTabId) { event.preventDefault(); onChange((current) => closeTab(current, pane.id, pane.activeTabId!)); }
      else if (event.key === "Tab" && pane.tabs.length > 1) {
        event.preventDefault();
        const index = pane.tabs.findIndex((tab) => tab.id === pane.activeTabId);
        const next = pane.tabs[(index + (event.shiftKey ? -1 : 1) + pane.tabs.length) % pane.tabs.length];
        onChange((current) => activateTab(current, pane.id, next.id));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [layout, onChange]);
  return <div className="workspace-surface"><WorkspaceNode node={layout.root} layout={layout} registry={registry} onChange={onChange} /></div>;
}
