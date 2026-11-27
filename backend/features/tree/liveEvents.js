// Owner: Role 2, Wei Jie.
// Event-driven refresh for the 2D and 3D tree screens (Task 2: "refresh upon detection of new visitor database
// entries, replacing the fixed-interval polling").
// Each open tree screen keeps one Server-Sent Events connection: GET /api/tree/events (features/tree/routes.js).
// While at least one screen is connected, this server checks the database every CHECK_MS with one small query
// (a fingerprint of the tree's data: the active feedback, the newest feedback and the VIP names), however many
// screens are open, and the settings file's time. When the fingerprint changes (a new feedback or pledge, one
// deleted or archived, a VIP added, removed or renamed) every screen is told "tree" and fetches its leaves at
// once; when the admin saves settings, "settings". A save made by this server (POST /api/feedback) checks at
// once (nudge) rather than waiting for the next check. Detection reads the database itself, so it works whichever
// server (server.js or kioskServer.js) saved the feedback.
// Messages: "event: ready" on connecting, "event: tree" and "event: settings" with { at, reason }, and a comment
// line every HEARTBEAT_MS so proxies and the browser keep the connection open. The browser reconnects by itself.

const fs = require('fs');

const CHECK_MS = 2000;        // how often the database is checked while screens are connected
const HEARTBEAT_MS = 25000;   // a comment line keeps idle connections open
const MAX_CLIENTS = 200;      // more open screens than this are refused (they fall back to their timed check)
const RETRY_MS = 3000;        // how soon a browser reconnects after the connection drops

const FINGERPRINT_SQL = `
    SELECT
        (SELECT COUNT(*) FROM feedback WHERE is_active = 1) AS active_feedback,
        (SELECT COALESCE(MAX(id), 0) FROM feedback) AS newest_feedback,
        (SELECT COUNT(*) FROM vip_management) AS vip_count,
        (SELECT COALESCE(SUM(CRC32(name_lower)), 0) FROM vip_management) AS vip_names
`;

// One Server-Sent Events message.
function formatEvent(type, data) {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// The database fingerprint as one comparable string (null without a row).
function fingerprintKey(row) {
    if (!row) return null;
    return ['active_feedback', 'newest_feedback', 'vip_count', 'vip_names'].map(key => String(row[key] ?? '')).join('|');
}

// readFingerprint(callback(error, row)) reads the database; settingsFile is watched by its modified time.
// The timers can be replaced in tests.
// onChange() runs when the tree's data has changed, before the screens are told (features/tree/routes.js
// counts the leaves again for the automatic growth stage).
function createTreeLiveEvents({ readFingerprint, settingsFile = null, onChange = () => {}, checkMs = CHECK_MS, heartbeatMs = HEARTBEAT_MS,
    maxClients = MAX_CLIENTS, now = () => Date.now(), timers = { setInterval, clearInterval } } = {}) {
    const clients = new Set();
    let checkTimer = null, heartbeatTimer = null;
    let lastKey = null, lastSettingsTime = null, checking = false, checkAgain = false;

    const settingsTime = () => {
        if (!settingsFile) return null;
        try { return fs.statSync(settingsFile).mtimeMs; } catch { return null; }
    };

    function broadcast(type, reason) {
        const message = formatEvent(type, { at: new Date(now()).toISOString(), reason });
        for (const res of clients) {
            try { res.write(message); } catch { clients.delete(res); }
        }
    }

    function check() {
        if (checking) { checkAgain = true; return; } // one check at a time; another straight after if asked
        checking = true;
        const modified = settingsTime();
        if (modified !== null && lastSettingsTime !== null && modified !== lastSettingsTime) broadcast('settings', 'settings-saved');
        if (modified !== null) lastSettingsTime = modified;
        readFingerprint((error, row) => {
            checking = false;
            if (!error) {
                const key = fingerprintKey(row);
                if (key !== null && lastKey !== null && key !== lastKey) {
                    try { onChange(); } catch { /* the screens are told anyway */ }
                    broadcast('tree', 'data-changed');
                }
                if (key !== null) lastKey = key;
            }
            if (checkAgain) { checkAgain = false; check(); }
        });
    }

    function start() {
        if (checkTimer) return;
        lastSettingsTime = settingsTime();
        check(); // the starting point
        checkTimer = timers.setInterval(check, checkMs);
        heartbeatTimer = timers.setInterval(() => {
            for (const res of clients) {
                try { res.write(': keep-alive\n\n'); } catch { clients.delete(res); }
            }
        }, heartbeatMs);
    }

    function stop() {
        if (checkTimer) timers.clearInterval(checkTimer);
        if (heartbeatTimer) timers.clearInterval(heartbeatTimer);
        checkTimer = heartbeatTimer = null;
        lastKey = null; // checked afresh when a screen connects again
    }

    // GET /api/tree/events
    function handler(req, res) {
        if (clients.size >= maxClients) {
            res.status(503).json({ success: false, error: 'Too many live tree connections' });
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.write(`retry: ${RETRY_MS}\n\n`);
        res.write(formatEvent('ready', { at: new Date(now()).toISOString() }));
        clients.add(res);
        start();
        const close = () => {
            clients.delete(res);
            if (!clients.size) stop();
        };
        req.on('close', close);
        res.on('error', close);
    }

    // Something changed here (this server saved a feedback): check now instead of at the next check.
    function nudge() {
        if (clients.size) check();
    }

    return { handler, nudge, check, stop, clientCount: () => clients.size };
}

module.exports = { createTreeLiveEvents, formatEvent, fingerprintKey, FINGERPRINT_SQL, CHECK_MS, HEARTBEAT_MS };
