import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite/node-tab-surface',esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,include:['react/jsx-dev-runtime','react/jsx-runtime','nspell','react','react-dom','react-dom/client','lucide-react','lucide-react/dynamicIconImports','pixi.js','eventemitter3']},server:{port:5212,host:'127.0.0.1'},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/interaction-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/interaction-fixture','<div id="root"></div><script type="module" src="/tests/node-tab-surface.fixture.tsx"></script>'));});}}]});
await server.listen(); console.log('Fixture server ready');
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage(); page.setDefaultTimeout(60000); console.log('Browser ready');
 page.on('pageerror',e=>console.error(e));
 page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto('http://127.0.0.1:5212/interaction-fixture',{waitUntil:'domcontentloaded'}); console.log('HTML ready');


 const left=page.locator('[data-pane-id="left"]');const right=page.locator('[data-pane-id="right"]');
 assert.equal(await page.locator('.page-chrome').count(),2);
 for(const pane of [left,right]) {
   const valid=await pane.locator('.page-chrome').evaluate(el=>{const p=el.closest('.workspace-pane').getBoundingClientRect(),r=el.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;});assert.ok(valid,'Controls remain in their own pane');
 }
 await left.locator('.editor-content p').click();await page.keyboard.press('Control+f');
 await left.getByRole('textbox',{name:'Buscar en este Nodo',exact:true}).fill('Manzana');
 assert.equal(await left.locator('.node-search-overlay span').textContent(),'1/1');
 await right.locator('.editor-content p').click();await page.keyboard.press('Control+f');
 await right.getByRole('textbox',{name:'Buscar en este Nodo',exact:true}).fill('Naranja');
 assert.equal(await page.locator('.node-search-overlay').count(),2);
 assert.equal(await left.getByRole('textbox',{name:'Buscar en este Nodo',exact:true}).inputValue(),'Manzana');
 assert.equal(await page.evaluate(()=>CSS.highlights.get('his-search').size),2);
 const opacity=await left.locator('.workspace-pane__content').evaluate(el=>getComputedStyle(el).opacity);assert.ok(Number(opacity)<1);
 await right.getByRole('button',{name:'Cerrar búsqueda',exact:true}).click();
 assert.equal(await page.evaluate(()=>CSS.highlights.get('his-search').size),1);
 await left.getByRole('button',{name:'Cerrar búsqueda',exact:true}).click();
 await left.getByRole('button',{name:'Índice',exact:true}).click();await left.locator('.page-chrome__index-panel').waitFor();
 assert.ok((await left.locator('.page-chrome__index-panel').textContent()).includes('Título A'));
 assert.equal(await right.locator('.page-chrome__index-panel').count(),0);
 await left.getByRole('button',{name:'Opciones de Nodo',exact:true}).click();
 assert.equal(await left.locator('.node-options__row').first().textContent(),'Añadir como nodo principal');
 await left.getByRole('button',{name:'Añadir como nodo principal',exact:true}).click();
 await left.getByRole('button',{name:'Opciones de Nodo',exact:true}).click();
 await left.getByRole('button',{name:'Quitar como nodo principal',exact:true}).click();
 const nodes=JSON.parse(await page.locator('#state').textContent());assert.equal(nodes.length,2);assert.ok(!nodes.some(n=>n.content.includes('"role":"vault-primary"')));
 await left.getByRole('button',{name:'Grafo local',exact:true}).click();
 await left.locator('.graph-view').waitFor({timeout:120000});
 await right.getByRole('button',{name:'Grafo local',exact:true}).click();
 await right.locator('.graph-view').waitFor({timeout:120000});
 await left.locator('.graph-view canvas').waitFor({timeout:120000});
 await right.locator('.graph-view canvas').waitFor({timeout:120000});
 for (const pane of [left,right]) {
   const canvas = await pane.locator('.graph-view canvas').boundingBox();
   assert.ok(canvas.width > 100 && canvas.height > 100, 'Each local graph has its own visible rendering surface');
 }
 assert.equal(await page.locator('.page-chrome__graph-panel').count(),2);
 await right.locator('.page-chrome__graph-title button').click();
 assert.equal(await left.locator('.page-chrome__graph-panel').count(),1);
 await left.locator('.page-chrome__graph-title button').click();
 await left.getByRole('button',{name:'Probar Tags',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.tag-picker')?.matches(':popover-open'));
 const tagFront=await page.locator('.tag-picker').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.right-20,r.top+20));});
 assert.ok(tagFront,'Tags paint over the adjacent pane');
 await left.getByRole('button',{name:'Cerrar prueba',exact:true}).click();
 await left.getByRole('button',{name:'Probar selector',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.page-image-picker')?.matches(':popover-open'));
 const modal=await left.locator('.page-image-picker').boundingBox();
 assert.equal(Math.round(modal.width),1280);assert.equal(Math.round(modal.height),720);
 await left.getByRole('button',{name:'Cerrar prueba',exact:true}).click();
 for(let i=0;i<9;i++)await left.getByRole('button',{name:'Nueva pestaña',exact:true}).click();
 const tabs=left.locator('.workspace-pane-tabbar__tabs');
 assert.ok(await tabs.evaluate(el=>el.scrollWidth>el.clientWidth));
 assert.ok(await left.getByRole('button',{name:'Ver pestañas anteriores',exact:true}).isVisible());
 const activeVisible=await tabs.locator('[aria-selected="true"]').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1;});assert.ok(activeVisible,'New active tab scrolls into view');
 const beforeScroll=await tabs.evaluate(el=>el.scrollLeft);
 await left.getByRole('button',{name:'Ver pestañas anteriores',exact:true}).click();
 await page.waitForFunction(before=>document.querySelector('[data-pane-id="left"] .workspace-pane-tabbar__tabs').scrollLeft<before-50,beforeScroll);
 await page.screenshot({path:'C:/Users/Matias/.codex/node-tab-independence.png'});
 console.log('PASS: Scoped controls, independent search/highlights, focus dimming, primary toggle and two simultaneous local graphs');
} finally { await browser?.close(); await server.close(); }
