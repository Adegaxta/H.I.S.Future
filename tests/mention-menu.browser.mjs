import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite/editor-interactions',esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,include:['react/jsx-dev-runtime','react/jsx-runtime','nspell','react','react-dom','react-dom/client','lucide-react','lucide-react/dynamicIconImports']},server:{port:5210,host:'127.0.0.1'},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/interaction-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/interaction-fixture','<div id="root"></div><script type="module" src="/tests/mention-menu.fixture.tsx"></script>'));});}}]});
await server.listen(); console.log('Fixture server ready');
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(); page.setDefaultTimeout(60000); console.log('Browser ready');
 page.on('pageerror',e=>console.error(e));
 await page.goto('http://127.0.0.1:5210/interaction-fixture',{waitUntil:'domcontentloaded'}); console.log('HTML ready');

 const editor=page.locator('.editor-content');
 const state=()=>page.locator('#state').textContent().then(JSON.parse);
 const type=async text=>{await editor.locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type(text);};
 await type(' @');

 await page.locator('[data-mention-menu]').waitFor();
 assert.equal(await page.locator('[data-mention-menu] [data-picker-menu-item]').count(),4);
 assert.equal(await page.locator('[data-mention-create]').count(),2);
 assert.equal(await page.locator('[data-mention-menu] [data-picker-menu-item]').first().getAttribute('data-picker-menu-item'),'dest2');
 await page.keyboard.type('Destino 0');

 assert.equal(await page.locator('[data-mention-menu] [data-picker-menu-item]').count(),1);
 await page.locator('[data-picker-menu-item="dest0"]').click();
 assert.equal(await editor.locator('[data-mention-id="dest0"]').count(),1);
 await type(' @Nombre nuevo');
 await page.locator('[data-mention-create="here"]').waitFor();
 assert.equal(await page.locator('[data-mention-menu] [data-picker-menu-item]').count(),0);
 await page.locator('[data-mention-create="here"]').hover();
 await page.getByRole('tooltip').waitFor();
 await page.screenshot({path:'C:/Users/Matias/.codex/mention-menu-preview.png'});
 await page.locator('[data-mention-create="here"]').click();
 let created=(await state()).find(n=>n.name==='Nombre nuevo');assert.ok(created);assert.equal(created.parentId,null);
 assert.equal(await editor.locator('[data-mention-id="'+created.id+'"]').count(),1);
 await type(' @Nombre en destino');
 await page.locator('[data-mention-create="in"]').click();
 await page.locator('[data-mention-destination]').waitFor();
 await page.locator('.mention-menu__tree-row').filter({has:page.getByRole('button',{name:'Destino 0',exact:true})}).getByRole('button',{name:'Mostrar nodos vinculados'}).click();
 await page.getByRole('button',{name:'Hijo vinculado',exact:true}).waitFor();
 await page.getByRole('button',{name:'Ocultar nodos vinculados'}).click();
 await page.getByRole('button',{name:'Hijo vinculado',exact:true}).waitFor({state:'hidden'});
 await page.getByPlaceholder('Buscar nodo al que añadir la mención…').fill('Destino 0');
 await page.screenshot({path:'C:/Users/Matias/.codex/mention-destination-preview.png'});
 await page.getByRole('button',{name:'Destino 0',exact:true}).click();
 const saved=await state();created=saved.find(n=>n.name==='Nombre en destino');assert.ok(created);assert.equal(created.parentId,null);
 assert.ok(saved.find(n=>n.id==='dest0').content.startsWith('<p>Contenido 0</p>'));
 assert.ok(saved.find(n=>n.id==='dest0').content.includes('data-mention-id="'+created.id+'"'));
 assert.equal(await editor.locator('[data-mention-id="'+created.id+'"]').count(),1);
 await type(' @Creado con teclado');await page.keyboard.press('Enter');
 assert.ok((await state()).find(n=>n.name==='Creado con teclado'));
 await type(' @Cancelar destino');await page.locator('[data-mention-create="in"]').click();await page.keyboard.press('Escape');
 assert.ok(!(await state()).find(n=>n.name==='Cancelar destino'));
 // Reopening preserves the nodes array: hydration must follow the active node.
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Abrir destino',exact:true}).click();
 await page.getByRole('button',{name:'Volver al origen',exact:true}).click();
 const hydrated = await editor.evaluate(el => Array.from(el.querySelectorAll('[data-mention-id]')).every(m => m.querySelector(':scope > [data-mention-node-visual]')));
 assert.ok(hydrated, 'Every mention has an icon on reopening without editing');
 // Replacing runtime HTML models undo/paste of a saved mention.
 await editor.evaluate(el => el.querySelectorAll('[data-mention-node-visual]').forEach(icon => icon.remove()));
 await page.waitForFunction(() => Array.from(document.querySelectorAll('.editor-content [data-mention-id]')).every(m => m.querySelector(':scope > [data-mention-node-visual]')));
 console.log('Reopening and restoring saved mentions hydrate icons without editing');
 console.log('Mention recents, spaces, filtering, creation, destination append, tree expansion, keyboard and cancellation passed');
} finally { await browser?.close(); await server.close(); }
