# Install and uninstall scripts

Owner: Role 3, Jun Kai. Task-sheet point 5, "installation and deletion scripts" for the application (built 12 Nov 2026).

This page is the developer setup: a git checkout with Node.js and MySQL already on the PC. The kiosk itself is
installed from the offline package, which brings its own Node.js and MySQL: see
[command-line-install.md](command-line-install.md).

## In short

| Command (in the project folder) | What happens |
|---|---|
| `install.cmd` (or double-click it) | asks Laptop or Wall PC, then sets the kiosk up |
| `install.cmd -Role Laptop` | a development laptop: packages, `backend\.env`, database; Windows is left alone |
| `install.cmd -Role WallPC` | the kiosk PC: the same, plus start at logon, a desktop link and the firewall rule |
| `install.cmd -Check` or `npm run doctor` | only reports what is set up |
| `uninstall.cmd` | stops the kiosk and removes everything the install and the kiosk added to Windows |
| `uninstall.cmd -RemoveData` | also drops the database (you type its name) and deletes `backend\data` (but not the archive zips in `backend\data\archives`), `backend\cache` and `logs` |
| `-DryRun` on either | prints every step, changes nothing |

Other switches: `-NonInteractive` (no questions; the safe answer is taken, so nothing risky happens without a switch
that asks for it), `-SkipNpm`, `-ConfirmDatabase <name>` (uninstall `-RemoveData` without the question).

Not here on purpose: hibernate and wake timers. They are Role 4's (Ryan) task-sheet line "Set up server hibernation
scheduling at the system level", so neither script touches the power plan. Once that part is on main, the installer
gets the matching step (the user's rule of 12 Nov 2026: keep the installer in step with main).

## Files

| File | Job |
|---|---|
| `install.cmd`, `uninstall.cmd` | double-click wrappers: run the PowerShell script with `-ExecutionPolicy Bypass` for that one run only, keep the window open after a double-click |
| `scripts/install/install.ps1` | programs check, `npm ci`, calls `setup.js`, the Wall PC steps, the `-Check` report |
| `scripts/install/uninstall.ps1` | stops the kiosk, removes the Windows parts, optional data removal |
| `scripts/install/common.ps1` | the names both scripts use and small helpers (Windows PowerShell 5.1 is enough, files stay ASCII) |
| `scripts/install/setup.js` | `backend/.env` and the database, in Node (unit tests: `tests/unit/installSetup.test.js`) |

## What install does, in order

1. **Programs.** Node.js 22.12 or newer (what `package.json` asks for), npm, a running MySQL service. The project
   and its CI run on Node.js 22 (`.nvmrc`); a newer Node.js is accepted with a note, and the hint for a missing one
   is `winget install OpenJS.NodeJS.22`, because winget's `OpenJS.NodeJS.LTS` now installs a newer version. Git and Ollama (with `qwen2.5:3b`) are optional
   and only reported. Anything missing stops the install with what to install.
2. **Packages.** `npm ci`. Skipped with `-SkipNpm`, or when `node_modules` is a link to another folder (so that
   folder is never emptied). If the kiosk is running from this folder it asks to stop it first (npm cannot replace
   files in use).
3. **Settings.** `backend/.env` is made from `backend/.env.example` if it is missing. Only empty keys are filled:
   `SESSION_SECRET` (random) and `ENCRYPTION_KEY` (random, see below). `KIOSK_AUTOMATION` follows the role: `off` on a
   laptop (nothing starts by itself there: no scheduled kiosk start, no automatic fix), `on` on the Wall PC. A value
   that is filled in is never replaced, and no value is ever printed.
4. **Database.** It logs in as `DB_USER`. If that user cannot log in, or may not create the database, it asks once for
   the MySQL root password (typing is hidden; it is never put on a command line) and creates the database, creates the
   user and gives it its rights. `database/schema.sql` starts with `DROP TABLE`, so it is only loaded into an **empty**
   database; then every migration is applied. A database that has tables is never dropped: running install again only
   applies new migrations. It ends with a check: at least 14 tables, an admin account, no migration pending. On a fresh
   database it prints the first login (`systemadmin`, change the password in User Management and add the account's email
   there, so "Forgot password?" on the login card can send it a reset code).
5. **Wall PC, as the user:** a shortcut in the Startup folder starts `node startAll.js --logon` at logon (minimised
   window; `--logon` makes the History list on Server Schedule say "Started: Windows sign-in"), and
   an "RP Xperience Centre Kiosk Admin" link to `https://localhost:<PORT>/admin` goes on the desktop.
6. **Wall PC, as administrator** (Windows asks; a second, elevated window does only this part): a firewall rule
   "RP Xperience Centre Kiosk - tablets to the kiosk server" for the main server's port (`PORT` in `backend\.env`, 3000 unless changed)
   on Private and Domain networks (never Public). Tablets only talk to the main server; the kiosk server on 3003
   listens on this PC only (`backend/kioskServer.js`), so it gets no rule. When the rule is already right, nothing asks
   for administrator rights; a rule of an earlier install that opened other ports is replaced. If Windows counts the
   PC's network as Public, the installer says that tablets cannot reach the kiosk until the network is set to Private
   (it does not change that setting itself).

## What uninstall does, in order

1. Stops the kiosk: only the `node.exe` processes whose command line names a file in this folder (and the
   `startAll.js` parent of those). Never "every node.exe", never "whatever listens on port 3000".
2. Removes the Startup shortcut (only if it starts a copy in this folder) and the desktop link.
3. As administrator: removes the firewall rule.
4. With `-RemoveData` and the database name typed again: drops the database and deletes `backend\data` (except
   `backend\data\archives`, the default folder of the Visitor Data Archive zips),
   `backend\cache` and `logs`.
5. Stays on purpose: the program folder (delete it by hand), `uploads\photos`, the archive zips, `backend\.env` (its key
   is the only one that opens them), the MySQL user, and Node.js, MySQL and Ollama themselves.

## Encryption key

`ENCRYPTION_KEY` encrypts visitor emails and the Visitor Data Archive files. An empty key means the public development
key in `backend/core/auth.js` is used. The installer only creates a key while the database holds no encrypted email, no
encrypted Lost & Found contact and no archive; otherwise it leaves the key empty and says so, because a new key would
make those unreadable. After the migrations, install and update also encrypt the contacts of Lost & Found reports saved
before migration 010 (`database/encrypt-lostfound-contacts.js --apply`, safe to run twice; the update backup comes first). Keep a copy of
`backend\.env` somewhere safe: an archive can only be opened with the key that wrote it.

## Notes

- On a fresh copy (`npm ci` not run yet) `-Check` says the packages are missing and leaves the database for later, and a
  dry run lists the settings and database steps without reading the database. A real install runs `npm ci` first.
- `backend/.env` is still tracked in git (from the previous team). After the installer fills it, never commit it; the
  installer reminds you at the end.
- `setup.js` exit codes: 0 done, 1 failed, 2 the root password is needed but there was no way to ask (set
  `ESG_MYSQL_ROOT_PASSWORD`, or `--root-password-empty` for a root without a password).
- 18 Nov 2026 review: the rule used to open TCP 3000 and 3003 whatever `PORT` was, and every run of the Wall PC
  install asked for administrator rights again even with the rule in place. Both are fixed as described above, and
  the Node.js check follows `package.json` (22.12, not any 22). A Wall PC install whose firewall rule could not be
  made ends with an error and exit code 1 instead of "installed". The release notes (`.github/workflows/release.yml`)
  name `install.cmd` instead of the manual steps; the release zip leaves `backend/.env` out, so a copy from a release
  gets its settings file and keys made fresh.
- Starting by itself after a power cut (18 Nov 2026, see "After the PC was off" in [serverControl.md](serverControl.md))
  needs two settings the installer does not touch: the PC's firmware must switch it on when power returns, and Windows
  must sign in by itself (the logon shortcut only runs in a signed-in session). A PC installed before 18 Nov 2026 gets
  the `--logon` shortcut when `install.cmd -Role WallPC` is run again.
- CI: the Windows smoke job runs `install.ps1 -Check`, a Wall PC dry run and an uninstall dry run under Windows
  PowerShell 5.1.

## How to test on a laptop

```powershell
.\install.cmd -Check
.\install.cmd -DryRun -Role WallPC
.\install.cmd -Role Laptop        # fills empty keys of backend\.env, KIOSK_AUTOMATION=off, applies new migrations
.\uninstall.cmd -DryRun -RemoveData
```

Do not run `uninstall.cmd -RemoveData` on a copy whose database you need, and do not run the Wall PC install on a
laptop unless you want the kiosk to start at logon.
