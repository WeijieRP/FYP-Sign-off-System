// Owner: Role 3, Jun Kai.
// Unit tests for "keep me signed in for 1 day" (the pure parts of backend/core/rememberMe.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const remember = require('../../backend/core/rememberMe');

const NOW = Date.UTC(2026, 10, 12, 4, 0);
const at = (ms) => new Date(NOW + ms).toISOString();
const HOUR = 3600 * 1000;

test('the token cookie is read from the header among other cookies', () => {
    assert.equal(remember.readCookie('connect.sid=s%3Aabc; esg_admin_remember=tok-123; theme=dark'), 'tok-123');
    assert.equal(remember.readCookie('esg_admin_remember=a%2Bb'), 'a+b');
    assert.equal(remember.readCookie('other=1'), null);
    assert.equal(remember.readCookie(''), null);
    assert.equal(remember.readCookie(undefined), null);
    assert.equal(remember.readCookie('esg_admin_remember=%E0%A4%A'), null, 'a broken cookie is ignored');
});

test('a token is found by its hash only while it has not expired', () => {
    const records = [
        { hash: remember.sha256('good'), userId: 1, expiresAt: at(HOUR) },
        { hash: remember.sha256('old'), userId: 1, expiresAt: at(-1) }
    ];
    assert.equal(remember.findRecord(records, 'good', NOW).userId, 1);
    assert.equal(remember.findRecord(records, 'old', NOW), null);
    assert.equal(remember.findRecord(records, 'unknown', NOW), null);
    assert.equal(remember.findRecord(records, '', NOW), null);
    assert.equal(records.some((r) => r.hash === 'good'), false, 'the token itself is never stored');
});

test('pruning drops expired tokens and keeps the newest ten per admin', () => {
    const records = [];
    for (let i = 0; i < 12; i++) records.push({ hash: `a${i}`, userId: 1, createdAt: at(i * 1000), expiresAt: at(HOUR) });
    records.push({ hash: 'expired', userId: 2, createdAt: at(0), expiresAt: at(-5) });
    records.push({ hash: 'b0', userId: 2, createdAt: at(0), expiresAt: at(HOUR) });
    const kept = remember.prune(records, NOW);
    assert.equal(kept.filter((r) => r.userId === 1).length, remember.MAX_PER_USER);
    assert.equal(kept.some((r) => r.hash === 'a0') || kept.some((r) => r.hash === 'a1'), false, 'the two oldest of admin 1 go');
    assert.deepEqual(kept.filter((r) => r.userId === 2).map((r) => r.hash), ['b0']);
    assert.deepEqual(remember.prune(null, NOW), []);
});

test('a new password ends the tokens made with the old one', () => {
    assert.notEqual(remember.passwordMark('$2b$12$old'), remember.passwordMark('$2b$12$new'));
    assert.equal(remember.passwordMark('$2b$12$same'), remember.passwordMark('$2b$12$same'));
    assert.equal(remember.passwordMark('$2b$12$same').length, 16);
    assert.equal(remember.LIFETIME_MS, 24 * HOUR, 'one day');
});
// <Jun Kai end>
