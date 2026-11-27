// Owner: Role 3, Jun Kai.
// Unit tests for the daily summaries of the hardware samples (backend/features/hardware/daily.js) and the
// kept-for-good rule of the forecast check. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const daily = require('../../backend/features/hardware/daily');
const forecast = require('../../backend/features/hardware/forecast');

const DAY = 86400000;
const point = (t, n, cpu, extra = {}) => ({ t, n, cpu, memory: 50, disk: 40, gpu: null, diskUsedGb: 100, diskTotalGb: 500, memoryUsedMb: 8000, gpuMemoryUsedMb: null, ...extra });

test('summaries and samples are put together, a shared bucket weighted by its samples', () => {
    const summaries = [point(0, 1440, 20), point(DAY, 1440, 30)];
    const samples = [point(DAY, 480, 60, { diskTotalGb: 512, gpu: 10 }), point(2 * DAY, 60, 70)];
    const merged = daily.mergeBuckets(summaries, samples);
    assert.deepEqual(merged.map((p) => p.t), [0, DAY, 2 * DAY]);
    assert.equal(merged[1].n, 1920);
    assert.equal(merged[1].cpu, 37.5, '(30 x 1440 + 60 x 480) / 1920');
    assert.equal(merged[1].diskTotalGb, 512, 'the disk size takes the larger');
    assert.equal(merged[1].gpu, 10, 'a value only one side has is kept');
    assert.equal(merged[0].cpu, 20);
    assert.deepEqual(daily.mergeBuckets([], []), []);
    assert.equal(summaries[1].cpu, 30, 'the inputs are not changed');
});

test('a database row becomes a graph point', () => {
    const p = daily.toPoint({ t: '1731369600', n: '1440', cpu: '12.345', memory: null, disk: '40', gpu: undefined, diskUsedGb: '101.26', diskTotalGb: '500', memoryUsedMb: '8000.4', gpuMemoryUsedMb: null });
    assert.deepEqual(p, { t: 1731369600000, n: 1440, cpu: 12.3, memory: null, disk: 40, gpu: null, diskUsedGb: 101.3, diskTotalGb: 500, memoryUsedMb: 8000.4, gpuMemoryUsedMb: null });
});

test('a forecast that reads the daily summaries is never limited by the keep period of the samples', () => {
    const yearAhead = forecast.horizonCheck({ horizonHours: 8760, historyHours: 200, retentionDays: 30, keptForGood: true });
    assert.deepEqual([yearAhead.rough, yearAhead.reason, yearAhead.waitHours, yearAhead.keptForGood], [true, 'history', 8560, true]);
    assert.equal(forecast.horizonCheck({ horizonHours: 2160, historyHours: 5000, retentionDays: 30, keptForGood: true }).rough, false, 'history older than the keep period counts');
    assert.equal(forecast.horizonCheck({ horizonHours: 8760, historyHours: 200, retentionDays: 30 }).reason, 'retention', 'without it the old rule stays');
});
// <Jun Kai end>
