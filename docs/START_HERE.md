# Start here: the team guide

For Zihan, Wei Jie and Ryan. Read it once (about 15 minutes), then keep it open while you set up your laptop.
Everything below is written for Windows with PowerShell, VS Code and GitHub.

## 1. What the system is

A kiosk for the RP Xperience Centre. Visitors use a tablet to give feedback, make a pledge and take a photo, then get an
email. A big wall screen shows the digital tree and the pulse page. Staff manage all of it on the admin page.

It is a plain Node.js app: Express for the server, MySQL 8.4 for the data, and normal HTML, CSS and JavaScript for
the pages (no React, no build step). What you write is what the browser runs.

## 2. The machines and the two servers

| Machine | What runs | Address |
|---|---|---|
| The Windows PC behind the wall | `node startAll.js` starts two servers | |
| | `backend/server.js`: the main server, HTTPS, every route, the admin page, the QR code | `https://<pc-ip>:3000` |
| | `backend/kioskServer.js`: a local-only copy of the public pages for the wall PC's own browser | `http://localhost:3003` |
| Android tablets on the same Wi-Fi | Chrome, opened on the feedback page through the QR code | `https://<pc-ip>:3000/feedback` |
| Any laptop | the admin page | `https://<pc-ip>:3000/admin` |

The Server Schedule policies decide when the kiosk runs (automatic mode); putting the PC itself to sleep at night and
waking it is the system-level part of Role 4. On your own laptop keep the automation off (see the `.env` step below).

## 3. How a request travels through the code

Example: a visitor submits feedback on a tablet.

1. The tablet shows `frontend/feedback/feedback.html`. Its JavaScript is split into files under `frontend/feedback/js/`
   that load in the order listed at the bottom of the HTML. They all share one global scope (classic scripts, no
   `import`), so a function in `submit.js` can call one in `photo.js`.
2. The page calls `POST /api/feedback/submit-feedback`.
3. `backend/server.js` has mounted `backend/features/feedback/routes.js` at `/api/feedback`, so that file handles it.
4. The route uses `backend/core/db.js` (the MySQL pool with small helpers: `db.get`, `db.all`, `db.run`,
   `db.withTransaction`) and `backend/core/auth.js` (sessions, bcrypt, email encryption) and writes the rows.
5. It answers JSON. The page reads it and moves to the thank-you screen.

The admin page works the same way: `frontend/admin/admin.html` plus one JavaScript file per admin section in
`frontend/admin/js/` (same shared scope, same load order rule) calling `/api/admin/...`. Most admin routes are still
in one big file, `backend/features/admin/routes.js`; each owner moves their own routes out into their feature folder
when they first touch them (how to do that is written in `docs/features/admin.md`).

The wall pages (`frontend/tree`, `frontend/3dTree`, `frontend/pulse`, `frontend/Pledgeboard`) call `/api/tree`,
`/api/pulse`, `/api/pledgeboard` and poll for new data.

## 4. The folders, and who owns what

```
startAll.js                   starts both servers
backend/
  core/                       shared: db.js, auth.js, paths.js (every file path), jsonFile.js, zip.js, audit.js
  features/<feature>/         one folder per feature; the owner is in the README "Team" table and in CODEOWNERS
  config/defaults/            committed starting values of the settings files (JSON)
  data/                       the live copies the admin page edits (made at boot, never in git)
  .env                        secrets and machine settings (never in git); .env.example lists every variable
frontend/
  feedback/                   the tablet page (Role 1, Zihan)
  tree/ 3dTree/ pulse/        the wall pages (Role 2, Wei Jie)        Pledgeboard/ (Role 1, Zihan)
  admin/                      the admin page: admin.html, admin.css, js/<section>.js (Role 3 owns the shell;
                              each section file belongs to the role listed in its first line)
database/
  schema.sql                  frozen: only used for a brand-new install
  migrations/                 every change to the database since, numbered; migrate.js applies them
tests/                        smoke.js (boots and checks both servers), contracts/run.js (the codebase rules)
docs/features/<feature>.md    one page per feature: where the code is, routes, task-sheet items, known bugs
docs/review-status.md         every bug from the October review, per role, fixed or open
scripts/setup/                Datastore_Assembly.js (creates the database) and other setup scripts
legacy/                       the previous team's Linux design, not used, ignore it
```

Every code file starts with an `Owner:` line. Shared files (core, the admin shell, server.js) are edited
additively and you tell Jun Kai. Your own folders are yours.

## 5. Settings, data and secrets

- `backend/config/defaults/*.json` are the committed defaults. At boot each one is copied to `backend/data/` if it
  is not there yet. The admin page edits the copies in `backend/data/`. If a default file changes on `main` and you
  already have the copy, delete that file in `backend/data/` and start again to get the new defaults.
- `backend/.env` is yours and never committed. Copy it from `backend/.env.example`.
- Visitor photos (`uploads/`), logs and the analysis cache are never committed either. `.gitignore` and CI block them.

## 6. The database

- MySQL 8.4 on the PC and on your laptop. Database `dp_kiosk_db`, user `kiosk_user`, password `kiosk123`.
- `database/schema.sql` is frozen. Any change (new table, new column) is a migration:
  `npm run db:new -- my_change` creates `database/migrations/NNN_my_change.sql`, you write the SQL in it,
  `npm run db:migrate` applies it, `npm run db:snapshot` rewrites `database/schema.snapshot.sql` (needs
  `MYSQL_ROOT_PASSWORD` set in PowerShell: `$env:MYSQL_ROOT_PASSWORD="your root password"`). Commit the migration and
  the snapshot together.
- After every `git pull`, run `npm run db:migrate`.
- Dates: the database session runs in UTC. When you need Singapore time in SQL use
  `CONVERT_TZ(created_at, '+00:00', '+08:00')`. In the browser use `toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })`.

## 7. Set up your laptop (do this once)

1. Install Node.js 22 (LTS), MySQL Server 8.4 (remember the root password you choose) and Git. Optional: Ollama from
   ollama.com, then `ollama pull qwen2.5:3b` (only the admin feedback analysis uses it).
2. Clone into a normal folder, not one whose name starts with a dot (Express cannot serve from those):
   ```powershell
   cd C:\Users\<you>\Documents
   git clone https://github.com/Casualty97/FYP-Sign-off-System.git
   cd FYP-Sign-off-System
   npm ci
   ```
3. Quickest way (Windows): run the installer. It checks the programs, runs `npm ci`, fills the empty keys of
   `backend\.env` (`ENCRYPTION_KEY`, `SESSION_SECRET`, `KIOSK_AUTOMATION=off`), creates the database if it is
   missing (asking once for the MySQL root password) and applies the migrations. It never drops a table, so it is safe
   to run again. Then skip to `node startAll.js` in step 5. Details: [docs/features/install.md](features/install.md).
   ```powershell
   .\install.cmd -Role Laptop
   .\install.cmd -Check
   ```
   The manual way (the rest of step 3, then steps 4 and 5) does the same by hand.
   Create the database (it asks for your MySQL root password, and it drops `dp_kiosk_db` if it exists):
   ```powershell
   node scripts/setup/Datastore_Assembly.js
   ```
4. Make your `.env`:
   ```powershell
   Copy-Item backend\.env.example backend\.env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Open `backend\.env` in VS Code and fill in: `ENCRYPTION_KEY=` the 64-character value the command printed,
   `SESSION_SECRET=` any random text, and `KIOSK_AUTOMATION=off` (important on a laptop). Leave the rest.
   The terminal only shows startup lines, real actions, warnings and errors; add `LOG_LEVEL=debug` to see every
   request while you debug.
5. Apply the migrations and start:
   ```powershell
   npm run db:migrate
   node startAll.js
   ```
   Open https://localhost:3000/admin, click through the certificate warning (it is self-signed), log in with
   `systemadmin` / `SystemAdmin123!`. The tablet page is https://localhost:3000/feedback. Ctrl+C stops both servers.
6. Check that everything passes on your machine before you change anything:
   ```powershell
   npm run check
   npm run smoke
   ```
   `check` is lint plus the contracts, `smoke` boots the servers and hits the main routes. Both must be green.

To test the tablet page on your phone, be on the same Wi-Fi, scan the QR on the landing page, and if the QR shows the
wrong address start the server with `$env:SERVER_IP="192.168.x.x"; node startAll.js` (your laptop's Wi-Fi address from
`ipconfig`).

## 8. Before you write code: what to read

1. `docs/features/<your feature>.md`: where your code lives, the routes, the task-sheet items for you, the known bugs.
2. `docs/review-status.md`: the full bug list, per role, with fixed or open. Yours are the open rows in your section.
3. `README.md` (the Team table), `CONTRIBUTING.md` (the rules CI enforces), `GIT_WORKFLOW_GUIDE.md` (git step by step).
4. The first line of every file you open tells you whose it is.

## 9. Every task, step by step

```powershell
git switch main
git pull
npm ci                      # only if package-lock.json changed
npm run db:migrate          # only if database/migrations changed
git switch -c feat/short-name        # or fix/short-name
```

Work in your own feature folder. Then:

```powershell
npm run check               # lint + contracts, fix every error (never hide one)
npm run smoke               # boots both servers and checks the routes (MySQL must be running)
git add .
git commit -m "feat(feedback): rating resets between visitors"
git push -u origin feat/short-name
```

The commit message format is `type(scope): what changed`. Types: feat, fix, docs, chore, refactor, test, ci.
Scopes: your feature folder name (feedback, tree, pulse, pledgeboard, admin, archive, health, serverControl, ...),
or core, db, docs, deps, tests, scripts.

Then on GitHub:

1. Open the repository, GitHub shows "Compare & pull request" for your branch; click it.
2. The PR title must be in the same `type(scope): description` format. It becomes the commit on `main`.
3. Fill the template (it appears in the description box): what changed, how you tested it, the test specification
   IDs from the FYP test spec (or "none, because ..."), and which docs you updated.
4. CI runs by itself (see section 10). Fix anything red and push again; the PR updates by itself.
5. When every check is green, press "Squash and merge" yourself. No approval is needed. The branch is deleted
   automatically. Then `git switch main` and `git pull`.

Two labels exist for special cases: `big-change` for a PR over 1500 changed lines (CI asks for it), and
`no-test-needed` when you changed a route but a smoke test makes no sense (say why in the PR).

## 10. What CI checks, and why your PR might be red

| Job | What it does | What to do when it fails |
|---|---|---|
| pr-rules | PR title format, forbidden files (photos, `.env`, logs), size label | fix the title or remove the file |
| secret-scan | gitleaks on the new commits | remove the secret, rotate it if it was real |
| static | `node --check`, ESLint errors, the contract checks (below) | run `npm run check` locally and fix |
| smoke (Ubuntu and Windows) | fresh MySQL 8.4, migrations, boots both servers, hits the routes, submits one feedback, then archives and deletes the records it seeded (`--archive`) | run `npm run smoke` locally; read the server log in the job artifacts |
| ci-summary | the one required check | green when all of the above are |

The contract checks catch the mistakes that are easy to make in a page with shared scope: every `fetch('/api/...')`
points to a route that exists, every `onclick="..."` names a function that exists, every `getElementById('...')`
has a matching element, no function is declared twice across the admin page, every `process.env.X` is listed in
`.env.example`, every table name exists in `schema.sql` or a migration, CDN scripts are pinned to a version, every
route in `backend/features/admin/routes.js` and every `/admin` route in `backend/features/pledgeboard/routes.js`
starts with a sign-in check (`auth.requireAuth`, or `auth.requireAuth, auth.requireAdmin` for system admins only),
and the route table matches
`tests/contracts/routes.snapshot.txt`. After adding or renaming a route run
`npm run routes:update` and commit the snapshot with your change, and add a line for it in `tests/smoke.js`.

Fix problems, never silence them (no `eslint-disable`, no skipping a check). If a check is wrong, say so in the PR.

After every push to main, the "Sync zihan" workflow (`.github/workflows/sync-zihan.yml`) merges main into the `zihan`
branch. It only pushes when git merges cleanly and Zihan's changes stay byte-for-byte the same, then runs CI on
that branch. On a conflict it stops with an error in the Actions tab, and the merge is done by hand.

## 11. House rules for code

- Keep the `Owner:` line at the top of each file. Few, short comments. No banners.
- The admin page is one document: every element id must be unique across all sections, and functions live in the
  file of their section. Before adding a function, search the folder for the name.
- Admin pages use the UI kit in `frontend/admin/admin.css` (`ui-card`, `ui-pill`, `ui-btn`, `ui-table`, ...) and the
  icons in `frontend/admin/js/uiKit.js` (`uiIcon('name')`, `uiPill('ok', 'text')`). No emoji anywhere in the admin
  UI; the people using it include the RP president.
- Never print a password, key or token in a log. Never commit `backend/.env`, photos, logs or `backend/data/`.
- New route: `routes:update` + a smoke line. New table or column: a migration + the snapshot. New env variable:
  `.env.example`. Any of these: update `docs/features/<feature>.md` in the same PR, and flip the matching row in
  `docs/review-status.md` to `fixed` with your commit.
- Dates in SQL: `CONVERT_TZ(..., '+00:00', '+08:00')` for Singapore days (the session is UTC).

## 12. Zihan (Role 1): where to start

Your code: `frontend/feedback/` (the tablet page, 17 script files, load order at the bottom of `feedback.html`),
`backend/features/feedback/` (the routes, validation and pledge sentiment), the question, overlay and form-text admin
sections (`frontend/admin/js/questions.js`, `overlays.js`, `formUi.js`), the shared parameters page
(`frontend/admin/js/parameters.js`, `backend/features/parameters/`, shared with Jun Kai), and the pledgeboard:
`frontend/Pledgeboard/` (the public wall of pledges), `backend/features/pledgeboard/` (its routes, likes and moderation)
and its admin tab `frontend/admin/js/pledgeboard.js`. `frontend/feedback/js/heartbeat.js` is Jun Kai's (it tells the
health page a tablet is alive); leave it.

Read `docs/features/feedback.md` and `docs/features/pledgeboard.md` first, then the Role 1 section of
`docs/review-status.md` (43 open rows). Good first
tasks, because they teach the whole flow: the rating that survives `form.reset()` (next visitor submits the previous
rating), no auto-reset after a successful submit, the thank-you page that always says the photo was emailed. After
those, the task-sheet items (pledge required, feedback skippable, admin-editable titles and button names, RP photo
props). Test on a real phone or tablet over Wi-Fi, not only in the laptop browser: the camera and the "mobile"
detection behave differently.

Wei Jie (Role 2): `frontend/tree`, `frontend/3dTree`, `frontend/pulse`, `backend/features/tree`, `backend/features/pulse`,
and the tree tab of the admin page (`frontend/admin/js/tree.js`). Start with `docs/features/tree.md`;
the 3D page currently never draws a leaf (one commented-out line), which is the first row in your list.

Ryan (Role 4): `backend/features/assets/` and the Assets section of the admin page. `docs/features/assets.md` explains
that the Bluetooth module is not wired to anything yet, so your work starts from a clean slate.

## 13. When something is unclear

Ask in the group chat with the file name and line. If you find a new bug in someone else's area, add a row to
`docs/review-status.md` in their section (status `open`) in your PR, or tell them. Keep `docs/features/<feature>.md`
true for your feature; nobody else will.

## 14. Do not

- push to `main` (always a branch and a PR);
- edit `database/schema.sql` (write a migration);
- press Stop and hibernate on the Server Schedule page of your laptop's copy (it hibernates the machine);
- commit `backend/.env`, `backend/data/`, `uploads/`, `logs/`;
- change another role's folder without telling the owner.
