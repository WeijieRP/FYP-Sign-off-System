// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The History, to read only, on the page that opens by itself after the PC was off (frontend/admin/recovery.html).
// That page has to show what happened without a sign-in, because nobody is at the PC when it opens. It must not be a
// way into the admin page: switching the PC off and on would then be enough to get in. So:
//  - the server makes a link when it opens the browser (issue). The link is random, kept in memory only and ends with
//    this run of the server, or after 24 hours;
//  - the History lines are given only to that link, and only to a browser on the PC itself (isOwnAddress: the page is
//    opened through the PC's network address, so the connection comes from that address and not from 127.0.0.1);
//  - the link is not a sign-in: it opens these lines and nothing else, so it adds no way into any other route.
// The link is never written down: the History line of the recovery names the page without it (runLog.js).
const crypto = require('crypto');
const express = require('express');
const control = require('./control');
const { isThisPc, isOwnAddress } = require('../../core/localPc');

const LIFETIME_MS = 24 * 60 * 60 * 1000;
const LINES = 60;
const HEADER = 'x-recovery-view';
let link = null; // { hash, expiresAt }: one link at a time

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest();

// A new link (48 hex characters); the one before stops working
function issue(now = Date.now()) {
    const token = crypto.randomBytes(24).toString('hex');
    link = { hash: sha256(token), expiresAt: now + LIFETIME_MS };
    return token;
}

function valid(token, now = Date.now()) {
    if (!link || !token || now >= link.expiresAt) return false;
    return crypto.timingSafeEqual(sha256(token), link.hash);
}

// for the tests
function reset() {
    link = null;
}

// GET /api/admin/recovery-view, with the link in the X-Recovery-View header: the newest History lines, newest first
const router = express.Router();
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isOwnAddress(req.socket.remoteAddress)) return res.status(403).json({ success: false, error: 'This view only opens on the kiosk PC itself.' });
    if (!valid(req.get(HEADER))) return res.status(401).json({ success: false, error: 'This view has ended. Sign in to see the History.' });
    const events = control.byTime(control.readAutomation().events || []).slice(-LINES).reverse();
    res.json({ success: true, events });
});

module.exports = { issue, valid, isThisPc, isOwnAddress, reset, router, HEADER, LIFETIME_MS, LINES };
// <Jun Kai end>
