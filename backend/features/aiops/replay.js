// Owner: Role 3, Jun Kai.
// Replay evaluation of the anomaly detection: a synthetic week of hardware samples, health runs, tablet heartbeats
// and server log lines with seven planted faults, played minute by minute through the real detectors and incident
// engine on the memory store, then scored (precision, recall, minutes to detect). No clock, database or files.
// <Jun Kai start>
const detectors = require('./detectors');
const incidents = require('./incidents');
const { DEFAULTS } = require('./settings');
const forecast = require('../hardware/forecast');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.parse('2026-11-08T16:00:00Z'); // Monday 2026-11-09 00:00 Singapore time
const TOTAL_GB = 1000;
const DISK_START_GB = 412;
const HEALTH_EVERY_MINUTES = 5;
const ERROR_CHANCE = 1 / 60; // about one error line an hour
const WARN_CHANCE = 1 / 30; // and two warnings
const BURST = [3, 3, 3, 3, 2, 2, 1, 1]; // errors per minute of the planted burst: 14 in the first 5 minutes
const PROCESSES = ['server', 'kiosk'];
const TABLETS = [{ device_id: 'tablet-1', name: 'Tablet 1' }, { device_id: 'tablet-2', name: 'Tablet 2' }];
const PHONE = { device_id: 'phone-3f9c', name: null }; // opened the page once, never named: must never alarm

// day 1 is the Monday the world starts on; hour and minute are Singapore time
const at = (day, hour = 0, minute = 0) => START + (day - 1) * DAY + hour * HOUR + minute * MINUTE;
const iso = (ms) => new Date(ms).toISOString();
const round1 = (n) => Math.round(n * 10) / 10;
const clampInt = (value, min, max, fallback) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Seeded PRNG (mulberry32) so a seed always gives the same week
function makeRandom(seed) {
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    const int = (min, max) => min + Math.floor(next() * (max - min + 1));
    const pick = (list) => list[int(0, list.length - 1)];
    const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
    const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
    return { next, gauss, int, pick, hex, uuid };
}

// Message shapes with changing numbers, ids, paths and quotes, so detectors.templateOf has to do its job
const ERROR_SHAPES = [
    (r) => `Database query failed (code ${r.int(1000, 1300)}) after ${r.int(20, 900)} ms`,
    (r) => `Request ${r.uuid()} timed out after ${r.int(5000, 30000)} ms`,
    (r) => `Cannot open file "C:\\kiosk\\uploads\\photo-${r.int(1, 9999)}.jpg"`,
    (r) => `Email send failed for message a${r.hex(11)}: connection reset`,
    (r) => `Session ${r.int(100000, 999999)} expired for user ${r.int(1, 80)}`,
    (r) => `Tablet heartbeat rejected: unknown device ${r.uuid()}`
];
const WARN_SHAPES = [
    (r) => `Slow query: ${r.int(400, 1500)} ms for feedback list`,
    (r) => `Disk check took ${r.int(1200, 4000)} ms`,
    (r) => `Retrying upload ${r.int(1, 3)} of 3 for "photo-${r.int(1, 9999)}.jpg"`,
    (r) => `Clock drift ${r.int(1, 9)} seconds against the database`
];
const NEW_SHAPE = (r) => `Printer spooler not responding on port ${r.int(9000, 9999)}`;

// The faults. expect lists the incidents a fault may rightly cause, as [detector, kind, subject]; the first one is
// the detector the fault was planted for (a leak is a slow creep first, but hours later the memory is also far above
// normal and unusual for the hour: those incidents are the leak's too, not false alarms). A window is where such an
// incident may open: from windowStart (default: the start) to the end plus a grace in minutes. Faults that start
// after the world ends are left out.
function plannedFaults(days) {
    const worldEnd = START + days * DAY;
    const list = [
        { key: 'F1', title: 'CPU spike', expect: [['spike', 'high', 'cpu'], ['timeOfDay', 'unusual', 'cpu']], start: at(4, 14), end: at(4, 14, 25), grace: 0 },
        { key: 'F2', title: 'Memory leak', expect: [['drift', 'rising', 'memory'], ['spike', 'high', 'memory'], ['timeOfDay', 'unusual', 'memory']], start: at(5), end: at(5) + 36 * HOUR, grace: 60 },
        { key: 'F3', title: 'Disk filling', expect: [['disk', 'filling', null], ['disk', 'full', null], ['drift', 'rising', 'disk']], start: at(2), end: worldEnd, windowStart: at(3), grace: 0 },
        { key: 'F4', title: 'Database down', expect: [['services', 'down', 'database']], start: at(3, 9), end: at(3, 9, 12), grace: 15 },
        { key: 'F5', title: 'Tablet 2 offline', expect: [['tablets', 'offline', 'tablet-2']], start: at(6, 11), end: at(6, 11, 40), grace: 15 },
        { key: 'F6', title: 'Error burst', expect: [['logs', 'burst', null]], start: at(2, 16), end: at(2, 16, BURST.length), grace: 10 },
        { key: 'F7', title: 'New error shape', expect: [['logs', 'new', null]], start: at(6, 15, 30), end: at(6, 15, 31), grace: 15 }
    ];
    return list
        .filter((f) => f.start < worldEnd)
        .map((f) => ({ ...f, detector: f.expect[0][0], kind: f.expect[0][1], subject: f.expect[0][2], windowStart: f.windowStart || f.start, windowEnd: f.end + f.grace * MINUTE }));
}

// The synthetic world, one minute at a time: add(m) appends minute m (the arrays never hold the future, so the
// engine's input is a slice to the end). The same seed gives the same world whatever the tick step.
function createWorld(random, faults) {
    const F = Object.fromEntries(faults.map((f) => [f.key, f]));
    const active = (key, t) => F[key] !== undefined && t >= F[key].start && t < F[key].end;
    const world = {
        cpu: [], memory: [], gpu: [], disk: [], hourly: [], runs: [], events: [], eventMeta: [], heartbeats: [],
        byHour: Array.from({ length: 24 }, () => ({ cpu: [], memory: [], gpu: [] })), faults: F
    };
    const counts = { error: 0, warn: 0 };
    const shapeOf = (level, shapes) => {
        const n = counts[level]++;
        return n < 2 * shapes.length ? shapes[n % shapes.length] : random.pick(shapes); // every shape is seen on day 1
    };
    const percent = (v) => Math.min(100, Math.max(0, v));
    const beat = () => Math.max(0, Math.round(random.gauss(30, 20)));

    const addSample = (m, t) => {
        const hour = detectors.sgtHour(t);
        const weekday = detectors.sgtWeekday(t);
        const weekend = weekday === 0 || weekday === 6;
        const open = hour >= 10 && hour < 18;
        let cpu = open ? random.gauss(weekend ? 12 : 22, weekend ? 3 : 4) : random.gauss(6, 2);
        if (active('F1', t)) cpu = random.gauss(92, 3);
        const gpu = open && !weekend ? random.gauss(25, 4) : random.gauss(8, 2);
        const leak = active('F2', t) ? 0.6 * ((t - F.F2.start) / HOUR) : 0;
        const memory = 62 + 2 * Math.sin((2 * Math.PI * m) / 1440) + leak + random.gauss(0, 1.5);
        const filling = active('F3', t) ? 45 * ((t - F.F3.start) / DAY) : 0;
        const usedGb = DISK_START_GB + 0.05 * (m / 1440) + filling + random.gauss(0, 0.2);
        const point = { cpu: percent(cpu), memory: percent(memory), gpu: percent(gpu) };
        for (const metric of ['cpu', 'memory', 'gpu']) {
            const p = { t, v: point[metric] };
            world[metric].push(p);
            world.byHour[hour][metric].push(p);
        }
        world.disk.push({ t, v: percent((usedGb / TOTAL_GB) * 100), usedGb });
        if (m % 60 === 59) {
            const hourRows = world.disk.slice(-60);
            world.hourly.push({
                t: t - 59 * MINUTE,
                usedGb: hourRows.reduce((sum, p) => sum + p.usedGb, 0) / hourRows.length,
                percent: hourRows.reduce((sum, p) => sum + p.v, 0) / hourRows.length
            });
        }
        world.heartbeats.push([beat(), beat()]);
    };

    const addHealthRun = (t) => {
        const down = active('F4', t);
        world.runs.push({
            at: iso(t),
            results: [
                { key: 'database', status: down ? 'down' : 'ok', latencyMs: down ? null : Math.max(1, Math.round(random.gauss(18, 4))), summary: down ? 'connect ETIMEDOUT' : 'Connected' },
                { key: 'kiosk', status: 'ok', latencyMs: Math.max(1, Math.round(random.gauss(6, 2))), summary: 'Kiosk server answered' },
                { key: 'email', status: 'ok', latencyMs: Math.max(1, Math.round(random.gauss(300, 40))), summary: 'Mail login ok' }
            ]
        });
    };

    const addLogs = (t) => {
        const lines = [];
        const burst = active('F6', t) ? BURST[Math.floor((t - F.F6.start) / MINUTE)] || 0 : 0;
        for (let i = 0; i < burst; i++) lines.push({ level: 'error', message: ERROR_SHAPES[i % 2](random) });
        if (random.next() < ERROR_CHANCE) lines.push({ level: 'error', message: shapeOf('error', ERROR_SHAPES)(random) });
        if (random.next() < WARN_CHANCE) lines.push({ level: 'warn', message: shapeOf('warn', WARN_SHAPES)(random) });
        if (F.F7 && t === F.F7.start) lines.push({ level: 'error', message: NEW_SHAPE(random) });
        const seconds = lines.map(() => random.int(0, 59)).sort((a, b) => a - b);
        lines.forEach((line, i) => {
            const ms = t + seconds[i] * 1000;
            world.events.push({ at: iso(ms), process: random.pick(PROCESSES), level: line.level, message: line.message });
            world.eventMeta.push({ ms, template: detectors.templateOf(line.message) });
        });
    };

    world.add = (m) => {
        const t = START + m * MINUTE;
        addSample(m, t);
        if (m % HEALTH_EVERY_MINUTES === 0) addHealthRun(t);
        addLogs(t);
    };
    return world;
}

// What the engine's load() hands the detectors at minute m: the pinned input shape, cut from the world's arrays
// the way engine.js cuts it from the database and the recorder
function createInput(world) {
    const F = world.faults;
    let runStart = 0;
    let eventStart = 0;
    const known = new Set(); // templates of log lines older than 24 hours
    return (m) => {
        const t = START + m * MINUTE;
        const dayAgo = t - DAY;
        const from = Math.max(0, m - 1439);
        while (runStart < world.runs.length && Date.parse(world.runs[runStart].at) < dayAgo) runStart++;
        while (eventStart < world.events.length && world.eventMeta[eventStart].ms < dayAgo) known.add(world.eventMeta[eventStart++].template);
        const hour = detectors.sgtHour(t);
        const hourSeries = {};
        for (const metric of ['cpu', 'memory', 'gpu']) {
            const list = world.byHour[hour][metric];
            let k = 0;
            while (k < list.length && list[k].t < t - 14 * DAY) k++;
            hourSeries[metric] = list.slice(k);
        }
        const memory = world.memory.slice(from, m + 1);
        const [beat1, beat2] = world.heartbeats[m];
        const offline = F.F5 !== undefined && t >= F.F5.start && t < F.F5.end;
        return {
            now: t,
            intervalSeconds: 60,
            samples: { cpu: world.cpu.slice(from, m + 1), memory, gpu: world.gpu.slice(from, m + 1), disk: world.disk.slice(from, m + 1).map((p) => ({ t: p.t, v: p.v })) },
            hourSeries,
            driftSeries: {
                memory: forecast.bucketAverage(memory, 10 * MINUTE, ['v']),
                disk: world.hourly.slice(-7 * 24).map((p) => ({ t: p.t, v: p.percent }))
            },
            disk: { points: world.hourly.slice(-30 * 24).map((p) => ({ t: p.t, v: p.usedGb })), totalGb: TOTAL_GB, percent: world.disk[m].v },
            health: { runs: world.runs.slice(runStart) },
            tablets: {
                devices: [
                    { ...TABLETS[0], seconds_ago: beat1 },
                    { ...TABLETS[1], seconds_ago: offline ? Math.round((t - F.F5.start) / 1000) + 30 : beat2 },
                    { ...PHONE, seconds_ago: 7 * 86400 + Math.round((t - START) / 1000) }
                ]
            },
            logs: { events: world.events.slice(eventStart), known, historyHours: world.events.length ? (t - world.eventMeta[0].ms) / HOUR : 0 },
            quiet: false
        };
    };
}

const fits = (fault, row) => fault.expect.some(([detector, kind, subject]) => row.detector === detector && row.kind === kind && (subject === null || row.subject === subject));

// An incident is a true positive when it opened inside the window of a fault it fits; the first one per fault gives
// the time to detect. Everything else is a false positive (a false alarm).
function score(faults, rows, meta) {
    const first = new Map();
    const caughtBy = new Map();
    const list = rows.map((row) => {
        const opened = Date.parse(row.opened_at);
        const fault = faults.find((f) => opened >= f.windowStart && opened <= f.windowEnd && fits(f, row));
        if (fault && !first.has(fault.key)) first.set(fault.key, row);
        if (fault) caughtBy.set(fault.key, [...new Set([...(caughtBy.get(fault.key) || []), row.detector])]);
        return {
            id: row.id, detector: row.detector, kind: row.kind, subject: row.subject, fingerprint: row.fingerprint, severity: row.severity,
            title: row.title, opened_at: row.opened_at, resolved_at: row.resolved_at, occurrences: row.occurrences, matchedFault: fault ? fault.key : null
        };
    });
    const faultRows = faults.map((f) => {
        const hit = first.get(f.key) || null;
        return {
            key: f.key, title: f.title, detector: f.detector, kind: f.kind, subject: f.subject,
            startAt: iso(f.start), endAt: iso(f.end), windowStart: iso(f.windowStart), windowEnd: iso(f.windowEnd),
            detected: hit !== null, detectedAt: hit ? hit.opened_at : null,
            minutesToDetect: hit ? Math.round((Date.parse(hit.opened_at) - f.start) / MINUTE) : null, incidentId: hit ? hit.id : null,
            caughtBy: caughtBy.get(f.key) || []
        };
    });
    const truePositives = list.filter((i) => i.matchedFault !== null).length;
    const detected = faultRows.filter((f) => f.detected);
    return {
        ...meta,
        startAt: iso(START),
        endAt: iso(START + meta.days * DAY),
        faults: faultRows,
        incidents: list,
        truePositives,
        falsePositives: list.length - truePositives,
        falsePositiveList: list.filter((i) => i.matchedFault === null).map((i) => ({ title: i.title, detector: i.detector, kind: i.kind, opened_at: i.opened_at })),
        precision: list.length ? round1(truePositives / list.length * 1000) / 1000 : 1,
        recall: faultRows.length ? round1(detected.length / faultRows.length * 1000) / 1000 : 1,
        meanMinutesToDetect: detected.length ? round1(detected.reduce((sum, f) => sum + f.minutesToDetect, 0) / detected.length) : null
    };
}

// run({ seed, days, stepMinutes, settings, onProgress }) -> the scored week. Samples, health runs, heartbeats and
// logs arrive every minute whatever the step; the engine ticks every stepMinutes minutes. onProgress({ day, days,
// ticks, ms }) is called at the end of each simulated day.
async function run({ seed = 1, days = 7, stepMinutes = 1, settings = DEFAULTS, onProgress } = {}) {
    const started = Date.now();
    const seedValue = clampInt(seed, 0, 4294967295, 1);
    const dayCount = clampInt(days, 1, 31, 7);
    const step = clampInt(stepMinutes, 1, 60, 1);
    const faults = plannedFaults(dayCount);
    const world = createWorld(makeRandom(seedValue), faults);
    const inputAt = createInput(world);
    const store = incidents.memoryStore();
    let minute = 0;
    const engine = incidents.createEngine({
        store,
        detect: detectors.runAll,
        now: () => new Date(START + minute * MINUTE),
        settings: () => settings,
        load: () => inputAt(minute)
    });
    let ticks = 0;
    const total = dayCount * 24 * 60;
    for (let m = 0; m < total; m++) {
        world.add(m);
        if (m % step === 0) {
            minute = m;
            await engine.tick();
            ticks++;
        }
        if (onProgress && m % 1440 === 1439) onProgress({ day: (m + 1) / 1440, days: dayCount, ticks, ms: Date.now() - started });
    }
    const rows = (await store.list({ status: 'all', limit: incidents.LIST_MAX }))
        .sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at) || a.id - b.id);
    return score(faults, rows, { seed: seedValue, days: dayCount, stepMinutes: step, ticks, ms: Date.now() - started });
}

module.exports = { run, plannedFaults, makeRandom, START, ERROR_SHAPES, WARN_SHAPES, NEW_SHAPE };
// <Jun Kai end>
