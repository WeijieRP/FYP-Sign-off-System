# System and LLM health

**Owner:** Role 3, Jun Kai

**Where the code is**

- backend/features/health/checks.js (the checks), routes.js (GET /api/admin/health, GET and PUT /api/admin/health/layout), layout.js (each admin's chosen checks, backend/data/health-layout.json), tabletNames.js (the names admins give the tablets, backend/data/tablet-names.json), publicRoutes.js (POST /api/health/heartbeat, mounted on both servers)
- frontend/admin/js/health.js and the System Health page in admin.html; frontend/feedback/js/heartbeat.js posts the tablet heartbeat (Role 3 file inside the kiosk folder; since 19 Nov 2026 it also shows the kiosk page's offline and closed screens and brings the page back by itself, see serverControl.md)
- table device_heartbeats (database/migrations/001_device_heartbeats.sql, then 003_drop_heartbeat_battery.sql)

**What it does**

One page with a card per check: MySQL (version, latency), kiosk server (:3003 probe), Ollama (models, latency; OLLAMA_URL), email (SMTP login, cached 5 minutes, "Check now" forces it), disk space of the project drive, the server PC (CPU and memory load, uptime, app memory), the schedule automation (mode, next stop and start) and the tablets. Every kiosk screen posts a heartbeat once a minute (device id kept in localStorage); one row per device is kept. Refreshes every 30 seconds while open. While the Local AI models switch of the incident settings is off (17 Nov 2026) the Ollama card says Off instead of being checked: a fifth status, `off`, that never counts as a problem and is listed last under Switched off.

Customise (supervisor meeting 03): every check is shown by default; an admin removes the ones they do not need with the switches under Customise and adds them back the same way or with Show all (the cross on each card was taken out on 9 Nov 2026). The choice is saved per admin account on the server, hidden checks are not run for the page (the background recorder behind the anomaly detection still runs them, see Incidents below), the top pill counts only the checks on the page, and the Tablets panel follows its card. Placeholder cards hold the layout while the checks run, so the page does not jump. The Monitoring options panel closes with its close button or the Escape key.

Tablet names: the edit button next to a tablet in the Tablets panel gives it a name or a number (up to 40 characters, no two tablets with the same name); an empty name shows the device name again. Named tablets are listed first in number order ("Tablet 2" before "Tablet 10"), the others after them, most recent first. The names are kept in backend/data/tablet-names.json, apart from the heartbeat rows, so a kiosk never overwrites them.

Look (9 Nov 2026): the status pill on each card carries the state; a card that needs attention or is down tints its whole border instead of a coloured side stripe. The disk card names the drive (the full folder path is in its tooltip), the Server PC card shows the CPU and memory load (Attention and Down by the CPU and Memory alert lines of the Hardware page, 85 % and 95 % unless changed there), the PC and app uptime with the app memory, and a link to the Hardware page for the graphs, so the Tablets list was the only panel under the cards until the Incidents panel joined it (11 Nov 2026), and an offline tablet shows an Offline pill with how long ago under it. The 30-second refresh redraws only the cards whose text changed.

Look (12 Nov 2026, picked by the user from mock-ups): the summary is one big status line ("1 check needs attention", "All checks healthy") with the counts, tinted by the worst state. Checks that are not healthy come first under "Needs a look", the rest under "Healthy". Each card ends with a strip of its last 24 hours, one block per half hour showing the worst background result in it (GET /api/admin/health/history, from health_check_results; Ollama is not checked in the background, so its card says so). Log lines quoted in incidents lose the emoji of old console messages.

Incidents (11 Nov 2026, moved 13 Nov 2026): the incidents the anomaly detection opens have their own page (Incidents, under SYSTEM in the sidebar, with the count of incidents that need a look); System Health keeps a short summary right under its status line: the counts, the three most urgent incidents and Open Incidents, a row opening that incident on the Incidents page. It sits there because the status line counts only the health checks, so an "All checks healthy" line can never hide a critical incident. The Customise option Incidents summary hides it for that admin without stopping the detection. The detectors, the page and the API are in docs/features/aiops.md. The detection also runs the health checks in the background every 5 minutes (every check except email and Ollama, the mail login every 30 minutes) and keeps the results in health_check_results, so Customise changes only what this page requests; a check hidden here still runs in the background.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/health` | backend/features/health/routes.js |
| GET | `/api/admin/health/history` | backend/features/health/routes.js |
| GET | `/api/admin/health/layout` | backend/features/health/routes.js |
| PUT | `/api/admin/health/layout` | backend/features/health/routes.js |
| GET | `/api/admin/health/settings` | backend/features/health/routes.js |
| PUT | `/api/admin/health/settings` | backend/features/health/routes.js |
| PUT | `/api/admin/health/tablets/:deviceId/name` | backend/features/health/routes.js |
| POST | `/api/health/heartbeat` | backend/features/health/publicRoutes.js (new devices are limited, backend/features/health/heartbeatLimit.js: 5 an hour from one address, 200 in the table; a known device is never limited) |
| GET | `/api/network-interfaces` | backend/kioskServer.js |
| GET | `/api/server-info` | backend/kioskServer.js |
| GET | `/api/status` | backend/kioskServer.js |
| GET | `/api/test-db` | backend/kioskServer.js |

**Task-sheet items for this feature**

- Monitor system and application health (LLM/AI training and anomaly detection) (Admin Screen point 3): the health monitoring is this page; the anomaly detection half is built (the Incidents panel, November 2026, see docs/features/aiops.md); the LLM advisor comes in the next PR. The supervisor had nothing specific in mind for "LLM training", so the team defined it as statistical anomaly detection plus a local LLM advisor, both switchable off.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- None open.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31; Incidents panel and the Anomaly detection option added 2026-11-11; replaced by the incidents summary (the full list moved to the Incidents page) 2026-11-13. Update this page when you change the feature.

## Offline after and the alert lines (15 Nov 2026)
- Tablets: "Offline after" on the right of the Tablets header sets how long a tablet may stay quiet before the list calls
  it offline (`tabletOfflineMinutes`, 3 minutes by default, 2 to 30; the tablets report once a minute). A System Admin
  changes it (`PUT /api/admin/health/settings`, Audit Logs `HEALTH_SETTINGS_UPDATE`); for others it is greyed. Stored in
  `backend/data/health-settings.json` (backend/features/health/settings.js). The Tablets card's line follows it
  ("Online means a report in the last N minutes"). Incidents keep their own minutes (Incidents, Settings, Named tablets
  offline), so the list and an incident can disagree.
- The Server PC and Disk cards follow the alert lines set on the Hardware page (see hardware.md, Alert lines per part).
