// Owner: Role 3, Jun Kai.
// Health checks behind the admin System Health page. Every check answers
// { key, label, status: ok | warn | down | unknown | off, summary, detail, latencyMs } and never throws. off: switched
// off on purpose (Ollama while the Local AI models switch is off), never a problem.
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const db = require('../../core/db');
const paths = require('../../core/paths');
const serverControl = require('../serverControl/control');
const scheduler = require('../serverControl/scheduler');
const emailService = require('../email/service');
// <Jun Kai start>
const tabletNames = require('./tabletNames');
// the alert lines of each part (Hardware page, Alert lines) and when a tablet counts as offline (Tablets, Offline after)
const hardwareSettings = require('../hardware/settings');
const healthSettings = require('./settings');
const aiopsSettings = require('../aiops/settings');
const tabletWindowSeconds = () => healthSettings.read().tabletOfflineMinutes * 60;
// <Jun Kai end>

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMAIL_CACHE_MS = 5 * 60 * 1000; // an SMTP verify talks to Gmail, so keep the result for a while

const query = (fn, sql, params) => new Promise((resolve, reject) => db[fn](sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms))
]);
async function timed(fn) {
    const started = process.hrtime.bigint();
    const value = await fn();
    return { value, ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6) };
}

function getJson(url, ms) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: ms }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, body: null }); }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`timed out after ${ms} ms`)));
        req.on('error', reject);
    });
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------- the checks
async function checkDatabase() {
    const base = { key: 'database', label: 'MySQL database' };
    try {
        const { value, ms } = await timed(() => withTimeout(query('get', 'SELECT VERSION() AS version, DATABASE() AS name', []), 5000, 'MySQL'));
        return { ...base, status: ms > 1000 ? 'warn' : 'ok', summary: `MySQL ${value.version} answered in ${ms} ms`, detail: { database: value.name, host: process.env.DB_HOST || 'localhost' }, latencyMs: ms };
    } catch (error) {
        return { ...base, status: 'down', summary: 'Not reachable', detail: { error: error.message, hint: 'Check that the MySQL84 service is running' }, latencyMs: null };
    }
}

async function checkOllama() {
    const base = { key: 'ollama', label: 'Ollama (local LLM)' };
    // <Jun Kai start> nothing in the app uses Ollama (AI Settings page: the advisor and the Feedback Reports modes are off), so it is not even asked
    if (!aiopsSettings.localAiOn()) {
        return { ...base, status: 'off', summary: 'Switched off on the AI Settings page', detail: { url: OLLAMA_URL, hint: 'The incident advisor and the Feedback Reports AI modes are switched off on the AI Settings page.' }, latencyMs: null };
    }
    // <Jun Kai end>
    try {
        const { value, ms } = await timed(() => withTimeout(getJson(`${OLLAMA_URL}/api/tags`, 4000), 4000, 'Ollama'));
        const models = Array.isArray(value.body && value.body.models) ? value.body.models.map((m) => m.name) : [];
        if (value.status !== 200) return { ...base, status: 'down', summary: `Answered HTTP ${value.status}`, detail: { url: OLLAMA_URL }, latencyMs: ms };
        return {
            ...base,
            status: models.length ? 'ok' : 'warn',
            summary: models.length ? `${models.length} model${models.length === 1 ? '' : 's'} ready, ${ms} ms` : 'Running but no model is pulled',
            detail: { url: OLLAMA_URL, models, hint: models.length ? null : 'Run "ollama pull qwen2.5:3b" (or the model chosen in Feedback Reports)' },
            latencyMs: ms
        };
    } catch (error) {
        return { ...base, status: 'down', summary: 'Not running', detail: { url: OLLAMA_URL, error: error.message, hint: 'Start Ollama; the qwen, gemma and localgpt analysis modes need it' }, latencyMs: null };
    }
}

async function checkDisk() {
    const base = { key: 'disk', label: 'Disk space' };
    try {
        const stats = await fs.promises.statfs(paths.ROOT);
        const total = stats.blocks * stats.bsize;
        const free = stats.bavail * stats.bsize;
        const usedPercent = total ? Math.round((1 - free / total) * 100) : 0;
        const gb = (n) => (n / 1024 ** 3).toFixed(1);
        return {
            ...base,
            // <Jun Kai start> the Disk alert line of the Hardware page (85 / 95 unless changed there)
            status: hardwareSettings.alertTone(usedPercent, hardwareSettings.readAlerts().disk),
            // <Jun Kai end>
            summary: `${gb(free)} GB free of ${gb(total)} GB (${usedPercent}% used)`,
            detail: { path: paths.ROOT, freeBytes: free, totalBytes: total, usedPercent },
            latencyMs: null
        };
    } catch (error) {
        return { ...base, status: 'unknown', summary: 'Could not read the disk', detail: { error: error.message }, latencyMs: null };
    }
}

function checkKiosk() {
    const base = { key: 'kiosk', label: 'Kiosk server (:3003)' };
    return new Promise((resolve) => {
        const started = Date.now();
        serverControl.resolveKioskStatus((result) => {
            const ms = Date.now() - started;
            resolve(result.running
                ? { ...base, status: 'ok', summary: `Reachable, ${ms} ms`, detail: { status: result.status, source: result.source }, latencyMs: ms }
                : { ...base, status: 'down', summary: 'Not reachable', detail: { status: result.status, source: result.source, hint: 'Start it from Operating Hours or check logs/' }, latencyMs: ms });
        });
    });
}

let emailCache = { at: 0, result: null };
async function checkEmail(force = false) {
    const base = { key: 'email', label: 'Email (SMTP)' };
    if (!force && emailCache.result && Date.now() - emailCache.at < EMAIL_CACHE_MS) return { ...emailCache.result, cached: true };
    let result;
    try {
        const { value, ms } = await timed(() => withTimeout(emailService.checkEmailService(), 15000, 'SMTP check'));
        result = value.available && value.verified
            ? { ...base, status: 'ok', summary: `${value.service || 'SMTP'} login works, ${ms} ms`, detail: { provider: value.service, sender: value.sender }, latencyMs: ms }
            : { ...base, status: 'down', summary: 'Cannot log in to the mail server', detail: { sender: value.sender, error: value.error || 'verification failed', hint: 'Check the Mail Account page' }, latencyMs: ms };
    } catch (error) {
        result = { ...base, status: 'down', summary: 'Cannot reach the mail server', detail: { error: error.message }, latencyMs: null };
    }
    emailCache = { at: Date.now(), result };
    return result;
}

function cpuTimes() {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        for (const value of Object.values(cpu.times)) total += value;
        idle += cpu.times.idle;
    }
    return { idle, total };
}

async function checkServer() {
    const before = cpuTimes();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = cpuTimes();
    const busy = after.total - before.total;
    const cpuPercent = busy ? Math.round((1 - (after.idle - before.idle) / busy) * 100) : 0;
    const totalMem = os.totalmem();
    const memoryPercent = Math.round((1 - os.freemem() / totalMem) * 100);
    const rss = process.memoryUsage().rss;
    const alerts = hardwareSettings.readAlerts(); // <Jun Kai/>
    return {
        key: 'server',
        label: 'Server PC',
        // <Jun Kai start>
        // the CPU and Memory alert lines of the Hardware page (85 / 95 unless changed there); the worse of the two
        status: hardwareSettings.worstTone(hardwareSettings.alertTone(cpuPercent, alerts.cpu), hardwareSettings.alertTone(memoryPercent, alerts.memory)),
        summary: `CPU ${cpuPercent}%, memory ${memoryPercent}%`,
        // <Jun Kai end>
        detail: {
            // <Jun Kai start>
            uptime: formatUptime(os.uptime()),
            // <Jun Kai end>
            hostname: os.hostname(),
            platform: `${os.type()} ${os.release()}`,
            node: process.version,
            cpuPercent,
            cpuCount: os.cpus().length,
            memoryPercent,
            memoryTotalGb: (totalMem / 1024 ** 3).toFixed(1),
            processMemoryMb: Math.round(rss / 1024 ** 2),
            processUptime: formatUptime(process.uptime()),
            localTime: new Date().toLocaleString('en-SG', { hour12: false }),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        latencyMs: null
    };
}

// <Jun Kai start>
let heartbeatTableWarned = false;
async function checkTablets() {
    const base = { key: 'tablets', label: 'Tablets' };
    try {
        const rows = await query('all', `
            SELECT device_id, label, page, user_agent, ip, first_seen, last_seen,
                   TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago
            FROM device_heartbeats
            ORDER BY last_seen DESC
            LIMIT 50`, []);
        const names = tabletNames.all();
        const windowSeconds = tabletWindowSeconds(); // <Jun Kai/> Offline after, on the Tablets list (3 minutes by default)
        const devices = tabletNames.sortDevices(rows.map((r) => ({ ...r, name: names[r.device_id] || null, online: r.seconds_ago <= windowSeconds })));
        const online = devices.filter((d) => d.online);
        let status = 'ok';
        let summary = `${online.length} online of ${devices.length} known`;
        if (!devices.length) { status = 'unknown'; summary = 'No tablet has reported yet'; }
        else if (!online.length) { status = 'warn'; summary = `None of the ${devices.length} known tablets reported in the last ${windowSeconds / 60} minutes`; }
        return { ...base, status, summary, detail: { devices, onlineWindowSeconds: windowSeconds }, latencyMs: null };
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            if (!heartbeatTableWarned) { heartbeatTableWarned = true; console.warn('⚠️ device_heartbeats table is missing: run npm run db:migrate'); }
            return { ...base, status: 'unknown', summary: 'Heartbeat table missing: run npm run db:migrate', detail: { devices: [] }, latencyMs: null };
        }
        return { ...base, status: 'unknown', summary: 'Could not read the heartbeats', detail: { devices: [], error: error.message }, latencyMs: null };
    }
}
// <Jun Kai end>

function checkAutomation() {
    const base = { key: 'automation', label: 'Schedules' };
    return new Promise((resolve) => {
        scheduler.getStatus((a) => {
            let status = 'ok';
            // <Jun Kai start>
            let summary = `${a.activeSchedules} enabled polic${a.activeSchedules === 1 ? 'y' : 'ies'}, AUTO mode`;
            if (!a.enabled) { status = 'unknown'; summary = 'Automation is off on this machine'; }
            else if (a.mode !== 'auto') { status = 'warn'; summary = 'Manual mode: policies are paused'; }
            else if (!a.activeSchedules) { status = 'warn'; summary = 'AUTO mode but no enabled policy'; }
            else if (!a.activePolicies) { status = 'warn'; summary = 'AUTO mode but no Active policy, so the kiosk never runs'; }
            // <Jun Kai end>
            resolve({
                ...base,
                status,
                summary,
                // <Jun Kai start>
                // manual mode pauses the policies: no planned stop or start
                detail: {
                    mode: a.mode,
                    nextStop: a.mode === 'auto' ? a.nextStop : null,
                    nextStart: a.mode === 'auto' ? a.nextStart : null,
                    // <Jun Kai end>
                    lastEvent: a.events && a.events[0] ? a.events[0] : null
                },
                latencyMs: null
            });
        });
    });
}

// <Jun Kai start>
// `skip`: the checks this admin removed from the page; they are not run at all
async function runAll({ refreshEmail = false, skip = [] } = {}) {
    const all = {
        database: checkDatabase, kiosk: checkKiosk, disk: checkDisk, server: checkServer,
        ollama: checkOllama, email: () => checkEmail(refreshEmail), tablets: checkTablets, automation: checkAutomation
    };
    const checks = await Promise.all(Object.keys(all).filter((key) => !skip.includes(key)).map((key) => all[key]()));
    // <Jun Kai end>
    const counts = { ok: 0, warn: 0, down: 0, unknown: 0 };
    for (const check of checks) counts[check.status] = (counts[check.status] || 0) + 1;
    return {
        checkedAt: new Date().toISOString(),
        overall: counts.down ? 'down' : counts.warn ? 'warn' : 'ok',
        counts,
        checks
    };
}

module.exports = { runAll, checkDatabase, checkOllama, checkDisk, checkKiosk, checkEmail, checkServer, checkTablets, checkAutomation, OLLAMA_URL };
