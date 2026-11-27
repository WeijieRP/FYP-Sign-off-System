// Owner: Role 3, Jun Kai.
// Unit tests for input.js, the step between the engine's SQL rows and the detectors: MySQL strings and nulls become
// numbers or null, and the assembled shape is one detectors.runAll accepts without any detector failing.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const input = require('../../backend/features/aiops/input');
const detectors = require('../../backend/features/aiops/detectors');
const settings = require('../../backend/features/aiops/settings');

const NOW = Date.parse('2026-11-11T06:30:00Z'); // 14:30 Singapore time
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// a day of minute rows the way mysql2 hands them over (DECIMAL columns as strings), ending now
function dayRows(level = { cpu: '12.0', memory: '55.5', gpu: null, disk: '71.0' }) {
    const rows = [];
    for (let t = NOW - DAY; t <= NOW; t += MINUTE) rows.push({ t, ...level });
    return rows;
}

test('num and toMs: strings become numbers, null, empty and unreadable values become null', () => {
    assert.equal(input.num('12.5'), 12.5);
    assert.equal(input.num(7), 7);
    assert.equal(input.num(null), null);
    assert.equal(input.num(undefined), null);
    assert.equal(input.num(''), null);
    assert.equal(input.num('abc'), null);
    assert.equal(input.num(NaN), null);
    assert.equal(input.toMs(new Date(NOW)), NOW);
    assert.equal(input.toMs(NOW), NOW);
    assert.equal(input.toMs(String(NOW)), NOW);
    assert.equal(input.toMs('2026-11-11T06:30:00Z'), NOW);
    assert.equal(input.toMs(null), null);
    assert.equal(input.toMs('soon'), null);
});

test('series keeps null values as points, drops rows without a time and sorts oldest first', () => {
    const rows = [{ t: NOW, cpu: '9.5' }, { t: null, cpu: '1' }, { t: NOW - MINUTE, cpu: null }, null, { t: String(NOW - 2 * MINUTE), cpu: 3 }];
    assert.deepEqual(input.series(rows, 'cpu'), [{ t: NOW - 2 * MINUTE, v: 3 }, { t: NOW - MINUTE, v: null }, { t: NOW, v: 9.5 }]);
    assert.deepEqual(input.points([{ t: NOW, v: '40.2' }]), [{ t: NOW, v: 40.2 }]);
    assert.deepEqual(input.series(undefined, 'cpu'), []);
});

test('spanHours is the distance between the first and the last row, 1 decimal', () => {
    assert.equal(input.spanHours([]), 0);
    assert.equal(input.spanHours([{ t: NOW }]), 0);
    assert.equal(input.spanHours([{ t: NOW }, { t: NOW - 90 * MINUTE }, { t: NOW - 10 * MINUTE }]), 1.5);
    assert.equal(input.spanHours(dayRows()), 24);
});

test('assembleInput with nothing loaded gives the full shape and no detector fails on it', () => {
    const built = input.assembleInput({ now: NOW });
    assert.equal(built.now, NOW);
    assert.equal(built.intervalSeconds, 60);
    assert.deepEqual(built.samples, { cpu: [], memory: [], gpu: [], disk: [] });
    assert.deepEqual(built.hourSeries, { cpu: [], memory: [], gpu: [] });
    assert.deepEqual(built.driftSeries, { memory: [], disk: [] });
    assert.deepEqual(built.disk, { points: [], totalGb: null, percent: null });
    assert.deepEqual(built.health, { runs: [] });
    assert.deepEqual(built.tablets, { devices: [] });
    assert.deepEqual(built.logs, { events: [], known: new Set(), historyHours: 0 });
    assert.equal(built.quiet, false);
    const result = detectors.runAll(built, settings.DEFAULTS);
    assert.deepEqual(result.anomalies, []);
    for (const key of detectors.DETECTOR_KEYS) assert.equal(result.states[key], 'no-data', `${key}: ${result.notes[key]}`);
});

test('assembleInput converts a day of MySQL rows into series the detectors read as a normal day', () => {
    const rows = dayRows();
    const hourRows = rows.filter((r) => detectors.sgtHour(r.t) === detectors.sgtHour(NOW));
    const buckets = (step, hours, v) => Array.from({ length: Math.floor((hours * HOUR) / step) + 1 }, (_, i) => ({ t: NOW - hours * HOUR + i * step, v }));
    const built = input.assembleInput({
        now: new Date(NOW), intervalSeconds: '60',
        rows, hourRows,
        memoryBuckets: buckets(10 * MINUTE, 24, '55.5'),
        diskBuckets: buckets(HOUR, 7 * 24, '71.0'),
        diskPoints: buckets(HOUR, 30 * 24, '340.8'),
        totalGb: '480.0', percent: '71.0',
        runs: [{ at: new Date(NOW - 5 * MINUTE).toISOString(), results: [{ key: 'database', status: 'ok', latencyMs: 4, summary: 'ok' }] }],
        devices: [{ device_id: 'tablet-1', name: 'Entrance', seconds_ago: '30' }],
        events: [{ at: new Date(NOW - MINUTE).toISOString(), process: 'server', level: 'warn', message: 'slow query 123 ms' }],
        known: ['slow query # ms'], historyHours: '30.5', quiet: 'yes'
    });
    assert.equal(built.now, NOW);
    assert.equal(built.intervalSeconds, 60);
    assert.equal(built.samples.cpu.length, rows.length);
    assert.deepEqual(built.samples.cpu[0], { t: NOW - DAY, v: 12 });
    assert.equal(built.samples.gpu[0].v, null, 'a null GPU stays null');
    assert.equal(built.hourSeries.memory.length, hourRows.length);
    assert.equal(built.driftSeries.memory[0].v, 55.5);
    assert.deepEqual(built.disk.points[built.disk.points.length - 1], { t: NOW, v: 340.8 });
    assert.equal(built.disk.totalGb, 480);
    assert.equal(built.disk.percent, 71);
    assert.equal(built.logs.historyHours, 30.5);
    assert.ok(built.logs.known.has('slow query # ms'));
    assert.equal(built.quiet, false, 'quiet is only true for the boolean true');

    const result = detectors.runAll(built, settings.DEFAULTS);
    assert.deepEqual(result.anomalies, [], JSON.stringify(result.anomalies));
    assert.equal(result.states.spike, 'ok', result.notes.spike);
    assert.equal(result.states.drift, 'ok', result.notes.drift);
    assert.equal(result.states.disk, 'ok', result.notes.disk);
    assert.equal(result.states.tablets, 'ok', result.notes.tablets);
    assert.equal(result.states.logs, 'ok', result.notes.logs);
    assert.equal(result.states.timeOfDay, 'learning', 'one day of the same hour is not a baseline yet');
    assert.equal(result.states.services, 'learning', 'one health run is not enough');
    assert.ok(!Object.values(result.states).includes('error'), JSON.stringify(result.notes));
});
// <Jun Kai end>
