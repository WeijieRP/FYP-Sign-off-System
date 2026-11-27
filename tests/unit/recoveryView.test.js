// Owner: Role 3, Jun Kai.
// Unit tests for the History to read only, on the page that opens after the PC was off
// (backend/features/serverControl/recoveryView.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const control = require('../../backend/features/serverControl/control');
const recoveryView = require('../../backend/features/serverControl/recoveryView');

const NOW = Date.UTC(2026, 10, 18, 14, 0);
const HOUR = 3600 * 1000;

test('a link works until the server makes a new one or 24 hours are over', () => {
    recoveryView.reset();
    assert.equal(recoveryView.valid('anything', NOW), false, 'no link was made yet');
    const first = recoveryView.issue(NOW);
    assert.match(first, /^[0-9a-f]{48}$/, 'letters and digits only, so the command that opens the browser passes it on whole');
    assert.equal(recoveryView.valid(first, NOW), true);
    assert.equal(recoveryView.valid(first, NOW + 24 * HOUR - 1), true);
    assert.equal(recoveryView.valid(first, NOW + 24 * HOUR), false, 'over after 24 hours');
    assert.equal(recoveryView.valid(first.slice(0, -1) + (first.endsWith('0') ? '1' : '0'), NOW), false);
    assert.equal(recoveryView.valid('', NOW), false);
    assert.equal(recoveryView.valid(undefined, NOW), false);
    const second = recoveryView.issue(NOW + HOUR);
    assert.notEqual(second, first);
    assert.equal(recoveryView.valid(first, NOW + HOUR), false, 'the link before stops working');
    assert.equal(recoveryView.valid(second, NOW + HOUR), true);
    recoveryView.reset();
    assert.equal(recoveryView.valid(second, NOW + HOUR), false, 'a link does not outlive the run of the server');
});

test('only the PC itself counts as this PC', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(recoveryView.isThisPc(address), true, address);
    for (const address of ['192.168.1.20', '::ffff:192.168.1.20', '10.0.0.5', '127.0.0.1.evil', 'localhost', '', undefined, null]) {
        assert.equal(recoveryView.isThisPc(address), false, String(address));
    }
});

test('a connection from one of the PC\'s own addresses is the PC itself, any other address is not', () => {
    // the page after the PC was off is opened through the PC's network address: the connection then comes from it
    const adapters = {
        'Wi-Fi': [{ address: '192.168.1.50', family: 'IPv4', internal: false }, { address: 'fe80::1c2:3d4', family: 'IPv6', internal: false }],
        Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }]
    };
    for (const address of ['192.168.1.50', '::ffff:192.168.1.50', 'fe80::1c2:3d4', 'fe80::1c2:3d4%12', '127.0.0.1', '::1']) {
        assert.equal(recoveryView.isOwnAddress(address, adapters), true, address);
    }
    for (const address of ['192.168.1.51', '::ffff:192.168.1.51', '192.168.1.5', '192.168.1.500', '10.0.0.5', 'fe80::1c2:3d5', '', undefined, null]) {
        assert.equal(recoveryView.isOwnAddress(address, adapters), false, String(address));
    }
    assert.equal(recoveryView.isOwnAddress('192.168.1.50', {}), false, 'an address the PC no longer has');
});

// the route on a real listener, asked from this PC
function ask(port, headers = {}) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/api/admin/recovery-view', headers }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, cache: res.headers['cache-control'], body: JSON.parse(body) }));
        }).on('error', reject);
    });
}

test('the History lines are given to the link on this PC only, newest first, and nothing is written', async () => {
    const readAutomation = control.readAutomation;
    const events = Array.from({ length: 70 }, (_, i) => ({ at: new Date(NOW + i * 60000).toISOString(), type: i === 69 ? 'recovery' : 'on', detail: `line ${i}`, dryRun: false }));
    control.readAutomation = () => ({ events: [...events].reverse() });
    let sender = null;
    const app = express();
    // a request that comes from another machine, without touching the network: the address the route reads
    app.use((req, res, next) => {
        if (sender) Object.defineProperty(req.socket, 'remoteAddress', { value: sender, configurable: true });
        else delete req.socket.remoteAddress; // the connection is reused, so the real address has to come back
        next();
    });
    app.use('/api/admin/recovery-view', recoveryView.router);
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const port = server.address().port;
    try {
        recoveryView.reset();
        const link = recoveryView.issue();
        const good = await ask(port, { 'X-Recovery-View': link });
        assert.equal(good.status, 200);
        assert.equal(good.cache, 'no-store');
        assert.equal(good.body.events.length, recoveryView.LINES);
        assert.deepEqual(good.body.events.slice(0, 2).map((e) => e.detail), ['line 69', 'line 68'], 'sorted by time, newest first');
        assert.deepEqual(Object.keys(good.body).sort(), ['events', 'success'], 'the lines and nothing else');

        assert.equal((await ask(port)).status, 401, 'no link');
        assert.equal((await ask(port, { 'X-Recovery-View': 'f'.repeat(48) })).status, 401, 'a wrong link');
        const wrong = await ask(port, { 'X-Recovery-View': 'f'.repeat(48) });
        assert.equal(wrong.body.events, undefined);

        sender = '203.0.113.9'; // an address kept for examples: no PC has it, so it is never one of this PC's own
        const tablet = await ask(port, { 'X-Recovery-View': link, 'X-Forwarded-For': '127.0.0.1' });
        assert.equal(tablet.status, 403, 'the right link from another machine is refused, whatever its headers say');
        assert.equal(tablet.body.events, undefined);
        sender = null;

        recoveryView.issue();
        assert.equal((await ask(port, { 'X-Recovery-View': link })).status, 401, 'the old link after a new start');
    } finally {
        control.readAutomation = readAutomation;
        recoveryView.reset();
        await new Promise((resolve) => server.close(resolve));
    }
});
// <Jun Kai end>
