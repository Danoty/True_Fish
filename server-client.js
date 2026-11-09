export class ServerLedger {
    constructor() { this.actorId = 'owner'; this.key = 'true-fish-shared'; this.cache = null; this.previous = null; }
    async request(path, body) {
        const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
        if (response.status === 401) {
            location.href = '/login.html';
            throw Error('Please sign in.');
        }
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || 'Request failed.');
        if (data.state) {
            this.cache = data.state;
            this.previous = data.previous || null;
            this.actorId = data.user.id;
            this.accounts = data.accounts || [];
            return this.cache;
        }
        return data;
    }
    async read() { return this.request('/api/state'); }
    readRecovery() { return this.previous; }
    async save(payload, version) { return this.request('/api/save', { payload, version }); }
    async saveBatch(inputs, version) { return this.request('/api/import', { inputs, version }); }
    async restore(backup, version) { return this.request('/api/restore', { backup, version }); }
    async setPreferences(preferences, version) { return this.request('/api/preferences', { preferences, version }); }
    async control(action, values, version) { return this.request('/api/control', { action, values, version }); }
}
