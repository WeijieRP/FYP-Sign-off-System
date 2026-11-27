# Admin users and login

**Owner:** shared

**Where the code is**

- backend/core/auth.js (bcrypt, sessions, encryption helpers); routes inside backend/features/admin/routes.js
- backend/core/accountEmail.js (account emails and the password rule), backend/features/passwordReset/ (a forgotten password)
- frontend/admin/js/users.js, core.js, passwordReset.js (the reset steps on the login card)

**What it does**

System admin, IT admin and IT staff accounts with soft delete and restore. The seeded account is systemadmin.

**What each role may do** (26 Nov 2026, Jun Kai; Add user and Edit user show it as three role cards)

- System Admin: every page and every setting. The only role that can add users, show visitors' email addresses (decrypt), export visitor data and delete archived records for good. Routes behind `auth.requireAdmin` need this role.
- IT Admin: the sidebar links without `data-admin-only` (10 now: Dashboard, Feedback, Pledgeboard, Feedback Reports, Tree Leaves, Tree Settings, System Health, Incidents, Hardware, Style & Theme). Can approve or reject pledges, acknowledge and resolve incidents (and give a verdict), send a test incident, rename a tablet, and delete one feedback entry. Cannot change settings, apart from their own theme and their own System Health layout. Starting an incident fix, saving Tree Settings, the Hardware alert lines and the VIP list are refused (403). Tree Settings shows as view only for them (sidebar.js, applyTreeSettingsViewOnly): a note at the top, the fields greyed out and the save, upload, apply, revert and reset buttons hidden; checked with build-check/check-tree-viewonly.js.
- The change routes of System Admin pages need System Admin too (26 Nov 2026), not only a sign-in: Mail Account (PUT /email-config and its test), Operating Hours (every /server-schedules change, POST /server/start, /restart, /stop and /mode) and the Hardware settings (PUT /api/admin/hardware/settings). Photo Timer (PUT /countdown-management) and Start Screen Text (PUT /form-ui) follow in their own commit. Reading them stays open to every signed-in admin. Checked with build-check/check-admin-gates.js: IT Staff gets 403 on each, a System Admin gets through.
- IT Staff: the same as IT Admin, but deleting feedback is refused (the check in DELETE /feedback/:id).
- The page list on the IT Admin card is read from the sidebar, so it stays right when a page is added. The texts were checked on a test copy with throwaway IT Staff and IT Admin accounts: every page they can open loads without a refused request, and each action above gave the answer written here.
- Add user starts with IT Staff (the least access) ticked. The windows are native dialogs (va-dialog): Escape closes them, the focus starts in the first field and goes back to the button that opened them, and a saved account shows a short note instead of an alert box.

**Account emails** (26 Nov 2026, Jun Kai)

- Every account has an email (migration 011, `admin_users.email`, unique). It is stored trimmed and in lower case; an account without one keeps NULL. The server adds the column by itself when the migration has not run yet.
- Add user asks for it. Edit user and the root's Edit my account can change it, but not clear it once set. Only the root changes the root's email. One email belongs to one account.
- The Users list shows each email, and a note says which accounts have none yet (they cannot reset a forgotten password).
- One password rule for adding, editing and resetting, checked by the server: at least 8 characters, at most 72 bytes (bcrypt ignores the rest), not the same as the username.
- A new email ends an open password reset of that account and sends a short note to the old address. A password set by an admin, or a soft delete, ends it too.

**A forgotten password** (26 Nov 2026, Jun Kai)

- "Forgot password?" on the login card: the username or the email of the account, then a 6 digit code from the email, or the link in it, then the new password twice.
- The answer to a request is the same whether or not the account exists, and the email is sent after the answer, so neither the words nor the time give an account away. When email is not set up on this PC, every name gets the same "not set up" answer.
- Only an active account with an email gets one; at most 5 emails per account per hour, 45 seconds apart (the page waits 60 seconds before "Send a new code", so that one is always sent).
- A reset lasts 15 minutes and a new request replaces it. After 5 wrong codes, or 10 in a day for the account across resets, the code stops working; the link keeps working for its owner. Every wrong, old or used up code gets the same answer, also for a name that does not exist, so a code check never tells whether an account exists. Only keyed hashes of the code and the link are stored (tables `admin_password_resets`, `admin_password_reset_failures`, migration 012), never the code or link.
- The link opens `/admin#reset=<token>`. The token is after "#", so it never reaches a server log, and the page removes it from the address bar at once. The link starts with the PC's own network address, never with the Host header a browser sends, so it only opens on the centre's network. The code works wherever the admin page opens.
- Saving the new password first deletes the reset (only one request can do that), so the code and the link stop working at the same moment. Then every sign-in of the account ends, including "keep me signed in", the sign-in lock of that username ends, and a "password changed" email goes to the account.
- Limits per address: 10 requests and 40 checks every 15 minutes.
- Audit log: PASSWORD_RESET_REQUESTED, PASSWORD_RESET_CODE_WRONG, PASSWORD_RESET_LIMITED, PASSWORD_RESET_EMAIL_FAILED, PASSWORD_RESET_DONE.
- Tests only: with `PASSWORD_RESET_TEST_OUTBOX=<file>` the reset emails are written to that file instead of being sent. Leave it empty on the kiosk PC.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/users` | backend/features/admin/routes.js |
| POST | `/api/admin/users` | backend/features/admin/routes.js |
| DELETE | `/api/admin/users/:id` | backend/features/admin/routes.js |
| PUT | `/api/admin/users/:id` | backend/features/admin/routes.js |
| DELETE | `/api/admin/users/:id/permanent` | backend/features/admin/routes.js |
| POST | `/api/admin/users/:id/restore` | backend/features/admin/routes.js |
| GET | `/api/admin/users/deleted` | backend/features/admin/routes.js |
| POST | `/api/admin/password-reset/request` | backend/features/passwordReset/routes.js |
| POST | `/api/admin/password-reset/verify-code` | backend/features/passwordReset/routes.js |
| POST | `/api/admin/password-reset/check-link` | backend/features/passwordReset/routes.js |
| POST | `/api/admin/password-reset/complete` | backend/features/passwordReset/routes.js |

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Change the seeded admin password on the wall PC.
- Fixed 19 Nov 2026: soft-deleted admins could still log in, and an admin who was signed in when the account was deleted stayed signed in for as long as the tab was open. Now `loginUser` (backend/core/auth.js) refuses an account in Deleted Users, which also covers every password re-check. `backend/core/adminSessions.js` ends the sign-ins of one account: `end(id)` notes the time, and a middleware right after the session setup in server.js empties any session of that account that signed in before it, so the next request answers 401 and the page shows "Your session ended. Please sign in again." It is called when an account is deleted, and when another admin changes an account's username, role or password, because a session holds the name and role from the sign-in. An admin who edits their own account stays signed in on that browser (the session takes the new name and role) and is signed out on other browsers. A restored account signs in again as usual.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
