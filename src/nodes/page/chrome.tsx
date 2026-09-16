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

function useAutoHide(nodeId: string) {
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<number | null>(null);
  const schedule = useCallback((delay = 10_000) => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(false), delay);
  }, []);
  useEffect(() => {
    setVisible(true);
    schedule();
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [nodeId, schedule]);
  return {
    visible,
    reveal: () => {
      setVisible(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    release: () => schedule(1_800),
  };
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
  const controls = useAutoHide(node.id);
  const [indexOpen, setIndexOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [bounds, setBounds] = useState({ left: 0, top: 40 });
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
    const scrollHost = editorRef.current?.closest<HTMLElement>(".workspace-main");
    if (!scrollHost) return;
    const updateThumb = () => {
      const viewport = scrollHost.clientHeight;
      const total = scrollHost.scrollHeight;
      const height = total <= viewport ? 0 : Math.max(12, viewport / total * 100);
      const top = total <= viewport ? 0 : scrollHost.scrollTop / (total - viewport) * (100 - height);
      if (thumbRef.current) {
        thumbRef.current.style.top = `${top}%`;
        thumbRef.current.style.height = `${height}%`;
      }
    };
    const updateLayout = () => {
      const rect = scrollHost.getBoundingClientRect();
      setBounds((current) => current.left === rect.left && current.top === rect.top
        ? current
        : { left: rect.left, top: rect.top });
      updateThumb();
    };
    updateLayout();
    scrollHost.addEventListener("scroll", updateThumb, { passive: true });
    const observer = new ResizeObserver(updateLayout);
    observer.observe(scrollHost);
    return () => {
      scrollHost.removeEventListener("scroll", updateThumb);
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
      if (event.key !== "Escape") return;
      setIndexOpen(false);
      setGraphOpen(false);
    };
    const closeIndexOutside = (event: PointerEvent) => {
      if (indexOpen && !panelRef.current?.contains(event.target as Node) && !(event.target as Element).closest(".page-chrome__index-button")) setIndexOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeIndexOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeIndexOutside);
    };
  }, [graphOpen, indexOpen]);

  const visibilityClass = controls.visible ? " is-visible" : "";
  return (
    <div className="page-chrome" style={{ left: bounds.left, top: bounds.top }} aria-label={t("nodes.page.nodeName")}>
      <div className="page-chrome__scroll-rail" aria-hidden="true">
        <span ref={thumbRef} className="page-chrome__scroll-thumb" />
      </div>

      <div className={`page-chrome__zone page-chrome__zone--node-options${visibilityClass}`} onPointerEnter={controls.reveal} onPointerLeave={controls.release}>
        <button className="page-chrome__button" type="button" aria-label="Opciones de Nodo" title="Opciones de Nodo" onClick={(event) => onOpenNodeMenu({ x: event.clientX, y: event.clientY })}>
          <img src={nodeOptionsAsset} alt="" />
        </button>
      </div>

      <div className={`page-chrome__zone page-chrome__zone--index${visibilityClass}`} onPointerEnter={controls.reveal} onPointerLeave={controls.release}>
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
              <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: entry.html }} />
            </button>
          ))}
        </div>
      )}

      <div className={`page-chrome__zone page-chrome__zone--graph${visibilityClass}`} onPointerEnter={controls.reveal} onPointerLeave={controls.release}>
        <button className="page-chrome__button" type="button" aria-label={t("page.localGraph")} title={t("page.localGraph")} onClick={() => setGraphOpen(true)}><img src={graphAsset} alt="" /></button>
      </div>

      {graphOpen && (
        <div className="page-chrome__graph-backdrop" role="dialog" aria-modal="true" aria-label={t("page.localGraph")} onPointerDown={() => setGraphOpen(false)}>
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
                onCreateNode={() => ""}
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
