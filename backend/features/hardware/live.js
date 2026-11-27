// Owner: Role 3, Jun Kai.
// The live reading behind the four part cards of the Hardware page (GET /api/admin/hardware/live, asked every
// second while the page is open). Nothing is stored: the saved samples still come from sampler.js on the Sampling
// interval. It only works while a page asks, so with no Hardware page open it reads nothing.
// <Jun Kai start>
const collect = require('./collect');

// CPU % is the busy share of the time between two reads: two open pages share one reading instead of measuring a few ms
const MIN_CPU_WINDOW_MS = 250;
// nobody asked for a while: measure a fresh quarter second instead of averaging the whole gap
const FRESH_START_MS = 2000;
// every GPU read starts nvidia-smi or typeperf (about 2 s by itself), so the GPU is read less often than the rest
const GPU_GAP_MS = { 'nvidia-smi': 2000, 'windows-counters': 5000 };
const GPU_RETRY_MS = 30000;
const GPU_FRESH_MS = 15000;

const state = { meter: null, cpu: null, cpuAt: 0, starting: null, gpu: null, gpuAt: 0, gpuNext: 0, gpuReading: false };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readCpu() {
    if (!state.meter || Date.now() - state.cpuAt > FRESH_START_MS) {
        if (!state.starting) {
            state.starting = (async () => {
                state.meter = new collect.CpuMeter();
                await wait(MIN_CPU_WINDOW_MS);
                state.cpu = state.meter.read();
                state.cpuAt = Date.now();
            })().finally(() => { state.starting = null; });
        }
        await state.starting;
        return state.cpu;
    }
    if (Date.now() - state.cpuAt >= MIN_CPU_WINDOW_MS) {
        state.cpu = state.meter.read();
        state.cpuAt = Date.now();
    }
    return state.cpu;
}

// Starts a GPU read in the background once the last one is old enough; the calls after it use the answer
function refreshGpu(source) {
    const gap = GPU_GAP_MS[source];
    if (!gap || state.gpuReading || Date.now() < state.gpuNext) return;
    state.gpuReading = true;
    collect.gpu(source)
        .then((gpu) => { state.gpu = gpu; state.gpuAt = Date.now(); state.gpuNext = Date.now() + gap; })
        .catch(() => { state.gpuNext = Date.now() + GPU_RETRY_MS; })
        .finally(() => { state.gpuReading = false; });
}

// status = sampler.getStatus(): which GPU reader this PC has, and the last stored sample.
// Answers { at, cpu, memory, disk, gpu }, the same shape as a stored sample (sampler.js takeSample).
async function read(status) {
    refreshGpu(status.gpu && status.gpu.source);
    const [cpu, disk] = await Promise.all([readCpu(), collect.disk().catch(() => null)]);
    // until the first live GPU answer, or when it is old, the GPU of the last stored sample
    const last = status.lastSample;
    const gpu = Date.now() - state.gpuAt < GPU_FRESH_MS ? state.gpu : (last && last.gpu) || null;
    return { at: new Date().toISOString(), cpu, memory: collect.memory(), disk, gpu };
}

module.exports = { read };
// <Jun Kai end>
