# Sign-in, super administrator and user rights

## GitHub Pages and local HTML

Open index.html. Before the app loads, you will see the aquatic login screen. The first visit asks you to create a super administrator username and password. Choose your own; no default password is provided. Use at least 16 characters and keep the password privately.

Existing boat and finance records are retained. The protected owner profile becomes the super administrator; setup does not replace those records. Existing profiles need usernames and passwords assigned by the super administrator before those users can sign in.

This edition keeps credentials and records in the same browser/device. Passwords are stored as salted PBKDF2-SHA-256 hashes with 210,000 iterations, not plain text. The session is tab-specific and expires after eight hours. Sign out ends the session.

**Local sign-in is a convenience lock, not a security boundary.** Anyone with access to this device or browser storage can bypass the interface, copy data or modify roles. GitHub Pages is static and cannot enforce private shared-user authentication. Accounts do not sync between devices. Use the shared-server edition for enforced permissions.

## Shared-server sign-in

Follow SERVER.md. Setup generates an administrator password in private .env.local; the owner signs in at the server address. The server redirects unauthenticated app requests to login.html and rejects unauthenticated API requests.

Passwords use salted scrypt hashes, and sessions use HttpOnly cookies with hashed tokens in SQLite. Configure HTTPS before sharing the server externally. The server checks current account status and action rights on each operation; changing a browser field or actor ID cannot grant authority.

## Create and manage users

1. Sign in as the super administrator.
2. Open **Review & staff**.
3. Choose **Create user**.
4. Enter the person's name, username and password (16–1024 characters).
5. Choose a role, then adjust the action-right checkboxes.
6. Save the account. Share its credentials privately with that person.

Use **Manage user** to change the name, role, rights, username or status. A blank password retains the existing password. A new password resets it and invalidates existing sessions. Deactivated users cannot sign in or keep using the server. Reactivating an account does not restore old sessions.

The super administrator cannot be demoted, deactivated or have rights removed. Only that account may change its own profile. Its global privileges include all data entry and administration actions; it still follows ledger validation and must explicitly reopen a closed period before editing records in it.

The shared-server owner credentials are managed in private server configuration; change ADMIN_USERNAME/ADMIN_PASSWORD and restart to replace them. In local-device mode the owner may update its own credentials from Manage user; doing so signs it out.

## Role defaults

| Role | Default action rights |
| --- | --- |
| Super administrator | Every system right, permanently |
| Administrator | Every action right by default; may be customised by the owner |
| Reviewer / approver | Create, correct, void, import, approve, close and assistant |
| Data-entry clerk | Create, import, correct own entries and assistant |
| Read only | View records and use assistant |

All roles can view the business records. Rights do not divide confidential records into departments or limit access by boat. Read access also permits reading or copying figures; these controls do not prevent screenshots or downloaded data copies.

## Individual permissions

The checkboxes control creating records, correcting records, voiding records, spreadsheet imports, approval, period closing, reopening, managing users, restoring backups, changing business settings and using the assistant. Selecting a role in the user form resets the checkboxes to its defaults; adjust them afterward.

A delegated account cannot grant rights it does not itself possess. A non-administrator cannot create an administrator, and no delegated account may edit the protected owner. Only users with Manage users and rights see administration controls. A clerk remains restricted to correcting its own records even when assigned the correction right.

## Backups and recovery

Financial JSON backups do not contain passwords or login sessions. Restoring financial data preserves the current user list, permissions, approvals and closed-period controls. Accounts therefore remain under the current super administrator's control after a restore.

For a local user who forgets a password, ask an active administrator to reset it. Local sign-in data is tied to the original browser/path and is not included in ledger backups. Keep the owner password safely. Moving to a new browser requires a new local owner setup and a deliberate financial backup restore; recreate additional user credentials there.

For shared-server owner recovery, update the private server configuration and restart. Back up the server database and private configuration manually and separately. No automatic external backup service or Cloudflare is introduced.
