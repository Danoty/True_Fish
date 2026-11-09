import {financeReport} from '../finance.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const handlers={},dialogHandlers={},memory=new Map(),ids=new Map();let form=null,downloadedBlob=null,downloadedName='';
const values={};
const node=()=>({innerHTML:'',textContent:'',hidden:true,focus(){},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}});
const root=node(),dialogs=node();
ids.set('#app',root);ids.set('#dialog-root',dialogs);ids.set('#toast',node());
for(const id of ['#form-summary','#draft-status','#modal-error'])ids.set(id,node());
function makeForm(id,fields){const controls=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{value:String(v)}]));return {id,elements:{namedItem:k=>controls[k]||null},controls};}
let markup='';Object.defineProperty(dialogs,'innerHTML',{get:()=>markup,set(html){markup=html;form=null;if(!html.includes('id="record-form"'))return;const fields={};for(const tag of html.matchAll(/<input\b[^>]*>/g)){const name=tag[0].match(/\bname="([^"]+)"/)?.[1];if(name)fields[name]=tag[0].match(/\bvalue="([^"]*)"/)?.[1]||'';}for(const match of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const options=[...match[2].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];const chosen=options.find(o=>o[1].includes('selected'))||options[0];fields[match[1]]=chosen?(chosen[1].match(/value="([^"]*)"/)?.[1]??chosen[2]):'';}fields.note='';form=makeForm('record-form',fields);}});
dialogs.querySelector=s=>s==='#record-form'?form:{focus(){}};dialogs.querySelectorAll=()=>[];dialogs.addEventListener=(name,fn)=>(dialogHandlers[name]??=[]).push(fn);
class TestFormData{constructor(form){this.entries=Object.entries(form.controls).map(([k,v])=>[k,v.value]);}get(k){return this.entries.find(([name])=>name===k)?.[1]??null;}[Symbol.iterator](){return this.entries[Symbol.iterator]();}}
const context={document:{querySelector:s=>ids.get(s),addEventListener(name,fn){(handlers[name]??=[]).push(fn);},activeElement:null},window:{addEventListener(){}},location:{pathname:'/test/index.html',protocol:'file:'},localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},navigator:{},structuredClone,crypto:globalThis.crypto,console,setTimeout(){},clearTimeout(){},Intl,Date,Blob,FormData:TestFormData};
vm.runInNewContext(readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function click(action,extra={}){const b={dataset:{action,...extra},disabled:false};for(const fn of handlers.click)await fn({target:{closest:()=>b}});await tick();}
async function submit(target=form,next=false){for(const fn of handlers.submit)await fn({target,preventDefault(){},submitter:{dataset:next?{next:'true'}:{}}});await tick();}
const field=(k,v)=>{assert.ok(form?.elements.namedItem(k),'Missing form field '+k);form.elements.namedItem(k).value=String(v);};
const ledger=()=>JSON.parse(memory.get('true-fish-pages:/test/'));
await tick();await click('new',{kind:'opening'});field('litres',100);await submit();assert.equal(ledger().records.length,1);
await click('new',{kind:'sale'});field('litres',8);await click('cash-total');assert.equal(form.elements.namedItem('cash').value,'1600.00');await submit();assert.equal(ledger().records.length,2);
const original=ledger().records[0];await click('edit',{id:original.id});field('litres',120);field('correctionReason','Correct stock count');await submit();assert.equal(ledger().records.find(r=>r.id===original.id).void,true);assert.equal(ledger().records.find(r=>r.replaces===original.id).litres,120);
await click('new',{kind:'boat'});field('income',7000);field('boss',1580);field('commission',158);await submit(form,true);assert.equal(form.elements.namedItem('boat').value,'Boat 2');assert.equal(ledger().records.filter(r=>r.kind==='boat').length,1);await click('close');
await click('new',{kind:'credit'});field('litres',7);for(const fn of dialogHandlers.input)fn({});await click('close');await click('new',{kind:'credit'});assert.equal(form.elements.namedItem('litres').value,'7');await click('close');
await submit(makeForm('settings-form',{company:'Test Fleet',fuelPrice:225,lowStock:150,commissionRate:10}));assert.ok(root.innerHTML.includes('TEST FLEET'));
await click('new',{kind:'purchase'});assert.equal(form.elements.namedItem('price').value,'225');await click('close');
await click('navigate',{tab:'Fuel stock'});assert.ok(root.innerHTML.includes('Fuel &amp; cash reconciliation'));assert.ok(root.innerHTML.includes('112'));
assert.equal(ids.get('#modal-error').textContent,'');
console.log('Passed: entry forms, calculated cash fill, atomic correction, Save & add next, draft resume, settings defaults and report rendering.');

await click('navigate',{tab:'Finances'});assert.ok(root.innerHTML.includes('Cashbook trial balance'));
await click('finance-new',{type:'opening'});field('amount',1000);await submit();assert.equal(ledger().records.filter(r=>r.kind==='finance').length,1);
await click('finance-new',{type:'income'});field('account','mpesa');field('amount',500);await submit();
await click('finance-new',{type:'expense'});field('amount',100);await submit();
const sale=ledger().records.find(r=>r.kind==='sale');await click('finance-source',{id:sale.id});assert.equal(form.elements.namedItem('amount').value,'1600');field('account','mpesa');await submit();
await click('finance-new',{type:'transfer'});field('amount',100);field('toAccount','mpesa');await submit();
const expense=ledger().records.find(r=>r.kind==='finance'&&r.transactionType==='expense');await click('edit',{id:expense.id});field('amount',120);field('correctionReason','Correct receipt');await submit();
await click('finance-new',{type:'reconcile'});field('amount',779);await submit();
const report=financeReport(ledger().records);assert.equal(report.balances.cash,78000);assert.equal(report.balances.mpesa,220000);assert.equal(report.receipts,210000);assert.equal(report.payments,12000);assert.equal(report.trialDebits,report.trialCredits);assert.equal(report.checks.at(-1).difference,-100);
assert.equal(ids.get('#modal-error').textContent,'');
console.log('Passed: financial forms, source posting, Cash/M-Pesa transfer, finance correction and observed-balance check.');
// Business document and crew forms use the same audited save path as other records.
await click('new',{kind:'party'});field('name','Customer A');field('partyType','customer');await submit();const customer=ledger().records.find(r=>r.kind==='party'&&r.name==='Customer A');assert.ok(customer);
await click('new',{kind:'party'});field('name','Supplier A');field('partyType','supplier');await submit();const supplier=ledger().records.find(r=>r.kind==='party'&&r.name==='Supplier A');assert.ok(supplier);
await click('new',{kind:'invoice'});field('partyId',customer.id);field('number','INV-001');field('amount',1000);field('taxAmount',100);await submit();const invoice=ledger().records.find(r=>r.kind==='invoice');assert.ok(invoice);
await click('document-pay',{id:invoice.id});field('amount',400);await submit();assert.equal(ledger().records.find(r=>r.transactionType==='invoice_receipt').documentId,invoice.id);
await click('new',{kind:'bill'});field('partyId',supplier.id);field('number','BILL-001');field('amount',300);await submit();assert.ok(ledger().records.some(r=>r.kind==='bill'));
await click('new',{kind:'crew'});field('name','Crew A');await submit();const crew=ledger().records.find(r=>r.kind==='crew');assert.ok(crew);
await click('new',{kind:'payroll'});field('crewId',crew.id);field('amount',500);await submit();const payroll=ledger().records.find(r=>r.kind==='payroll');assert.ok(payroll);
await click('document-pay',{id:payroll.id});field('amount',300);await submit();assert.ok(ledger().records.some(r=>r.transactionType==='payroll_payment'));
await click('new',{kind:'maintenance'});field('boat','Boat 1');field('title','Engine service');field('amount',500);await submit();assert.ok(ledger().records.some(r=>r.kind==='maintenance'));
await click('new',{kind:'asset'});field('name','Opening engine');field('amount',1000);await submit();assert.ok(ledger().records.some(r=>r.kind==='asset'));
const opening=ledger().records.find(r=>r.kind==='opening'&&!r.void);await click('new',{kind:'fuel_value'});field('sourceId',opening.id);field('date',opening.date);field('unitCost',100);await submit();assert.ok(ledger().records.some(r=>r.kind==='fuel_value'));
for(const [tab,text] of [['Customers & bills','INV-001'],['Accounting','Balance sheet'],['Crew & maintenance','Engine service'],['Imports & matching','Spreadsheet import'],['Review & staff','Users &amp; access rights']]){await click('navigate',{tab});assert.ok(root.innerHTML.includes(text));}
assert.equal(ids.get('#modal-error').textContent,'');
console.log('Passed: customer/supplier, invoice collection, bill, crew/payroll payment, maintenance, asset and fuel valuation forms with rendered reports.');
await click('staff-new');assert.match(dialogs.innerHTML,/Assigned action rights/);assert.match(dialogs.innerHTML,/right_approve/);
await submit(makeForm('team-form',{name:'Test Viewer',role:'viewer',active:'true',right_assistant:'true'}));const testUser=ledger().controls.staff.find(u=>u.name==='Test Viewer');assert.deepEqual(testUser.permissions,['assistant']);
await click('staff-edit',{id:testUser.id});assert.match(dialogs.innerHTML,/Save user &amp; rights|Save user & rights/);await click('close');
console.log('Passed: user creation and assigned permission form submission.');
await click('navigate',{tab:'Receipts'});assert.match(root.innerHTML,/Payment receipts/);assert.match(root.innerHTML,/Customer A/);const savedReceipt=ledger().records.find(r=>r.transactionType==='invoice_receipt');const receiptBefore=memory.get('true-fish-pages:/test/');await click('receipt-view',{id:savedReceipt.id});assert.match(dialogs.innerHTML,/id="receipt-document"/);assert.match(dialogs.innerHTML,/true-fish-logo.png/);assert.match(dialogs.innerHTML,/KSh 400.00/);assert.match(dialogs.innerHTML,/Print \/ Save as PDF/);assert.equal(memory.get('true-fish-pages:/test/'),receiptBefore);await click('close');
console.log('Passed: receipt register, branded receipt preview, exact saved payment and no duplicate posting.');
context.URL={createObjectURL(blob){downloadedBlob=blob;return 'blob:test-export';},revokeObjectURL(){}};context.document.createElement=()=>({click(){downloadedName=this.download;}});
const exportBefore=memory.get('true-fish-pages:/test/');await click('navigate',{tab:'Reports'});await click('export');assert.match(downloadedName,/\.html$/);assert.match(await downloadedBlob.text(),/data:image\/png;base64,/);assert.match(await downloadedBlob.text(),/TEST FLEET|Test Fleet/);assert.equal(memory.get('true-fish-pages:/test/'),exportBefore);
await click('import-template');assert.match(downloadedName,/template\.csv$/);assert.match(downloadedBlob.type,/text\/csv/);assert.doesNotMatch(await downloadedBlob.text(),/data:image/);
console.log('Passed: business report downloads embed the logo and CSV import templates remain compatible.');
