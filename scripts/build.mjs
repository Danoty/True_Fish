import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const exportsOf=text=>[...text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z0-9_]+)/g)].map(m=>m[1]);
const read=file=>readFileSync(root+file,'utf8').replace(/^\uFEFF/,'');
const strip=s=>s.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
const modules=[['ServerClient','server-client.js',[]],['Finance','finance.js',[]],['Business','business.js',['Finance']],['Workflow','workflow.js',[]],['Ledger','ledger.js',['Finance','Business']],['Storage','storage.js',['Ledger','Workflow','Business']],['Analytics','analytics.js',['Ledger']],['Imports','imports.js',['Ledger','Workflow']],['Intelligence','intelligence.js',['Business','Finance','Ledger']],['Receipts','receipts.js',['Finance','Business']]];
const known={};let bundle="// Ready-to-run local / GitHub Pages app. No server build is required.\n(()=>{\n'use strict';\n";
for(const [name,file,deps] of modules){const text=read(file),names=exportsOf(text);known[name]=names;bundle+=`const ${name}=(()=>{\n${deps.map(d=>`const {${known[d].join(',')}}=${d};`).join('\n')}\n${strip(text)}\nreturn {${names.join(',')}};\n})();\n`;}
bundle+='(()=>{\n'+Object.entries(known).map(([name,names])=>`const {${names.join(',')}}=${name};`).join('\n')+'\n'+strip(read('app.js'))+'\n'+strip(read('business-ui.js'))+'\n'+strip(read('hybrid-ui.js'))+'\n'+strip(read('users-ui.js'))+'\n'+strip(read('receipts-ui.js'))+'\n})();\n})();\n';
writeFileSync(root+'app.bundle.js',bundle);console.log('Built app.bundle.js');
const cssFiles=['styles.css','theme.css','hybrid.css','access.css'];
writeFileSync(root+'app.styles.css',cssFiles.map(file=>'/* Source: '+file+' */\n'+read(file)).join('\n\n'));
console.log('Built app.styles.css with all layout, theme, login and receipt rules.');
