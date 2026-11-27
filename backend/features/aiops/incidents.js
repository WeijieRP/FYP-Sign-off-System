// Owner: Role 3, Jun Kai.
// The incident engine behind anomaly detection on the System Health page: a tick runs the detectors and turns their
// anomalies into incidents (open, merge, reopen, auto-resolve); admins acknowledge, resolve and give a verdict. No SQL
// here: the engine talks to a store (memoryStore for the tests and the replay, sqlStore over the incidents tables).
// <Jun Kai start>
// Incident = { id, fingerprint, detector, kind, subject, severity info|warn|critical, status open|acknowledged|resolved,
//   title, explanation, evidence (object), opened_at, last_seen_at, acknowledged_at, acknowledged_by, resolved_at,
//   resolved_by ('auto' when it cleared by itself), resolve_note, verdict, verdict_by, verdict_at, occurrences }; dates are ISO strings.
const { TEST_PREFIX, isTest } = require('./fixes');
const { testIncident, testKinds, TEST_KIND_DEFAULT } = require('./testIncidents');

const SEVERITIES = ['info', 'warn', 'critical'];
const VERDICTS = ['correct', 'not-useful', 'false-alarm'];
const SEEN_EVERY_MS = 10 * 60 * 1000;      // a "seen" line every 10 minutes in the first hour of an incident
const SEEN_LATER_MS = 60 * 60 * 1000;      // then once an hour, so an incident open for days keeps a short timeline
const TEST_RESOLVE_MS = 10 * 60 * 1000;
const LIST_LIMIT = 50;
const LIST_MAX = 500;
const MAX = { fingerprint: 120, detector: 30, kind: 40, subject: 120, title: 200, note: 500, name: 50 };
const COLUMNS = ['fingerprint', 'detector', 'kind', 'subject', 'severity', 'status', 'title', 'explanation', 'evidence', 'opened_at', 'last_seen_at',
    'acknowledged_at', 'acknowledged_by', 'resolved_at', 'resolved_by', 'resolve_note', 'verdict', 'verdict_by', 'verdict_at', 'occurrences'];
const DATE_COLUMNS = ['opened_at', 'last_seen_at', 'acknowledged_at', 'resolved_at', 'verdict_at'];
const EMPTY_ROW = {
    fingerprint: '', detector: '', kind: '', subject: null, severity: 'warn', status: 'open', title: '', explanation: null, evidence: null,
    opened_at: null, last_seen_at: null, acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, resolve_note: null,
    verdict: null, verdict_by: null, verdict_at: null, occurrences: 1
};

const cut = (value, max) => (value === null || value === undefined ? null : String(value).slice(0, max));
const toDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const iso = (value) => { const date = toDate(value); return date ? date.toISOString() : null; };
const ms = (value) => { const date = toDate(value); return date ? date.getTime() : 0; };
const rank = (severity) => SEVERITIES.indexOf(severity);
const minutesToMs = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback) * 60 * 1000;
const idOf = (id) => { const n = Number(id); return Number.isInteger(n) && n > 0 ? n : null; };
const clampLimit = (limit) => { const n = Math.floor(Number(limit)); return Number.isFinite(n) && n > 0 ? Math.min(n, LIST_MAX) : LIST_LIMIT; };
const parseJson = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (error) { return null; }
};
// the same round trip MySQL gives a JSON column: strings are parsed, undefined keys and Dates become plain JSON
const jsonCopy = (value) => { const parsed = parseJson(value); return parsed === null ? null : JSON.parse(JSON.stringify(parsed)); };
const isOpen = (row) => row.status === 'open' || row.status === 'acknowledged';
const byOpen = (a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || ms(b.last_seen_at) - ms(a.last_seen_at) || b.id - a.id;
const byResolved = (a, b) => ms(b.resolved_at) - ms(a.resolved_at) || b.id - a.id;

// what a detector gave, trimmed to the table columns; an unknown severity counts as warn
function cleanAnomaly(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const detector = cut(raw.detector, MAX.detector);
    const kind = cut(raw.kind, MAX.kind);
    if (!detector || !kind) return null;
    const subject = raw.subject === null || raw.subject === undefined || raw.subject === '' ? null : cut(raw.subject, MAX.subject);
    return {
        detector, kind, subject,
        fingerprint: cut(raw.fingerprint || `${detector}:${kind}:${subject || '-'}`, MAX.fingerprint),
        severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'warn',
        title: cut(raw.title || `${detector}: ${kind}`, MAX.title),
        explanation: raw.explanation === null || raw.explanation === undefined ? null : String(raw.explanation),
        evidence: raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : null
    };
}

// store: memoryStore() or sqlStore(db); settings() is read on every tick; load() builds the detectors' input;
// audit(action, by, id) is the caller's logAudit; detect and settings default to the aiops modules, loaded on first use
function createEngine({ store, detect, now = () => new Date(), settings, load, audit = () => {} } = {}) {
    if (!store) throw new Error('createEngine needs a store');
    if (typeof load !== 'function') throw new Error('createEngine needs load()');
    const runDetect = detect || ((input, current) => require('./detectors').runAll(input, current));
    const readSettings = settings || (() => require('./settings').read());
    const seenAt = new Map(); // incident id -> ms of its last timeline entry, so 'seen' is written every 10 minutes at most
    let running = null;

    const record = (action, by, id) => {
        try {
            const result = audit(action, by, id);
            if (result && typeof result.catch === 'function') result.catch((error) => console.warn(`[aiops] audit ${action} failed: ${error.message}`));
        } catch (error) {
            console.warn(`[aiops] audit ${action} failed: ${error.message}`);
        }
    };

    const openIncident = async (anomaly, at) => {
        const id = await store.insert({ ...EMPTY_ROW, ...anomaly, status: 'open', opened_at: at, last_seen_at: at, occurrences: 1 });
        await store.addEvent(id, 'opened', { severity: anomaly.severity, title: anomaly.title }, at);
        seenAt.set(id, ms(at));
        return id;
    };

    const valueOf = (evidence) => (evidence && typeof evidence.value === 'number' ? evidence.value : null);

    const mergeIncident = async (incident, anomaly, at) => {
        const fields = { last_seen_at: at, occurrences: (Number(incident.occurrences) || 1) + 1 };
        const worse = rank(anomaly.severity) > rank(incident.severity);
        const higher = valueOf(anomaly.evidence) !== null && (valueOf(incident.evidence) === null || valueOf(anomaly.evidence) > valueOf(incident.evidence));
        // the incident shows the worst state seen so far (a fuller disk, a longer outage); the timeline keeps the steps
        if (worse || higher) Object.assign(fields, { title: anomaly.title, explanation: anomaly.explanation, evidence: anomaly.evidence });
        if (worse) {
            fields.severity = anomaly.severity;
            await store.addEvent(incident.id, 'severity', { from: incident.severity, to: anomaly.severity }, at);
            seenAt.set(incident.id, ms(at));
        }
        const seenEvery = ms(at) - ms(incident.opened_at) < SEEN_LATER_MS ? SEEN_EVERY_MS : SEEN_LATER_MS;
        if (ms(at) - (seenAt.get(incident.id) || 0) >= seenEvery) {
            const detail = { occurrences: fields.occurrences };
            if (anomaly.evidence && typeof anomaly.evidence.value === 'number') detail.value = anomaly.evidence.value;
            await store.addEvent(incident.id, 'seen', detail, at);
            seenAt.set(incident.id, ms(at));
        }
        await store.update(incident.id, fields);
    };

    // the same problem came back within the cooldown: the incident describes the new episode; the verdict stays
    const reopenIncident = async (incident, anomaly, at) => {
        const fields = {
            status: 'open', last_seen_at: at, occurrences: (Number(incident.occurrences) || 1) + 1,
            severity: anomaly.severity, title: anomaly.title, explanation: anomaly.explanation, evidence: anomaly.evidence,
            acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, resolve_note: null
        };
        await store.update(incident.id, fields);
        await store.addEvent(incident.id, 'reopened', { severity: anomaly.severity, title: anomaly.title }, at);
        seenAt.set(incident.id, ms(at));
    };

    // reason: why it closed without the readings going back to normal ('detector-off'); none for the normal case
    const autoResolve = async (incident, at, reason) => {
        await store.update(incident.id, { status: 'resolved', resolved_at: at, resolved_by: 'auto', resolve_note: null });
        await store.addEvent(incident.id, 'resolved', reason ? { auto: true, reason } : { auto: true }, at);
        seenAt.delete(incident.id);
    };

    const startsWithAny = (prefixes, fingerprint) => prefixes.some((prefix) => typeof prefix === 'string' && prefix !== '' && String(fingerprint).startsWith(prefix));

    async function runTick() {
        const current = readSettings() || {};
        const at = iso(now());
        const result = { skipped: null, at, anomalies: 0, opened: 0, merged: 0, resolved: 0, states: {}, notes: {} };
        if (current.enabled === false) return { ...result, skipped: 'disabled' };
        const input = await load();
        const detected = (await runDetect(input, current)) || {};
        const anomalies = Array.isArray(detected.anomalies) ? detected.anomalies : [];
        const wanted = new Map(); // one anomaly per fingerprint this tick, the highest severity wins
        for (const raw of anomalies) {
            const anomaly = cleanAnomaly(raw);
            if (!anomaly) continue;
            const other = wanted.get(anomaly.fingerprint);
            if (!other || rank(anomaly.severity) > rank(other.severity)) wanted.set(anomaly.fingerprint, anomaly);
        }
        const open = await store.listOpen();
        const openByFingerprint = new Map(open.map((incident) => [incident.fingerprint, incident]));
        const cooldownMs = minutesToMs(current.cooldownMinutes, 30);
        for (const anomaly of wanted.values()) {
            const existing = openByFingerprint.get(anomaly.fingerprint);
            if (existing) {
                await mergeIncident(existing, anomaly, at);
                result.merged++;
                continue;
            }
            const earlier = cooldownMs > 0 ? await store.findResolvedSince(anomaly.fingerprint, ms(at) - cooldownMs) : null;
            if (earlier) await reopenIncident(earlier, anomaly, at);
            else await openIncident(anomaly, at);
            result.opened++;
        }
        const clearMs = minutesToMs(current.clearAfterMinutes, 10);
        // held: nothing looked at these in this check (quiet hours, a PC that just woke up, a detector that failed), so
        // they stay as they are; closed: their detector is switched off, so they are closed at once
        const held = Array.isArray(detected.held) ? detected.held : [];
        const closed = Array.isArray(detected.closed) ? detected.closed : [];
        for (const incident of open) {
            if (wanted.has(incident.fingerprint)) continue;
            // a test incident closes 10 minutes after it opened, whatever its detector does
            const test = isTest(incident);
            if (!test && startsWithAny(closed, incident.fingerprint)) {
                await autoResolve(incident, at, 'detector-off');
                result.resolved++;
                continue;
            }
            if (!test && startsWithAny(held, incident.fingerprint)) continue;
            const age = ms(at) - ms(test ? incident.opened_at : incident.last_seen_at);
            if (age < (test ? TEST_RESOLVE_MS : clearMs)) continue;
            await autoResolve(incident, at);
            result.resolved++;
        }
        return { ...result, anomalies: anomalies.length, states: detected.states || {}, notes: detected.notes || {} };
    }

    // a tick that starts while one runs (run-now during the timer's tick) just waits for that one
    function tick() {
        if (!running) running = runTick().finally(() => { running = null; });
        return running;
    }

    async function acknowledge(id, by) {
        const incident = await store.get(id);
        if (!incident || incident.status !== 'open') return incident;
        const at = iso(now());
        await store.update(incident.id, { status: 'acknowledged', acknowledged_at: at, acknowledged_by: cut(by, MAX.name) });
        await store.addEvent(incident.id, 'acknowledged', { by }, at);
        record('AIOPS_INCIDENT_ACKNOWLEDGE', by, incident.id);
        return store.get(incident.id);
    }

    async function resolve(id, by, note) {
        const incident = await store.get(id);
        if (!incident || incident.status === 'resolved') return incident;
        const at = iso(now());
        const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, MAX.note) : null;
        await store.update(incident.id, { status: 'resolved', resolved_at: at, resolved_by: cut(by, MAX.name), resolve_note: cleanNote });
        await store.addEvent(incident.id, 'resolved', { by, note: cleanNote }, at);
        seenAt.delete(incident.id);
        record('AIOPS_INCIDENT_RESOLVE', by, incident.id);
        return store.get(incident.id);
    }

    async function setVerdict(id, verdict, by) {
        if (!VERDICTS.includes(verdict)) throw Object.assign(new Error('The verdict must be correct, not-useful or false-alarm'), { status: 400 });
        const incident = await store.get(id);
        if (!incident) return null;
        const at = iso(now());
        await store.update(incident.id, { verdict, verdict_by: cut(by, MAX.name), verdict_at: at });
        await store.addEvent(incident.id, 'verdict', { by, verdict }, at);
        record('AIOPS_INCIDENT_VERDICT', by, incident.id);
        return store.get(incident.id);
    }

    // Send test incident: one incident with made up numbers, of the kind the admin picked (testIncidents.js), with its real detector so
    // the page, the advisor and the steps treat it like the real thing; the tick closes it 10 minutes after it opened
    async function openTest(by, kind = TEST_KIND_DEFAULT) {
        const at = iso(now());
        const nowMs = ms(at);
        const row = testIncident(kind === undefined || kind === null || kind === '' ? TEST_KIND_DEFAULT : String(kind), nowMs, by);
        if (!row) throw Object.assign(new Error(`Choose a test incident: ${testKinds().map((k) => k.key).join(', ')}`), { status: 400 });
        const id = await store.insert({ ...EMPTY_ROW, ...row, status: 'open', opened_at: at, last_seen_at: at, occurrences: 1 });
        await store.addEvent(id, 'opened', { by, test: true, severity: row.severity }, at);
        seenAt.set(id, nowMs);
        record('AIOPS_TEST_INCIDENT', by, id);
        return store.get(id);
    }

    return { tick, acknowledge, resolve, setVerdict, openTest };
}

// Both stores: insert(incident) -> id, update(id, fields) -> boolean, get(id), list({ status: 'open' | 'resolved' | 'all',
// limit }), listOpen(), findResolvedSince(fingerprint, sinceMs), addEvent(id, type, detail, at) -> id, events(id),
// examples(detector, limit, exceptId) (resolved, marked correct, newest first), latestEvents(ids, type) -> { id: event },
// verdicts(detector, sinceMs) -> [{ verdict, verdict_at }] newest first, deleteByFingerprintPrefix(prefix) -> count,
// countByFingerprintPrefix(prefix) -> count, prune(beforeMs) -> count. Test incidents (fingerprint "test:...", or the
// detector 'test' of before 17 Nov 2026) never count for examples() and verdicts(), so they never teach the advisor or tune a detector. Dates in can be Dates or ISO strings; dates out are ISO strings; evidence and detail are objects.
function memoryStore() {
    const incidents = [];
    const events = [];
    let nextId = 1;
    let nextEventId = 1;
    const find = (id) => incidents.find((row) => row.id === idOf(id)) || null;
    const copy = (row) => (row ? structuredClone(row) : null);
    const clean = (fields) => {
        const out = {};
        for (const key of Object.keys(fields)) {
            if (!COLUMNS.includes(key)) continue;
            if (DATE_COLUMNS.includes(key)) out[key] = iso(fields[key]);
            else if (key === 'evidence') out[key] = jsonCopy(fields[key]);
            else if (key === 'occurrences') out[key] = Number(fields[key]) || 1;
            else out[key] = fields[key] === undefined ? null : fields[key];
        }
        return out;
    };
    return {
        async insert(incident) {
            const row = { ...EMPTY_ROW, ...clean(incident), id: nextId++ };
            incidents.push(row);
            return row.id;
        },
        async update(id, fields) {
            const row = find(id);
            if (!row) return false;
            Object.assign(row, clean(fields));
            return true;
        },
        async get(id) {
            return copy(find(id));
        },
        async list({ status = 'open', limit } = {}) {
            const open = incidents.filter(isOpen).sort(byOpen);
            const resolved = incidents.filter((row) => row.status === 'resolved').sort(byResolved);
            const rows = status === 'resolved' ? resolved : status === 'all' ? open.concat(resolved) : open;
            return rows.slice(0, clampLimit(limit)).map(copy);
        },
        async listOpen() {
            return incidents.filter(isOpen).sort(byOpen).map(copy);
        },
        async findResolvedSince(fingerprint, sinceMs) {
            const rows = incidents.filter((row) => row.fingerprint === fingerprint && row.status === 'resolved' && ms(row.resolved_at) >= sinceMs).sort(byResolved);
            return copy(rows[0] || null);
        },
        async addEvent(id, type, detail, at) {
            const incidentId = idOf(id);
            if (!incidentId) throw new Error('addEvent needs an incident id');
            const event = { id: nextEventId++, incident_id: incidentId, at: iso(at), type, detail: jsonCopy(detail) };
            events.push(event);
            return event.id;
        },
        async events(id) {
            return events.filter((event) => event.incident_id === idOf(id)).sort((a, b) => ms(a.at) - ms(b.at) || a.id - b.id).map(copy);
        },
        async examples(detector, limit = 3, exceptId = null) {
            return incidents.filter((row) => row.detector === detector && row.verdict === 'correct' && row.status === 'resolved' && row.id !== idOf(exceptId) && !isTest(row))
                .sort(byResolved).slice(0, limit).map(copy);
        },
        async verdicts(detector, sinceMs) {
            return incidents.filter((row) => row.detector === detector && row.verdict && ms(row.verdict_at) >= sinceMs && !isTest(row))
                .sort((a, b) => ms(b.verdict_at) - ms(a.verdict_at)).slice(0, 20).map((row) => ({ verdict: row.verdict, verdict_at: row.verdict_at }));
        },
        async deleteByFingerprintPrefix(prefix) {
            if (!prefix) return 0;
            const gone = new Set(incidents.filter((row) => String(row.fingerprint).startsWith(prefix)).map((row) => row.id));
            for (let i = incidents.length - 1; i >= 0; i--) if (gone.has(incidents[i].id)) incidents.splice(i, 1);
            for (let i = events.length - 1; i >= 0; i--) if (gone.has(events[i].incident_id)) events.splice(i, 1);
            return gone.size;
        },
        async countByFingerprintPrefix(prefix) {
            return prefix ? incidents.filter((row) => String(row.fingerprint).startsWith(prefix)).length : 0;
        },
        async latestEvents(ids, type) {
            const wanted = new Set((Array.isArray(ids) ? ids : []).map(idOf).filter(Boolean));
            const out = {};
            for (const event of [...events].sort((a, b) => ms(b.at) - ms(a.at) || b.id - a.id)) {
                if (event.type === type && wanted.has(event.incident_id) && !out[event.incident_id]) out[event.incident_id] = copy(event);
            }
            return out;
        },
        async prune(beforeMs) {
            const gone = new Set(incidents.filter((row) => row.status === 'resolved' && ms(row.resolved_at) < beforeMs).map((row) => row.id));
            for (let i = incidents.length - 1; i >= 0; i--) if (gone.has(incidents[i].id)) incidents.splice(i, 1);
            for (let i = events.length - 1; i >= 0; i--) if (gone.has(events[i].incident_id)) events.splice(i, 1);
            return gone.size;
        }
    };
}

// db is the callback module (backend/core/db: get/all/run); the session is UTC, so Dates go in as params and come back
// as Dates. A missing table (before npm run db:migrate) is rethrown with error.missingTable so the routes can say so.
function sqlStore(db) {
    const tag = (error) => {
        if (error && error.code === 'ER_NO_SUCH_TABLE') error.missingTable = true;
        return error;
    };
    const all = (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => (error ? reject(tag(error)) : resolve(rows || [])));
    });
    const get = (sql, params) => new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => (error ? reject(tag(error)) : resolve(row || null)));
    });
    const run = (sql, params) => new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) reject(tag(error));
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
    const toJson = (value) => { const parsed = parseJson(value); return parsed === null ? null : JSON.stringify(parsed); };
    const param = (key, value) => {
        if (DATE_COLUMNS.includes(key)) return toDate(value);
        if (key === 'evidence') return toJson(value);
        return value === undefined ? null : value;
    };
    const fromRow = (row) => {
        if (!row) return null;
        const out = { ...row, id: Number(row.id), occurrences: Number(row.occurrences) || 1, evidence: parseJson(row.evidence) };
        for (const key of DATE_COLUMNS) out[key] = iso(row[key]);
        return out;
    };
    const fromEvent = (row) => ({ ...row, id: Number(row.id), incident_id: Number(row.incident_id), at: iso(row.at), detail: parseJson(row.detail) });
    const openRows = (limit) => all(
        "SELECT * FROM incidents WHERE status IN ('open', 'acknowledged') ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, last_seen_at DESC, id DESC" + (limit ? ' LIMIT ?' : ''),
        limit ? [limit] : []
    );
    const resolvedRows = (limit) => all("SELECT * FROM incidents WHERE status = 'resolved' ORDER BY resolved_at DESC, id DESC LIMIT ?", [limit]);
    return {
        async insert(incident) {
            const row = { ...EMPTY_ROW, ...incident };
            const result = await run(`INSERT INTO incidents (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`, COLUMNS.map((key) => param(key, row[key])));
            return result.lastID;
        },
        async update(id, fields) {
            const incidentId = idOf(id);
            const keys = Object.keys(fields).filter((key) => COLUMNS.includes(key));
            if (!incidentId || !keys.length) return false;
            const result = await run(`UPDATE incidents SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [...keys.map((key) => param(key, fields[key])), incidentId]);
            return result.changes > 0;
        },
        async get(id) {
            const incidentId = idOf(id);
            return incidentId ? fromRow(await get('SELECT * FROM incidents WHERE id = ?', [incidentId])) : null;
        },
        async list({ status = 'open', limit } = {}) {
            const max = clampLimit(limit);
            if (status === 'resolved') return (await resolvedRows(max)).map(fromRow);
            const open = (await openRows(max)).map(fromRow);
            if (status !== 'all' || open.length >= max) return open;
            return open.concat((await resolvedRows(max - open.length)).map(fromRow));
        },
        async listOpen() {
            return (await openRows(0)).map(fromRow);
        },
        async findResolvedSince(fingerprint, sinceMs) {
            return fromRow(await get("SELECT * FROM incidents WHERE fingerprint = ? AND status = 'resolved' AND resolved_at >= ? ORDER BY resolved_at DESC LIMIT 1", [fingerprint, new Date(sinceMs)]));
        },
        async addEvent(id, type, detail, at) {
            const incidentId = idOf(id);
            if (!incidentId) throw new Error('addEvent needs an incident id');
            const result = await run('INSERT INTO incident_events (incident_id, at, type, detail) VALUES (?, ?, ?, ?)', [incidentId, toDate(at), type, toJson(detail)]);
            return result.lastID;
        },
        async events(id) {
            const incidentId = idOf(id);
            if (!incidentId) return [];
            return (await all('SELECT id, incident_id, at, type, detail FROM incident_events WHERE incident_id = ? ORDER BY at ASC, id ASC', [incidentId])).map(fromEvent);
        },
        async examples(detector, limit = 3, exceptId = null) {
            const rows = await all("SELECT * FROM incidents WHERE detector = ? AND verdict = 'correct' AND status = 'resolved' AND id <> ? AND fingerprint NOT LIKE ? ORDER BY resolved_at DESC, id DESC LIMIT ?",
                [String(detector || ''), idOf(exceptId) || 0, `${TEST_PREFIX}%`, Math.max(1, Math.min(10, Number(limit) || 3))]);
            return rows.map(fromRow);
        },
        async verdicts(detector, sinceMs) {
            const rows = await all('SELECT verdict, verdict_at FROM incidents WHERE detector = ? AND verdict IS NOT NULL AND verdict_at >= ? AND fingerprint NOT LIKE ? ORDER BY verdict_at DESC LIMIT 20',
                [String(detector || ''), new Date(sinceMs), `${TEST_PREFIX}%`]);
            return rows.map((row) => ({ verdict: row.verdict, verdict_at: iso(row.verdict_at) }));
        },
        // only by an exact prefix ("example:", the Example incidents removed on 17 Nov 2026), never a pattern a caller builds
        async deleteByFingerprintPrefix(prefix) {
            if (!prefix || /[%_\\]/.test(prefix)) return 0;
            await run('DELETE FROM incident_events WHERE incident_id IN (SELECT id FROM incidents WHERE fingerprint LIKE ?)', [`${prefix}%`]);
            const result = await run('DELETE FROM incidents WHERE fingerprint LIKE ?', [`${prefix}%`]);
            return result.changes;
        },
        async countByFingerprintPrefix(prefix) {
            if (!prefix || /[%_\\]/.test(prefix)) return 0;
            const row = await get('SELECT COUNT(*) AS n FROM incidents WHERE fingerprint LIKE ?', [`${prefix}%`]);
            return row ? Number(row.n) || 0 : 0;
        },
        async latestEvents(ids, type) {
            const list = (Array.isArray(ids) ? ids : []).map(idOf).filter(Boolean);
            if (!list.length) return {};
            const rows = await all('SELECT id, incident_id, at, type, detail FROM incident_events WHERE type = ? AND incident_id IN (?) ORDER BY at DESC, id DESC', [type, list]);
            const out = {};
            for (const row of rows.map(fromEvent)) if (!out[row.incident_id]) out[row.incident_id] = row;
            return out;
        },
        async prune(beforeMs) {
            const before = new Date(beforeMs);
            await run("DELETE FROM incident_events WHERE incident_id IN (SELECT id FROM incidents WHERE status = 'resolved' AND resolved_at < ?)", [before]);
            const result = await run("DELETE FROM incidents WHERE status = 'resolved' AND resolved_at < ?", [before]);
            return result.changes;
        }
    };
}

module.exports = { createEngine, memoryStore, sqlStore, SEVERITIES, VERDICTS, SEEN_EVERY_MS, SEEN_LATER_MS, TEST_RESOLVE_MS, LIST_LIMIT, LIST_MAX };
// <Jun Kai end>
