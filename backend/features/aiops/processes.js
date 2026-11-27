// Owner: Role 3, Jun Kai.
// The programmes using the most CPU or memory on this PC right now, for the "What to do" steps of a CPU or memory
// incident. Windows: one PowerShell call to the performance counters (read twice, the first read only primes them);
// Linux: ps. Cached for 15 s and never throws: an empty list just leaves that step out. The kiosk's own programmes
// (Node.js, MySQL, Ollama) are listed with `keep` saying what they are, so the page can say to leave them running;
// the idle counters are never listed.
// <Jun Kai start>
const { execFile } = require('child_process');
const os = require('os');

const CACHE_MS = 15 * 1000;
const TIMEOUT_MS = 10 * 1000;
const KEEP = { node: 'the kiosk', mysqld: "the kiosk's database", ollama: 'the local AI', 'ollama app': 'the local AI', ollama_llama_server: 'the local AI' };
const FRIENDLY = {
    node: 'Node.js', ollama_llama_server: 'Ollama',
    chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'Firefox', teams: 'Microsoft Teams', 'ms-teams': 'Microsoft Teams',
    code: 'Visual Studio Code', mysqld: 'MySQL', ollama: 'Ollama', 'ollama app': 'Ollama', explorer: 'File Explorer', onedrive: 'OneDrive',
    searchhost: 'Windows Search', zoom: 'Zoom', discord: 'Discord', spotify: 'Spotify', excel: 'Microsoft Excel',
    winword: 'Microsoft Word', powerpnt: 'Microsoft PowerPoint', outlook: 'Microsoft Outlook', olk: 'Microsoft Outlook', steam: 'Steam',
    obs64: 'OBS Studio', vlc: 'VLC', blender: 'Blender'
};
// the idle counters, Windows' own processes (ending them breaks Windows or is refused), the antivirus, and the
// PowerShell and WMI processes that this very reading starts
const HIDDEN = new Set([
    '_total', 'idle', 'system idle process', 'system', 'memory compression', 'registry', 'secure system',
    'svchost', 'csrss', 'lsass', 'lsaiso', 'services', 'smss', 'wininit', 'winlogon', 'dwm', 'fontdrvhost', 'sihost', 'ctfmon',
    'taskhostw', 'runtimebroker', 'audiodg', 'spoolsv', 'conhost', 'wmiprvse', 'powershell', 'pwsh',
    'msmpeng', 'mssense', 'nissrv', 'securityhealthservice', 'sgrmbroker', 'smartscreen'
]);
const cache = { cpu: { at: 0, list: [] }, memory: { at: 0, list: [] } };

const baseName = (name) => String(name || '').replace(/#\d+$/, '').replace(/\.exe$/i, '').trim();
function friendly(name) {
    const base = baseName(name);
    return FRIENDLY[base.toLowerCase()] || base;
}

// rows: [{ name, cpu (percent of one core), memoryBytes }] -> one entry per programme, cpu as a percent of the whole PC,
// the busiest first, at most `limit`; the kiosk's own programmes carry keep: what they are
function summarise(rows, by = 'cpu', cores = (os.cpus() || []).length || 1, limit = 3) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const base = baseName(row && row.name);
        if (!base || HIDDEN.has(base.toLowerCase())) continue;
        const keep = KEEP[base.toLowerCase()];
        const group = keep ? friendly(base).toLowerCase() : base.toLowerCase(); // ollama and its runner are one programme
        const entry = groups.get(group) || { name: friendly(base), cpu: 0, memoryMb: 0, ...(keep ? { keep } : {}) };
        entry.cpu += Math.max(0, Number(row.cpu) || 0) / Math.max(1, cores);
        entry.memoryMb += Math.max(0, Number(row.memoryBytes) || 0) / (1024 * 1024);
        groups.set(group, entry);
    }
    const key = by === 'memory' ? 'memoryMb' : 'cpu';
    return [...groups.values()]
        .filter((e) => (by === 'memory' ? e.memoryMb >= 50 : e.cpu >= 1))
        .sort((a, b) => b[key] - a[key])
        .slice(0, limit)
        .map((e) => ({ name: e.name, cpu: Math.round(e.cpu), memoryMb: Math.round(e.memoryMb), ...(e.keep ? { keep: e.keep } : {}) }));
}

const WINDOWS_SCRIPT = "$null = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process; Start-Sleep -Milliseconds 900; "
    + 'Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Select-Object Name, PercentProcessorTime, WorkingSetPrivate | ConvertTo-Json -Compress';

function readWindows() {
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT], { windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
            if (error) return resolve([]);
            try {
                const parsed = JSON.parse(String(stdout || '').trim() || '[]');
                const list = Array.isArray(parsed) ? parsed : [parsed];
                resolve(list.map((p) => ({ name: p.Name, cpu: p.PercentProcessorTime, memoryBytes: p.WorkingSetPrivate })));
            } catch {
                resolve([]);
            }
        });
    });
}

// ps gives each process's average since it started (percent of one core, like the Windows counter), close enough for
// "what is busy"
function readPs() {
    return new Promise((resolve) => {
        execFile('ps', ['-eo', 'comm=,pcpu=,rss='], { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
            if (error) return resolve([]);
            resolve(String(stdout || '').split('\n').map((line) => line.trim().match(/^(.*?)\s+([\d.]+)\s+(\d+)$/)).filter(Boolean)
                .map((m) => ({ name: m[1], cpu: Number(m[2]), memoryBytes: Number(m[3]) * 1024 })));
        });
    });
}

async function top(by = 'cpu', { reader } = {}) {
    const kind = by === 'memory' ? 'memory' : 'cpu';
    const cached = cache[kind];
    if (!reader && Date.now() - cached.at < CACHE_MS) return cached.list;
    const rows = await (reader ? reader() : process.platform === 'win32' ? readWindows() : readPs());
    const list = summarise(rows, kind);
    if (!reader) Object.assign(cache[kind], { at: Date.now(), list });
    return list;
}

// With the Local AI models switch off nothing in the app uses Ollama, so it is listed like any other programme
function withoutAiKeep(list) {
    return list.map((p) => (p.keep && p.name === 'Ollama' ? { name: p.name, cpu: p.cpu, memoryMb: p.memoryMb } : p));
}

module.exports = { top, summarise, friendly, withoutAiKeep };
// <Jun Kai end>
