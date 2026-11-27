// Owner: Role 3, Jun Kai.
// Unit tests for the System Health settings (backend/features/health/settings.js): when a quiet tablet counts as
// offline. read() and validate() get the stored values handed in, so backend/data is never read. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const paths = require('../../backend/core/paths');
const settings = require('../../backend/features/health/settings');

test('with no settings file a tablet counts as offline after 3 minutes, as before', () => {
    assert.deepEqual(settings.read({}), { tabletOfflineMinutes: 3 });
    assert.equal(settings.read({}).tabletOfflineMinutes * 60, 180, 'the 180 seconds the Tablets list used before');
    const file = JSON.parse(fs.readFileSync(path.join(paths.DEFAULTS, settings.FILE_NAME), 'utf8'));
    assert.deepEqual(file, settings.DEFAULTS, 'the committed defaults file is DEFAULTS');
});

test('read repairs a hand-edited file: clamped to 2 to 30 minutes, the default when it is not a number', () => {
    assert.equal(settings.read({ tabletOfflineMinutes: 1 }).tabletOfflineMinutes, 2);
    assert.equal(settings.read({ tabletOfflineMinutes: 99 }).tabletOfflineMinutes, 30);
    assert.equal(settings.read({ tabletOfflineMinutes: 'soon' }).tabletOfflineMinutes, 3);
    assert.equal(settings.read(null).tabletOfflineMinutes, 3);
    assert.equal(settings.read([]).tabletOfflineMinutes, 3);
});

test('validate refuses out of range and odd values with the field, and a body without the key keeps the value', () => {
    const previous = { tabletOfflineMinutes: 5 };
    assert.deepEqual(settings.validate({ tabletOfflineMinutes: 10 }, previous), { settings: { tabletOfflineMinutes: 10 } });
    assert.deepEqual(settings.validate({ tabletOfflineMinutes: '15' }, previous), { settings: { tabletOfflineMinutes: 15 } });
    assert.deepEqual(settings.validate({}, previous), { settings: { tabletOfflineMinutes: 5 } });
    assert.deepEqual(settings.validate({ tabletOfflineMinutes: 1 }, previous), { error: 'Enter a whole number from 2 to 30.', field: 'tabletOfflineMinutes' });
    assert.equal(settings.validate({ tabletOfflineMinutes: 31 }, previous).field, 'tabletOfflineMinutes');
    assert.equal(settings.validate({ tabletOfflineMinutes: 2.5 }, previous).field, 'tabletOfflineMinutes');
    assert.equal(settings.validate('3', previous).field, '');
});
// <Jun Kai end>
