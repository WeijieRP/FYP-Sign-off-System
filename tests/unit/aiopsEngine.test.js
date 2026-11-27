// Owner: Role 3, Jun Kai.
// Unit tests for the runner that drives anomaly detection inside server.js (backend/features/aiops/engine.js): a fake
// clock, a fake database that only answers the runner's own queries, the memory store and the real detectors.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const incidents = require('../../backend/features/aiops/incidents');
const settings = require('../../backend/features/aiops/settings');
const { createRunner } = require('../../backend/features/aiops/engine');

const START = Date.parse('2026-11-11T02:00:00Z'); // 10:00 in Singapore
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// world: what the fakes answer; the test changes it between checks. overrides: other fakes for createRunner
function setup(world = {}, overrides = {}) {
    let t = START;
    const w = { devices: [], names: {}, mode: 'manual', kioskOn: true, heartbeatsMissing: false, samplesError: null, ...world };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiops-engine-'));
    const store = incidents.memoryStore();
    const db = {
        all(sql, params, callback) {
            if (/device_heartbeats/.test(sql)) {
                if (w.heartbeatsMissing) return callback(Object.assign(new Error('no such table'), { code: 'ER_NO_SUCH_TABLE' }));
                return callback(null, w.devices);
            }
            if (w.samplesError) return callback(new Error(w.samplesError));
            return callback(null, []); // no hardware samples: the hardware detectors report "no data"
        }
    };
    const runner = createRunner({
        db: () => db,
        store: () => store,
        recorder: () => ({ start() {}, runs: () => [], latest: () => null, getStatus: () => ({ lastRunAt: null, lastError: null, runCount: 0 }) }),
        hardware: () => ({ read: () => ({ intervalSeconds: 60 }) }),
        control: () => ({ readModeConfig: () => ({ mode: w.mode }), readSchedulesConfig: () => ({ schedules: [] }) }),
        policies: () => ({ status: () => ({ on: w.kioskOn }) }),
        tabletNames: () => ({ all: () => w.names }),
        settings: () => settings.DEFAULTS,
        audit: () => {},
        files: () => [path.join(dir, 'app-events-server.jsonl'), path.join(dir, 'app-events-kiosk.jsonl')],
        now: () => new Date(t),
        ...overrides
    });
    return {
        runner, store, world: w,
        advance: (ms) => { t += ms; },
        // one check a minute, like the timer
        async minutes(n) { let last; for (let i = 0; i < n; i++) { t += MINUTE; last = await runner.runNow(); } return last; },
        cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
    };
}

test('the hardware detectors wait 15 minutes after a start and again after a wake-up from hibernation', async () => {
    const s = setup();
    try {
        let result = await s.minutes(1);
        assert.equal(result.states.spike, 'muted');
        assert.equal(result.states.timeOfDay, 'muted');
        assert.match(result.notes.spike, /started or woke up 1 min ago/);
        assert.equal(result.states.disk, 'no-data', 'the other detectors run at once');

        result = await s.minutes(13);
        assert.equal(result.states.spike, 'muted', 'still settling 14 minutes in');
        result = await s.minutes(1);
        assert.equal(result.states.spike, 'no-data', 'looking again from minute 15 (there are no samples in this test)');

        s.advance(15 * HOUR); // the PC hibernated overnight: no check ran
        result = await s.minutes(1);
        assert.equal(result.states.spike, 'muted', 'a long pause between two checks counts as a wake-up');
        assert.match(result.notes.spike, /woke up 0 min ago/);
        result = await s.minutes(15);
        assert.equal(result.states.spike, 'no-data');
    } finally { s.cleanup(); }
});

test('a named tablet counts as offline only after 10 quiet minutes of watch time, however old its last report is', async () => {
    const s = setup({ devices: [{ device_id: 'tab-000001', seconds_ago: 15 * 3600 }, { device_id: 'phone-00001', seconds_ago: 15 * 3600 }], names: { 'tab-000001': 'Tablet 1' } });
    try {
        let result = await s.minutes(9);
        assert.equal(result.opened, 0, 'nine minutes after the start nothing is offline yet');
        assert.equal(result.states.tablets, 'ok');
        assert.equal(s.runner.getStatus().data.namedTablets, 1);

        result = await s.minutes(2);
        const open = await s.store.list();
        assert.deepEqual(open.map((i) => i.fingerprint), ['tablets:offline:tab-000001'], 'the unnamed phone is never watched');
        assert.match(open[0].title, /^Tablet 1 offline for 15 h/, 'the text gives the real time since the last report');
    } finally { s.cleanup(); }
});

test('quiet hours hold a tablet incident, and the end of quiet hours starts the watch time again', async () => {
    const s = setup({ devices: [{ device_id: 'tab-000001', seconds_ago: 3 * 3600 }], names: { 'tab-000001': 'Tablet 1' } });
    try {
        await s.minutes(11);
        assert.equal((await s.store.list()).length, 1);

        // the policies switch the kiosk off in automatic mode: quiet hours
        Object.assign(s.world, { mode: 'auto', kioskOn: false });
        let result = await s.minutes(30);
        assert.equal(result.states.tablets, 'muted');
        assert.equal(result.resolved, 0);
        assert.equal((await s.store.list()).length, 1, 'the incident is held, not closed, while nothing looks at the tablets');
        assert.equal(s.runner.getStatus().quietNow, true);

        // the kiosk is on again; the tablet is still silent
        s.world.kioskOn = true;
        result = await s.minutes(5);
        assert.equal(result.resolved, 0, 'held for the first 10 minutes of watching again');
        assert.match(result.notes.tablets, /Watching again for 4 min/);
        result = await s.minutes(7);
        const [incident] = await s.store.list();
        assert.equal(incident.status, 'open', 'the same incident carries on');
        assert.equal(incident.occurrences, 2, 'seen again once the tablet has been quiet for 10 watched minutes');
        assert.equal((await s.store.list({ status: 'resolved' })).length, 0, 'it was never closed and reopened in between');

        // the tablet reports again: the incident closes by itself
        s.world.devices = [{ device_id: 'tab-000001', seconds_ago: 20 }];
        result = await s.minutes(9);
        assert.equal(result.resolved, 0, 'not yet: clearAfterMinutes is 10');
        result = await s.minutes(1);
        assert.equal(result.resolved, 1);
    } finally { s.cleanup(); }
});

test('a missing heartbeat table means no tablets, not a failed check', async () => {
    const s = setup({ heartbeatsMissing: true });
    try {
        const result = await s.minutes(1);
        assert.equal(result.skipped, null);
        assert.equal(result.states.tablets, 'no-data');
        const status = s.runner.getStatus();
        assert.equal(status.lastError, null);
        assert.equal(status.detectors.length, 7);
        assert.equal(status.detectors.find((d) => d.key === 'tablets').state, 'no-data');
    } finally { s.cleanup(); }
});

test('before the first check every detector is waiting, and a failed check keeps its error for the status', async () => {
    const s = setup();
    try {
        assert.deepEqual(s.runner.getStatus().detectors.map((d) => d.state), Array(7).fill('waiting'));
        s.world.samplesError = 'connection lost'; // the fake database now fails the sample queries
        const original = console.warn;
        console.warn = () => {};
        try {
            await assert.rejects(() => s.minutes(1));
        } finally { console.warn = original; }
        assert.equal(s.runner.getStatus().lastError, 'connection lost', 'the status carries the message');
        s.world.samplesError = null;
        await s.minutes(1);
        assert.equal(s.runner.getStatus().lastError, null, 'the next good check clears it');
    } finally { s.cleanup(); }
});

test('with Anomaly detection off nothing is compared, but the advisor still looks at the open incidents', async () => {
    let sweeps = 0;
    const advisor = () => ({ sweep: async () => { sweeps++; return 0; }, request: () => ({ queued: false }), isBusy: () => false, getStatus: () => ({ on: true, localAi: true }) });
    const s = setup({}, { settings: () => ({ ...settings.DEFAULTS, enabled: false }), advisor });
    try {
        const result = await s.minutes(2);
        assert.equal(result.skipped, 'disabled');
        assert.equal(sweeps, 2, 'one advice sweep after every check, as with detection on');
    } finally { s.cleanup(); }
});
// <Jun Kai end>
