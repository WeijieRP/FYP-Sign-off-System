// Owner: Role 3, Jun Kai.
// Unit tests for "Send a test incident" (backend/features/aiops/testIncidents.js and openTest in incidents.js): one
// incident with made up numbers, of a chosen kind with its real detector, that closes by itself after 10 minutes, never teaches the
// advisor, never tunes a detector and whose fix is only recorded. It replaced the Example incidents on 17 Nov 2026.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const incidents = require('../../backend/features/aiops/incidents');
const testIncidents = require('../../backend/features/aiops/testIncidents');
const fixes = require('../../backend/features/aiops/fixes');
const settings = require('../../backend/features/aiops/settings');
const playbooks = require('../../backend/features/aiops/playbooks');
const { createAdvisor } = require('../../backend/features/aiops/advisor');
const { createRunner } = require('../../backend/features/aiops/engine');

const NOW = new Date('2026-11-17T06:00:00Z');
const MINUTE = 60 * 1000;
const engineAt = (store, clock, conf = settings.DEFAULTS) => incidents.createEngine({
    store, now: () => new Date(clock.t), load: async () => ({}), detect: () => ({ anomalies: [], states: {}, notes: {} }), settings: () => conf
});

test('five kinds, each with its real detector, a "test:" fingerprint and a first line that says the numbers are made up', () => {
    assert.deepEqual(testIncidents.testKinds().map((k) => k.key), ['cpu', 'kiosk', 'disk', 'tablet', 'errors']);
    assert.ok(testIncidents.testKinds().every((k) => k.label && typeof k.label === 'string'));
    const detectorOf = { cpu: 'spike', kiosk: 'services', disk: 'disk', tablet: 'tablets', errors: 'logs' };
    for (const { key } of testIncidents.testKinds()) {
        const row = testIncidents.testIncident(key, NOW.getTime(), 'systemadmin');
        assert.equal(row.detector, detectorOf[key]);
        assert.ok(row.fingerprint.startsWith(`test:${key}:`));
        assert.ok(row.fingerprint.length <= 120);
        assert.match(row.explanation, /^Test opened by systemadmin: the numbers are made up, and it closes by itself after 10 minutes\. /);
        assert.equal(row.evidence.test, true);
        assert.ok(fixes.isTest(row));
        // the real help for its detector, not "nothing to do"
        assert.notEqual(playbooks.helpFor(row, null).action, 'none', `${key} gets real steps`);
    }
    assert.equal(testIncidents.testIncident('nope', NOW.getTime(), 'a'), null);
    assert.equal(testIncidents.testIncident('constructor', NOW.getTime(), 'a'), null, 'only its own kinds');
    assert.ok(testIncidents.testIncident('cpu', NOW.getTime(), 'a').evidence.points.length > 10, 'the CPU kind has a chart');
    assert.ok(fixes.isTest({ fingerprint: 'test:sample:abc', detector: 'test' }), 'the single test incident of before still counts');
    assert.equal(fixes.isTest({ fingerprint: 'spike:high:cpu', detector: 'spike' }), false);
});

test('openTest opens the chosen kind (CPU when none is given) and refuses a kind it does not know', async () => {
    const store = incidents.memoryStore();
    const engine = engineAt(store, { t: NOW.getTime() });
    const kiosk = await engine.openTest('systemadmin', 'kiosk');
    assert.deepEqual([kiosk.detector, kiosk.kind, kiosk.subject, kiosk.severity, kiosk.status], ['services', 'down', 'kiosk', 'critical', 'open']);
    assert.deepEqual((await store.events(kiosk.id)).map((e) => [e.type, e.detail.test]), [['opened', true]]);
    const plain = await engine.openTest('systemadmin');
    assert.equal(plain.detector, 'spike');
    await assert.rejects(engine.openTest('systemadmin', 'format-disk'), (error) => error.status === 400 && /cpu, kiosk, disk, tablet, errors/.test(error.message));
});

test('a check closes a test incident 10 minutes after it opened, even while its detector looks or is switched off', async () => {
    const store = incidents.memoryStore();
    const clock = { t: NOW.getTime() };
    const conf = { ...settings.DEFAULTS, clearAfterMinutes: 1 };
    const engine = incidents.createEngine({
        store, now: () => new Date(clock.t), load: async () => ({}), settings: () => conf,
        // the detector of the CPU kind is held (a fresh wake-up) and the tablets detector is switched off
        detect: () => ({ anomalies: [], states: {}, notes: {}, held: ['spike:'], closed: ['tablets:'] })
    });
    const cpu = await engine.openTest('a', 'cpu');
    const tablet = await engine.openTest('a', 'tablet');
    clock.t += 5 * MINUTE;
    await engine.tick();
    assert.equal((await store.listOpen()).length, 2, 'still open after 5 minutes');
    clock.t += 5 * MINUTE;
    await engine.tick();
    for (const id of [cpu.id, tablet.id]) {
        const after = await store.get(id);
        assert.deepEqual([after.status, after.resolved_by], ['resolved', 'auto']);
    }
});

test('test incidents never teach the advisor or tune a detector, but the advisor still answers them', async () => {
    const store = incidents.memoryStore();
    const clock = { t: NOW.getTime() };
    const engine = engineAt(store, clock);
    const kiosk = await engine.openTest('a', 'kiosk');
    await engine.setVerdict(kiosk.id, 'correct', 'a');
    await engine.resolve(kiosk.id, 'a', 'test');
    assert.deepEqual(await store.examples('services', 3, null), [], 'a Correct test is never an example for a real incident');
    assert.deepEqual(await store.verdicts('services', 0), []);

    let asked = 0;
    const cpu = await engine.openTest('a', 'cpu');
    const advisor = createAdvisor({ store, settings: () => settings.DEFAULTS, now: () => clock.t, ask: async () => { asked++; return { summary: 'Busy PC', causes: [{ cause: 'Another programme', likelihood: 'high' }], action: 'close-heavy-apps', why: 'x' }; } });
    assert.equal(await advisor.sweep(), 1);
    // it answers in the background: wait until its queue is empty
    for (let i = 0; i < 100 && (advisor.getStatus().busy !== null || advisor.getStatus().queued); i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(asked, 1);
    const advice = (await store.events(cpu.id)).find((e) => e.type === 'advice');
    assert.deepEqual([advice.detail.source, advice.detail.action, advice.detail.causes.length], ['llm', 'close-heavy-apps', 1], 'real causes and a real step');
});

test('the fix on a test "Kiosk server down" is only recorded, follows Offer fixes and never runs by itself', async () => {
    const store = incidents.memoryStore();
    const clock = { t: NOW.getTime() };
    const engine = engineAt(store, clock);
    const kiosk = await engine.openTest('systemadmin', 'kiosk');
    let started = 0;
    const conf = { ...settings.DEFAULTS, offerFixes: true, fixes: { 'start-kiosk': 'auto' } };
    const fixer = fixes.createFixer({ store, settings: () => conf, actions: { 'start-kiosk': async () => { started++; return { success: true }; } }, automation: () => 'off', now: () => new Date(clock.t) });
    const result = await fixer.run(kiosk.id, 'start-kiosk', 'systemadmin');
    assert.deepEqual([result.done, result.test], [true, true], 'answered at once, even with KIOSK_AUTOMATION=off');
    assert.equal(started, 0, 'nothing was started');
    const done = (await store.events(kiosk.id)).find((e) => e.type === 'fix-done');
    assert.equal(done.detail.message, 'Test incident: nothing was run');
    assert.equal(fixes.fixStatus({ lastFix: (await store.events(kiosk.id)).find((e) => e.type === 'fix'), lastDone: done, nowMs: clock.t }).test, true);
    assert.equal(fixes.autoDue(kiosk, 'auto', clock.t, 0), false, 'never by itself');
    conf.offerFixes = false;
    await assert.rejects(fixer.run(kiosk.id, 'start-kiosk', 'systemadmin'), (error) => error.status === 409);
    assert.equal(fixes.describeFix(kiosk, conf, fixer).offered, false, 'no fix card while fixes are switched off');
});

test('the SQL store deletes and counts only by an exact prefix, and leaves test incidents out of examples and verdicts', async () => {
    const calls = [];
    const db = {
        run: (sql, params, callback) => { calls.push({ sql, params }); callback(null, { affectedRows: 2, changes: 2 }); },
        get: (sql, params, callback) => { calls.push({ sql, params }); callback(null, { n: 7 }); },
        all: (sql, params, callback) => { calls.push({ sql, params }); callback(null, []); }
    };
    const store = incidents.sqlStore(db);
    assert.equal(await store.deleteByFingerprintPrefix('%'), 0);
    assert.equal(await store.deleteByFingerprintPrefix('exa_mple:'), 0);
    assert.equal(await store.countByFingerprintPrefix(''), 0);
    assert.equal(calls.length, 0, 'a pattern never reaches the database');
    await store.deleteByFingerprintPrefix('example:');
    assert.ok(calls.every((c) => c.params.includes('example:%')));
    assert.match(calls[0].sql, /DELETE FROM incident_events/, 'the timeline goes first');
    calls.length = 0;
    await store.examples('services', 3, null);
    await store.verdicts('services', 0);
    assert.ok(calls.every((c) => /fingerprint NOT LIKE \?/.test(c.sql) && c.params.includes('test:%')));
});

test('through the runner: the old example incidents go at start, and a verdict on a test incident tunes nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiops-tests-'));
    const writes = [];
    try {
        const store = incidents.memoryStore();
        const old = await store.insert({ fingerprint: 'example:cpu:abc', detector: 'spike', kind: 'high', subject: 'cpu', severity: 'warn', status: 'open', title: 'Old example', opened_at: NOW, last_seen_at: NOW });
        await store.addEvent(old, 'opened', {}, NOW);
        const runner = createRunner({
            db: () => ({ all: (sql, params, callback) => callback(null, []) }),
            store: () => store,
            recorder: () => ({ start() {}, runs: () => [], getStatus: () => ({}) }),
            hardware: () => ({ read: () => ({ intervalSeconds: 60 }) }),
            control: () => ({ readModeConfig: () => ({ mode: 'manual' }), readSchedulesConfig: () => ({ schedules: [] }) }),
            policies: () => ({ status: () => ({ on: true }) }),
            tabletNames: () => ({ all: () => ({}) }),
            settings: () => settings.DEFAULTS,
            learning: { read: () => ({}), write: (state) => writes.push(state) },
            audit: () => {},
            files: () => [path.join(dir, 'a.jsonl'), path.join(dir, 'b.jsonl')],
            now: () => NOW
        });
        const original = console.log;
        console.log = () => {};
        try {
            runner.start();
            for (let i = 0; i < 5 && (await store.countByFingerprintPrefix('example:')); i++) await new Promise((resolve) => setImmediate(resolve));
        } finally { console.log = original; }
        assert.equal(await store.countByFingerprintPrefix('example:'), 0, 'the example incidents are gone');
        const cpu = await runner.openTest('systemadmin', 'cpu');
        for (let i = 0; i < 4; i++) await runner.setVerdict(cpu.id, 'false-alarm', 'systemadmin');
        assert.deepEqual(writes, [], 'no sensitivity step');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
// <Jun Kai end>
