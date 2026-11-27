// Owner: Role 3, Jun Kai.
// Admin Visitor Data Archive API, mounted at /api/admin/visitor-archive (system_admin only): overview, settings, folder check, preview, runs, and the archive viewer.
// <Jun Kai start>
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const auth = require('../../core/auth');
const requestLimit = require('../../core/requestLimit'); // <Jun Kai/> request limits per address
const db = require('../../core/db');
const zip = require('../../core/zip');
const { logAudit } = require('../../core/audit');
const settingsStore = require('./visitorSettings');
const schedule = require('./visitorSchedule');
const files = require('./visitorFiles');
const writer = require('./visitorWriter');
const runner = require('./visitorRunner');

const router = express.Router();
const query = async (sql, params) => (await db.pool.promise().query(sql, params))[0];
const httpError = runner.httpError;

const UNLOCK_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;
const MAX_WRONG_PASSWORDS = 5;
const SESSION_IDLE_MS = 30 * 60 * 1000; // the session cookie's idle timeout in server.js
const VIEW_CACHE_MS = 5 * 60 * 1000;
const PHOTO_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

let viewCache = null; // parsed records of the last archive opened in the View dialog
// Wrong passwords and unlocks per session, kept here and not in req.session: the MemoryStore gives every request its
// own copy of the session and saves it at the end, so overlapping requests would overwrite each other's values
const attempts = new Map(); // sessionID -> { wrong, lockedUntil, pending, at }
const unlocks = new Map(); // sessionID -> when the unlock ends (ms)

function pruneSessions(now) {
    for (const [sid, entry] of attempts) {
        if (!entry.pending && entry.lockedUntil <= now && (entry.wrong === 0 || now - entry.at > SESSION_IDLE_MS)) attempts.delete(sid);
    }
    for (const [sid, until] of unlocks) if (until <= now) unlocks.delete(sid);
}

function fail(res, error, what) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message, ...(error.field ? { field: error.field } : {}) });
    if (error.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success: false, error: 'Table visitor_archives is missing: run npm run db:migrate' });
    console.error(`Visitor archive ${what} failed: ${error.message}`);
    return res.status(500).json({ success: false, error: `Visitor archive ${what} failed: ${error.message}` });
}

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);

async function passwordMatches(userId, password) {
    const rows = await query('SELECT password_hash FROM admin_users WHERE id = ? AND is_active = 1', [userId]);
    const hash = rows[0] ? rows[0].password_hash : null;
    if (!hash) return false;
    // a fresh install keeps the seeded admin password in plain text until the first login upgrades it
    return isBcryptHash(hash) ? auth.verifyPassword(password, hash) : password === hash;
}

// Re-checks the signed-in admin's own password (not auth.loginUser, which bumps last_login).
// A wrong password is 403 "Wrong password." (a 401 would log the admin out); 5 wrong in a row lock it for a minute.
// The attempt is counted before the first await and a second check while one is running is refused, so requests
// sent together cannot get past the limit.
async function checkPassword(req, password, action) {
    const now = Date.now();
    pruneSessions(now);
    const entry = attempts.get(req.sessionID) || { wrong: 0, lockedUntil: 0, pending: false, at: now };
    if (entry.pending || entry.lockedUntil > now) throw httpError(429, 'Too many attempts. Wait a minute.');
    if (typeof password !== 'string' || !password) throw httpError(400, 'Enter your password.', 'password');
    entry.wrong += 1;
    entry.pending = true;
    entry.at = now;
    attempts.set(req.sessionID, entry);
    let ok;
    try {
        ok = await passwordMatches(req.session.user.id, password);
    } catch (error) {
        entry.wrong -= 1; // a database error is not a wrong password
        throw error;
    } finally {
        entry.pending = false;
    }
    if (ok) {
        attempts.delete(req.sessionID);
        return;
    }
    logAudit('VISITOR_ARCHIVE_UNLOCK_FAILED', req.session.user.username, 'visitor_archive', action, req);
    if (entry.wrong >= MAX_WRONG_PASSWORDS) {
        entry.wrong = 0;
        entry.lockedUntil = Date.now() + LOCKOUT_MS;
        throw httpError(429, 'Too many attempts. Wait a minute.');
    }
    throw httpError(403, 'Wrong password.', 'password');
}

function unlockedUntil(req) {
    pruneSessions(Date.now());
    const until = unlocks.get(req.sessionID) || 0;
    return Date.now() < until ? new Date(until).toISOString() : null;
}

// Download, View and Decrypt need a password entered in the last 10 minutes
function requireUnlocked(req, res, next) {
    if (unlockedUntil(req)) return next();
    res.status(403).json({ success: false, error: 'Enter your password to open archive files.', locked: true });
}

function optionalBool(value, fallback, field) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'boolean') throw httpError(400, 'Choose on or off.', field);
    return value;
}

// Request body -> archive criteria. Dates are 'YYYY-MM-DD': records submitted before the start of that Singapore day.
function parseCriteria(body, settings) {
    const b = body && typeof body === 'object' ? body : {};
    const types = Array.isArray(b.types) ? [...new Set(b.types)] : [];
    if (!types.length || types.some((t) => t !== 'feedback' && t !== 'lostFound')) throw httpError(400, 'Choose feedback, lost & found reports, or both.', 'types');
    const latest = schedule.sgtDayStart(schedule.toSgtDay(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    const day = (value, field) => {
        const at = schedule.sgtDayStart(value);
        if (!at) throw httpError(400, 'Pick a valid date.', field);
        if (at > latest) throw httpError(400, 'Pick a date no later than tomorrow.', field);
        return at;
    };
    const criteria = {
        types,
        feedbackBefore: types.includes('feedback') ? day(b.feedbackBefore, 'feedbackBefore') : null,
        lostFoundBefore: types.includes('lostFound') ? day(b.lostFoundBefore, 'lostFoundBefore') : null,
        onlyResolved: optionalBool(b.onlyResolved, settings.lostFound.onlyResolved, 'onlyResolved'),
        includePhotos: optionalBool(b.includePhotos, settings.includePhotos, 'includePhotos')
    };
    if (b.only !== undefined && b.only !== null) {
        if (typeof b.only !== 'object' || Array.isArray(b.only)) throw httpError(400, 'only must hold feedbackIds and lostFoundIds lists.', 'only');
        const ids = (list, field) => {
            if (list === undefined) return undefined;
            if (!Array.isArray(list) || list.length > 10000 || !list.every((id) => Number.isInteger(id) && id > 0)) throw httpError(400, 'Record ids must be a list of whole numbers.', field);
            return [...new Set(list)];
        };
        criteria.only = { feedbackIds: ids(b.only.feedbackIds, 'only.feedbackIds'), lostFoundIds: ids(b.only.lostFoundIds, 'only.lostFoundIds') };
    }
    return criteria;
}

async function loadRun(req) {
    if (!/^\d+$/.test(req.params.id)) throw httpError(404, 'Archive not found.');
    const row = await runner.getRunRow(Number(req.params.id));
    if (!row) throw httpError(404, 'Archive not found.');
    return row;
}

async function presentFile(row) {
    const file = runner.archivePath(row);
    if (row.file_state === 'deleted') throw httpError(404, 'The archive file was deleted.');
    if (row.file_state === 'expired') throw httpError(404, 'The archive file was deleted when its keep period ended.');
    if (row.file_state !== 'present' || !file) throw httpError(404, 'This run has no archive file.');
    if (!(await files.pathExists(file))) throw httpError(404, 'The archive file is missing.');
    return file;
}

async function sha256File(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

// The archive's records, parsed once and kept for 5 minutes (never the zip handle itself). The cache holds the
// promise, so the thumbnails of one page that arrive together share a single read.
async function archiveData(row) {
    const file = await presentFile(row);
    const key = `${row.id}:${row.file_sha256}`;
    if (viewCache && viewCache.key === key && Date.now() - viewCache.at < VIEW_CACHE_MS) return viewCache.data;
    const entry = { key, at: Date.now(), data: readCheckedArchive(row, file) };
    viewCache = entry;
    entry.data.catch(() => { if (viewCache === entry) viewCache = null; });
    setTimeout(() => { if (viewCache === entry) viewCache = null; }, VIEW_CACHE_MS).unref();
    return entry.data;
}

// A file replaced or damaged since it was written is never parsed or shown as this archive
async function readCheckedArchive(row, file) {
    if (row.file_sha256 && (await sha256File(file)) !== row.file_sha256) {
        throw httpError(409, 'The archive file has changed since it was written. Check the file from the history.');
    }
    return parseArchive(file);
}

async function parseArchive(file) {
    const raw = await writer.readArchiveData(file);
    const visitors = new Map(raw.visitors.map((v) => [v.id, v]));
    const feedbackRows = raw.feedback.map((f) => {
        const visitor = visitors.get(f.user_id) || {};
        return {
            id: f.id,
            visitorId: f.user_id,
            name: visitor.name || null,
            hasEmail: !!visitor.email_encrypted,
            pledge: f.comment,
            topics: writer.topicsOf(f.metadata),
            answers: (f.answers || []).map((a) => ({ question: a.question_text, answer: a.answer_text })),
            createdAt: f.created_at,
            photos: f.photos || { raw: null, processed: null },
            keptVisitor: !!visitor.keptInDatabase,
            search: [visitor.name, f.comment].join(' ').toLowerCase()
        };
    });
    const lostFoundRows = raw.lostFound.map((r) => ({
        id: r.id,
        trackingCode: r.tracking_code,
        type: r.report_type,
        item: r.item_description,
        location: r.location_text,
        details: r.details,
        status: r.status,
        createdAt: r.created_at,
        hasContact: !!r.contact_info_encrypted,
        photo: r.photo || null,
        search: [r.item_description, r.location_text, r.tracking_code].join(' ').toLowerCase()
    }));
    return {
        manifest: raw.manifest,
        visitors,
        feedback: new Map(raw.feedback.map((f) => [f.id, f])),
        lostFound: new Map(raw.lostFound.map((r) => [r.id, r])),
        feedbackRows,
        lostFoundRows
    };
}

router.get('/overview', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        res.json({ success: true, ...(await runner.overview()), unlockedUntil: unlockedUntil(req) });
    } catch (error) { fail(res, error, 'overview'); }
});

// validate() builds the saved object from known keys only, so `password` (and anything else) is never stored
router.put('/settings', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const previous = settingsStore.read();
        const result = settingsStore.validate(body, previous);
        if (result.error) return res.status(400).json({ success: false, error: result.error, field: result.field });
        const settings = result.settings;
        const folderError = await files.folderRealProblem(settings.folder);
        if (folderError) return res.status(400).json({ success: false, error: folderError, field: 'folder' });
        // a shorter "Keep archive files" deletes older zips for good, so it needs the admin's password
        const now = new Date();
        const alreadyDue = new Set((await runner.filesToExpire(previous.keepFiles, now)).map((row) => row.id));
        const expiring = (await runner.filesToExpire(settings.keepFiles, now)).filter((row) => !alreadyDue.has(row.id));
        if (expiring.length) {
            if (typeof body.password !== 'string' || !body.password) {
                const count = expiring.length;
                const bytes = expiring.reduce((sum, row) => sum + (Number(row.file_size) || 0), 0);
                return res.status(409).json({
                    success: false,
                    error: `Saving this deletes ${count} archive file${count === 1 ? '' : 's'} (${runner.formatSize(bytes)}). Enter your password to confirm.`,
                    field: 'password',
                    expiring: { count, bytes }
                });
            }
            await checkPassword(req, body.password, 'settings');
        }
        settingsStore.write(settings);
        logAudit('VISITOR_ARCHIVE_SETTINGS', req.session.user.username, 'visitor_archive', 'settings', req);
        if (!expiring.length) return res.json({ success: true, settings });
        const expired = await runner.expireFiles(settings.keepFiles, now, req.session.user.username, req);
        viewCache = null;
        res.json({ success: true, settings, expired });
    } catch (error) { fail(res, error, 'settings save'); }
});

router.post('/folder-check', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        res.json({ success: true, folder: await files.checkFolder(req.body ? req.body.folder : '') });
    } catch (error) { fail(res, error, 'folder check'); }
});

router.post('/preview', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const settings = settingsStore.read();
        const criteria = parseCriteria(req.body, settings);
        const result = await runner.preview(criteria);
        const requested = req.body && typeof req.body.folder === 'string' && req.body.folder.trim() ? req.body.folder : settings.folder;
        const folder = await files.checkFolder(requested);
        res.json({ success: true, ...result, freeBytes: folder.freeBytes });
    } catch (error) { fail(res, error, 'preview'); }
});

router.post('/runs', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const settings = settingsStore.read();
        const criteria = parseCriteria(body, settings);
        const deleteAfter = optionalBool(body.deleteAfter, settings.deleteAfterArchive, 'deleteAfter');
        if (body.folder !== undefined && body.folder !== null && typeof body.folder !== 'string') throw httpError(400, 'Enter the folder as text.', 'folder');
        await checkPassword(req, body.password, 'run');
        const runId = await runner.startRun({ trigger: 'manual', startedBy: req.session.user.username, criteria, deleteAfter, folder: body.folder, req });
        res.status(202).json({ success: true, runId });
    } catch (error) { fail(res, error, 'run'); }
});

router.get('/runs', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const n = Number(req.query.limit);
        const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 1000) : 50;
        res.json({ success: true, runs: await runner.listRuns(limit) });
    } catch (error) { fail(res, error, 'history'); }
});

router.get('/runs/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const row = await loadRun(req);
        res.json({ success: true, run: await runner.describeRun(row), progress: runner.progressFor(row.id) });
    } catch (error) { fail(res, error, 'run lookup'); }
});

router.post('/runs/:id/verify', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const row = await loadRun(req);
        let result;
        try {
            const file = await presentFile(row);
            const check = await writer.verifyArchive(file);
            const problems = [...check.problems];
            if (row.file_sha256 && (await sha256File(file)) !== row.file_sha256) problems.unshift('The file has changed since it was written (its SHA-256 checksum is different).');
            result = { ok: problems.length === 0, checkedEntries: check.checkedEntries, problems };
        } catch (error) {
            if (error.status !== 404) throw error;
            result = { ok: false, checkedEntries: 0, problems: [error.message] };
        }
        res.json({ success: true, ...result, run: await runner.describeRun(row) });
    } catch (error) { fail(res, error, 'check'); }
});

router.post('/unlock', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        await checkPassword(req, req.body ? req.body.password : undefined, 'unlock');
        unlocks.set(req.sessionID, Date.now() + UNLOCK_MS);
        logAudit('VISITOR_ARCHIVE_UNLOCK', req.session.user.username, 'visitor_archive', 'unlock', req);
        res.json({ success: true, unlockedUntil: unlockedUntil(req) });
    } catch (error) { fail(res, error, 'unlock'); }
});

router.get('/runs/:id/download', auth.requireAuth, auth.requireAdmin, requireUnlocked, requestLimit.heavyWork, async (req, res) => {
    try {
        const row = await loadRun(req);
        const file = await presentFile(row);
        logAudit('VISITOR_ARCHIVE_DOWNLOAD', req.session.user.username, 'visitor_archive', row.id, req);
        res.download(file, row.file_name, { dotfiles: 'allow', headers: { 'Content-Type': 'application/zip' } }, (error) => {
            if (error && !res.headersSent) fail(res, error, 'download');
        });
    } catch (error) { fail(res, error, 'download'); }
});

router.get('/runs/:id/records', auth.requireAuth, auth.requireAdmin, requireUnlocked, async (req, res) => {
    try {
        const row = await loadRun(req);
        const type = req.query.type === undefined ? 'feedback' : req.query.type;
        if (type !== 'feedback' && type !== 'lostFound') throw httpError(400, 'type must be feedback or lostFound.', 'type');
        const pageNumber = Number(req.query.page);
        const sizeNumber = Number(req.query.size);
        const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
        const size = Number.isInteger(sizeNumber) && sizeNumber > 0 ? Math.min(sizeNumber, 100) : 25;
        const q = String(req.query.q || '').trim().toLowerCase();
        const data = await archiveData(row);
        const all = type === 'feedback' ? data.feedbackRows : data.lostFoundRows;
        const matching = q ? all.filter((r) => r.search.includes(q)) : all;
        const rows = matching.slice((page - 1) * size, page * size).map(({ search, ...rest }) => rest);
        res.json({ success: true, type, total: matching.length, page, size, rows, keyMatches: row.key_fingerprint ? row.key_fingerprint === auth.keyFingerprint() : null });
    } catch (error) { fail(res, error, 'records'); }
});

router.get('/runs/:id/photo', auth.requireAuth, auth.requireAdmin, requireUnlocked, async (req, res) => {
    let handle = null;
    try {
        const row = await loadRun(req);
        const name = String(req.query.entry || '');
        const data = await archiveData(row);
        const listed = data.manifest && data.manifest.entries ? data.manifest.entries : {};
        if (!name.startsWith('photos/') || !Object.prototype.hasOwnProperty.call(listed, name)) throw httpError(404, 'This photo is not in the archive.');
        handle = await zip.openZip(await presentFile(row));
        const entry = (await zip.listEntries(handle)).get(name);
        if (!entry) throw httpError(404, 'This photo is not in the archive.');
        res.set({
            'Content-Type': PHOTO_TYPES[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream',
            'Content-Length': String(entry.uncompressedSize),
            'Cache-Control': 'no-store', // never kept by the browser after the unlock ends or the admin logs out
            'X-Content-Type-Options': 'nosniff'
        });
        await zip.pipeEntry(handle, entry, res);
    } catch (error) {
        if (!res.headersSent) fail(res, error, 'photo');
        else res.destroy();
    } finally {
        if (handle) handle.close();
    }
});

router.post('/runs/:id/decrypt', auth.requireAuth, auth.requireAdmin, requireUnlocked, async (req, res) => {
    try {
        const row = await loadRun(req);
        const body = req.body || {};
        if (body.type !== 'feedback' && body.type !== 'lostFound') throw httpError(400, 'type must be feedback or lostFound.', 'type');
        const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
        if (!ids.length || ids.length > 100 || !ids.every((id) => Number.isInteger(id) && id > 0)) throw httpError(400, 'Send 1 to 100 record ids.', 'ids');
        await presentFile(row);
        if (row.key_fingerprint !== auth.keyFingerprint()) return res.status(409).json({ success: false, error: 'This archive was encrypted with a different key.', keyMismatch: true });
        const data = await archiveData(row);
        const values = {};
        for (const id of ids) {
            if (body.type === 'feedback') {
                const feedback = data.feedback.get(id);
                const visitor = feedback ? data.visitors.get(feedback.user_id) : null;
                if (feedback) values[id] = { email: visitor && visitor.email_encrypted ? auth.tryDecryptEmail(visitor.email_encrypted) : null };
            } else {
                const report = data.lostFound.get(id);
                if (report) values[id] = { contact: report.contact_info_encrypted ? auth.tryDecryptEmail(report.contact_info_encrypted) : null };
            }
        }
        logAudit('VISITOR_ARCHIVE_DECRYPT', req.session.user.username, 'visitor_archive', row.id, req);
        res.json({ success: true, values });
    } catch (error) { fail(res, error, 'decrypt'); }
});

router.delete('/runs/:id/file', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const row = await loadRun(req);
        if (runner.ACTIVE_STATUSES.includes(row.status)) throw httpError(409, 'Wait until this archive has finished.');
        if (row.file_state !== 'present') throw httpError(404, 'This archive has no file to delete.');
        await checkPassword(req, req.body ? req.body.password : undefined, 'delete-file');
        await runner.removeArchiveFile(row, 'deleted'); // 409 when the drive of the folder is not plugged in
        if (viewCache && viewCache.key.startsWith(`${row.id}:`)) viewCache = null;
        logAudit('VISITOR_ARCHIVE_DELETE_FILE', req.session.user.username, 'visitor_archive', row.id, req);
        res.json({ success: true, run: await runner.describeRun(await runner.getRunRow(row.id)) });
    } catch (error) { fail(res, error, 'file delete'); }
});

module.exports = router;
// <Jun Kai end>
