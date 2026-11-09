/* A local-device convenience lock. Shared security is enforced only by the server edition. */
globalThis.TrueFishLocalAccess = class {
    constructor(storage, sessions, key) { this.storage = storage; this.sessions = sessions; this.key = key; }
    read() { const raw = this.storage.getItem(this.key + ':access'); if (!raw) return { users: [], sessions: [], attempts: 0, retryAt: 0 }; const data = JSON.parse(raw); if (!Array.isArray(data.users) || !Array.isArray(data.sessions)) throw Error('Local sign-in data is damaged. Use the original browser or restore access from a separate administrator account.'); return data; }
    save(data) { this.storage.setItem(this.key + ':access', JSON.stringify(data)); }
    hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
    async digest(password, salt) { if (!crypto.subtle) throw Error('This browser cannot provide password hashing. Use a current browser or the server edition.'); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bytes = Uint8Array.from(salt.match(/../g), c => parseInt(c, 16)); return this.hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: 210000 }, key, 256))); }
    async prepare(username, password, existing = null) {
        username = String(username || existing?.username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw Error('Username must contain 3–50 letters, digits, dots, underscores or hyphens.');
        if (!password && existing) return { ...existing, username };
        if (typeof password !== 'string' || password.length < 16 || password.length > 1024) throw Error('Use a password of 16–1024 characters.');
        const salt = this.hex(crypto.getRandomValues(new Uint8Array(16)));
        return { username, salt, hash: await this.digest(password, salt) };
    }
    setUser(id, credential) { const data = this.read(); if (data.users.some(u => u.id !== id && u.username === credential.username)) throw Error('That username already exists.'); data.users = data.users.filter(u => u.id !== id); data.users.push({ ...credential, id }); data.sessions = data.sessions.filter(s => s.userId !== id); this.save(data); }
    revoke(id) { const data = this.read(); data.sessions = data.sessions.filter(s => s.userId !== id); this.save(data); }
    async setup(username, password, confirmation) { const data = this.read(); if (data.users.length) throw Error('A super administrator already exists. Sign in.'); if (password !== confirmation) throw Error('Passwords do not match.'); const credential = await this.prepare(username, password); if (this.read().users.length) throw Error('Administrator setup was completed in another tab. Sign in.'); this.setUser('owner', credential); return this.login(username, password); }
    active(id) { const raw = this.storage.getItem(this.key); if (!raw) return id === 'owner'; try { const state = JSON.parse(raw); const staff = state.controls?.staff || [{ id: 'owner', role: 'admin', active: true }]; return staff.some(s => s.id === id && s.active !== false); } catch { return id === 'owner'; /* The authenticated owner may open the recovery screen for a damaged ledger. */ } }
    async login(username, password) {
        const data = this.read(), now = Date.now();
        if (data.retryAt > now) throw Error('Too many attempts. Wait 15 minutes and try again.');
        const user = data.users.find(u => u.username === String(username).trim().toLowerCase());
        const hash = await this.digest(String(password).slice(0, 1024), user?.salt || '00000000000000000000000000000000');
        if (!user || hash !== user.hash || !this.active(user.id)) { data.attempts = (data.attempts || 0) + 1; if (data.attempts >= 10) { data.retryAt = now + 900000; data.attempts = 0; } this.save(data); throw Error('Username or password is incorrect, or the account is inactive.'); }
        const token = this.hex(crypto.getRandomValues(new Uint8Array(32)));
        data.attempts = 0; data.retryAt = 0; data.sessions = data.sessions.filter(s => s.expires > now); data.sessions.push({ token, userId: user.id, credential: user.hash, expires: now + 8 * 60 * 60 * 1000 }); this.save(data); this.sessions.setItem(this.key + ':session', token); return user.id;
    }
    current() { const data = this.read(), token = this.sessions.getItem(this.key + ':session'), session = data.sessions.find(s => s.token === token && s.expires > Date.now()); const user = session && data.users.find(u => u.id === session.userId && u.hash === session.credential); return user && this.active(user.id) ? user.id : null; }
    logout() { const data = this.read(), token = this.sessions.getItem(this.key + ':session'); data.sessions = data.sessions.filter(s => s.token !== token); this.save(data); this.sessions.removeItem(this.key + ':session'); }
};
