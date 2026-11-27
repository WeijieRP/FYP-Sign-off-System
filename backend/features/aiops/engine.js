// Owner: Role 3, Jun Kai.
// Runs the anomaly detection in backend/server.js: every intervalSeconds it loads the last day of hardware samples,
// the health recorder's runs, the named tablets and the new log lines, hands them to the incident engine
// (incidents.js over the SQL store) and keeps the status the System Health page shows. The master switch in the
// settings turns the detection off; the advisor keeps its own switch.
// <Jun Kai start>
const settings = require('./settings');
const detectors = require('./detectors');
const incidents = require('./incidents');
const input = require('./input');
const log = require('../../core/log');
const { createLogReader } = require('./logReader');
const { createAdvisor } = require('./advisor');
const learning = require('./learning');
const fixes = require('./fixes');

const FIRST_TICK_DELAY_MS = 90 * 1000;
const SOON_MS = 5 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const RESUME_GAP_MS = 5 * 60 * 1000; // a longer pause between two checks means the PC was asleep
const MISSING_TABLES = 'Tables missing: run npm run db:migrate';
const SAMPLE_COLUMNS = 'UNIX_TIMESTAMP(sampled_at) * 1000 AS t, cpu_percent AS cpu, memory_percent AS memory, gpu_percent AS gpu, disk_percent AS disk';

const round1 = (n) => Math.round(n * 10) / 10;

// The modules that open the database or read files come in as loaders (like the health recorder), so requiring
// this file connects to nothing and a script can hand in fakes.
function createRunner(overrides = {}) {
    const d = {
        db: () => require('../../core/db'),
        recorder: () => require('./healthRecorder'),
        hardware: () => require('../hardware/settings'),
        control: () => require('../serverControl/control'),
        policies: () => require('../serverControl/policies'),
        tabletNames: () => require('../health/tabletNames'),
        settings: () => settings.read(),
        audit: (action, by, id) => require('../../core/audit').logAudit(action, by, 'incident', id, null),
        files: () => [log.eventFile('server'), log.eventFile('kiosk')],
        now: () => new Date(),
        ...overrides
    };
    const state = {
        started: false, timer: null, intervalSeconds: settings.DEFAULTS.intervalSeconds,
        lastTickAt: null, nextTickAt: null, lastResult: null, lastError: null,
        states: {}, notes: {}, sampleHours: 0, namedTablets: 0, lastPrune: 0, logged: new Set(),
        // awakeSince: when the server started or the PC last woke up; quietEndedAt: when quiet hours last ended
        awakeSince: d.now().getTime(), lastTickMs: null, quietWas: false, quietEndedAt: 0
    };
    const reader = createLogReader(d.files(), { now: () => d.now().getTime() });
    const current = () => d.settings();

    // a missing table (before npm run db:migrate) is marked the way the SQL store marks its own
    const tag = (error) => {
        if (error && error.code === 'ER_NO_SUCH_TABLE') error.missingTable = true;
        return error;
    };
    const all = (sql, params) => new Promise((resolve, reject) => {
        d.db().all(sql, params, (error, rows) => (error ? reject(tag(error)) : resolve(rows || [])));
    });
    const store = d.store ? d.store() : incidents.sqlStore({
        get: (...args) => d.db().get(...args),
        all: (...args) => d.db().all(...args),
        run: (...args) => d.db().run(...args)
    });

    // AIOps part 2: explains each open incident in the background (local LLM, or rules when it is not there)
    const advisor = d.advisor ? d.advisor(store, current) : createAdvisor({ store, settings: current });

    // whether the kiosk is meant to run now: always in manual mode, in automatic mode only while a policy keeps it on
    // (when this cannot be read, nothing is started by itself)
    function kioskWanted(now) {
        try {
            if (d.control().readModeConfig().mode !== 'auto') return true;
            return !!d.policies().status(d.control().readSchedulesConfig().schedules, now).on;
        } catch {
            return false;
        }
    }

    // the fixes the app can do itself, behind an admin's approval (fixes.js); the start is the one Server Schedule uses,
    // and the last start attempt is shared with the policies so the two never start the kiosk twice in a row. An
    // automatic start first checks the kiosk is still down, and waits while the policies keep the kiosk off.
    const fixer = d.fixer ? d.fixer(store, current) : fixes.createFixer({
        store,
        settings: current,
        actions: { 'start-kiosk': () => new Promise((resolve) => d.control().startKiosk(resolve)) },
        stillNeeded: { 'start-kiosk': () => new Promise((resolve) => d.control().resolveKioskStatus((status) => resolve(!(status && status.running)))) },
        allowAuto: () => kioskWanted(d.now()),
        lastAttempt: () => d.control().lastStartAttempt(),
        noteAttempt: (at) => d.control().noteStartAttempt(at),
        gapMs: () => d.control().START_GAP_MS,
        audit: d.audit,
        now: d.now
    });

    // In AUTO mode while the policies say the kiosk is off, the kiosk and tablet detectors are muted
    function quietNow(now, conf) {
        if (!conf.quietHours) return false;
        try {
            if (d.control().readModeConfig().mode !== 'auto') return false;
            return !d.policies().status(d.control().readSchedulesConfig().schedules, now).on;
        } catch {
            return false;
        }
    }

    // every tablet that ever reported, with the name an admin gave it (only named ones are watched) and how long
    // ago it last reported; read fresh at every check. No heartbeat table yet (before db:migrate) means no tablets.
    async function loadDevices() {
        try {
            const rows = await all('SELECT device_id, TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago FROM device_heartbeats ORDER BY last_seen DESC LIMIT 200', []);
            const names = d.tabletNames().all() || {};
            return rows.map((row) => ({ device_id: row.device_id, name: names[row.device_id] || null, seconds_ago: Number(row.seconds_ago) }));
        } catch (error) {
            if (error && error.missingTable) return [];
            throw error;
        }
    }

    // means per bucket, the same FLOOR(UNIX_TIMESTAMP / n) * n pattern as the Hardware graphs; t in ms
    const means = (column, bucketSeconds, secondsBack) => all(
        `SELECT FLOOR(UNIX_TIMESTAMP(sampled_at) / ?) * ? * 1000 AS t, AVG(${column}) AS v
         FROM hardware_samples
         WHERE sampled_at >= UTC_TIMESTAMP() - INTERVAL ? SECOND
         GROUP BY t ORDER BY t`,
        [bucketSeconds, bucketSeconds, secondsBack]
    );

    // everything one tick looks at; sampled_at is UTC and the hour filter converts to Singapore time
    async function loadInput() {
        const now = d.now();
        const conf = current();
        const [rows, hourRows, memoryBuckets, diskBuckets, diskPoints, latest, devices] = await Promise.all([
            all(`SELECT ${SAMPLE_COLUMNS} FROM hardware_samples WHERE sampled_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY ORDER BY sampled_at`, []),
            all(`SELECT ${SAMPLE_COLUMNS} FROM hardware_samples WHERE sampled_at >= UTC_TIMESTAMP() - INTERVAL 14 DAY AND HOUR(CONVERT_TZ(sampled_at, '+00:00', '+08:00')) = ? ORDER BY sampled_at`, [detectors.sgtHour(now)]),
            means('memory_percent', 600, DAY / 1000),
            means('disk_percent', 3600, (7 * DAY) / 1000),
            means('disk_used_gb', 3600, (30 * DAY) / 1000),
            all('SELECT disk_percent AS percent, disk_total_gb AS totalGb FROM hardware_samples ORDER BY sampled_at DESC LIMIT 1', []),
            loadDevices()
        ]);
        reader.readNew();
        state.sampleHours = input.spanHours(rows);
        state.namedTablets = detectors.namedTablets(devices).length;
        const nowMs = now.getTime();
        const quiet = quietNow(now, conf);
        if (state.quietWas && !quiet) state.quietEndedAt = nowMs;
        state.quietWas = quiet;
        return input.assembleInput({
            now: nowMs,
            intervalSeconds: d.hardware().read().intervalSeconds,
            rows, hourRows, memoryBuckets, diskBuckets, diskPoints,
            totalGb: latest[0] ? latest[0].totalGb : null,
            percent: latest[0] ? latest[0].percent : null,
            runs: d.recorder().runs(),
            devices,
            events: reader.events(24),
            known: reader.known(nowMs - DAY),
            historyHours: reader.historyHours(),
            quiet,
            awakeSeconds: (nowMs - state.awakeSince) / 1000,
            watchSeconds: (nowMs - Math.max(state.awakeSince, state.quietEndedAt)) / 1000
        });
    }

    // the detectors run with the levels learned from the verdicts (learning.js); everything else reads the saved settings
    const learned = d.learning ? d.learning : { read: learning.read, write: learning.write };
    const effective = () => learning.apply(current(), learned.read());
    const engine = incidents.createEngine({ store, settings: effective, load: loadInput, audit: d.audit, now: d.now });

    // a verdict may make its detector one step less (or again more) sensitive
    async function learnFrom(detector) {
        if (!detector || !settings.DETECTORS.some((x) => x.key === detector) || current().learnFromVerdicts === false) return null;
        const nowMs = d.now().getTime();
        const rule = learning.ruleOf(current());
        const rows = await store.verdicts(detector, nowMs - rule.windowDays * DAY);
        const state = learned.read();
        const before = state[detector];
        const step = learning.learnStep(rows.map((r) => ({ verdict: r.verdict, at: Date.parse(r.verdict_at) })), before, nowMs, rule);
        if (!step.changed) return null;
        if (step.offset === 0) delete state[detector];
        else state[detector] = { offset: step.offset, countedAt: step.countedAt, reason: step.reason, at: new Date(nowMs).toISOString() };
        learned.write(state);
        const label = settings.DETECTORS.find((x) => x.key === detector).label;
        console.log(`[aiops] learning: "${label}" is now ${step.offset < ((before && before.offset) || 0) ? 'less' : 'more'} sensitive (${step.reason})`);
        return step;
    }

    async function setVerdict(id, verdict, by) {
        const incident = await engine.setVerdict(id, verdict, by);
        // a test incident's verdict is only recorded on it: it never tunes a detector
        if (incident && !fixes.isTest(incident)) await learnFrom(incident.detector).catch((error) => logOnce(`learning: ${error.message}`));
        return incident;
    }

    const runFix = (id, fixKey, by) => fixer.run(id, fixKey, by);

    function logOnce(message) {
        if (state.logged.has(message)) return;
        state.logged.add(message);
        console.warn(`[aiops] check failed: ${message}`);
    }

    // once an hour: resolved incidents older than keepIncidentsDays go, with their timeline
    async function prune(nowMs, conf) {
        if (nowMs - state.lastPrune < PRUNE_EVERY_MS) return;
        state.lastPrune = nowMs;
        await store.prune(nowMs - (Number(conf.keepIncidentsDays) || settings.DEFAULTS.keepIncidentsDays) * DAY);
    }

    // one check; the error stays in lastError for the status (and is thrown to run-now)
    async function runTick() {
        const now = d.now();
        const nowMs = now.getTime();
        // timers stand still while the PC hibernates, so a long pause since the last check means it just woke up
        if (state.lastTickMs !== null && nowMs - state.lastTickMs > Math.max(RESUME_GAP_MS, 3 * state.intervalSeconds * 1000)) state.awakeSince = nowMs;
        state.lastTickMs = nowMs;
        state.lastTickAt = now.toISOString();
        try {
            const result = await engine.tick();
            if (!result.skipped) {
                state.states = result.states || {};
                state.notes = result.notes || {};
            }
            state.lastResult = { at: result.at, skipped: result.skipped, anomalies: result.anomalies, opened: result.opened, merged: result.merged, resolved: result.resolved };
            // new or changed incidents get advice; it runs in the background so the check does not wait for the model.
            // Also while Anomaly detection is off: the advisor has its own switch
            advisor.sweep().catch((error) => logOnce(`advisor: ${error.message}`));
            // fixes an admin made automatic in the settings (the kiosk start itself runs in the background)
            if (!result.skipped) await fixer.sweep().catch((error) => logOnce(`fixes: ${error.message}`));
            await prune(now.getTime(), current());
            state.lastError = null;
            return result;
        } catch (error) {
            state.lastError = error && error.missingTable ? MISSING_TABLES : error && error.message ? error.message : 'unknown error';
            logOnce(state.lastError);
            throw error;
        }
    }

    function schedule(ms) {
        if (state.timer) clearTimeout(state.timer);
        state.nextTickAt = new Date(d.now().getTime() + ms).toISOString();
        state.timer = setTimeout(tick, ms);
        if (state.timer.unref) state.timer.unref();
    }

    // the timer's tick never throws; the next one is set either way
    function tick() {
        const next = () => schedule(state.intervalSeconds * 1000);
        runTick().then(next, next);
    }

    // a new interval takes effect at once (a check within 5 s, then the new rhythm); the health checks' too
    function applySettings(next) {
        const interval = Number(next && next.intervalSeconds) || settings.DEFAULTS.intervalSeconds;
        const changed = interval !== state.intervalSeconds;
        state.intervalSeconds = interval;
        if (state.started && changed) schedule(Math.min(interval * 1000, SOON_MS));
        const recorder = state.started && d.recorder ? d.recorder() : null;
        if (recorder && typeof recorder.applySettings === 'function') recorder.applySettings(next);
    }

    function start() {
        if (state.started) return;
        state.started = true;
        const conf = current();
        state.intervalSeconds = Number(conf.intervalSeconds) || settings.DEFAULTS.intervalSeconds;
        state.awakeSince = d.now().getTime();
        d.recorder().start(current);
        reader.load();
        // the seven Example incidents were replaced by Send a test incident (17 Nov 2026): any left in the tables go once
        Promise.resolve().then(() => store.deleteByFingerprintPrefix('example:'))
            .then((removed) => { if (removed) console.log(`[aiops] removed ${removed} old example incident(s): test incidents replace them`); })
            .catch(() => { /* the tables may not exist yet (npm run db:migrate): nothing to remove */ });
        schedule(FIRST_TICK_DELAY_MS);
        console.log(conf.enabled
            ? `[aiops] anomaly detection on: a check every ${state.intervalSeconds} s, the first in ${FIRST_TICK_DELAY_MS / 1000} s`
            : '[aiops] anomaly detection is switched off in its settings; nothing is checked until it is turned on');
    }

    function getStatus() {
        const conf = current();
        const learnedState = conf.learnFromVerdicts !== false ? learned.read() : {};
        const detectorList = settings.DETECTORS.map(({ key, label, description }) => {
            const own = conf.detectors[key];
            const off = !conf.enabled || !own.enabled;
            const detectorState = off ? 'off' : state.states[key] || 'waiting';
            let note = state.notes[key] || null;
            if (!conf.enabled) note = 'Anomaly detection is off';
            else if (!own.enabled) note = 'Switched off';
            else if (detectorState === 'waiting') note = 'Waiting for the first check';
            const learnedStep = learnedState[key];
            const offset = learnedStep ? learning.clampOffset(learnedStep.offset, learning.ruleOf(conf)) : 0;
            const tuned = offset ? { offset, sensitivity: learning.effectiveSensitivity(own.sensitivity, offset), reason: learnedStep.reason, at: learnedStep.at } : null;
            return { key, label, description, enabled: own.enabled, sensitivity: own.sensitivity, state: detectorState, note, tuned };
        });
        return {
            enabled: conf.enabled,
            intervalSeconds: state.intervalSeconds,
            learnFromVerdicts: conf.learnFromVerdicts !== false,
            lastTickAt: state.lastTickAt,
            nextTickAt: state.nextTickAt,
            lastResult: state.lastResult,
            lastError: state.lastError,
            detectors: detectorList,
            data: {
                sampleHours: state.sampleHours,
                healthRuns: d.recorder().runs().length,
                logHours: round1(reader.historyHours()),
                namedTablets: state.namedTablets
            },
            quietNow: quietNow(d.now(), conf),
            recorder: d.recorder().getStatus(),
            advisor: advisor.getStatus()
        };
    }

    // the numbers on the Incidents card; "today" is the Singapore date
    async function counts() {
        const rows = await all(
            `SELECT SUM(status = 'open') AS open_count, SUM(status = 'open' AND severity = 'critical') AS critical_count,
                    SUM(status = 'acknowledged') AS acknowledged_count,
                    SUM(status = 'resolved' AND DATE(CONVERT_TZ(resolved_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))) AS resolved_today
             FROM incidents`,
            []
        );
        const row = rows[0] || {};
        // critical: how many of the open ones are critical (the sidebar count turns red)
        return { open: Number(row.open_count) || 0, critical: Number(row.critical_count) || 0, acknowledged: Number(row.acknowledged_count) || 0, resolvedToday: Number(row.resolved_today) || 0 };
    }

    return {
        start, getStatus, runNow: runTick, applySettings, counts, store, advisor, fixer,
        acknowledge: engine.acknowledge, resolve: engine.resolve, setVerdict, openTest: engine.openTest, learnFrom,
        runFix
    };
}

const runner = createRunner();

module.exports = { ...runner, createRunner, FIRST_TICK_DELAY_MS, MISSING_TABLES };
// <Jun Kai end>
