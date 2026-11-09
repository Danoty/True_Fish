import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createSecureServer} from '../server/secure.js';
const folder=mkdtempSync(join(tmpdir(),'true-fish-secure-')),path=join(folder,'test.sqlite'),options={path,password:'test-admin-password-with-32-characters',origin:'',ai:{model:'test-local',fetch:async()=>new Response(JSON.stringify({message:{content:'Controlled model answer'}}))}};
const app=createSecureServer(options),base='http://localhost:3000';options.origin=base;
// Exercise the actual request handler without network access or opening a listening port.
async function call(route,body,cookie='',origin=base){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.url=route;req.method=body?'POST':'GET';req.headers={...(body?{'content-type':'application/json',origin}:{}),...(cookie?{cookie}:{})};
 const response=await new Promise((resolve,reject)=>{let status=200,headers={};const res={writeHead(code,values){status=code;headers=values;},setHeader(key,value){headers[key]=value;},end(value){try{resolve(new Response(value??'',{status,headers}));}catch(e){reject(e);}}};app.server.emit('request',req,res);});
 let data;try{data=await response.clone().json();}catch{data=null;}return {response,data};
}
async function login(username,password){const result=await call('/api/login',{username,password});assert.equal(result.response.status,200);assert.match(result.response.headers.get('set-cookie'),/HttpOnly/);return result.response.headers.get('set-cookie').split(';')[0];}
try{
 assert.equal((await call('/api/state')).response.status,401);assert.equal((await call('/api/assistant',{question:'Summary'})).response.status,401);assert.equal((await call('/')).response.status,303);assert.equal((await call('/api/login',{username:'admin',password:options.password},'','https://wrong.example')).response.status,403);
 const admin=await login('admin',options.password);let state=(await call('/api/state',null,admin)).data.state;
 async function control(action,values,cookie=admin){const result=await call('/api/control',{action,values,version:state.version},cookie);if(result.response.status===200)state=result.data.state;return result;}
 async function save(record,cookie=admin){const result=await call('/api/save',{payload:{action:'add',record},version:state.version,actorId:'owner'},cookie);if(result.response.status===200)state=result.data.state;return result;}
 assert.equal((await control('team',{name:'Viewer',role:'viewer',loginName:'viewer',password:'test-viewer-password-with-32-characters'})).response.status,200);
 assert.equal((await control('team',{name:'Clerk',role:'clerk',loginName:'clerk',password:'test-clerk-password-with-32-characters'})).response.status,200);
 assert.equal((await control('team',{name:'Reviewer',role:'approver',loginName:'reviewer',password:'test-reviewer-password-with-32-characters'})).response.status,200);
 const viewer=await login('viewer','test-viewer-password-with-32-characters'),clerk=await login('clerk','test-clerk-password-with-32-characters'),reviewer=await login('reviewer','test-reviewer-password-with-32-characters');
 const ai=await call('/api/assistant',{question:'Summarise my business'},viewer);assert.equal(ai.response.status,200);assert.equal(ai.data.answer,'Controlled model answer');assert.equal((await call('/api/state',null,viewer)).data.state.version,state.version,'AI must not mutate the ledger');assert.equal((await call('/api/assistant',{question:'Summary'},viewer,'https://wrong.example')).response.status,403);
 assert.equal((await call('/hybrid.css')).response.status,200);
 const income={kind:'finance',date:'2026-11-01',transactionType:'income',account:'cash',amount:100,category:'Other business income'};
 assert.equal((await save(income,viewer)).response.status,400);assert.match((await save(income,viewer)).data.error,/read only/);
 assert.equal((await save(income)).response.status,200);const ownerRecord=state.records.at(-1);
 assert.equal((await save({...income,transactionType:'expense',category:'General expenses',amount:20},clerk)).response.status,200);assert.notEqual(state.records.at(-1).enteredBy,'owner');
 const tamper=await call('/api/save',{payload:{action:'replace',id:ownerRecord.id,record:{...income,amount:999},reason:'Attempt'},version:state.version,actorId:'owner'},clerk);assert.equal(tamper.response.status,400);assert.match(tamper.data.error,/own entries/);
 assert.equal((await control('approve',{through:'2026-11-01'},reviewer)).response.status,200);assert.equal((await control('close',{through:'2026-11-01'},reviewer)).response.status,200);
 assert.match((await save(income,clerk)).data.error,/closed/);assert.equal((await control('reopen',{reason:'No authority'},reviewer)).response.status,400);assert.equal((await control('reopen',{reason:'Correct entries'})).response.status,200);
 assert.equal((await call('/.env.local',null,admin)).response.status,404);assert.equal((await call('/server/secure.js',null,admin)).response.status,404);
 assert.equal((await control('team',{name:'Limited',role:'clerk',permissions:['write'],loginName:'limited',password:'test-limited-password-with-32-characters'})).response.status,200);
 const limited=await login('limited','test-limited-password-with-32-characters');
 assert.equal((await save(income,limited)).response.status,200);const limitedRecord=state.records.at(-1);
 const deniedEdit=await call('/api/save',{payload:{action:'replace',id:limitedRecord.id,record:income,reason:'No edit right'},version:state.version},limited);assert.equal(deniedEdit.response.status,400);assert.match(deniedEdit.data.error,/permission/);
 assert.equal((await call('/api/import',{inputs:[{kind:'party',date:'2026-11-01',name:'Not permitted',partyType:'customer'}],version:state.version},limited)).response.status,400);
 assert.equal((await call('/api/preferences',{preferences:{company:'Unauthorised'},version:state.version},limited)).response.status,400);
 assert.equal((await call('/api/assistant',{question:'Summary'},limited)).response.status,400);
 const limitedId=state.controls.staff.find(s=>s.name==='Limited').id;assert.equal((await control('team',{id:limitedId,name:'Limited',role:'clerk',permissions:['write'],active:false})).response.status,200);assert.equal((await call('/api/state',null,limited)).response.status,401);
 const viewerId=state.controls.staff.find(s=>s.name==='Viewer').id;assert.equal((await control('team',{id:viewerId,name:'Viewer',role:'viewer',password:'replacement-viewer-password-32-characters'})).response.status,200);assert.equal((await call('/api/state',null,viewer)).response.status,401);assert.equal((await call('/api/login',{username:'viewer',password:'test-viewer-password-with-32-characters'})).response.status,401);await login('viewer','replacement-viewer-password-32-characters');
 assert.equal((await control('team',{name:'Other admin',role:'admin',loginName:'otheradmin',password:'test-otheradmin-password-32-characters'})).response.status,200);const otheradmin=await login('otheradmin','test-otheradmin-password-32-characters');assert.equal((await control('team',{id:'owner',name:'Changed owner',role:'admin'},otheradmin)).response.status,400);assert.equal((await control('team',{id:'owner',name:'Owner',role:'viewer'})).response.status,400);
 const accountEnvelope=(await call('/api/state',null,admin)).data;assert.ok(accountEnvelope.accounts.some(a=>a.username==='otheradmin'));assert.doesNotMatch(JSON.stringify(accountEnvelope),/test-otheradmin-password|replacement-viewer-password|"hashPassword"/);
 assert.equal((await call('/access.css')).response.status,200);assert.equal((await call('/access-gate.js')).response.status,200);
 const logo=await call('/true-fish-logo.png');assert.equal(logo.response.status,200);assert.match(logo.response.headers.get('content-type'),/image\/png/);
 const logout=await call('/api/logout',{},clerk);assert.equal(logout.response.status,200);assert.equal((await call('/api/state',null,clerk)).response.status,401);
 console.log('Passed: secure staff login, sessions, CSRF, server-enforced viewer/clerk/reviewer/admin permissions, actor spoof rejection, period locks, reopening and protected server files.');
}finally{app.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});rmdirSync(folder);}
