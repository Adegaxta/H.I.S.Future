import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {writeFile,mkdir} from 'node:fs/promises';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
const runs=[];let failure;
try{
 const {PersistenceQueue}=await server.ssrLoadModule('/src/lifecycle/PersistenceQueue.ts');
 const {mergeNodePersistenceRequests}=await server.ssrLoadModule('/src/lifecycle/nodePersistence.ts');
 for(let seed=1;seed<=300;seed++){
  let x=seed,active=0,maxActive=0,writes=0,rejections=0;const random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
  let persisted=new Map(),model=new Map();let injected=false;const trace=[];
  const queue=new PersistenceQueue(async request=>{active++;maxActive=Math.max(maxActive,active);try{await new Promise(r=>setTimeout(r,0));writes++;if(!injected&&seed%3===0&&writes===2){injected=true;throw Error('injected I/O failure');}if(request.kind==='full')persisted=new Map(request.nodes.map(n=>[n.id,n.content]));else for(const c of request.changes)persisted.set(c.id,c.content);}finally{active--; }},mergeNodePersistenceRequests);
  const pending=[];
  for(let i=0;i<100;i++){
   const full=i===0||random()<.12;const id=`node-${Math.floor(random()*10)}`,content=`${seed}:${i}:😀 e\u0301 中文`;let request;
   if(full){const nodes=Array.from({length:10},(_,j)=>({id:`node-${j}`,name:String(j),type:'pagina',parentId:null,order:j,content:model.get(`node-${j}`)??''}));nodes.find(n=>n.id===id).content=content;model=new Map(nodes.map(n=>[n.id,n.content]));request={kind:'full',nodes,deletedNodes:[],version:i};}
   else{model.set(id,content);request={kind:'content',changes:[{id,content}],version:i};}
   trace.push(request);pending.push(queue.enqueue(request).catch(()=>rejections++));
   if(random()<.2){await Promise.all(pending);await queue.flush();assert.deepEqual([...persisted].sort(),[...model].sort());}
  }
  await Promise.all(pending);await queue.flush();assert.deepEqual([...persisted].sort(),[...model].sort());assert.equal(maxActive,1);assert.equal(queue.hasPendingWrites(),false);runs.push({seed,actions:100,writes,rejections,maxActive,status:'pass'});
 }
 console.log('PASS persistence model: 300 seeds × 100 actions; serial writes, full/incremental merge, injected failure/retry');
}catch(e){failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}finally{await mkdir('tests/editor-audit/results',{recursive:true});await writeFile('tests/editor-audit/results/persistence-model.json',JSON.stringify({runs,failure},null,2));await server.close();}
