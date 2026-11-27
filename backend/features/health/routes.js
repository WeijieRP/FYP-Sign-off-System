// Owner: Role 3, Jun Kai.
// Admin health API, mounted at /api/admin/health (session required).
const express = require('express');
const auth = require('../../core/auth');
const checks = require('./checks');
// <Jun Kai start>
const layout = require('./layout');
const tabletNames = require('./tabletNames');
const history = require('./history');
const db = require('../../core/db');
const healthSettings = require('./settings');
const { logAudit } = require('../../core/audit');
// <Jun Kai end>

const router = express.Router();

// <Jun Kai start>
const userKey = (req) => (req.session && req.session.user && req.session.user.id) || 'anonymous';

// GET /api/admin/health[?refresh=email][&all=1]  the checks this admin shows (all=1: every check, for scripts);
// refresh=email re-runs the (cached) SMTP login test
router.get('/', auth.requireAuth, async (req, res) => {
    try {
        const hidden = layout.hiddenFor(userKey(req));
        const health = await checks.runAll({ refreshEmail: req.query.refresh === 'email', skip: req.query.all === '1' ? [] : hidden });
        res.json({ success: true, health: { ...health, hidden } });
    } catch (error) {
        console.error('❌ Health checks failed:', error);
        res.status(500).json({ success: false, error: 'Health checks failed: ' + error.message });
    }
});

// GET /api/admin/health/history  the last 24 hours of the background checks, per check, in half-hour blocks
router.get('/history', auth.requireAuth, async (req, res) => {
    try {
        res.json({ success: true, history: await history.lastDay() });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, history: null, missing: 'Run npm run db:migrate to keep a 24-hour history of the checks.' });
        console.error('❌ Health history failed:', error);
        res.status(500).json({ success: false, error: 'Health history failed: ' + error.message });
    }
});

// GET /api/admin/health/layout  every monitoring option and the ones this admin removed
router.get('/layout', auth.requireAuth, (req, res) => {
    res.json({ success: true, options: layout.OPTIONS, hidden: layout.hiddenFor(userKey(req)) });
});

// PUT /api/admin/health/layout  { hidden: ['ollama', ...] }
router.put('/layout', auth.requireAuth, (req, res) => {
    try {
        const saved = layout.setHidden(userKey(req), (req.body || {}).hidden);
        if (!saved) return res.status(400).json({ success: false, error: `hidden must be a list of: ${layout.KEYS.join(', ')}` });
        res.json({ success: true, hidden: saved });
    } catch (error) {
        console.error('❌ Could not save the health layout:', error);
        res.status(500).json({ success: false, error: 'Could not save your choice' });
    }
});

// GET /api/admin/health/settings  the System Health settings every admin works with: when a tablet counts as offline
router.get('/settings', auth.requireAuth, (req, res) => {
    res.json({ success: true, settings: healthSettings.read(), limits: healthSettings.LIMITS, defaults: healthSettings.DEFAULTS });
});

// PUT /api/admin/health/settings  (System Admin) { tabletOfflineMinutes }; out of range is refused with the field
router.put('/settings', auth.requireAdmin, (req, res) => {
    const result = healthSettings.validate(req.body);
    if (result.error) return res.status(400).json({ success: false, error: result.error, field: result.field });
    try {
        healthSettings.write(result.settings);
        logAudit('HEALTH_SETTINGS_UPDATE', req.session.user.username, 'health', null, req);
        res.json({ success: true, settings: result.settings });
    } catch (error) {
        console.error('❌ Could not save the health settings:', error);
        res.status(500).json({ success: false, error: 'Could not save the settings' });
    }
});

// PUT /api/admin/health/tablets/:deviceId/name  { name }  an empty name shows the device name again
router.put('/tablets/:deviceId/name', auth.requireAuth, (req, res) => {
    const deviceId = String(req.params.deviceId || '');
    if (!tabletNames.isDeviceId(deviceId)) return res.status(400).json({ success: false, error: 'Not a device id' });
    db.get('SELECT device_id FROM device_heartbeats WHERE device_id = ?', [deviceId], (err, row) => {
        if (err) {
            console.error('❌ Could not look up the tablet:', err.message);
            return res.status(500).json({ success: false, error: 'Could not look up the tablet' });
        }
        if (!row) return res.status(404).json({ success: false, error: 'No tablet with that id has reported yet' });
        try {
            const result = tabletNames.setName(deviceId, (req.body || {}).name);
            if (result.error) return res.status(result.status || 400).json({ success: false, error: result.error });
            res.json({ success: true, deviceId, name: result.name });
        } catch (error) {
            console.error('❌ Could not save the tablet name:', error);
            res.status(500).json({ success: false, error: 'Could not save the name' });
        }
    });
});
// <Jun Kai end>

module.exports = router;
