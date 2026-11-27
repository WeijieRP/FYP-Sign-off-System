// Owner: Role 3, Jun Kai.
// Unit tests for the request limits (backend/core/requestLimit.js) and the admin page script rule
// (backend/core/securityHeaders.js). Each test runs a small express app on a free port. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const requestLimit = require('../../backend/core/requestLimit');
const securityHeaders = require('../../backend/core/securityHeaders');

async function withApp(setup, run) {
    const app = express();
    app.use(express.json());
    setup(app);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await run(base);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

test('the limit on every request answers 429 with a JSON message once an address goes over', async () => {
    assert.equal(requestLimit.EVERY_REQUEST.limit, 1000);
    assert.equal(requestLimit.EVERY_REQUEST.windowMs, 60 * 1000);
    await withApp((app) => {
        app.use(rateLimit({ ...requestLimit.EVERY_REQUEST, limit: 3 })); // the real settings, with a small count
        app.get('/x', (req, res) => res.json({ ok: true }));
        app.get(['/uploads/photos/a.png', '/admin/js/core.js'], (req, res) => res.send('file'));
        app.post('/uploads/photos/a.png', (req, res) => res.send('not a file read'));
    }, async (base) => {
        for (let i = 0; i < 20; i++) {
            assert.equal((await fetch(`${base}/uploads/photos/a.png`)).status, 200, 'photos are not counted');
            assert.equal((await fetch(`${base}/admin/js/core.js`)).status, 200, 'scripts are not counted');
        }
        for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/x`)).status, 200);
        assert.equal((await post(`${base}/uploads/photos/a.png`)).status, 429, 'a POST is counted even with a file name');
        const over = await fetch(`${base}/x`);
        assert.equal(over.status, 429);
        assert.deepEqual(await over.json(), { success: false, error: 'Too many requests from this address. Wait a minute and try again.' });
        assert.ok(over.headers.get('ratelimit-policy'), 'the standard RateLimit headers tell the browser the limit');
    });
});

test('password routes count only wrong passwords, so many right ones or other errors in a row never lock anyone out', async () => {
    await withApp((app) => {
        app.post('/check', requestLimit.passwordChecks, (req, res) => {
            if (req.body.password === 'right') return res.json({ success: true });
            if (req.body.password === 'broken-row') return res.status(500).json({ success: false, error: 'Failed to decrypt email' });
            if (req.body.password === 'none') return res.status(400).json({ error: 'Password required' });
            if (req.body.password === 'wrong-200') return res.json({ success: false, message: 'Invalid password' }); // as /bulk-decrypt-archive answers
            return res.status(401).json({ success: false, error: 'Invalid password' });
        });
    }, async (base) => {
        for (let i = 0; i < 30; i++) assert.equal((await post(`${base}/check`, { password: 'right' })).status, 200, `right password ${i + 1}`);
        for (let i = 0; i < 25; i++) assert.equal((await post(`${base}/check`, { password: 'broken-row' })).status, 500, `a row that cannot be decrypted ${i + 1}`);
        for (let i = 0; i < 25; i++) assert.equal((await post(`${base}/check`, { password: 'none' })).status, 400, `no password ${i + 1}`);
        for (let i = 0; i < 10; i++) assert.equal((await post(`${base}/check`, { password: 'wrong-200' })).status, 200, `wrong password answered with 200 ${i + 1}`);
        for (let i = 0; i < 10; i++) assert.equal((await post(`${base}/check`, { password: 'wrong' })).status, 401, `wrong password ${i + 1}`);
        const locked = await post(`${base}/check`, { password: 'right' });
        assert.equal(locked.status, 429, 'after 20 wrong ones even the right password waits');
        assert.match((await locked.json()).error, /Too many wrong passwords/);
    });
});

test('the kiosk forms, downloads and visitor lookups each have their own count', async () => {
    await withApp((app) => {
        app.post('/form', requestLimit.kioskForms, (req, res) => res.json({ ok: true }));
        app.post('/lookup', requestLimit.visitorLookup, (req, res) => res.json({ ok: true }));
        app.get('/download', requestLimit.heavyWork, (req, res) => res.json({ ok: true }));
    }, async (base) => {
        for (let i = 0; i < 30; i++) assert.equal((await post(`${base}/lookup`)).status, 200);
        assert.equal((await post(`${base}/lookup`)).status, 429, '31st lookup in 10 minutes');
        assert.equal((await post(`${base}/form`)).status, 200, 'the lookups do not use up the form count');
        for (let i = 0; i < 30; i++) assert.equal((await fetch(`${base}/download`)).status, 200);
        assert.equal((await fetch(`${base}/download`)).status, 429, '31st download in 10 minutes');
        for (let i = 1; i < 120; i++) assert.equal((await post(`${base}/form`)).status, 200);
        assert.equal((await post(`${base}/form`)).status, 429, '121st kiosk form in 10 minutes');
    });
});

test('only the admin pages get the script rule, and the other rules stay on every answer', async () => {
    await withApp((app) => {
        securityHeaders.apply(app);
        app.get(['/admin', '/admin/', '/admin/recovery.html', '/admin/js/core.js', '/feedback', '/api/x'], (req, res) => res.send('ok'));
    }, async (base) => {
        for (const p of ['/admin', '/admin/', '/admin/recovery.html']) {
            const csp = (await fetch(base + p)).headers.get('content-security-policy');
            assert.equal(csp, securityHeaders.ADMIN_POLICY, p);
            assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.0\/dist\/chart\.umd\.js$/);
            assert.match(csp, /^frame-ancestors 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; /);
        }
        for (const p of ['/admin/js/core.js', '/feedback', '/api/x']) {
            assert.equal((await fetch(base + p)).headers.get('content-security-policy'), securityHeaders.BASE_POLICY, p);
        }
    });
});
// <Jun Kai end>
