// Owner: Role 3, Jun Kai.
// Settings of the Hardware page: how often to sample, how long to keep samples, how far to forecast
// (1 hour up to 1 year; routes.js tells the page when a forecast reaches further than the samples go back), and the
// alert lines of each part (amber and red), which System Health's Server PC and Disk cards use too.
// Kept in backend/data/hardware-settings.json (seeded from backend/config/defaults).
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const FILE_NAME = 'hardware-settings.json';
const DEFAULTS = { intervalSeconds: 60, retentionDays: 30, forecastHours: 24 };
const LIMITS = { intervalSeconds: [15, 600], retentionDays: [1, 365], forecastHours: [1, 8760] };
// amber ("warn") and red ("critical") per part, in percent; red is always above amber
const PARTS = ['cpu', 'memory', 'gpu', 'disk'];
const ALERT_DEFAULTS = Object.fromEntries(PARTS.map((part) => [part, { warn: 85, critical: 95 }]));
const ALERT_LIMITS = { warn: [30, 99], critical: [31, 100] };

function clamp(key, value) {
    const [min, max] = LIMITS[key];
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS[key];
    return Math.min(max, Math.max(min, Math.round(n)));
}

function read() {
    const stored = readJson(paths.dataFile(FILE_NAME), {});
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) settings[key] = clamp(key, stored[key] ?? DEFAULTS[key]);
    return settings;
}

// Returns { settings } or { error } without writing anything
function validate(body) {
    if (!body || typeof body !== 'object') return { error: 'Send the settings as a JSON object' };
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) {
        const value = body[key] ?? DEFAULTS[key];
        const n = Number(value);
        const [min, max] = LIMITS[key];
        if (!Number.isFinite(n)) return { error: `${key} must be a number` };
        if (n < min || n > max) return { error: `${key} must be between ${min} and ${max}` };
        settings[key] = Math.round(n);
    }
    return { settings };
}

// the file as it is, so a save of the sampling keeps the alert lines and the other way round
const stored = () => {
    const data = readJson(paths.dataFile(FILE_NAME), {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
};

function write(settings) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), { ...stored(), ...settings });
    return settings;
}

// The alert lines with every part repaired: a part that is missing or broken in the file gets 85 / 95
function readAlerts(data = stored()) {
    const saved = data && data.alerts;
    const alerts = {};
    for (const part of PARTS) {
        const line = saved && typeof saved === 'object' ? saved[part] : null;
        const warn = Number(line && line.warn);
        const critical = Number(line && line.critical);
        const ok = Number.isInteger(warn) && Number.isInteger(critical) && warn >= ALERT_LIMITS.warn[0] && critical <= ALERT_LIMITS.critical[1] && warn < critical;
        alerts[part] = ok ? { warn, critical } : { ...ALERT_DEFAULTS[part] };
    }
    return alerts;
}

// Returns { alerts } or { error, field } (field like "disk.critical") and writes nothing. A part left out keeps its line.
function validateAlerts(body, previous = readAlerts()) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the alert lines as an object, one entry per part', field: '' };
    const alerts = {};
    for (const part of PARTS) {
        const line = { ...previous[part], ...(body[part] && typeof body[part] === 'object' ? body[part] : {}) };
        for (const kind of ['warn', 'critical']) {
            const n = typeof line[kind] === 'string' && line[kind].trim() !== '' ? Number(line[kind]) : line[kind];
            const [min, max] = ALERT_LIMITS[kind];
            if (!Number.isInteger(n) || n < min || n > max) return { error: `Enter a whole number from ${min} to ${max}.`, field: `${part}.${kind}` };
            line[kind] = n;
        }
        if (line.critical <= line.warn) return { error: 'Red must be higher than amber.', field: `${part}.critical` };
        alerts[part] = { warn: line.warn, critical: line.critical };
    }
    return { alerts };
}

function writeAlerts(alerts) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), { ...stored(), alerts });
    return alerts;
}

// 'ok' | 'warn' | 'down' for a reading against one part's line
function alertTone(percent, line = ALERT_DEFAULTS.cpu) {
    if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) return 'unknown';
    return Number(percent) >= line.critical ? 'down' : Number(percent) >= line.warn ? 'warn' : 'ok';
}

// the worse of several tones, e.g. the Server PC card from CPU and memory
const TONE_RANK = { unknown: 0, ok: 1, warn: 2, down: 3 };
const worstTone = (...tones) => tones.reduce((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), 'ok');

module.exports = { read, write, validate, readAlerts, validateAlerts, writeAlerts, alertTone, worstTone, FILE_NAME, DEFAULTS, LIMITS, PARTS, ALERT_DEFAULTS, ALERT_LIMITS };
// <Jun Kai end>
