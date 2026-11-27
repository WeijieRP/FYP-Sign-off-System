// Owner: Role 3, Jun Kai.
// Unit tests for the background health recorder, with fake checks and a fake database. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecorder, EMAIL_EVERY_MS, KEEP_RUNS_MS, PRUNE_EVERY_MS } = require('../../backend/features/aiops/healthRecorder');

const START = Date.parse('2026-11-11T06:00:00.000Z');
const EMAIL_OK = { key: 'email', label: 'Email (SMTP)', status: 'ok', summary: 'gmail login works, 900 ms', detail: { provider: 'gmail', sender: 'kiosk@example.com' }, latencyMs: 900 };

// checks and db that record what they were asked; dbError is a code (or a function of the SQL giving one)
function fakes({ email = EMAIL_OK, dbError = null, runAllError = null, settings = {} } = {}) {
    let clock = START;
    const calls = { runAll: [], email: 0, sql: [] };
    const checks = {
        async runAll(options) {
            calls.runAll.push(options);
            if (runAllError) throw new Error(runAllError);
            return {
                checkedAt: new Date(clock).toISOString(),
                checks: [
                    { key: 'database', label: 'MySQL database', status: 'ok', summary: 'MySQL 8 answered in 12 ms', detail: { host: 'localhost' }, latencyMs: 12.4 },
                    { key: 'kiosk', label: 'Kiosk server (:3003)', status: 'down', summary: 'x'.repeat(300), detail: { hint: 'start it' }, latencyMs: null }
                ]
            };
        },
        async checkEmail() {
            calls.email++;
            return email;
        }
    };
    const db = {
        run(sql, params, callback) {
            calls.sql.push({ sql, params });
            const code = typeof dbError === 'function' ? dbError(sql) : dbError;
            callback(code ? Object.assign(new Error(code), { code }) : null);
        }
    };
    const recorder = createRecorder({ checks: () => checks, db: () => db, now: () => clock, getSettings: () => settings });
    return { recorder, calls, advance: (ms) => { clock += ms; } };
}

// runs fn with a console that only records warn and debug lines
async function quietly(fn) {
    const original = { warn: console.warn, debug: console.debug, log: console.log };
    const printed = { warn: [], debug: [] };
    console.warn = (...args) => printed.warn.push(args.join(' '));
    console.debug = (...args) => printed.debug.push(args.join(' '));
    try { await fn(printed); }
    finally { Object.assign(console, original); }
    return printed;
}

test('the recorder loads without the database or the health checks', () => {
    const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, '/'));
    assert.deepEqual(loaded.filter((file) => /backend\/(core\/db|features\/health\/checks)\.js$/.test(file)), []);
});

test('a run keeps the results in memory and writes one row per result', async () => {
    const { recorder, calls } = fakes({ settings: { healthEverySeconds: 120, retentionDays: 7 } });
    const run = await recorder.runNow();
    assert.deepEqual(calls.runAll, [{ skip: ['email', 'ollama'] }]);
    assert.equal(run.at, '2026-11-11T06:00:00.000Z');
    assert.deepEqual(run.results.map((r) => r.key), ['database', 'kiosk', 'email'], 'the first run includes the mail login');
    assert.deepEqual(run.results[0], { key: 'database', status: 'ok', latencyMs: 12, summary: 'MySQL 8 answered in 12 ms', detail: { host: 'localhost' } });
    assert.equal(run.results[1].summary.length, 255);
    assert.equal(run.results[1].latencyMs, null);
    assert.deepEqual(recorder.runs(), [run]);
    assert.equal(recorder.latest('kiosk').status, 'down');
    assert.equal(recorder.latest('email').status, 'ok');
    assert.equal(recorder.latest('disk'), null);

    const insert = calls.sql.find((c) => c.sql.startsWith('INSERT INTO health_check_results'));
    const rows = insert.params[0];
    assert.equal(rows.length, 3);
    assert.ok(rows[0][0] instanceof Date, 'checked_at is a Date (the pool stores it as UTC)');
    assert.equal(rows[0][0].toISOString(), run.at);
    assert.deepEqual(rows[0].slice(1), ['database', 'ok', 12, 'MySQL 8 answered in 12 ms']);
    assert.equal(rows[1][4].length, 255);
    const prune = calls.sql.find((c) => c.sql.startsWith('DELETE FROM health_check_results'));
    assert.deepEqual(prune.params, [7], 'the retention comes from the settings');
    assert.deepEqual(recorder.getStatus(), { lastRunAt: run.at, lastError: null, runCount: 1 });
});

test('the mail login is checked every 30 minutes, and an account that is not set up is unknown', async () => {
    const notSetUp = { key: 'email', status: 'down', summary: 'Cannot log in to the mail server', detail: { sender: undefined, error: 'Gmail config missing user/pass' }, latencyMs: 3 };
    const { recorder, calls, advance } = fakes({ email: notSetUp });
    const first = await recorder.runNow();
    assert.equal(first.results.find((r) => r.key === 'email').status, 'unknown');
    advance(5 * 60 * 1000);
    const second = await recorder.runNow();
    assert.equal(second.results.some((r) => r.key === 'email'), false, 'no mail check 5 minutes later');
    assert.equal(recorder.latest('email').status, 'unknown', 'latest() looks back past runs without it');
    advance(EMAIL_EVERY_MS);
    const third = await recorder.runNow();
    assert.equal(third.results.some((r) => r.key === 'email'), true);
    assert.equal(calls.email, 2);

    const timedOut = { key: 'email', status: 'down', summary: 'Cannot reach the mail server', detail: { error: 'SMTP check timed out after 15000 ms' }, latencyMs: null };
    const other = fakes({ email: timedOut });
    assert.equal((await other.recorder.runNow()).results.find((r) => r.key === 'email').status, 'unknown', 'no sender in the detail counts as not set up');
    const loginFailed = { ...timedOut, detail: { sender: 'kiosk@example.com', error: 'Invalid login' } };
    const failing = fakes({ email: loginFailed });
    assert.equal((await failing.recorder.runNow()).results.find((r) => r.key === 'email').status, 'down');
});

test('a run is kept when the insert fails: a missing table is said once, a lost connection only in debug', async () => {
    const { recorder } = fakes({ dbError: 'ER_NO_SUCH_TABLE' });
    const printed = await quietly(async () => {
        await recorder.runNow();
        await recorder.runNow();
    });
    assert.equal(recorder.runs().length, 2);
    assert.deepEqual(printed.warn, ['[aiops] table health_check_results is missing: run npm run db:migrate']);
    assert.equal(recorder.getStatus().lastError, 'ER_NO_SUCH_TABLE');

    const lost = fakes({ dbError: 'ECONNREFUSED' });
    const quiet = await quietly(() => lost.recorder.runNow());
    assert.equal(lost.recorder.runs().length, 1);
    assert.deepEqual(quiet.warn, []);
    assert.ok(quiet.debug.length >= 1);
    assert.match(quiet.debug[0], /^\[aiops\] /);

    const broken = fakes({ runAllError: 'checks exploded' });
    const failed = await quietly(async () => {
        assert.equal(await broken.recorder.runNow(), null);
    });
    assert.deepEqual(failed.warn, ['[aiops] health run failed: checks exploded']);
    assert.deepEqual(broken.recorder.runs(), []);
    assert.equal(broken.recorder.getStatus().lastError, 'checks exploded');
});

test('a run that is still going is not started twice, and runs older than 24 hours are dropped', async () => {
    const { recorder, calls, advance } = fakes();
    const a = recorder.runNow();
    const b = recorder.runNow();
    assert.equal(a, b);
    await a;
    assert.equal(calls.runAll.length, 1);
    const c = recorder.runNow();
    assert.notEqual(c, a, 'the next call starts a new run');
    await c;
    advance(KEEP_RUNS_MS + 1000);
    await recorder.runNow();
    assert.equal(recorder.runs().length, 1, 'only the newest run is inside the 24 hours');
    assert.equal(recorder.getStatus().runCount, 3);
});

test('a new health check interval from the settings applies at once: a run within 5 seconds, then the new rhythm', async () => {
    const timers = [];
    const original = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, log: console.log };
    global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; };
    global.clearTimeout = () => {};
    console.log = () => {};
    try {
        const settings = { healthEverySeconds: 300 };
        const { recorder, calls } = fakes({ settings });
        recorder.applySettings({ healthEverySeconds: 60 });
        assert.equal(timers.length, 0, 'nothing happens before the recorder starts');
        recorder.start();
        assert.deepEqual(timers.map((x) => x.ms), [20000]);
        recorder.applySettings({ healthEverySeconds: 300 });
        assert.equal(timers.length, 1, 'the same interval changes nothing');
        settings.healthEverySeconds = 60;
        recorder.applySettings(settings);
        assert.deepEqual(timers.map((x) => x.ms), [20000, 5000], 'a run within 5 seconds');
        timers[1].fn();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(calls.runAll.length, 1);
        assert.equal(timers[timers.length - 1].ms, 60000, 'then every minute');
    } finally {
        Object.assign(global, { setTimeout: original.setTimeout, clearTimeout: original.clearTimeout });
        console.log = original.log;
    }
});

test('the prune runs once an hour', async () => {
    const { recorder, calls, advance } = fakes();
    const prunes = () => calls.sql.filter((c) => c.sql.startsWith('DELETE FROM')).length;
    await recorder.runNow();
    assert.equal(prunes(), 1);
    advance(5 * 60 * 1000);
    await recorder.runNow();
    assert.equal(prunes(), 1);
    advance(PRUNE_EVERY_MS);
    await recorder.runNow();
    assert.equal(prunes(), 2);
});
// <Jun Kai end>
