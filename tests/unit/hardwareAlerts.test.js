// Owner: Role 3, Jun Kai.
// Unit tests for the alert lines of each part (backend/features/hardware/settings.js) and how System Health uses them
// (backend/features/health/checks.js). The settings file lives in memory here, so backend/data is never written.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');

// an in-memory backend/data for the settings module
const memory = {};
const jsonFilePath = require.resolve('../../backend/core/jsonFile');
require.cache[jsonFilePath] = {
    id: jsonFilePath, filename: jsonFilePath, loaded: true,
    exports: {
        readJson: (file, fallback) => (Object.prototype.hasOwnProperty.call(memory, file) ? JSON.parse(JSON.stringify(memory[file])) : fallback),
        writeJsonAtomic: (file, data) => { memory[file] = JSON.parse(JSON.stringify(data)); }
    }
};
const paths = require('../../backend/core/paths');
const settings = require('../../backend/features/hardware/settings');
const FILE = paths.dataFile(settings.FILE_NAME);
const reset = (data) => { for (const key of Object.keys(memory)) delete memory[key]; if (data) memory[FILE] = data; };

// the rule System Health and the Hardware page used before the alert lines could be changed
const before = (percent) => (percent >= 95 ? 'down' : percent >= 85 ? 'warn' : 'ok');

test('with a settings file from before (no alert lines) every part judges exactly as before: 85 amber, 95 red', () => {
    const alerts = settings.readAlerts({ intervalSeconds: 60, retentionDays: 30, forecastHours: 24 });
    assert.deepEqual(Object.keys(alerts), ['cpu', 'memory', 'gpu', 'disk']);
    for (const part of settings.PARTS) {
        assert.deepEqual(alerts[part], { warn: 85, critical: 95 });
        for (const percent of [0, 50, 84, 84.9, 85, 90, 94, 95, 99, 100]) assert.equal(settings.alertTone(percent, alerts[part]), before(percent), `${part} at ${percent} %`);
    }
    assert.equal(settings.alertTone(null, alerts.cpu), 'unknown');
});

test('a broken part in a hand-edited file falls back to 85 / 95, the others keep their lines', () => {
    const alerts = settings.readAlerts({ alerts: { cpu: { warn: 70, critical: 90 }, memory: { warn: 96, critical: 90 }, gpu: { warn: 'x' }, disk: { warn: 10, critical: 50 } } });
    assert.deepEqual(alerts.cpu, { warn: 70, critical: 90 });
    assert.deepEqual(alerts.memory, { warn: 85, critical: 95 }, 'red below amber');
    assert.deepEqual(alerts.gpu, { warn: 85, critical: 95 }, 'not numbers');
    assert.deepEqual(alerts.disk, { warn: 85, critical: 95 }, 'amber under the 30 % floor');
});

test('validateAlerts: whole numbers in range, red above amber, the field named, a part left out keeps its line', () => {
    const previous = settings.readAlerts({});
    assert.deepEqual(settings.validateAlerts({ cpu: { warn: 70, critical: 90 } }, previous).alerts, { ...previous, cpu: { warn: 70, critical: 90 } });
    assert.deepEqual(settings.validateAlerts({ disk: { warn: '80', critical: '90' } }, previous).alerts.disk, { warn: 80, critical: 90 }, 'digits as text are fine');
    assert.deepEqual(settings.validateAlerts({ gpu: { warn: 29 } }, previous), { error: 'Enter a whole number from 30 to 99.', field: 'gpu.warn' });
    assert.deepEqual(settings.validateAlerts({ gpu: { critical: 101 } }, previous), { error: 'Enter a whole number from 31 to 100.', field: 'gpu.critical' });
    assert.equal(settings.validateAlerts({ memory: { warn: 85.5 } }, previous).field, 'memory.warn');
    assert.deepEqual(settings.validateAlerts({ memory: { warn: 90, critical: 90 } }, previous), { error: 'Red must be higher than amber.', field: 'memory.critical' });
    assert.equal(settings.validateAlerts(null, previous).field, '');
    assert.equal(settings.validateAlerts([], previous).field, '');
    // red at 100 means only a full 100 % is critical
    assert.equal(settings.alertTone(99, settings.validateAlerts({ gpu: { warn: 95, critical: 100 } }, previous).alerts.gpu), 'warn');
});

test('saving the sampling keeps the alert lines, and saving the alert lines keeps the sampling', () => {
    reset({ intervalSeconds: 60, retentionDays: 30, forecastHours: 24 });
    settings.writeAlerts(settings.validateAlerts({ cpu: { warn: 70, critical: 90 } }).alerts);
    assert.deepEqual(settings.read(), { intervalSeconds: 60, retentionDays: 30, forecastHours: 24 }, 'the sampling is still there');
    const sampling = settings.validate({ intervalSeconds: 120, retentionDays: 14, forecastHours: 48 });
    settings.write(sampling.settings);
    assert.deepEqual(settings.read(), { intervalSeconds: 120, retentionDays: 14, forecastHours: 48 });
    assert.deepEqual(settings.readAlerts().cpu, { warn: 70, critical: 90 }, 'the CPU line survived the sampling save');
    // what the forecast check builds from the stored settings is untouched by the lines
    assert.deepEqual(settings.validate({ ...settings.read(), forecastHours: 720 }).settings, { intervalSeconds: 120, retentionDays: 14, forecastHours: 720 });
    reset();
});

test('System Health takes the worse of CPU and memory for the Server PC card', () => {
    assert.equal(settings.worstTone('ok', 'warn'), 'warn');
    assert.equal(settings.worstTone('down', 'warn'), 'down');
    assert.equal(settings.worstTone('ok', 'ok'), 'ok');
    assert.equal(settings.worstTone('unknown', 'ok'), 'ok');
});
// <Jun Kai end>
