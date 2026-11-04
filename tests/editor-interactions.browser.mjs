import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite/editor-interactions',esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,include:['react/jsx-dev-runtime','react/jsx-runtime','nspell','react','react-dom','react-dom/client','lucide-react','lucide-react/dynamicIconImports']},server:{port:5199,host:'127.0.0.1'},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/interaction-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/interaction-fixture','<div id="root"></div><script type="module" src="/tests/editor-interactions.fixture.tsx"></script>'));});}}]});
await server.listen(); console.log('Fixture server ready');
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(); page.setDefaultTimeout(60000); console.log('Browser ready');
 page.on('pageerror',e=>console.error(e));
 await page.goto('http://127.0.0.1:5199/interaction-fixture',{waitUntil:'commit'}); console.log('HTML ready');
 await page.locator('[data-test="p50"]').waitFor(); console.log('Editor ready');
 await page.locator('#scroll').evaluate(e=>e.scrollTop=1600);
 const before=await page.locator('#scroll').evaluate(e=>e.scrollTop);
 for(const i of [50,51,52,51]) {
  await page.locator(`[data-test="p${i}"]`).evaluate(e=>{e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true,button:0,buttons:1}));e.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));});
  assert.equal(await page.locator('#scroll').evaluate(e=>e.scrollTop),before);
 }
 assert.deepEqual(await page.locator('[data-line-selected]').evaluateAll(es=>es.map(e=>e.getAttribute('data-test'))),['p50','p52']);
 await page.reload(); await page.locator('[data-test="p0"]').waitFor();
 await page.locator('[data-test="p0"]').evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);const d=new DataTransfer();d.setData('text/plain','123');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));});
 assert.equal(await page.locator('.editor-content p').first().textContent(),'123');
 await page.keyboard.press('Control+z');
 assert.equal(await page.locator('.editor-content p').first().textContent(),'Block 0 abcdef');
 await page.keyboard.press('Control+y');
 assert.equal(await page.locator('.editor-content p').first().textContent(),'123');
 await page.locator('[data-test="p1"]').evaluate(e=>{
  e.focus();const r=document.createRange();r.setStart(e.firstChild,e.textContent.length-6);r.setEnd(e.firstChild,e.textContent.length);const s=getSelection();s.removeAllRanges();s.addRange(r);const d=new DataTransfer();d.setData('text/plain','xyz');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));
 });
 assert.equal((await page.locator('[data-test="p1"]').textContent()).replace(/\u00a0/g,' '),'Block 1 xyz');
 await page.locator('[data-test="p2"]').evaluate(e=>{
  e.focus();const r=document.createRange();r.setStart(e.firstChild,0);r.setEnd(e.firstChild,5);const s=getSelection();s.removeAllRanges();s.addRange(r);const d=new DataTransfer();d.setData('text/html','<strong>NEW</strong>');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));
 });
 assert.equal((await page.locator('[data-test="p2"]').textContent()).replace(/\u00a0/g,' '),'NEW 2 abcdef');
 assert.equal(await page.locator('[data-test="p2"] strong').textContent(),'NEW');
 assert.equal(await page.evaluate(()=>getSelection().isCollapsed),true);
 assert.doesNotMatch(await page.locator('#saved').textContent(),/data-editor-block-identity|data-line-selected/);
 await page.locator('h1').dblclick();
 await page.waitForTimeout(150);
 assert.ok(await page.evaluate(()=>getSelection().toString().length>0));
 await page.evaluate(()=>getSelection().removeAllRanges());
 await page.locator('[data-selection-toolbar]').waitFor({state:'hidden'});
 await page.locator('#scroll').evaluate(e=>e.scrollTop=1800);
 await page.getByRole('button',{name:'Visit',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#node').textContent==='B');
 await page.locator('#scroll').evaluate(e=>e.scrollTop=900);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#scroll').scrollTop===1800);
 await page.getByRole('button',{name:'Forward',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#scroll').scrollTop===900);
 await page.goto('http://127.0.0.1:5199/interaction-fixture?dividerRegression',{waitUntil:'domcontentloaded'});
 const editor=page.locator('.editor-content');
 await page.locator('[data-test="divider-target"]').waitFor();
 await page.locator('[data-test="divider-target"]').click();
 await page.keyboard.type('/divisor');
 await page.locator('[data-picker-menu-item="divider"]').waitFor();
 await page.locator('[data-picker-menu-item="divider"]').click();
 assert.deepEqual(await editor.evaluate(e=>Array.from(e.children).map(block=>({
  tag:block.tagName,
  divider:block.hasAttribute('data-divider'),
  text:block.textContent.trim(),
 }))),[
  {tag:'P',divider:false,text:'Before'},
  {tag:'DIV',divider:true,text:''},
  {tag:'P',divider:false,text:'After'},
  {tag:'P',divider:false,text:'Keep / tail'},
 ]);
 await page.locator('[data-test="divider-inline"]').click();
 await page.locator('[data-test="divider-inline"]').evaluate(e=>{
  const range=document.createRange();range.setStart(e.firstChild,6);range.collapse(true);
  const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
 });
 await page.keyboard.type('divisor');
 await page.locator('[data-picker-menu-item="divider"]').waitFor();
 await page.locator('[data-picker-menu-item="divider"]').click();
 assert.deepEqual(await editor.evaluate(e=>Array.from(e.children).slice(-3).map(block=>({
  tag:block.tagName,
  divider:block.hasAttribute('data-divider'),
  text:block.textContent.trim(),
 }))),[
  {tag:'P',divider:false,text:'Keep'},
  {tag:'DIV',divider:true,text:''},
  {tag:'P',divider:false,text:'tail'},
 ]);
  console.log('PASS: divider replaces its command block, reuses the following paragraph, and preserves trailing text.');
  await page.goto('http://127.0.0.1:5199/interaction-fixture?indexRegression',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Español',exact:true}).click();
  await page.locator('[data-test="index-target"]').click();
  await page.keyboard.type('/indice');
  await page.locator('[data-picker-menu-item="index"]').waitFor();
  await page.locator('[data-picker-menu-item="index"]').click();
  const pageIndex=editor.locator('[data-page-index]');
  await pageIndex.locator('.editor-page-index__empty').waitFor();
  assert.equal(await pageIndex.textContent(),'Esta página aún no tiene títulos.');
  await editor.evaluate(e=>{
   const heading=document.createElement('h2');heading.textContent='Primer título';
   e.appendChild(heading);
  });
  await pageIndex.locator('[data-page-index-item]').filter({hasText:'Primer título'}).waitFor();
  assert.equal(await pageIndex.locator('.editor-page-index__empty').count(),0);
  console.log('PASS: empty generated index shows a localized message and updates when a heading is added.');
  await page.setViewportSize({width:1400,height:900});
  await page.goto('http://127.0.0.1:5199/interaction-fixture?dualRegression',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Español',exact:true}).click();
  const secondBlock=page.locator('[data-test="split-second"]');
  await secondBlock.waitFor();
  const secondRect=await secondBlock.boundingBox();
  await page.mouse.move(secondRect.x+secondRect.width/2,secondRect.y+secondRect.height/2);
  const optionsButton=page.locator('.editor-line-control-menu').last();
  await optionsButton.waitFor();
  const optionsRect=await optionsButton.boundingBox();
  await page.mouse.move(optionsRect.x+optionsRect.width/2,optionsRect.y+optionsRect.height/2);
  await page.mouse.down();
  await page.waitForTimeout(240);
  assert.equal(await page.locator('[data-line-dragging="true"]').count(),0);
  await page.mouse.up();
  const blockMenu=page.locator('.page-context-menu');
  await blockMenu.waitFor();
  const menuLayer=page.locator('.page-context-menu-layer');
  const originalMenuPosition=await menuLayer.evaluate(element=>({left:element.style.left,top:element.style.top}));
  await blockMenu.getByRole('button',{name:'Estética',exact:true}).hover();
  await page.locator('.page-context-menu__aesthetics').waitFor();
  await page.waitForTimeout(150);
  assert.deepEqual(await menuLayer.evaluate(element=>({left:element.style.left,top:element.style.top})),originalMenuPosition);
  const capability=page.locator('.page-context-menu__capability').first();
  const checkedBefore=await capability.getAttribute('aria-checked');
  await capability.click();
  assert.notEqual(await capability.getAttribute('aria-checked'),checkedBefore);
  await page.keyboard.press('Escape');
  const sourceEditor=page.locator('.editor-content').first();
  const sourceGlobe=sourceEditor.locator('[data-globe]');
  const clipboard=await sourceGlobe.evaluate(globe=>{
   const range=document.createRange();range.selectNode(globe);
   const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
   const data=new DataTransfer();
   globe.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
   return {html:data.getData('text/html'),text:data.getData('text/plain')};
  });
  assert.match(clipboard.html,/data-globe=/);
  await secondBlock.evaluate((block,data)=>{
   block.focus();
   const range=document.createRange();range.selectNodeContents(block);range.collapse(false);
   const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
   const pasteData=new DataTransfer();pasteData.setData('text/html',data.html);pasteData.setData('text/plain',data.text);
   block.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:pasteData}));
  },clipboard);
  const targetEditor=page.locator('.editor-content').nth(1);
  await targetEditor.locator('[data-globe]').waitFor();
  assert.equal(await targetEditor.locator('[data-globe] [data-his-highlighted="true"]').count(),1);
  assert.equal(await targetEditor.locator('[data-globe]').last().evaluate(globe=>globe.style.color),'rgb(255, 128, 0)');
  await sourceGlobe.hover({position:{x:4,y:4}});
  const sourceMenuButton=page.locator('.editor-line-control-menu').last();
  await sourceMenuButton.waitFor();
  const dragHandle=await sourceMenuButton.boundingBox();
  const destination=await secondBlock.boundingBox();
  await page.mouse.move(dragHandle.x+dragHandle.width/2,dragHandle.y+dragHandle.height/2);
  await page.mouse.down();
  await page.mouse.move(destination.x+destination.width/2,destination.y+destination.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelectorAll('.editor-content').length===2&&
   document.querySelectorAll('.editor-content').item(0).querySelectorAll('[data-globe]').length===0&&
   document.querySelectorAll('.editor-content').item(1).querySelectorAll('[data-globe]').length===2);
  assert.equal(await targetEditor.locator('[data-globe] [data-his-highlighted="true"]').count(),2);
  const duplicate=targetEditor.locator('[data-globe]').last();
  await duplicate.hover({position:{x:4,y:4}});
  const duplicateHandle=page.locator('.editor-line-control-menu').last();
  await duplicateHandle.waitFor();
  const duplicateRect=await duplicateHandle.boundingBox();
  const sourceTarget=sourceEditor.locator('p').last();
  await sourceTarget.waitFor();
  const sourceRect=await sourceTarget.boundingBox();
  await page.mouse.move(duplicateRect.x+duplicateRect.width/2,duplicateRect.y+duplicateRect.height/2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(sourceRect.x+sourceRect.width/2,sourceRect.y+sourceRect.height/2,{steps:8});
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForFunction(()=>document.querySelectorAll('.editor-content').item(0).querySelectorAll('[data-globe]').length===1);
  assert.equal(await targetEditor.locator('[data-globe]').count(),2);
  await page.evaluate(()=>{
   const destination=document.querySelectorAll('.editor-content').item(1);
   const resourceId=destination.getAttribute('data-active-id');
   destination.parentElement.style.display='none';
   const tab=document.createElement('button');
   tab.className='workspace-tab';
   tab.dataset.resourceId=resourceId;
   tab.style.cssText='position:fixed;left:700px;top:16px;z-index:100000;width:120px;height:32px';
   document.body.appendChild(tab);
  });
  const tabDropSource=sourceEditor.locator('[data-globe]').last();
  await tabDropSource.hover({position:{x:4,y:4}});
  const tabDropHandle=page.locator('.editor-line-control-menu').last();
  await tabDropHandle.waitFor();
  const tabDropHandleRect=await tabDropHandle.boundingBox();
  await page.mouse.move(tabDropHandleRect.x+tabDropHandleRect.width/2,tabDropHandleRect.y+tabDropHandleRect.height/2);
  await page.mouse.down();
  await page.mouse.move(760,32,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelectorAll('.editor-content').item(0).querySelectorAll('[data-globe]').length===0&&
   document.querySelectorAll('.editor-content').item(1).querySelectorAll('[data-globe]').length===3);
  const cancelTarget=sourceEditor.locator('p').first();
  await cancelTarget.hover();
  const cancelHandle=page.locator('.editor-line-control-menu').last();
  await cancelHandle.waitFor();
  const cancelRect=await cancelHandle.boundingBox();
  await page.mouse.move(cancelRect.x+cancelRect.width/2,cancelRect.y+cancelRect.height/2);
  await page.mouse.down();
  await page.mouse.move(cancelRect.x+cancelRect.width/2+18,cancelRect.y+cancelRect.height/2,{steps:3});
  await page.locator('.editor-drag-preview').waitFor();
  await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
  await page.locator('.editor-drag-preview').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-line-dragging="true"]').count(),0);
  await page.mouse.up();
  await page.goto('http://127.0.0.1:5199/interaction-fixture?paneFocusRegression',{waitUntil:'domcontentloaded'});
  const paneScrolls=page.locator('.node-tab-content');
  await page.locator('[data-test="pane-second-40"]').waitFor();
  await paneScrolls.nth(0).evaluate(element=>element.scrollTop=360);
  await paneScrolls.nth(1).evaluate(element=>element.scrollTop=360);
  const secondPaneBlock=page.locator('.editor-content').nth(1).locator('[data-test="pane-second-30"]');
  await secondPaneBlock.hover();
  const secondOptions=page.locator('.editor-line-control-menu').last();
  await secondOptions.waitFor();
  const secondPaneScrollBeforeClick=await paneScrolls.nth(1).evaluate(element=>element.scrollTop);
  await secondOptions.click();
  assert.equal(await paneScrolls.nth(1).evaluate(element=>element.scrollTop),secondPaneScrollBeforeClick,'focusing a pane does not reset its scroll');
  assert.equal(await page.locator('.editor-drag-preview').count(),0,'clicking block options does not start a stuck drag');
  await page.locator('.page-context-menu').waitFor();
  await page.keyboard.press('Escape');
  await paneScrolls.nth(0).evaluate(element=>element.scrollTop=300);
  await paneScrolls.nth(1).evaluate(element=>element.scrollTop=420);
  const firstPaneBlock=page.locator('.editor-content').first().locator('[data-test="p20"]');
  await firstPaneBlock.hover();
  const firstOptions=page.locator('.editor-line-control-menu').first();
  await firstOptions.waitFor();
  const firstPaneScrollBeforeClick=await paneScrolls.nth(0).evaluate(element=>element.scrollTop);
  await firstOptions.click();
  assert.equal(await paneScrolls.nth(0).evaluate(element=>element.scrollTop),firstPaneScrollBeforeClick,'switching pane focus preserves the previously scrolled page');
  assert.equal(await page.locator('.editor-drag-preview').count(),0);
  await page.locator('.page-context-menu').waitFor();
  console.log('PASS: switching focus via a block-options click preserves per-page scroll and never leaves a drag preview.');
} finally {await browser?.close();await server.close();}
