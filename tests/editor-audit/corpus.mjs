import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const results=[];
for(const name of ['sanitizer-entities','plain-html','mention-undo','list-undo']){
 const output=`tests/editor-audit/results/corpus-${name}`;
 const child=spawn(process.execPath,['tests/editor-audit/run.mjs',`--replay=tests/editor-audit/corpus-${name}.json`,'--skip-regressions=1','--skip-soak=1','--properties=0'],{windowsHide:true,stdio:'inherit',env:{...process.env,HIS_AUDIT_OUTPUT:output}});
 const code=await new Promise(r=>child.once('exit',r));
 const report=JSON.parse(await readFile(`${output}/report.json`,'utf8'));
 results.push({name,code,complete:report.runs.length===1,failed:report.runs[0]?.failed??report.findings.find(f=>f.id==='HARNESS_FATAL')??null,productionUnchanged:report.productionUnchanged});
}
await writeFile('tests/editor-audit/results/corpus-report.json',JSON.stringify(results,null,2));
console.log('CORPUS',JSON.stringify(results.map(r=>({...r,failed:r.failed?.id}))));
if(results.some(r=>!r.complete||r.failed||r.code!==0))process.exitCode=1;
