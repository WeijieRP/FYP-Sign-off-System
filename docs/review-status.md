# Review status (October 2026 code review)

Every problem the 30–31 Oct 2026 review found, grouped by the role that owns the code, with whether it is fixed.
Line numbers marked "old" refer to the one-file layout before the restructure (adminRoutes.js, admin.js, feedback.js);
the others refer to the current files. When you fix something, change its status to `fixed` and add the commit.

Commits so far: `a03bbeb` CI-flagged fixes, `02240df` dotenv, `4609ec9` admin batch 1, `e71ff16` admin batch 2,
`0d57c1c` core batch 3, `7f9d9cc` + `f7bfc32` 2 Nov fixes, PR #4 health page and its review fixes (3 Nov). The feature pages in `docs/features/` carry the same open items per feature.

## Role 3, Jun Kai (admin page, admin routes, archive and export, email, analysis, server control, themes, core)

| Status | Area | Problem | Where | Fixed in |
|---|---|---|---|---|
| fixed | admin routes | DELETE /feedback/:id deleted the visitor's `users` row, so every feedback of that visitor went with it | routes.js (old 1699) | 4609ec9 |
| fixed | admin routes | feedback delete trusted an `x-username` header the page never sent | old 1619 | 4609ec9 |
| fixed | parameters | GET /parameters returned 3 of 14 groups, so Save Parameters blanked the other 11; the shipped defaults file carried the damage (25 values restored) | old 6485 | 4609ec9 |
| fixed | archive | /download-file/:filename had no auth and allowed path traversal | old 2886 | 4609ec9 |
| fixed | server control | probeKioskHttp called back twice (timeout then error), which could crash server.js | old 7894 | 4609ec9 |
| fixed | email | PUT /email-config saved before validating; a rejected config stayed saved | old 7255 | 4609ec9 |
| fixed | email | POST /email-config/test reported success on failure | old 7272 | 4609ec9 |
| fixed | server control | /server/mode `updated_by` was always "unknown" | old 8601 | 4609ec9 |
| fixed | tree admin | custom leaf and VIP leaf were saved under one fixed name, so Revert did nothing | old 850, 8094 | 4609ec9 |
| fixed | parameters | leaf, background and VIP-leaf uploads had no multer error handler | old 6534, 6575, 8119 | 4609ec9 |
| fixed | archive | duplicate POST /data-export/unlock (the admin router copy answered first) | old 4082 | 4609ec9 |
| fixed | audit | logAudit whitelist dropped most actions (every config change); text ids went into the INT `target_id` column | old 554 | 4609ec9 |
| fixed | admin page | the 401 interceptor logged you out when you mistyped a password in the decrypt, export or delete prompts | core.js | e71ff16 |
| fixed | admin page | background polls reset the inactivity timer, so the 30-minute auto-logout could never fire | core.js, kioskReload.js | e71ff16 |
| fixed | admin page | moving the mouse closed the session warning modal before you could click Stay | core.js | e71ff16 |
| fixed | admin page | the logout audit request was cancelled by the page reload | core.js | e71ff16 |
| fixed | admin page | archive decrypt buttons were toggled by ids that do not exist | core.js | e71ff16 |
| fixed | admin page | kioskReload reloaded the whole page 3 s after every login and on every kiosk state change | kioskReload.js | e71ff16 |
| fixed | admin page | showPage crashed when called from the dashboard quick-action buttons | navigation.js | e71ff16 |
| fixed | admin page | opening Feedback Data started the (hidden) report's AI analysis | navigation.js | e71ff16 |
| fixed | admin page | QR page loader was keyed on 'Land-page-QR' instead of 'Feedback-page-QR' | navigation.js | e71ff16 |
| fixed | admin page | Lost & Found and Parameter Adjustment were shown to non-admins, who got "Access denied" | core.js | e71ff16 |
| fixed | admin page | Q&A View called GET /feedback/:id/questions, which never existed; yes/no answers rendered "No" | pledgeViewer.js | e71ff16 |
| fixed | admin page | pledge View broke on any pledge with an apostrophe | feedback.js, archive.js | e71ff16 |
| fixed | admin page | column sort was discarded by every filter change while the arrow stayed | feedback.js, archive.js | e71ff16 |
| fixed | admin page | a dashboard stat of 0 leaked a never-ending 16 ms interval | dashboard.js | e71ff16 |
| fixed | analysis | sentiment timeline bucketed by UTC day, not the Singapore day | analysis.js | e71ff16 |
| fixed | audit | audit-log date presets used the UTC date ("Today" was yesterday before 8 am) | lostFound.js | e71ff16 |
| fixed | archive | archive photo popups always said "Feedback not found"; downloads were always .jpg | photos.js | e71ff16 |
| fixed | archive | data export forced the password on every visit although the unlock lasts 30 min | dataExport.js | e71ff16 |
| fixed | archive | feedback delete verified the password by calling /login (fake LOGIN audit rows); now POST /verify-password | feedbackDeletion.js | e71ff16 |
| fixed | archive | deleting from the archive page refreshed the feedback table instead | feedbackDeletion.js | e71ff16 |
| fixed | users | the self-edit form passed an argument the handler no longer accepted | users.js | e71ff16 |
| fixed | server control | server mode loaded only before login; status pollers ran while logged out | serverControl.js | e71ff16 |
| fixed | server control | Stop and End Day never said the PC hibernates | serverControl.js | e71ff16 |
| fixed | server control | Windows Start reported failure after 1.5 s although the kiosk was starting | routes.js (old 8312) | e71ff16 |
| fixed | archive | data-export audit-log threw inside the DB callback and exited server.js | exportRoutes.js 304 | e71ff16 |
| fixed | archive | photo ZIP export had no archiver error listener and resolved before the stream ended | exportRoutes.js 889 | e71ff16 |
| fixed | core | MySQL session time zone was never pinned: on the SGT wall PC every CONVERT_TZ window was 8 h off, so "today" rolled over at 4 pm | core/db.js | 0d57c1c |
| fixed | core | db.js "transactions" ran START TRANSACTION and COMMIT on random pooled connections | core/db.js | 0d57c1c |
| fixed | core | boot exited on the first cold-start MySQL timeout | core/db.js | 0d57c1c |
| fixed | core | no listen error handler, so a port clash took both servers down | server.js, kioskServer.js | 0d57c1c |
| fixed | core | kiosk server bound [::1] only on Windows | kioskServer.js | 0d57c1c |
| fixed | admin routes | users_today used CURDATE() (UTC day) | routes.js | 0d57c1c |
| fixed | admin routes | dead /archive/stats and /bulk-decrypt-archive used an undefined pool, bcrypt and decryptEmail | routes.js | a03bbeb |
| fixed | admin page | showError undefined; 5 duplicate functions; dead kiosk-status poller | admin.js (old) | a03bbeb |
| fixed | core | backend/.env was never loaded by startAll.js | server.js, kioskServer.js | 02240df |
| open | themes | Save Theme always fails: it reads hex-* inputs that no longer exist; card swatches always grey | themes.js | |
| open | users | soft-deleted admins can still log in | core/auth.js 258 | |
| open | audit | several routes write the audit row before the auth or password check; EDIT_USER names the target as the actor | old 3545, 3647, 4182, 4368, 4516, 4738, 5090, 3850 | |
| open | archive | archive hard-delete unlinks the photos before the SQL DELETE and has no transaction | old 3053, 3203 | |
| open | archive | /archive/delete-selected and the export downloads answer 401 on a wrong password (should be 403) | routes.js, exportRoutes.js | |
| open | analysis | engine failures are cached as "neutral" forever; Ollama failures show nothing in the admin page | old 2426 | |
| open | analysis | cacheStore never persists hit statistics and rewrites the whole JSON cache every run | analysis/cacheStore.js 404 | |
| open | analysis | /feedback-sentiment-analysis downloads a 164 MB model and has no auth | routes.js | |
| open | admin routes | three queries use a `feedback.rating` column that does not exist | old 1399, 4252, 4345 | |
| open | archive | auto-archive never runs when the PC hibernates every night | old 6466 | |
| open | archive | temporary retention is dead end-to-end; the clean-up re-processes the same legacy rows from both servers | archive/retention.js 149 | |
| open | archive | CSV export turns 0 into a blank, has no formula neutralisation and prints raw Date strings | exportRoutes.js 974 | |
| open | email | initEmailService always reports success | email/service.js 1085 | |
| open | email | transport reloads only in the server.js process; the kiosk server keeps stale credentials; custom provider insists on user and password | email/service.js | |
| open | email | the visitor name is inserted raw into the thank-you HTML | email/service.js 1281 | |
| open | parameters | settings files are written non-atomically; a corrupt parametersConfig.json is silently replaced by the defaults | parameters/store.js 248 | |
| fixed | server control | schedules were CRUD only; nothing executed them on Windows. Now: scheduler + Windows wake timer (feature A) | backend/features/serverControl/ | hibernation feature, 31 Oct |
| fixed | server control | the page rejected overnight schedules (stop before start now means the next day) | serverControl.js | hibernation feature, 31 Oct |
| fixed | parameters | the email-pattern setting is hidden from the Parameter Adjustment form (task-sheet item) | admin.html | hibernation feature, 31 Oct |
| fixed | parameters | Save still sent the hidden email pattern as the default, overwriting a pattern changed in the JSON file | parameters.js | f7bfc32 |
| fixed | admin page | the hibernation commit left a literal "$1" where the <title> tag was (text at the top of the page, no tab title) | admin.html 116 | 7f9d9cc |
| open | server control | restart-app.bat and startup-monitor.bat can double-launch the servers | project root | |
| open | core | only 39 of about 108 admin routes use auth.requireAuth; the router is mounted with no guard | server.js 409 | |
| open | core | static files are served before the page gates, so /tree/tree.html bypasses the 2D/3D and mobile gates | server.js 409 | |
| fixed | core | getSelectedIP fell back to the first adapter (VMware) unless one was named "Wi-Fi 2"; virtual adapters are now skipped | server.js 227 | hibernation feature, 31 Oct |
| open | core | kioskServer.js drifted from server.js (no page gates, different static handling) | kioskServer.js | |
| open | scripts | Simulation_Generator stores bare filenames and needs pngjs, which is not installed; Purge_Actuator leaves photos and tables behind | scripts/setup | |
| open | archive | the export unlock now goes through auth.loginUser, which bumps last_login on every unlock (minor) | exportRoutes.js 128 | |
| fixed | setup | a fresh install ran migrate.js baseline after schema.sql, so the first migration (device_heartbeats) was recorded but never applied | scripts/setup/Datastore_Assembly.js 187 | PR #4 |
| fixed | health | the Ollama probe could hang GET /api/admin/health when the connection dropped after the headers | health/checks.js 68 | PR #4 |
| fixed | health | npm run smoke (--no-submit) left a fake smoke-tablet-01 row in the real database | tests/smoke.js 131 | PR #4 |
| fixed | health | a failed health poll kept the previous green pill and "Checked at" time on screen | health.js 120 | PR #4 |
| fixed | admin page | showNotification rendered server messages as raw HTML (a duplicate schedule name echoed the typed name) | serverControl.js 740 | PR #4 |
| fixed | analysis | the qwen, gemma and localgpt engines hard-coded localhost:11434 while the health card reads OLLAMA_URL | routes.js 1881, 1909, 1940 | PR #4 |
| open | health | POST /api/health/heartbeat has no login or rate limit, so anyone on the LAN can add endless device rows (one per made-up id) | health/publicRoutes.js 31 | |

## Role 1, Zihan (feedback screen, feedback routes, questions, overlays, form UI, pledgeboard)

| Status | Area | Problem | Where | Fixed in |
|---|---|---|---|---|
| fixed | kiosk page | QR fetch hit /api/kiosk/generate-qr, which does not exist | old feedback.js 1975 | a03bbeb |
| fixed | kiosk page | MediaPipe loaded `@latest` and model `latest` | old feedback.js 219 | a03bbeb |
| fixed | kiosk page | loadImageElement defined twice | old 1236, 4208 | a03bbeb |
| fixed | parameters | shipped config had blank messages, `allowedPhotoFormats: []` (every upload rejected), zeroed min lengths | backend/config/defaults | 4609ec9 |
| fixed | questions | the Add Question "Active" checkbox id collided with the schedule modal's checkbox | questions.js | e71ff16 |
| fixed | questions | unticking Active made a question vanish for good; the admin list now shows inactive ones | questions.js, routes.js | e71ff16 |
| fixed | feedback routes | daily submission limit day boundary shifted by the session time zone (fixed by the UTC pin, re-check) | feedback/routes.js 1190 | 0d57c1c |
| open | kiosk page | hidden rating inputs survive form.reset(), so the next visitor can submit the previous rating | old 2284 | |
| open | kiosk page | no auto-reset after a successful submit; the idle warning hangs over the thank-you page | old 4662 | |
| open | kiosk page | upload page keeps the previous visitor's photo preview and an enabled Continue | old 3108 | |
| open | kiosk page | theme reset leaves a stale overlay preview | old 2268 | |
| open | kiosk page | the keepsake shows the raw unframed capture | old 3880, 5146 | |
| open | kiosk page | config.js has no fallback for an empty allowedPhotoFormats list | old 3043 | |
| open | kiosk page | empty feedbackMessages blank the page text; setText has no fallback | old 6028 | |
| open | kiosk page | photoRequired is never enforced (Skip Photo always offered, server accepts photoSkipped) | old 2968 | |
| open | kiosk page | landing page depends on an async /form-ui fetch: blank kiosk when it fails | old 1018 | |
| open | kiosk page | camera has no in-flight guard; Back during getUserMedia leaves the camera on | old 3648 | |
| open | kiosk page | capture countdown is never cancelled on navigation | old 3740 | |
| open | kiosk page | Android tablets are treated as "mobile": in-page camera and filters unreachable, upload opens the rear camera | old 2066 | |
| open | kiosk page | "View Pledgeboards" on tablets redirects back to /feedback | server.js 150 | |
| open | kiosk page | the thank-you page always says the photo was emailed | feedback.html 1079 | |
| open | kiosk page | overlay load failure silently produces an unframed keepsake; schema.sql 289 seeds a wrong Tech mobile overlay path | old 4502 | |
| open | kiosk page | face-api and MediaPipe load from the internet; offline, every capture fails | old 1170, 3655 | |
| open | kiosk page | upload size checked on the JPEG but the server checks the PNG | old 3331 | |
| open | kiosk page | one failed questions fetch disables the feedback step until reload | old 2557 | |
| open | kiosk page | form-ui background overrides the parameters background on every return to landing | old 5846 | |
| open | kiosk page | idle warning and timeout toast appear on the landing page | old 2165 | |
| open | kiosk page | confirmStyle error on a hidden page; "N questions answered" counts blanks | old 4590, 4629 | |
| open | kiosk page | no touch-reachable language switcher | feedback.html 147 | |
| open | kiosk page | with pledge disabled, Back from the photo choice reaches the disabled pledge page | old 5783 | |
| open | kiosk page | Lost and Found openers are inside HTML comments | feedback.html 155, 944 | |
| open | kiosk page | overlaySettings and photoSettings.supportedFormats are saved by the admin but read by nothing | parameters.js | |
| open | feedback routes | submit-feedback answers "success" before anything is saved; DB failures only logged | old 718 | |
| open | feedback routes | the "Photo Thank You Email" toggle cannot stop the email; photo attached unconditionally | old 706, 743 | |
| open | feedback routes | device and theme go unsanitised into filenames (path traversal); non-string userName is a 500 | old 474, 556 | |
| open | feedback routes | school-impact report uses the PULSE_CAMPAIGN_GOAL env while pulse uses campaignSettings.pulseGoal | old 409 | |
| open | feedback routes | GET /api/feedback/test-db never answers; /languages/languages.json serves a missing file | old 1510, 1594 | |
| open | feedback routes | POST /send-email with an empty photoFilename marks every feedback row email_sent=1 | old 1386 | |
| open | feedback routes | visitors are told the email is on its way before the transporter is known to work; failures leave no trace | old 706 | |
| open | feedback routes | retention hard-coded to long-term on both ends; temporaryRetentionDays never applies | old 634 | |
| open | feedback routes | required questions are enforced client-side only | validationRules.js | |
| open | feedback routes | unmatched data URLs decoded as garbage and saved as .png; allowedPhotoFormats never enforced server-side | old 282 | |
| open | overlays | the required Display Order field is discarded on save | overlays.js 723 | |
| open | overlays | Preview onclick breaks on names with an apostrophe | overlays.js 131 | |
| open | overlays | POST /overlays overwrites the live files when the theme id already exists | old routes 759, 4657 | |
| open | pledgeboard | phones are always bounced off /pledgeboard: req.session.mobileAccessGranted is set by nothing | server.js 140 | |
| open | pledgeboard | unlimited likes: the identity is a browser-made string sent in the body | Pledgeboard.js 65, routes 161 | |
| open | pledgeboard | the public /pledges API returns every visitor's survey answers and photo ids | pledgeboard/routes.js 62 | |
| open | pledgeboard | one request per pledge on every search keystroke | Pledgeboard.js 386 | |
| open | pledgeboard | moderation and topic routes have no auth | pledgeboard/routes.js 378, 423 | |

## Role 2, Wei Jie (tree, 3D tree, pulse)

| Status | Area | Problem | Where | Fixed in |
|---|---|---|---|---|
| fixed | tree admin | the tree tab could flip 3D back to 2D (display mode read from the title box) | admin/js/tree.js | e71ff16 |
| fixed | tree admin | leaf thresholds were saved but never loaded back into the form | admin/js/tree.js | e71ff16 |
| fixed | tree admin | Auto/Manual stage toggle was only wired after a page reload, never after a fresh login | admin/js/tree.js, navigation.js | e71ff16 |
| fixed | tree routes | year computed three different ways (SQL YEAR, JS getFullYear, CONVERT_TZ) | tree/routes.js 114, 177 | 0d57c1c |
| closed | 3D tree | the 3D page never draws a leaf: the tree-image line is commented out | 3dTree.js 112, 865 | old 3D page replaced by the Ketapang River scene |
| closed | 3D tree | title box and VIP settings ignored; VIP folder `vip_leaf` should be `vip-leaf` | 3dTree.js 315, 1133 | old 3D page replaced by the Ketapang River scene |
| closed | 3D tree | model-viewer only from a Google CDN, no fallback | 3dTree.html 7 | old 3D page replaced by the Ketapang River scene |
| open | tree | live tree polls every 5 s regardless of leafRefreshInterval, 4 requests and a full rebuild each time | tree.js 2042 | |
| open | tree admin | auto growth stage is computed once at save time; nothing re-evaluates it as leaves arrive | admin/js/tree.js, routes.js | |
| open | tree admin | empty number boxes save 0 and the wall uses hidden defaults | parameters.js, tree.js 411 | |
| open | tree admin | "Last Visit" column is always N/A | admin/js/tree.js 607 | |
| open | tree routes | the tree keeps archived rows that pulse and pledgeboard hide | tree/routes.js 112 | |
| open | parameters | default treeBackground path is wrong (black wall on a fresh install) | parameters/store.js 185 | |
| open | tree admin | param-tintDurationHours input is missing, so the badge tint duration is always 0 | admin.html | |
| open | pulse | "Digital Leaves" is the length of a LIMIT 80 query | pulse/routes.js 226 | |
| open | pulse | shows pledges that moderation rejected | pulse/routes.js 193 | |
| open | pulse | badge earners print names regardless of consent | pulse/routes.js 203 | |

## Role 4, Ryan (Bluetooth assets, alerts, canvas)

| Status | Area | Problem | Where | Fixed in |
|---|---|---|---|---|
| open | assets | bluetooth.js is unreachable from any route, its threshold is unattainable, and its timer runs in both servers | assets/bluetooth.js 18, 21, 89 | |
| open | assets | the README's test endpoints (/api/bluetooth/test-device, /nearby-devices) do not exist | README | |

## Shared (users, audit, VIP, lost and found)

| Status | Area | Problem | Where | Fixed in |
|---|---|---|---|---|
| fixed | VIP | Remove button broke for names with an apostrophe | admin/js/vips.js | e71ff16 |
| open | lost and found | the staff alert email's "View attached item photo" is a relative link and nothing is attached | feedback/routes.js (old 1535) | |

## Standing reminders

- Keep local copies of the CDN libraries (Chart.js, model-viewer, font-awesome, face-api, MediaPipe) before the centre runs without internet.
- Tablet HTTPS certificate, the wall-PC runbook and seed data are planned, not bugs.
