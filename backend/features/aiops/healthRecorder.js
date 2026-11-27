// Owner: Role 3, Jun Kai.
// Runs the System Health checks in the background (server.js only) so the anomaly detection has a history: every
// healthEverySeconds all checks except email and Ollama, the mail login every 30 minutes. The last 24 hours of runs
// stay in memory for the services detector; every result also goes into health_check_results, pruned to retentionDays.
// <Jun Kai start>
const settings = require('./settings');

const FIRST_RUN_DELAY_MS = 20 * 1000;
const SOON_MS = 5 * 1000;
const EMAIL_EVERY_MS = 30 * 60 * 1000;
const KEEP_RUNS_MS = 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const SKIP = ['email', 'ollama'];
const MISSING_TABLE = '[aiops] table health_check_results is missing: run npm run db:migrate';
// MySQL not reachable: the health page says so already, so the recorder only mentions it with LOG_LEVEL=debug
const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE',
    'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_CON_COUNT_ERROR']);

// checks and db come in as loaders (both open the database when required), so the tests can hand in fakes
function createRecorder({ checks, db, now = () => Date.now(), getSettings = () => ({}) }) {
    const state = {
        started: false, timer: null, every: 0, getSettings, runs: [], inFlight: null, emailDueAt: 0,
        lastRunAt: null, lastError: null, runCount: 0, lastPrune: 0, reported: new Set()
    };
    const run = (sql, params) => new Promise((resolve, reject) => db().run(sql, params, (err) => (err ? reject(err) : resolve())));
    const current = () => {
        try { return state.getSettings() || {}; }
        catch { return {}; }
    };
    const everySeconds = () => Number(current().healthEverySeconds) || settings.DEFAULTS.healthEverySeconds;
    const retentionDays = () => Number(current().retentionDays) || settings.DEFAULTS.retentionDays;

    function report(error, what) {
        const code = error.code || error.message || 'unknown';
        if (error.fatal || CONNECTION_CODES.has(code)) {
            console.debug(`[aiops] health results ${what} skipped: ${code}`);
            return;
        }
        if (state.reported.has(code)) return;
        state.reported.add(code);
        console.warn(code === 'ER_NO_SUCH_TABLE' ? MISSING_TABLE : `[aiops] health results ${what} failed: ${error.message}`);
    }

    // a mail account that is not set up is 'unknown' (nothing to watch), not 'down'
    const mailNotSetUp = (check) => (!!check.detail && !check.detail.sender) || /not set up/i.test(check.summary || '');
    function toResult(check) {
        return {
            key: check.key,
            status: check.key === 'email' && mailNotSetUp(check) ? 'unknown' : check.status,
            latencyMs: Number.isFinite(check.latencyMs) ? Math.round(check.latencyMs) : null,
            summary: typeof check.summary === 'string' ? check.summary.slice(0, 255) : '',
            detail: check.detail === undefined ? null : check.detail
        };
    }

    function trim() {
        const cutoff = now() - KEEP_RUNS_MS;
        while (state.runs.length && Date.parse(state.runs[0].at) < cutoff) state.runs.shift();
    }

    async function store(entry) {
        if (!entry.results.length) return;
        const checkedAt = new Date(entry.at);
        const rows = entry.results.map((r) => [checkedAt, r.key, r.status, r.latencyMs, r.summary]);
        try {
            await run('INSERT INTO health_check_results (checked_at, check_key, status, latency_ms, summary) VALUES ?', [rows]);
        } catch (error) {
            state.lastError = error.message;
            report(error, 'insert');
        }
    }

    async function prune() {
        if (now() - state.lastPrune < PRUNE_EVERY_MS) return;
        state.lastPrune = now();
        try {
            await run('DELETE FROM health_check_results WHERE checked_at < UTC_TIMESTAMP() - INTERVAL ? DAY', [retentionDays()]);
        } catch (error) {
            report(error, 'prune');
        }
    }

    async function doRun() {
        try {
            const emailDue = now() >= state.emailDueAt;
            if (emailDue) state.emailDueAt = now() + EMAIL_EVERY_MS;
            const [all, email] = await Promise.all([
                checks().runAll({ skip: SKIP }),
                emailDue ? Promise.resolve().then(() => checks().checkEmail()).catch(() => null) : null
            ]);
            const results = (all.checks || []).map(toResult);
            if (email) results.push(toResult(email));
            const at = Number.isNaN(Date.parse(all.checkedAt)) ? new Date(now()).toISOString() : all.checkedAt;
            const entry = { at, results };
            state.runs.push(entry);
            trim();
            state.lastRunAt = at;
            state.lastError = null;
            state.runCount++;
            await store(entry);
            await prune();
            return entry;
        } catch (error) {
            state.lastError = error.message;
            console.warn(`[aiops] health run failed: ${error.message}`);
            return null;
        }
    }

    // a run that is still going is handed back instead of started again
    function runNow() {
        if (!state.inFlight) state.inFlight = doRun().finally(() => { state.inFlight = null; });
        return state.inFlight;
    }

    function schedule(ms) {
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(tick, ms);
        if (state.timer.unref) state.timer.unref();
    }

    // the interval is read again after every run
    function tick() {
        const next = () => {
            state.every = everySeconds();
            schedule(state.every * 1000);
        };
        runNow().then(next, next);
    }

    // a new interval from the settings applies at once: a run within 5 s, then the new rhythm
    function applySettings(next) {
        const seconds = Number(next && next.healthEverySeconds) || settings.DEFAULTS.healthEverySeconds;
        if (!state.started || seconds === state.every) return;
        state.every = seconds;
        schedule(Math.min(seconds * 1000, SOON_MS));
    }

    function start(nextSettings) {
        if (state.started) return;
        state.started = true;
        if (typeof nextSettings === 'function') state.getSettings = nextSettings;
        state.every = everySeconds();
        schedule(FIRST_RUN_DELAY_MS);
        console.log(`[aiops] health recorder on: every ${everySeconds()} s, results kept ${retentionDays()} days`);
    }

    const runs = () => state.runs.slice();

    // the newest result of one check, looking back past runs that do not hold it (email is only checked every 30 min)
    function latest(key) {
        for (let i = state.runs.length - 1; i >= 0; i--) {
            const found = state.runs[i].results.find((r) => r.key === key);
            if (found) return found;
        }
        return null;
    }

    const getStatus = () => ({ lastRunAt: state.lastRunAt, lastError: state.lastError, runCount: state.runCount });

    return { start, applySettings, runNow, runs, latest, getStatus };
}

const recorder = createRecorder({
    checks: () => require('../health/checks'),
    db: () => require('../../core/db')
});

module.exports = { ...recorder, createRecorder, FIRST_RUN_DELAY_MS, EMAIL_EVERY_MS, KEEP_RUNS_MS, PRUNE_EVERY_MS };
// <Jun Kai end>
