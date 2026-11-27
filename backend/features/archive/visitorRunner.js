// Owner: Role 3, Jun Kai.
// Visitor Data Archive runs: what is due, previews, the run itself (write, check, delete, clean up), history and recovery.
// <Jun Kai start>
const fs = require('fs');
const path = require('path');
const db = require('../../core/db');
const auth = require('../../core/auth');
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');
const { logAudit } = require('../../core/audit');
const cacheStore = require('../analysis/cacheStore');
const parametersConfigStore = require('../parameters/store');
const settingsStore = require('./visitorSettings');
const schedule = require('./visitorSchedule');
const files = require('./visitorFiles');
const writer = require('./visitorWriter');
const deletedCounts = require('./deletedCounts');
const archivedLeaves = require('./archivedLeaves');
const saveGate = require('./saveGate');

const STATE_FILE = 'visitor-archive-state.json';
const ACTIVE_STATUSES = ['running', 'deleting', 'cleaning'];
const CHUNK_SIZE = 500;
const MB = 1024 * 1024;
const RECENT_VISIT_MS = 60 * 1000;
const CHANGED_MESSAGE = 'Some records changed while the archive was being written, so nothing was deleted. Run the archive again.';
const MISSING_FOLDER_MESSAGE = 'The archive folder is not available. Connect the drive that holds it, then try again.';
// compared before the delete; archive_status, email_sent and email_sent_at change on their own and are left out
const FEEDBACK_COLUMNS = ['comment', 'admin_notes', 'metadata', 'is_active', 'data_retention', 'photo_path', 'processed_photo_path'];

const state = { busy: false, progress: null, recovering: null };
const reportedRecoveryErrors = new Set(); // "<run id>: <error>", so a row that keeps failing is logged once

const query = async (sql, params = []) => (await db.pool.promise().query(sql, params))[0];
const isoOf = (value) => (value ? new Date(value).toISOString() : null);
const formatSize = (bytes) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : bytes < 1024 * MB ? `${(bytes / MB).toFixed(1)} MB` : `${(bytes / (1024 * MB)).toFixed(1)} GB`);

function chunks(list, size = CHUNK_SIZE) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

function httpError(status, message, field) {
    const error = new Error(message);
    error.status = status;
    if (field) error.field = field;
    return error;
}

// UPDATE visitor_archives SET <fields> for one run
function updateRun(id, fields) {
    return query('UPDATE visitor_archives SET ? WHERE id = ?', [fields, id]);
}

function readAutomationState() {
    const saved = readJson(paths.dataFile(STATE_FILE), {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function writeAutomationState(next) {
    writeJsonAtomic(paths.dataFile(STATE_FILE), { lastAutomaticAt: next.lastAutomaticAt || null, lastAutomaticResult: next.lastAutomaticResult || null, failures: next.failures || null });
}

// A visitor seen in the minute before the records were collected, or later, is never deleted (a kiosk save takes
// seconds between its last_visit update and its feedback insert). Only that minute counts: other updates also move
// last_visit (the consent clean-up does), and a wider window would keep those visitors past their keep period.
function recentGuard(collectedAt) {
    return new Date(collectedAt.getTime() - RECENT_VISIT_MS);
}

// Visitors with no feedback at all are due once last seen before the feedback cutoff (and not in that last minute)
function orphanGuard(criteria, collectedAt) {
    const recent = recentGuard(collectedAt);
    return criteria.feedbackBefore && criteria.feedbackBefore < recent ? criteria.feedbackBefore : recent;
}

// VIP leaves stay out of the archive (supervisor, 18 Nov 2026): a submission the tree draws in gold is never saved to a
// zip or deleted, so the leaf stays on the tree with its name. Returns the ids of those submissions made before `before`
// (the lookup itself is archivedLeaves.vipLeafIds, which Permanent Data Deletion uses too).
const vipLeafIds = (before) => archivedLeaves.vipLeafIds('f.created_at < ?', [before]);

// Rows of one archive. With `only`, a run is limited to those ids and a missing list means none of that type.
// vipLeaves: how many submissions matched but stay out because they are VIP leaves.
async function collectRows(criteria, collectedAt) {
    const types = criteria.types || [];
    const only = criteria.only;
    const raw = { feedback: [], answers: [], likes: [], users: [], userTotals: new Map(), orphanIds: [], lostFound: [], questions: [], options: [], guard: recentGuard(collectedAt), vipLeaves: 0 };

    if (types.includes('feedback') && criteria.feedbackBefore) {
        if (only) {
            for (const part of chunks(only.feedbackIds || [])) raw.feedback.push(...await query('SELECT * FROM feedback WHERE created_at < ? AND id IN (?) ORDER BY id', [criteria.feedbackBefore, part]));
        } else {
            raw.feedback = await query('SELECT * FROM feedback WHERE created_at < ? ORDER BY id', [criteria.feedbackBefore]);
        }
        const vip = new Set(await vipLeafIds(criteria.feedbackBefore));
        const matched = raw.feedback.length;
        raw.feedback = raw.feedback.filter((f) => !vip.has(f.id));
        raw.vipLeaves = matched - raw.feedback.length;
    }
    for (const part of chunks(raw.feedback.map((f) => f.id))) {
        raw.answers.push(...await query(
            `SELECT fa.id, fa.feedback_id, fa.question_id, fa.answer_value, fa.created_at, q.question_text, q.question_type, qo.option_label
             FROM feedback_answers fa
             LEFT JOIN questions q ON q.id = fa.question_id
             LEFT JOIN question_options qo ON q.question_type = 'choice' AND qo.question_id = fa.question_id AND qo.id = fa.answer_value
             WHERE fa.feedback_id IN (?) ORDER BY fa.feedback_id, fa.id`, [part]));
        raw.likes.push(...await query('SELECT id, feedback_id, user_identifier, created_at FROM pledge_likes WHERE feedback_id IN (?) ORDER BY id', [part]));
    }
    for (const part of chunks([...new Set(raw.feedback.map((f) => f.user_id))])) {
        raw.users.push(...await query('SELECT * FROM users WHERE id IN (?) ORDER BY id', [part]));
        // all of each visitor's feedback, selected or not: decides who stays and whose email is not kept
        const totals = await query(
            `SELECT user_id, COUNT(*) AS total, SUM(LOWER(COALESCE(data_retention, '')) IN ('temporary', '7days', '7day')) AS temporary
             FROM feedback WHERE user_id IN (?) GROUP BY user_id`, [part]);
        for (const row of totals) raw.userTotals.set(row.user_id, { total: Number(row.total), temporary: Number(row.temporary) });
    }
    if (types.includes('feedback') && criteria.feedbackBefore && !only) {
        const orphans = await query(
            `SELECT * FROM users u WHERE COALESCE(u.last_visit, u.created_at) < ?
             AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.user_id = u.id) ORDER BY u.id`, [orphanGuard(criteria, collectedAt)]);
        raw.users.push(...orphans);
        raw.orphanIds = orphans.map((u) => u.id);
    }
    if (types.includes('lostFound') && criteria.lostFoundBefore) {
        const resolved = criteria.onlyResolved ? " AND status = 'resolved'" : '';
        if (only) {
            for (const part of chunks(only.lostFoundIds || [])) raw.lostFound.push(...await query(`SELECT * FROM lost_found_reports WHERE created_at < ?${resolved} AND id IN (?) ORDER BY id`, [criteria.lostFoundBefore, part]));
        } else {
            raw.lostFound = await query(`SELECT * FROM lost_found_reports WHERE created_at < ?${resolved} ORDER BY id`, [criteria.lostFoundBefore]);
        }
    }
    for (const part of chunks([...new Set(raw.answers.map((a) => a.question_id))])) {
        raw.questions.push(...await query('SELECT * FROM questions WHERE id IN (?) ORDER BY id', [part]));
        raw.options.push(...await query('SELECT id, question_id, option_label, display_order FROM question_options WHERE question_id IN (?) ORDER BY question_id, display_order', [part]));
    }
    return raw;
}

// encrypt: true for a real run (lost & found contact details are encrypted before anything is written).
// collectedAt: when the records are read, which decides the visitors that count as recently seen.
async function collect(criteria, encrypt, collectedAt = new Date()) {
    const raw = await collectRows(criteria, collectedAt);
    const plan = await files.planPhotos(raw.feedback, raw.lostFound, criteria.includePhotos !== false);
    const selection = writer.buildSelection(raw, plan, { encrypt: encrypt ? auth.encryptEmail : null });
    selection.vipLeaves = raw.vipLeaves;
    return selection;
}

const isEmpty = (counts) => !counts.feedback && !counts.lostFound && !counts.visitors;

// photos / photoBytes: the photo files of the selected records (all of them go with the records);
// photosArchived: how many of those are written into the zip (none when photos are switched off);
// leaves / leavesNamed: the submissions the digital tree draws, and how many of those show a name there;
// vipLeaves: submissions that match the dates but are VIP leaves, so they are not in any of the other counts
async function preview(criteria) {
    const s = await collect(criteria, false);
    const c = s.counts;
    const drawn = archivedLeaves.countDrawn(s.records.feedback);
    return {
        counts: {
            feedback: c.feedback, visitors: c.visitors, visitorsKept: c.visitorsKept, visitorsDeleted: c.visitorsDeleted, answers: c.answers,
            likes: c.likes, lostFound: c.lostFound, photos: s.photosOnDisk, photosArchived: c.photos, missingPhotos: c.missingPhotos,
            leaves: drawn.leaves, leavesNamed: drawn.named, vipLeaves: s.vipLeaves
        },
        photoBytes: s.photoBytesOnDisk,
        estimatedBytes: s.estimatedBytes,
        oldest: s.oldest,
        newest: s.newest
    };
}

// Criteria of an automatic run: cutoffs from now, only the record types that are switched on
function criteriaFromSettings(s, now = new Date()) {
    const types = [];
    if (s.feedback.enabled) types.push('feedback');
    if (s.lostFound.enabled) types.push('lostFound');
    return {
        types,
        feedbackBefore: s.feedback.enabled ? schedule.cutoffFor(s.feedback.keep, now) : null,
        lostFoundBefore: s.lostFound.enabled ? schedule.cutoffFor(s.lostFound.keep, now) : null,
        onlyResolved: s.lostFound.onlyResolved,
        includePhotos: s.includePhotos
    };
}

async function prepareTarget(requested, estimatedBytes) {
    const chosen = typeof requested === 'string' && requested.trim() ? requested.trim() : settingsStore.read().folder;
    const problem = await files.folderRealProblem(chosen || '');
    if (problem) throw httpError(400, problem, 'folder');
    const target = chosen ? path.resolve(chosen) : files.DEFAULT_FOLDER;
    let free;
    try {
        free = await files.prepareFolder(target);
    } catch (error) {
        throw httpError(400, `The archive folder cannot be used (${error.code || error.message}).`, 'folder');
    }
    const needed = Math.ceil(estimatedBytes * 1.1) + 50 * MB;
    if (free < needed) throw httpError(400, `Not enough free space in the archive folder: about ${formatSize(needed)} is needed and ${formatSize(free)} is free.`, 'folder');
    return target;
}

function setProgress(runId, fields) {
    if (state.progress && state.progress.runId === runId) Object.assign(state.progress, fields);
}

async function setStage(runId, stage, extra = {}) {
    setProgress(runId, { stage });
    await updateRun(runId, { stage, ...extra });
}

// Starts a run and returns its id once the history row exists; the work carries on in the background.
// Throws an error with .status 409 (busy) or 400 (nothing to archive, folder problem) before any row is written.
async function startRun({ trigger, startedBy = null, criteria, deleteAfter, folder, req = null, onFinish = null }) {
    if (state.busy) throw httpError(409, 'An archive is already running.');
    state.busy = true;
    let started = false;
    try {
        await ensureRecovered();
        const active = await query('SELECT id FROM visitor_archives WHERE status IN (?) LIMIT 1', [ACTIVE_STATUSES]);
        if (active.length) throw httpError(409, 'An archive is already running.');
        // whole seconds, like the TIMESTAMP columns it is compared with before the delete
        const collectedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        const selection = await collect(criteria, true, collectedAt);
        if (isEmpty(selection.counts)) {
            throw httpError(400, selection.vipLeaves
                ? 'Nothing to archive: the only records that match these dates are VIP leaves, and VIP leaves stay on the tree.'
                : 'Nothing to archive: no records match these dates.');
        }
        const target = await prepareTarget(folder, selection.estimatedBytes);
        const startedAt = new Date();
        const used = (await query('SELECT file_name FROM visitor_archives WHERE folder = ? AND file_name IS NOT NULL', [target])).map((r) => r.file_name);
        const fileName = files.pickArchiveName(target, startedAt, used, await fs.promises.readdir(target));
        const c = selection.counts;
        const result = await query('INSERT INTO visitor_archives SET ?', [{
            started_at: startedAt, trigger_type: trigger, started_by: startedBy, status: 'running', stage: 'collecting',
            delete_records: deleteAfter ? 1 : 0, photos_included: criteria.includePhotos !== false ? 1 : 0,
            feedback_before: criteria.feedbackBefore || null, lost_found_before: criteria.lostFoundBefore || null,
            visitor_count: c.visitors, feedback_count: c.feedback, answer_count: c.answers, like_count: c.likes, lost_found_count: c.lostFound,
            photo_count: c.photos, missing_photo_count: c.missingPhotos, folder: target, file_name: fileName
        }]);
        const runId = result.insertId;
        state.progress = { runId, stage: 'collecting', processedEntries: 0, totalEntries: 0, processedBytes: 0, totalBytes: 0, startedAt: startedAt.toISOString() };
        const job = {
            runId, trigger, startedBy, criteria, deleteAfter: !!deleteAfter, folder: target, fileName, startedAt, selection, onFinish,
            collectedAt, guard: recentGuard(collectedAt),
            // the "Leaves on the tree" setting as it is now; a later change only affects later archives
            leaves: { mode: settingsStore.read().leaves, ...archivedLeaves.countDrawn(selection.records.feedback) },
            req: req ? { ip: req.ip, headers: { 'user-agent': req.headers['user-agent'] } } : null
        };
        started = true;
        console.log(`Visitor archive ${runId} started (${trigger}): ${c.feedback} feedback, ${c.lostFound} lost & found, ${c.visitors} visitor${c.visitors === 1 ? '' : 's'}`);
        runJob(job)
            .catch((error) => console.error(`Visitor archive ${runId} stopped: ${error.message}`))
            .finally(() => { state.busy = false; state.progress = null; });
        return runId;
    } finally {
        if (!started) state.busy = false;
    }
}

async function runJob(job) {
    try {
        await writeAndCheck(job);
    } catch (error) {
        return finishRun(job, 'failed', `The archive could not be written: ${error.message}`);
    }
    if (!job.deleteAfter) return finishRun(job, 'saved', null);
    let visitorsDeleted;
    try {
        await setStage(job.runId, 'deleting', { status: 'deleting' });
        visitorsDeleted = await deleteRecords(job);
    } catch (error) {
        // the transaction rolled back, so nothing was deleted
        if (error.recordsChanged) return finishRun(job, 'saved', CHANGED_MESSAGE);
        if (error.kioskBusy) return finishRun(job, 'saved', error.message);
        if (error.code === 'ER_NO_SUCH_TABLE') return finishRun(job, 'saved', 'The archive was saved and checked, but the database needs an update before records can be deleted: run npm run db:migrate, then archive again.');
        return finishRun(job, 'saved', `The archive was saved and checked, but the records could not be deleted: ${error.message}`);
    }
    // the records are gone now, so the run ends as done whatever the clean-up finds
    let warning = null;
    try {
        await setStage(job.runId, 'cleaning', { status: 'cleaning', visitors_deleted: visitorsDeleted });
        warning = await cleanUp(job.selection.photoSources, job.selection.records.feedback);
    } catch (error) {
        warning = `The records were deleted, but the clean-up stopped early (${error.message}).`;
    }
    return finishRun(job, 'done', warning, { visitors_deleted: visitorsDeleted });
}

// write <name>.partial -> check it -> rename -> sidecar; any error removes every file of this run
async function writeAndCheck(job) {
    const finalPath = path.join(job.folder, job.fileName);
    const partial = `${finalPath}.partial`;
    const sidecar = `${finalPath}.sha256`;
    try {
        await setStage(job.runId, 'writing');
        const meta = {
            archiveId: job.runId, createdAt: job.startedAt, createdBy: job.trigger === 'automatic' ? 'automatic' : job.startedBy, trigger: job.trigger,
            criteria: job.criteria, photosIncluded: job.criteria.includePhotos !== false, deleteAfterArchive: job.deleteAfter,
            encryption: { keyFingerprint: auth.keyFingerprint(), developmentKey: auth.usesDevelopmentKey() },
            leaves: job.leaves
        };
        const written = await writer.writeArchive(job.selection, meta, partial, (progress) => setProgress(job.runId, progress));
        await setStage(job.runId, 'verifying');
        const check = await writer.verifyArchive(partial, { ids: job.selection.ids });
        if (!check.ok) throw new Error(`the finished file did not pass the check (${check.problems[0]})`);
        await fs.promises.rename(partial, finalPath);
        await fs.promises.writeFile(sidecar, `${written.sha256}  ${job.fileName}\n`);
        await updateRun(job.runId, { file_size: written.size, file_sha256: written.sha256, key_fingerprint: meta.encryption.keyFingerprint, file_state: 'present' });
        job.fileSize = written.size;
    } catch (error) {
        for (const file of [partial, finalPath, sidecar]) await fs.promises.rm(file, { force: true, maxRetries: 5 }).catch(() => {});
        throw error;
    }
}

// Inside the delete transaction: locks the selected rows (FOR UPDATE, so nobody can change them before the commit)
// and compares them with what went into the zip. True when anything changed after the records were collected.
async function recordsChanged(all, job) {
    const { ids, records } = job.selection;
    const since = job.collectedAt;
    const archived = new Map(records.feedback.map((f) => [f.id, f]));
    const archivedIds = { feedback_answers: new Set(), pledge_likes: new Set() };
    for (const f of records.feedback) {
        for (const answer of f.answers || []) archivedIds.feedback_answers.add(answer.id);
        for (const like of f.likes || []) archivedIds.pledge_likes.add(like.id);
    }
    for (const part of chunks(ids.feedback)) {
        const rows = await all(`SELECT id, ${FEEDBACK_COLUMNS.join(', ')} FROM feedback WHERE id IN (?) FOR UPDATE`, [part]);
        for (const row of rows) {
            const before = archived.get(row.id) || {};
            if (FEEDBACK_COLUMNS.some((column) => (row[column] ?? null) !== (before[column] ?? null))) return true;
        }
        // answers and likes added since would go with their feedback without being in the zip. Compared by id:
        // created_at has whole seconds, so a like from earlier in the same second as collectedAt would look new.
        for (const table of ['feedback_answers', 'pledge_likes']) {
            const current = await all(`SELECT id FROM ${table} WHERE feedback_id IN (?) FOR UPDATE`, [part]);
            if (current.some((row) => !archivedIds[table].has(row.id))) return true;
        }
    }
    for (const part of chunks(ids.lostFound)) {
        const rows = await all('SELECT status, updated_at FROM lost_found_reports WHERE id IN (?) FOR UPDATE', [part]);
        if (rows.some((row) => (row.updated_at && new Date(row.updated_at) >= since) || (job.criteria.onlyResolved && row.status !== 'resolved'))) return true;
    }
    return false;
}

// One transaction: answers and likes go with their feedback (ON DELETE CASCADE); a visitor only goes when no feedback
// is left and they were not seen since the guard. Rolls back, with error.recordsChanged, when a record changed.
// Every deleted row is also added to deleted_record_counts in this transaction, so running totals keep counting it.
// A kiosk save goes first: the transaction checks the save gate before every statement and is rolled back and run
// again from the top when a save starts (error.kioskBusy after too many tries).
// With "Leaves on the tree" on keep or initials, the leaf of every feedback row the tree was drawing is written to
// archived_leaves in this transaction, just before the row is deleted, and is not counted as a deleted leaf.
function deleteRecords(job) {
    const { ids, records } = job.selection;
    const leafOptions = archivedLeaves.keeps(job.leaves.mode)
        ? { mode: job.leaves.mode, details: archivedLeaves.detailsOf(records), archiveId: job.runId }
        : null;
    return saveGate.deleteStep((checkpoint) => new Promise((resolve, reject) => {
        db.withTransaction((tx, finish) => {
            const run = async (sql, params) => {
                await checkpoint();
                return new Promise((ok, fail) => tx.run(sql, params, function (error) { if (error) fail(error); else ok(this.changes); }));
            };
            const all = async (sql, params) => {
                await checkpoint();
                return new Promise((ok, fail) => tx.all(sql, params, (error, rows) => (error ? fail(error) : ok(rows))));
            };
            (async () => {
                if (await recordsChanged(all, job)) throw Object.assign(new Error(CHANGED_MESSAGE), { recordsChanged: true });
                await deletedCounts.deleteCounted({ all, run }, 'feedback', ids.feedback, { keepLeaves: leafOptions ? archivedLeaves.keeper(leafOptions) : null });
                let visitorsDeleted = 0;
                for (const part of chunks(ids.visitorsDeleted)) {
                    const due = await all(
                        `SELECT id FROM users WHERE id IN (?) AND COALESCE(last_visit, created_at) < ?
                         AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.user_id = users.id) FOR UPDATE`, [part, job.guard]);
                    visitorsDeleted += await deletedCounts.deleteCounted({ all, run }, 'users', due.map((user) => user.id));
                }
                await deletedCounts.deleteCounted({ all, run }, 'lost_found_reports', ids.lostFound);
                await checkpoint(); // last look just before the commit
                return visitorsDeleted;
            })().then((count) => { finish(null, count); }, (error) => { finish(error); });
        }, (error, count) => (error ? reject(error) : resolve(count)));
    }));
}

// Pledge texts and answers of the deleted feedback that no remaining feedback uses -> removed from the analysis cache
async function purgeAnalysisCache(feedbackRecords) {
    const texts = new Set();
    for (const f of feedbackRecords) {
        texts.add(cacheStore.normalizeAnalysisText(f.comment));
        for (const a of f.answers || []) texts.add(cacheStore.normalizeAnalysisText(a.answer_value));
    }
    texts.delete('');
    if (!texts.size) return;
    for (const row of await query('SELECT comment AS text FROM feedback')) texts.delete(cacheStore.normalizeAnalysisText(row.text));
    for (const row of await query('SELECT answer_value AS text FROM feedback_answers')) texts.delete(cacheStore.normalizeAnalysisText(row.text));
    if (texts.size) await cacheStore.purgeTexts(texts);
}

// Unlinks the photo files of the deleted rows that no remaining row points at; returns a warning or null
async function cleanUp(photoSources, feedbackRecords) {
    const dbPaths = [...new Set((photoSources || []).map((s) => s.path).filter(Boolean))];
    const stillUsed = new Set();
    for (const part of chunks(dbPaths)) {
        const rows = await query(
            `SELECT photo_path AS p FROM feedback WHERE photo_path IN (?)
             UNION SELECT processed_photo_path FROM feedback WHERE processed_photo_path IN (?)
             UNION SELECT item_photo_path FROM lost_found_reports WHERE item_photo_path IN (?)`, [part, part, part]);
        for (const row of rows) stillUsed.add(String(row.p).toLowerCase());
    }
    const problems = [];
    for (const dbPath of dbPaths) {
        if (stillUsed.has(dbPath.toLowerCase())) continue;
        const file = files.resolveUploadPath(dbPath);
        if (!file) continue;
        try {
            await fs.promises.unlink(file);
        } catch (error) {
            if (error.code !== 'ENOENT') problems.push(error.code || error.message);
        }
    }
    try {
        await purgeAnalysisCache(feedbackRecords || []);
    } catch (error) {
        console.debug(`Visitor archive: analysis cache purge skipped (${error.message})`);
    }
    if (!problems.length) return null;
    return `The records were deleted, but ${problems.length} photo file${problems.length === 1 ? '' : 's'} could not be removed (${problems[0]}).`;
}

async function finishRun(job, status, message, extra = {}) {
    const error = message ? String(message).slice(0, 500) : null;
    try {
        await updateRun(job.runId, { status, stage: 'finished', finished_at: new Date(), error_message: error, ...extra });
    } catch (updateError) {
        console.error(`Visitor archive ${job.runId}: the history row could not be updated (${updateError.message})`);
    }
    if (status !== 'failed') {
        if (job.trigger === 'automatic') logAudit('VISITOR_ARCHIVE_AUTO', 'system', 'visitor_archive', job.runId, null);
        else logAudit('VISITOR_ARCHIVE_RUN', job.startedBy, 'visitor_archive', job.runId, job.req);
    }
    const c = job.selection.counts;
    if (status === 'failed') console.log(`Visitor archive ${job.runId} failed: ${error}`);
    else console.log(`Visitor archive ${job.runId} ${status === 'done' ? 'done, records deleted' : 'saved, records kept'}: ${job.fileName} (${formatSize(job.fileSize || 0)}), ${c.feedback} feedback, ${c.lostFound} lost & found${error ? `. ${error}` : ''}`);
    if (job.onFinish) {
        try { job.onFinish({ runId: job.runId, status, error }); } catch (callbackError) { console.debug(`Visitor archive ${job.runId}: ${callbackError.message}`); }
    }
}

async function countVisitorsLeft(visitorIds) {
    let left = 0;
    for (const part of chunks(visitorIds)) left += (await query('SELECT id FROM users WHERE id IN (?)', [part])).length;
    return left;
}

// True when the delete step never happened: a feedback or lost & found id of the archive is still there or, for an
// archive of visitors only, every one of them still is (after a delete the guard can rightly keep a few)
async function stillInDatabase(ids) {
    for (const part of chunks(ids.feedback || [])) if ((await query('SELECT id FROM feedback WHERE id IN (?) LIMIT 1', [part])).length) return true;
    for (const part of chunks(ids.lostFound || [])) if ((await query('SELECT id FROM lost_found_reports WHERE id IN (?) LIMIT 1', [part])).length) return true;
    const visitors = ids.visitorsDeleted || [];
    if ((ids.feedback || []).length || (ids.lostFound || []).length || !visitors.length) return false;
    return (await countVisitorsLeft(visitors)) === visitors.length;
}

// A run the server stopped in the middle of (restart, crash, power cut): never delete anything without a checked manifest
async function recoverRow(row) {
    const end = (status, message, extra = {}) => updateRun(row.id, { status, stage: 'finished', finished_at: new Date(), error_message: message ? message.slice(0, 500) : null, ...extra });
    const finalPath = row.folder && row.file_name ? path.join(row.folder, row.file_name) : null;
    if (row.status === 'running') {
        if (finalPath) for (const file of [`${finalPath}.partial`, finalPath, `${finalPath}.sha256`]) await fs.promises.rm(file, { force: true, maxRetries: 5 }).catch(() => {});
        return end('interrupted', 'The server stopped before the archive file was finished. Nothing was deleted.', { file_state: 'none' });
    }
    const check = finalPath && (await files.pathExists(finalPath)) ? await writer.verifyArchive(finalPath) : null;
    if (!check || !check.ok) {
        const why = check ? `the archive file did not pass the check (${check.problems[0]})` : 'the archive file is missing';
        if (row.status === 'deleting') return end(check ? 'saved' : 'failed', `The server stopped during the delete step and ${why}. Check whether the records are still in the database before archiving again.`);
        return end('done', `The records were deleted, but ${why}, so the photo clean-up was not finished.`);
    }
    const ids = check.manifest.ids || {};
    if (row.status === 'deleting' && await stillInDatabase(ids)) {
        return end('saved', 'Stopped before the records were deleted; they are still in the database.');
    }
    const extra = {};
    if (row.status === 'deleting') extra.visitors_deleted = (ids.visitorsDeleted || []).length - await countVisitorsLeft(ids.visitorsDeleted || []);
    const data = await writer.readArchiveData(finalPath);
    const warning = await cleanUp(check.manifest.photoSources, data.feedback);
    return end('done', warning, extra);
}

async function recover() {
    const rows = await query('SELECT * FROM visitor_archives WHERE status IN (?) ORDER BY id', [ACTIVE_STATUSES]);
    let failed = false;
    for (const row of rows) {
        try {
            await recoverRow(row);
            console.log(`Visitor archive ${row.id}: finished after a restart (it was ${row.status})`);
        } catch (error) {
            failed = true;
            const key = `${row.id}: ${error.message}`;
            if (!reportedRecoveryErrors.has(key)) console.error(`Visitor archive ${row.id}: recovery failed (${error.message})`);
            reportedRecoveryErrors.add(key);
        }
    }
    // a row left running, deleting or cleaning blocks every run: try again at the next tick or run
    if (failed) state.recovering = null;
}

// Runs recovery once per process (the scheduler calls it at boot; a run started first waits for it)
function ensureRecovered() {
    if (!state.recovering) state.recovering = recover().catch((error) => { state.recovering = null; throw error; });
    return state.recovering;
}

function archivePath(row) {
    return row.folder && row.file_name ? path.join(row.folder, row.file_name) : null;
}

// exists: whether the zip is on disk (describeRun checks it); leaves: { kept, initials } left on the digital tree
function toRun(row, exists = false, leaves = null) {
    return {
        id: row.id,
        startedAt: isoOf(row.started_at),
        finishedAt: isoOf(row.finished_at),
        trigger: row.trigger_type,
        startedBy: row.started_by,
        status: row.status,
        stage: row.stage,
        deleteRecords: !!row.delete_records,
        photosIncluded: !!row.photos_included,
        feedbackBefore: isoOf(row.feedback_before),
        lostFoundBefore: isoOf(row.lost_found_before),
        counts: {
            visitors: row.visitor_count, visitorsDeleted: row.visitors_deleted, feedback: row.feedback_count, answers: row.answer_count,
            likes: row.like_count, lostFound: row.lost_found_count, photos: row.photo_count, missingPhotos: row.missing_photo_count,
            leavesKept: leaves ? leaves.kept : 0, leavesWithInitials: leaves ? leaves.initials : 0
        },
        file: {
            name: row.file_name, folder: row.folder, size: row.file_size === null ? null : Number(row.file_size), sha256: row.file_sha256,
            state: row.file_state, deletedAt: isoOf(row.file_deleted_at), exists
        },
        keyFingerprint: row.key_fingerprint,
        keyMatches: row.key_fingerprint ? row.key_fingerprint === auth.keyFingerprint() : null,
        error: row.error_message
    };
}

// Only a run that deleted its records can have left leaves on the tree
const mayKeepLeaves = (row) => row.status === 'done' && !!row.delete_records;

// The run object with its file looked up on disk (fs.promises, so a missing drive never blocks the server).
// leavesByRun: the kept-leaf counts when the caller already read them for several runs.
async function describeRun(row, leavesByRun = null) {
    const file = archivePath(row);
    const counts = leavesByRun || (mayKeepLeaves(row) ? await archivedLeaves.countsForRuns([row.id]) : null);
    return toRun(row, row.file_state === 'present' && !!file && await files.pathExists(file), counts ? counts.get(row.id) || null : null);
}

async function getRunRow(id) {
    const rows = await query('SELECT * FROM visitor_archives WHERE id = ?', [id]);
    return rows[0] || null;
}

async function listRuns(limit) {
    const rows = await query('SELECT * FROM visitor_archives ORDER BY id DESC LIMIT ?', [limit]);
    const leavesByRun = await archivedLeaves.countsForRuns(rows.filter(mayKeepLeaves).map((row) => row.id));
    return Promise.all(rows.map((row) => describeRun(row, leavesByRun)));
}

function progressFor(runId) {
    return state.progress && state.progress.runId === Number(runId) ? { ...state.progress } : null;
}

// Deletes the zip and its sidecar and records why (deleted by an admin, or expired). An unplugged drive looks like a
// missing file, so the folder must be there first: otherwise a 409 and nothing is recorded (the file is still there)
async function removeArchiveFile(row, fileState) {
    const file = archivePath(row);
    if (file) {
        if (!(await files.pathExists(row.folder))) throw httpError(409, MISSING_FOLDER_MESSAGE);
        await fs.promises.rm(file, { force: true, maxRetries: 5 });
        await fs.promises.rm(`${file}.sha256`, { force: true, maxRetries: 5 });
    }
    await updateRun(row.id, { file_state: fileState, file_deleted_at: new Date() });
}

// Finished runs whose zip is past the keep period (keepFiles.amount 0 keeps them forever)
async function filesToExpire(keepFiles, now = new Date()) {
    if (!(Number(keepFiles && keepFiles.amount) > 0)) return [];
    const rows = await query("SELECT * FROM visitor_archives WHERE file_state = 'present' AND finished_at IS NOT NULL AND status NOT IN (?)", [ACTIVE_STATUSES]);
    return rows.filter((row) => schedule.filesExpired(keepFiles, row.finished_at, now));
}

// Deletes those zips; one on a drive that is not plugged in is skipped and tried again at the next tick.
// by / req: who the audit log names ('system' for the scheduler). Returns { count, bytes } of the deleted files.
async function expireFiles(keepFiles, now = new Date(), by = 'system', req = null) {
    let count = 0;
    let bytes = 0;
    for (const row of await filesToExpire(keepFiles, now)) {
        try {
            await removeArchiveFile(row, 'expired');
            logAudit('VISITOR_ARCHIVE_EXPIRE', by, 'visitor_archive', row.id, req);
            count++;
            bytes += Number(row.file_size) || 0;
        } catch (error) {
            console.debug(`Visitor archive ${row.id}: expired file not removed (${error.message})`);
        }
    }
    if (count) console.debug(`Visitor archive: ${count} file(s) past the keep period deleted`);
    return { count, bytes };
}

async function overview() {
    const s = settingsStore.read();
    const now = new Date();
    const feedbackBefore = schedule.cutoffFor(s.feedback.keep, now);
    const lostFoundBefore = schedule.cutoffFor(s.lostFound.keep, now);
    const vip = await vipLeafIds(feedbackBefore); // never archived, so not counted as ready
    const [fb] = await query(
        `SELECT COUNT(*) AS n, MIN(created_at) AS oldest, COUNT(DISTINCT user_id) AS visitors,
                SUM(photo_path IS NOT NULL AND photo_path <> '') + SUM(processed_photo_path IS NOT NULL AND processed_photo_path <> '') AS photos
         FROM feedback WHERE created_at < ?${vip.length ? ' AND id NOT IN (?)' : ''}`, vip.length ? [feedbackBefore, vip] : [feedbackBefore]);
    const [orphans] = await query('SELECT COUNT(*) AS n FROM users u WHERE COALESCE(u.last_visit, u.created_at) < ? AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.user_id = u.id)', [feedbackBefore]);
    const [lf] = await query(
        `SELECT COUNT(*) AS n, MIN(created_at) AS oldest, SUM(item_photo_path IS NOT NULL AND item_photo_path <> '') AS photos
         FROM lost_found_reports WHERE created_at < ?${s.lostFound.onlyResolved ? " AND status = 'resolved'" : ''}`, [lostFoundBefore]);
    const [totals] = await query(
        `SELECT COUNT(*) AS runs, COALESCE(SUM(file_state = 'present'), 0) AS files,
                COALESCE(SUM(CASE WHEN file_state = 'present' THEN file_size END), 0) AS bytes
         FROM visitor_archives`);
    // the page counts how many files a shorter "Keep archive files" would delete
    const present = await query("SELECT id, finished_at, file_size, status, delete_records FROM visitor_archives WHERE file_state = 'present' ORDER BY id DESC LIMIT 1000");
    const [last] = await query('SELECT * FROM visitor_archives ORDER BY id DESC LIMIT 1');
    const automation = readAutomationState();
    const softArchive = parametersConfigStore.readParametersConfig().archiveSettings || {};
    return {
        settings: s,
        limits: settingsStore.LIMITS,
        defaults: { folder: files.DEFAULT_FOLDER },
        folder: await files.checkFolder(s.folder),
        due: {
            feedback: { enabled: s.feedback.enabled, before: feedbackBefore.toISOString(), beforeDay: schedule.toSgtDay(feedbackBefore), count: Number(fb.n), oldest: isoOf(fb.oldest), vipLeaves: vip.length },
            lostFound: { enabled: s.lostFound.enabled, before: lostFoundBefore.toISOString(), beforeDay: schedule.toSgtDay(lostFoundBefore), count: Number(lf.n), oldest: isoOf(lf.oldest) },
            visitors: s.feedback.enabled ? Number(fb.visitors) + Number(orphans.n) : 0,
            orphanVisitors: s.feedback.enabled ? Number(orphans.n) : 0,
            photos: (s.feedback.enabled ? Number(fb.photos || 0) : 0) + (s.lostFound.enabled ? Number(lf.photos || 0) : 0)
        },
        automatic: {
            enabled: s.automatic.enabled,
            nextDueAt: isoOf(schedule.nextDueAt(s.automatic, automation, now)),
            lastAt: automation.lastAutomaticAt || null,
            lastResult: automation.lastAutomaticResult || null
        },
        running: state.progress ? { ...state.progress } : null,
        lastRun: last ? await describeRun(last) : null,
        totals: { runs: Number(totals.runs), files: Number(totals.files), bytes: Number(totals.bytes) },
        presentFiles: present.map((row) => ({
            id: row.id, finishedAt: isoOf(row.finished_at), size: row.file_size === null ? null : Number(row.file_size),
            recordsDeleted: row.status === 'done' && !!row.delete_records
        })),
        softArchive: { enabled: softArchive.autoArchiveEnabled === true, afterDays: Number(softArchive.archiveAfterDays) || 90 },
        encryption: { keyFingerprint: auth.keyFingerprint(), developmentKey: auth.usesDevelopmentKey() }
    };
}

module.exports = {
    ACTIVE_STATUSES, httpError, formatSize, preview, criteriaFromSettings, startRun, ensureRecovered, isBusy: () => state.busy, progressFor,
    getRunRow, listRuns, toRun, describeRun, archivePath, removeArchiveFile, filesToExpire, expireFiles, overview, readAutomationState, writeAutomationState
};
// <Jun Kai end>
