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
 await page.goto('http://127.0.0.1:5199/interaction-fixture',{waitUntil:'domcontentloaded'}); console.log('HTML ready');
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
