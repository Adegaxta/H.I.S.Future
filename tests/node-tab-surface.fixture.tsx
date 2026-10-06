import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import FileText from "lucide-react/dist/esm/icons/file-text.mjs";
import { WorkspaceSurface } from "../src/workspace/tabs/WorkspaceSurface";
import { ViewRegistry } from "../src/workspace/tabs/ViewRegistry";
import type { WorkspaceLayout } from "../src/workspace/tabs/model";
import NodeTabSurface from "../src/nodes/page/NodeTabSurface";
import NodeOptionsMenu from "../src/components/NodeOptionsMenu";
import { getNodalMeta, setNodalMeta } from "../src/nodes/metadata";
import { assignVaultPrimaryNode, reconcileVaultPrimary } from "../src/nodes/project/domain";
import { LocaleProvider } from "../src/i18n/LocaleContext";
import type { NodeItem } from "../src/types/nodes";
import "../src/App.css";
import "../src/nodes/styles.css";
import "../src/graph/styles.css";
import "../src/ui/styles.css";
const initial: NodeItem[] = [
  { id: "a", name: "Página A", type: "pagina", parentId: null, order: 0, content: "<h1>Título A</h1><p>Manzana alfa</p>" },
  { id: "b", name: "Proyecto B", type: "proyecto", parentId: null, order: 1, content: "<h1>Título B</h1><p>Naranja beta</p>" }
];
const layout: WorkspaceLayout = { version: 1, focusedPaneId: "left", root: { kind: "split", id: "split", direction: "horizontal", ratio: .5, children: initial.map((n,i) => ({kind:"pane",id:i?"right":"left",activeTabId:n.id,tabs:[{id:n.id,viewType:"node",resourceId:n.id}]})) as any } };
function NodeView({node,nodes,update}: {node:NodeItem;nodes:NodeItem[];update:(nodes:NodeItem[])=>void}) {
 const ref=useRef<HTMLDivElement>(null);
 const [layer,setLayer]=useState("");
 return <NodeTabSurface node={node} nodes={nodes} editorRef={ref} projectKey="test" showChrome onOpenNode={()=>{}}
 renderMenu={(pos,close,search)=><NodeOptionsMenu node={node} x={pos.x} y={pos.y} onClose={close} onSearch={search}
 onTogglePrimary={()=>update(reconcileVaultPrimary(getNodalMeta(node.content).role === "vault-primary" ? nodes.map(n=>n.id===node.id?{...n,content:setNodalMeta(n.content,{role:null,primaryDismissed:true})}:n) : assignVaultPrimaryNode(nodes,node.id),"Test"))}
 onToggleMeta={()=>{}} onCreateLink={()=>{}} onAddToFolder={()=>{}} onSaveTemplate={()=>{}} onLoadTemplate={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}} onExport={()=>{}} />}>
 <button onClick={()=>setLayer("tag")}>Probar Tags</button><button onClick={()=>setLayer("image")}>Probar selector</button>
 {layer === "tag" && <div className="tag-picker" style={{position:"absolute",top:90,left:400,width:360,padding:20,background:"#171b1d"}}><button onClick={()=>setLayer("")}>Cerrar prueba</button></div>}
 {layer === "image" && <div className="page-image-picker"><div className="page-image-picker__panel"><button onClick={()=>setLayer("")}>Cerrar prueba</button></div></div>}
 <div className="editor-page" style={{padding:40}}><div ref={ref} className="editor-content" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{__html:node.content}} /></div>
 </NodeTabSurface>;
}
function Fixture(){const [state,setState]=useState(layout);const [nodes,setNodes]=useState(initial);const registry=new ViewRegistry().register({type:"node",title:"Nodo",icon:FileText,resolveTitle:tab=>nodes.find(n=>n.id===tab.resourceId)?.name??"",renderer:tab=><NodeView node={nodes.find(n=>n.id===tab.resourceId)!} nodes={nodes} update={setNodes}/>});return <div style={{height:"100vh",background:"#121417"}}><WorkspaceSurface layout={state} registry={registry} onChange={setState}/><output id="state" hidden>{JSON.stringify(nodes)}</output></div>}
createRoot(document.getElementById("root")!).render(<LocaleProvider><Fixture/></LocaleProvider>);
