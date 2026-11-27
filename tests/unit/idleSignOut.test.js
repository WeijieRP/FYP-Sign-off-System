// Owner: Role 3, Jun Kai.
// Unit tests for the sign-out after no activity setting (backend/core/idleSignOut.js). The login and audit modules are
// stand-ins, so no database is opened; read() gets the stored values handed in. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const stub = (relative, exports) => {
    const file = require.resolve(relative);
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('../../backend/core/auth', { requireAuth: (req, res, next) => next(), requireAdmin: (req, res, next) => next() });
stub('../../backend/core/audit', { logAudit: () => {} });
const paths = require('../../backend/core/paths');
const idle = require('../../backend/core/idleSignOut');

test('with no settings file the page signs out after 30 minutes, as before', () => {
    assert.deepEqual(idle.read({}), { idleMinutes: 30 });
    assert.deepEqual(idle.DEFAULTS, { idleMinutes: 30 });
    const file = JSON.parse(fs.readFileSync(path.join(paths.DEFAULTS, idle.FILE_NAME), 'utf8'));
    assert.deepEqual(file, idle.DEFAULTS, 'the committed defaults file is DEFAULTS');
});

test('read keeps 0 (never), clamps a hand-edited number to 5 minutes to 8 hours and repairs anything else', () => {
    assert.equal(idle.read({ idleMinutes: 0 }).idleMinutes, 0);
    assert.equal(idle.read({ idleMinutes: 3 }).idleMinutes, 5);
    assert.equal(idle.read({ idleMinutes: 999 }).idleMinutes, 480);
    assert.equal(idle.read({ idleMinutes: 'soon' }).idleMinutes, 30);
    assert.equal(idle.read(null).idleMinutes, 30);
    assert.equal(idle.read([]).idleMinutes, 30);
});

test('validate takes never (0) or whole minutes from 5 to 480, and names the field otherwise', () => {
    for (const ok of [0, 5, 30, 480]) assert.deepEqual(idle.validate({ idleMinutes: ok }), { settings: { idleMinutes: ok } });
    assert.deepEqual(idle.validate({ idleMinutes: '15' }), { settings: { idleMinutes: 15 } });
    for (const bad of [4, 481, 2.5, -1, 'x', null, undefined]) {
        assert.deepEqual(idle.validate({ idleMinutes: bad }), { error: 'Choose never (0) or a whole number of minutes from 5 to 480.', field: 'idleMinutes' }, String(bad));
    }
    assert.equal(idle.validate('30').field, '');
    assert.equal(idle.validate([]).field, '');
});
// <Jun Kai end>
