import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { NodeItem } from "../../types/nodes";
import PageNodeChrome from "./chrome";
import { useForegroundLayers } from "../../hooks/useForegroundLayers";
import NodeSearchOverlay from "../../components/NodeSearchOverlay";

export type NodeMenuPosition = { x: number; y: number };
interface Props {
  node: NodeItem;
  nodes: NodeItem[];
  editorRef: RefObject<HTMLDivElement | null>;
  projectKey: string;
  children: ReactNode;
  showChrome: boolean;
  onOpenNode: (id: string) => void;
  renderMenu: (position: NodeMenuPosition, close: () => void, search: () => void) => ReactNode;
}

// Each mounted tab owns its controls, layers and search independently.
export default function NodeTabSurface({ node, nodes, editorRef, projectKey, children, showChrome, onOpenNode, renderMenu }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useForegroundLayers(surfaceRef);
  const [menu, setMenu] = useState<NodeMenuPosition | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      const surface = surfaceRef.current;
      const pane = surface?.closest(".workspace-pane");
      if (surface?.closest(".workspace-pane__view.is-hidden")) return;
      if (!surface || pane && !pane.classList.contains("is-focused")) return;
      if (!pane && !surface.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(true);
      const input = surface.querySelector<HTMLInputElement>(".node-search-overlay input");
      input?.focus(); input?.select();
    };
    window.addEventListener("keydown", search, true);
    return () => window.removeEventListener("keydown", search, true);
  }, []);
  useEffect(() => { setMenu(null); setSearchOpen(false); }, [node.id]);
  return <div ref={surfaceRef} className="node-tab-surface" data-node-tab={node.id}>
    <div className="node-tab-content">{children}</div>
    {showChrome && <PageNodeChrome node={node} nodes={nodes} editorRef={editorRef} projectKey={projectKey} onOpenNode={onOpenNode} onOpenNodeMenu={setMenu} />}
    {menu && renderMenu(menu, () => setMenu(null), () => setSearchOpen(true))}
    {searchOpen && <NodeSearchOverlay editorRef={editorRef} onClose={() => setSearchOpen(false)} />}
  </div>;
}
