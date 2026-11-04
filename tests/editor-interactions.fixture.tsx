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
const dividerRegression = new URLSearchParams(location.search).has('dividerRegression');
const indexRegression = new URLSearchParams(location.search).has('indexRegression');
const dualRegression = new URLSearchParams(location.search).has('dualRegression');
const paneFocusRegression = new URLSearchParams(location.search).has('paneFocusRegression');
import { LocaleProvider, useLocale } from '../src/i18n/LocaleContext';
import { useWorkspaceNavigation } from '../src/hooks/useWorkspaceNavigation';
const initial = indexRegression
  ? '<p>Before</p><p data-test="index-target"><br></p><p>After</p>'
  : dividerRegression
  ? '<p>Before</p><p data-test="divider-target"><br></p><p>After</p><p data-test="divider-inline">Keep / tail</p>'
  : dualRegression
  ? '<div data-globe="true" style="color: rgb(255, 128, 0)"><span data-globe-icon="true" contenteditable="false">◉</span><div data-globe-content="true"><p data-test="split-first" data-his-highlighted="true" style="background-color: rgb(250, 230, 100)">First page text</p></div></div>'
  : '<h1>Heading selection</h1>' + Array.from({length:100},(_,i)=>`<p data-test="p${i}">Block ${i} abcdef</p>`).join('') + '<p data-test="spelling">Esta es ortgrafía y así.</p><p data-test="english">This is helo world.</p><p data-test="mention">3. <span class="editor-mention" data-mention-id="B" contenteditable="false">Ziondehtia</span></p>';
function Fixture() {
  const {setLocale} = useLocale();
  const [id,setId] = useState('A');
  const [contents,setContents] = useState<Record<string,string>>({A:initial + (mentionRegression ? '<h2 data-test="mention-heading"><u>2. <span class="editor-mention" data-mention-id="B" contenteditable="false">Ziondehtia</span> Inicio</u></h2>' : ''),B:initial.replace('data-mention-id="B"','data-mention-id="A"')});
  const ref = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const firstPaneScroll = useRef<HTMLDivElement>(null);
  const secondPaneScroll = useRef<HTMLDivElement>(null);
  const node = {id,name:id,type:'pagina' as const,parentId:null,order:0,content:contents[id]};
  const secondNode = {id:'C',name:'Second page',type:'pagina' as const,parentId:null,order:1,content:contents.C ?? '<p data-test="split-second">Second page text</p>'};
  const history = useWorkspaceNavigation({selectedId:id,selectedTrashId:null,navigateWithinView:()=>false,onNavigate:e=>setId(e.id),getScrollElement:()=>paneFocusRegression ? id === 'A' ? firstPaneScroll.current : secondPaneScroll.current : scroll.current});
  const focusFixturePane = (nextId: string) => {
    if (id === nextId) return;
    history.ignoreNextNavigation({kind:'node',id:nextId});
    setId(nextId);
  };
  const renderEditor = (editorNode: typeof node, editorRef: typeof ref, editorNodes: (typeof node)[] = [editorNode,{...editorNode,id:editorNode.id === "A" ? "B" : "A",name:"Ziondehtia"}]) => <RichTextEditor node={editorNode} nodes={editorNodes} deletedNodes={[]} editorRef={editorRef} onContentChange={(key,html)=>setContents(c=>({...c,[key]:html}))} setSelectedId={setId} setExpanded={()=>{}} pendingNodeDrop={null} onNodeDropHandled={()=>{}} onOpenDeletedNode={()=>{}} onOpenNodeView={()=>{}} style={{}} />;
  const firstPaneNode = {...node, id:'A', name:'First page', content:contents.A};
  const secondPaneNode = {...secondNode, content:contents.C ?? (paneFocusRegression ? Array.from({length:60},(_,i)=>`<p data-test="pane-second-${i}">Second page block ${i}</p>`).join('') : '<p data-test="split-second">Second page text</p>')};
  const paneFocusView = <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,height:400}}>
    {[{key:'A',node:firstPaneNode,editorRef:ref,scrollRef:firstPaneScroll},{key:'C',node:secondPaneNode,editorRef:secondRef,scrollRef:secondPaneScroll}].map(pane=>
      <section key={pane.key} className={`workspace-pane${id===pane.key?' is-focused':''}`} onPointerDownCapture={()=>focusFixturePane(pane.key)}>
        <div className="workspace-pane__view workspace-pane__view--node is-active"><div ref={pane.scrollRef} className="node-tab-content" style={{height:400,overflow:'auto'}}>{renderEditor(pane.node,pane.editorRef,[pane.node])}</div></div>
      </section>)}
  </div>;
  return <div style={{background:"#121417",color:"#e8e9ea",fontFamily:"Arial, sans-serif"}}><div style={{position:"relative",zIndex:10000,background:"white"}}><button onClick={()=>void setLocale("es")}>Español</button><button onClick={()=>void setLocale("en")}>English</button><button onClick={()=>{setId(id==='A'?'B':'A');}}>Visit</button><button onClick={history.back}>Back</button><button onClick={history.forward}>Forward</button><span id="node">{id}</span><output id="saved" style={{display:"none"}}>{contents[id]}</output></div><div ref={scroll} id="scroll" style={{height:400,overflow:'auto'}}>{paneFocusRegression ? paneFocusView : dualRegression ? <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div>{renderEditor(node,ref)}</div><div>{renderEditor(secondNode,secondRef)}</div></div> : renderEditor(node,ref)}</div>{mentionRegression && <PageNodeChrome node={node} nodes={[node]} editorRef={ref} projectKey="fixture" onOpenNode={setId} onOpenNodeMenu={()=>{}} />}</div>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><Fixture /></LocaleProvider>);
