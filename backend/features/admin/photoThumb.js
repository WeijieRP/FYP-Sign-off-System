// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Small pictures for the lists of the admin page (Feedback): GET /api/admin/feedback/:id/thumb/:kind, kind raw or
// processed. A page of 25 rows used to need 50 full photos to show pictures at all, so the list had View buttons
// instead. The browser only sends the record's id: the file path comes from the database, never from the request,
// and it must still lie inside the uploads folder. A made picture is kept in memory until its file changes.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../../core/db');
const paths = require('../../core/paths');

const SIZE = 96;          // drawn at 40 px, so sharp on a screen with 2x pixels
const KEEP = 400;         // pictures kept in memory (about 3 KB each)
const COLUMNS = { raw: 'photo_path', processed: 'processed_photo_path' };
const cache = new Map();  // file path -> { stamp, buffer }, oldest first

// the file a saved path points to, or null when it would leave the uploads folder
function fileInsideUploads(relPath) {
    const root = path.resolve(paths.UPLOADS);
    const file = path.resolve(root, String(relPath || ''));
    return file.startsWith(root + path.sep) ? file : null;
}

async function thumbnail(file) {
    const stat = await fs.promises.stat(file);
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    const kept = cache.get(file);
    if (kept && kept.stamp === stamp) return kept;
    // rotate() turns a phone photo the way its camera recorded it, before the resize
    const buffer = await sharp(file).rotate().resize(SIZE, SIZE, { fit: 'cover' }).webp({ quality: 72 }).toBuffer();
    cache.delete(file);
    cache.set(file, { stamp, buffer });
    while (cache.size > KEEP) cache.delete(cache.keys().next().value);
    return cache.get(file);
}

function handler(req, res) {
    const id = Number(req.params.id);
    const column = COLUMNS[req.params.kind];
    if (!Number.isInteger(id) || id < 1 || !column) return res.status(400).json({ success: false, error: 'Unknown picture' });
    db.get(`SELECT ${column} AS rel FROM feedback WHERE id = ?`, [id], async (err, row) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });
        const file = row && row.rel ? fileInsideUploads(row.rel) : null;
        if (!file) return res.status(404).json({ success: false, error: 'No photo' });
        try {
            const made = await thumbnail(file);
            const tag = `"${made.stamp}"`;
            // no-cache: the browser asks again every time (a cheap 304), so after a sign-out the picture is not
            // readable from the browser's own copy; the full photos behind /uploads are asked for again the same way
            res.set({ 'Cache-Control': 'private, no-cache', ETag: tag });
            if (req.headers['if-none-match'] === tag) return res.status(304).end();
            res.type('image/webp').send(made.buffer);
        } catch (error) {
            // the record names a file that is gone or is not a picture: the page shows its "no photo" box
            res.status(404).json({ success: false, error: error.code === 'ENOENT' ? 'The photo file is missing' : 'The photo could not be read' });
        }
    });
}

module.exports = { handler, fileInsideUploads, thumbnail, SIZE };
// <Jun Kai end>
