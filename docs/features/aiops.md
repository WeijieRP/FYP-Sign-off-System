# Anomaly detection and incidents (AIOps)

**Owner:** Role 3, Jun Kai

**Where the code is**

- backend/features/aiops/detectors.js (the seven detectors; pure functions, no clock, database or network), incidents.js (the incident engine with its memory store and its SQL store), settings.js (backend/data/aiops-settings.json, seeded from backend/config/defaults/aiops-settings.json), healthRecorder.js (the background health runs), logReader.js (follows the event log files), engine.js (the wiring in server.js: the tick timer, the detectors' input, quiet hours, the status), routes.js (the API below, mounted at /api/admin/aiops by backend/server.js)
- backend/core/log.js captureEvents(): server.js and kioskServer.js call it right after setupLogging(), so every console.warn and console.error also lands in logs/app-events-server.jsonl or logs/app-events-kiosk.jsonl
- backend/features/aiops/fixes.js (the fix an admin approves: starting the kiosk server; modes and status), playbooks.js (the step-by-step help, written once), processes.js (the busiest programmes for the CPU and memory steps), testIncidents.js (the made-up incident of each kind for Send test incident)
- frontend/admin/js/incidents.js and the Incidents page in admin.html (its own sidebar item under SYSTEM, with the count of incidents that need a look), plus a short summary under System Health's status line and a notice on the Hardware page (styles in the UI kit block of admin.css); the summary's Customise switch is the `incidents` option of backend/features/health/layout.js
- tables incidents, incident_events and health_check_results (database/migrations/007_aiops_incidents.sql); scripts/setup/Purge_Actuator.js and Datastore_Assembly.js clear them with the other Role 3 tables
- scripts/aiops-replay.js (`npm run aiops:replay`, the evaluation) and tests/unit/aiopsDetectors.test.js, aiopsIncidents.test.js, aiopsSettings.test.js, aiopsHealthRecorder.test.js, aiopsLogReader.test.js, aiopsInput.test.js, aiopsEngine.test.js, aiopsReplay.test.js, aiopsAdvisor.test.js, aiopsLearning.test.js, aiopsFixes.test.js, aiopsPlaybooks.test.js, aiopsTestIncidents.test.js (run with `npm run test:unit`, also in CI; none needs a database)

**What it does**

Statistics on the PC's own data, no model, and nothing is sent off this PC. Every minute by default (intervalSeconds, 30 s to 10 min; the first check 90 seconds after the server starts) server.js runs seven detectors over what the system already records and turns what they find into incidents on the System Health page. The data: the hardware_samples rows the Hardware page's sampler takes (CPU, memory, GPU and disk, one row per sampling interval); the health checks, which a background recorder now runs every 5 minutes (healthEverySeconds, 1 to 60 minutes; the first run 20 seconds after boot) for every check except email and Ollama, with the mail login every 30 minutes, keeping the last 24 hours of runs in memory and writing one row per check per run to health_check_results (a mail account that is not set up is stored as `unknown`, not `down`; rows older than retentionDays go once an hour); the warnings and errors of both server processes, which core/log.js now appends as one JSON line each (time, process, level, the first 400 characters of the message) to logs/app-events-server.jsonl and logs/app-events-kiosk.jsonl, each file rotated at 5 MB with one older file kept, and lines that start with "[aiops]" skipped so the detection never feeds on its own warnings (the reader takes the last 2 MB of each file at start, then only the new lines, and keeps 7 days); the heartbeats of the tablets an admin has named in the Tablets panel (device_heartbeats plus backend/data/tablet-names.json; a phone that opened the page once is not watched); and the hibernation policies with the automation mode, for quiet hours. Customise on the health page changes only what the page requests: a check hidden from the page is still run by the recorder in the background.

The seven detectors, each with its own switch and a sensitivity from 1 (very low) to 5 (very high), default 3:

- Sudden spikes (`spike`): per metric for CPU, memory and GPU, the mean of the last window of raw samples (at least 5 minutes, or three sampler intervals when the Hardware page samples less often) against the median and MAD (median absolute deviation) of the 24 hours before it; it fires when the robust z-score (the mean minus the median, divided by the MAD; a MAD of 0 counts as 1) reaches K, the mean is over the floor (CPU 60 %, memory 80 %, GPU 60 %, so a quiet PC going from 3 % to 9 % is never an incident) and at least 60 % of the window's samples (3 or more) are over that line themselves; critical at twice K or at 95 %, otherwise warn.
- Unusual for the time of day (`timeOfDay`): the last 15 minutes (or three sampler intervals) against the earlier days' samples of the same hour in Singapore time, up to 14 days back, with the same floor, K and 60 % rule; once the samples span 14 days and three days of the same weekday are in, the baseline is that weekday only, so a Saturday is compared with Saturdays.
- Slow creep (`drift`): a CUSUM over evenly spaced averages (10-minute means of memory over 24 hours, hourly disk % over 7 days): with the mean and the spread of the first third of the series as the reference (spread at least 1), the running sum S = max(0, S + value - mean - 0.5 spread) must pass H spreads while the least-squares slope of that run is upward and the level is over the floor (memory 80 %, disk 70 %); always warn, and the explanation carries the % per hour and for how many hours it has been climbing.
- Disk filling up (`disk`): the straight-line fit of 30 days of hourly used GB (forecast.diskForecast, the same fit as the Hardware page) gives GB per day and days until full; warn when that is D days or less, and regardless of history warn at 90 % full and critical at 95 %.
- Services down or slow (`services`): a service is down when its last two health runs say so, so one failed run is never an incident and a failed service is reported 5 to 10 minutes after it fails at the default interval (database critical, kiosk server critical, mail login warn); the database is also slow when its latest check took 500 ms or more and K spreads above the median of the last 24 hours of checks (more than 6 of them), warn.
- Named tablets offline (`tablets`): a named tablet with no heartbeat for more than M minutes is offline, one warning per tablet; when there are two or more named tablets and every one of them is silent, that is one critical incident instead.
- Server errors (`logs`): a burst is B or more error lines in the last 5 minutes that are also at least three times the median 5-minute count of the last 24 hours (warn; critical at three times B); a new error shape is a message template, with quoted text, file paths, ids, dates and numbers masked (`"..."`, `<path>`, `<id>`, `#`, so "Cannot open 'C:\x\y.txt' (code 42)" and "Cannot open 'D:\z.txt' (code 7)" are the same shape), first seen in the last 10 minutes and never in the 7 days before (info; a new warning shape counts too).

| Sensitivity | 1 (very low) | 2 (low) | 3 (normal) | 4 (high) | 5 (very high) |
|---|---|---|---|---|---|
| K, spreads above normal (spikes, time of day, slow database) | 6 | 4.5 | 3.5 | 2.8 | 2.2 |
| H, CUSUM limit in spreads (slow creep) | 8 | 6.5 | 5 | 4 | 3 |
| D, days until the disk is full | 3 | 7 | 14 | 21 | 30 |
| M, minutes without a heartbeat (tablets) | 30 | 20 | 10 | 5 | 3 |
| B, errors in 5 minutes (bursts) | 15 | 10 | 6 | 4 | 3 |

Sensitivity changes nothing else: the two-run rule for a service, the 90 % and 95 % disk rules and the new-shape rule are fixed. Before a detector has enough data it says Learning on the panel and stays silent: spikes need 2 hours of samples (and at least 6 of them), time of day needs 3 earlier days with samples for the current hour, slow creep needs 12 averages (2 hours for memory, 12 hours for disk), the disk forecast needs a day of samples (the 90 % and 95 % rules work at once), services need 2 health runs (about 5 minutes after the server starts) and new error shapes need 24 hours of log history. A detector with nothing to look at (no named tablet, no log file yet) says No data; a detector that throws is shown as Error with its message and never stops the others.

Every anomaly carries a fingerprint (detector, kind and subject, for example `spike:high:cpu` or `tablets:offline:<device id>`) and incidents are kept by it. A check keeps one anomaly per fingerprint (the highest severity wins). An anomaly whose fingerprint already has an open or acknowledged incident merges into it: last seen and the occurrence count move on, a "seen" entry goes on the timeline at most every 10 minutes in the first hour and once an hour after that, and a higher severity raises the incident (a "severity" entry). Otherwise, if the same fingerprint was resolved less than cooldownMinutes ago (default 30; 0 switches reopening off), that incident reopens (acknowledgement and resolution cleared, the verdict kept); else a new one opens. An open or acknowledged incident whose fingerprint has not been seen for clearAfterMinutes (default 10) resolves itself (resolved by `auto`); a test incident resolves 10 minutes after it was opened. Every change is a row in incident_events (opened, seen, severity, reopened, acknowledged, resolved, verdict), shown as the timeline. An incident keeps its title, a plain-English explanation with the numbers in it, and the evidence (value, usual level, spread, z, window, and up to 60 points for the sparkline). Resolved incidents are kept for keepIncidentsDays (default 90) with their events, then deleted.

Admins can Acknowledge an open incident (it stays on the panel, after the open ones), Resolve an open or acknowledged one with an optional note (up to 500 characters), and give any incident a verdict: Correct, Not useful or False alarm. The verdict is stored now (which verdict, by whom, when) and shown as a pill; the next PR uses the verdicts to tune the sensitivities. Each action is audited (AIOPS_INCIDENT_ACKNOWLEDGE, AIOPS_INCIDENT_RESOLVE, AIOPS_INCIDENT_VERDICT, and AIOPS_TEST_INCIDENT for the Test incident button) and written to the timeline.

The master switch (Anomaly detection, on by default) switches the detection off: off, the engine does not check, nothing new opens or resolves itself, the open incidents stay as they are and the panel says Detection off. It does not switch off the advisor (its own switch) or the local AI models (the Local AI models switch, see the section at the end); the background health recorder has no switch of its own, because the health history is useful on its own. Each detector has its own switch as well. Nothing leaves this PC: the detectors read the PC's own samples, health results, log lines and heartbeats, and the incidents live in its own database. Quiet hours (on by default): while the automation is in automatic mode and the hibernation policies say the kiosk should be off, the tablets detector and the kiosk server check are muted (their anomalies are dropped, not stored, and the panel says Muted); the database, the mail login, the hardware, the disk and the log detectors keep running, because the server PC is still on when the kiosk is not. In manual mode the policies are paused, so nothing is muted.

The incidents have their own page since 13 Nov 2026 (Incidents, under SYSTEM in the sidebar, between System Health and Hardware). The sidebar item carries the number of incidents that need a look (amber, red while one of them is critical; the same number as the chip on the page; hidden while the master switch is off, because nothing resolves itself then), refreshed on every page change and every minute. The page lists the incidents by number in three groups, Needs a look (critical first, then the newest), Being handled (acknowledged) and Resolved this week (five, then Show all), beside the chosen incident's story in three numbered steps: 1 What happened (the explanation, a chart with the usual band and the detector's floor, up to four number tiles; a resolved incident says At the time), 2 Why it might be (the advisor's summary and causes), 3 What to do (the fix the app can run, then exact steps with the keys drawn as keys and, for CPU and memory, the busiest programmes on this PC right now; a resolved incident shows What was done). Then Was this right? (the verdict) and History. It refreshes every 30 seconds while it is open, patched in place, so the choice, the focus and an open History survive. System Health keeps a short summary right under its status line (the counts, the three most urgent incidents, Open Incidents), because its status line counts only the health checks; the Customise option Incidents summary hides it for that admin without stopping the engine. The Hardware page shows a notice above its graphs while a CPU, memory, GPU or disk incident is open (View incident opens it), and a quiet line with a link when none is. Example incidents (below) show everywhere, tagged Example.

Settings (the Settings button on the Incidents page opens a drawer from the right; system admins only, others see it read-only; the file is backend/data/aiops-settings.json): the master switch, Learn from your answers, Offer fixes on incidents and each fix's mode, one card per detector with its switch and its five levels with the number behind each (from detectors.levels()) and a sentence for the chosen level, the advisor, quiet hours, the check interval and how long to keep data, an Advanced fold (see Advanced settings below), and Show / Remove example incidents. The limits, like the Hardware settings: intervalSeconds 30 to 600 (default 60), healthEverySeconds 60 to 3600 (300), retentionDays for the health results 1 to 365 (30), keepIncidentsDays 7 to 730 (90), cooldownMinutes 0 to 1440 (30), clearAfterMinutes 1 to 120 (10), fixDelayMinutes 1 to 60 (5), learnStreak 2 to 10 (3), learnMaxSteps 1 to 4 (2), learnWindowDays 7 to 365 (30), sensitivity 1 to 5 (3). PUT /settings refuses a value out of range (400 with the field, for example `detectors.spike.sensitivity`) instead of clamping it, and keeps the keys a body leaves out; read() repairs a hand-edited file (numbers clamped, switches on unless exactly false), so a bad file can never stop the engine. A change takes effect without a restart.

Evaluation: scripts/aiops-replay.js (`npm run aiops:replay`) builds 7 synthetic days of minute samples (busy 10:00 to 18:00, quiet nights, a weekday and weekend difference, noise) and injects faults with known windows: a CPU spike of 25 minutes, a memory leak ramping for 36 hours, a disk filling over 3 days, the database down for 12 minutes, a tablet offline for 40 minutes, an error burst of 8 minutes and a new error template. It runs the engine with the memory store in 1-minute steps and prints, per fault, whether it was detected and after how long, plus the incidents opened outside any fault window. An incident counts for a fault when it opened inside the fault's window and is one the fault can rightly cause (a memory leak is caught as a slow creep first and, hours later, also as memory far above normal and unusual for the hour). Measured on 11 Nov 2026 with seeds 1 to 3: precision 1.00 and recall 1.00; the sudden faults were caught within 1 to 10 minutes, the leak once memory passed 80 % and the filling disk once the forecast came within 14 days. Precision is the share of opened incidents that fall inside a fault window (1.0 means no false alarms), recall is the share of injected faults that got an incident (1.0 means none was missed), and time to detect is the minutes from the start of a fault to its incident. tests/unit/aiopsReplay.test.js runs the same replay with a fixed seed in CI and fails below a precision of 0.8 or a recall of 0.85, so a change that makes a detector noisier or blinder fails the build.

Refinements after the first live test (11 Nov 2026). Privacy: email addresses in a warning or error line are replaced by `<email>` before the line is written to logs/app-events-*.jsonl, and the message templates mask them too, so a visitor's address never reaches the log file or an incident. Settling: after a start or a wake-up from hibernation (a pause of more than 5 minutes between two checks) the spike and time-of-day detectors wait 15 minutes, because the PC is busy with itself. Tablets: they are read from device_heartbeats at every check, and a tablet only counts as offline once it has been quiet for the limit within the time the PC has been awake with the kiosk meant to be on, so a night in hibernation or quiet hours is not an outage; the text still gives the real time since its last report. Worst state on show: a higher reading or a higher severity replaces an incident's title, explanation and evidence (the timeline keeps the first title), and a reopened incident takes the text of the new episode. Nothing is closed blind: incidents that no detector looked at in a check stay as they are instead of being resolved as "back to normal" (tablets and the kiosk check in quiet hours, the hardware detectors while the PC settles, the services until two health runs exist, a detector that failed), and the incidents of a detector that is switched off are closed at once with that reason on the timeline. The Incidents panel lists critical incidents first, keeps the rows in a fixed order between refreshes and folds a long timeline to its first and last entries.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/aiops/status` | backend/features/aiops/routes.js |
| GET | `/api/admin/aiops/incidents` | backend/features/aiops/routes.js |
| GET | `/api/admin/aiops/incidents/:id` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/incidents/:id/acknowledge` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/incidents/:id/resolve` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/incidents/:id/verdict` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/incidents/:id/fix` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/incidents/:id/advice` | backend/features/aiops/routes.js |
| GET | `/api/admin/aiops/processes` | backend/features/aiops/routes.js |
| GET | `/api/admin/aiops/advisor` | backend/features/aiops/routes.js |
| GET | `/api/admin/aiops/settings` | backend/features/aiops/routes.js |
| PUT | `/api/admin/aiops/settings` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/run-now` | backend/features/aiops/routes.js |
| POST | `/api/admin/aiops/test-incident` | backend/features/aiops/routes.js |

All of them need a login; PUT /settings, POST /run-now and POST /incidents/:id/fix need a system admin. GET /status answers the engine state (enabled, last and next check, each detector's switch, sensitivity, state and note, how much data it has, the open, acknowledged and resolved-today counts, quiet now); GET /incidents takes `?status=open|resolved|all&limit=50` (open first, newest first, at most 500); GET /incidents/:id adds the timeline; POST /resolve takes `{ note }` and POST /verdict `{ verdict: 'correct' | 'not-useful' | 'false-alarm' }`; POST /run-now runs one check now and answers how many anomalies, opened, merged and resolved. A wrong id is 404, and the tables missing before `npm run db:migrate` are 503.

**Task-sheet items for this feature**

- Monitor system and application health (LLM/AI training and anomaly detection) (Admin Screen point 3): the health monitoring is docs/features/health.md; the anomaly detection half is this page. The LLM advisor (a local model that explains an incident and suggests what to do), the fixes an admin approves and the learning from verdicts are in the sections at the end, each behind its own switch.

**Known issues**

- Unusual for the time of day needs 3 days of samples before it says anything, and 14 days before it tells weekdays from weekends; until then a busy Saturday morning is compared with the weekdays.
- New error shapes need 24 hours of log history (the event files start with this version), so on the first day every message counts as known; bursts work from the start.
- Ollama is not watched yet (the recorder skips it); it comes with the advisor in the next PR, when its being down matters.
- A laptop with no named tablet watches no tablet at all (No data on the panel): name the tablets in the Tablets panel first.

---
Hand-written on 2026-11-11. Update this page when you change the feature.

## Part 2: the advisor (local AI), 12 Nov 2026
- `backend/features/aiops/advisor.js`. For an open incident it asks the local model (Ollama `/api/chat`, JSON mode,
  default `qwen2.5:3b`, `OLLAMA_URL`) for a short summary, at most three likely causes and ONE next step from a fixed
  list (`ACTIONS`: nothing yet, close heavy programs, restart the kiosk server, check MySQL, free disk space, run an
  archive, check the mail account, check the tablet, read the server log).
- Evidence only: the incident's numbers (the last 12 values of its line, not the whole list), its timeline, and up to
  three earlier incidents of the same detector that an admin marked Correct, with their resolve notes. That is how the
  verdicts teach it ("LLM/AI training" of task-sheet point 3, without fine-tuning on a kiosk PC). No visitor records go
  in, and nothing leaves the PC.
- It never runs anything: the step is a suggestion on the page. The answer is checked (an unknown step becomes "none",
  steps copied into the causes are dropped, texts cut to size). A test incident gets real advice for its kind, but its
  answer never becomes an example for a real incident.
- When Ollama is off, slow (120 s) or answers in the wrong shape, rule-based advice per detector is given instead and
  marked as such.
- When: after every check, an open incident whose newest open, reopen or severity step has no advice after it is
  queued; one incident at a time. "Ask again" in the incident's details: `POST /api/admin/aiops/incidents/:id/advice`
  (at most every 30 s per incident). Each answer is an `advice` event on the timeline; `GET /incidents` carries the
  newest one (`advice`, `adviceBusy`). `GET /api/admin/aiops/advisor`: its state, the step list and Ollama's models.
- Settings: `advisor.enabled` and `advisor.model`, in the Settings panel. Since 17 Nov 2026 Anomaly detection off no longer
  switches the advisor off: the sweep also runs after a skipped check (engine.js), so open incidents still get advice.
- Also: the log reader now works out each line's template once (review of part 1).

## Learning from the verdicts, 12 Nov 2026
- `backend/features/aiops/learning.js`. A detector whose incidents are marked False alarm or Not useful three times in
  a row (verdicts given after its last step, within 30 days) turns itself one step less sensitive; three Correct in a
  row bring it one step back. Never above the level the admin chose, at most two steps below it, never below Very low.
  Those three numbers are settings since 15 Nov 2026 (learnStreak, learnMaxSteps, learnWindowDays; see Advanced
  settings below); `learning.ruleOf` reads them and `learning.clampOffset` caps older steps when the limit is lowered.
- The detectors run with the learned levels (`learning.apply` in engine.js); the saved settings keep the admin's levels.
  The steps are kept in `backend/data/aiops-learning.json`. Saving a new level for a detector in Settings forgets what
  was learned for it. Switch: "Learn from verdicts" (`learnFromVerdicts`, on by default).
- The page shows it: "Tuned to Low by your verdicts: 3 incidents in a row were marked False alarm or Not useful" under
  the detector in Settings, and "1 tuned by your verdicts" in the summary line (`tuned` on each detector in
  `GET /api/admin/aiops/status`, `learned` in `GET /api/admin/aiops/settings`).
- Together with the advisor's use of the Correct incidents as examples, this is the "training" of task-sheet point 3:
  it adapts to the admins' feedback without fine-tuning a model on the kiosk PC.
- Health recorder: switching Anomaly detection off stops the comparisons and new incidents; the background health
  checks keep running, because the 24-hour history strips of System Health are built from them.

## Fixes with an admin's approval, step-by-step help, example incidents and the Incidents page, 13 Nov 2026
- `fixes.js`: one fix, the one that is safe and already exists in the app: start the kiosk server when it is down (the
  same `control.startKiosk` as Start kiosk on Server Schedule). A System Admin approves it on the incident
  (`POST /incidents/:id/fix`, a dialog asks once more), or ahead in Settings per fix: Ask first, Auto after a wait (waits
  for an approval, runs by itself fixDelayMinutes after the incident opened or last reopened; 5 minutes by default),
  Automatic. An approval always runs, like the
  Start kiosk button; KIOSK_AUTOMATION holds only what runs by itself (off: the automatic modes wait for an approval;
  dry-run: recorded only). An automatic start first checks the kiosk is still down, never runs while the policies keep
  the kiosk off, never twice within 10 minutes on one incident, and shares one last-start record with the policies
  (`control.noteStartAttempt`, `START_GAP_MS`), so the two never start the kiosk back to back; Acknowledge pauses it.
  Each run is a `fix` and a `fix-done` event and an Audit Logs line (AIOPS_INCIDENT_FIX, AIOPS_INCIDENT_FIX_AUTO; a mode
  change AIOPS_FIX_MODE_ASK / _DELAYED / _AUTO). `fixStatus` gives the card its state: offer, running, started, failed.
- `playbooks.js`: the steps for each kind of incident, written once (Task Manager with Ctrl + Shift + Esc, Services and
  MySQL84, Disk Cleanup, the Visitor Data Archive page, `logs\app-events-kiosk.jsonl`); `allowedFor` lets each detector
  show only help that fits it, so the advisor picks the help but never writes the steps.
- `processes.js` (`GET /processes?by=cpu|memory`): the busiest programmes, one PowerShell read kept 15 s (ps on Linux);
  Node.js, MySQL and Ollama come back marked keep, Windows' own processes, the antivirus and the reading's own
  PowerShell are never listed. Asked only when an incident is chosen or on Check again, never on the refresh.
- `examples.js` (`POST` and `DELETE /examples`): seven example incidents (fingerprints starting `example:`) that show
  every part of the page; they never tune a detector, never teach the advisor, never resolve themselves and their fix
  is only recorded. Removed on 17 Nov 2026: Send test incident does the same job (see the section of that date).
- `detectors.levels()` gives the drawer the number behind each sensitivity level; `GET /status` counts the open
  critical incidents for the sidebar colour (`counts.critical`).

## Advanced settings, 15 Nov 2026
- The settings drawer has an Advanced fold after Timing and keeping. It is folded on every opening; its title says
  Defaults, or how many of its values differ from the defaults (`incidentsAdvancedTexts`). Use the defaults puts the
  lists back to the defaults; nothing is saved until Save. A 400 on one of its fields opens the fold first.
- Incidents: close after normal for (`clearAfterMinutes`, 5 min to 2 h in the list), open the old incident again if it
  comes back within (`cooldownMinutes`, Never to 24 h). Health checks: run every (`healthEverySeconds`, 1 to 15 min in
  the list; longer gaps would leave holes in the 24-hour strips, which have one block per 30 minutes; a service counts
  as down after 2 failed checks in a row). Fixes: how long "Ask, then automatic" waits (`fixDelayMinutes`, 1 min to
  1 h). Learning: answers in a row for one step, at most this many steps below the admin's level, answers from the
  last N days (`learnStreak`, `learnMaxSteps`, `learnWindowDays`).
- The labels follow the lists on screen: the fix mode reads "Auto after 10 min" when the wait is 10 minutes, and the
  Learn switch's sentence says the chosen numbers. A value saved outside a list (a hand-edited file) shows as
  "(current)".
- The wait of "Ask, then automatic" now counts from the incident's newest reopening (`latestEvents(ids, 'reopened')`
  in the sweep): before, a kiosk that went down again within the reopen window ran its fix at once, because
  `opened_at` stays the first opening.
- A new health check interval applies within 5 seconds (`healthRecorder.applySettings`, called from
  `engine.applySettings`), like the detection interval; before, it waited out the old gap.

## Local AI models switch, 17 Nov 2026
- `localAi` in aiops-settings.json (on by default), shown as Local AI models (Ollama and Xenova) under Local AI advisor in
  the Settings drawer. It covers every local AI model of the app: Ollama (the advisor; the Qwen AI, Gemma AI and
  LocalGPT modes of Feedback Reports) and Xenova (the Xenova AI mode there). `settings.localAiOn()` is the one check the
  other features use.
- Off: the advisor never asks Ollama and gives the rule-based advice, marked `localAiOff` (the page says "Local AI models
  is switched off in Settings"); GET /advisor does not ask Ollama for its models; Feedback Reports disables those four
  modes and the server refuses them with 409 (backend/features/admin/routes.js, before any analysis starts or is
  cached); System Health's Ollama card says Off without contacting Ollama (health/checks.js, status `off`); the Task
  Manager steps stop saying to keep Ollama running (playbooks.helpFor `localAi`) and the busiest programmes list stops
  marking it keep (processes.withoutAiKeep).
- With this switch off, no AI model runs on this PC for the admin pages, whatever the advisor switch says; with the
  advisor off too there is no advice at all. Not covered: two kiosk features keep their own models (Role 1's pledge
  check at submission and face detection on the tablets), and Translate to English calls Google's online translation.
- A change is audited as AIOPS_LOCAL_AI_ON or AIOPS_LOCAL_AI_OFF.

## Test incidents replace the example incidents, 17 Nov 2026
- The seven Example incidents and "Send a test incident" did the same job for different reasons, which was confusing.
  They are one feature now: the Test incident section of the Settings drawer has a list of kinds and a Send test
  incident button (any admin who is signed in): CPU much busier than usual, Kiosk server down, Disk filling up, Tablet offline
  and Server errors (`testIncidents.testKinds()`, sent to the page in `GET /settings` as `testKinds`).
- `POST /test-incident { kind }` (CPU when no kind is given; an unknown kind is a 400 that lists the kinds) opens one
  incident with made up numbers and the real detector of that kind, so the page shows it like a real one: the chart, the advisor's
  answer, the steps, Acknowledge, Resolve and the verdict. Its explanation starts with "Test opened by <admin>: the
  numbers are made up", it is labelled Test on the page, the summary and the Hardware notice, and an Audit Logs line
  (AIOPS_TEST_INCIDENT) records who sent it.
- Its fingerprint starts with `test:` (`fixes.TEST_PREFIX`, `fixes.isTest`). Because of that it closes by itself 10
  minutes after it opened, even while its detector is held or switched off; it never becomes an example for the advisor
  and never tunes a detector (the SQL store filters `fingerprint NOT LIKE 'test:%'`); a fix on it is only recorded
  ("Test incident: nothing was run") and never runs by itself. Unlike the examples it follows Offer fixes on incidents:
  with fixes switched off it shows no fix card, like a real incident.
- The runner deletes the old example incidents once at start (`deleteByFingerprintPrefix('example:')`), and
  `POST` and `DELETE /examples` are gone.
