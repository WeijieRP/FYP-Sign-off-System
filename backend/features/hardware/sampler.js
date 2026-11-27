// Owner: Role 3, Jun Kai.
// Takes one hardware sample every N seconds (Admin > Hardware > interval) and stores it in
// hardware_samples; deletes rows older than the retention once an hour. Started by backend/server.js only.
// <Jun Kai start> Each finished UTC day is summed up into hardware_daily (daily.js) before that clean-up. <Jun Kai end>
// <Jun Kai start>
const db = require('../../core/db');
const collect = require('./collect');
const settings = require('./settings');
const daily = require('./daily');

const FIRST_SAMPLE_DELAY_MS = 10000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

const state = {
    started: false,
    timer: null,
    intervalSeconds: settings.DEFAULTS.intervalSeconds,
    retentionDays: settings.DEFAULTS.retentionDays,
    gpu: { source: 'detecting', name: null },
    meter: null,
    lastSample: null,
    lastSampledAt: null,
    lastError: null,
    sampleCount: 0,
    lastPrune: 0,
    gpuFailures: 0,
    lastRollUp: null,
    dailyError: null,
    loggedErrors: new Set()
};
const GPU_FAILURES_BEFORE_GIVING_UP = 3;

const run = (sql, params) => new Promise((resolve, reject) => db.run(sql, params, (err, result) => (err ? reject(err) : resolve(result))));

function logOnce(message) {
    if (state.loggedErrors.has(message)) return;
    state.loggedErrors.add(message);
    console.warn(`⚠️  Hardware sampler: ${message}`);
}

async function takeSample() {
    const cpu = state.meter.read();
    const memory = collect.memory();
    const disk = await collect.disk();
    let gpu = null;
    try {
        gpu = await collect.gpu(state.gpu.source);
        state.gpuFailures = 0;
    } catch (error) {
        state.gpuFailures++;
        if (state.gpuFailures >= GPU_FAILURES_BEFORE_GIVING_UP) {
            logOnce(`GPU read failed ${state.gpuFailures} times (${error.message}); GPU stays empty until the next restart`);
            state.gpu = { source: 'none', name: state.gpu.name };
        }
    }
    return { cpu, memory, disk, gpu, at: new Date().toISOString() };
}

async function store(sample) {
    await run(
        `INSERT INTO hardware_samples
            (sampled_at, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, disk_percent, disk_used_gb, disk_total_gb, gpu_percent, gpu_memory_used_mb, gpu_memory_total_mb)
         VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sample.cpu, sample.memory.percent, sample.memory.usedMb, sample.memory.totalMb, sample.disk.percent, sample.disk.usedGb, sample.disk.totalGb,
            sample.gpu ? sample.gpu.percent : null, sample.gpu ? sample.gpu.memoryUsedMb : null, sample.gpu ? sample.gpu.memoryTotalMb : null]
    );
}

async function prune() {
    if (Date.now() - state.lastPrune < PRUNE_EVERY_MS) return;
    state.lastPrune = Date.now();
    await run('DELETE FROM hardware_samples WHERE sampled_at < UTC_TIMESTAMP() - INTERVAL ? DAY', [state.retentionDays]);
}

// The first sample of a new UTC day sums up the days that are over (and, after a long sleep, every day missed)
async function rollUpDays() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastRollUp === today) return;
    try {
        await daily.rollUp();
        state.lastRollUp = today;
        state.dailyError = null;
    } catch (error) {
        state.dailyError = error.code === 'ER_NO_SUCH_TABLE' ? 'Table hardware_daily is missing: run npm run db:migrate' : error.message;
        logOnce(state.dailyError);
    }
}

async function tick() {
    try {
        const sample = await takeSample();
        await store(sample);
        await rollUpDays();
        await prune();
        state.lastSample = sample;
        state.lastSampledAt = sample.at;
        state.lastError = null;
        state.sampleCount++;
    } catch (error) {
        state.lastError = error.code === 'ER_NO_SUCH_TABLE' ? 'Table hardware_samples is missing: run npm run db:migrate' : error.message;
        logOnce(state.lastError);
    } finally {
        schedule(state.intervalSeconds * 1000);
    }
}

function schedule(ms) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(tick, ms);
    if (state.timer.unref) state.timer.unref();
}

function applySettings(next) {
    const intervalChanged = next.intervalSeconds !== state.intervalSeconds;
    state.intervalSeconds = next.intervalSeconds;
    state.retentionDays = next.retentionDays;
    if (state.started && intervalChanged) schedule(Math.min(state.intervalSeconds * 1000, 5000));
}

function start() {
    if (state.started) return;
    state.started = true;
    state.meter = new collect.CpuMeter();
    let current;
    try { current = settings.read(); }
    catch (error) { logOnce(`settings file unreadable (${error.message}); using the defaults`); current = { ...settings.DEFAULTS }; }
    applySettings(current);
    collect.detectGpu().then((gpu) => { state.gpu = gpu; }).catch(() => { state.gpu = { source: 'none', name: null }; });
    schedule(FIRST_SAMPLE_DELAY_MS);
    console.log(`📈 Hardware sampler on: every ${state.intervalSeconds} s, kept ${state.retentionDays} days`);
}

function getStatus() {
    return {
        running: state.started,
        intervalSeconds: state.intervalSeconds,
        retentionDays: state.retentionDays,
        gpu: state.gpu,
        lastSampledAt: state.lastSampledAt,
        lastSample: state.lastSample,
        lastError: state.lastError,
        dailyError: state.dailyError,
        sampleCount: state.sampleCount
    };
}

module.exports = { start, applySettings, getStatus };
// <Jun Kai end>
