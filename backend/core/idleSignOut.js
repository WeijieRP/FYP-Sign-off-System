// Owner: Role 3, Jun Kai.
// Sign-out after no activity on the admin page: how many minutes without a click or a key press before an admin is
// signed out (0 = never), the same for every admin; a System Admin changes it on User Management. The page counts
// the time and signs out (frontend/admin/js/core.js); the server keeps the number. A browser signed in with "Keep me
// signed in" is not signed out this way (backend/core/rememberMe.js). Kept in backend/data/sign-in-settings.json
// (seeded from backend/config/defaults).
// <Jun Kai start>
const express = require('express');
const paths = require('./paths');
const { readJson, writeJsonAtomic } = require('./jsonFile');
const auth = require('./auth');
const { logAudit } = require('./audit');

const FILE_NAME = 'sign-in-settings.json';
const DEFAULTS = { idleMinutes: 30 };
// 0 means never; otherwise 5 minutes to 8 hours
const LIMITS = { idleMinutes: [5, 480] };

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// The stored minutes, repaired: 0 stays 0 (never), anything else is clamped, a broken value gives the default
function read(stored = readJson(paths.dataFile(FILE_NAME), {})) {
    const n = Number(isObject(stored) ? stored.idleMinutes : NaN);
    const [min, max] = LIMITS.idleMinutes;
    if (!Number.isFinite(n)) return { ...DEFAULTS };
    if (n === 0) return { idleMinutes: 0 };
    return { idleMinutes: Math.min(max, Math.max(min, Math.round(n))) };
}

// Returns { settings } or { error, field } and writes nothing; out of range is refused, never clamped
function validate(body) {
    if (!isObject(body)) return { error: 'Send the settings as a JSON object.', field: '' };
    const raw = body.idleMinutes;
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    const [min, max] = LIMITS.idleMinutes;
    if (!Number.isInteger(n) || (n !== 0 && (n < min || n > max))) return { error: `Choose never (0) or a whole number of minutes from ${min} to ${max}.`, field: 'idleMinutes' };
    return { settings: { idleMinutes: n } };
}

function write(settings) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), settings);
    return settings;
}

// GET /api/admin/sign-in-settings  every admin's page asks after signing in; PUT  (System Admin) { idleMinutes }
const router = express.Router();
router.get('/', auth.requireAuth, (req, res) => {
    res.json({ success: true, settings: read(), defaults: DEFAULTS, limits: LIMITS });
});
router.put('/', auth.requireAdmin, (req, res) => {
    const result = validate(req.body);
    if (result.error) return res.status(400).json({ success: false, error: result.error, field: result.field });
    try {
        write(result.settings);
        logAudit('ADMIN_IDLE_SIGNOUT_UPDATE', req.session.user.username, 'sign-in', null, req);
        res.json({ success: true, settings: result.settings });
    } catch (error) {
        console.error('❌ Could not save the sign-in settings:', error);
        res.status(500).json({ success: false, error: 'Could not save the settings' });
    }
});

module.exports = { read, validate, write, router, FILE_NAME, DEFAULTS, LIMITS };
// <Jun Kai end>
