# Optional secure staff server — no Cloudflare

Use this mode for authenticated staff, enforced permissions and shared data. GitHub Pages itself remains static. The server uses Node.js 24 and SQLite with no third-party runtime dependencies, hosted on a machine you choose. No automatic external backup service is added.

For optional locally hosted AI answers, see AI-GUIDE.md. Leave AI_MODEL unset to keep only the built-in analysis. The AI model is separate from the application and is not bundled or installed automatically.

## Start locally

Install Node.js 24, open a terminal in the extracted folder, then run:

```sh
npm run setup-server
npm start
```

Setup creates private .env.local configuration with username admin and a generated password, prints the password once, and refuses to overwrite an existing file. Keep it privately. Open http://localhost:3000. No dependency installation or build is needed to run the supplied bundle.

## Staff accounts

Sign in as the super administrator and open Review & staff. Choose Create user, enter a name, role, unique username and a password of at least 16 characters. Adjust the individual right checkboxes before saving. Blank password fields retain existing credentials when editing. Staff cannot switch identities from a dropdown. See USERS.md for the complete role and permission guide.

Deactivated profiles cannot access the ledger. Credential changes invalidate sessions. Sessions expire after eight hours. Owner administration cannot be disabled/demoted; change its credentials through the server environment and restart.

Passwords use salted scrypt hashes. Session tokens are stored hashed and sent in HttpOnly cookies. The server checks identity, role, record ownership, version and period locks. Client-supplied actor IDs are ignored.

## Hosting configuration

Set APP_URL to the exact HTTPS origin visitors use. Configure HTTPS on the host/reverse proxy, persistent disk and process restart. Set HOST=0.0.0.0 only if network connections are required; default is loopback. PORT defaults to 3000. DATABASE_PATH defaults to ./data/true-fish-shared.sqlite.

Run one application process. Keep databases outside public web directories. Temporary server disks can lose records on replacement. Never upload .env.local, actual database files or credentials into GitHub Pages.

## Move existing records deliberately

Download a JSON backup from browser mode. A user assigned Restore backups may restore it into server mode after keeping a manual backup of current server data. Browser data is not silently uploaded. The current server user list, permissions and period controls are preserved; create additional server users deliberately. Passwords/sessions are separate from financial backups.

## Manual backups only

Automatic external backups are excluded. Stop the server cleanly and copy its SQLite file to a safe location you choose. Preserve any remaining -wal/-shm files too; never copy only the main file while running. Restore with the server stopped. Current/previous versions in the active database are not an external backup.

The static app still works by opening index.html or publishing on GitHub Pages. Its config.js defaults to static mode; the Node server supplies its own configuration when serving the app.
