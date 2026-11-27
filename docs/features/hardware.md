# Hardware usage graphs with forecasting

**Owner:** Role 3, Jun Kai

**Where the code is**

- backend/features/hardware/collect.js (CPU, memory, disk and GPU readings), ranges.js (the graph ranges, presets and custom), sampler.js (takes a sample on the configured interval and prunes old rows), forecast.js (Holt linear trend, straight-line disk fit; pure functions), settings.js (backend/data/hardware-settings.json), live.js (the reading of the part cards every second, never stored), routes.js (the API below)
- frontend/admin/js/hardware.js and the Hardware page in admin.html (sidebar group SYSTEM); the chart styles sit in the UI kit block of admin.css
- table hardware_samples (database/migrations/002_hardware_samples.sql)
- tests/unit/forecast.test.js, tests/unit/ranges.test.js and tests/unit/hardwareLive.test.js (run with `npm run test:unit`, also in CI)

**What it does**

backend/server.js starts the sampler after boot. Every N seconds (default 60, set on the page: 15 s to 10 min; each Sampling setting in the Settings drawer has presets and a Custom choice for any whole number within its limits) it stores CPU % (average since the previous sample), memory, disk use of the project drive and the GPU (nvidia-smi when present, otherwise the Windows performance counters through `typeperf`; "not available" elsewhere). Rows older than the retention setting (default 30 days) are deleted once an hour. The page shows a card per part (CPU, memory, GPU, disk) and one graph for 1 hour to 30 days or a custom range (the last N hours, days, weeks, months or years, up to 5 years, with calendar months and years), averaged per minute up to per 2 weeks so an answer never exceeds about 200 points, a table view of the same values, and a forecast: Holt double exponential smoothing with a damped trend for CPU, memory and GPU over the unbroken run of 10-minute averages in the last 24 hours (or twice the forecast horizon when that is longer; a night in hibernation is not treated as a step). A trend is trusted for about as long as it has been seen (it fades by half over half the run, at least an hour, and a run shorter than 6 hours counts for less) and never moves the value further than the readings moved within the run, so the PC settling after a wake-up no longer forecasts memory at 0 %. Drawn as a dashed line plus a band that widens with the horizon up to twice the usual spread of the readings, and a straight-line fit of the last 30 days for the disk ("full in about N days"). Statistics only, no AI. The graphs and the forecast refresh every minute while the page is open.

Live cards (16 Nov 2026): while the Hardware page is open and its browser tab is visible, the page asks `GET /api/admin/hardware/live` every second and puts the answer on the four part cards, their Normal / High / Critical pills, the "Now" line under each graph and the "now" in the forecast hints. The server (backend/features/hardware/live.js) reads the CPU with its own meter (the busy share of the last second; two pages asking at once share one reading, and after 2 s without a request it measures a fresh quarter second), memory and disk on the spot, and the GPU in the background every 2 s with nvidia-smi or every 5 s with the Windows counters (each GPU read starts a program; until the first answer the last stored sample's GPU is shown). Nothing is stored: the samples, the graphs and the forecast keep the Sampling interval. A GPU read already running is shared with the sampler, so a stored sample never loses its GPU value while the page is open.

Forecast length (11 Nov 2026, supervisor meeting 04; the field, the Forecast card, the reminder and `GET /forecast-check` were replaced on 17 Nov 2026 by the Past / Forecast switch described at the end, and since 18 Nov 2026 the steps stop at 2 days): "Forecast ahead" goes from 1 hour to 1 year (presets 6 hours to 7 days, 1, 3 and 6 months, 1 year; Custom in hours, days, months of 30 days or years of 365 days). Up to 7 days the forecast works on the 10-minute steps described above. Beyond that it works on one average per day (only days with at least an hour of samples, so closed days are left out; it needs 6 such days), looks back twice the forecast length (at least 30 days, at most the keep period), is thinned to at most 200 points and is kept for 10 minutes; this far ahead the damped trend has faded, so CPU, memory and GPU show their usual level and range, not a prediction for one day, and only the disk line really extrapolates. A forecast counts as dependable when the stored samples go back about as far as it looks ahead (`forecast.horizonCheck`, 5 % short still counts). Otherwise it is a rough guide: the Forecast card says so in an amber note with the reason (waiting is enough, or samples are deleted before the history can get that long), and saving such a choice first opens a reminder with "Go back" and "Save anyway". The reminder appears when the forecast length changes or the keep period is shortened, for presets and Custom values alike; `GET /api/admin/hardware/forecast-check?forecastHours=&retentionDays=` answers the question for the values in the form. The Sampler details show the oldest sample. A disk that is not growing is drawn level instead of continuing a clean-up downwards. `PORT` in backend/.env runs the HTTPS server on another port, handy for testing a branch next to a live copy.

Look (9 Nov 2026): the time range is a segmented control with the chosen range raised on a grey track. The graphs break the line where there are no samples for more than three periods (the PC hibernating overnight) instead of drawing straight across the gap, the time axis follows the span actually drawn (with dates once it passes a day), and a range longer than the samples are kept starts at the oldest sample, with the note under the toolbar saying so. The Forecast card explains itself in one plain line; the method sits in a small line under the numbers.

Look (12 Nov 2026, picked by the user from mock-ups): the four part cards sit on the left and decide what the graph shows. "All parts" draws every part on one graph; a part card shows that part alone with its numbers for the range shown (now, average, peak, lowest, forecast). Each part keeps one colour on its card and its line (CPU blue, memory green, GPU purple, disk dark grey; checked for colour-blind readers), the card pill says Normal, High or Critical by the part's own alert lines (85 % and 95 % unless changed in the Alert lines card), and the graphs draw those lines and hatch the stretches with no samples. Table view replaces the graph inside the same card.

On "All parts" each line carries its name at its right end (where its forecast or its last reading ends), with a dot in its colour, so the lines can be told apart at a glance; names that would overlap are spread apart (hardwareEndLabelPlugin in frontend/admin/js/hardware.js, 12 Nov 2026).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/hardware/overview` | backend/features/hardware/routes.js |
| GET | `/api/admin/hardware/live` | backend/features/hardware/routes.js |
| GET | `/api/admin/hardware/series` | backend/features/hardware/routes.js |
| GET | `/api/admin/hardware/settings` | backend/features/hardware/routes.js |
| PUT | `/api/admin/hardware/settings` | backend/features/hardware/routes.js |
| PUT | `/api/admin/hardware/alert-lines` | backend/features/hardware/routes.js |

**Task-sheet items for this feature**

- Build a hardware resource monitoring dashboard with graphs for GPU, CPU, memory, and storage usage, with configurable intervals and usage forecasting (Admin Screen point 4). Forecasting is statistical by agreement with the supervisor.

**Known issues**

- GPU memory total is only known with nvidia-smi; with the Windows counters the tile shows memory in use only.
- The forecast needs about an hour of samples (six 10-minute averages) before it shows anything; a forecast more than 2 days ahead (more than 7 days before 18 Nov 2026) needs 6 days with samples.
- A yearly forecast only becomes dependable after a year of samples with "Keep samples for" set to 1 year (about 525,000 rows at one sample a minute). A small table of daily summaries kept for good would make that cheaper; not built yet.
- Reading the Windows GPU counters takes about 2 s per sample; the sampler runs it in a child process so the page is not affected.
- A custom range longer than "Keep samples for" (at most 1 year) is partly empty; the note under the graphs says how long samples are kept.

---
Hand-written on 2026-11-03. Update this page when you change the feature.

## Daily summaries, kept for good (12 Nov 2026)
- Table `hardware_daily` (migration 009): one row per UTC day with the averages and peaks of CPU, memory, disk and GPU,
  the disk and memory sizes and the number of samples. About 365 rows a year, never deleted.
- `backend/features/hardware/daily.js` sums up every finished day; the sampler runs it at its first sample after each
  UTC midnight (8 am in Singapore), before the hourly clean-up deletes old samples. After a long sleep it catches up
  every day whose samples are still there. A day is summed up once.
- A graph range longer than "Keep samples for" (or one that needs buckets of a day or more) comes from the summaries,
  one point per day or more, with today taken from the samples (`source: "daily"` in `GET /series`).
- A forecast more than 2 days ahead (more than a week before 18 Nov 2026) reads the summaries too, so "Keep samples for"
  no longer limits it: the forecast check says only "wait" (`keptForGood: true`, reason `history`) until the summaries
  reach back as far as the forecast looks ahead. Forecasts up to 2 days ahead still use the samples and still get the
  `retention` reason.
- Before `npm run db:migrate` adds the table the page keeps working on the samples alone, and Sampling shows
  "table missing".

## Alert lines per part (15 Nov 2026)
- The Alert lines (Settings drawer since 17 Nov 2026) set amber ("warn", 30 to 99 %) and red ("critical", 31 to 100 %) for
  CPU, memory, GPU and disk; red is always above amber. A System Admin saves them (`PUT /api/admin/hardware/alert-lines`,
  Audit Logs `HARDWARE_ALERT_LINES_UPDATE`); other admins see them read-only. Stored as `alerts` in
  `backend/data/hardware-settings.json` (`settings.readAlerts`, `validateAlerts`, `writeAlerts`); a Sampling save keeps
  them and an alert save keeps the sampling. A file without them, or with a broken part, gives 85 / 95: nothing changes
  until someone sets them.
- They decide each part card's Normal / High / Critical (`hardwareTone(percent, part)`) and the dashed lines: a part's
  graph draws its own two; the graph with every part draws only a line all the parts on it share and then says the lines
  differ (`hardwareLinesFor`, `hardwareLegendLimits`), so no line is drawn that is not every shown part's real limit.
- System Health uses the same lines: the Server PC card by CPU and memory (the worse of the two), the Disk card by disk
  (backend/features/health/checks.js). GPU is on this page only. The anomaly detection keeps its own fixed numbers
  (a disk incident from 90 %, critical at 95 %; a spike critical at 95 %).
- The drawer says "Unsaved changes" only while a value differs from the saved settings; Use the defaults fills 85 / 95
  without saving.

## Settings drawer, CPU card and the live line (17 Nov 2026)
- The Sampling card and the Alert lines card left the page: the Settings button at the top right (next to Refresh) opens
  a drawer from the right with Sampling (sample every, keep samples for, forecast ahead), Alert lines and the Sampler
  facts (GPU reading, samples stored, daily summaries, oldest and last sample, last error). The Forecast card is full
  width now. The drawer is the incident settings drawer (the same `inc-drawer` classes), filled with the saved values
  each time it opens (`openHardwareSettings`), so the minute refresh never writes over typing.
- One Save (`saveHardwareSettings`) sends only the part that changed: `PUT /settings` (any signed-in admin) and, for a
  System Admin, `PUT /alert-lines`. The long-forecast reminder still comes first. A failure keeps the drawer open and
  says which part was saved; Esc, Cancel or a click beside the drawer drop what was typed.
- The CPU card's line names the processor, like the other cards describe their part: `machine.cpu` in
  `GET /overview` (collect.cpuInfo: the name without the trade marks and the clock, and the logical processors).
- The line above the cards says how fresh the numbers are: "Live, updates every second" while the live reading
  arrives, "From the last sample, 2 min ago" when it does not, or why there is no number yet
  (`renderHardwareLiveNote`). It replaces the "Live: average of the last second" that used to be the CPU card's line.

## Past / Forecast switch on the graph, 17 Nov 2026
- The graph card and the Forecast card both showed where the values were heading, and the graph drew a forecast on some
  ranges only (none on 1 hour, 6 hours or a long custom range such as 1 year), which was confusing. The graph card now
  has a Past / Forecast switch in front of the chips, and the Forecast card is gone.
- Past ("Last" 1 hour to 30 days, or Custom up to 5 years) shows only what was measured. Under one part's graph: now,
  average, peak and lowest of the range.
- Forecast ("Next" 1 hour to 30 days, or Custom up to 1 year in hours, days, weeks, months of 30 days or years of 365
  days) shows half the forecast length of history before now (a third of the graph), a "now" line, then the forecast to
  its end, so a forecast a year ahead runs out to a year from now. When the daily summaries do not reach that far
  back, the history starts at the oldest day instead. Under All parts: each part's value at the end with its likely
  range, and when the disk is full (what the Forecast card used to show). Under one part: now, the value at the end,
  the likely range (the shaded band) and what it is based on; for the disk: where it will be, when it is full and how
  fast it grows. The rough guide note and the method line sit under the graph in this mode only.
- While a forecast is not ready (up to 2 days ahead it needs an hour of samples without a break; further ahead it needs 6
  days with samples; the boundary was 7 days until 18 Nov 2026) the graph still runs to the end of the length picked and says why in the empty space after "now".
- The page asks for `GET /series?range=<half the length in hours>&horizon=<hours>`. `horizon` (1 to 8760) is new; when
  it is left out the saved `forecastHours` is used, which is how the first visit picks up the length saved before. The
  page sends the length in Past mode too, because the part cards keep their short forecast line ("36% in 24 hours").
- The view (Past or Forecast, the range and the length) is kept in the browser (localStorage, `hardwareGraphView`).
- The Settings drawer lost "Forecast ahead". Its first section is called Forecast sampling and says that the graphs and
  the forecast are built from these samples. A save sends the saved `forecastHours` back unchanged. The reminder dialog
  before saving a long forecast and `GET /forecast-check` are gone, because the rough guide note under the graph says the
  same thing whenever it applies.

## A trend lasts 6 hours at most, 18 Nov 2026
- A trend was trusted for about half the unbroken run of samples (`dampingFor` in backend/features/hardware/forecast.js).
  On a PC that runs for days without a break that was days, so a small trend of the last hour carried on for days: a
  forecast 7 days ahead of memory came out at 92.7 % on the test data while memory was at 80 %. The trend now fades by
  half within 36 steps at the latest (`MAX_HALF_LIFE_STEPS`, 6 hours of 10 minute steps), so it fades within about a day
  instead of days: on the same data memory 7 days ahead is 81.6 % and GPU 1.9 % instead of 0 %. The value settles at the
  current level plus about 50 steps of trend, so a steep fall in the last hour can still reach 0 % within hours (CPU on
  the same data). Runs shorter than 12 hours behave as before. The daily forecast gets the same cap in days (36 days).
- tests/unit/forecast.test.js: a steady rise keeps its slope at first and the rise halves 36 steps later; 12.5 days of a
  steady rise no longer push the value 7 days ahead up by about 7 points.

## Daily averages from 2 days ahead, 18 Nov 2026
- Up to 2 days ahead the forecast still works on the 10 minute steps; more than 2 days ahead it uses the daily averages
  that 30 days and 1 year already used (`DAILY_AFTER_HOURS` and `usesDailyAverages` in backend/features/hardware/forecast.js,
  used by `buildForecast` and `describeCheck` in routes.js). The steps carry on from the current level, so a forecast 7
  days ahead made at night showed tonight's low CPU, while 30 days ahead showed the usual level. Now 7 days shows the
  usual level and range too.
- The cost: a forecast more than 2 days ahead needs 6 days with at least an hour of samples before it shows anything (the
  graph says "Needs 6 days with samples"), where the steps need one hour. Its rough guide check counts the daily summaries,
  which are kept for good, so only waiting makes it dependable.
- The trend cap above now matters for 1 hour to 2 days ahead.
- Tests: forecast.test.js checks the boundary (48 hours on steps, 49 hours and more on daily averages); the smoke test asks
  horizon=48 (steps) and horizon=168 (daily).
