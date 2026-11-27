// Owner: Role 3, Jun Kai.
// Unit tests for the live reading of the Hardware page's part cards (backend/features/hardware/live.js).
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const collect = require('../../backend/features/hardware/collect');

const LIVE = require.resolve('../../backend/features/hardware/live');
const freshLive = () => { delete require.cache[LIVE]; return require(LIVE); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NO_GPU = { gpu: { source: 'none', name: null }, lastSample: null };

function stub(t, object, name, value) {
    const original = object[name];
    object[name] = value;
    t.after(() => { object[name] = original; });
}

test('a live reading has the shape of a stored sample, and no GPU on the PC means no GPU read', async (t) => {
    let gpuCalls = 0;
    stub(t, collect, 'disk', async () => ({ percent: 40, usedGb: 200, totalGb: 500, path: 'C:\\kiosk' }));
    stub(t, collect, 'gpu', async () => { gpuCalls++; return null; });
    const reading = await freshLive().read(NO_GPU);
    assert.ok(reading.cpu === null || (reading.cpu >= 0 && reading.cpu <= 100), 'CPU is a percent');
    assert.ok(reading.memory.percent >= 0 && reading.memory.percent <= 100, 'memory is a percent');
    assert.ok(reading.memory.totalMb > 0);
    assert.deepEqual(reading.disk, { percent: 40, usedGb: 200, totalGb: 500, path: 'C:\\kiosk' });
    assert.equal(reading.gpu, null);
    assert.ok(!Number.isNaN(Date.parse(reading.at)));
    assert.equal(gpuCalls, 0);
});

test('the first reading measures a fresh quarter second; callers within 250 ms share one reading', async (t) => {
    let meters = 0;
    let reads = 0;
    stub(t, collect, 'CpuMeter', class { constructor() { meters++; } read() { reads++; return 25; } });
    stub(t, collect, 'disk', async () => null);
    const live = freshLive();
    const started = Date.now();
    const [a, b] = await Promise.all([live.read(NO_GPU), live.read(NO_GPU)]);
    assert.ok(Date.now() - started >= 240, 'the first answer waits for a quarter second of CPU time');
    assert.deepEqual([a.cpu, b.cpu, meters, reads], [25, 25, 1, 1], 'two callers at once, one measurement');
    await live.read(NO_GPU);
    assert.equal(reads, 1, 'asked again within 250 ms: the same reading');
    await wait(300);
    await live.read(NO_GPU);
    assert.deepEqual([meters, reads], [1, 2], 'a moment later: a new reading from the same meter');
});

test('the GPU is read in the background at most every 2 s; the last stored sample covers until the first answer', async (t) => {
    let gpuCalls = 0;
    stub(t, collect, 'CpuMeter', class { read() { return 10; } });
    stub(t, collect, 'disk', async () => null);
    stub(t, collect, 'gpu', () => { gpuCalls++; return wait(800).then(() => ({ percent: 55, memoryUsedMb: 900, memoryTotalMb: 4096 })); });
    const status = { gpu: { source: 'nvidia-smi', name: 'Test GPU' }, lastSample: { gpu: { percent: 12, memoryUsedMb: 500, memoryTotalMb: 4096 } } };
    const live = freshLive();
    const first = await live.read(status);
    assert.equal(first.gpu.percent, 12, 'the GPU read is still running: the last stored sample');
    await wait(700);
    const second = await live.read(status);
    assert.equal(second.gpu.percent, 55, 'then the live answer');
    await live.read(status);
    assert.equal(gpuCalls, 1, 'no second GPU read within 2 s');
});

test('the CPU card names the processor without the trade marks or the clock, and counts its logical processors', () => {
    const cpus = (model, n) => Array.from({ length: n }, () => ({ model }));
    assert.deepEqual(collect.cpuInfo(cpus('11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz', 8)), { model: '11th Gen Intel Core i7-1165G7', logicalProcessors: 8 });
    assert.deepEqual(collect.cpuInfo(cpus('Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz', 2)), { model: 'Intel Xeon E5-2680 v4', logicalProcessors: 2 });
    assert.deepEqual(collect.cpuInfo(cpus('AMD Ryzen 7 5800H with Radeon Graphics         ', 16)), { model: 'AMD Ryzen 7 5800H with Radeon Graphics', logicalProcessors: 16 });
    assert.equal(collect.cpuInfo([]), null, 'no processor listed: nothing to show');
    assert.deepEqual(collect.cpuInfo(cpus('', 4)), { model: null, logicalProcessors: 4 });
    const here = collect.cpuInfo();
    assert.ok(here === null || here.logicalProcessors >= 1, 'this PC answers too');
});
// <Jun Kai end>
