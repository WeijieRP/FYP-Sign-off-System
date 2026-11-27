// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The stop note: one small file that says why the kiosk programs are about to stop (Ctrl+C, the server window was
// closed, a restart from the admin page, an error). It is written with one synchronous call, because a program that
// is being closed has no time for anything else. The next start reads it and puts the reason into the activity log
// (features/serverControl/runLog.js). startAll.js and server.js both write it, so it needs nothing but fs and path.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'run-stop.json');
const FRESH_MS = 15000;

function read(file = FILE) {
    try {
        const note = JSON.parse(fs.readFileSync(file, 'utf8'));
        return note && typeof note.reason === 'string' && !Number.isNaN(new Date(note.at).getTime()) ? note : null;
    } catch {
        return null;
    }
}

// The first note of a stop wins: startAll.js and server.js see the same Ctrl+C, and the program that stops first
// knows the most (server.js knows its own error, startAll.js only that a server ended). Returns true when written.
function write(reason, detail = '', { file = FILE, now = new Date() } = {}) {
    try {
        const current = read(file);
        if (current && Math.abs(now.getTime() - new Date(current.at).getTime()) < FRESH_MS) return false;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ at: now.toISOString(), reason: String(reason), detail: String(detail || '').slice(0, 300) }));
        return true;
    } catch {
        return false; // a stop is never held up by its own note
    }
}

function clear(file = FILE) {
    try { fs.unlinkSync(file); } catch { /* nothing to clear */ }
}

module.exports = { FILE, FRESH_MS, read, write, clear };
// <Jun Kai end>
