// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Ends the sign-ins of one admin account. A session keeps the name and role from the moment of the sign-in, and the
// admin page's own requests keep it alive, so a deleted admin stayed signed in for as long as the tab was open.
//  - end(userId) notes the time;
//  - dropEnded (right after the session setup in server.js, for every path) empties a session of that account that
//    signed in before that time. The request goes on with a new, empty session, so the sign-in checks answer as they
//    do for anyone who is not signed in;
//  - stamp(session) writes the sign-in time: at the login and when "keep me signed in" restores a session.
// The times are kept in memory, like the sessions themselves: a restart of the server ends both.
const ended = new Map(); // account id as text -> time of the last end()

// the id comes as a number from the database and as text from a route (/users/:id)
const key = (userId) => String(userId);

function end(userId, now = Date.now()) {
    if (userId === undefined || userId === null || userId === '') return;
    ended.set(key(userId), now);
}

function stamp(session, now = Date.now()) {
    if (session) session.signedInAt = now;
}

function isEnded(session) {
    if (!session || !session.user) return false;
    const at = ended.get(key(session.user.id));
    return at !== undefined && (session.signedInAt || 0) <= at;
}

function dropEnded(req, res, next) {
    if (!isEnded(req.session)) return next();
    req.session.regenerate(() => next());
}

// After an account was edited (PUT /users/:id). `target` is the row before the edit. A new name, role or password ends
// every sign-in of that account, because their sessions hold the old name and role. An admin who edited their own
// account stays signed in on this browser: this session takes the new name and role.
function accountChanged(req, target, { username, role, passwordChanged } = {}, now = Date.now()) {
    const renamed = username !== undefined && username !== target.username;
    const newRole = role !== undefined && role !== target.role;
    if (!renamed && !newRole && !passwordChanged) return;
    end(target.id, now);
    const own = req.session && req.session.user && key(req.session.user.id) === key(target.id);
    if (!own) return;
    if (renamed) req.session.user.username = username;
    if (newRole) req.session.user.role = role;
    stamp(req.session, now + 1);
}

// for the tests
function reset() {
    ended.clear();
}

module.exports = { end, stamp, isEnded, dropEnded, accountChanged, reset };
// <Jun Kai end>
