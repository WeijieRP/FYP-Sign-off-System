// Owner: Role 3, Jun Kai.
// Unit tests for ending the sign-ins of a deleted or changed admin account (backend/core/adminSessions.js).
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../../backend/core/adminSessions');

const T = Date.UTC(2026, 10, 19, 4, 0);
const signedIn = (id, at, more = {}) => ({ user: { id, username: `user${id}`, role: 'IT_staff', ...more }, signedInAt: at });

// what express-session gives a request: regenerate puts a new, empty session in its place
function request(session) {
    const req = { session };
    if (session) session.regenerate = (done) => { req.session = { fresh: true }; done(); };
    return req;
}
const through = (req) => { let passed = false; sessions.dropEnded(req, {}, () => { passed = true; }); return passed; };

test('a sign-in made before the account was ended is ended, a later one is kept', () => {
    sessions.reset();
    sessions.end(7, T);
    assert.equal(sessions.isEnded(signedIn(7, T - 1000)), true);
    assert.equal(sessions.isEnded(signedIn(7, T)), true, 'the same millisecond counts as before');
    assert.equal(sessions.isEnded(signedIn(7, T + 1)), false, 'restored and signed in again');
    assert.equal(sessions.isEnded(signedIn(8, T - 1000)), false, 'another account is not touched');
    assert.equal(sessions.isEnded({ user: { id: 7 } }), true, 'a session with no sign-in time counts as old');
});

test('the id matches as a number from the database and as text from a route', () => {
    sessions.reset();
    sessions.end('7', T);
    assert.equal(sessions.isEnded(signedIn(7, T - 1)), true);
    sessions.reset();
    sessions.end(7, T);
    assert.equal(sessions.isEnded(signedIn('7', T - 1)), true);
});

test('nothing is ended for a missing id, and a visitor with no sign-in is left alone', () => {
    sessions.reset();
    sessions.end(undefined, T);
    sessions.end(null, T);
    sessions.end('', T);
    assert.equal(sessions.isEnded(signedIn(7, T - 1)), false);
    assert.equal(sessions.isEnded(undefined), false);
    assert.equal(sessions.isEnded({}), false);
});

test('the middleware empties an ended session and lets the request go on', () => {
    sessions.reset();
    sessions.end(7, T);
    const ended = request(signedIn(7, T - 1));
    assert.equal(through(ended), true);
    assert.deepEqual(ended.session, { fresh: true }, 'the request goes on with a new, empty session');
    const other = request(signedIn(8, T - 1));
    assert.equal(through(other), true);
    assert.equal(other.session.user.id, 8, 'another admin keeps the session');
    assert.equal(through(request(undefined)), true, 'a request with no session passes');
});

test('stamp writes the sign-in time', () => {
    const session = {};
    sessions.stamp(session, T);
    assert.equal(session.signedInAt, T);
    sessions.stamp(undefined, T); // no session: nothing to do, and no error
});

test('another account that was renamed, given another role or a new password signs in again', () => {
    const target = { id: 7, username: 'user7', role: 'IT_staff' };
    const editor = () => request(signedIn(1, T - 5000, { role: 'system_admin' }));
    for (const change of [{ username: 'renamed', role: 'IT_staff' }, { username: 'user7', role: 'IT_admin' }, { username: 'user7', role: 'IT_staff', passwordChanged: true }]) {
        sessions.reset();
        const req = editor();
        sessions.accountChanged(req, target, change, T);
        assert.equal(sessions.isEnded(signedIn(7, T - 1)), true, JSON.stringify(change));
        assert.equal(sessions.isEnded(req.session), false, 'the admin who made the change stays signed in');
    }
});

test('a change of the full name only ends nothing', () => {
    sessions.reset();
    sessions.accountChanged(request(signedIn(1, T - 5000)), { id: 7, username: 'user7', role: 'IT_staff' }, { username: 'user7', role: 'IT_staff', passwordChanged: false }, T);
    assert.equal(sessions.isEnded(signedIn(7, T - 1)), false);
    sessions.accountChanged(request(signedIn(1, T - 5000)), { id: 7, username: 'user7', role: 'IT_staff' }, {}, T);
    assert.equal(sessions.isEnded(signedIn(7, T - 1)), false, 'no name and no role sent: nothing changed');
});

test('an admin who edits their own account stays signed in here, with the new name and role, and is signed out elsewhere', () => {
    sessions.reset();
    const target = { id: 7, username: 'user7', role: 'system_admin' };
    const here = request(signedIn(7, T - 5000, { role: 'system_admin' }));
    const elsewhere = signedIn(7, T - 4000, { role: 'system_admin' });
    sessions.accountChanged(here, target, { username: 'renamed', role: 'IT_staff' }, T);
    assert.equal(here.session.user.username, 'renamed');
    assert.equal(here.session.user.role, 'IT_staff');
    assert.equal(sessions.isEnded(here.session), false, 'this browser stays signed in');
    assert.equal(sessions.isEnded(elsewhere), true, 'another browser of the same account signs in again');

    sessions.reset();
    const own = request(signedIn(7, T - 5000, { role: 'system_admin' }));
    sessions.accountChanged(own, target, { passwordChanged: true }, T);
    assert.equal(own.session.user.username, 'user7', 'a new password leaves the name alone');
    assert.equal(sessions.isEnded(own.session), false);
    assert.equal(sessions.isEnded(signedIn(7, T - 4000)), true);
});
// <Jun Kai end>
