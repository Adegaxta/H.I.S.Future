import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { NodeItem } from "../../types/nodes";
import { useLocale } from "../../i18n/LocaleContext";
import graphAsset from "../../assets/third-party/google-material/icons/graph_1.svg";
import indexAsset from "../../assets/third-party/google-material/icons/more_vert.svg";
import nodeOptionsAsset from "../../assets/third-party/google-material/icons/more_horiz.svg";
import { focusPageHeading } from "../../editor/pageIndexNavigation";

const GraphView = lazy(() => import("../../graph/view"));

interface PageNodeChromeProps {
  node: NodeItem;
  nodes: NodeItem[];
  editorRef: RefObject<HTMLDivElement | null>;
  projectKey: string;
  onOpenNode: (id: string) => void;
  onOpenNodeMenu: (position: { x: number; y: number }) => void;
}

interface OutlineEntry {
  element: HTMLElement;
  html: string;
  level: number;
  text: string;
  style: CSSProperties;
}

export default function PageNodeChrome({
  node,
  nodes,
  editorRef,
  projectKey,
  onOpenNode,
  onOpenNodeMenu,
}: PageNodeChromeProps) {
  const { t } = useLocale();
  const [indexOpen, setIndexOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);

  const refreshOutline = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const headings = Array.from(editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [data-heading], .editor-heading, .heading"))
      .filter((heading) => !heading.closest("[data-page-index], [data-globe]") && Boolean(heading.textContent?.trim()));
    setOutline(headings.map((element) => {
      const computed = getComputedStyle(element);
      return {
        element,
        html: element.innerHTML,
        level: Number.parseInt(element.tagName.replace("H", ""), 10) || 1,
        text: element.textContent?.replace(/\s+/g, " ").trim() || "",
        style: {
          color: computed.color,
          fontWeight: computed.fontWeight,
          fontStyle: computed.fontStyle,
          textDecoration: computed.textDecoration,
        },
      };
    }));
  }, [editorRef]);

  useEffect(() => {
    if (!indexOpen) return;
    const editor = editorRef.current;
    if (!editor) return;
    let frame = requestAnimationFrame(refreshOutline);
    const scheduleRefresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refreshOutline);
    };
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(editor, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editorRef, indexOpen, node.id, refreshOutline]);

  useEffect(() => {
    const scrollHost = editorRef.current?.closest<HTMLElement>(".node-tab-content")
      ?? editorRef.current?.closest<HTMLElement>(".workspace-pane__view--node")
      ?? editorRef.current?.closest<HTMLElement>(".workspace-main");
    const editor = editorRef.current;
    if (!scrollHost || !editor) return;
    let frame = 0;
    const updateThumb = () => {
      frame = 0;
      const thumb = thumbRef.current;
      if (!thumb) return;
      const viewport = scrollHost.clientHeight;
      const total = scrollHost.scrollHeight;
      const track = thumb.parentElement?.clientHeight ?? viewport;
      const scrollRange = Math.max(0, total - viewport);
      const height = scrollRange === 0 ? 0 : Math.max(24, Math.min(track, viewport / total * track));
      const travel = Math.max(0, track - height);
      const top = scrollRange === 0 ? 0 : Math.min(travel, Math.max(0, scrollHost.scrollTop / scrollRange * travel));
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translate3d(0, ${top}px, 0)`;
      thumb.style.visibility = height === 0 ? "hidden" : "visible";
    };
    const scheduleThumbUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(updateThumb);
    };
    const updateLayout = () => {
      scheduleThumbUpdate();
    };
    updateLayout();
    scrollHost.addEventListener("scroll", scheduleThumbUpdate, { passive: true });
    const observer = new ResizeObserver(updateLayout);
    observer.observe(scrollHost);
    // The viewport can stay the same size while typing, pasting, tables and
    // images change scrollHeight. Observing the content keeps the rail honest.
    observer.observe(editor);
    const page = editor.closest<HTMLElement>(".editor-page");
    if (page) observer.observe(page);
    return () => {
      scrollHost.removeEventListener("scroll", scheduleThumbUpdate);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editorRef, node.id]);

  useEffect(() => {
    setIndexOpen(false);
    setGraphOpen(false);
  }, [node.id]);

  useEffect(() => {
    if (!indexOpen && !graphOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (editorRef.current?.closest(".workspace-pane__view.is-hidden")) return;
      if (event.key !== "Escape" || editorRef.current?.closest(".workspace-pane")?.matches(":not(.is-focused)")) return;
      setIndexOpen(false);
      setGraphOpen(false);
    };
    const closeIndexOutside = (event: PointerEvent) => {
      const surface = editorRef.current?.closest(".node-tab-surface");
      if (surface && !surface.contains(event.target as Node)) return;
      if (indexOpen && !panelRef.current?.contains(event.target as Node) && !(event.target as Element).closest(".page-chrome__index-button")) setIndexOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeIndexOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeIndexOutside);
    };
  }, [graphOpen, indexOpen]);

  return (
    <div className="page-chrome" aria-label={t("nodes.page.nodeName")}>
      <div className="page-chrome__scroll-rail" aria-hidden="true">
        <span ref={thumbRef} className="page-chrome__scroll-thumb" />
      </div>

      <div className="page-chrome__zone page-chrome__zone--node-options">
        <button className="page-chrome__button" type="button" aria-label="Opciones de Nodo" title="Opciones de Nodo" onClick={(event) => onOpenNodeMenu({ x: event.clientX, y: event.clientY })}>
          <img src={nodeOptionsAsset} alt="" />
        </button>
      </div>

      <div className="page-chrome__zone page-chrome__zone--index">
        <button className="page-chrome__button page-chrome__index-button" type="button" aria-label={t("page.index")} title={t("page.index")} aria-expanded={indexOpen} onClick={() => { if (!indexOpen) refreshOutline(); setIndexOpen((open) => !open); }}>
          <img src={indexAsset} alt="" />
        </button>
      </div>

      {indexOpen && (
        <div ref={panelRef} className="page-chrome__index-panel" role="dialog" aria-label={t("page.index")}>
          <div className="page-chrome__panel-title">{t("page.index")}</div>
          {outline.length === 0 ? <div className="page-chrome__index-empty">{t("page.index.empty")}</div> : outline.map((entry, index) => (
            <button
              type="button"
              className="page-chrome__index-entry"
              style={{ paddingLeft: `${18 + Math.max(0, entry.level - 1) * 16}px`, ...entry.style }}
              key={`${entry.text}-${index}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                focusPageHeading(entry.element);
                setIndexOpen(false);
              }}
            >
              <span className="page-chrome__outline-label editor-content" aria-hidden="true" dangerouslySetInnerHTML={{ __html: entry.html }} />
            </button>
          ))}
        </div>
      )}

      <div className="page-chrome__zone page-chrome__zone--graph">
        <button className="page-chrome__button" type="button" aria-label={t("page.localGraph")} title={t("page.localGraph")} onClick={() => setGraphOpen(true)}><img src={graphAsset} alt="" /></button>
      </div>

      {graphOpen && (
        <div className="page-chrome__graph-backdrop" role="dialog" aria-label={t("page.localGraph")} onPointerDown={() => setGraphOpen(false)}>
          <div className="page-chrome__graph-panel" onPointerDown={(event) => event.stopPropagation()}>
            <div className="page-chrome__graph-title"><span>{t("page.localGraph")}</span><button type="button" onClick={() => setGraphOpen(false)} aria-label={t("common.actions.close")}>×</button></div>
            <Suspense fallback={<div className="page-chrome__index-empty">Cargando grafo…</div>}>
              <GraphView
                nodes={nodes}
                projectKey={`${projectKey}:local:${node.id}`}
                localRootId={node.id}
                onSelectNode={() => undefined}
                onClearSelection={() => undefined}
                onOpenNode={(id) => { setGraphOpen(false); onOpenNode(id); }}
                onOpenNodeMenu={() => undefined}
                readOnly
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
