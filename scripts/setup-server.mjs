import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(existsSync('.env.local')){console.error('.env.local exists; it was not overwritten.');process.exit(1);}
const password=randomBytes(24).toString('base64url');writeFileSync('.env.local',`ADMIN_USERNAME=admin\nADMIN_PASSWORD=${password}\nAPP_URL=http://localhost:3000\nDATABASE_PATH=./data/true-fish-shared.sqlite\nHOST=127.0.0.1\nPORT=3000\n`,{flag:'wx',mode:0o600});console.log('Administrator username: admin\nAdministrator password: '+password+'\nKeep .env.local private.');
