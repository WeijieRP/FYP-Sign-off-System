// Owner: shared (lead: Role 3, Jun Kai).
// How much the servers print in the terminal. console.debug is request chatter ("Fetching overlay data...",
// "Found 6 overlays") and stays silent unless backend/.env has LOG_LEVEL=debug; console.log (startup lines and real
// actions), console.warn and console.error always print.
// <Jun Kai start>
function setupLogging(level = process.env.LOG_LEVEL) {
    if (String(level || '').trim().toLowerCase() === 'debug') return false;
    console.debug = () => {};
    return true;
}
// <Jun Kai end>

// <Jun Kai start>
// Warnings and errors are also kept as one JSON line each in logs/app-events-<process>.jsonl, so the anomaly detection
// (backend/features/aiops) can see error bursts and kinds of error never seen before. Lines that start with "[aiops]"
// are the detection's own and are skipped, so it never feeds on itself.
const fs = require('fs');
const path = require('path');
const util = require('util');
const paths = require('./paths');

const LOG_DIR = path.join(paths.ROOT, 'logs');
const MAX_MESSAGE_CHARS = 400;
const SKIP_PREFIX = '[aiops]';
// visitor emails are encrypted in the database, so they never go into this file as plain text
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
let active = null;

function eventFile(processName, dir = LOG_DIR) {
    return path.join(dir, `app-events-${processName}.jsonl`);
}

// Wraps console.warn and console.error (they still print). Never throws: a file problem is reported once through the
// original console.warn and then ignored. Returns { file, stop }; stop() puts the console back (tests).
function captureEvents(processName, { dir = LOG_DIR, maxBytes = 5 * 1024 * 1024 } = {}) {
    if (active) return active;
    const file = eventFile(processName, dir);
    const original = { warn: console.warn, error: console.error };
    let size = 0;
    let failed = false;
    try {
        fs.mkdirSync(dir, { recursive: true });
        size = fs.statSync(file).size;
    } catch { /* no file yet: it starts at 0; anything else shows on the first write */ }

    const append = (level, args) => {
        if (typeof args[0] === 'string' && args[0].startsWith(SKIP_PREFIX)) return;
        try {
            const message = util.format(...args).replace(EMAIL, '<email>').slice(0, MAX_MESSAGE_CHARS);
            const line = `${JSON.stringify({ at: new Date().toISOString(), process: processName, level, message })}\n`;
            if (size >= maxBytes) {
                // one older file is kept; when the rename fails the file just grows and the rename is tried again next time
                try { fs.renameSync(file, `${file}.1`); size = 0; } catch { /* ignore */ }
            }
            fs.appendFileSync(file, line, { flag: 'a' });
            size += Buffer.byteLength(line);
        } catch (error) {
            if (failed) return;
            failed = true;
            original.warn(`[aiops] cannot write ${file} (${error.message}); warnings stay in the terminal only`);
        }
    };
    console.warn = (...args) => { original.warn(...args); append('warn', args); };
    console.error = (...args) => { original.error(...args); append('error', args); };
    active = {
        file,
        stop() {
            console.warn = original.warn;
            console.error = original.error;
            active = null;
        }
    };
    return active;
}

// A value from a request, made safe to print in the terminal: line breaks are taken out, so a value cannot start a
// line that looks like a real log line ("✅ Admin signed in").
function forLog(value) {
    return String(value).replace(/[\r\n]/g, '');
}

// A visitor email for the log: the first two letters and the domain only ("jo***@gmail.com"). Visitor emails are
// encrypted in the database, so the terminal should not show them in full either.
function emailForLog(value) {
    const text = forLog(value);
    const at = text.lastIndexOf('@');
    if (at < 1) return text ? '***' : text;
    return `${text.slice(0, Math.min(2, at))}***${text.slice(at)}`;
}

module.exports = { setupLogging, captureEvents, eventFile, forLog, emailForLog };
// <Jun Kai end>
