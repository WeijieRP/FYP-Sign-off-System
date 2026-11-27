// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// New tablets on the heartbeat route. The route has no sign-in (a kiosk page has none), and every made-up device id
// added a row, without end.
//  - a device that is already known is never limited: its row is only updated;
//  - one address may add 5 new devices an hour;
//  - the table holds 200 devices at most. When it is full, devices not seen for 30 days make room first.
const NEW_PER_ADDRESS = 5;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_DEVICES = 200;
const STALE_DAYS = 30;
const added = new Map(); // address -> times a new device was added from it

const recent = (address, now) => (added.get(address) || []).filter((time) => now - time < WINDOW_MS);

function mayAdd(address, now = Date.now()) {
    return recent(address, now).length < NEW_PER_ADDRESS;
}

function noteAdded(address, now = Date.now()) {
    added.set(address, [...recent(address, now), now]);
    if (added.size > 500) for (const key of added.keys()) if (!recent(key, now).length) added.delete(key);
}

// for the tests
function reset() {
    added.clear();
}

module.exports = { mayAdd, noteAdded, reset, NEW_PER_ADDRESS, WINDOW_MS, MAX_DEVICES, STALE_DAYS };
// <Jun Kai end>
