// Owner: Role 3, Jun Kai.
// Reads the numbers behind one hardware sample: CPU %, memory, disk of the project drive and the GPU.
// GPU source is detected once: nvidia-smi when present, else the Windows performance counters (typeperf,
// works for Intel, AMD and NVIDIA on Windows 10+), else "none". Every read is bounded by a timeout.
// <Jun Kai start>
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const paths = require('../../core/paths');

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const run = (file, args, timeout = 10000) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 4 * MB }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
});
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (n) => (Number.isFinite(n) ? Math.min(100, Math.max(0, round1(n))) : null);
const num = (s) => { const n = Number(String(s).trim()); return Number.isFinite(n) ? n : null; };

function cpuTimes() {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        for (const key of Object.keys(cpu.times)) total += cpu.times[key];
        idle += cpu.times.idle;
    }
    return { idle, total };
}

// The processor for the CPU card: its name without the trade marks and the clock ("11th Gen Intel Core i7-1165G7"),
// and the logical processors Windows counts. null when the system does not say.
function cpuInfo(cpus = os.cpus()) {
    if (!Array.isArray(cpus) || !cpus.length) return null;
    const model = String(cpus[0].model || '').replace(/\((R|TM)\)/gi, '').replace(/\bCPU\b/g, '').replace(/@.*$/, '')
        .replace(/\s+/g, ' ').trim();
    return { model: model || null, logicalProcessors: cpus.length };
}

// Average CPU use since the previous read, so a 60 s interval gives the real 60 s average
class CpuMeter {
    constructor() { this.last = cpuTimes(); }
    read() {
        const now = cpuTimes();
        const busy = now.total - this.last.total;
        const idle = now.idle - this.last.idle;
        this.last = now;
        if (busy <= 0) return null;
        return pct((1 - idle / busy) * 100);
    }
}

function memory() {
    const total = os.totalmem();
    const used = total - os.freemem();
    return { percent: pct((used / total) * 100), usedMb: Math.round(used / MB), totalMb: Math.round(total / MB) };
}

async function disk() {
    const stats = await fs.promises.statfs(paths.ROOT);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = total - free;
    return { percent: total ? pct((used / total) * 100) : null, usedGb: round1(used / GB), totalGb: round1(total / GB), path: paths.ROOT };
}

// ---- GPU ----
const GPU_COUNTERS = ['\\GPU Engine(*)\\Utilization Percentage', '\\GPU Adapter Memory(*)\\Dedicated Usage', '\\GPU Adapter Memory(*)\\Shared Usage'];

function parseTypeperf(output) {
    const rows = output.split(/\r?\n/).filter((line) => line.startsWith('"')).map((line) => line.slice(1, -1).split('","'));
    if (rows.length < 2) return null;
    const [header, data] = rows;
    // Task Manager's "GPU %" = the busiest engine type of one adapter, each engine summed over its processes
    const byEngine = {};
    let dedicated = 0;
    let shared = 0;
    let seen = false;
    for (let i = 1; i < header.length; i++) {
        const name = header[i];
        const value = parseFloat(data[i]);
        if (!Number.isFinite(value)) continue;
        if (/\\Utilization Percentage$/.test(name)) {
            const adapter = (name.match(/luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)/) || [])[1] || 'gpu';
            const type = (name.match(/engtype_([A-Za-z0-9]+)/) || [])[1] || 'other';
            const key = `${adapter}:${type}`;
            byEngine[key] = (byEngine[key] || 0) + value;
            seen = true;
        } else if (/\\Dedicated Usage$/.test(name)) dedicated += value;
        else if (/\\Shared Usage$/.test(name)) shared += value;
    }
    if (!seen) return null;
    const busiest = Object.entries(byEngine).sort((a, b) => b[1] - a[1])[0];
    const usedMb = Math.round((dedicated + shared) / MB);
    return { percent: pct(busiest[1]), memoryUsedMb: usedMb || null, memoryTotalMb: null, busiestEngine: busiest[0].split(':')[1] };
}

async function readNvidia() {
    const out = await run('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], 8000);
    const [name, util, used, total] = out.trim().split('\n')[0].split(',').map((s) => s.trim());
    const mb = (s) => (num(s) === null ? null : Math.round(num(s))); // nvidia-smi prints [N/A] for some cards
    return { name, percent: pct(num(util)), memoryUsedMb: mb(used), memoryTotalMb: mb(total) };
}

async function readCounters() {
    return parseTypeperf(await run('typeperf', [...GPU_COUNTERS, '-sc', '1'], 12000));
}

async function windowsGpuName() {
    try {
        const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ", "'], 10000);
        return out.trim() || null;
    } catch { return null; }
}

// { source: 'nvidia-smi' | 'windows-counters' | 'none', name }
async function detectGpu() {
    try {
        const first = await readNvidia();
        return { source: 'nvidia-smi', name: first.name };
    } catch { /* no nvidia-smi on this PC */ }
    if (process.platform === 'win32') {
        try {
            if (await readCounters()) return { source: 'windows-counters', name: await windowsGpuName() };
        } catch { /* counters not available */ }
    }
    return { source: 'none', name: null };
}

// <Jun Kai start> one GPU read at a time: a second caller (the sampler while the Hardware page asks for live
// readings, live.js) gets the same answer instead of null, so a stored sample never loses its GPU value
let gpuRead = null;
function gpu(source) {
    if (source === 'none') return Promise.resolve(null);
    if (!gpuRead) gpuRead = (source === 'nvidia-smi' ? readNvidia() : readCounters()).finally(() => { gpuRead = null; });
    return gpuRead;
}
// <Jun Kai end>

module.exports = { CpuMeter, memory, disk, detectGpu, gpu, parseTypeperf, cpuInfo };
// <Jun Kai end>
