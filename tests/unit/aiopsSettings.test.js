// Owner: Role 3, Jun Kai.
// Unit tests for the anomaly detection settings: the defaults, the repair on read, validate. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const paths = require('../../backend/core/paths');
const settings = require('../../backend/features/aiops/settings');

const clone = (value) => JSON.parse(JSON.stringify(value));
const defaults = () => clone(settings.DEFAULTS);
// always pass the previous settings, so the real backend/data file is never read
const check = (changes, previous = defaults()) => settings.validate(changes, previous);

test('the settings module loads without the database or the health checks', () => {
    const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, '/'));
    assert.deepEqual(loaded.filter((file) => /backend\/(core\/db|features\/health\/checks)\.js$/.test(file)), []);
});

test('DEFAULTS is complete and the committed defaults file is DEFAULTS', () => {
    for (const key of Object.keys(settings.LIMITS)) if (key !== 'sensitivity') assert.ok(key in settings.DEFAULTS, `${key} has a default`);
    assert.deepEqual(Object.keys(settings.DEFAULTS.detectors), settings.DETECTORS.map((d) => d.key));
    for (const d of settings.DETECTORS) {
        assert.deepEqual(settings.DEFAULTS.detectors[d.key], { enabled: true, sensitivity: 3 });
        assert.ok(d.label && d.description, `${d.key} has a label and a description`);
    }
    const file = JSON.parse(fs.readFileSync(path.join(paths.DEFAULTS, settings.FILE_NAME), 'utf8'));
    assert.deepEqual(file, settings.DEFAULTS);
    assert.deepEqual(settings.validate(file, clone(file)).settings, file);
    assert.deepEqual(settings.repair(file), file, 'the defaults need no repair');
});

test('every number setting has limits, so read and validate can check it', () => {
    for (const [key, value] of Object.entries(settings.DEFAULTS)) {
        if (typeof value !== 'number') continue;
        assert.ok(Array.isArray(settings.LIMITS[key]), `${key} has limits`);
        const [min, max] = settings.LIMITS[key];
        assert.ok(min <= value && value <= max, `${key}'s default is inside its limits`);
    }
    // a file from before the Advanced settings repairs to their defaults
    const old = settings.repair({ enabled: true, intervalSeconds: 60 });
    for (const key of ['fixDelayMinutes', 'learnStreak', 'learnMaxSteps', 'learnWindowDays', 'cooldownMinutes', 'clearAfterMinutes', 'healthEverySeconds']) {
        assert.equal(old[key], settings.DEFAULTS[key], `${key} falls back to its default`);
    }
});

test('read repairs a hand-edited file: numbers are clamped, odd switches default to on, unknown keys go', () => {
    const repaired = settings.repair({
        enabled: false, quietHours: 'no', intervalSeconds: 5, healthEverySeconds: 99999, retentionDays: 'soon',
        cooldownMinutes: 0, clearAfterMinutes: 7.6, bogus: 1,
        detectors: { spike: { enabled: false, sensitivity: 9 }, logs: { sensitivity: 0 }, drift: 'off', extra: { enabled: true } }
    });
    assert.equal(repaired.enabled, false);
    assert.equal(repaired.quietHours, true);
    assert.equal(repaired.intervalSeconds, 30);
    assert.equal(repaired.healthEverySeconds, 3600);
    assert.equal(repaired.retentionDays, 30);
    assert.equal(repaired.cooldownMinutes, 0, '0 is a real value, not a missing one');
    assert.equal(repaired.clearAfterMinutes, 8);
    assert.equal('bogus' in repaired, false);
    assert.deepEqual(repaired.detectors.spike, { enabled: false, sensitivity: 5 });
    assert.deepEqual(repaired.detectors.logs, { enabled: true, sensitivity: 1 });
    assert.deepEqual(repaired.detectors.drift, { enabled: true, sensitivity: 3 });
    assert.equal('extra' in repaired.detectors, false);
    assert.deepEqual(Object.keys(repaired.detectors), settings.DETECTORS.map((d) => d.key));
    for (const broken of [null, [], 'text', 42, { detectors: [] }]) assert.deepEqual(settings.repair(broken), settings.DEFAULTS, String(broken));
});

test('validate refuses out-of-range and non-whole numbers and names the field', () => {
    for (const key of Object.keys(settings.LIMITS)) {
        if (key === 'sensitivity') continue;
        const [min, max] = settings.LIMITS[key];
        assert.equal(check({ [key]: min }).settings[key], min);
        assert.equal(check({ [key]: max }).settings[key], max);
        assert.equal(check({ [key]: String(max) }).settings[key], max, 'a number typed as text is fine');
        for (const bad of [min - 1, max + 1, min + 0.5, 'abc', '', null, true]) {
            const result = check({ [key]: bad });
            assert.equal(result.field, key, `${key} = ${bad}`);
            assert.match(result.error, /whole number/);
        }
    }
    assert.equal(check({ detectors: { tablets: { sensitivity: 1 } } }).settings.detectors.tablets.sensitivity, 1);
    assert.equal(check({ detectors: { tablets: { sensitivity: 5 } } }).settings.detectors.tablets.sensitivity, 5);
    assert.equal(check({ detectors: { tablets: { sensitivity: 6 } } }).field, 'detectors.tablets.sensitivity');
    assert.equal(check({ detectors: { tablets: { sensitivity: 0 } } }).field, 'detectors.tablets.sensitivity');
    assert.equal(check({ detectors: { tablets: { sensitivity: 2.5 } } }).field, 'detectors.tablets.sensitivity');
});

test('validate wants real booleans for the switches', () => {
    for (const key of ['enabled', 'quietHours']) {
        assert.equal(check({ [key]: false }).settings[key], false);
        for (const bad of ['yes', 'true', 1, 0, null]) {
            const result = check({ [key]: bad });
            assert.equal(result.field, key, `${key} = ${bad}`);
            assert.equal(result.error, 'Choose on or off.');
        }
    }
    assert.equal(check({ detectors: { drift: { enabled: false } } }).settings.detectors.drift.enabled, false);
    assert.equal(check({ detectors: { drift: { enabled: 'off' } } }).field, 'detectors.drift.enabled');
    assert.equal(check({ detectors: { drift: { enabled: 0 } } }).field, 'detectors.drift.enabled');
});

test('validate refuses anything that is not an object', () => {
    for (const bad of [null, undefined, 'text', 7, [], true]) {
        const result = settings.validate(bad, defaults());
        assert.equal(result.field, '');
        assert.match(result.error, /JSON object/);
    }
});

test('a partial body keeps the previous values and unknown keys are ignored', () => {
    const previous = { ...defaults(), intervalSeconds: 120, cooldownMinutes: 0 };
    previous.detectors.tablets.sensitivity = 5;
    const result = check({ healthEverySeconds: 600, detectors: { spike: { enabled: false }, nope: { enabled: true } }, bogus: 1 }, previous);
    assert.ok(result.settings, result.error);
    assert.equal(result.settings.healthEverySeconds, 600);
    assert.equal(result.settings.intervalSeconds, 120);
    assert.equal(result.settings.cooldownMinutes, 0);
    assert.deepEqual(result.settings.detectors.spike, { enabled: false, sensitivity: 3 });
    assert.deepEqual(result.settings.detectors.tablets, { enabled: true, sensitivity: 5 });
    assert.equal('nope' in result.settings.detectors, false);
    assert.equal('bogus' in result.settings, false);
    assert.deepEqual(Object.keys(result.settings), Object.keys(settings.DEFAULTS));
    assert.deepEqual(check({}, previous).settings, previous, 'an empty body changes nothing');
    assert.deepEqual(check({}, { intervalSeconds: 5 }).settings, { ...settings.DEFAULTS, intervalSeconds: 30 }, 'a broken previous value is repaired first');
});

test('every fix starts at "Ask first"; a mode outside its list is refused, and a hand-edited one is repaired', () => {
    assert.deepEqual(settings.DEFAULTS.fixes, { 'start-kiosk': 'ask' });
    assert.equal(settings.DEFAULTS.offerFixes, true);
    assert.equal(check({ fixes: { 'start-kiosk': 'auto' } }).settings.fixes['start-kiosk'], 'auto');
    assert.equal(check({ fixes: { 'start-kiosk': 'delayed' } }).settings.fixes['start-kiosk'], 'delayed');
    assert.deepEqual(check({ fixes: { 'start-kiosk': 'sometimes' } }), { field: 'fixes.start-kiosk', error: 'Choose ask, delayed, auto.' });
    assert.equal(check({ fixes: { 'unknown-fix': 'auto' } }).settings.fixes['unknown-fix'], undefined, 'a fix the app does not have is ignored');
    assert.deepEqual(check({ offerFixes: 'yes' }), { field: 'offerFixes', error: 'Choose on or off.' });
    assert.equal(check({ offerFixes: false }).settings.offerFixes, false);
    assert.deepEqual(settings.repair({ fixes: { 'start-kiosk': 'always' } }).fixes, { 'start-kiosk': 'ask' });
    assert.equal(settings.repair({ offerFixes: 'no' }).offerFixes, true, 'a switch is on unless exactly false');
});
// <Jun Kai end>
