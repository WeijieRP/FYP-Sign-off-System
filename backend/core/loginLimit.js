// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// A limit on wrong passwords at the admin sign-in. Without it a password can be guessed for as long as someone likes.
//  - 5 wrong passwords for one username from one address within 15 minutes: that username is locked for that address
//    for 15 minutes. Another address can still sign in, so nobody locks the real admin out from another PC;
//  - 20 wrong passwords from one address within 15 minutes, whatever the usernames: that address is locked for
//    15 minutes, so trying one password on many usernames does not get around the first rule.
// Kept in memory: a restart of the server clears it.
const MAX_PER_NAME = 5;
const MAX_PER_ADDRESS = 20;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const tries = new Map(); // key -> { fails: [times of wrong passwords], lockedUntil }

// MySQL finds SystemAdmin and systemadmin as the same account, so the name is counted in lower case
const nameKey = (username, address) => `name:${String(username || '').trim().toLowerCase()}|${address || ''}`;
const addressKey = (address) => `address:${address || ''}`;

// { blocked, retryAfterMs }: asked before the password is looked at
function check(username, address, now = Date.now()) {
    let until = 0;
    for (const key of [nameKey(username, address), addressKey(address)]) {
        const entry = tries.get(key);
        if (entry && entry.lockedUntil > now) until = Math.max(until, entry.lockedUntil);
    }
    return { blocked: until > now, retryAfterMs: Math.max(0, until - now) };
}

// a wrong password. True when this one started a lock
function fail(username, address, now = Date.now()) {
    let locked = false;
    for (const [key, max] of [[nameKey(username, address), MAX_PER_NAME], [addressKey(address), MAX_PER_ADDRESS]]) {
        const entry = tries.get(key) || { fails: [], lockedUntil: 0 };
        entry.fails = entry.fails.filter((time) => now - time < WINDOW_MS);
        entry.fails.push(now);
        if (entry.fails.length >= max) {
            entry.lockedUntil = now + LOCK_MS;
            entry.fails = [];
            locked = true;
        }
        tries.set(key, entry);
    }
    if (tries.size > 500) prune(now);
    return locked;
}

// the right password clears the count of that username from that address (the count of the address stays)
function success(username, address) {
    tries.delete(nameKey(username, address));
}

// <Jun Kai/> after a password reset: the lock of that username ends on every address (the address counts stay)
function forgetName(username) {
    const start = `name:${String(username || '').trim().toLowerCase()}|`;
    for (const key of [...tries.keys()]) if (key.startsWith(start)) tries.delete(key);
}

function prune(now) {
    for (const [key, entry] of tries) {
        if (entry.lockedUntil <= now && !entry.fails.some((time) => now - time < WINDOW_MS)) tries.delete(key);
    }
}

function message(retryAfterMs) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
    return `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

// for the tests
function reset() {
    tries.clear();
}

module.exports = { check, fail, success, message, reset, forgetName, MAX_PER_NAME, MAX_PER_ADDRESS, WINDOW_MS, LOCK_MS };
// <Jun Kai end>
