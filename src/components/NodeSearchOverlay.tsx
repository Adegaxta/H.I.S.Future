import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

interface Props { editorRef: RefObject<HTMLDivElement | null>; initialQuery?: string; onClose: () => void; }
type Match = { node: Text; start: number; end: number };
type HighlightRegistry = {
  set: (name: string, value: unknown) => void;
  delete: (name: string) => void;
};

function setHighlight(registry: HighlightRegistry | undefined, name: string, ranges: Range[]): void {
  if (!registry || !ranges.length) return;
  const HighlightConstructor = (globalThis as typeof globalThis & {
    Highlight?: new (...ranges: Range[]) => unknown;
  }).Highlight;
  if (!HighlightConstructor) return;
  registry.set(name, new HighlightConstructor(...ranges));
}

function collectMatches(editor: HTMLElement, query: string): Match[] {
  if (!query.trim()) return [];
  const needle = query.toLocaleLowerCase();
  const matches: Match[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const node = current as Text;
    if (node.parentElement?.closest("[data-editor-ui]")) continue;
    const value = node.data.toLocaleLowerCase();
    let start = value.indexOf(needle);
    while (start >= 0) { matches.push({ node, start, end: start + needle.length }); start = value.indexOf(needle, start + needle.length); }
  }
  return matches;
}
export default function NodeSearchOverlay({ editorRef, initialQuery = "", onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => editorRef.current ? collectMatches(editorRef.current, query) : [], [editorRef, query]);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  useEffect(() => {
    setActive(0);
    const css = (globalThis.CSS as unknown as { highlights?: HighlightRegistry }).highlights;
    const ranges = matches.map((match) => { const range = document.createRange(); range.setStart(match.node, match.start); range.setEnd(match.node, match.end); return range; });
    css?.delete("his-search"); css?.delete("his-search-active");
    setHighlight(css, "his-search", ranges);
    const activeMatch = matches[0];
    if (activeMatch) { const range = document.createRange(); range.setStart(activeMatch.node, activeMatch.start); range.setEnd(activeMatch.node, activeMatch.end); setHighlight(css, "his-search-active", [range]); activeMatch.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" }); }
    return () => { css?.delete("his-search"); css?.delete("his-search-active"); };
  }, [matches]);
  const move = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (active + direction + matches.length) % matches.length;
    setActive(next);
    const match = matches[next];
    match.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    const css = (globalThis.CSS as unknown as { highlights?: HighlightRegistry }).highlights;
    if (css) { const range = document.createRange(); range.setStart(match.node, match.start); range.setEnd(match.node, match.end); setHighlight(css, "his-search-active", [range]); }
  };
  return <div className="node-search-overlay" role="search" aria-label="Buscar en este Nodo" onKeyDown={(event) => { if (event.key === "Escape") onClose(); else if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }}><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en este Nodo..." aria-label="Buscar en este Nodo" /><span>{matches.length ? `${active + 1}/${matches.length}` : "0/0"}</span><button type="button" onClick={() => move(-1)} aria-label="Coincidencia anterior">↑</button><button type="button" onClick={() => move(1)} aria-label="Coincidencia siguiente">↓</button><button type="button" onClick={onClose} aria-label="Cerrar búsqueda">×</button></div>;
}
