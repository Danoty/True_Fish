import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {createSecureServer} from './server/secure.js';
if(existsSync('.env.local'))loadEnvFile('.env.local');
const app=createSecureServer();app.server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('True Fish server: '+(process.env.APP_URL||'http://localhost:3000')));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.server.close(()=>{app.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();});
