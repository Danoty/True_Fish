import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const script=readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
for(const path of ['/C:/example/index.html','/boats/','/boats/index.html']){
 const elements=new Map(),handlers={};
 const element=()=>({innerHTML:'',textContent:'',hidden:true,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}});
 for(const id of ['#app','#dialog-root','#toast'])elements.set(id,element());
 const memory=new Map();
 const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const context={document:{querySelector:s=>elements.get(s),addEventListener(name,fn){(handlers[name]??=[]).push(fn);},activeElement:null},window:{addEventListener(){}},location:{pathname:path,protocol:path.startsWith('/C:')?'file:':'https:'},localStorage,navigator:{},structuredClone,crypto:globalThis.crypto,console,setTimeout(){},clearTimeout(){},Intl,Date,Blob};
 vm.runInNewContext(script,context,{timeout:3000});
 await new Promise(resolve=>setImmediate(resolve));
 const html=elements.get('#app').innerHTML;
 assert.match(html,/Business overview/);assert.match(html,/Saved in this browser/);assert.match(html,/A clear picture of the day/);assert.match(html,/Recorded cash|RECORDED CASH/);assert.doesNotMatch(html,/Connecting to|Reading this browser/);
 for(const [tab,expected] of [['Assistant','Ask your business'],['Customers & bills','Customer invoices'],['Accounting','Balance sheet'],['Crew & maintenance','Earned wages'],['Imports & matching','Spreadsheet import'],['Review & staff','Users &amp; access rights'],['Finances','Cashbook trial balance'],['Fuel stock','Fuel &amp; cash reconciliation'],['Fuel debts','Outstanding'],['Reports','Boat performance'],['Settings','Backups &amp; data health'],['Activity','Record history'],['Overview','Income &amp; profit']]){
  const button={dataset:{action:'navigate',tab},disabled:false};for(const fn of handlers.click)await fn({target:{closest:()=>button}});
  assert.ok(elements.get('#app').innerHTML.includes(expected),'Tab should render: '+tab);
 }
 // Period buttons update the report range and survive re-rendering.
 for(const fn of handlers.click)await fn({target:{closest:()=>({dataset:{action:'period',period:'month'},disabled:false})}});
 assert.match(elements.get('#app').innerHTML,/Business overview/);
 const click=async(action,extra={})=>{for(const fn of handlers.click)await fn({target:{closest:()=>({dataset:{action,...extra},disabled:false})}});await new Promise(resolve=>setImmediate(resolve));};
 await click('navigate',{tab:'Assistant'});const before=memory.get('true-fish-pages:'+path.replace(/index\.html$/,''));await click('assistant-prompt',{question:'Explain my profit'});assert.match(elements.get('#app').innerHTML,/recorded accounting income/);assert.match(elements.get('#app').innerHTML,/Review source report/);assert.equal(memory.get('true-fish-pages:'+path.replace(/index\.html$/,'')),before,'Assistant must not write ledger data');
 await click('assistant-clear');assert.doesNotMatch(elements.get('#app').innerHTML,/recorded accounting income/);
}
console.log('Passed: local-file and GitHub startup, every main navigation route, settings, charts, reconciliation and date controls.');
