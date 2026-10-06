import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const results='tests/editor-audit/results';await mkdir(results,{recursive:true});
let server;try{await fetch('http://localhost:1420/');}catch{server=await createServer({cacheDir:'node_modules/.vite/editor-audit-native',server:{host:'localhost',port:1420,strictPort:true}});await server.listen();}
const profile=await mkdtemp(join(tmpdir(),'his-editor-audit-'));
const app=spawn('src-tauri/target/debug/hisfuture.exe',[],{windowsHide:true,env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9248'}});
const nativeLogs=[],errors=[],warnings=[],cycles=[],ui=[],findings=[];let browser,project,failed;
app.stdout.on('data',d=>nativeLogs.push(d.toString()));app.stderr.on('data',d=>nativeLogs.push(d.toString()));
try{
 for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9248');break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(browser,'Isolated WebView CDP');
 const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push({type:m.type(),text:m.text()});});
 await page.goto('http://localhost:1420/');await page.locator('.home-action--quick-dev button').click();await page.locator('[data-node-id]').first().waitFor();
 project=await page.evaluate(async()=>{const {invoke}=await import('/node_modules/@tauri-apps/api/core.js');return invoke('current_project');});
 const expectedRoot=resolve(tmpdir(),`hisfuture-dev-${app.pid}`);assert.ok(resolve(project.folderPath).toLowerCase().startsWith(`${expectedRoot.toLowerCase()}\\`),'Quick start must use this test process temporary vault');console.log('ISOLATED VAULT',project.folderPath);
 const openAudit=async()=>{await page.getByRole('button',{name:'LORE',exact:true}).click();if(!await page.locator('[data-node-id="audit-page-ui"]').count())await page.locator('[data-node-id] .lore-node__expand:not(.lore-node__expand--placeholder)').first().click();await page.locator('[data-node-id="audit-page-ui"]').click();await page.locator('.editor-content').first().waitFor();};
 await page.route('**/native-audit-blank',route=>route.fulfill({contentType:'text/html',body:'<html><body>Isolated repository audit</body></html>'}));await page.goto('http://localhost:1420/native-audit-blank');
 await page.evaluate(async()=>{const {invoke}=await import('/node_modules/@tauri-apps/api/core.js');const nodes=await invoke('list_nodes');nodes.push({id:'audit-page-ui',name:'Audit Página',type:'pagina',parentId:nodes[0].id,order:100,content:'<p>Inicio audit</p>'});await invoke('save_nodes',{nodes,hiddenIds:[],deletedNodes:'[]'});await invoke('close_project');});await page.goto('http://localhost:1420/');await page.locator('.home-action--quick-dev button').click();await openAudit();
 const selectedId=await page.locator('.editor-content').first().getAttribute('data-active-id');
 // Actual editor input -> lifecycle Ctrl+S -> SQLite read -> frontend unload -> quick start reopen.
 for(let cycle=0;cycle<5;cycle++){
  const value=`Audit ${cycle}: español e\u0301 😀 👨‍👩‍👧‍👦 中文 日本語 مرحبا & símbolo`;
  await page.locator('.editor-content').first().evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.keyboard.insertText(value);const typed=await page.locator('.editor-content').first().textContent();console.log('TYPED',typed);
  if(!typed.replace(/\u00a0/g,' ').includes(value)){await page.locator('.editor-content').first().evaluate((e,value)=>{const d=new DataTransfer();d.setData('text/plain',value);e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));},value);}
  await page.keyboard.press('Control+s');await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true})));
  let persisted;for(let attempt=0;attempt<100;attempt++){persisted=await page.evaluate(async id=>(await (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes')).find(n=>n.id===id).content,selectedId);const plain=await page.evaluate(html=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent.replace(/\u00a0/g,' ');},persisted);if(plain.includes(value))break;await page.waitForTimeout(100);}assert.ok(await page.evaluate(({html,value})=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent.replace(/\u00a0/g,' ').includes(value);},{html:persisted,value}),`Editor change not saved: ${persisted}`);
  const before=await page.evaluate(async id=>(await (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes')).find(n=>n.id===id).content,selectedId);
  await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/core.js')).invoke('close_project'));await page.reload();await page.locator('.home-action--quick-dev button').click();await openAudit();
  const after=await page.evaluate(async id=>(await (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes')).find(n=>n.id===id).content,selectedId);assert.equal(after,before);ui.push({cycle,value,before,after,editors:await page.locator('.editor-content').evaluateAll(es=>es.map(e=>({id:e.getAttribute('data-active-id'),text:e.textContent,html:e.innerHTML})))});console.log('REOPEN EDITORS',JSON.stringify(ui.at(-1).editors).slice(0,1500));await page.waitForFunction(({id,value})=>{const e=document.querySelector(`[data-active-id="${id}"]`);return e?.textContent.replace(/\u00a0/g,' ').includes(value);},{id:selectedId,value},{timeout:10000});const dom=await page.locator('.editor-content').first().innerHTML();ui.push({cycle,value,before,after,dom});console.log('UI SQLITE REOPEN',cycle);
 }
 for(const example of [{id:'SANITIZE_TEXT',mime:'text/html',input:'<p>L&lt;literal&gt;R</p>',expected:'L<literal>R'},{id:'PLAIN_TEXT_HTML_DECODE',mime:'text/plain',input:'L<b>B</b>R',expected:'L<b>B</b>R'}]){
  await page.locator('.editor-content').first().evaluate((e,example)=>{e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);const d=new DataTransfer();d.setData(example.mime,example.input);e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));},example);await page.waitForTimeout(600);const actual=await page.locator('.editor-content').first().textContent();await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true})));await page.waitForTimeout(800);
  const stored=await page.evaluate(async id=>(await (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes')).find(n=>n.id===id).content,selectedId);await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/core.js')).invoke('close_project'));await page.reload();await page.locator('.home-action--quick-dev button').click();await openAudit();const reopened=await page.locator('.editor-content').first().textContent();findings.push({...example,actual,stored,reopened,confirmed:actual!==example.expected&&reopened===actual,seed:347});console.log('NATIVE FINDING',example.id,JSON.stringify({actual,reopened}));
 }
 await page.locator('.editor-content').first().evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);const d=new DataTransfer();d.setData('text/html','<p>antes <span data-mention-id="vault-primary">Proyecto</span> después</p>');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));});await page.waitForTimeout(100);
 await page.locator('.editor-content').first().evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));});await page.waitForTimeout(80);const mentionBefore=await page.locator('.editor-content [data-mention-id]').first().evaluate(e=>({html:e.outerHTML,editable:e.contentEditable,selected:e.hasAttribute('data-mention-selected')}));
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true})));await page.waitForTimeout(800);const mentionStored=await page.evaluate(async id=>(await (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes')).find(n=>n.id===id).content,selectedId);
 await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/core.js')).invoke('close_project'));await page.reload();await page.locator('.home-action--quick-dev button').click();await openAudit();const mentionAfter=await page.locator('.editor-content [data-mention-id]').first().evaluate(e=>({html:e.outerHTML,editable:e.contentEditable,inheritsEditable:e.isContentEditable}));findings.push({id:'MENTION_SELECTED_SERIALIZATION',seed:3,before:mentionBefore,stored:mentionStored,after:mentionAfter,confirmed:mentionBefore.editable==='false'&&mentionAfter.editable!=='false',expected:'contentEditable false after reopening selected mention'});console.log('NATIVE FINDING MENTION_SELECTED_SERIALIZATION',JSON.stringify(mentionAfter));
 // Unload React before repository torture so automatic app writes cannot race the test oracle.
 await page.route('**/native-audit-blank',route=>route.fulfill({contentType:'text/html',body:'<html><body>Isolated repository audit</body></html>'}));await page.goto('http://localhost:1420/native-audit-blank');
 const torture=await page.evaluate(async()=>{
  const {invoke}=await import('/node_modules/@tauri-apps/api/core.js');const info=await invoke('current_project');const original=await invoke('list_nodes');
  const glyphs=['','x','😀','👨‍👩‍👧‍👦','e\u0301','中文','日本語','مرحبا','&lt;literal&gt;','a\tb\nc','https://example.test'];
  const nodes=original.concat(Array.from({length:80},(_,i)=>({id:`audit-${i}`,name:`Audit ${i}`,type:'pagina',parentId:original[0].id,order:i,content:`<h1>Seed ${938271+i}</h1><p>${glyphs[i%glyphs.length].repeat(i===2?100000:1+i)}</p><ul><li>uno</li><li><u>dos</u></li></ul><p><span class="editor-mention" data-mention-id="audit-0" contenteditable="false">Audit 0</span></p>`})));
  await invoke('save_nodes',{nodes,hiddenIds:[],deletedNodes:'[]'});const cycles=[];
  for(let cycle=0;cycle<40;cycle++){
   const changes=nodes.filter((n,i)=>/^audit-\d+$/.test(n.id)&&i%4===cycle%4).map(n=>{n.content+=`<p>cycle ${cycle} / 中文😀 e\u0301</p>`;return {id:n.id,content:n.content};});
   const start=performance.now();await invoke('save_node_contents',{changes});await invoke('close_project');await invoke('open_project',{path:info.folderPath});const loaded=await invoke('list_nodes');
   const mismatch=nodes.filter(n=>loaded.find(x=>x.id===n.id)?.content!==n.content).map(n=>n.id);cycles.push({cycle,seed:938271,changed:changes.length,bytes:nodes.reduce((s,n)=>s+n.content.length,0),ms:performance.now()-start,mismatch});if(mismatch.length)throw Error(`SQLite mismatch ${cycle}: ${mismatch}`);
  }
  return {cycles,nodes,originalCount:original.length};
 });cycles.push(...torture.cycles);assert.equal(cycles.length,40);assert.deepEqual(errors,[]);await writeFile(`${results}/native-final-nodes.json`,JSON.stringify(torture.nodes));console.log('SQLITE TORTURE',cycles.length,'cycles',torture.nodes.length,'nodes');
 await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/core.js')).invoke('close_project'));
}catch(e){failed={message:e.message,stack:e.stack};console.error(e);}finally{
 await writeFile(`${results}/native-report.json`,JSON.stringify({project,pid:app.pid,profile,cycles,ui,findings,errors,warnings,failed,nativeLogs},null,2));await browser?.close();if(app.exitCode===null){const ended=new Promise(r=>app.once('exit',r));app.kill();await ended;}await rm(profile,{recursive:true,force:true}).catch(()=>{});await server?.close();if(failed)process.exitCode=1;
}
