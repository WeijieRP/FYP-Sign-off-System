// Owner: Role 3, Jun Kai.
// System Health settings for every admin (a System Admin changes them): how long a tablet may stay quiet before the
// Tablets list calls it offline. Incidents have their own minutes (Incidents > Settings, Named tablets offline).
// Kept in backend/data/health-settings.json (seeded from backend/config/defaults).
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const FILE_NAME = 'health-settings.json';
const DEFAULTS = { tabletOfflineMinutes: 3 };
// tablets report once a minute (frontend/feedback/js/heartbeat.js), so a shorter window would flicker
const LIMITS = { tabletOfflineMinutes: [2, 30] };

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// The stored settings, every key repaired (clamped, or the default when it is not a number)
function read(stored = readJson(paths.dataFile(FILE_NAME), {})) {
    const s = isObject(stored) ? stored : {};
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) {
        const n = Number(s[key]);
        const [min, max] = LIMITS[key];
        settings[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : DEFAULTS[key];
    }
    return settings;
}

// Returns { settings } or { error, field } and writes nothing; a key left out keeps its value, out of range is refused
function validate(body, previous = read()) {
    if (!isObject(body)) return { error: 'Send the settings as a JSON object.', field: '' };
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) {
        const raw = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : previous[key];
        const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
        const [min, max] = LIMITS[key];
        if (!Number.isInteger(n) || n < min || n > max) return { error: `Enter a whole number from ${min} to ${max}.`, field: key };
        settings[key] = n;
    }
    return { settings };
}

function write(settings) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), settings);
    return settings;
}

module.exports = { read, validate, write, FILE_NAME, DEFAULTS, LIMITS };
// <Jun Kai end>
