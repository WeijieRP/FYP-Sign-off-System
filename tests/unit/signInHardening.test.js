// Owner: Role 3, Jun Kai.
// Unit tests for the limits and gates of 19 Nov 2026: wrong passwords at the sign-in (backend/core/loginLimit.js), the
// files under /uploads (uploadsGate.js), the routes for this PC (localPc.js), the tree pages (pageGates.js) and new
// tablets on the heartbeat route (features/health/heartbeatLimit.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const loginLimit = require('../../backend/core/loginLimit');
const uploadsGate = require('../../backend/core/uploadsGate');
const localPc = require('../../backend/core/localPc');
const pageGates = require('../../backend/core/pageGates');
const heartbeatLimit = require('../../backend/features/health/heartbeatLimit');

const T = Date.UTC(2026, 10, 19, 4, 0);
const MIN = 60 * 1000;

// ---------------------------------------------------------------- wrong passwords
test('five wrong passwords lock that username for that address, and only for 15 minutes', () => {
    loginLimit.reset();
    for (let i = 0; i < 4; i++) assert.equal(loginLimit.fail('systemadmin', '10.0.0.5', T + i), false);
    assert.equal(loginLimit.check('systemadmin', '10.0.0.5', T + 10).blocked, false, 'four are allowed');
    assert.equal(loginLimit.fail('systemadmin', '10.0.0.5', T + 20), true, 'the fifth starts the lock');
    const locked = loginLimit.check('systemadmin', '10.0.0.5', T + 30);
    assert.equal(locked.blocked, true);
    assert.equal(loginLimit.message(locked.retryAfterMs), 'Too many wrong passwords. Try again in 15 minutes.');
    assert.equal(loginLimit.check('SystemAdmin ', '10.0.0.5', T + 30).blocked, true, 'the same account in another spelling');
    assert.equal(loginLimit.check('systemadmin', '10.0.0.9', T + 30).blocked, false, 'another address still signs in');
    assert.equal(loginLimit.check('other', '10.0.0.5', T + 30).blocked, false, 'another username from that address too');
    assert.equal(loginLimit.check('systemadmin', '10.0.0.5', T + 20 + 15 * MIN).blocked, false, 'the lock ends');
});

test('wrong passwords spread over more than 15 minutes do not lock, and the right password clears the count', () => {
    loginLimit.reset();
    for (let i = 0; i < 4; i++) loginLimit.fail('admin2', '10.0.0.5', T + i * MIN);
    assert.equal(loginLimit.fail('admin2', '10.0.0.5', T + 16 * MIN), false, 'the first ones are too old to count');
    loginLimit.reset();
    for (let i = 0; i < 4; i++) loginLimit.fail('admin2', '10.0.0.5', T + i);
    loginLimit.success('admin2', '10.0.0.5');
    for (let i = 0; i < 4; i++) assert.equal(loginLimit.fail('admin2', '10.0.0.5', T + 100 + i), false, 'counted from zero again');
});

test('twenty wrong passwords from one address lock the address, whatever the usernames', () => {
    loginLimit.reset();
    let locked = false;
    for (let i = 0; i < 20; i++) locked = loginLimit.fail(`name${i}`, '10.0.0.7', T + i);
    assert.equal(locked, true);
    assert.equal(loginLimit.check('never-tried', '10.0.0.7', T + 100).blocked, true);
    assert.equal(loginLimit.check('never-tried', '10.0.0.8', T + 100).blocked, false);
    assert.equal(loginLimit.message(30 * 1000), 'Too many wrong passwords. Try again in 1 minute.');
});

// ---------------------------------------------------------------- this PC
test('only a loopback address is this PC, and the check passes a signed-in admin from anywhere', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(localPc.isThisPc(address), true, address);
    for (const address of ['192.168.1.20', '::ffff:192.168.1.20', '', undefined, '127.0.0.1.evil']) assert.equal(localPc.isThisPc(address), false, String(address));
    const ask = (req) => { let status = 200; let passed = false; localPc.signedInOrThisPc(req, { status(code) { status = code; return { json() {} }; } }, () => { passed = true; }); return passed ? 'passed' : status; };
    assert.equal(ask({ socket: { remoteAddress: '192.168.1.20' }, headers: { 'x-forwarded-for': '127.0.0.1' } }), 401, 'a header does not make a tablet this PC');
    assert.equal(ask({ socket: { remoteAddress: '::1' } }), 'passed');
    assert.equal(ask({ socket: { remoteAddress: '192.168.1.20' }, session: { user: { id: 1 } } }), 'passed');
});

// ---------------------------------------------------------------- /uploads
test('an uploads address is read the way the disk would, and a broken one is refused', () => {
    assert.equal(uploadsGate.wanted('/photos/a%20b.png'), 'photos/a b.png');
    assert.equal(uploadsGate.wanted('/photos/../processed/x.png'), 'processed/x.png');
    assert.equal(uploadsGate.wanted('/photos/%E0%A4%A'), null);
});

test('a visitor session keeps its newest files only', () => {
    const req = { session: {} };
    for (let i = 0; i < 12; i++) uploadsGate.remember(req, `photos/p${i}.png`);
    assert.equal(req.session.ownUploads.length, uploadsGate.OWN_MAX);
    assert.equal(req.session.ownUploads.includes('photos/p0.png'), false);
    assert.equal(req.session.ownUploads.includes('photos/p11.png'), true);
    uploadsGate.remember({}, 'photos/x.png'); // no session: nothing to do, and no error
});

test('/uploads: a file goes to a signed-in admin and to the browser that made it, to nobody else', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-gate-'));
    fs.mkdirSync(path.join(dir, 'photos'));
    fs.writeFileSync(path.join(dir, 'photos', 'mine.png'), 'mine');
    fs.writeFileSync(path.join(dir, 'photos', 'other.png'), 'other');
    const app = express();
    app.use(session({ secret: 'test', resave: true, saveUninitialized: false }));
    app.post('/visit', (req, res) => { uploadsGate.remember(req, 'photos/mine.png'); res.json({ ok: true }); }); // what save-photo does
    app.post('/login', (req, res) => { req.session.user = { id: 1, username: 'admin' }; res.json({ ok: true }); });
    app.use('/uploads', uploadsGate.gate, express.static(dir));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const cookieOf = async (route) => ((await fetch(base + route, { method: 'POST' })).headers.get('set-cookie') || '').split(';')[0];
    const status = async (file, cookie) => (await fetch(`${base}/uploads/${file}`, { headers: cookie ? { cookie } : {} })).status;
    try {
        assert.equal(await status('photos/mine.png'), 401, 'nobody signed in');
        const visitor = await cookieOf('/visit');
        assert.ok(visitor, 'saving a photo gives the visitor a session');
        assert.equal(await status('photos/mine.png', visitor), 200, 'the visitor opens the photo just made');
        assert.equal(await status('photos/other.png', visitor), 401, 'but not the photo of someone else');
        assert.equal(await status('photos/MINE.png', visitor), 401, 'and not through another spelling');
        const admin = await cookieOf('/login');
        assert.equal(await status('photos/other.png', admin), 200, 'a signed-in admin opens any file');
        assert.equal(await status('photos/none.png', admin), 404);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------- the tree pages
test('the two tree page files are sent to their gated routes, under every spelling', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-gates-'));
    for (const [folder, file] of [['tree', 'tree.html'], ['tree', 'tree.js'], ['3dTree', '3dTree.html'], ['Pledgeboard', 'Pledgeboard.html'], ['admin', 'admin.html']]) {
        fs.mkdirSync(path.join(root, folder), { recursive: true });
        fs.writeFileSync(path.join(root, folder, file), 'x');
    }
    try {
        const route = (p) => pageGates.gatedRoute(p, root);
        assert.equal(route('/tree/tree.html'), '/tree');
        assert.equal(route('/3dTree/3dTree.html'), '/3dTree');
        assert.equal(route('/tree//tree.html'), '/tree');
        assert.equal(route('/tree/./tree.html'), '/tree');
        assert.equal(route('/admin/../tree/tree.html'), '/tree');
        assert.equal(route('/tree/%74ree.html'), '/tree', 'a letter written as %74');
        assert.equal(route('/tree\\tree.html'), '/tree');
        if (process.platform === 'win32') {
            assert.equal(route('/TREE/Tree.HTML'), '/tree', 'Windows opens the file in any case');
            assert.equal(route('/tree/tree.html.'), '/tree', 'and with a dot at the end');
            assert.equal(route('/tree/tree.html::$DATA'), '/tree', 'and as a data stream');
        }
        assert.equal(route('/tree/tree.js'), null, 'the page files next to it are served as before');
        assert.equal(route('/tree/'), null);
        assert.equal(route('/tree'), null, 'the gated route itself');
        assert.equal(route('/Pledgeboard/Pledgeboard.html'), null, 'left out on purpose');
        assert.equal(route('/admin/admin.html'), null);
        assert.equal(route('/tree/%E0%A4%A'), null, 'a broken address is left to the file server');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------- new tablets
test('one address adds five new devices an hour', () => {
    heartbeatLimit.reset();
    for (let i = 0; i < 5; i++) {
        assert.equal(heartbeatLimit.mayAdd('10.0.0.5', T + i), true);
        heartbeatLimit.noteAdded('10.0.0.5', T + i);
    }
    assert.equal(heartbeatLimit.mayAdd('10.0.0.5', T + 10), false, 'the sixth is refused');
    assert.equal(heartbeatLimit.mayAdd('10.0.0.6', T + 10), true, 'another address is not');
    assert.equal(heartbeatLimit.mayAdd('10.0.0.5', T + 61 * MIN), true, 'and an hour later it may again');
});
// <Jun Kai end>
