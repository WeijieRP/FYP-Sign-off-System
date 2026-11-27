# RP Xperience Centre Sign-Off System (DP Kiosk)

Visitor engagement kiosk for the RP Xperience Centre at Republic Polytechnic: visitors give feedback and a pledge on a tablet,
take a photo, and appear as a leaf on the digital tree shown on the centre's 7 m by 2 m wall. Admins manage
everything from a web page. Built by the AY2025/26 FYP team; enhanced by the current team (see Team below).

## How it runs

| Machine | What runs | URL |
|---|---|---|
| Windows PC behind the wall | `node startAll.js`: the HTTPS server (:3000) and the local kiosk server (:3003) | wall pages at `http://localhost:3003/tree`, `/pulse` |
| Android tablets on the same Wi-Fi | Chrome | `https://<pc-ip>:3000/feedback` (the QR on the landing page carries this) |
| Admin | any browser | `https://<pc-ip>:3000/admin` (seeded login: `systemadmin`, change it and add its email on Users, so "Forgot password?" can reset it) |

MySQL 8.4 runs on the PC. Ollama is optional and only used by the admin feedback analysis.

## Install the kiosk (offline package)

The kiosk PC installs from the offline package on the GitHub Release: unzip `rp-xperience-kiosk-windows-x64.zip` and
run `install.cmd`, or paste one line into PowerShell. Node.js and MySQL are inside the package, so the PC needs
nothing else. See [docs/features/command-line-install.md](docs/features/command-line-install.md).

## Install for development (any computer)

On Windows, run `install.cmd` in the project folder (or double-click it) once Node.js 22 and MySQL 8.4 are installed:
it installs the packages, fills `backend/.env`, creates the database if it is missing and applies the migrations.
`install.cmd -Role WallPC` also sets up the kiosk PC; `uninstall.cmd` removes it again. See
[docs/features/install.md](docs/features/install.md). The manual steps:

1. Node.js 22 (`.nvmrc`), MySQL Server 8.4, Git. Optional: Ollama with `ollama pull phi3`, `gemma2:2b`, `qwen2.5:3b`.
2. Clone into a normal folder (not one whose name starts with a dot, Express cannot serve from those):
   ```bash
   git clone https://github.com/Casualty97/FYP-Sign-off-System.git
   cd FYP-Sign-off-System
   npm ci
   ```
3. Create the database (asks for your MySQL root password; drops and recreates `dp_kiosk_db`):
   ```bash
   node scripts/setup/Datastore_Assembly.js
   ```
4. `backend/.env` holds the encryption key and optional settings; `backend/.env.example` lists every variable.
5. Start:
   ```bash
   node startAll.js
   ```
   Open https://localhost:3000 and accept the self-signed certificate warning. The first start after a reboot can die
   with `connect ETIMEDOUT` while MySQL warms up; run it again. Press Ctrl+C to stop both servers.

Phones need the PC's Wi-Fi address in the QR code. If the server picks the wrong adapter, start it with
`SERVER_IP` set (PowerShell: `$env:SERVER_IP="192.168.0.4"; node startAll.js`).

## Project structure

```
startAll.js                  starts backend/server.js and backend/kioskServer.js
backend/
  server.js                  HTTPS :3000, all routes, admin, QR
  kioskServer.js             HTTP :3003 on localhost, public pages for the wall PC
  core/                      db.js, auth.js, paths.js (every filesystem path)
  features/<feature>/        one folder per feature, owned by one role (routes, stores, logic)
    admin/routes.js          the former adminRoutes.js, still one file; owners extract their route groups
  config/defaults/           committed starting values of the runtime settings
  data/                      runtime settings the admin page writes (created at boot, not in git)
frontend/
  feedback/  js/*.js         kiosk page (Role 1)        admin/  js/*.js   admin page, one file per section
  tree/  3dTree/  pulse/     wall pages (Role 2)        Pledgeboard/      pledgeboard (Role 1)
database/
  schema.sql                 frozen fresh-install baseline       migrations/   every change since
  migrate.js                 npm run db:migrate | db:status | db:new | db:snapshot
scripts/setup/               Datastore_Assembly, AuthLayer_Reconstitution, Purge_Actuator, Simulation_Generator, check_database
tests/                       smoke.js (boots and checks both servers), contracts/run.js (codebase contracts), routes.snapshot.txt
docs/features/               one page per feature: code location, routes, task-sheet items, known issues
legacy/                      the previous team's Linux three-service design, not used
assets/  uploads/            images; visitor photos (new photos are not committed)
```

Every code file starts with an OWNERSHIP block naming the previous-team authors and the current owner.

## Commands

| Command | What it does |
|---|---|
| `npm run check` | ESLint plus the contract checks. CI runs the same. |
| `npm run smoke` | Boots both servers against your MySQL, checks the endpoints, stops them. |
| `npm run smoke:full` | Same plus one feedback submission (blank `backend/data/emailConfig.json` first or a real email goes out). |
| `npm run routes:update` | Rewrites `tests/contracts/routes.snapshot.txt` after a route change. |
| `npm run db:migrate` / `db:status` / `db:new -- name` / `db:snapshot` | Database migrations, see `database/migrations/README.md`. |
| `npm run hooks:install` | Runs `npm run check` before every push. |

## Team

New to the project? Read [docs/START_HERE.md](docs/START_HERE.md) first: how the code fits together, laptop setup, the daily git routine and what CI checks.

| Role | Person | Task sheet | Folders |
|---|---|---|---|
| Role 1 | Zihan | Feedback screen: face detection, photo props, RP bear, pledge-first flow, 7 m by 2 m display, tablet battery | `backend/features/feedback`, `pledgeboard`, `frontend/feedback`, `Pledgeboard`, overlays, questions, form UI, parameters (shared) |
| Role 2 | Wei Jie | Tree screen: 3D and 2D animation, new-leaf moment, event-driven refresh, pulse layout | `backend/features/tree`, `pulse`, `frontend/tree`, `3dTree`, `pulse` |
| Role 3 | Jun Kai (lead) | Admin screen: policy-based hibernation, archive and export, health monitoring with LLM status, hardware graphs with forecasting, install scripts, email settings | `backend/features/admin`, `archive`, `analysis`, `email`, `scripts/setup`, most of `frontend/admin/js` |
| Role 4 | Ryan | Server configuration: Bluetooth asset tracking, out-of-range alerts with sound, positioning canvas | `backend/features/assets`, alerts and canvas (new) |

Shared: `backend/core`, users, audit, VIPs, lost and found. Reviewers per folder: `.github/CODEOWNERS`.
How to work: `CONTRIBUTING.md` and `GIT_WORKFLOW_GUIDE.md`.

## Troubleshooting

- **`connect ETIMEDOUT` at start**: MySQL was not ready; run `node startAll.js` again.
- **`EADDRINUSE` on 3000 or 3003**: another copy is running; stop it first (`restart-app.bat` kills both ports).
- **`/3dtree` returns 403**: by design until Admin, Digital Tree Adjustment, Display 2D/3D Tree is set to 3D.
- **Phones cannot open the QR link**: wrong adapter in the QR; set `SERVER_IP` as above and check the Windows firewall allows port 3000.
- **Analysis page shows everything as neutral**: Ollama is not running or the model is missing (`ollama list`).

## Previous team

Built in AY2025 Sem 2 and AY2026 Sem 1 by Caeden, Preti, Nick, Xuanyang (XY), Yu Kang, Bernissa, Nadhirah and Zah.
Their change notes live in the headers of the files they wrote and in `Team_Documentation/`.
