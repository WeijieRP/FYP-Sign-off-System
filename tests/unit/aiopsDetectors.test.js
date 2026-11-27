// Owner: Role 3, Jun Kai.
// Unit tests for the anomaly detectors (backend/features/aiops/detectors.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../../backend/features/aiops/detectors');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-11T06:40:00Z'); // Wednesday 14:40 in Singapore

// one sample a minute for `minutes` minutes up to now; valueAt(minutesAgo)
const minuteSeries = (minutes, valueAt, now = NOW) => Array.from({ length: minutes + 1 }, (_, i) => {
    const ago = minutes - i;
    return { t: now - ago * MINUTE, v: valueAt(ago) };
});

// deterministic noise in [-0.5, 0.5) so the tests never flake
function noise(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
}

function checkShape(a) {
    assert.ok(d.DETECTOR_KEYS.includes(a.detector), `detector ${a.detector}`);
    assert.equal(typeof a.kind, 'string');
    assert.ok(a.subject === null || typeof a.subject === 'string');
    assert.equal(a.fingerprint, `${a.detector}:${a.kind}:${a.subject || '-'}`);
    assert.ok(d.SEVERITY_ORDER.includes(a.severity), `severity ${a.severity}`);
    assert.ok(a.title.length > 0 && a.title.length <= 80, `title length ${a.title.length}: ${a.title}`);
    assert.ok(a.explanation.length > 0);
    assert.equal(typeof a.evidence, 'object');
    if (a.evidence.points) {
        assert.ok(a.evidence.points.length <= 60);
        for (const p of a.evidence.points) assert.ok(Number.isFinite(p.t) && Number.isFinite(p.v));
    }
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(a.title + a.explanation), 'no emoji');
}

test('median and mad handle odd, even and empty lists', () => {
    assert.equal(d.median([3, 1, 2]), 2);
    assert.equal(d.median([4, 1, 3, 2]), 2.5);
    assert.equal(d.median([]), null);
    assert.equal(d.mad([1, 2, 3, 4, 100]), 1);
    assert.equal(d.mad([]), null);
});

test('robustZ uses a spread of 1 when the MAD is 0', () => {
    const flat = d.robustZ(15, [10, 10, 10, 10, 10]);
    assert.deepEqual(flat, { z: 5, median: 10, mad: 0 });
    const noisy = d.robustZ(30, [8, 12, 10, 14, 6]); // median 10, deviations 2 2 0 4 4 -> mad 2
    assert.equal(noisy.median, 10);
    assert.equal(noisy.mad, 2);
    assert.equal(noisy.z, 10);
    assert.deepEqual(d.robustZ(1, []), { z: null, median: null, mad: null });
});

test('windowMean averages the samples inside the window and skips nulls', () => {
    const series = [{ t: 0, v: 10 }, { t: 60, v: null }, { t: 120, v: 20 }, { t: 180, v: 30 }, { t: 240, v: 100 }];
    assert.deepEqual(d.windowMean(series, 0, 180), { mean: 20, count: 3 });
    assert.deepEqual(d.windowMean(series, 181, 239), { mean: null, count: 0 });
    assert.deepEqual(d.windowMean([], 0, 1), { mean: null, count: 0 });
});

test('sgtHour and sgtWeekday are Singapore time, including the day roll-over', () => {
    const t = Date.parse('2026-11-11T02:30:00Z');
    assert.equal(d.sgtHour(t), 10);
    assert.equal(d.sgtWeekday(t), 3); // Wednesday
    const evening = Date.parse('2026-11-11T17:05:00Z'); // 01:05 on Thursday in Singapore
    assert.equal(d.sgtHour(evening), 1);
    assert.equal(d.sgtWeekday(evening), 4);
    assert.equal(d.sgtDayKey(evening), d.sgtDayKey(t) + 1);
    assert.equal(d.sgtHour(new Date(t)), 10, 'accepts a Date');
});

test('templateOf drops the emoji old console messages start with', () => {
    assert.equal(d.templateOf('❌ Email transporter not initialized'), 'Email transporter not initialized');
    assert.equal(d.templateOf('⚠️  Hardware sampler: GPU read failed 3 times'), 'Hardware sampler: GPU read failed # times');
    assert.equal(d.templateOf('Thank-you email failed ❌ again'), 'Thank-you email failed again');
});

test('templateOf masks numbers, ids, quoted text, paths and dates', () => {
    assert.equal(d.templateOf('Database query failed: code 1234 after 2.5 s'), 'Database query failed: code # after # s');
    assert.equal(d.templateOf('Cannot find module \'C:\\Users\\yoga\\app.js\''), 'Cannot find module "..."');
    assert.equal(d.templateOf('ENOENT: open "/var/lib/kiosk/x.json"'), 'ENOENT: open "..."');
    assert.equal(d.templateOf('Failed to read C:\\Users\\yoga\\FYP\\backend\\server.js:12:5'), 'Failed to read <path>:#:#');
    assert.equal(d.templateOf('Missing file /usr/lib/node/x.js for device'), 'Missing file <path> for device');
    assert.equal(d.templateOf('Session 550e8400-e29b-41d4-a716-446655440000 expired'), 'Session <id> expired');
    assert.equal(d.templateOf('Hash deadbeef1234 at 0x7ffee3 rejected'), 'Hash <id> at <id> rejected');
    assert.equal(d.templateOf('Started at 2026-11-11T02:30:00.000Z, retry at 14:02'), 'Started at #, retry at #');
    assert.equal(d.templateOf('Timestamp 1762828200000 is not an id'), 'Timestamp # is not an id');
    assert.equal(d.templateOf('Fetch http://localhost:3000/api/admin/health failed'), 'Fetch http://localhost:#/api/admin/health failed', 'a URL keeps its route');
    assert.equal(d.templateOf('GET /api/admin/incidents/42 failed'), 'GET <path> failed');
    assert.equal(d.templateOf("can't reach 'host-7' and/or 'host-8'"), 'can\'t reach "..." and/or "..."');
    assert.equal(d.templateOf('Email to jane.tan+rp@example.edu.sg failed'), 'Email to <email> failed', 'an address never reaches an incident');
    assert.equal(d.templateOf('  many    spaces \n here '), 'many spaces here');
    assert.equal(d.templateOf('x'.repeat(200)).length, 160);
    assert.equal(d.templateOf(null), '');
    assert.equal(d.templateOf('same 1'), d.templateOf('same 2'), 'two messages of one kind share a template');
    assert.match(d.templateHash('abc'), /^[0-9a-f]{10}$/);
});

test('spike fires critical on a 90 % plateau over a quiet 10 % baseline', () => {
    const series = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 90 : 10));
    const a = d.detectSpike({ series, metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    checkShape(a);
    assert.equal(a.fingerprint, 'spike:high:cpu');
    assert.equal(a.severity, 'critical');
    assert.equal(a.title, 'CPU at 90 %, far above the usual 10 %');
    assert.match(a.explanation, /CPU use averaged 90 % over the last 5 minutes/);
    assert.match(a.explanation, /past 24 hours the typical level was 10 %/);
    assert.equal(a.evidence.value, 90);
    assert.equal(a.evidence.baseline, 10);
    assert.equal(a.evidence.unit, '%');
    assert.equal(a.evidence.windowSeconds, 300);
    assert.ok(a.evidence.points.length <= 60 && a.evidence.points[a.evidence.points.length - 1].v === 90, 'sparkline ends on the spike');
});

test('spike reports warn when the rise is between K and 2K spreads', () => {
    // baseline cycling 72 / 75 / 78 (median 75, MAD 3), window at 88 -> z 4.3 at K 3.5
    const series = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 88 : 72 + 3 * (ago % 3)));
    const a = d.detectSpike({ series, metric: 'memory', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    checkShape(a);
    assert.equal(a.severity, 'warn');
    assert.match(a.explanation, /\(usual swing ± 3 %\), so this is 4 times its usual swing above normal/);
    assert.equal(d.detectSpike({ series, metric: 'memory', now: NOW, sensitivity: 1, intervalSeconds: 60 }), null, 'very low sensitivity needs 6 spreads');
});

test('spike stays quiet below the floor: 9 % to 15 % is not an incident', () => {
    const series = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 15 : 9));
    assert.equal(d.detectSpike({ series, metric: 'cpu', now: NOW, sensitivity: 5, intervalSeconds: 60 }), null);
});

test('spike is learning with 30 minutes of data and no-data with none', () => {
    const r = d.detectSpike({ series: minuteSeries(30, () => 10), metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    assert.equal(r.state, 'learning');
    assert.equal(r.learning, true);
    assert.match(r.note, /Needs 2 hours of samples/);
    assert.equal(d.detectSpike({ series: [], metric: 'gpu', now: NOW, sensitivity: 3, intervalSeconds: 60 }).state, 'no-data');
    assert.equal(d.detectSpike({ series: [{ t: NOW, v: null }], metric: 'gpu', now: NOW, sensitivity: 3, intervalSeconds: 60 }).state, 'no-data');
});

test('spike sustained rule rejects a single 100 % sample at a 60 s interval', () => {
    // memory baseline cycling 75 / 76 / 77 (median 76, MAD 1): the window [100, 79, 79, 79, 79, 79] averages 82.5
    // (over the 80 floor, z 6.5) but only one of six samples is over the line
    const single = minuteSeries(24 * 60, (ago) => (ago === 0 ? 100 : ago <= 5 ? 79 : 75 + (ago % 3)));
    assert.equal(d.detectSpike({ series: single, metric: 'memory', now: NOW, sensitivity: 3, intervalSeconds: 60 }), null);
    const plateau = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 92 : 75 + (ago % 3)));
    assert.equal(d.detectSpike({ series: plateau, metric: 'memory', now: NOW, sensitivity: 3, intervalSeconds: 60 }).severity, 'critical');
});

test('spike window grows with the sampler interval', () => {
    // 10-minute samples: the 30-minute window [now - 30 min, now] holds 4 samples, 3 of them at 95
    const series = Array.from({ length: 145 }, (_, i) => ({ t: NOW - (144 - i) * 10 * MINUTE, v: i >= 142 ? 95 : 10 }));
    const a = d.detectSpike({ series, metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 600 });
    assert.equal(a.evidence.windowSeconds, 1800);
    assert.equal(a.evidence.samples, 4);
    assert.equal(a.evidence.above, 3);
    assert.match(a.explanation, /over the last 30 minutes/);
});

// samples of the Singapore hour of NOW (14:00-14:59) on the `days` earlier days plus today up to now
function hourSeries(days, valueAt) {
    const hourStart = NOW - 40 * MINUTE; // 14:00 SGT today
    const points = [];
    for (let day = days; day >= 1; day--) {
        for (let m = 0; m < 60; m++) points.push({ t: hourStart - day * DAY + m * MINUTE, v: valueAt(day, m) });
    }
    for (let m = 0; m <= 40; m++) points.push({ t: hourStart + m * MINUTE, v: valueAt(0, m) });
    return points;
}

test('timeOfDay is learning until 3 earlier days have samples', () => {
    const r = d.detectTimeOfDay({ series: hourSeries(2, () => 10), metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    assert.equal(r.state, 'learning');
    assert.equal(r.note, 'Needs 3 days of samples for this hour (has 2)');
    assert.equal(d.detectTimeOfDay({ series: [], metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 }).state, 'no-data');
});

test('timeOfDay fires when this hour is far above its usual level', () => {
    const series = hourSeries(5, (day, m) => (day === 0 && m >= 25 ? 72 : 10 + (m % 3)));
    const a = d.detectTimeOfDay({ series, metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    checkShape(a);
    assert.equal(a.fingerprint, 'timeOfDay:unusual:cpu');
    assert.equal(a.title, 'CPU at 72 %, usually 11 % at 14:00');
    assert.match(a.explanation, /CPU use averaged 72 % over the last 15 minutes/);
    assert.match(a.explanation, /On the 5 earlier days with samples, this hour \(14:00 to 15:00 Singapore time\)/);
    assert.equal(a.evidence.baselineKind, 'hour');
    assert.equal(a.evidence.baselineDays, 5);
    assert.equal(a.evidence.points.length, 6, 'one point per earlier day plus today');
    const quiet = hourSeries(5, (day, m) => (day === 0 && m >= 25 ? 14 : 10 + (m % 3)));
    assert.equal(d.detectTimeOfDay({ series: quiet, metric: 'cpu', now: NOW, sensitivity: 5, intervalSeconds: 60 }), null, 'floor');
});

test('timeOfDay switches to the same-weekday baseline at 14 days', () => {
    // Wednesdays (7 and 14 days ago) run at 70 %, other days at 10 %; today is 72 %
    const valueAt = (day, m) => (day === 0 && m >= 25 ? 72 : day === 0 ? 70 : day % 7 === 0 ? 70 : 10);
    const thirteen = d.detectTimeOfDay({ series: hourSeries(13, valueAt), metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    assert.ok(thirteen && thirteen.detector === 'timeOfDay', 'with 13 days the hour baseline (10 %) makes 72 % unusual');
    assert.equal(thirteen.evidence.baselineKind, 'hour');
    const fourteen = d.detectTimeOfDay({ series: hourSeries(14, valueAt), metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    assert.equal(fourteen, null, 'with 14 days the Wednesday baseline (70 %) makes 72 % normal');
    const busyWednesday = (day, m) => (day === 0 && m >= 25 ? 95 : day % 7 === 0 ? 70 : 10);
    const a = d.detectTimeOfDay({ series: hourSeries(14, busyWednesday), metric: 'cpu', now: NOW, sensitivity: 3, intervalSeconds: 60 });
    checkShape(a);
    assert.equal(a.evidence.baselineKind, 'weekday');
    assert.equal(a.evidence.baselineDays, 2);
    assert.equal(a.title, 'CPU at 95 %, usually 70 % on Wednesdays at 14:00');
    assert.match(a.explanation, /On the 2 earlier Wednesdays with samples/);
});

const tenMinuteMeans = (valueAt) => Array.from({ length: 144 }, (_, i) => ({ t: NOW - (143 - i) * 10 * MINUTE, v: valueAt(i) }));

test('drift fires on a 24 h linear memory climb from 70 to 92', () => {
    const a = d.detectDrift({ series: tenMinuteMeans((i) => 70 + (22 * i) / 143), metric: 'memory', now: NOW, sensitivity: 3 });
    checkShape(a);
    assert.equal(a.fingerprint, 'drift:rising:memory');
    assert.equal(a.severity, 'warn');
    assert.ok(Math.abs(a.evidence.slopePerHour - 0.92) < 0.05, `slope ${a.evidence.slopePerHour} per hour`);
    assert.ok(a.evidence.hours >= 12 && a.evidence.hours <= 24, `hours ${a.evidence.hours}`);
    assert.equal(a.evidence.value, 92);
    assert.match(a.explanation, /Memory has risen about 0\.9 % per hour for \d+ hours, from about \d+ % to 92 %/);
    assert.match(a.title, /^Memory creeping up: 92 %, about 0\.9 % per hour for \d+ hours$/);
    assert.ok(a.evidence.points.length <= 60);
});

test('drift stays quiet on flat noisy data, below the floor, and while learning', () => {
    const rnd = noise(3);
    assert.equal(d.detectDrift({ series: tenMinuteMeans(() => 85 + rnd() * 2), metric: 'memory', now: NOW, sensitivity: 5 }), null, 'flat at 85 % with noise');
    assert.equal(d.detectDrift({ series: tenMinuteMeans((i) => 50 + (22 * i) / 143), metric: 'memory', now: NOW, sensitivity: 3 }), null, 'climb that ends under 80 %');
    const r = d.detectDrift({ series: tenMinuteMeans(() => 85).slice(0, 10), metric: 'memory', now: NOW, sensitivity: 3 });
    assert.equal(r.state, 'learning');
    assert.match(r.note, /Needs 12 averages/);
    assert.equal(d.detectDrift({ series: [], metric: 'disk', now: NOW, sensitivity: 3 }).state, 'no-data');
});

test('drift on hourly disk percent uses the 70 % floor', () => {
    const hourly = (from) => Array.from({ length: 168 }, (_, i) => ({ t: NOW - (167 - i) * HOUR, v: from + (15 * i) / 167 }));
    const a = d.detectDrift({ series: hourly(60), metric: 'disk', now: NOW, sensitivity: 3 });
    assert.ok(a && a.detector === 'drift');
    assert.match(a.title, /^Disk creeping up: 75 %/);
    assert.equal(d.detectDrift({ series: hourly(50), metric: 'disk', now: NOW, sensitivity: 3 }), null);
});

const diskPoints = (days, startGb, gbPerDay) => Array.from({ length: days * 24 + 1 }, (_, i) => ({ t: NOW - (days * 24 - i) * HOUR, v: startGb + (gbPerDay * i) / 24 }));

test('disk warns on days left according to the sensitivity', () => {
    const points = diskPoints(30, 100, 2); // 160 of 200 GB now, +2 GB a day -> 20 days
    assert.equal(d.detectDisk({ points, totalGb: 200, percent: 80, sensitivity: 3 }), null, '14-day limit');
    const a = d.detectDisk({ points, totalGb: 200, percent: 80, sensitivity: 4 });
    checkShape(a);
    assert.equal(a.fingerprint, 'disk:filling:-');
    assert.equal(a.severity, 'warn');
    assert.equal(a.title, 'Disk full in about 20 days at 2 GB per day');
    assert.match(a.explanation, /grew by about 2 GB per day over the last 30 days\. It is 80 % full now \(160 of 200 GB\)/);
    assert.equal(a.evidence.daysUntilFull, 20);
    assert.equal(a.evidence.unit, 'GB');
    assert.equal(a.evidence.value, 160);
    assert.equal(d.detectDisk({ points, totalGb: 200, sensitivity: 4 }).evidence.percent, 80, 'percent derived from the last point');
});

test('disk reports a nearly full drive with or without a forecast', () => {
    const full = d.detectDisk({ points: diskPoints(30, 100, 2), totalGb: 200, percent: 96, sensitivity: 3 });
    assert.equal(full.fingerprint, 'disk:full:-');
    assert.equal(full.severity, 'critical');
    assert.equal(full.title, 'Disk 96 % full');
    assert.match(full.explanation, /full in about 20 days/);
    const warn = d.detectDisk({ points: [], totalGb: 200, percent: 91, sensitivity: 3 });
    assert.equal(warn.severity, 'warn');
    assert.equal(warn.title, 'Disk 91 % full');
    const flat = d.detectDisk({ points: diskPoints(30, 100, 0), totalGb: 200, percent: 92, sensitivity: 3 });
    assert.match(flat.explanation, /has not been growing/);
});

test('disk forecast is learning until the samples span a day', () => {
    const r = d.detectDisk({ points: diskPoints(30, 100, 48).slice(-6), totalGb: 200, percent: 80, sensitivity: 5 });
    assert.equal(r.state, 'learning');
    assert.match(r.note, /Needs a day of disk samples/);
    assert.equal(d.detectDisk({ points: [], totalGb: 200, sensitivity: 3 }).state, 'no-data');
});

const run = (minutesAgo, results) => ({ at: new Date(NOW - minutesAgo * MINUTE), results });
const ok = (key, latencyMs = 12) => ({ key, status: 'ok', latencyMs, summary: 'fine' });
const down = (key, summary = 'connect ECONNREFUSED') => ({ key, status: 'down', latencyMs: null, summary });

test('services needs two down runs in a row and ignores other keys', () => {
    assert.deepEqual(d.detectServices({ runs: [run(0, [down('database')])], now: NOW, sensitivity: 3, quiet: false }), [], 'one run alone');
    assert.deepEqual(d.detectServices({ runs: [run(5, [down('database')]), run(0, [ok('database')])], now: NOW, sensitivity: 3, quiet: false }), [], 'recovered');
    const runs = [run(15, [ok('database')]), run(10, [down('database')]), run(5, [down('database'), down('ollama')]), run(0, [down('database'), down('ollama'), ok('kiosk')])];
    const found = d.detectServices({ runs, now: NOW, sensitivity: 3, quiet: false });
    assert.equal(found.length, 1);
    checkShape(found[0]);
    assert.equal(found[0].fingerprint, 'services:down:database');
    assert.equal(found[0].severity, 'critical');
    assert.equal(found[0].title, 'Database down (3 checks in a row)');
    assert.match(found[0].explanation, /in the last 3 runs, since 14:30 Singapore time\. Last message: connect ECONNREFUSED/);
    assert.equal(found[0].evidence.runs, 3);
});

test('services drops the kiosk in quiet hours and warns about the mail login', () => {
    const runs = [run(5, [down('kiosk'), down('email')]), run(0, [down('kiosk'), down('email')])];
    const loud = d.detectServices({ runs, now: NOW, sensitivity: 3, quiet: false });
    assert.deepEqual(loud.map((a) => [a.fingerprint, a.severity]), [['services:down:kiosk', 'critical'], ['services:down:email', 'warn']]);
    assert.equal(loud[1].title, 'Mail login failing (2 checks in a row)');
    const quiet = d.detectServices({ runs, now: NOW, sensitivity: 3, quiet: true });
    assert.deepEqual(quiet.map((a) => a.fingerprint), ['services:down:email']);
    const unknown = [run(5, [{ key: 'email', status: 'unknown', summary: 'no sender configured' }]), run(0, [{ key: 'email', status: 'unknown' }])];
    assert.deepEqual(d.detectServices({ runs: unknown, now: NOW, sensitivity: 3, quiet: false }), []);
});

test('services looks at the last two runs that contain the key', () => {
    // email is checked every 30 minutes in runs of its own
    const runs = [run(35, [down('email')]), run(10, [ok('database')]), run(5, [down('email')]), run(0, [ok('database')])];
    const found = d.detectServices({ runs, now: NOW, sensitivity: 3, quiet: false });
    assert.deepEqual(found.map((a) => a.fingerprint), ['services:down:email']);
    assert.equal(found[0].evidence.runs, 2);
});

test('services flags a slow database answer against the last 24 hours', () => {
    const rnd = noise(5);
    const runs = Array.from({ length: 24 }, (_, i) => run((23 - i) * 5, [ok('database', i === 23 ? 820 : 12 + Math.round(rnd() * 6))]));
    const found = d.detectServices({ runs, now: NOW, sensitivity: 3, quiet: false });
    assert.equal(found.length, 1);
    checkShape(found[0]);
    assert.equal(found[0].fingerprint, 'services:slow:database');
    assert.equal(found[0].severity, 'warn');
    assert.match(found[0].title, /^Database slow: 820 ms, usually 1\d ms$/);
    assert.equal(found[0].evidence.unit, 'ms');
    assert.equal(found[0].evidence.value, 820);
    assert.equal(found[0].evidence.points.length, 24);
    const mild = runs.map((r, i) => (i === 23 ? run(0, [ok('database', 400)]) : r));
    assert.deepEqual(d.detectServices({ runs: mild, now: NOW, sensitivity: 5, quiet: false }), [], '400 ms is under the 500 ms floor');
    const short = runs.slice(-4);
    assert.deepEqual(d.detectServices({ runs: short, now: NOW, sensitivity: 5, quiet: false }), [], 'needs a baseline first');
});

test('tablets: unnamed devices are ignored, one named tablet offline is a warning', () => {
    const devices = [
        { device_id: 'a1', name: 'Lobby', seconds_ago: 840 },
        { device_id: 'b2', name: '', seconds_ago: 99999 },
        { device_id: 'c3', name: null, seconds_ago: 99999 },
        { device_id: 'd4', name: 'Lab A', seconds_ago: 30 }
    ];
    const found = d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: false });
    assert.equal(found.length, 1);
    checkShape(found[0]);
    assert.equal(found[0].fingerprint, 'tablets:offline:a1');
    assert.equal(found[0].severity, 'warn');
    assert.equal(found[0].title, 'Tablet Lobby offline for 14 min');
    assert.match(found[0].explanation, /The tablet Lobby last reported 14 min ago\. .* more than 10 minutes/);
    assert.equal(found[0].evidence.unit, 'min');
    assert.equal(found[0].evidence.value, 14);
    assert.deepEqual(d.detectTablets({ devices, now: NOW, sensitivity: 1, quiet: false }), [], '30-minute limit at very low sensitivity');
    assert.deepEqual(d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: true }), [], 'quiet hours');
    assert.deepEqual(d.detectTablets({ devices: [], now: NOW, sensitivity: 3, quiet: false }), []);
});

test('tablets: every named tablet offline is one critical incident', () => {
    const devices = [
        { device_id: 'a1', name: 'Lobby', seconds_ago: 840 },
        { device_id: 'd4', name: 'Lab A', seconds_ago: 4000 },
        { device_id: 'z9', name: '', seconds_ago: 10 }
    ];
    const found = d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: false });
    assert.equal(found.length, 1);
    checkShape(found[0]);
    assert.equal(found[0].fingerprint, 'tablets:all-offline:-');
    assert.equal(found[0].severity, 'critical');
    assert.equal(found[0].title, 'All 2 named tablets offline');
    assert.match(found[0].explanation, /None of the 2 named tablets \(Lobby and Lab A\) has reported for more than 10 minutes\. The most recent report was 14 min ago\./);
    const one = d.detectTablets({ devices: [devices[0]], now: NOW, sensitivity: 3, quiet: false });
    assert.equal(one[0].kind, 'offline', 'a single named tablet offline stays a warning');
});

const event = (minutesAgo, level, message, process = 'server') => ({ at: new Date(NOW - minutesAgo * MINUTE).toISOString(), process, level, message });

test('logs: a burst of errors in 5 minutes is a warning, three times the limit is critical', () => {
    const events = [];
    for (let i = 0; i < 5; i++) events.push(event(1 + i * 0.5, 'error', `Database query failed: code ${100 + i}`));
    for (let i = 0; i < 3; i++) events.push(event(2 + i, 'error', `Cannot find module 'x${i}'`, 'kiosk'));
    events.push(event(3, 'warn', 'Slow request 900 ms'));
    for (let h = 1; h < 24; h += 2) events.push(event(h * 60, 'error', `Old error ${h}`));
    const r = d.detectLogs({ events, now: NOW, sensitivity: 3, known: new Set(), historyHours: 48 });
    const burst = r.anomalies.find((a) => a.kind === 'burst');
    checkShape(burst);
    assert.equal(burst.fingerprint, 'logs:burst:-');
    assert.equal(burst.severity, 'warn');
    assert.equal(burst.title, '8 server errors in 5 minutes');
    assert.match(burst.explanation, /logged 8 errors in the last 5 minutes; a normal 5-minute slice of the last 24 hours has 0\. Most common: "Database query failed: code #" \(5\), "Cannot find module "\.\.\."" \(3\)\./);
    assert.equal(burst.evidence.unit, 'errors');
    assert.equal(burst.evidence.value, 8);
    assert.equal(burst.evidence.points.length, 60);
    assert.equal(burst.evidence.points[59].v, 8);
    assert.ok(r.templates.has('Database query failed: code #') && r.templates.has('Slow request # ms'));
    const many = events.concat(Array.from({ length: 12 }, (_, i) => event(0.5, 'error', `Boom ${i}`)));
    assert.equal(d.detectLogs({ events: many, now: NOW, sensitivity: 3, known: new Set(), historyHours: 48 }).anomalies.find((a) => a.kind === 'burst').severity, 'critical');
    const few = events.slice(0, 4).concat(events.slice(8));
    assert.equal(d.detectLogs({ events: few, now: NOW, sensitivity: 3, known: new Set(), historyHours: 48 }).anomalies.some((a) => a.kind === 'burst'), false, '4 errors is under the limit of 6');
    assert.equal(d.detectLogs({ events: few, now: NOW, sensitivity: 5, known: new Set(), historyHours: 48 }).anomalies.some((a) => a.kind === 'burst'), true, 'limit 3 at very high sensitivity');
});

test('logs: a burst must also be well above the usual error rate', () => {
    // 6 errors in every 5-minute slice all day is the normal level here
    const events = [];
    for (let m = 0; m < 24 * 60; m += 5) for (let i = 0; i < 6; i++) events.push(event(m + i * 0.5, 'error', `Noisy sensor ${i}`));
    const r = d.detectLogs({ events, now: NOW, sensitivity: 3, known: new Set(), historyHours: 48 });
    assert.equal(r.anomalies.some((a) => a.kind === 'burst'), false);
});

test('logs: a template first seen in the last 10 minutes is new; known and earlier ones are not', () => {
    const events = [
        event(2, 'error', 'Old error 5'),
        event(30, 'warn', 'Seen earlier today 1'),
        event(3, 'warn', 'Seen earlier today 2'),
        event(4, 'error', 'Brand new thing 7 at C:\\x\\y.txt'),
        event(1, 'error', 'Brand new thing 8 at C:\\x\\z.txt'),
        event(6, 'warn', 'New warning only', 'kiosk')
    ];
    const r = d.detectLogs({ events, now: NOW, sensitivity: 3, known: new Set(['Old error #']), historyHours: 30 });
    assert.equal(r.learning, false);
    const fresh = r.anomalies.filter((a) => a.kind === 'new');
    assert.equal(fresh.length, 2);
    for (const a of fresh) {
        checkShape(a);
        assert.equal(a.severity, 'info');
        assert.match(a.subject, /^[0-9a-f]{10}$/);
        assert.equal(a.subject, d.templateHash(a.evidence.template));
    }
    const thing = fresh.find((a) => a.evidence.template === 'Brand new thing # at <path>');
    assert.equal(thing.title, 'New error: Brand new thing # at <path>');
    assert.match(thing.explanation, /The admin server logged a kind of error not seen in the last 7 days: "Brand new thing # at <path>"\. It appeared twice in the last 10 minutes\./);
    const warning = fresh.find((a) => a.evidence.template === 'New warning only');
    assert.equal(warning.title, 'New warning: New warning only');
    assert.match(warning.explanation, /^The kiosk server logged a kind of warning/);
    assert.equal(r.templates.size, 4);
});

test('logs: novelty is learning below 24 hours of history while bursts still count', () => {
    const events = Array.from({ length: 7 }, (_, i) => event(1, 'error', `Fresh error ${i}`));
    const r = d.detectLogs({ events, now: NOW, sensitivity: 3, known: new Set(), historyHours: 5 });
    assert.equal(r.learning, true);
    assert.match(r.note, /needs 24 hours of log history \(has 5 h\)/);
    assert.deepEqual(r.anomalies.map((a) => a.kind), ['burst']);
    const none = d.detectLogs({ events: [], now: NOW, sensitivity: 3 });
    assert.deepEqual(none.anomalies, []);
    assert.equal(none.learning, true);
    assert.equal(none.templates.size, 0);
});

test('runAll reports off, muted, no-data and a detector that crashed without throwing', () => {
    const settings = { intervalSeconds: 60, detectors: { spike: { enabled: false, sensitivity: 3 }, logs: { enabled: true, sensitivity: 3 } } };
    const input = { now: new Date(NOW), intervalSeconds: 60, hourSeries: { cpu: 'not a series' }, tablets: { devices: [{ device_id: 'a', name: 'Lobby', seconds_ago: 9999 }] }, quiet: true };
    const r = d.runAll(input, settings);
    assert.deepEqual(r.anomalies, []);
    assert.equal(r.states.spike, 'off');
    assert.equal(r.notes.spike, 'Switched off');
    assert.equal(r.states.timeOfDay, 'error');
    assert.match(r.notes.timeOfDay, /^Detector failed: /);
    assert.equal(r.states.tablets, 'muted');
    assert.equal(r.states.services, 'no-data');
    assert.equal(r.states.logs, 'no-data');
    assert.equal(r.states.drift, 'no-data');
    assert.equal(r.states.disk, 'no-data');
    assert.deepEqual(Object.keys(r.states).sort(), [...d.DETECTOR_KEYS].sort());
});

test('runAll collects anomalies and states from every detector', () => {
    const settings = { intervalSeconds: 60, detectors: Object.fromEntries(d.DETECTOR_KEYS.map((key) => [key, { enabled: true, sensitivity: 3 }])) };
    const cpu = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 90 : 10));
    const input = {
        now: NOW, intervalSeconds: 60,
        samples: { cpu, memory: minuteSeries(24 * 60, () => 60), gpu: [] },
        hourSeries: { cpu: hourSeries(1, () => 10), memory: [], gpu: [] },
        driftSeries: { memory: tenMinuteMeans((i) => 70 + (22 * i) / 143), disk: [] },
        disk: { points: diskPoints(30, 100, 2), totalGb: 200, percent: 96 },
        health: { runs: [run(5, [down('database')]), run(0, [down('database')])] },
        tablets: { devices: [{ device_id: 'a1', name: 'Lobby', seconds_ago: 840 }] },
        logs: { events: Array.from({ length: 7 }, (_, i) => event(1, 'error', `Fresh error ${i}`)), known: new Set(), historyHours: 48 },
        quiet: false
    };
    const r = d.runAll(input, settings);
    for (const a of r.anomalies) checkShape(a);
    const fingerprints = r.anomalies.map((a) => a.fingerprint);
    assert.ok(fingerprints.includes('spike:high:cpu'));
    assert.ok(fingerprints.includes('drift:rising:memory'));
    assert.ok(fingerprints.includes('disk:full:-'));
    assert.ok(fingerprints.includes('services:down:database'));
    assert.ok(fingerprints.includes('tablets:offline:a1'));
    assert.ok(fingerprints.includes('logs:burst:-'));
    assert.ok(fingerprints.some((f) => f.startsWith('logs:new:')));
    assert.deepEqual(r.states, { spike: 'ok', timeOfDay: 'learning', drift: 'ok', disk: 'ok', services: 'ok', tablets: 'ok', logs: 'ok' });
    assert.equal(r.notes.timeOfDay, 'CPU: Needs 3 days of samples for this hour (has 1)');
    assert.equal(r.notes.spike, undefined, 'nothing to say when a detector is fully working');
});

test('runAll falls back to defaults when settings or input are missing', () => {
    const r = d.runAll({}, {});
    assert.deepEqual(r.anomalies, []);
    for (const key of d.DETECTOR_KEYS) assert.equal(r.states[key], 'no-data', key);
    const bare = d.runAll(undefined, undefined);
    assert.equal(Object.keys(bare.states).length, 7);
});
test('runAll says which incidents nothing looked at (held) and which belong to a switched-off detector (closed)', () => {
    const all = Object.fromEntries(d.DETECTOR_KEYS.map((key) => [key, { enabled: true, sensitivity: 3 }]));
    const twoRuns = { runs: [run(5, [ok('database'), ok('kiosk')]), run(0, [ok('database'), ok('kiosk')])] };

    const normal = d.runAll({ now: NOW, health: twoRuns }, { detectors: all });
    assert.deepEqual(normal.held, []);
    assert.deepEqual(normal.closed, []);

    const quiet = d.runAll({ now: NOW, health: twoRuns, quiet: true, tablets: { devices: [{ device_id: 'a1', name: 'Lobby', seconds_ago: 9999 }] } }, { detectors: all });
    assert.deepEqual(quiet.held.sort(), ['services:down:kiosk', 'tablets:'], 'quiet hours: the kiosk check and the tablets are not looked at');

    const fresh = d.runAll({ now: NOW, health: { runs: [run(0, [ok('database')])] } }, { detectors: all });
    assert.deepEqual(fresh.held, ['services:'], 'one health run is not enough to say a service is back');

    const off = d.runAll({ now: NOW, health: twoRuns, hourSeries: { cpu: 'not a series' } }, { detectors: { ...all, spike: { enabled: false, sensitivity: 3 } } });
    assert.deepEqual(off.closed, ['spike:']);
    assert.deepEqual(off.held, ['timeOfDay:'], 'a detector that failed keeps its incidents as they are');
});

test('runAll leaves the hardware readings to settle for 15 minutes after a start or a wake-up', () => {
    const all = Object.fromEntries(d.DETECTOR_KEYS.map((key) => [key, { enabled: true, sensitivity: 3 }]));
    const cpu = minuteSeries(24 * 60, (ago) => (ago <= 5 ? 90 : 10));
    const input = (awakeSeconds) => ({ now: NOW, intervalSeconds: 60, samples: { cpu, memory: [], gpu: [] }, awakeSeconds });

    const waking = d.runAll(input(4 * 60), { detectors: all });
    assert.deepEqual(waking.anomalies, [], 'the spike right after a wake-up is not an incident');
    assert.equal(waking.states.spike, 'muted');
    assert.equal(waking.states.timeOfDay, 'muted');
    assert.match(waking.notes.spike, /woke up 4 min ago; hardware readings are left to settle for 15 minutes/);
    assert.deepEqual(waking.held.filter((p) => p === 'spike:' || p === 'timeOfDay:').sort(), ['spike:', 'timeOfDay:']);

    const settled = d.runAll(input(d.SETTLE_SECONDS), { detectors: all });
    assert.deepEqual(settled.anomalies.map((a) => a.fingerprint), ['spike:high:cpu']);
    const unknown = d.runAll(input(null), { detectors: all });
    assert.deepEqual(unknown.anomalies.map((a) => a.fingerprint), ['spike:high:cpu'], 'no settle period when the awake time is unknown');
});

test('tablets: only the time the kiosk has been watched counts, so a night in hibernation is not an outage', () => {
    const devices = [{ device_id: 'a1', name: 'Lobby', seconds_ago: 15 * 3600 }];
    assert.deepEqual(d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: false, watchSeconds: 5 * 60 }), [], 'watched for 5 minutes only');
    const [late] = d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: false, watchSeconds: 11 * 60 });
    assert.equal(late.fingerprint, 'tablets:offline:a1');
    assert.match(late.title, /offline for 15 h/, 'the text keeps the real time since the last report');
    assert.equal(d.detectTablets({ devices, now: NOW, sensitivity: 3, quiet: false, watchSeconds: null }).length, 1, 'no cap when the watch time is unknown');

    const all = Object.fromEntries(d.DETECTOR_KEYS.map((key) => [key, { enabled: true, sensitivity: 3 }]));
    const early = d.runAll({ now: NOW, tablets: { devices }, watchSeconds: 5 * 60 }, { detectors: all });
    assert.equal(early.states.tablets, 'ok');
    assert.match(early.notes.tablets, /Watching again for 5 min: a tablet counts as offline after 10 quiet minutes/);
    assert.ok(early.held.includes('tablets:'), 'an open tablet incident is not closed while the watch time is too short to tell');
    const later = d.runAll({ now: NOW, tablets: { devices }, watchSeconds: 11 * 60 }, { detectors: all });
    assert.ok(!later.held.includes('tablets:'));
    assert.equal(later.anomalies.length, 1);
});

test('levels() gives the settings page the real number behind each of the 5 sensitivity steps of all 7 detectors', () => {
    const levels = d.levels();
    assert.deepEqual(Object.keys(levels), d.DETECTOR_KEYS);
    for (const [key, level] of Object.entries(levels)) {
        assert.equal(level.short.length, 5, `${key} has 5 steps`);
        if (level.long) assert.equal(level.long.length, 5);
        assert.match(level.sentence, /\{v\}/, `${key} has a sentence to put the number in`);
    }
    assert.deepEqual(levels.spike.short, [1, 2, 3, 4, 5].map((s) => `${d.K[s]}×`), 'straight from the tables the detectors use');
    assert.equal(levels.drift.short[4], `${d.H[5]}×`);
    assert.equal(levels.disk.long[0], `${d.D[1]} days`);
    assert.equal(levels.tablets.long[2], `${d.M[3]} minutes`);
    assert.equal(levels.logs.long[4], `${d.B[5]} errors`);
    assert.match(levels.spike.sentence, new RegExp(`CPU or GPU over ${d.FLOORS.cpu} %`));
});
// <Jun Kai end>
