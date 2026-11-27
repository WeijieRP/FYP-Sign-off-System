// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Checks for photo file names and stored photo paths. The kiosk sends the name of the photo it saved, and that name
// was used as it came: a name like "../../backend/.env" pointed outside the uploads folder, so that file could be
// attached to the thank you email, put in a photo download or deleted when the record was deleted or expired.
const path = require('path');
const paths = require('./paths');

// A plain file name, or null: no folder part (/ or \), no "..", no drive letter or ":" and not empty.
function plainName(name) {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 255 || /[\\/:\0]/.test(trimmed) || trimmed.includes('..')) return null;
    return trimmed;
}

// The full path of a stored upload ("photos/x.png", "processed/x.png") when it stays inside the uploads folder,
// otherwise null. It joins the same way as before, so every path that worked still gives the same file.
function insideUploads(relative, root = paths.UPLOADS) {
    if (typeof relative !== 'string' || !relative.trim()) return null;
    const base = path.resolve(root);
    const full = path.resolve(path.join(base, relative));
    return full.startsWith(base + path.sep) ? full : null;
}

module.exports = { plainName, insideUploads };
// <Jun Kai end>
