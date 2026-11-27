// Owner: Role 3, Jun Kai.
// "Keep me signed in for 1 day" on the admin login (supervisor meeting 04): a random token in an httpOnly cookie; the
// server keeps only its SHA-256 hash (backend/data/remember-tokens.json), never the password. While the token is valid
// the server signs the admin back in by itself, also after the 30-minute session ran out or the server restarted.
// The token ends after 24 hours, on Logout, or when the admin's password changes or the account is removed.
// The pure parts are unit-tested in tests/unit/rememberMe.test.js.
// <Jun Kai start>
const crypto = require('crypto');
const express = require('express');
const paths = require('./paths');
const { readJson, writeJsonAtomic } = require('./jsonFile');

const COOKIE = 'esg_admin_remember';
const LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_PER_USER = 10;
const FILE_NAME = 'remember-tokens.json';
const db = () => require('./db');
const adminSessions = require('./adminSessions');

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
// a short fingerprint of the stored password hash: a new password ends every token made with the old one
const passwordMark = (passwordHash) => sha256(passwordHash || '').slice(0, 16);

// "a=1; esg_admin_remember=xyz" -> "xyz" (no cookie-parser in this app)
function readCookie(header, name = COOKIE) {
    for (const part of String(header || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) {
            try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
        }
    }
    return null;
}

// Keeps the tokens that have not expired and at most MAX_PER_USER per admin (the newest)
function prune(records, now = Date.now()) {
    const alive = (records || []).filter((r) => r && r.hash && Date.parse(r.expiresAt) > now);
    const byUser = new Map();
    for (const r of alive.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
        const list = byUser.get(r.userId) || [];
        if (list.length < MAX_PER_USER) list.push(r);
        byUser.set(r.userId, list);
    }
    return [...byUser.values()].flat();
}

// The record for a token, or null when it is unknown or expired
function findRecord(records, token, now = Date.now()) {
    if (!token) return null;
    const hash = sha256(token);
    return (records || []).find((r) => r.hash === hash && Date.parse(r.expiresAt) > now) || null;
}

const load = () => {
    const value = readJson(paths.dataFile(FILE_NAME), []);
    return Array.isArray(value) ? value : [];
};
const save = (records) => writeJsonAtomic(paths.dataFile(FILE_NAME), records);

function cookieOptions(req, maxAge) {
    return { httpOnly: true, secure: !!req.secure, sameSite: 'strict', path: '/api/admin', maxAge };
}

// After a good login with the box ticked: a new token for this browser. user: { id, username } from the login.
// done(error, expiresAt) runs after the cookie is set, so the login answer carries it.
function issue(req, res, user, done) {
    db().all('SELECT password_hash FROM admin_users WHERE id = ?', [user.id], (err, rows) => {
        if (err || !rows || !rows[0]) return done(err || new Error('Account not found'));
        const now = Date.now();
        const token = crypto.randomBytes(32).toString('base64url');
        const record = {
            hash: sha256(token),
            userId: user.id,
            username: user.username,
            passwordMark: passwordMark(rows[0].password_hash),
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + LIFETIME_MS).toISOString()
        };
        try {
            save(prune([...load(), record], now));
        } catch (saveErr) {
            return done(saveErr);
        }
        res.cookie(COOKIE, token, cookieOptions(req, LIFETIME_MS));
        done(null, record.expiresAt);
    });
}

// Logout: this browser's token goes
function revoke(req, res) {
    const token = readCookie(req.headers.cookie);
    if (token) {
        const hash = sha256(token);
        const records = load();
        const kept = records.filter((r) => r.hash !== hash);
        if (kept.length !== records.length) save(kept);
    }
    res.clearCookie(COOKIE, cookieOptions(req, undefined));
}

// Middleware on /api/admin: no session but a valid token -> a fresh session for that admin, if the account is still
// active and its password unchanged; a bad or expired token is cleared
function restore(req, res, next) {
    if (!req.session || req.session.user) return next();
    const token = readCookie(req.headers.cookie);
    if (!token) return next();
    const records = load();
    const record = findRecord(records, token);
    if (!record) {
        res.clearCookie(COOKIE, cookieOptions(req, undefined));
        return next();
    }
    db().all('SELECT id, username, role, password_hash FROM admin_users WHERE id = ? AND is_active = 1 AND is_deleted = 0', [record.userId], (err, rows) => {
        const user = !err && rows && rows[0];
        if (!user || passwordMark(user.password_hash) !== record.passwordMark) {
            save(records.filter((r) => r.hash !== record.hash));
            res.clearCookie(COOKIE, cookieOptions(req, undefined));
            return next();
        }
        // a new session id for the restored sign-in
        req.session.regenerate((regenErr) => {
            if (regenErr) return next();
            req.session.user = { id: user.id, username: user.username, role: user.role };
            adminSessions.stamp(req.session);
            req.session.rememberUntil = record.expiresAt;
            next();
        });
    });
}

// GET /api/admin/remember: the page asks on load whether this browser is still signed in
const router = express.Router();
router.get('/', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, error: 'Not signed in on this browser' });
    res.json({ success: true, user: req.session.user, rememberUntil: req.session.rememberUntil || null });
});

module.exports = { issue, revoke, restore, router, readCookie, prune, findRecord, passwordMark, sha256, COOKIE, LIFETIME_MS, MAX_PER_USER };
// <Jun Kai end>
