import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8').replace(/^\uFEFF/,'');
const css=read('app.styles.css'),files=['styles.css','theme.css','hybrid.css','access.css'];
assert.equal(css,files.map(file=>'/* Source: '+file+' */\n'+read(file)).join('\n\n'),'Published stylesheet must include every source in cascade order');
for(const name of ['index.html','login.html']){
 const html=read(name),links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)];assert.equal(links.length,1);assert.equal(links[0][1],'app.styles.css?v=7.3.0');assert.match(html,/id="essential-layout"/);assert.match(html,/\.shell>aside\{position:fixed/);assert.match(html,/nav button\{display:flex/);
 for(const [,url] of [...html.matchAll(/(?:src|href)="([^"]+)"/g)]){if(/^(https?:|#)/.test(url))continue;assert.ok(existsSync(new URL(url.split('?')[0],root)),name+' references missing '+url);}
}
assert.match(read('access-gate.js'),/app\.bundle\.js\?v=7\.3\.0/);assert.match(read('access-gate.js'),/script\.onerror/);
console.log('Passed: complete stylesheet cascade, essential layout fallback, versioned asset links and no missing local assets.');
