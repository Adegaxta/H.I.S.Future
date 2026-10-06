import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/App.css';
import '../src/editor/styles.css';
import '../src/editor/table.css';
import '../src/ui/styles.css';
import '../src/nodes/iconStyles.css';
import RichTextEditor from '../src/editor/RichTextEditor';
import PageNodeChrome from '../src/nodes/page/chrome';
import '../src/nodes/page/styles.css';
const mentionRegression = new URLSearchParams(location.search).has('mentionRegression');
import { LocaleProvider, useLocale } from '../src/i18n/LocaleContext';
import { useWorkspaceNavigation } from '../src/hooks/useWorkspaceNavigation';
const initial = '<h1>Heading selection</h1>' + Array.from({length:100},(_,i)=>`<p data-test="p${i}">Block ${i} abcdef</p>`).join('') + '<p data-test="spelling">Esta es ortgrafía y así.</p><p data-test="english">This is helo world.</p><p data-test="mention">3. <span class="editor-mention" data-mention-id="B" contenteditable="false">Ziondehtia</span></p>';
function Fixture() {
  const {setLocale} = useLocale();
  const [id,setId] = useState('A');
  const [contents,setContents] = useState<Record<string,string>>({A:initial + (mentionRegression ? '<h2 data-test="mention-heading"><u>2. <span class="editor-mention" data-mention-id="B" contenteditable="false">Ziondehtia</span> Inicio</u></h2>' : ''),B:initial.replace('data-mention-id="B"','data-mention-id="A"')});
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const node = {id,name:id,type:'pagina' as const,parentId:null,order:0,content:contents[id]};
  const history = useWorkspaceNavigation({selectedId:id,selectedTrashId:null,navigateWithinView:()=>false,onNavigate:e=>setId(e.id),getScrollElement:()=>scroll.current});
  return <div style={{background:"#121417",color:"#e8e9ea",fontFamily:"Arial, sans-serif"}}><div style={{position:"relative",zIndex:10000,background:"white"}}><button onClick={()=>void setLocale("es")}>Español</button><button onClick={()=>void setLocale("en")}>English</button><button onClick={()=>{setId(id==='A'?'B':'A');}}>Visit</button><button onClick={history.back}>Back</button><button onClick={history.forward}>Forward</button><span id="node">{id}</span><output id="saved" style={{display:"none"}}>{contents[id]}</output></div><div ref={scroll} id="scroll" style={{height:400,overflow:'auto'}}><RichTextEditor node={node} nodes={[node,{...node,id: id === "A" ? "B" : "A",name:"Ziondehtia"}]} deletedNodes={[]} editorRef={ref} onContentChange={(key,html)=>setContents(c=>({...c,[key]:html}))} setSelectedId={setId} setExpanded={()=>{}} pendingNodeDrop={null} onNodeDropHandled={()=>{}} onOpenDeletedNode={()=>{}} onOpenNodeView={()=>{}} style={{}} /></div>{mentionRegression && <PageNodeChrome node={node} nodes={[node]} editorRef={ref} projectKey="fixture" onOpenNode={setId} onOpenNodeMenu={()=>{}} />}</div>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><Fixture /></LocaleProvider>);
