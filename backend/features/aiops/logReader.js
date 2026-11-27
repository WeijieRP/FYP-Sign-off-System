// Owner: Role 3, Jun Kai.
// Reads the warning and error lines that core/log.js captureEvents keeps (logs/app-events-<process>.jsonl, one JSON
// line each) for the log detectors: the tail of each file once at the start, then only what was added since.
// <Jun Kai start>
const fs = require('fs');

const TAIL_BYTES = 2 * 1024 * 1024;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 50000;
const NEWLINE = 10;

// numbers -> #, the part of detectors.templateOf that matters here; used until detectors.js (built next to this
// file) is there
const mask = (message) => String(message).replace(/\d+/g, '#');
let detectors = null;
function templateOf(message) {
    if (!detectors) {
        try {
            detectors = require('./detectors');
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND' || !/detectors/.test(error.message)) throw error;
            return mask(message);
        }
    }
    return typeof detectors.templateOf === 'function' ? detectors.templateOf(message) : mask(message);
}

// size and identity of a file (the identity tells a rotated file from the fresh one that took its name); null when missing
function statOf(file) {
    try {
        const stat = fs.statSync(file, { bigint: true });
        return { size: Number(stat.size), id: stat.ino ? String(stat.ino) : null };
    } catch {
        return null;
    }
}
const sizeOf = (file) => {
    const stat = statOf(file);
    return stat ? stat.size : -1;
};

// bytes [from, to) of a file; empty when it cannot be read
function readBytes(file, from, to) {
    let fd = null;
    try {
        fd = fs.openSync(file, 'r');
        const buffer = Buffer.alloc(Math.max(0, to - from));
        let total = 0;
        while (total < buffer.length) {
            const n = fs.readSync(fd, buffer, total, buffer.length - total, from + total);
            if (!n) break;
            total += n;
        }
        return buffer.subarray(0, total);
    } catch {
        return Buffer.alloc(0);
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    }
}

function parseLine(line) {
    let event;
    try { event = JSON.parse(line); }
    catch { return null; }
    if (!event || typeof event !== 'object' || typeof event.message !== 'string' || typeof event.level !== 'string') return null;
    const ms = Date.parse(event.at);
    if (Number.isNaN(ms)) return null;
    return { at: event.at, process: typeof event.process === 'string' ? event.process : '', level: event.level, message: event.message, ms };
}

// The whole lines in bytes [from, to): { events, end } where end is the byte after the last complete line, so a line
// still being written is read whole next time. midLine drops the part of a line the window starts in.
function readLines(file, from, to, midLine) {
    const buffer = readBytes(file, from, to);
    let begin = 0;
    if (midLine) {
        const first = buffer.indexOf(NEWLINE);
        if (first < 0) return { events: [], end: from + buffer.length };
        begin = first + 1;
    }
    const last = buffer.lastIndexOf(NEWLINE);
    if (last < begin) return { events: [], end: from + begin };
    const events = [];
    for (const line of buffer.toString('utf8', begin, last).split('\n')) {
        const event = line.trim() ? parseLine(line) : null;
        if (event) events.push(event);
    }
    return { events, end: from + last + 1 };
}

// files: the event files to follow (each may have a .1 next to it, the one captureEvents rotated out); now may return
// milliseconds or a Date
function createLogReader(files, { now = () => Date.now() } = {}) {
    const list = Array.isArray(files) ? files : [files];
    const tracked = new Map(); // file -> { offset: byte after the last line read, id }
    let events = [];
    const nowMs = () => {
        const t = now();
        return t instanceof Date ? t.getTime() : Number(t);
    };

    function take(found) {
        for (const event of found) events.push(event);
    }

    // the 7-day cut, oldest first, and a ceiling so a flood of errors cannot fill the memory
    function settle() {
        const cutoff = nowMs() - KEEP_MS;
        events = events.filter((e) => e.ms >= cutoff).sort((a, b) => a.ms - b.ms);
        if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS);
    }

    function tail(file) {
        const stat = statOf(file);
        if (!stat) return { events: [], end: 0, id: null };
        const from = Math.max(0, stat.size - TAIL_BYTES);
        return { ...readLines(file, from, stat.size, from > 0), id: stat.id };
    }

    function load() {
        for (const file of list) {
            if (sizeOf(`${file}.1`) > 0) take(tail(`${file}.1`).events);
            const result = tail(file);
            take(result.events);
            tracked.set(file, { offset: result.end, id: result.id });
        }
        settle();
    }

    function readNew() {
        for (const file of list) {
            const seen = tracked.get(file) || { offset: 0, id: null };
            const stat = statOf(file);
            let offset = seen.offset;
            const replaced = !stat || stat.size < offset || (!!stat.id && !!seen.id && stat.id !== seen.id);
            if (replaced && offset > 0) {
                // rotated by captureEvents (or gone): the lines written since the last read are in the .1 file now
                const rotatedSize = sizeOf(`${file}.1`);
                if (rotatedSize >= offset) take(readLines(`${file}.1`, offset, rotatedSize, false).events);
                offset = 0;
            }
            if (stat && stat.size > offset) {
                const result = readLines(file, offset, stat.size, false);
                take(result.events);
                offset = result.end;
            }
            tracked.set(file, { offset, id: stat ? stat.id : null });
        }
        settle();
    }

    function eventsSince(hours = 24) {
        const from = nowMs() - hours * 60 * 60 * 1000;
        return events.filter((e) => e.ms >= from).map((e) => ({ at: e.at, process: e.process, level: e.level, message: e.message }));
    }

    // the templates (message with its numbers and ids masked) seen before this moment
    function known(beforeMs) {
        const before = beforeMs instanceof Date ? beforeMs.getTime() : Number(beforeMs);
        const templates = new Set();
        // each line is turned into its template once (an error flood keeps up to 50,000 lines, checked every minute)
        for (const e of events) if (e.ms < before) templates.add(e.template || (e.template = templateOf(e.message)));
        return templates;
    }

    function historyHours() {
        return events.length ? Math.max(0, (nowMs() - events[0].ms) / (60 * 60 * 1000)) : 0;
    }

    return { load, readNew, events: eventsSince, known, historyHours };
}

module.exports = { createLogReader, TAIL_BYTES, KEEP_MS, MAX_EVENTS };
// <Jun Kai end>
