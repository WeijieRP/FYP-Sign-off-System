// Owner: Role 2, Wei Jie.
// Unit tests for the tree screens' event-driven refresh (backend/features/tree/liveEvents.js). Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { createTreeLiveEvents, formatEvent, fingerprintKey } = require('../../backend/features/tree/liveEvents');

// A fake open connection: what was written, and close() as when the screen goes away.
function connection() {
    const req = new EventEmitter();
    const res = new EventEmitter();
    res.written = [];
    res.headers = null;
    res.writeHead = (status, headers) => { res.statusCode = status; res.headers = headers; };
    res.write = chunk => { res.written.push(chunk); return true; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; };
    return { req, res, close: () => req.emit('close'), events: type => res.written.filter(chunk => chunk.startsWith(`event: ${type}`)) };
}

// Timers run by hand: tick() runs every interval once.
function manualTimers() {
    const intervals = new Map();
    let next = 1;
    return {
        setInterval: (fn) => { const id = next++; intervals.set(id, fn); return id; },
        clearInterval: id => intervals.delete(id),
        tick: () => [...intervals.values()].forEach(fn => fn()),
        count: () => intervals.size,
    };
}

const row = (active, newest, vips = 1, names = 99) => ({ active_feedback: active, newest_feedback: newest, vip_count: vips, vip_names: names });

test('a message is the event type and its JSON data', () => {
    assert.equal(formatEvent('tree', { at: 'x', reason: 'data-changed' }), 'event: tree\ndata: {"at":"x","reason":"data-changed"}\n\n');
    assert.equal(fingerprintKey(row(3, 10)), '3|10|1|99');
    assert.equal(fingerprintKey(null), null);
});

test('a screen is told "tree" once when a feedback is added, and nothing when nothing changed', () => {
    const timers = manualTimers();
    let current = row(5, 20);
    let changes = 0;
    const live = createTreeLiveEvents({ readFingerprint: cb => cb(null, current), timers, onChange: () => { changes++; } });
    const screen = connection();
    live.handler(screen.req, screen.res);
    assert.equal(screen.res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(screen.events('ready').length, 1);
    timers.tick();                      // nothing new
    assert.equal(screen.events('tree').length, 0);
    current = row(6, 21);               // a new feedback
    timers.tick();
    assert.equal(screen.events('tree').length, 1);
    assert.equal(changes, 1);
    timers.tick();                      // the same again: no repeat
    assert.equal(screen.events('tree').length, 1);
});

test('a deleted feedback or a VIP change is a change too', () => {
    const timers = manualTimers();
    let current = row(5, 20, 2, 500);
    const live = createTreeLiveEvents({ readFingerprint: cb => cb(null, current), timers });
    const screen = connection();
    live.handler(screen.req, screen.res);
    current = row(4, 20, 2, 500);       // archived or deleted
    timers.tick();
    current = row(4, 20, 2, 777);       // a VIP renamed
    timers.tick();
    assert.equal(screen.events('tree').length, 2);
});

test('a nudge checks at once, and every open screen is told', () => {
    const timers = manualTimers();
    let current = row(1, 1);
    const live = createTreeLiveEvents({ readFingerprint: cb => cb(null, current), timers });
    const a = connection(), b = connection();
    live.handler(a.req, a.res);
    live.handler(b.req, b.res);
    current = row(2, 2);
    live.nudge();                       // no timer tick needed
    assert.equal(a.events('tree').length, 1);
    assert.equal(b.events('tree').length, 1);
});

test('saved settings send "settings"', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-live-'));
    const file = path.join(folder, 'parametersConfig.json');
    try {
        fs.writeFileSync(file, '{}');
        fs.utimesSync(file, new Date(1000), new Date(1000));
        const timers = manualTimers();
        const live = createTreeLiveEvents({ readFingerprint: cb => cb(null, row(1, 1)), settingsFile: file, timers });
        const screen = connection();
        live.handler(screen.req, screen.res);
        timers.tick();
        assert.equal(screen.events('settings').length, 0);
        fs.utimesSync(file, new Date(5000), new Date(5000)); // the admin saved
        timers.tick();
        assert.equal(screen.events('settings').length, 1);
    } finally {
        fs.rmSync(folder, { recursive: true, force: true });
    }
});

test('the database is checked only while a screen is connected', () => {
    const timers = manualTimers();
    let reads = 0;
    const live = createTreeLiveEvents({ readFingerprint: cb => { reads++; cb(null, row(1, 1)); }, timers });
    live.nudge();
    assert.equal(reads, 0);             // no screen, no check
    const screen = connection();
    live.handler(screen.req, screen.res);
    assert.equal(timers.count(), 2);    // the check and the keep-alive
    assert.equal(live.clientCount(), 1);
    screen.close();
    assert.equal(live.clientCount(), 0);
    assert.equal(timers.count(), 0);    // stopped
});

test('a database error tells no screen anything, and too many screens are refused', () => {
    const timers = manualTimers();
    let fail = false;
    const live = createTreeLiveEvents({ readFingerprint: cb => (fail ? cb(new Error('down')) : cb(null, row(1, 1))), timers, maxClients: 1 });
    const first = connection(), second = connection();
    live.handler(first.req, first.res);
    fail = true;
    timers.tick();
    assert.equal(first.events('tree').length, 0);
    live.handler(second.req, second.res);
    assert.equal(second.res.statusCode, 503);
});
