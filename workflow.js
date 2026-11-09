export const ROLES = { admin: 'Administrator', approver: 'Reviewer / approver', clerk: 'Data-entry clerk', viewer: 'Read only' };
export const RIGHTS = { write: 'Create records', edit: 'Correct records', void: 'Void records', import: 'Import spreadsheet rows', approve: 'Approve reviewed figures', close: 'Close approved periods', reopen: 'Reopen periods', team: 'Manage users and rights', restore: 'Restore backups', settings: 'Change business settings', assistant: 'Use business assistant' };
export function roleRights(role) {
    const all = Object.keys(RIGHTS);
    if (role === 'admin') return all;
    if (role === 'approver') return ['write', 'edit', 'void', 'import', 'approve', 'close', 'assistant'];
    if (role === 'clerk') return ['write', 'edit', 'import', 'assistant'];
    return ['assistant'];
}
export function effectiveRights(actor) { return actor.id === 'owner' ? Object.keys(RIGHTS) : (actor.permissions || roleRights(actor.role)); }
export function roleLabel(actor) { return actor.id === 'owner' ? 'Super administrator' : ROLES[actor.role]; }
export const controlDefaults = () => ({ staff: [{ id: 'owner', name: 'Owner', role: 'admin', active: true }], closedThrough: '', approvals: [], history: [] });
export function normalControls(value) {
    if (value === undefined)
        return controlDefaults();
    if (!value || !Array.isArray(value.staff) || !value.staff.some(s => s.id === 'owner' && s.role === 'admin' && s.active !== false) || !Array.isArray(value.approvals) || !Array.isArray(value.history))
        throw Error('Invalid local workflow profiles.');
    const ids = new Set();
    for (const s of value.staff) {
        if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(s.id) || ids.has(s.id) || typeof s.name !== 'string' || !s.name || !Object.hasOwn(ROLES, s.role))
            throw Error('Invalid staff profile.');
        ids.add(s.id);
        if (s.permissions !== undefined && (!Array.isArray(s.permissions) || s.permissions.some(p => !Object.hasOwn(RIGHTS, p)) || new Set(s.permissions).size !== s.permissions.length))
            throw Error('Invalid user permissions.');
    }
    const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (value.closedThrough && !validDate(value.closedThrough))
        throw Error('Invalid closed-period metadata.');
    for (const a of value.approvals)
        if (!a || !validDate(a.through) || typeof a.hash !== 'string' || !/^[a-f0-9]{8,64}$/.test(a.hash) || typeof a.by !== 'string' || !Number.isFinite(Date.parse(a.at)))
            throw Error('Invalid approval snapshot.');
    for (const h of value.history)
        if (!h || typeof h.by !== 'string' || typeof h.action !== 'string' || !['team', 'approve', 'close', 'reopen', 'preferences'].includes(h.action) || !Number.isFinite(Date.parse(h.at)) || (h.through && !validDate(h.through)))
            throw Error('Invalid workflow history.');
    return structuredClone({ ...controlDefaults(), ...value });
}
export function actorFor(state, id = 'owner') {
    const actor = normalControls(state.controls).staff.find(s => s.id === id && s.active !== false);
    if (!actor)
        throw Error('Choose an active local profile.');
    return actor;
}
export function canAct(role, action) {
    if (typeof role === 'object') return action === 'read' || effectiveRights(role).includes(action);
    if (action === 'read')
        return true;
    if (['restore', 'team', 'reopen'].includes(action))
        return role === 'admin';
    if (['approve', 'close'].includes(action))
        return ['admin', 'approver'].includes(role);
    return role !== 'viewer';
}
export const isAccountingRecord = r => !['party', 'crew', 'maintenance', 'statement', 'match'].includes(r.kind);
export function fingerprint(records, through) { return contentHash(JSON.stringify(records.filter(r => r.date <= through && isAccountingRecord(r)))); }
export function assertMutation(state, actor, record, original = null, action = original ? 'edit' : 'write') {
    if (!canAct(actor, action))
        throw Error(actor.role === 'viewer' ? 'This user is read only.' : 'Your account does not have permission to ' + (RIGHTS[action] || action).toLowerCase() + '.');
    const closed = state.controls?.closedThrough;
    if (closed && [record, original].some(r => r && isAccountingRecord(r) && r.date <= closed))
        throw Error('This period is closed through ' + closed + '. An administrator must reopen it before changes.');
    if (original && actor.role === 'clerk' && original.enteredBy !== actor.id)
        throw Error('Clerks may correct only their own entries; ask a reviewer.');
}
export function stamp(actor) { return { enteredBy: actor.id, enteredByName: actor.name }; }
export function rowKey(value) { return contentHash(JSON.stringify(value)); }
export function contentHash(text) {
    const source = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text) : Uint8Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
    const size = Math.ceil((source.length + 9) / 64) * 64, bytes = new Uint8Array(size);
    bytes.set(source);
    bytes[source.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(size - 8, Math.floor(source.length * 8 / 4294967296));
    view.setUint32(size - 4, (source.length * 8) >>> 0);
    const constants = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), words = new Uint32Array(64), rotate = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < size; offset += 64) {
        for (let i = 0; i < 16; i++)
            words[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = words[i - 15], b = words[i - 2];
            words[i] = (words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let i = 0; i < 64; i++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0, second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + first) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (first + second) >>> 0;
        }
        const result = [a, b, c, d, e, f, g, h];
        for (let i = 0; i < 8; i++)
            hash[i] = (hash[i] + result[i]) >>> 0;
    }
    return [...hash].map(n => n.toString(16).padStart(8, '0')).join('');
}
