// Owner: Role 3, Jun Kai.
// Unit tests for the 24-hour strip of the System Health cards. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../../backend/features/health/history');

const HALF = 30 * 60 * 1000;
const FROM = Date.UTC(2026, 10, 11, 16, 0); // midnight in Singapore

test('one letter per half hour, oldest first, and "-" where nothing was checked', () => {
    const rows = [
        { key: 'database', t: FROM + 1000, status: 'ok' },
        { key: 'database', t: FROM + 2 * HALF + 5000, status: 'ok' }
    ];
    assert.deepEqual(history.slotsOf(rows, { from: FROM, slots: 4 }), { database: 'o-o-' });
});

test('a block shows the worst result in it', () => {
    const rows = [
        { key: 'kiosk', t: FROM + 60000, status: 'ok' },
        { key: 'kiosk', t: FROM + 120000, status: 'down' },
        { key: 'kiosk', t: FROM + 180000, status: 'warn' },
        { key: 'kiosk', t: FROM + HALF + 60000, status: 'unknown' },
        { key: 'kiosk', t: FROM + HALF + 120000, status: 'ok' },
        { key: 'kiosk', t: FROM + 2 * HALF + 60000, status: 'unknown' }
    ];
    assert.deepEqual(history.slotsOf(rows, { from: FROM, slots: 3 }), { kiosk: 'dou' });
});

test('results outside the 24 hours and unknown words are left out; each check has its own strip', () => {
    const rows = [
        { key: 'disk', t: FROM - 1, status: 'down' },
        { key: 'disk', t: FROM + 48 * HALF, status: 'down' },
        { key: 'disk', t: FROM + 47 * HALF, status: 'warn' },
        { key: 'email', t: FROM, status: 'broken' },
        { key: 'email', t: FROM + HALF, status: 'ok' }
    ];
    const out = history.slotsOf(rows, { from: FROM });
    assert.equal(out.disk.length, 48);
    assert.equal(out.disk, `${'-'.repeat(47)}w`);
    assert.equal(out.email, `-o${'-'.repeat(46)}`);
    assert.deepEqual(history.slotsOf([], { from: FROM }), {});
});
// <Jun Kai end>
