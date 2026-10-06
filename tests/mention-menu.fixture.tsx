import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import RichTextEditor from "../src/editor/RichTextEditor";
import { LocaleProvider } from "../src/i18n/LocaleContext";
import type { NodeItem } from "../src/types/nodes";
import "../src/App.css";
import "../src/editor/styles.css";
import "../src/editor/table.css";
import "../src/ui/styles.css";
import "../src/nodes/iconStyles.css";
const initial: NodeItem[] = [
  { id: "source", name: "Origen", type: "pagina", parentId: null, order: 0, content: "<p>Escribir aquí: </p>" },
  ...Array.from({ length: 5 }, (_, i): NodeItem => ({ id: `dest${i}`, name: `Destino ${i}`, type: "pagina", parentId: null, order: i + 1, content: `<p>Contenido ${i}</p>` })),
  { id: "child", name: "Hijo vinculado", type: "pagina", parentId: "dest0", order: 0, content: "<p>Hijo</p>" },
];
function Fixture() {
  const [nodes, setNodes] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState("source");
  const node = nodes.find(n => n.id === activeId)!;
  const create = (name: string, parentId: string | null) => {
    const added: NodeItem = { id: crypto.randomUUID(), name, parentId, type: "pagina", order: nodes.filter(n => n.parentId === parentId).length, content: "" };
    setNodes(current => [...current, added]); return added;
  };
  return <div style={{ padding: "140px 70px", minHeight: "100vh", background: "#121417", color: "#e8e9ea", fontFamily: "Segoe UI" }}>
    <button onClick={() => setActiveId("dest0")}>Abrir destino</button>
    <button onClick={() => setActiveId("source")}>Volver al origen</button>
    <RichTextEditor node={node} nodes={nodes} recentNodes={[nodes[3], nodes[1], nodes[2], nodes[4], nodes[5]]} deletedNodes={[]} editorRef={ref}
      onCreateMentionNode={create} onContentChange={(id, content) => setNodes(current => current.map(n => n.id === id ? { ...n, content } : n))}
      setSelectedId={() => {}} setExpanded={() => {}} pendingNodeDrop={null} onNodeDropHandled={() => {}} onOpenDeletedNode={() => {}} onOpenNodeView={() => {}} style={{}} />
    <output id="state" style={{ display: "none" }}>{JSON.stringify(nodes)}</output>
  </div>;
}
createRoot(document.getElementById("root")!).render(<LocaleProvider><Fixture /></LocaleProvider>);
