// Owner: Role 3, Jun Kai.
// Unit tests for the incident engine behind anomaly detection: the memory store, a fake clock and planted anomalies,
// plus the SQL store against a fake db that records its statements. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const incidents = require('../../backend/features/aiops/incidents');

const START = Date.parse('2026-11-11T02:00:00Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const at = (offsetMs) => new Date(START + offsetMs).toISOString();

const anomaly = (over = {}) => {
    const detector = over.detector || 'spike';
    const kind = over.kind || 'cpu';
    const subject = over.subject === undefined ? null : over.subject;
    return {
        detector, kind, subject,
        fingerprint: `${detector}:${kind}:${subject || '-'}`,
        severity: 'warn',
        title: 'CPU far above the last 24 hours',
        explanation: 'CPU at 91 %; the usual for the last 24 hours is 12 %.',
        evidence: { metric: 'cpu', value: 91, baseline: 12, z: 5.1, unit: '%', points: [{ t: START, v: 91 }] },
        ...over
    };
};

// an engine on the memory store with a clock the test moves and anomalies the test plants
function setup(overrides = {}) {
    let t = START;
    const settings = { enabled: true, cooldownMinutes: 30, clearAfterMinutes: 10, ...overrides };
    const store = incidents.memoryStore();
    const calls = { load: 0, detect: 0 };
    const audits = [];
    let planted = [];
    let extra = {};
    const engine = incidents.createEngine({
        store,
        now: () => new Date(t),
        settings: () => settings,
        load: async () => { calls.load++; return { fake: true }; },
        detect: (input, current) => {
            calls.detect++;
            assert.equal(input.fake, true, 'detect gets what load returned');
            assert.equal(current, settings, 'detect gets the settings of this tick');
            return { anomalies: planted, states: { spike: 'ok' }, notes: { spike: 'fine' }, ...extra };
        },
        audit: (action, by, id) => audits.push({ action, by, id })
    });
    return {
        engine, store, settings, calls, audits,
        plant: (...list) => { planted = list; },
        also: (more) => { extra = more; },
        advance: (ms) => { t += ms; }
    };
}

// one incident straight into the store, for the list and prune tests
const seed = (store, fields) => store.insert({
    fingerprint: 'spike:cpu:-', detector: 'spike', kind: 'cpu', subject: null, severity: 'warn', status: 'open',
    title: 'CPU high', explanation: null, evidence: null, opened_at: at(0), last_seen_at: at(0), occurrences: 1, ...fields
});

test('tick opens one incident per new fingerprint and writes the opened event', async () => {
    const { engine, store, plant } = setup();
    plant(anomaly(), anomaly({ kind: 'memory', severity: 'critical' }), anomaly({ kind: 'memory', severity: 'warn' }));
    const result = await engine.tick();
    assert.equal(result.skipped, null);
    assert.equal(result.at, at(0));
    assert.deepEqual([result.anomalies, result.opened, result.merged, result.resolved], [3, 2, 0, 0]);
    assert.deepEqual(result.states, { spike: 'ok' });
    assert.deepEqual(result.notes, { spike: 'fine' });

    const open = await store.list({ status: 'open' });
    assert.equal(open.length, 2, 'the two memory anomalies share a fingerprint');
    assert.equal(open.find((i) => i.kind === 'memory').severity, 'critical', 'the highest severity wins inside one tick');
    const cpu = open.find((i) => i.kind === 'cpu');
    assert.equal(cpu.fingerprint, 'spike:cpu:-');
    assert.equal(cpu.status, 'open');
    assert.equal(cpu.occurrences, 1);
    assert.equal(cpu.opened_at, at(0));
    assert.equal(cpu.last_seen_at, at(0));
    assert.equal(cpu.title, 'CPU far above the last 24 hours');
    assert.deepEqual(cpu.evidence, anomaly().evidence);
    assert.deepEqual([cpu.acknowledged_at, cpu.acknowledged_by, cpu.resolved_at, cpu.resolved_by, cpu.resolve_note, cpu.verdict], [null, null, null, null, null, null]);
    assert.deepEqual((await store.events(cpu.id)).map((e) => [e.type, e.detail, e.at]), [['opened', { severity: 'warn', title: 'CPU far above the last 24 hours' }, at(0)]]);
});

test('an unknown severity counts as warn and long titles, subjects and fingerprints are cut', async () => {
    const { engine, store, plant } = setup();
    plant(anomaly({ severity: 'huge', title: 'x'.repeat(250), subject: 'y'.repeat(150), fingerprint: 'spike:cpu:' + 'y'.repeat(150) }));
    await engine.tick();
    const [incident] = await store.list();
    assert.equal(incident.severity, 'warn');
    assert.equal(incident.title.length, 200);
    assert.equal(incident.subject.length, 120);
    assert.equal(incident.fingerprint.length, 120);
});

test('the same fingerprint next tick merges, with a seen event every 10 minutes at most', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    advance(MINUTE);
    const result = await engine.tick();
    assert.deepEqual([result.opened, result.merged, result.resolved], [0, 1, 0]);
    let open = await store.list();
    assert.equal(open.length, 1, 'no second incident');
    assert.equal(open[0].occurrences, 2);
    assert.equal(open[0].opened_at, at(0));
    assert.equal(open[0].last_seen_at, at(MINUTE));
    assert.deepEqual((await store.events(open[0].id)).map((e) => e.type), ['opened'], 'no seen event one minute after opening');

    for (let minute = 2; minute <= 20; minute++) {
        advance(MINUTE);
        await engine.tick();
    }
    open = await store.list();
    assert.equal(open[0].occurrences, 21);
    const seen = (await store.events(open[0].id)).filter((e) => e.type === 'seen');
    assert.deepEqual(seen.map((e) => e.at), [at(10 * MINUTE), at(20 * MINUTE)]);
    assert.deepEqual(seen[0].detail, { occurrences: 11, value: 91 });

    // after the first hour: once an hour
    for (let minute = 21; minute <= 200; minute++) {
        advance(MINUTE);
        await engine.tick();
    }
    const later = (await store.events(open[0].id)).filter((e) => e.type === 'seen').map((e) => e.at);
    assert.deepEqual(later, [at(10 * MINUTE), at(20 * MINUTE), at(30 * MINUTE), at(40 * MINUTE), at(50 * MINUTE), at(110 * MINUTE), at(170 * MINUTE)]);
});

test('severity goes up with a severity event and never comes down', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly({ severity: 'warn' }));
    await engine.tick();
    plant(anomaly({ severity: 'critical' }));
    advance(MINUTE);
    await engine.tick();
    let [incident] = await store.list();
    assert.equal(incident.severity, 'critical');
    assert.deepEqual((await store.events(incident.id)).map((e) => [e.type, e.detail]), [['opened', { severity: 'warn', title: 'CPU far above the last 24 hours' }], ['severity', { from: 'warn', to: 'critical' }]]);

    plant(anomaly({ severity: 'info' }));
    advance(MINUTE);
    await engine.tick();
    [incident] = await store.list();
    assert.equal(incident.severity, 'critical');
    assert.equal((await store.events(incident.id)).filter((e) => e.type === 'severity').length, 1);
});

test('an anomaly that stops is auto-resolved after clearAfterMinutes', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    plant();
    advance(9 * MINUTE);
    let result = await engine.tick();
    assert.equal(result.resolved, 0);
    assert.equal((await store.list()).length, 1, 'still open before the clear time');

    advance(MINUTE);
    result = await engine.tick();
    assert.equal(result.resolved, 1);
    assert.equal((await store.list()).length, 0);
    const [incident] = await store.list({ status: 'resolved' });
    assert.equal(incident.status, 'resolved');
    assert.equal(incident.resolved_by, 'auto');
    assert.equal(incident.resolved_at, at(10 * MINUTE));
    assert.equal(incident.resolve_note, null);
    const events = await store.events(incident.id);
    assert.deepEqual([events.at(-1).type, events.at(-1).detail], ['resolved', { auto: true }]);
});

test('an anomaly back within the cooldown reopens the same incident and keeps the verdict', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    const [opened] = await store.list();
    await engine.setVerdict(opened.id, 'correct', 'systemadmin');
    plant();
    advance(10 * MINUTE);
    await engine.tick();
    assert.equal((await store.get(opened.id)).status, 'resolved');

    advance(5 * MINUTE);
    plant(anomaly({ severity: 'critical' }));
    const result = await engine.tick();
    assert.deepEqual([result.opened, result.merged], [1, 0]);
    const open = await store.list();
    assert.equal(open.length, 1);
    const incident = open[0];
    assert.equal(incident.id, opened.id, 'the same incident, not a new one');
    assert.equal(incident.status, 'open');
    assert.deepEqual([incident.resolved_at, incident.resolved_by, incident.resolve_note], [null, null, null]);
    assert.equal(incident.verdict, 'correct');
    assert.equal(incident.verdict_by, 'systemadmin');
    assert.equal(incident.occurrences, 2);
    assert.equal(incident.severity, 'critical');
    assert.equal(incident.last_seen_at, at(15 * MINUTE));
    const events = await store.events(incident.id);
    assert.deepEqual([events.at(-1).type, events.at(-1).detail], ['reopened', { severity: 'critical', title: 'CPU far above the last 24 hours' }]);
    assert.equal((await store.list({ status: 'resolved' })).length, 0);
});

test('the incident shows the worst state seen: a higher value or severity replaces the text, a lower one does not', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    advance(MINUTE);
    plant(anomaly({ title: 'CPU at 97 %', explanation: 'worse', evidence: { metric: 'cpu', value: 97, unit: '%' } }));
    await engine.tick();
    let [incident] = await store.list();
    assert.deepEqual([incident.title, incident.explanation, incident.evidence.value], ['CPU at 97 %', 'worse', 97]);

    advance(MINUTE);
    plant(anomaly({ title: 'CPU at 70 %', explanation: 'easing', evidence: { metric: 'cpu', value: 70, unit: '%' } }));
    await engine.tick();
    [incident] = await store.list();
    assert.deepEqual([incident.title, incident.evidence.value, incident.occurrences], ['CPU at 97 %', 97, 3], 'a lower reading keeps the worst one on show');

    advance(MINUTE);
    plant(anomaly({ severity: 'critical', title: 'CPU at 65 %, now critical', explanation: 'raised', evidence: { metric: 'cpu', value: 65, unit: '%' } }));
    await engine.tick();
    [incident] = await store.list();
    assert.deepEqual([incident.severity, incident.title], ['critical', 'CPU at 65 %, now critical'], 'a higher severity always brings its own text');
    assert.equal((await store.events(incident.id))[0].detail.title, 'CPU far above the last 24 hours', 'the timeline keeps the first title');
});

test('a reopened incident takes the text and the severity of the new episode', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly({ severity: 'critical', title: 'CPU at 99 %', evidence: { metric: 'cpu', value: 99, unit: '%' } }));
    await engine.tick();
    plant();
    advance(10 * MINUTE);
    await engine.tick();
    advance(5 * MINUTE);
    plant(anomaly({ severity: 'warn', title: 'CPU at 75 %', explanation: 'second episode', evidence: { metric: 'cpu', value: 75, unit: '%' } }));
    await engine.tick();
    const [incident] = await store.list();
    assert.deepEqual([incident.status, incident.severity, incident.title, incident.explanation, incident.evidence.value], ['open', 'warn', 'CPU at 75 %', 'second episode', 75]);
});

test('held incidents stay open while nothing looks at them; incidents of a switched-off detector close at once', async () => {
    const { engine, store, plant, also, advance } = setup();
    plant(anomaly(), anomaly({ detector: 'tablets', kind: 'offline', subject: 'tab-1' }), anomaly({ detector: 'disk', kind: 'full' }));
    await engine.tick();
    assert.equal((await store.list()).length, 3);

    // quiet hours: the tablets detector did not look, the others report nothing
    plant();
    also({ held: ['tablets:'] });
    advance(11 * MINUTE);
    let result = await engine.tick();
    assert.equal(result.resolved, 2, 'spike and disk went back to normal');
    let open = await store.list();
    assert.deepEqual(open.map((i) => i.fingerprint), ['tablets:offline:tab-1'], 'the held incident is neither resolved nor touched');
    assert.equal(open[0].last_seen_at, at(0));

    // still held hours later
    advance(8 * 60 * MINUTE);
    result = await engine.tick();
    assert.equal(result.resolved, 0);

    // the detector looks again and the tablet is back: the normal rule closes it
    also({});
    advance(MINUTE);
    result = await engine.tick();
    assert.equal(result.resolved, 1);
    const tablet = (await store.list({ status: 'resolved' })).find((i) => i.detector === 'tablets');
    assert.deepEqual((await store.events(tablet.id)).at(-1).detail, { auto: true });

    // a detector that is switched off: its open incident closes at once, with the reason
    plant(anomaly());
    advance(60 * MINUTE);
    await engine.tick();
    plant();
    also({ closed: ['spike:'], held: ['spike:'] });
    advance(MINUTE);
    result = await engine.tick();
    assert.equal(result.resolved, 1, 'no wait for clearAfterMinutes');
    const spike = (await store.list({ status: 'resolved' }))[0];
    assert.equal(spike.resolved_by, 'auto');
    assert.deepEqual((await store.events(spike.id)).at(-1).detail, { auto: true, reason: 'detector-off' });
});

test('a held test incident still resolves itself after 10 minutes', async () => {
    const { engine, store, also, advance } = setup();
    await engine.openTest('systemadmin');
    also({ held: ['test:'], closed: ['test:'] });
    advance(9 * MINUTE);
    assert.equal((await engine.tick()).resolved, 0);
    advance(MINUTE);
    assert.equal((await engine.tick()).resolved, 1);
    assert.equal((await store.list()).length, 0);
});

test('after the cooldown a returning anomaly is a new incident', async () => {
    const { engine, store, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    const [first] = await store.list();
    plant();
    advance(10 * MINUTE);
    await engine.tick();
    advance(31 * MINUTE);
    plant(anomaly());
    const result = await engine.tick();
    assert.equal(result.opened, 1);
    const all = await store.list({ status: 'all' });
    assert.equal(all.length, 2);
    assert.equal(all[0].status, 'open');
    assert.notEqual(all[0].id, first.id);
    assert.equal(all[1].id, first.id);
    assert.equal(all[1].status, 'resolved');
});

test('nothing runs while anomaly detection is off, and the settings are read again on every tick', async () => {
    const { engine, store, settings, calls, plant } = setup({ enabled: false });
    plant(anomaly());
    const result = await engine.tick();
    assert.deepEqual(result, { skipped: 'disabled', at: at(0), anomalies: 0, opened: 0, merged: 0, resolved: 0, states: {}, notes: {} });
    assert.deepEqual(calls, { load: 0, detect: 0 });
    assert.equal((await store.list({ status: 'all' })).length, 0);

    settings.enabled = true;
    const next = await engine.tick();
    assert.equal(next.skipped, null);
    assert.equal(next.opened, 1);
    assert.deepEqual(calls, { load: 1, detect: 1 });
});

test('a tick that starts while one is running shares that run', async () => {
    const { engine, store, calls, plant } = setup();
    plant(anomaly());
    const first = engine.tick();
    const second = engine.tick();
    assert.equal(first, second);
    await first;
    assert.equal(calls.load, 1);
    assert.equal((await store.list()).length, 1);
});

test('acknowledge, resolve and verdict move the incident along and are audited once each', async () => {
    const { engine, store, audits, plant, advance } = setup();
    plant(anomaly());
    await engine.tick();
    const [opened] = await store.list();

    advance(MINUTE);
    let incident = await engine.acknowledge(opened.id, 'systemadmin');
    assert.equal(incident.status, 'acknowledged');
    assert.equal(incident.acknowledged_by, 'systemadmin');
    assert.equal(incident.acknowledged_at, at(MINUTE));
    assert.deepEqual(await engine.acknowledge(opened.id, 'other'), incident, 'acknowledging again changes nothing');
    assert.equal(audits.length, 1);

    advance(MINUTE);
    incident = await engine.resolve(opened.id, 'systemadmin', '  Rebooted the PC ' + 'x'.repeat(600));
    assert.equal(incident.status, 'resolved');
    assert.equal(incident.resolved_by, 'systemadmin');
    assert.equal(incident.resolved_at, at(2 * MINUTE));
    assert.equal(incident.resolve_note.length, 500);
    assert.ok(incident.resolve_note.startsWith('Rebooted the PC'));
    assert.deepEqual(await engine.resolve(opened.id, 'other', 'again'), incident, 'resolving again changes nothing');
    assert.deepEqual(await engine.acknowledge(opened.id, 'other'), incident, 'a resolved incident is not acknowledged');
    assert.equal(audits.length, 2);

    advance(MINUTE);
    incident = await engine.setVerdict(opened.id, 'false-alarm', 'systemadmin');
    assert.equal(incident.verdict, 'false-alarm');
    assert.equal(incident.verdict_by, 'systemadmin');
    assert.equal(incident.verdict_at, at(3 * MINUTE));

    assert.deepEqual(audits, [
        { action: 'AIOPS_INCIDENT_ACKNOWLEDGE', by: 'systemadmin', id: opened.id },
        { action: 'AIOPS_INCIDENT_RESOLVE', by: 'systemadmin', id: opened.id },
        { action: 'AIOPS_INCIDENT_VERDICT', by: 'systemadmin', id: opened.id }
    ]);
    assert.deepEqual((await store.events(opened.id)).map((e) => [e.type, e.detail]), [
        ['opened', { severity: 'warn', title: 'CPU far above the last 24 hours' }],
        ['acknowledged', { by: 'systemadmin' }],
        ['resolved', { by: 'systemadmin', note: incident.resolve_note }],
        ['verdict', { by: 'systemadmin', verdict: 'false-alarm' }]
    ]);

    assert.equal(await engine.acknowledge(999, 'systemadmin'), null);
    assert.equal(await engine.resolve(999, 'systemadmin', 'x'), null);
    assert.equal(await engine.setVerdict(999, 'correct', 'systemadmin'), null);
    assert.equal(audits.length, 3, 'nothing is audited for an unknown id');
});

test('a resolve without a note stores null and an open incident can be resolved straight away', async () => {
    const { engine, store, plant } = setup();
    plant(anomaly());
    await engine.tick();
    const [opened] = await store.list();
    const incident = await engine.resolve(opened.id, 'systemadmin', '   ');
    assert.equal(incident.status, 'resolved');
    assert.equal(incident.resolve_note, null);
    assert.equal(incident.acknowledged_at, null);
});

test('a verdict outside the three allowed values is refused with status 400', async () => {
    const { engine, store, audits, plant } = setup();
    plant(anomaly());
    await engine.tick();
    const [opened] = await store.list();
    await assert.rejects(() => engine.setVerdict(opened.id, 'meh', 'systemadmin'), (error) => error.status === 400 && /correct, not-useful or false-alarm/.test(error.message));
    await assert.rejects(() => engine.setVerdict(opened.id, undefined, 'systemadmin'), (error) => error.status === 400);
    assert.equal((await store.get(opened.id)).verdict, null);
    assert.equal((await store.events(opened.id)).length, 1);
    assert.equal(audits.length, 0);
});

test('openTest opens a CPU incident with made up numbers (the default kind) that resolves itself after 10 minutes whatever clearAfterMinutes says', async () => {
    const { engine, store, audits, advance } = setup({ clearAfterMinutes: 120 });
    const incident = await engine.openTest('systemadmin');
    assert.deepEqual([incident.detector, incident.kind, incident.subject, incident.severity, incident.status], ['spike', 'high', 'cpu', 'warn', 'open']);
    assert.equal(incident.title, 'CPU at 82 %, far above the usual 31 %');
    assert.ok(incident.explanation.startsWith('Test opened by systemadmin: the numbers are made up, and it closes by itself after 10 minutes. CPU use averaged 82 %'));
    assert.ok(incident.evidence.value > incident.evidence.baseline, 'it reads above its usual level, like a real spike');
    assert.ok(incident.fingerprint.startsWith('test:cpu:'));
    assert.equal(incident.evidence.test, true);
    assert.equal(incident.evidence.unit, '%');
    assert.equal(incident.evidence.points.length, 60);
    assert.ok(incident.evidence.points.every((p) => Number.isFinite(p.t) && Number.isFinite(p.v)));
    assert.equal(incident.evidence.points.at(-1).t, START);
    assert.equal(incident.opened_at, at(0));
    assert.deepEqual(audits, [{ action: 'AIOPS_TEST_INCIDENT', by: 'systemadmin', id: incident.id }]);
    assert.deepEqual((await store.events(incident.id)).map((e) => [e.type, e.detail]), [['opened', { by: 'systemadmin', test: true, severity: 'warn' }]]);

    const second = await engine.openTest('systemadmin');
    assert.notEqual(second.fingerprint, incident.fingerprint, 'every test incident is its own');

    advance(9 * MINUTE);
    let result = await engine.tick();
    assert.equal(result.resolved, 0);
    advance(MINUTE);
    result = await engine.tick();
    assert.equal(result.resolved, 2);
    const resolved = await store.get(incident.id);
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.resolved_by, 'auto');
    assert.equal(resolved.resolved_at, at(10 * MINUTE));
});

test('a short clearAfterMinutes does not close a test incident early', async () => {
    const { engine, store, advance } = setup({ clearAfterMinutes: 1 });
    const incident = await engine.openTest('systemadmin');
    advance(5 * MINUTE);
    await engine.tick();
    assert.equal((await store.get(incident.id)).status, 'open');
    advance(5 * MINUTE);
    await engine.tick();
    assert.equal((await store.get(incident.id)).status, 'resolved');
});

test('list puts open before acknowledged, newest first, then resolved by resolve time, and clamps the limit', async () => {
    const store = incidents.memoryStore();
    const a = await seed(store, { last_seen_at: at(MINUTE) });
    const b = await seed(store, { status: 'acknowledged', acknowledged_at: at(5 * MINUTE), acknowledged_by: 'systemadmin', last_seen_at: at(5 * MINUTE) });
    const c = await seed(store, { last_seen_at: at(3 * MINUTE) });
    const d = await seed(store, { status: 'resolved', resolved_at: at(2 * MINUTE), resolved_by: 'auto' });
    const e = await seed(store, { status: 'resolved', resolved_at: at(4 * MINUTE), resolved_by: 'auto' });
    const ids = (rows) => rows.map((row) => row.id);
    assert.deepEqual(ids(await store.list()), [c, a, b]);
    assert.deepEqual(ids(await store.list({ status: 'open' })), [c, a, b]);
    assert.deepEqual(ids(await store.listOpen()), [c, a, b]);
    assert.deepEqual(ids(await store.list({ status: 'resolved' })), [e, d]);
    assert.deepEqual(ids(await store.list({ status: 'all' })), [c, a, b, e, d]);
    assert.deepEqual(ids(await store.list({ status: 'all', limit: 2 })), [c, a]);
    assert.equal((await store.findResolvedSince('spike:cpu:-', START + 3 * MINUTE)).id, e, 'the most recent resolved one');
    assert.equal(await store.findResolvedSince('spike:cpu:-', START + 5 * MINUTE), null);

    for (let i = 0; i < 510; i++) await seed(store, { status: 'resolved', resolved_at: at(-i * MINUTE), resolved_by: 'auto' });
    assert.equal((await store.list({ status: 'resolved' })).length, 50, 'default limit');
    assert.equal((await store.list({ status: 'resolved', limit: 'abc' })).length, 50);
    assert.equal((await store.list({ status: 'resolved', limit: 9999 })).length, 500, 'maximum limit');
    assert.equal((await store.list({ status: 'resolved', limit: 3 })).length, 3);
});

test('prune removes old resolved incidents and their events but keeps open and recent ones', async () => {
    const store = incidents.memoryStore();
    const old = await seed(store, { status: 'resolved', resolved_at: at(-100 * DAY), resolved_by: 'auto' });
    const recent = await seed(store, { status: 'resolved', resolved_at: at(-DAY), resolved_by: 'auto' });
    const open = await seed(store, {});
    await store.addEvent(old, 'opened', { severity: 'warn' }, at(-101 * DAY));
    await store.addEvent(old, 'resolved', { auto: true }, at(-100 * DAY));
    await store.addEvent(recent, 'opened', { severity: 'warn' }, at(-DAY));
    await store.addEvent(open, 'opened', { severity: 'warn' }, at(0));
    assert.equal(await store.prune(START - 90 * DAY), 1);
    assert.deepEqual((await store.list({ status: 'all' })).map((row) => row.id), [open, recent]);
    assert.deepEqual(await store.events(old), []);
    assert.equal((await store.events(recent)).length, 1);
    assert.equal((await store.events(open)).length, 1);
    assert.equal(await store.get(old), null);
});

test('the memory store hands out copies and takes Dates or ISO strings', async () => {
    const store = incidents.memoryStore();
    const id = await store.insert({ fingerprint: 'f', detector: 'spike', kind: 'cpu', severity: 'warn', title: 't', evidence: { value: 1 }, opened_at: new Date(START), last_seen_at: at(0) });
    const row = await store.get(id);
    assert.equal(row.opened_at, at(0));
    assert.equal(row.occurrences, 1);
    row.evidence.value = 99;
    row.status = 'resolved';
    const again = await store.get(id);
    assert.equal(again.evidence.value, 1);
    assert.equal(again.status, 'open');
    assert.equal(await store.get('abc'), null);
    assert.equal(await store.update('abc', { status: 'resolved' }), false);
});

test('sqlStore writes Dates and JSON strings and reads ISO strings and objects back', async () => {
    const calls = [];
    const evidence = { metric: 'cpu', value: 91, points: [{ t: START, v: 91 }] };
    const row = {
        id: 7, fingerprint: 'spike:cpu:-', detector: 'spike', kind: 'cpu', subject: null, severity: 'warn', status: 'open', title: 'CPU high',
        explanation: 'x', evidence: JSON.stringify(evidence), opened_at: new Date(START), last_seen_at: new Date(START + MINUTE),
        acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, resolve_note: null,
        verdict: null, verdict_by: null, verdict_at: null, occurrences: 3
    };
    const db = {
        run(sql, params, cb) { calls.push({ fn: 'run', sql, params }); cb.call({ lastID: 7, changes: 1 }, null); },
        get(sql, params, cb) { calls.push({ fn: 'get', sql, params }); cb(null, sql.includes('WHERE id = ?') ? row : null); },
        all(sql, params, cb) {
            calls.push({ fn: 'all', sql, params });
            cb(null, sql.includes('incident_events') ? [{ id: 1, incident_id: 7, at: new Date(START), type: 'opened', detail: '{"severity":"warn"}' }] : [row]);
        }
    };
    const store = incidents.sqlStore(db);

    const id = await store.insert({ fingerprint: 'spike:cpu:-', detector: 'spike', kind: 'cpu', subject: null, severity: 'warn', status: 'open', title: 'CPU high', explanation: 'x', evidence, opened_at: at(0), last_seen_at: at(0), occurrences: 1 });
    assert.equal(id, 7);
    const insert = calls.pop();
    assert.match(insert.sql, /^INSERT INTO incidents \(fingerprint, detector, kind, subject, severity, status, title, explanation, evidence, opened_at, last_seen_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolve_note, verdict, verdict_by, verdict_at, occurrences\) VALUES \((\?, ){19}\?\)$/);
    assert.equal(insert.params.length, 20);
    assert.equal(insert.params[8], JSON.stringify(evidence), 'evidence goes in as a JSON string');
    assert.ok(insert.params[9] instanceof Date, 'opened_at goes in as a Date');
    assert.equal(insert.params[9].getTime(), START);
    assert.equal(insert.params[11], null);
    assert.equal(insert.params[19], 1);

    const got = await store.get('7');
    assert.deepEqual(calls.pop().params, [7], 'a string id from the route becomes a number');
    assert.equal(got.id, 7);
    assert.equal(got.opened_at, at(0));
    assert.equal(got.last_seen_at, at(MINUTE));
    assert.equal(got.acknowledged_at, null);
    assert.deepEqual(got.evidence, evidence, 'a JSON string from the db comes back parsed');
    assert.equal(got.occurrences, 3);
    assert.equal(await store.get('abc'), null);
    assert.equal(calls.length, 0, 'a bad id never reaches the db');

    assert.deepEqual(await store.events(7), [{ id: 1, incident_id: 7, at: at(0), type: 'opened', detail: { severity: 'warn' } }]);
    assert.match(calls.pop().sql, /ORDER BY at ASC, id ASC$/);

    await store.addEvent(7, 'seen', { occurrences: 2 }, at(MINUTE));
    const event = calls.pop();
    assert.match(event.sql, /^INSERT INTO incident_events \(incident_id, at, type, detail\) VALUES \(\?, \?, \?, \?\)$/);
    assert.deepEqual([event.params[0], event.params[1].getTime(), event.params[2], event.params[3]], [7, START + MINUTE, 'seen', '{"occurrences":2}']);

    assert.equal(await store.update(7, { status: 'acknowledged', acknowledged_at: at(MINUTE), acknowledged_by: 'systemadmin', bogus: 1 }), true);
    const update = calls.pop();
    assert.equal(update.sql, 'UPDATE incidents SET status = ?, acknowledged_at = ?, acknowledged_by = ? WHERE id = ?');
    assert.deepEqual([update.params[0], update.params[1].getTime(), update.params[2], update.params[3]], ['acknowledged', START + MINUTE, 'systemadmin', 7]);
    assert.equal(await store.update(7, { bogus: 1 }), false);

    assert.equal(await store.findResolvedSince('spike:cpu:-', START), null);
    const since = calls.pop();
    assert.match(since.sql, /WHERE fingerprint = \? AND status = 'resolved' AND resolved_at >= \? ORDER BY resolved_at DESC LIMIT 1$/);
    assert.equal(since.params[0], 'spike:cpu:-');
    assert.equal(since.params[1].getTime(), START);

    assert.equal((await store.list({ status: 'all', limit: 9999 })).length, 2);
    const resolvedQuery = calls.pop();
    const openQuery = calls.pop();
    assert.match(openQuery.sql, /WHERE status IN \('open', 'acknowledged'\) ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, last_seen_at DESC, id DESC LIMIT \?$/);
    assert.deepEqual(openQuery.params, [500], 'the limit is clamped to 500');
    assert.match(resolvedQuery.sql, /WHERE status = 'resolved' ORDER BY resolved_at DESC, id DESC LIMIT \?$/);
    assert.deepEqual(resolvedQuery.params, [499]);
    await store.listOpen();
    assert.doesNotMatch(calls.pop().sql, /LIMIT/);
    await store.list();
    assert.deepEqual(calls.pop().params, [50], 'default limit');

    assert.equal(await store.prune(START), 1);
    const deleteIncidents = calls.pop();
    const deleteEvents = calls.pop();
    assert.match(deleteEvents.sql, /^DELETE FROM incident_events WHERE incident_id IN \(SELECT id FROM incidents WHERE status = 'resolved' AND resolved_at < \?\)$/);
    assert.match(deleteIncidents.sql, /^DELETE FROM incidents WHERE status = 'resolved' AND resolved_at < \?$/);
    assert.equal(deleteIncidents.params[0].getTime(), START);
});

test('sqlStore marks a missing table so the routes can answer 503', async () => {
    const missing = () => Object.assign(new Error('Table incidents does not exist'), { code: 'ER_NO_SUCH_TABLE' });
    const db = {
        run(sql, params, cb) { cb.call({ lastID: null, changes: 0 }, missing()); },
        get(sql, params, cb) { cb(missing(), null); },
        all(sql, params, cb) { cb(missing(), null); }
    };
    const store = incidents.sqlStore(db);
    await assert.rejects(() => store.listOpen(), (error) => error.missingTable === true && error.code === 'ER_NO_SUCH_TABLE');
    await assert.rejects(() => store.get(1), (error) => error.missingTable === true);
    await assert.rejects(() => store.insert({ fingerprint: 'f', detector: 'd', kind: 'k', title: 't', opened_at: at(0), last_seen_at: at(0) }), (error) => error.missingTable === true);
    const other = incidents.sqlStore({ all(sql, params, cb) { cb(new Error('lost connection'), null); } });
    await assert.rejects(() => other.listOpen(), (error) => error.missingTable === undefined);
});
// <Jun Kai end>
