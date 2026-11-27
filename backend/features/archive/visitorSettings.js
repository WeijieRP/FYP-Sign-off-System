// Owner: Role 3, Jun Kai.
// Settings of the Visitor Data Archive page, kept in backend/data/visitor-archive-settings.json (seeded from backend/config/defaults).
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');
const files = require('./visitorFiles');

const FILE_NAME = 'visitor-archive-settings.json';
const DEFAULTS = {
    feedback: { enabled: true, keep: { amount: 12, unit: 'months' } },
    lostFound: { enabled: true, keep: { amount: 12, unit: 'months' }, onlyResolved: false },
    includePhotos: true,
    deleteAfterArchive: true,
    leaves: 'keep',
    automatic: { enabled: false, frequency: 'monthly', dayOfMonth: 1, weekday: 1, everyDays: 30, time: '', enabledAt: null },
    folder: '',
    keepFiles: { amount: 0, unit: 'years' }
};
// [min, max] like the Hardware settings; keepFiles.amount 0 means keep forever
const LIMITS = {
    keep: { days: [1, 3650], weeks: [1, 520], months: [1, 120], years: [1, 10] },
    keepFiles: { months: [1, 240], years: [1, 20] },
    frequency: ['daily', 'weekly', 'monthly', 'custom'],
    dayOfMonth: [1, 28],
    weekday: [0, 6],
    everyDays: [1, 365],
    folderMaxLength: 400,
    // what happens to a visitor's leaf on the digital tree when their records are archived and deleted:
    // keep (the leaf stays, no name), initials (it stays with initials), remove (it goes, the year book counts it)
    leaves: ['keep', 'initials', 'remove']
};
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// also used by the scheduler when a hand-edited file has both switched on
const EXPORT_ONLY_AUTOMATIC = 'Automatic archiving needs Delete the records from the database. With export only, every run would save the same records again.';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function clampInt(value, [min, max], fallback) {
    const n = Number(value);
    return Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : fallback)));
}

function validDate(value) {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function readKeep(stored, fallback, units) {
    const s = isObject(stored) ? stored : {};
    const unit = has(units, s.unit) ? s.unit : fallback.unit;
    return { amount: clampInt(s.amount, units[unit], fallback.amount), unit };
}

// The saved settings with every key repaired, so a hand-edited file can never break the page
function read() {
    const s = readJson(paths.dataFile(FILE_NAME), {});
    const stored = isObject(s) ? s : {};
    const fb = isObject(stored.feedback) ? stored.feedback : {};
    const lf = isObject(stored.lostFound) ? stored.lostFound : {};
    const auto = isObject(stored.automatic) ? stored.automatic : {};
    const kf = isObject(stored.keepFiles) ? stored.keepFiles : {};
    const filesUnit = has(LIMITS.keepFiles, kf.unit) ? kf.unit : DEFAULTS.keepFiles.unit;
    const filesAmount = Number(kf.amount) > 0 ? clampInt(kf.amount, LIMITS.keepFiles[filesUnit], 1) : 0;
    // the text only: read() runs on every poll, so the place of the folder is checked on save and at run time
    const folder = typeof stored.folder === 'string' && !files.folderTextProblem(stored.folder) ? stored.folder.trim() : '';
    const enabled = auto.enabled === true;
    return {
        feedback: { enabled: fb.enabled !== false, keep: readKeep(fb.keep, DEFAULTS.feedback.keep, LIMITS.keep) },
        lostFound: { enabled: lf.enabled !== false, keep: readKeep(lf.keep, DEFAULTS.lostFound.keep, LIMITS.keep), onlyResolved: lf.onlyResolved === true },
        includePhotos: stored.includePhotos !== false,
        deleteAfterArchive: stored.deleteAfterArchive !== false,
        leaves: LIMITS.leaves.includes(stored.leaves) ? stored.leaves : DEFAULTS.leaves,
        automatic: {
            enabled,
            frequency: LIMITS.frequency.includes(auto.frequency) ? auto.frequency : DEFAULTS.automatic.frequency,
            dayOfMonth: clampInt(auto.dayOfMonth, LIMITS.dayOfMonth, DEFAULTS.automatic.dayOfMonth),
            weekday: clampInt(auto.weekday, LIMITS.weekday, DEFAULTS.automatic.weekday),
            everyDays: clampInt(auto.everyDays, LIMITS.everyDays, DEFAULTS.automatic.everyDays),
            time: TIME_PATTERN.test(auto.time) ? auto.time : '',
            enabledAt: enabled ? validDate(auto.enabledAt) : null
        },
        folder,
        keepFiles: { amount: filesAmount, unit: filesUnit }
    };
}

// Each check returns { value } or { error, field } (field is the dotted settings key the page highlights)
const fail = (field, error) => ({ error, field });

function boolField(value, field) {
    return typeof value === 'boolean' ? { value } : fail(field, 'Choose on or off.');
}

function intField(value, [min, max], field) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (!Number.isInteger(n) || n < min || n > max) return fail(field, `Enter a whole number from ${min} to ${max}.`);
    return { value: n };
}

function keepField(value, field) {
    if (!isObject(value)) return fail(field, 'Choose how long to keep these records.');
    if (!has(LIMITS.keep, value.unit)) return fail(`${field}.unit`, 'Choose days, weeks, months or years.');
    const amount = intField(value.amount, LIMITS.keep[value.unit], `${field}.amount`);
    return amount.error ? amount : { value: { amount: amount.value, unit: value.unit } };
}

function keepFilesField(value) {
    if (!isObject(value)) return fail('keepFiles', 'Choose how long to keep archive files.');
    const raw = typeof value.amount === 'string' && value.amount.trim() !== '' ? Number(value.amount) : value.amount;
    if (raw === 0) return { value: { amount: 0, unit: has(LIMITS.keepFiles, value.unit) ? value.unit : 'years' } };
    if (!has(LIMITS.keepFiles, value.unit)) return fail('keepFiles.unit', 'Choose months or years.');
    const amount = intField(value.amount, LIMITS.keepFiles[value.unit], 'keepFiles.amount');
    return amount.error ? amount : { value: { amount: amount.value, unit: value.unit } };
}

function timeField(value) {
    if (value === '' || (typeof value === 'string' && TIME_PATTERN.test(value))) return { value };
    return fail('automatic.time', 'Enter a time like 09:30, or choose Any time.');
}

function folderField(value) {
    const problem = typeof value === 'string' ? files.folderProblem(value) : 'Enter the folder as text.';
    return problem ? fail('folder', problem) : { value: value.trim() };
}

// Returns { settings } or { error, field } and writes nothing. Out-of-range values are refused, never clamped.
// Keys the body leaves out keep their previous value; automatic.enabledAt is set here, never taken from the client.
function validate(body, previous = read()) {
    if (!isObject(body)) return fail('', 'Send the settings as a JSON object.');
    const part = (key) => ({ ...previous[key], ...(isObject(body[key]) ? body[key] : {}) });
    const top = (key) => (has(body, key) ? body[key] : previous[key]);
    const feedback = part('feedback');
    const lostFound = part('lostFound');
    const automatic = part('automatic');
    const checks = [
        boolField(feedback.enabled, 'feedback.enabled'),
        keepField(feedback.keep, 'feedback.keep'),
        boolField(lostFound.enabled, 'lostFound.enabled'),
        keepField(lostFound.keep, 'lostFound.keep'),
        boolField(lostFound.onlyResolved, 'lostFound.onlyResolved'),
        boolField(top('includePhotos'), 'includePhotos'),
        boolField(top('deleteAfterArchive'), 'deleteAfterArchive'),
        LIMITS.leaves.includes(top('leaves')) ? { value: top('leaves') } : fail('leaves', 'Choose keep the leaf, keep it with initials, or remove it.'),
        boolField(automatic.enabled, 'automatic.enabled'),
        LIMITS.frequency.includes(automatic.frequency) ? { value: automatic.frequency } : fail('automatic.frequency', 'Choose every day, every week, every month or custom.'),
        intField(automatic.dayOfMonth, LIMITS.dayOfMonth, 'automatic.dayOfMonth'),
        intField(automatic.weekday, LIMITS.weekday, 'automatic.weekday'),
        intField(automatic.everyDays, LIMITS.everyDays, 'automatic.everyDays'),
        timeField(automatic.time),
        folderField(top('folder')),
        keepFilesField(top('keepFiles'))
    ];
    const problem = checks.find((check) => check.error);
    if (problem) return problem;
    const [fbEnabled, fbKeep, lfEnabled, lfKeep, onlyResolved, includePhotos, deleteAfterArchive, leaves, autoEnabled, frequency, dayOfMonth, weekday, everyDays, time, folder, keepFiles] = checks.map((check) => check.value);
    if (autoEnabled && !fbEnabled && !lfEnabled) {
        return fail('automatic.enabled', 'Switch on feedback or lost & found archiving before turning on automatic archiving.');
    }
    if (autoEnabled && !deleteAfterArchive) {
        return fail('automatic.enabled', EXPORT_ONLY_AUTOMATIC);
    }
    const wasEnabled = previous.automatic && previous.automatic.enabled;
    const enabledAt = autoEnabled ? (wasEnabled && previous.automatic.enabledAt) || new Date().toISOString() : null;
    return {
        settings: {
            feedback: { enabled: fbEnabled, keep: fbKeep },
            lostFound: { enabled: lfEnabled, keep: lfKeep, onlyResolved },
            includePhotos,
            deleteAfterArchive,
            leaves,
            automatic: { enabled: autoEnabled, frequency, dayOfMonth, weekday, everyDays, time, enabledAt },
            folder,
            keepFiles
        }
    };
}

function write(settings) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), settings);
    return settings;
}

module.exports = { read, validate, write, DEFAULTS, LIMITS, FILE_NAME, EXPORT_ONLY_AUTOMATIC };
// <Jun Kai end>
