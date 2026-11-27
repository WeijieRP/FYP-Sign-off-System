// Owner: Role 3, Jun Kai.
// Public heartbeat endpoint, mounted at /api/health on both servers. The kiosk page posts once a minute;
// one row per device is kept (upsert), so this never grows with time.
const express = require('express');
const db = require('../../core/db');
const heartbeatLimit = require('./heartbeatLimit'); // <Jun Kai/> a limit on new devices

const router = express.Router();

// <Jun Kai start>
// POST /api/health/heartbeat  { deviceId, page, label }
router.post('/heartbeat', (req, res) => {
    const body = req.body || {};
    const deviceId = String(body.deviceId || '').trim();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) {
        return res.status(400).json({ success: false, error: 'deviceId must be 6 to 64 letters, digits, - or _' });
    }
    const page = String(body.page || '').slice(0, 40) || null;
    const label = String(body.label || '').slice(0, 80) || null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255) || null;
    const ip = String(req.ip || '').slice(0, 64) || null;

    const sql = `
        INSERT INTO device_heartbeats (device_id, label, page, user_agent, ip, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW()) AS fresh
        ON DUPLICATE KEY UPDATE
            label = COALESCE(fresh.label, device_heartbeats.label),
            page = fresh.page,
            user_agent = fresh.user_agent,
            ip = fresh.ip,
            last_seen = NOW()`;
    const failed = (err) => {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success: false, error: 'Heartbeat table missing: run npm run db:migrate' });
        console.error('❌ Heartbeat insert failed:', err.message);
        return res.status(500).json({ success: false, error: 'Database error' });
    };
    const save = (isNew) => db.run(sql, [deviceId, label, page, userAgent, ip], (err) => {
        if (err) return failed(err);
        if (isNew) heartbeatLimit.noteAdded(ip);
        res.json({ success: true });
    });
    // a known device only updates its row. A new one is limited (heartbeatLimit.js): this route has no sign-in, and
    // every made-up device id used to add a row
    const tooMany = (error) => res.status(429).json({ success: false, error });
    const count = (done) => db.get('SELECT COUNT(*) AS n FROM device_heartbeats', [], (err, row) => (err ? failed(err) : done(Number(row && row.n) || 0)));
    db.get('SELECT device_id FROM device_heartbeats WHERE device_id = ?', [deviceId], (err, known) => {
        if (err) return failed(err);
        if (known) return save(false);
        if (!heartbeatLimit.mayAdd(ip)) return tooMany('Too many new devices from this address. Try again later.');
        count((n) => {
            if (n < heartbeatLimit.MAX_DEVICES) return save(true);
            // full: devices not seen for 30 days make room first
            db.run(`DELETE FROM device_heartbeats WHERE last_seen < NOW() - INTERVAL ${heartbeatLimit.STALE_DAYS} DAY`, [], (pruneErr) => {
                if (pruneErr) return failed(pruneErr);
                count((left) => (left < heartbeatLimit.MAX_DEVICES ? save(true) : tooMany('The device list is full.')));
            });
        });
    });
});
// <Jun Kai end>

module.exports = router;
