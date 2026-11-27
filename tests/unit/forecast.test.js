// Owner: Role 3, Jun Kai.
// Unit tests for the hardware forecast maths. Run: npm run test:unit  (node --test tests/unit)
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const forecast = require('../../backend/features/hardware/forecast');

test('holtForecast follows a straight upward line, then the damped trend flattens', () => {
    const values = Array.from({ length: 24 }, (_, i) => 10 + i * 2); // 10, 12, ... 56
    const result = forecast.holtForecast(values, 30);
    assert.equal(result.points.length, 30);
    assert.ok(Math.abs(result.points[0].value - 58) < 1.5, `first step ${result.points[0].value} should be close to 58`);
    assert.ok(result.points[9].value > result.points[0].value, 'keeps rising');
    const firstStep = result.points[1].value - result.points[0].value;
    const lastStep = result.points[29].value - result.points[28].value;
    assert.ok(lastStep < firstStep, `the rise slows down (${firstStep} then ${lastStep})`);
    assert.ok(result.points[0].low <= result.points[0].value && result.points[0].value <= result.points[0].high);
});

test('holtForecast never goes above 100', () => {
    const values = Array.from({ length: 36 }, (_, i) => 30 + i * 2); // 30 ... 100
    for (const p of forecast.holtForecast(values, 144).points) assert.ok(p.value <= 100 && p.high <= 100);
});

test('the PC settling after a wake-up does not run the forecast to zero', () => {
    // real 10-minute averages from the first two hours after a wake-up (9 Nov 2026)
    const cpu = [22.3, 19.0, 14.1, 9.4, 9.7, 11.0, 13.0, 6.7, 7.3, 9.3, 7.2, 7.7];
    const memory = [84.1, 79.7, 77.5, 78.1, 79.3, 75.7, 75.8, 74.7, 75.2, 73.0, 75.9, 76.8];
    const cpuDay = forecast.holtForecast(cpu, 144).points[143].value;
    const memoryDay = forecast.holtForecast(memory, 144).points[143].value;
    assert.ok(cpuDay >= 4 && cpuDay <= 10, `CPU in 24 h ${cpuDay} should stay near today's 7 %`);
    assert.ok(memoryDay >= 72 && memoryDay <= 78, `memory in 24 h ${memoryDay} should stay near today's 76 %`);
});

test('a trend seen all day is trusted for longer than one seen for two hours', () => {
    assert.ok(forecast.dampingFor(144) > forecast.dampingFor(12));
    assert.ok(Math.abs(forecast.dampingFor(12) ** 6 - 0.5) < 1e-9, 'two hours of steps: the trend halves in an hour');
});

test('holtForecast of a flat series stays flat with a zero band', () => {
    const result = forecast.holtForecast(Array(12).fill(42), 6);
    for (const p of result.points) assert.equal(p.value, 42);
    assert.equal(result.rmse, 0);
});

test('holtForecast needs at least 6 readings and ignores nulls', () => {
    assert.equal(forecast.holtForecast([1, 2, 3], 5), null);
    assert.equal(forecast.holtForecast([null, null, 1, 2, 3, 4, 5], 5), null);
    assert.ok(forecast.holtForecast([null, 1, 2, 3, 4, 5, 6], 5));
});

test('linearTrend recovers slope and intercept', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ t: 1000 + i * 60000, v: 5 + i * 3 }));
    const fit = forecast.linearTrend(points);
    assert.ok(Math.abs(fit.slope - 3 / 60000) < 1e-9);
    assert.ok(Math.abs(fit.intercept - 5) < 1e-6);
    assert.equal(forecast.linearTrend([{ t: 1, v: 1 }]), null);
});

test('diskForecast reports growth per day and days until full', () => {
    const day = 86400000;
    const points = Array.from({ length: 8 }, (_, i) => ({ t: i * day, v: 100 + i * 2 })); // +2 GB a day
    const result = forecast.diskForecast(points, 200);
    assert.equal(result.gbPerDay, 2);
    assert.equal(result.daysUntilFull, 43); // (200 - 114) / 2
    const flat = forecast.diskForecast(points.map((p) => ({ t: p.t, v: 100 })), 200);
    assert.equal(flat.daysUntilFull, null);
});

test('bucketAverage averages into fixed buckets and skips nulls', () => {
    const rows = [{ t: 0, cpu: 10 }, { t: 30000, cpu: 20 }, { t: 60000, cpu: null }, { t: 90000, cpu: 40 }];
    const out = forecast.bucketAverage(rows, 60000, ['cpu']);
    assert.deepEqual(out, [{ t: 0, n: 2, cpu: 15 }, { t: 60000, n: 2, cpu: 40 }]);
});

// deterministic noise so the test never flakes
function noise(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
}

test('a steady load with noise forecasts close to its average, with a band that widens', () => {
    const rnd = noise(7);
    const values = Array.from({ length: 144 }, () => 20 + rnd() * 6); // 20 % plus or minus 3
    const result = forecast.holtForecast(values, 144);
    const end = result.points[143];
    assert.ok(Math.abs(end.value - 20) < 5, `24 h ahead should stay near 20, got ${end.value}`);
    assert.ok(result.rmse > 0 && result.rmse < 4, `rmse ${result.rmse}`);
    assert.ok(end.high - end.low > result.points[0].high - result.points[0].low, 'band widens with the horizon');
    assert.ok(end.low < end.value && end.value < end.high);
});

test('a noisy rising line keeps its slope at first, then the rise halves within 6 hours', () => {
    const rnd = noise(11);
    const values = Array.from({ length: 144 }, (_, i) => 30 + i * 0.2 + rnd() * 2);
    const p = forecast.holtForecast(values, 60).points.map((point) => point.value);
    const early = (p[5] - p[0]) / 5;
    assert.ok(Math.abs(early - 0.2) < 0.05, `slope ${early} should be close to 0.2`);
    const later = (p[41] - p[35]) / 6;
    assert.ok(later > 0 && later / early > 0.3 && later / early < 0.7, `36 steps later the rise is about half (${early} then ${later})`);
});

test('a trend seen for days is still trusted for 6 hours at most', () => {
    // 12.5 days of 10-minute averages without a break, rising 0.01 per step: before the cap, half the run (6 days)
    // decided how long the trend lasted, and 7 days ahead came out about 7 points higher
    const values = Array.from({ length: 1800 }, (_, i) => 10 + i * 0.01);
    assert.ok(Math.abs(forecast.dampingFor(1800) ** 36 - 0.5) < 1e-9, 'the trend halves within 36 steps');
    const week = forecast.holtForecast(values, 1008).points.at(-1).value;
    assert.ok(week - values.at(-1) < 1.5, `7 days ahead ${week} should stay near the last reading ${values.at(-1)}`);
});

test('holtForecast uses only the unbroken run of readings after a gap', () => {
    const tail = [40, 41, 42, 43, 44, 45];
    const withGap = [10, 12, 14, 16, null, ...tail];
    assert.deepEqual(forecast.holtForecast(withGap, 3), forecast.holtForecast(tail, 3));
});

test('diskForecast reports a shrinking disk as not growing', () => {
    const day = 86400000;
    const points = Array.from({ length: 8 }, (_, i) => ({ t: i * day, v: 150 - i * 2 }));
    const result = forecast.diskForecast(points, 200);
    assert.equal(result.daysUntilFull, null);
    assert.equal(result.gbPerDay, -2);
    assert.equal(result.totalGb, 200);
});
test('dailyForecast needs 6 days and gives at most 200 points for a year', () => {
    assert.equal(forecast.dailyForecast([20, 21, 22, 21, 20], 30), null);
    const days = Array.from({ length: 30 }, (_, i) => 30 + (i % 5)); // 30 ... 34, a steady working week
    const year = forecast.dailyForecast(days, 365);
    assert.ok(year.points.length <= 200, `${year.points.length} points`);
    assert.equal(year.points[year.points.length - 1].day, 365);
    assert.equal(year.stepDays, 2);
    for (const p of year.points) assert.ok(p.value >= 0 && p.value <= 100 && p.low <= p.value && p.value <= p.high);
    const month = forecast.dailyForecast(days, 30);
    assert.equal(month.points.length, 30);
    assert.deepEqual(month.points.map((p) => p.day).slice(0, 3), [1, 2, 3]);
});

test('a forecast a year ahead of a steady load stays at its usual level', () => {
    const days = Array.from({ length: 40 }, (_, i) => 30 + (i % 5));
    const end = forecast.dailyForecast(days, 365).points.pop();
    assert.ok(end.value > 27 && end.value < 37, `${end.value} should stay near 32`);
    assert.ok(end.low < end.value && end.high > end.value, 'with a range around it');
});

test('up to 2 days ahead the forecast works on 10 minute steps, further ahead on daily averages', () => {
    assert.equal(forecast.DAILY_AFTER_HOURS, 48);
    for (const hours of [1, 6, 24, 48]) assert.equal(forecast.usesDailyAverages(hours), false, `${hours} h on steps`);
    for (const hours of [49, 72, 168, 720, 8760]) assert.equal(forecast.usesDailyAverages(hours), true, `${hours} h on daily averages`);
});

test('horizonCheck: dependable once the samples go back as far as the forecast looks ahead', () => {
    const week = forecast.horizonCheck({ horizonHours: 24, historyHours: 200, retentionDays: 30 });
    assert.deepEqual([week.rough, week.reason], [false, null]);
    // a month ahead with samples kept for 30 days: the oldest sample hovers around 720 hours, which still counts
    assert.equal(forecast.horizonCheck({ horizonHours: 720, historyHours: 719, retentionDays: 30 }).rough, false);
    assert.equal(forecast.horizonCheck({ horizonHours: 8760, historyHours: 9000, retentionDays: 365 }).rough, false);
});

test('horizonCheck: a short history is rough and says whether waiting or a longer keep period fixes it', () => {
    const waiting = forecast.horizonCheck({ horizonHours: 8760, historyHours: 200, retentionDays: 365 });
    assert.deepEqual([waiting.rough, waiting.reason, waiting.waitHours], [true, 'history', 8560]);
    const deleted = forecast.horizonCheck({ horizonHours: 8760, historyHours: 200, retentionDays: 30 });
    assert.deepEqual([deleted.rough, deleted.reason, deleted.neededRetentionDays], [true, 'retention', 365]);
    // samples older than the keep period are about to be deleted, so they do not count as history
    const capped = forecast.horizonCheck({ horizonHours: 2160, historyHours: 5000, retentionDays: 30 });
    assert.deepEqual([capped.rough, capped.reason, capped.historyHours], [true, 'retention', 720]);
    const fresh = forecast.horizonCheck({ horizonHours: 24, historyHours: 0, retentionDays: 30 });
    assert.deepEqual([fresh.rough, fresh.reason, fresh.waitHours], [true, 'history', 24]);
});
// <Jun Kai end>
