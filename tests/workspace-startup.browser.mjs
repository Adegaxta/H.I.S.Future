import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const native=process.argv.includes('--native');
const isolated=process.argv.includes('--isolated');
const server=isolated?await createServer({cacheDir:'node_modules/.vite/startup',server:{host:'127.0.0.1',port:1430,strictPort:true}}):null;
await server?.listen();
let app,profile;
if(native){
 profile=await mkdtemp(join(tmpdir(),'his-startup-'));
 app=spawn('src-tauri/target/debug/hisfuture.exe',[],{windowsHide:true,env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9227'}});
 app.stdout.on('data',d=>console.log('NATIVE',d.toString()));app.stderr.on('data',d=>console.log('NATIVE',d.toString()));
}
let browser;
if(native){
 for(let i=0;i<30;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9227');break;}catch{await new Promise(r=>setTimeout(r,300));}}
 if(!browser)throw Error('Native debugging unavailable');
}else browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=native?browser.contexts()[0].pages()[0]:await browser.newPage();
 let injected=false;
 let allowRecovery=false;
 const persistentFailure=process.argv.includes('--persistent-failure');
 if(process.argv.includes('--fail-import')||persistentFailure){
  assert.ok(native,'Import recovery uses the native project that survives document reload.');
  await page.route('**/src/components/AppWorkspace.tsx*',async route=>{
   if(!injected||(persistentFailure&&!allowRecovery)){injected=true;await route.abort('failed');}else await route.continue();
  });
 }
 const requests=[];const pending=new Set();
 page.on('request',r=>{requests.push(r.url());pending.add(r.url());});
 page.on('requestfinished',r=>pending.delete(r.url()));
 page.on('requestfailed',r=>pending.delete(r.url()));
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message,e.stack));
 page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAVIGATION',f.url());});
 page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.type(),m.text());});
 page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url(),r.failure()));
 if(!native||isolated) await page.goto(isolated?'http://127.0.0.1:1430/':process.env.HIS_TEST_URL??'http://localhost:1420/',{waitUntil:'domcontentloaded'});
 await page.locator('.home-action--quick-dev button').waitFor({timeout:60000});
 await page.locator('.home-action--quick-dev button').click();
 if(persistentFailure){
  await page.locator('.app-load-error').waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('hisfuture.workspace-load-retry')),'1');
  allowRecovery=true;
  await page.locator('.app-load-error button').click();
 }
 try{await page.locator('[data-node-id]').first().click({timeout:60000});}catch(e){console.log('REQUEST COUNT',requests.length,'PENDING',Array.from(pending).slice(0,30));console.log('HTML',(await page.locator('#root').innerHTML()).slice(0,1000));throw e;}
 await page.locator('.editor-content').first().waitFor({timeout:30000});
 assert.equal(await page.locator('.app-load-error').count(),0);
 assert.ok(!requests.some(url=>/\/lucide-react\.js\?/.test(url)), 'Startup must not fetch the complete static Lucide barrel.');
 if(process.argv.includes('--fail-import'))assert.ok(injected);
 console.log(`PASS: ${native?'native WebView':'browser'} Home → workspace → node editor; no complete Lucide barrel${injected?'; automatic recovery after failed import':''}. Requests: ${requests.length}`);
}finally{await browser.close();if(app){app.kill();await new Promise(r=>app.once('exit',r));}if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});await server?.close();}
