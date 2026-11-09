import { RIGHTS, roleRights, normalControls, actorFor, canAct, assertMutation, stamp, fingerprint, rowKey } from './workflow.js';
import { inventoryJournal, accountingReport } from './business.js';
import { validate, validateLedger } from './ledger.js';
const empty = () => ({ schema: 1, version: 0, records: [], audit: [] });
export function checkBackup(input) {
    if (!input || input.schema !== 1 || !Number.isSafeInteger(input.version) || input.version < 0 || !Array.isArray(input.records) || !Array.isArray(input.audit))
        throw Error('This is not a valid True Fish backup.');
    const ids = new Set();
    for (const r of input.records) {
        validate(r);
        if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.id) || ids.has(r.id) || typeof r.created !== 'string' || !Number.isFinite(Date.parse(r.created)) || (r.void !== undefined && typeof r.void !== 'boolean'))
            throw Error('Backup contains an invalid record.');
        ids.add(r.id);
    }
    const auditIds = new Set();
    for (const a of input.audit) {
        if (!a || typeof a.id !== 'string' || auditIds.has(a.id) || typeof a.at !== 'string' || !Number.isFinite(Date.parse(a.at)) || !['add', 'void'].includes(a.action) || typeof a.record !== 'string' || !ids.has(a.record))
            throw Error('Backup contains invalid activity history.');
        auditIds.add(a.id);
    }
    validateLedger(input.records);
    const result = structuredClone(input);
    result.controls = normalControls(input.controls);
    return result;
}
export class BrowserLedger {
    constructor(storage, key = 'true-fish-pages-ledger-v1', locks = globalThis.navigator?.locks) { this.storage = storage; this.key = key; this.locks = locks; this.actorId = 'owner'; }
    read() {
        const text = this.storage.getItem(this.key);
        if (text === null)
            return empty();
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            throw Error('Saved browser records could not be read. Restore a backup or the previous saved version from Settings. Do not clear browser data.');
        }
        return checkBackup(data);
    }
    readRecovery() {
        const text = this.storage.getItem(this.key + ':recovery');
        if (!text)
            return null;
        return checkBackup(JSON.parse(text));
    }
    commit(state, previous) {
        this.storage.setItem(this.key, JSON.stringify(state));
        if (previous) {
            try {
                this.storage.setItem(this.key + ':recovery', JSON.stringify(previous));
            }
            catch { /* Current save succeeded; recovery is best effort when storage is full. */ }
        }
        return state;
    }
    async locked(fn) {
        if (!this.locks)
            return fn();
        let entered = false;
        try {
            return await this.locks.request(this.key, () => { entered = true; return fn(); });
        }
        catch (e) {
            if (!entered && e.name === 'SecurityError')
                return fn();
            throw e;
        }
    }
    async save(payload, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            if (state.version !== version)
                throw Error('Records changed in another tab. Close this dialog and refresh before saving.');
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            const now = new Date().toISOString();
            let record;
            if (payload.action === 'add') {
                record = { ...validate(payload.record), ...stamp(actor), id: crypto.randomUUID(), created: now };
                assertMutation(state, actor, record);
                state.records.push(record);
            }
            else if (payload.action === 'void' || payload.action === 'replace') {
                const original = state.records.find(r => r.id === payload.id && !r.void);
                if (!original)
                    throw Error('Record not found.');
                if (typeof payload.reason !== 'string' || !payload.reason.trim())
                    throw Error('Give a reason for the correction.');
                assertMutation(state, actor, payload.action === 'replace' ? payload.record : original, original, payload.action === 'void' ? 'void' : 'edit');
                original.void = true;
                original.voidReason = payload.reason.trim().slice(0, 300);
                record = original;
                if (payload.action === 'replace') {
                    if (payload.record?.kind !== original.kind)
                        throw Error('A correction must keep the original record type.');
                    record = { ...validate(payload.record), id: crypto.randomUUID(), created: original.created, correctedAt: now, replaces: original.id, ...(original.importKey ? { importKey: original.importKey } : {}), ...stamp(actor) };
                    state.records.splice(state.records.indexOf(original) + 1, 0, record);
                    state.audit.unshift({ id: crypto.randomUUID(), at: now, action: 'void', record: original.id, reason: original.voidReason, actor: actor.name });
                }
            }
            else
                throw Error('Unknown action.');
            validateLedger(state.records);
            state.audit.unshift({ id: crypto.randomUUID(), at: now, action: payload.action === 'void' ? 'void' : 'add', record: record.id, reason: String(payload.reason || '').slice(0, 300), actor: actor.name });
            state.version++;
            return this.commit(state, previous);
        });
    }
    async restore(backup, version) {
        const restored = checkBackup(backup);
        return this.locked(() => {
            let current;
            try {
                current = this.read();
            }
            catch (e) {
                if (version !== null)
                    throw e;
                current = null;
            }
            if (!canAct(actorFor(current || { controls: normalControls() }, this.actorId), 'restore'))
                throw Error('Only a local administrator can restore backups.');
            if (current && current.version !== version)
                throw Error('Records changed in another tab. Refresh before restoring.');
            restored.version = (current?.version || 0) + 1;
            if (current) restored.controls = structuredClone(current.controls);
            return this.commit(restored, current);
        });
    }
    async saveBatch(inputs, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            if (state.version !== version)
                throw Error('Records changed; refresh the import preview.');
            if (!canAct(actor, 'import')) throw Error('Your account cannot import records.');
            if (!Array.isArray(inputs) || !inputs.length || inputs.length > 1000)
                throw Error('Import 1–1000 rows at a time.');
            for (const [index, input] of inputs.entries()) {
                const clean = validate(input), key = 'import:' + rowKey(clean);
                const record = { ...clean, ...stamp(actor), importKey: key, id: crypto.randomUUID(), created: new Date(Date.now() + index).toISOString() };
                assertMutation(state, actor, record, null, 'import');
                state.records.push(record);
                state.audit.unshift({ id: crypto.randomUUID(), at: record.created, action: 'add', record: record.id, reason: 'Imported after preview', actor: actor.name });
            }
            validateLedger(state.records);
            state.version++;
            return this.commit(state, previous);
        });
    }
    async control(action, values, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            if (state.version !== version)
                throw Error('Records changed. Refresh and try again.');
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            if (!canAct(actor, action))
                throw Error('This action requires an administrator / reviewer profile.');
            const c = state.controls, at = new Date().toISOString();
            if (action === 'team') {
                const name = String(values.name || '').trim().slice(0, 80), role = values.role;
                if (!name || !['admin', 'approver', 'clerk', 'viewer'].includes(role))
                    throw Error('Enter name and role.');
                const existing = c.staff.find(s => s.id === values.id);
                if (existing?.id === 'owner' && actor.id !== 'owner') throw Error('Only the super administrator can change the owner account.');
                if (values.id && !existing) throw Error('User not found.');
                const permissions = values.permissions === undefined ? undefined : values.permissions;
                if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some(p => !Object.hasOwn(RIGHTS, p)) || new Set(permissions).size !== permissions.length)) throw Error('Invalid user permissions.');
                if (actor.id !== 'owner' && permissions?.some(p => !canAct(actor, p))) throw Error('You cannot grant rights you do not have.');
                if (actor.id !== 'owner' && (permissions || roleRights(role)).some(p => !canAct(actor, p))) throw Error('You cannot grant rights you do not have.');
                if (actor.id !== 'owner' && role === 'admin' && actor.role !== 'admin') throw Error('Only an administrator can create another administrator.');
                if (existing?.id === 'owner' && (role !== 'admin' || values.active === false))
                    throw Error('The owner administrator must remain active.');
                if (c.staff.some(s => s.id !== values.id && s.name.toLowerCase() === name.toLowerCase()))
                    throw Error('That profile name already exists.');
                if (existing)
                    Object.assign(existing, { name, role, active: values.active !== false, ...(permissions === undefined ? {} : { permissions }) });
                else
                    c.staff.push({ id: crypto.randomUUID(), name, role, active: values.active !== false, ...(permissions === undefined ? {} : { permissions }) });
            }
            else if (action === 'approve' || action === 'close') {
                const through = values.through;
                if (typeof through !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(through) || !Number.isFinite(Date.parse(through)) || new Date(through).toISOString().slice(0, 10) !== through)
                    throw Error('Choose a valid period-end date.');
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                if (through > today)
                    throw Error('Cannot approve or close a future period.');
                if (inventoryJournal(state.records, through).unvalued.length)
                    throw Error('Value opening fuel before approving or closing accounting figures.');
                if (accountingReport(state.records, { end: through }).balanceDifference !== 0)
                    throw Error('Financial statements do not balance; review them before approval.');
                const hash = fingerprint(state.records, through);
                if (action === 'approve')
                    c.approvals.unshift({ through, hash, by: actor.name, at });
                else {
                    if (through < (c.closedThrough || ''))
                        throw Error('Use Reopen to change earlier periods.');
                    if (!c.approvals.some(a => a.through === through && a.hash === hash))
                        throw Error('Review and approve these exact figures before closing.');
                    c.closedThrough = through;
                }
            }
            else if (action === 'reopen') {
                if (!String(values.reason || '').trim())
                    throw Error('Give a reason for reopening.');
                c.closedThrough = '';
            }
            else
                throw Error('Unknown workflow action.');
            c.history.unshift({ id: crypto.randomUUID(), action, by: actor.name, at, through: values.through || '', reason: String(values.reason || '').slice(0, 300) });
            state.version++;
            return this.commit(state, previous);
        });
    }
}
