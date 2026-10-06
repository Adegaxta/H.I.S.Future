import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const require = createRequire(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const { chromium } = require('playwright');
let server;
try { await fetch('http://localhost:1420/'); } catch { server = await createServer({ server: { host: 'localhost', port: 1420, strictPort: true } }); await server.listen(); }
const profile = await mkdtemp(join(tmpdir(), 'his-upload-regression-'));
const app = spawn('src-tauri/target/debug/hisfuture.exe', [], { windowsHide: true, env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9234' } });
app.stderr.on('data', d => { const line = d.toString(); if (/resource\.|project\.save/.test(line)) console.log(line.trim()); });
let browser;
try {
 for (let i = 0; i < 40; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9234'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
 assert.ok(browser, 'Native WebView debugging connection');
 const page = browser.contexts()[0].pages()[0];
 await page.goto('http://localhost:1420/');
 const errors = [];
 page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERROR', m.text()); } });
 page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
 await page.evaluate(async () => {
   const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
   const project = await invoke('create_dev_project');
   const nodes = await invoke('list_nodes');
   for (let i = 0; i < 212; i++) nodes.push({ id: `upload-fixture-${i}`, name: `Fixture ${i}`, type: 'pagina', parentId: nodes[0].id, order: i, content: '<p><br></p>' });
   await invoke('save_nodes', { nodes, hiddenIds: [], deletedNodes: '[]' });
   await invoke('close_project');
 });
 await page.locator('.home-action--quick-dev button').click();
 await page.locator('[data-node-id]').first().waitFor({ timeout: 15000 }).catch(async e => { console.log('NATIVE UI', (await page.locator('#root').innerText()).slice(0, 2000)); throw e; });
 const create = async (type, name) => {
   await page.locator('.context-toolbar button').first().click();
   await page.locator('.lore-add-dialog__choices button').last().click();
   await page.locator(`.node-creation__types [data-type=${type}]`).click();
   await page.locator('.node-creation input').first().fill(name);
   await page.getByRole('button', { name: 'Crear Nodo en Lore', exact: true }).click();
   await page.locator('.node-creation').waitFor({ state: 'detached' });
 };
 const snapshot = () => page.evaluate(async () => (await import('/node_modules/@tauri-apps/api/core.js')).invoke('list_nodes'));
 await create('imagen', 'Native image');
 const imageId = (await snapshot()).find(n => n.name === 'Native image').id;
 await page.locator('.image-node-view__empty input[type=file]').setInputFiles({ name: 'native-upload.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=', 'base64') });
 await page.locator('.image-node-view__preview img').waitFor({ timeout: 15000 });
 await page.getByRole('button', { name: 'Recientes', exact: true }).click({ timeout: 10000 });
 await page.getByRole('button', { name: 'LORE', exact: true }).click();
 await create('pdf', 'Native PDF');
 let pdf = '%PDF-1.4\n'; const offsets = [0];
 ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'].forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
 const xref = Buffer.byteLength(pdf); pdf += 'xref\n0 4\n0000000000 65535 f \n' + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 await page.locator('.pdf-node-view__empty input[type=file]').setInputFiles({ name: 'native-upload.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
 await page.locator('.pdf-viewer canvas').first().waitFor({ timeout: 15000 });
 await page.getByRole('button', { name: 'Recientes', exact: true }).click({ timeout: 10000 });
 await page.keyboard.press('Control+s');
 let saved;
 for (let i = 0; i < 50; i++) { saved = await snapshot(); if (saved.some(n => n.name === 'native-upload.pdf')) break; await page.waitForTimeout(100); }
 assert.equal(saved.find(n => n.id === imageId).name, 'native-upload.png');
 assert.ok(saved.find(n => n.id === imageId).content.includes('hisfuture-image-resource'));
 assert.ok(saved.find(n => n.name === 'native-upload.pdf').content.includes('hisfuture-pdf'));
 await page.evaluate(async () => (await import('/node_modules/@tauri-apps/api/core.js')).invoke('close_project'));
 await page.reload();
 await page.locator('.home-action--quick-dev button').click();
 await page.locator('[data-node-id]').first().waitFor();
 await page.locator(`[data-node-id="${imageId}"]`).click();
 await page.locator('.image-node-view__preview img').waitFor();
 const reopened = await snapshot();
 assert.equal(reopened.find(n => n.id === imageId).name, 'native-upload.png');
 assert.ok(reopened.some(n => n.name === 'native-upload.pdf'));
 assert.deepEqual(errors, [], 'No React loops or frontend errors');
 console.log('PASS: native SQLite image/PDF upload, 212 existing nodes, UI responsive, no render loops');
} finally { await browser?.close(); app.kill(); await server?.close(); }
