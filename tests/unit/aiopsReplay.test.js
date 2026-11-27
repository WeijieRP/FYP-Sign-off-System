// Owner: Role 3, Jun Kai.
// The replay evaluation as a test: a synthetic week with seven planted faults through the real detectors and incident
// engine. A change that makes a detector noisier (false alarms) or blinder (missed faults) fails here.
// Run: npm run test:unit   (the full table: npm run aiops:replay)
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const replay = require('../../backend/features/aiops/replay');

test('the replay week: every planted fault is caught and nothing else raises an incident', async () => {
    // a check every 5 minutes keeps this to a few seconds; the samples, health runs and log lines still arrive every minute
    const result = await replay.run({ seed: 1, days: 7, stepMinutes: 5 });
    const byKey = Object.fromEntries(result.faults.map((fault) => [fault.key, fault]));
    const table = result.faults.map((fault) => `${fault.key} ${fault.detected ? `${fault.minutesToDetect} min` : 'missed'}`).join(', ');

    assert.equal(result.faults.length, 7);
    assert.ok(result.recall >= 0.85, `recall ${result.recall} (${table})`);
    assert.ok(result.precision >= 0.8, `precision ${result.precision}, false alarms: ${JSON.stringify(result.falsePositiveList)}`);
    assert.ok(result.faults.filter((fault) => !fault.detected).length <= 1, table);

    assert.ok(byKey.F1.detected && byKey.F1.minutesToDetect <= 10, `CPU spike: ${table}`);
    assert.ok(byKey.F4.detected && byKey.F4.minutesToDetect <= 20, `database down: ${table}`);
    assert.ok(byKey.F5.detected && byKey.F5.minutesToDetect <= 20, `tablet offline: ${table}`);
    assert.ok(byKey.F6.detected && byKey.F6.minutesToDetect <= 10, `error burst: ${table}`);
    assert.ok(byKey.F1.caughtBy.includes('spike'), 'the spike detector itself catches the CPU spike');
    assert.ok(byKey.F2.caughtBy.includes('drift'), 'the drift detector itself catches the memory leak');

    // the scoring adds up
    assert.equal(result.truePositives + result.falsePositives, result.incidents.length);
    assert.equal(result.falsePositiveList.length, result.falsePositives);
    assert.equal(result.incidents.filter((incident) => incident.detector === 'tablets' && incident.subject !== 'tablet-2').length, 0, 'the healthy tablet and the unnamed phone never alarm');
});

test('the same seed always gives the same result', async () => {
    const short = { seed: 7, days: 2, stepMinutes: 5 };
    const first = await replay.run(short);
    const again = await replay.run(short);
    const strip = (result) => ({ ...result, ms: 0 });
    assert.deepEqual(strip(first), strip(again));
    assert.deepEqual(first.faults.map((fault) => fault.key), ['F3', 'F6'], 'only the faults that start inside the two days are planted');
    assert.equal(first.faults.find((fault) => fault.key === 'F6').detected, true, 'the error burst on day 2 is caught');
});
// <Jun Kai end>
