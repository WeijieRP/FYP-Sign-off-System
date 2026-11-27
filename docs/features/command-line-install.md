# Command line install, update and uninstall (offline package)

Owner: Role 3, Jun Kai. Task sheet point 5. Built 26 Nov 2026 in place of the setup.exe plan: the supervisor wants
installing and uninstalling done from the command line only.

The kiosk is installed from one offline package, a zip that carries everything: the kiosk code, its packages built
for 64 bit Windows, its own Node.js and its own MySQL 8.4. A fresh Windows 10 (1809 or newer) or Windows 11 PC needs
nothing else; PowerShell, curl.exe and tar.exe are part of Windows. A Node.js or MySQL already on the PC is never
used or changed: the kiosk's MySQL listens on its own port (3307) and only on this PC (127.0.0.1).

The older scripts in the project folder (`install.cmd` at the top of the repo, `docs/features/install.md`) stay for
developers who run the kiosk from a git checkout with their own Node.js and MySQL.

## In short

| Command | What happens |
|---|---|
| `install.cmd` in the unzipped package | asks the questions, then installs; on an installed PC it updates and keeps all data |
| `install.cmd -Role WallPC -NonInteractive -AdminPasswordFile pw.txt` | the same without questions |
| one line in PowerShell (below) | downloads the same zip, checks it and runs the same `install.cmd` |
| `install.cmd -Check` | only the checks before installing |
| `install.cmd -DryRun` | prints every step it would take |
| `C:\RPXperienceKiosk\app\update.cmd` | downloads the newest package and updates |
| `C:\RPXperienceKiosk\app\uninstall.cmd` | removes the kiosk, keeps the visitor data |
| `uninstall.cmd -RemoveData` | also deletes the visitor data (you type DELETE) |
| `export-data.cmd`, then `install.cmd -ImportData <file>` | moves the data to a new PC |

The one line (PowerShell):

```
curl.exe -fsSLo "$env:TEMP\get-kiosk.ps1" https://github.com/Casualty97/FYP-Sign-off-System/releases/latest/download/get-kiosk.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\get-kiosk.ps1"
```

`get-kiosk.ps1 -From <address or file>` takes any other source: a SharePoint or OneDrive download link, another web
server, a zip on a USB stick or an unzipped package folder. So the kiosk can still be installed when nobody can
reach the GitHub repo.

## What is in the package

`rp-xperience-kiosk-windows-x64.zip` holds one folder:

| Part | What it is |
|---|---|
| `install.cmd`, `update.cmd`, `uninstall.cmd`, `export-data.cmd` | the commands; each runs a PowerShell script from `installer\` for that one run (`-ExecutionPolicy Bypass`) |
| `README.txt` | short instructions and every option |
| `version.json` | build number (number of commits on main), commit, Node.js and MySQL versions, the database changes it knows |
| `checksums.sha256` | the SHA256 of every file; `install.cmd` checks them before it changes anything |
| `payload\app.zip` | the kiosk: `backend`, `frontend`, `database`, `assets`, `scripts\install`, `node_modules` (built with `npm ci --omit=dev` on Windows, so bcrypt and sharp are ready), and `runtime\node\node.exe` |
| `payload\mysql.zip` | MySQL 8.4 from Oracle's zip that needs no installer (server, client tools, plugins, messages; no headers or docs) |
| `installer\` | the PowerShell scripts (also inside `app.zip`, so the installed copy has them) |

Never in the package (the build stops if one gets in): `backend\.env`, `backend\certs`, `backend\data`,
`backend\cache`, `backend\config\defaults\emailConfig.json`, `uploads`, logs, keys, tests, docs and git history.
The installer makes a fresh `backend\.env` with new random keys and passwords on every PC.

The Visual C++ runtime DLLs sit next to `mysqld.exe` and next to the AI runtime (onnxruntime). A fresh PC does not
have them, and without them MySQL and the local sentiment model would not start. The build reads the import table
of every `.exe`, `.dll` and `.node` file (`scripts/install/pe-imports.js`) and stops if a DLL is neither in the
package nor part of Windows.

The zip also carries the sentiment model (`Xenova/bert-base-multilingual-uncased-sentiment`, about 110 MB), so the
local AI check works on a PC without internet from the first start. There is one package only.

## Where things go

| Path | What | Who may change it |
|---|---|---|
| `C:\RPXperienceKiosk\app` | the kiosk with its own Node.js, `start-kiosk.cmd`, `kiosk-status.cmd`, `update.cmd`, `uninstall.cmd`, `export-data.cmd` | the installing user |
| `C:\RPXperienceKiosk\mysql` | MySQL program files and `my.ini` (port 3307, 127.0.0.1 only, X protocol off) | administrators |
| `C:\RPXperienceKiosk\mysql-data` | the database files | the MySQL service and administrators |
| `C:\RPXperienceKiosk\data` | `install.json` (the record), `logs`, `backups`, and after an uninstall `kept` | the installing user |
| service `RPXKioskMySQL` | starts MySQL with Windows, runs as its own virtual account `NT SERVICE\RPXKioskMySQL` | |
| Wall PC: Startup shortcut, desktop link, firewall rule | start at sign in, the admin page link, TCP 3000 for tablets on Private and Domain networks | |

Why the rights look like this: a service that runs from a folder normal users can change lets them run their own
program as that service. So administrators own the install folder and the MySQL folders, and the user only owns
the folders they make in it (`app`, `data`). This is the same idea as the root of `C:\` itself. On a laptop where
nobody gives administrator rights, MySQL runs as a hidden program of the user instead of a service, and the whole
folder is private to that user.

## Install, in order

1. Check the package: every file against `checksums.sha256`, and that `version.json` and both payload zips are there.
2. Decide what to do: nothing installed (new install), the same build (repair), a newer build (update), an older
   build (refused unless `-AllowDowngrade`). A package that does not know a database change the installed database
   already has is always refused.
3. Questions, or the options: role, ports, first admin account, data from an old PC, and on a laptop whether MySQL
   should be a service.
4. Checks before installing: 64 bit Windows 10 1809 or newer, PowerShell 5.1, Windows' own `tar.exe`, free disk
   space, path length (the deepest file must stay under 260 characters), the folder is not a drive root, Windows,
   Program Files or inside the package, the folder is new, empty or holds kept data, and the three ports (3000, 3003,
   3307) are free or used by this install. A Node.js or MySQL found on the PC is only mentioned. `-Check` stops here.
5. One Windows prompt for administrator rights (`KioskMachine.ps1`): the folder and its rights, MySQL unpacked, its
   data folder set up with the database, its user and a random root password in one go (`mysqld --initialize` with
   `--init-file`, so no password is ever typed, shown or passed on a command line), the service, and on a Wall PC
   the firewall rule. Every path is passed in, because the account that answers the prompt may not be the user.
6. The kiosk unpacked into `app.new`, data kept by an earlier uninstall moved into it.
7. `backend\.env` from `.env.example` with `DB_HOST=127.0.0.1`, `DB_PORT`, the new database password and `PORT`
   (handed to `setup.js set-env` on standard input, never as arguments), then `setup.js install`: new
   `SESSION_SECRET` and `ENCRYPTION_KEY`, `schema.sql`, every migration, the database check.
8. The first admin account (`setup.js set-admin`): `systemadmin` gets the typed password; another name becomes a
   System Admin of its own and `systemadmin` gets a long random password. The public default password never works.
   The account has no email yet: add it on Users after the first sign in, so "Forgot password?" on the login card can
   send it a reset code.
9. `app.new` becomes `app`; on a Wall PC the Startup shortcut (`start-kiosk.cmd --logon`) and the desktop link.
10. The kiosk is started and the installer waits until the admin page answers, then prints the admin and tablet
    addresses.

If any step fails, everything this run made is undone in reverse order (the administrator items with one more
prompt), and data kept by an earlier uninstall goes back to `data\kept` first. If the PC is turned off in the
middle, `data\install-state.json` remembers the database login and whether kept data was moved; the next
`install.cmd` moves that data back and finishes the install.

Stopping the kiosk (before an update or an uninstall) ends only the node.exe processes that run from the install
folder and the console window they run in, for example the `cmd /k` window "Restart application" opens.

## Update, in order

Run `install.cmd` (or `update.cmd`) of a newer package, or `app\update.cmd`:

1. Stop the kiosk servers of this folder (only node.exe whose command line is inside it, never every node.exe).
2. Back up: `mysqldump` of the database, `backend\.env` and `backend\data` into `data\backups\<time>-build<N>`
   (the last five are kept).
3. A newer MySQL replaces the program files (the data is upgraded when MySQL starts); an older one is refused.
4. The new build unpacked into `app.new`, then the app's data moved into it: `backend\.env`, `backend\data`,
   `backend\certs`, `backend\cache`, `uploads`, `logs`, the downloaded AI model, and pictures uploaded on the admin
   page (every file in `assets` that the old build did not ship, from its `.shipped-assets.txt`).
5. The new database changes (`setup.js install` never drops a table).
6. Swap: `app` becomes `app.old`, `app.new` becomes `app`; start and wait for the admin page.
7. Delete `app.old`.

If a step fails, the previous build comes back: the swap is undone, the data is moved back, and if the database
changed, the backup is loaded back. A run that stopped half way (power cut) is finished first by the next
`install.cmd`.

## Uninstall

`uninstall.cmd` reads `data\install.json` and removes exactly the items listed there and nothing else: the service
(only when its program is inside the install folder), the firewall rule (by its own id), the shortcuts (only when
they still start this install), the program folders. The visitor data is kept: `backend\.env`, settings, photos,
logs and uploaded pictures go to `data\kept`, the database stays in `mysql-data`, and `data\README.txt` says what is
there. A later `install.cmd` in the same folder finds it and uses it again.

`uninstall.cmd -RemoveData` deletes everything, after you type `DELETE` (`-ConfirmDelete DELETE` when unattended).
At the end it checks that no folder, service, firewall rule, shortcut, scheduled task or kiosk program is left.

## Moving to a new PC

`export-data.cmd` packs the database (`mysqldump`), `backend\.env` (the encryption key that stored emails and archive
zips need), `backend\data`, the visitor photos and the uploaded pictures into one file, locked with a passphrase:
PBKDF2 SHA256 makes two keys, AES 256 locks the file, and an HMAC proves the passphrase and that nothing changed
before anything is unlocked (`KioskData.ps1`, plain .NET, so it needs no Node.js). On an older copy of the project
folder: `export-data.cmd -Source <folder>` from a package.

On the new PC, `install.cmd -ImportData <file>` loads it into a new install: the database instead of the empty
tables, the old encryption key instead of a new one, and the admin accounts of the old PC (so no admin question).

## Safety features

| Feature | Where |
|---|---|
| checks before installing, `-Check` | step 4 above |
| a log of every run, never with a password or key | `data\logs` (before the folder exists: `%TEMP%\rp-xperience-kiosk`) |
| dry run, `-DryRun` | prints the steps, changes nothing |
| rollback | fresh install: undo in reverse; update: previous build and database back |
| version check | build number, database changes, MySQL version |
| backup before every update | `data\backups` |
| one run at a time | a system wide lock |
| unattended use | every question has an option; exit codes 0 done, 1 failed and undone, 2 an administrator step is missing, 3 refused |
| health check | waits until the admin page answers |
| status | `app\kiosk-status.cmd` |

## Building the package

```
node scripts/install/build-package.js --out C:\rpkb
```

`--no-ai-model` leaves the model out, for a quicker test build only; releases always carry it.

Runs on Windows with Node.js 22 and git (Visual Studio's redistributable folder gives the Visual C++ runtime; the
GitHub Windows runner has it). Node.js is checked against nodejs.org's `SHASUMS256.txt`; MySQL against the SHA256
pinned in `scripts/install/runtime.js`. The result is in `C:\rpkb\dist`.

`release.yml` builds the zip after CI passes on main and publishes it, with `get-kiosk.ps1`, as a normal GitHub
Release, so `releases/latest/download/<name>` always gives the newest one. The zips are never committed. After
publishing, it deletes the older releases it made (tags `build-<number>-<commit>` with a lower number), so only the
newest one stays; a release made by hand is never deleted, and the git tags stay. CI runs can finish out of order,
so a run for an older commit than the newest release publishes nothing. Keep a copy of a zip elsewhere if an older
build may be needed again.

## Tests

CI job `package` (Windows runner): builds the package, runs `tests/install/kiosk-data.test.ps1` (the passphrase
lock) and `tests/install/installer-checks.test.ps1` (refusals, the dry run on a fake package, and that every command
the scripts call exists), then `tests/install/package-flow.ps1`: the one command install from a download, the MySQL
service stopped and started again, a repair through the package's `install.cmd`, an update through its `update.cmd`
with a "Restart application" window open, two failed updates that must put everything back, a refused older
package, the installed `update.cmd` with another source, an export, an uninstall that keeps the data, a reinstall
cut off half way and then finished, a full uninstall, a laptop install that loads the exported data, and a failed
fresh install. After every uninstall it checks that nothing of the kiosk is left. It also checks that the zip
holds the AI model. Unit tests: `tests/unit/installPackage.test.js`.

Not covered by CI (the runner is already an administrator and has the Visual C++ runtime): the real Windows prompt,
answered by a different administrator account while a standard user installs, the questions when `install.cmd` is
double clicked, a PC that never had Visual Studio or the Visual C++ runtime, a network that Windows calls Public,
and a real restart of the Wall PC. These are for the test on the school VM.

## Not here on purpose

Hibernate and wake timers: Role 4's (Ryan) "server hibernation scheduling at the system level". The installer does
not touch the power plan.
