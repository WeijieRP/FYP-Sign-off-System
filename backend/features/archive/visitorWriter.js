// Owner: Role 3, Jun Kai.
// Builds a visitor archive zip from records already in memory, checks a finished zip, and reads one back (no database).
// <Jun Kai start>
const crypto = require('crypto');
const fs = require('fs');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const zip = require('../../core/zip');
const files = require('./visitorFiles');
const schedule = require('./visitorSchedule');

const FORMAT = 'esg-kiosk-visitor-archive';
const ENCRYPTED_FIELDS = ['visitors.email_encrypted', 'lostFound.contact_info_encrypted', 'lostFound.feedback_progress_encrypted'];
const DATA_FILES = { visitors: 'data/visitors.json', feedback: 'data/feedback.json', lostFound: 'data/lost-found.json' };

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const jsonBuffer = (value) => Buffer.from(JSON.stringify(value, null, 2));
const isoOf = (value) => (value ? new Date(value).toISOString() : null);
const sgtOf = (value) => (value ? schedule.toSgtDateTime(new Date(value)) : null);

function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row[key])) map.set(row[key], []);
        map.get(row[key]).push(row);
    }
    return map;
}

function topicsOf(metadata) {
    try {
        const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {};
        const list = Array.isArray(meta.pledgeTopics) ? meta.pledgeTopics : meta.pledgeTopic ? [meta.pledgeTopic] : [];
        return list.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
    } catch {
        return [];
    }
}

// Same rule as the users DELETE: a visitor seen at or after raw.guard (COALESCE(last_visit, created_at)) stays
function seenSinceGuard(user, guard) {
    if (!guard) return false;
    const seen = user.last_visit ?? user.created_at;
    return !(seen && new Date(seen) < guard);
}

// Raw DB rows + the photo plan -> the records, counts and ids of one archive. encrypt(text) is auth.encryptEmail
// (left out for a preview, which never writes anything).
function buildSelection(raw, plan, { encrypt = null } = {}) {
    const entryOf = new Map(plan.sources.map((s) => [`${s.table}:${s.id}:${s.column}`, s.entry]));
    const answersBy = groupBy(raw.answers, 'feedback_id');
    const likesBy = groupBy(raw.likes, 'feedback_id');
    const selectedPerUser = new Map();
    for (const row of raw.feedback) selectedPerUser.set(row.user_id, (selectedPerUser.get(row.user_id) || 0) + 1);

    const feedback = raw.feedback.map((row) => ({
        ...row,
        answers: (answersBy.get(row.id) || []).map((a) => ({
            id: a.id,
            question_id: a.question_id,
            question_text: a.question_text ?? null,
            question_type: a.question_type ?? null,
            answer_value: a.answer_value,
            answer_text: a.option_label ?? a.answer_value,
            created_at: a.created_at
        })),
        likes: (likesBy.get(row.id) || []).map((l) => ({ id: l.id, user_identifier: l.user_identifier, created_at: l.created_at })),
        photos: { raw: entryOf.get(`feedback:${row.id}:photo_path`) || null, processed: entryOf.get(`feedback:${row.id}:processed_photo_path`) || null }
    }));

    // a visitor stays in the database while they still have feedback outside this archive, or came in recently
    const orphans = new Set(raw.orphanIds || []);
    let emailsTrimmed = 0;
    const visitors = raw.users.map((user) => {
        const totals = raw.userTotals.get(user.id) || { total: 0, temporary: 0 };
        const kept = (!orphans.has(user.id) && totals.total > (selectedPerUser.get(user.id) || 0)) || seenSinceGuard(user, raw.guard);
        // legacy rows: only temporary consent on every one of their submissions -> the email is not kept
        const trim = totals.total > 0 && totals.temporary === totals.total && !!user.email_encrypted;
        if (trim) emailsTrimmed++;
        return { ...user, email_encrypted: trim ? null : user.email_encrypted, keptInDatabase: kept };
    });

    const lostFound = raw.lostFound.map((row) => {
        // the contact is stored encrypted since migration 010: it is copied as it is (same key and format as the
        // archive's own encryption); only a row from before that change still has a plain contact to encrypt here
        const { contact_info: contact, contact_info_encrypted: encryptedContact, feedback_progress: progress, ...rest } = row;
        const record = { ...rest, photo: entryOf.get(`lost_found_reports:${row.id}:item_photo_path`) || null };
        if (encrypt) {
            record.contact_info_encrypted = encryptedContact || (contact ? encrypt(String(contact)) : null);
            record.feedback_progress_encrypted = progress ? encrypt(String(progress)) : null;
        }
        return record;
    });

    const optionsBy = groupBy(raw.options, 'question_id');
    const questions = raw.questions.map((q) => ({
        ...q,
        options: (optionsBy.get(q.id) || []).map((o) => ({ id: o.id, option_label: o.option_label, display_order: o.display_order }))
    }));

    const visitorsDeleted = visitors.filter((v) => !v.keptInDatabase).map((v) => v.id);
    const answerCount = feedback.reduce((n, f) => n + f.answers.length, 0);
    const likeCount = feedback.reduce((n, f) => n + f.likes.length, 0);
    const times = [...raw.feedback, ...raw.lostFound].map((r) => new Date(r.created_at).getTime()).filter(Number.isFinite);
    const records = { visitors, feedback, lostFound, questions };
    return {
        records,
        counts: {
            visitors: visitors.length,
            visitorsKept: visitors.length - visitorsDeleted.length,
            visitorsDeleted: visitorsDeleted.length,
            feedback: feedback.length,
            answers: answerCount,
            likes: likeCount,
            lostFound: lostFound.length,
            photos: plan.photos.length,
            missingPhotos: plan.missing.length,
            temporaryTrimmed: plan.temporaryTrimmed + emailsTrimmed
        },
        ids: { feedback: feedback.map((f) => f.id), visitors: visitors.map((v) => v.id), visitorsDeleted, lostFound: lostFound.map((r) => r.id) },
        photos: plan.photos,
        photoSources: plan.sources,
        missingPhotos: plan.missing,
        photosOnDisk: plan.onDisk,
        photoBytesOnDisk: plan.onDiskBytes,
        // JSON plus CSV of the records, uncompressed, plus the photos (stored as they are)
        estimatedBytes: plan.includedBytes + Buffer.byteLength(JSON.stringify(records)) * 2 + 64 * 1024,
        oldest: times.length ? new Date(times.reduce((a, b) => Math.min(a, b))).toISOString() : null,
        newest: times.length ? new Date(times.reduce((a, b) => Math.max(a, b))).toISOString() : null
    };
}

// One sentence about the digital tree. leaves: { mode, leaves } with the "Leaves on the tree" choice and how many of
// the submissions are leaves on the tree. Null for an export only, or when none of them is on the tree.
function treeLine(deleteAfter, leaves) {
    const n = leaves ? Number(leaves.leaves) || 0 : 0;
    if (!deleteAfter || !n) return null;
    const were = n === 1 ? '1 leaf was' : `${n} leaves were`;
    if (leaves.mode === 'keep') return `Digital tree: ${were} to stay on the tree without ${n === 1 ? 'a name' : 'names'}; only the date, the badge and the VIP mark of a leaf are kept in the database.`;
    if (leaves.mode === 'initials') return `Digital tree: ${were} to stay on the tree, with the visitor's initials where the tree showed the name; only the date, the badge, the VIP mark and those initials are kept in the database.`;
    return `Digital tree: ${were} to leave the tree with the records; the tree's year book still counts ${n === 1 ? 'it' : 'them'}.`;
}

// The writer runs before the delete step, so the README says what was chosen, not what happened afterwards
function readmeText(m, leaves = null) {
    const c = m.counts;
    const day = (iso) => (iso ? schedule.toSgtDay(new Date(iso)) : '');
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    let photoLine = `- ${count(c.photos, 'photo')}${c.missingPhotos ? ` (${count(c.missingPhotos, 'photo file')} already missing)` : ''}`;
    if (!m.photosIncluded) {
        photoLine = m.deleteAfterArchive ? '- No photos: they were not kept in the zip (they were deleted with the records)' : '- No photos: they were not kept in the zip (they stayed on the server with the records)';
    }
    const lines = [
        'Visitor Data Archive',
        '',
        `Exported from the RP Xperience Centre kiosk on ${sgtOf(m.createdAt)} (Singapore time) as archive ${m.archiveId}, ${m.trigger === 'automatic' ? 'by the automatic schedule' : `by ${m.createdBy}`}.`,
        m.deleteAfterArchive
            ? 'This archive was made with "Delete the records from the database" switched on: the records were to be deleted after this file passed its check.'
            : 'This archive was made as an export only: the records stayed in the database.',
        treeLine(m.deleteAfterArchive, leaves),
        '',
        'Contents',
        `- ${count(c.feedback, 'feedback submission')} with ${count(c.answers, 'answer')} and ${count(c.likes, 'pledge like')}`,
        `- ${count(c.visitors, 'visitor')}${m.deleteAfterArchive && c.visitorsKept ? ` (${c.visitorsKept} to stay in the database because of newer feedback or a recent visit)` : ''}`,
        `- ${count(c.lostFound, 'lost & found report')}`,
        photoLine,
        c.temporaryTrimmed ? `- Photos and emails left out because the visitor only agreed to temporary storage: ${c.temporaryTrimmed}` : null,
        '',
        'Criteria',
        m.criteria.types.includes('feedback') ? `- Feedback submitted before ${day(m.criteria.feedbackBefore)} (Singapore time)` : '- Feedback was not part of this archive',
        m.criteria.types.includes('lostFound') ? `- Lost & found reports submitted before ${day(m.criteria.lostFoundBefore)}${m.criteria.onlyResolved ? ', resolved reports only' : ''}` : '- Lost & found reports were not part of this archive',
        '',
        'Folders',
        '- data/          every record as JSON, with all of its original database columns',
        '- csv/           the same records as spreadsheets (UTF-8, opens in Excel)',
        m.photosIncluded ? '- photos/        feedback photos (<id>-raw, <id>-processed) and lost & found item photos (<id>)' : null,
        '- manifest.json  counts, record ids and a SHA-256 checksum of every other file',
        '',
        'Encryption',
        'Visitor emails and lost & found contact details stay encrypted: AES-256-GCM, written as hex iv:authTag:ciphertext,',
        `with the server's ENCRYPTION_KEY (key fingerprint ${m.encryption.keyFingerprint}).`,
        m.encryption.developmentKey ? 'Warning: the server used the built-in development key, which anyone with the source code can use.' : null,
        'The admin page (Visitor Data Archive > View) can decrypt them while the same key is set.',
        'Keep a copy of ENCRYPTION_KEY from backend/.env, or these values cannot be read later.'
    ];
    return `${lines.filter((line) => line !== null).join('\r\n')}\r\n`;
}

function csvFiles(records) {
    const visitors = new Map(records.visitors.map((v) => [v.id, v]));
    const feedbackRows = records.feedback.map((f) => {
        const v = visitors.get(f.user_id) || {};
        return [f.id, f.user_id, v.name, v.email_encrypted, v.visit_count, f.comment, topicsOf(f.metadata).join('; '), f.data_retention,
            f.is_active, f.archive_status, f.photos.raw, f.photos.processed, isoOf(f.created_at), sgtOf(f.created_at)];
    });
    const answerRows = [];
    for (const f of records.feedback) for (const a of f.answers) answerRows.push([f.id, a.question_text, a.answer_text]);
    const lostFoundRows = records.lostFound.map((r) => [r.id, r.tracking_code, r.report_type, r.item_description, r.location_text, r.details, r.status,
        r.contact_info_encrypted, r.photo, isoOf(r.created_at), sgtOf(r.created_at)]);
    return [
        ['csv/feedback.csv', files.toCsv(['Feedback ID', 'Visitor ID', 'Visitor name', 'Email (encrypted)', 'Visits', 'Pledge', 'Topics', 'Retention',
            'Active', 'Archive status', 'Raw photo', 'Processed photo', 'Submitted (UTC)', 'Submitted (Singapore)'], feedbackRows)],
        ['csv/answers.csv', files.toCsv(['Feedback ID', 'Question', 'Answer'], answerRows)],
        ['csv/lost-found.csv', files.toCsv(['Report ID', 'Tracking code', 'Type', 'Item', 'Location', 'Details', 'Status', 'Contact (encrypted)',
            'Photo', 'Submitted (UTC)', 'Submitted (Singapore)'], lostFoundRows)]
    ];
}

// Appends one entry and waits until archiver has taken all of it in (so the order of the entries stays fixed)
function appendAndWait(archive, source, data) {
    return new Promise((resolve, reject) => {
        // a zip stream the pipeline already destroyed would never report this entry
        if (archive.destroyed) {
            reject(new Error('The zip stream closed before the archive was finished.'));
            return;
        }
        const onEntry = (entry) => { if (entry.name === data.name) { cleanup(); resolve(); } };
        const onError = (error) => { cleanup(); reject(error); };
        const onClose = () => { cleanup(); reject(new Error('The zip stream closed before the archive was finished.')); };
        const cleanup = () => { archive.off('entry', onEntry); archive.off('error', onError); archive.off('close', onClose); };
        archive.on('entry', onEntry);
        archive.on('error', onError);
        archive.on('close', onClose);
        archive.append(source, data);
    });
}

// Streams one photo into the zip through a hash. Archiver only reads more of it when the disk has caught up, so
// memory holds a few small chunks however big the photos are. Returns its manifest entry { size, sha256 }.
async function appendPhoto(archive, photo, date, failed) {
    const unreadable = (error) => new Error(`photo ${photo.entry} could not be read (${error.code || error.message})`);
    // the file existed when the records were selected; if it cannot be read now the run fails
    const file = await fs.promises.open(photo.file, 'r').catch((error) => { throw unreadable(error); });
    const hash = crypto.createHash('sha256');
    let size = 0;
    const source = file.createReadStream();
    const counter = new Transform({ transform(chunk, encoding, callback) { hash.update(chunk); size += chunk.length; callback(null, chunk); } });
    const readFailed = new Promise((resolve, reject) => source.once('error', (error) => reject(unreadable(error))));
    readFailed.catch(() => {}); // only raced below
    source.pipe(counter);
    try {
        await Promise.race([appendAndWait(archive, counter, { name: photo.entry, store: true, date }), failed, readFailed]);
    } finally {
        source.destroy(); // closes the photo at once when the write stopped part-way
    }
    return { size, sha256: hash.digest('hex') };
}

// Writes the zip to partialPath (the caller renames it after verifyArchive). Returns { size, sha256, manifest }.
// Any error removes the partial file. meta: archiveId, createdAt, createdBy, trigger, criteria, photosIncluded,
// deleteAfterArchive, encryption { keyFingerprint, developmentKey }, leaves { mode, leaves } (for README.txt only).
async function writeArchive(selection, meta, partialPath, onProgress = () => {}) {
    const manifest = {
        format: FORMAT,
        version: 1,
        archiveId: meta.archiveId,
        createdAt: meta.createdAt.toISOString(),
        createdBy: meta.createdBy,
        trigger: meta.trigger,
        criteria: { types: meta.criteria.types, feedbackBefore: isoOf(meta.criteria.feedbackBefore), lostFoundBefore: isoOf(meta.criteria.lostFoundBefore), onlyResolved: !!meta.criteria.onlyResolved },
        photosIncluded: !!meta.photosIncluded,
        deleteAfterArchive: !!meta.deleteAfterArchive,
        encryption: { algorithm: 'aes-256-gcm', encoding: 'hex iv:authTag:ciphertext', keyFingerprint: meta.encryption.keyFingerprint, developmentKey: !!meta.encryption.developmentKey, fields: ENCRYPTED_FIELDS },
        counts: selection.counts,
        ids: selection.ids,
        photoSources: selection.photoSources,
        missingPhotos: selection.missingPhotos,
        entries: {}
    };
    const { records } = selection;
    const buffers = [
        ['README.txt', Buffer.from(readmeText(manifest, meta.leaves))],
        [DATA_FILES.visitors, jsonBuffer(records.visitors)],
        [DATA_FILES.feedback, jsonBuffer(records.feedback)],
        [DATA_FILES.lostFound, jsonBuffer(records.lostFound)],
        ['data/questions.json', jsonBuffer(records.questions)],
        ...csvFiles(records).map(([name, text]) => [name, Buffer.from(text)])
    ];
    const progress = {
        processedEntries: 0,
        totalEntries: buffers.length + selection.photos.length + 1,
        processedBytes: 0,
        totalBytes: buffers.reduce((n, [, b]) => n + b.length, 0) + selection.photos.reduce((n, p) => n + p.size, 0)
    };
    const step = (bytes) => {
        progress.processedEntries++;
        progress.processedBytes += bytes;
        onProgress({ ...progress });
    };

    const archive = zip.createZipArchive();
    archive.on('warning', (error) => archive.destroy(error)); // never skip an entry silently
    const fileHash = crypto.createHash('sha256');
    const hasher = new Transform({ transform(chunk, encoding, callback) { fileHash.update(chunk); callback(null, chunk); } });
    const written = pipeline(archive, hasher, fs.createWriteStream(partialPath, { flush: true }));
    // every wait below also ends when the pipeline fails (full disk, unplugged drive); an entry can never finish then
    const failed = new Promise((resolve, reject) => { written.catch(reject); });
    failed.catch(() => {}); // only raced below; this stops a failure between two waits counting as unhandled
    try {
        for (const [name, buffer] of buffers) {
            manifest.entries[name] = { size: buffer.length, sha256: sha256(buffer) };
            await Promise.race([appendAndWait(archive, buffer, { name, date: meta.createdAt }), failed]);
            step(buffer.length);
        }
        for (const photo of selection.photos) {
            manifest.entries[photo.entry] = await appendPhoto(archive, photo, meta.createdAt, failed);
            step(manifest.entries[photo.entry].size);
        }
        await Promise.race([appendAndWait(archive, jsonBuffer(manifest), { name: 'manifest.json', date: meta.createdAt }), failed]);
        step(0); // its size was not known for totalBytes
        // finalize() settles before the file is on disk, so wait for the write stream too
        await Promise.race([Promise.all([archive.finalize(), written]), failed]);
        const size = (await fs.promises.stat(partialPath)).size;
        if (size !== archive.pointer()) throw new Error(`The zip file is ${size} bytes on disk but ${archive.pointer()} bytes were written.`);
        return { size, sha256: fileHash.digest('hex'), manifest };
    } catch (error) {
        archive.destroy(error);
        // when the disk failed first, that is the real reason (the later steps only saw a closed stream)
        const reason = await written.then(() => error, (pipelineError) => pipelineError);
        await fs.promises.rm(partialPath, { force: true, maxRetries: 5 });
        throw reason;
    }
}

function sameIds(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const x = a.map(Number).sort((p, q) => p - q);
    const y = b.map(Number).sort((p, q) => p - q);
    return x.every((value, i) => value === y[i]);
}

function checkRecords(manifest, data, expected, problems) {
    const counts = manifest.counts || {};
    const ids = manifest.ids || {};
    for (const key of Object.keys(DATA_FILES)) {
        const rows = data[key];
        if (!Array.isArray(rows)) continue;
        if (rows.length !== counts[key]) problems.push(`${DATA_FILES[key]} holds ${rows.length} records but the manifest counts ${counts[key]}.`);
        if (!sameIds(rows.map((r) => r.id), ids[key])) problems.push(`The ids in ${DATA_FILES[key]} do not match the manifest.`);
        if (expected && expected.ids && !sameIds(ids[key], expected.ids[key])) problems.push(`The ${key} ids in the archive are not the records that were selected.`);
    }
    if (Array.isArray(data.feedback)) {
        const answers = data.feedback.reduce((n, f) => n + (Array.isArray(f.answers) ? f.answers.length : 0), 0);
        const likes = data.feedback.reduce((n, f) => n + (Array.isArray(f.likes) ? f.likes.length : 0), 0);
        if (answers !== counts.answers) problems.push(`The archive holds ${answers} answers but the manifest counts ${counts.answers}.`);
        if (likes !== counts.likes) problems.push(`The archive holds ${likes} likes but the manifest counts ${counts.likes}.`);
    }
}

// Opens the zip, checks every entry against the manifest (sha256 + CRC) and the record files against the manifest
// counts and ids (and against expected.ids when given). Returns { ok, checkedEntries, problems, manifest }.
async function verifyArchive(file, expected = null) {
    const problems = [];
    let checkedEntries = 0;
    let manifest = null;
    let handle;
    try {
        handle = await zip.openZip(file);
    } catch (error) {
        return { ok: false, checkedEntries, problems: [`The file is not a readable zip (${error.message}).`], manifest };
    }
    try {
        const entries = await zip.listEntries(handle);
        if (entries.size !== handle.entryCount) problems.push('The zip holds two entries with the same name.');
        const manifestEntry = entries.get('manifest.json');
        if (!manifestEntry) {
            problems.push('manifest.json is missing.');
        } else {
            manifest = await zip.readJsonEntry(handle, manifestEntry);
            const listed = manifest && manifest.format === FORMAT && manifest.entries ? manifest.entries : null;
            if (!listed) {
                problems.push('manifest.json is not a visitor archive manifest.');
            } else {
                if (entries.size !== Object.keys(listed).length + 1) problems.push(`The zip holds ${entries.size} entries but the manifest lists ${Object.keys(listed).length + 1}.`);
                for (const name of Object.keys(listed)) if (!entries.has(name)) problems.push(`${name} is missing from the zip.`);
                for (const [name, entry] of entries) {
                    if (name === 'manifest.json') continue;
                    if (!listed[name]) { problems.push(`${name} is not listed in the manifest.`); continue; }
                    try {
                        const { sha256: hash, size } = await zip.hashEntry(handle, entry);
                        if (hash !== listed[name].sha256 || size !== listed[name].size) problems.push(`${name} does not match its checksum.`);
                    } catch (error) {
                        problems.push(`${name} could not be read (${error.message}).`);
                    }
                    checkedEntries++;
                }
                const data = {};
                for (const [key, name] of Object.entries(DATA_FILES)) {
                    if (!entries.has(name)) continue;
                    try { data[key] = await zip.readJsonEntry(handle, entries.get(name)); } catch (error) { problems.push(`${name} could not be read (${error.message}).`); }
                }
                checkRecords(manifest, data, expected, problems);
            }
        }
    } catch (error) {
        problems.push(`The archive could not be checked (${error.message}).`);
    } finally {
        handle.close();
    }
    return { ok: problems.length === 0, checkedEntries, problems: problems.slice(0, 20), manifest };
}

// The manifest and record files of a finished archive (for the View dialog and for recovery)
async function readArchiveData(file) {
    const handle = await zip.openZip(file);
    try {
        const entries = await zip.listEntries(handle);
        const read = async (name, fallback) => (entries.has(name) ? zip.readJsonEntry(handle, entries.get(name)) : fallback);
        return {
            manifest: await read('manifest.json', null),
            visitors: await read(DATA_FILES.visitors, []),
            feedback: await read(DATA_FILES.feedback, []),
            lostFound: await read(DATA_FILES.lostFound, [])
        };
    } finally {
        handle.close();
    }
}

module.exports = { FORMAT, buildSelection, writeArchive, verifyArchive, readArchiveData, topicsOf };
// <Jun Kai end>
