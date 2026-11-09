import { cleanPreferences } from '../analytics.js';
import { createAssistant } from './assistant.js';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { BrowserLedger } from '../storage.js';
import { normalControls, canAct } from '../workflow.js';
const read = promisify(readFile), root = fileURLToPath(new URL('../', import.meta.url));
const sha = s => createHash('sha256').update(s).digest('hex');
function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
function verify(password, hash) {
    try {
        const [salt, value] = hash.split(':');
        return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(value, 'hex'));
    }
    catch {
        return false;
    }
}
const publicFiles = new Set(['index.html', 'app.bundle.js', 'styles.css', 'app.styles.css', 'theme.css', 'hybrid.css', 'access.css', 'true-fish-logo.png', 'access-gate.js', 'local-access.js', 'login.html', 'staff-login.js', 'config.js']);
export function createSecureServer(options = {}) {
    const path = resolve(options.path || process.env.DATABASE_PATH || './data/true-fish-shared.sqlite');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT NOT NULL,credential TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);');
    const password = options.password || process.env.ADMIN_PASSWORD, username = (options.username || process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    if (!password || password.length < 16)
        throw Error('Run npm run setup-server or set ADMIN_PASSWORD to at least 16 characters.');
    if (!/^[a-z0-9._-]{3,50}$/.test(username))
        throw Error('Invalid administrator username.');
    const owner = db.prepare('SELECT * FROM users WHERE id=?').get('owner');
    if (!owner || !verify(password, owner.hash) || owner.username !== username)
        db.prepare('INSERT INTO users(id,username,hash) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,hash=excluded.hash').run('owner', username, hashPassword(password));
    const storage = { getItem: key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null, setItem: (key, value) => db.prepare('INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value) };
    const ledger = new BrowserLedger(storage, 'shared', null);
    const assistant = createAssistant(options.ai || {});
    let queue = Promise.resolve();
    const serial = fn => { const job = queue.then(fn); queue = job.catch(() => { }); return job; };
    const origin = () => options.origin || process.env.APP_URL || 'http://localhost:3000';
    function send(res, status, data, extra = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...extra }); res.end(JSON.stringify(data)); }
    async function body(req) {
        let size = 0, chunks = [];
        for await (const chunk of req) {
            size += chunk.length;
            if (size > 12000000)
                throw Error('Request is too large.');
            chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    function userFor(req) {
        const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('true_fish_staff='))?.slice(16);
        if (!raw || !/^[a-f0-9]{64}$/.test(raw))
            return null;
        const session = db.prepare('SELECT sessions.*,users.username,users.hash FROM sessions JOIN users ON users.id=sessions.userId WHERE token=?').get(sha(raw));
        if (!session || session.expires < Date.now() || session.credential !== sha(session.hash))
            return null;
        const staff = normalControls(ledger.read().controls).staff.find(s => s.id === session.userId && s.active !== false);
        return staff ? { ...staff, username: session.username } : null;
    }
    const cookie = (value, age) => 'true_fish_staff=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + (origin().startsWith('https:') ? '; Secure' : '');
    const server = createServer(async (req, res) => {
        try {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            if (req.method === 'POST' && req.headers.origin !== new URL(origin()).origin)
                return send(res, 403, { error: 'Invalid request origin.' });
            if (pathname === '/api/login' && req.method === 'POST') {
                const input = await body(req), name = String(input.username || '').toLowerCase(), now = Date.now(), key = 'login:' + name;
                const globalKey = 'all-logins';
                for (const k of [key, globalKey]) {
                    db.prepare('INSERT INTO attempts(key,count,until) VALUES (?,0,?) ON CONFLICT DO NOTHING').run(k, now + 900000);
                    db.prepare('UPDATE attempts SET count=0,until=? WHERE key=? AND until<=?').run(now + 900000, k, now);
                }
                if (db.prepare('SELECT count FROM attempts WHERE key=?').get(key).count >= 10 || db.prepare('SELECT count FROM attempts WHERE key=?').get(globalKey).count >= 100)
                    return send(res, 429, { error: 'Too many sign-in attempts. Retry after 15 minutes.' });
                db.prepare('UPDATE attempts SET count=count+1 WHERE key=? OR key=?').run(key, globalKey);
                const user = db.prepare('SELECT * FROM users WHERE username=?').get(name);
                const correct = user ? verify(String(input.password || '').slice(0, 1024), user.hash) : (scryptSync('invalid', 'padding', 64), false);
                const profile = user ? normalControls(ledger.read().controls).staff.find(s => s.id === user.id && s.active !== false) : null;
                if (!correct || !profile)
                    return send(res, 401, { error: 'Username or password is incorrect.' });
                db.prepare('DELETE FROM attempts WHERE key=?').run(key);
                db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
                const token = randomBytes(32).toString('hex');
                db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(sha(token), user.id, sha(user.hash), now + 8 * 60 * 60 * 1000);
                return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(token, 8 * 60 * 60) });
            }
            if (pathname === '/api/logout' && req.method === 'POST') {
                const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('true_fish_staff='))?.slice(16);
                if (raw)
                    db.prepare('DELETE FROM sessions WHERE token=?').run(sha(raw));
                return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
            }
            if (pathname.startsWith('/api/')) {
                let user = userFor(req);
                if (!user)
                    return send(res, 401, { error: 'Sign in required.' });
                if (!['GET', 'POST'].includes(req.method))
                    return send(res, 405, { error: 'Method not allowed.' });
                const input = req.method === 'POST' ? await body(req) : {};
                if (pathname === '/api/assistant' && req.method === 'POST') {
                    if (!canAct(user, 'assistant')) throw Error('Your account cannot use the assistant.');
                    const result = await assistant(user, input.question, structuredClone(ledger.read().records));
                    return send(res, 200, result);
                }
                return await serial(async () => {
                    user = userFor(req);
                    if (!user) return send(res, 401, { error: 'Sign in required.' });
                    ledger.actorId = user.id;
                    let state;
                    if (pathname === '/api/state' && req.method === 'GET')
                        state = ledger.read();
                    else if (pathname === '/api/save' && req.method === 'POST')
                        state = await ledger.save(input.payload, input.version);
                    else if (pathname === '/api/import' && req.method === 'POST')
                        state = await ledger.saveBatch(input.inputs, input.version);
                    else if (pathname === '/api/restore' && req.method === 'POST')
                        state = await ledger.restore(input.backup, input.version);
                    else if (pathname === '/api/preferences' && req.method === 'POST') {
                        if (!canAct(user, 'settings'))
                            throw Error('Administrator access required.');
                        const previous = ledger.read();
                        if (previous.version !== input.version)
                            throw Error('Records changed. Refresh first.');
                        state = structuredClone(previous);
                        state.preferences = cleanPreferences(input.preferences);
                        state.version++;
                        ledger.commit(state, previous);
                    }
                    else if (pathname === '/api/control' && req.method === 'POST') {
                        let credentials = null;
                        if (input.action === 'team') {
                            if (!canAct(user, 'team'))
                                throw Error('Administrator access required.');
                            const values = input.values || {}, name = String(values.loginName || '').toLowerCase(), newPassword = String(values.password || '');
                            if (values.id === 'owner' && (name || newPassword))
                                throw Error('Change administrator credentials in the server environment and restart.');
                            if (name && !/^[a-z0-9._-]{3,50}$/.test(name))
                                throw Error('Username must be 3–50 letters, digits, dots, underscores or hyphens.');
                            if (newPassword && (newPassword.length < 16 || newPassword.length > 1024))
                                throw Error('Staff passwords must have 16–1024 characters.');
                            const existingProfile = values.id ? normalControls(ledger.read().controls).staff.find(s => s.id === values.id) : null;
                            if (values.id && !existingProfile)
                                throw Error('Staff profile not found.');
                            const existingAccount = values.id ? db.prepare('SELECT id FROM users WHERE id=?').get(values.id) : null;
                            if (!existingAccount && (!name || !newPassword))
                                throw Error('A new server account needs a username and password.');
                            const collision = name ? db.prepare('SELECT id FROM users WHERE username=?').get(name) : null;
                            if (collision && collision.id !== values.id)
                                throw Error('That username is already used.');
                            credentials = { name, newPassword, id: values.id };
                        }
                        db.exec('BEGIN IMMEDIATE');
                        try {
                            state = await ledger.control(input.action, input.values, input.version);
                            if (credentials) {
                                const staff = state.controls.staff.find(s => s.id === credentials.id) || state.controls.staff.at(-1), old = db.prepare('SELECT * FROM users WHERE id=?').get(staff.id);
                                if (old) {
                                    db.prepare('UPDATE users SET username=?,hash=? WHERE id=?').run(credentials.name || old.username, credentials.newPassword ? hashPassword(credentials.newPassword) : old.hash, staff.id);
                                }
                                else
                                    db.prepare('INSERT INTO users VALUES (?,?,?)').run(staff.id, credentials.name, hashPassword(credentials.newPassword));
                            }
                            if (credentials) {
                                const changed = state.controls.staff.find(s => s.id === credentials.id) || state.controls.staff.at(-1);
                                if (changed.active === false || credentials.newPassword)
                                    db.prepare('DELETE FROM sessions WHERE userId=?').run(changed.id);
                            }
                            db.exec('COMMIT');
                        }
                        catch (e) {
                            db.exec('ROLLBACK');
                            throw e;
                        }
                    }
                    else
                        return send(res, 404, { error: 'Unknown endpoint.' });
                    let previous = null;
                    try {
                        previous = ledger.readRecovery();
                    }
                    catch { }
                    const actor = normalControls(state.controls).staff.find(s => s.id === user.id);
                    return send(res, 200, { state, previous, user: { id: user.id, name: actor.name, role: actor.role }, accounts: canAct(actor, 'team') ? db.prepare('SELECT id,username FROM users').all() : [] });
                });
            }
            if (req.method !== 'GET')
                return send(res, 405, { error: 'Method not allowed.' });
            const file = pathname === '/' ? 'index.html' : pathname.slice(1);
            if (!publicFiles.has(file))
                return send(res, 404, { error: 'Not found.' });
            if (file === 'index.html' && !userFor(req)) {
                res.writeHead(303, { Location: '/login.html' });
                return res.end();
            }
            const content = file === 'config.js' ? Buffer.from('globalThis.TRUEFISH_SERVER=true;') : await read(resolve(root, file));
            const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/javascript';
            res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'" });
            res.end(content);
        }
        catch (e) {
            send(res, 400, { error: e.code ? 'The server could not complete this operation.' : e.message });
        }
    });
    return { server, close: () => db.close(), database: db };
}
