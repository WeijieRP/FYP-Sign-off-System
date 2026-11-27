// Owner: Role 3, Jun Kai.
// Admin anomaly detection API, mounted at /api/admin/aiops (session required; the settings, run-now and the fixes need a
// system_admin): the engine status with the incident counts, the incidents with their timeline and step-by-step help,
// acknowledge / resolve / verdict, a fix approved on an incident, the busiest programmes, the settings with what each
// sensitivity level means, one check now and a test incident of a chosen kind.
// <Jun Kai start>
const express = require('express');
const auth = require('../../core/auth');
const { logAudit } = require('../../core/audit');
const settings = require('./settings');
const engine = require('./engine');
const { ACTIONS } = require('./advisor');
const learning = require('./learning');
const detectors = require('./detectors');
const playbooks = require('./playbooks');
const fixes = require('./fixes');
const processes = require('./processes');
const testIncidents = require('./testIncidents');

const router = express.Router();
const STATUSES = ['open', 'resolved', 'all'];
const NO_COUNTS = { open: 0, critical: 0, acknowledged: 0, resolvedToday: 0 };

const who = (req) => req.session.user.username;
const idOf = (value) => (/^\d{1,9}$/.test(String(value)) ? Number(value) : null);
const notFound = (res) => res.status(404).json({ success: false, error: 'No incident with that id' });

// a known status wins (the verdict check), a missing table is 503, anything else a plain 500 (the detail goes to the log)
function fail(res, error, what) {
    if (error && error.status) return res.status(error.status).json({ success: false, error: error.message, ...(error.field ? { field: error.field } : {}) });
    if (error && error.missingTable) return res.status(503).json({ success: false, error: engine.MISSING_TABLES });
    console.error(`[aiops] could not ${what}: ${error && error.message ? error.message : 'unknown error'}`);
    return res.status(500).json({ success: false, error: `Could not ${what}` });
}

// After a good start the incident closes once a health check sees the kiosk and it has stayed clear for clearAfterMinutes
const confirmMs = (conf) => (Number(conf.healthEverySeconds) || 300) * 1000 + (Number(conf.clearAfterMinutes) || 10) * 60 * 1000;

// The fix on offer for this incident and where it stands (fixes.fixStatus), or null: not on a resolved one and not while
// fixes are switched off. An approval runs whatever KIOSK_AUTOMATION says (a test incident's fix is only recorded).
// runs: its newest 'fix' and 'fix-done' events.
function fixOn(incident, conf, runs = {}) {
    if (!incident || incident.status === 'resolved') return null;
    const fix = fixes.describeFix(incident, conf, engine.fixer);
    if (!fix || !fix.offered) return null;
    const status = fixes.fixStatus({ running: fix.running, lastFix: runs.fix || null, lastDone: runs.done || null, nowMs: Date.now(), confirmMs: confirmMs(conf) });
    return { ...fix, status, confirmMinutes: Math.round(confirmMs(conf) / 60000) };
}

// How a fix that ran turned out, for the list ("Fixed by an approved start"), or null
function fixRun(fixEvent, doneEvent) {
    if (!doneEvent) return null;
    const done = doneEvent.detail || {};
    const fix = (fixEvent && fixEvent.detail) || {};
    return { at: doneEvent.at, ok: !!done.ok, by: fix.by || null, automatic: !!fix.automatic, test: !!done.test };
}

// The limit line on the chart of a CPU, memory, GPU or disk incident: below it that detector never alarms
function chartFloor(incident) {
    const e = incident && incident.evidence && typeof incident.evidence === 'object' ? incident.evidence : {};
    const table = incident.detector === 'spike' || incident.detector === 'timeOfDay' ? detectors.FLOORS : incident.detector === 'drift' ? detectors.DRIFT_FLOORS : null;
    return table && typeof table[e.metric] === 'number' ? table[e.metric] : null;
}

// GET /api/admin/aiops/status  engine state, detectors, data window and the incident counts (zero when the counts cannot
// be read: the status still shows lastError)
router.get('/status', auth.requireAuth, async (req, res) => {
    try {
        const status = engine.getStatus();
        const counts = await engine.counts().catch(() => NO_COUNTS);
        res.json({ success: true, status: { ...status, counts } });
    } catch (error) { fail(res, error, 'load the status'); }
});

// GET /api/admin/aiops/incidents?status=open|resolved|all&limit=50  open first, newest first
router.get('/incidents', auth.requireAuth, async (req, res) => {
    const status = req.query.status === undefined ? 'open' : String(req.query.status);
    if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: 'status must be open, resolved or all' });
    try {
        const incidents = await engine.store.list({ status, limit: req.query.limit });
        // the newest advice and fix of each incident ride along, so the page sees them arrive (the incident row itself
        // does not change)
        const ids = incidents.map((i) => i.id);
        const [advice, fixEvents, doneEvents] = await Promise.all(['advice', 'fix', 'fix-done'].map((type) => engine.store.latestEvents(ids, type)));
        const conf = settings.read();
        res.json({
            success: true,
            incidents: incidents.map((i) => {
                const fix = fixOn(i, conf, { fix: fixEvents[i.id], done: doneEvents[i.id] });
                return {
                    ...i,
                    test: fixes.isTest(i),
                    fix: fix ? { key: fix.key, label: fix.label, state: fix.status.state, at: fix.status.at || null, dryRun: !!fix.status.dryRun } : null,
                    fixRun: fixRun(fixEvents[i.id], doneEvents[i.id]),
                    advice: advice[i.id] ? { at: advice[i.id].at, ...advice[i.id].detail } : null,
                    adviceBusy: engine.advisor.isBusy(i.id)
                };
            })
        });
    } catch (error) { fail(res, error, 'list the incidents'); }
});

// GET /api/admin/aiops/incidents/:id  one incident with its timeline, the step-by-step help and the fix on offer
router.get('/incidents/:id', auth.requireAuth, async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) return notFound(res);
    try {
        const incident = await engine.store.get(id);
        if (!incident) return notFound(res);
        const events = await engine.store.events(id);
        const conf = settings.read();
        const last = (type) => events.filter((e) => e.type === type).pop() || null;
        const lastAdvice = last('advice');
        const fix = fixOn(incident, conf, { fix: last('fix'), done: last('fix-done') });
        const help = playbooks.helpFor(incident, lastAdvice ? lastAdvice.detail : null, { fixKey: fix ? fix.key : null, localAi: settings.localAiOn(conf) });
        // fixKind: a fix exists for this kind of incident even when it is not on offer (switched off, or resolved)
        res.json({ success: true, incident: { ...incident, test: fixes.isTest(incident) }, events, help, fix, fixKind: fixes.fixFor(incident), floor: chartFloor(incident) });
    } catch (error) { fail(res, error, 'load the incident'); }
});

// The three admin actions share one shape; the engine answers null for an unknown id
function action(what, run) {
    return async (req, res) => {
        const id = idOf(req.params.id);
        if (!id) return notFound(res);
        try {
            const incident = await run(id, req);
            if (!incident) return notFound(res);
            res.json({ success: true, incident });
        } catch (error) { fail(res, error, what); }
    };
}

// POST /api/admin/aiops/incidents/:id/acknowledge
router.post('/incidents/:id/acknowledge', auth.requireAuth, action('acknowledge the incident', (id, req) => engine.acknowledge(id, who(req))));
// POST /api/admin/aiops/incidents/:id/resolve  { note }
router.post('/incidents/:id/resolve', auth.requireAuth, action('resolve the incident', (id, req) => engine.resolve(id, who(req), (req.body || {}).note)));
// POST /api/admin/aiops/incidents/:id/verdict  { verdict: 'correct' | 'not-useful' | 'false-alarm' }
router.post('/incidents/:id/verdict', auth.requireAuth, action('save the verdict', (id, req) => engine.setVerdict(id, (req.body || {}).verdict, who(req))));

// POST /api/admin/aiops/incidents/:id/fix  (system_admin) { fix }  starts the fix and answers at once; the result shows
// on the timeline ('fix-done') within about 30 seconds
router.post('/incidents/:id/fix', auth.requireAdmin, async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) return notFound(res);
    try {
        const result = await engine.runFix(id, String((req.body || {}).fix || ''), who(req));
        if (!result) return notFound(res);
        res.json({ success: true, ...result });
    } catch (error) { fail(res, error, 'run the fix'); }
});

// POST /api/admin/aiops/incidents/:id/advice  ask the advisor again (at most every 30 s per incident); it answers in
// the background and the advice shows on the next list
router.post('/incidents/:id/advice', auth.requireAuth, async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) return notFound(res);
    try {
        const incident = await engine.store.get(id);
        if (!incident) return notFound(res);
        if (incident.status === 'resolved') return res.status(400).json({ success: false, error: 'This incident is resolved: there is nothing to advise on' });
        const result = engine.advisor.request(id, { force: true });
        if (!result.queued && result.reason === 'off') return res.status(409).json({ success: false, error: 'The advisor is switched off in the settings' });
        if (!result.queued && result.reason === 'soon') return res.status(429).json({ success: false, error: 'The advisor was asked a moment ago: wait half a minute' });
        res.json({ success: true, queued: true });
    } catch (error) { fail(res, error, 'ask the advisor'); }
});

// GET /api/admin/aiops/processes?by=cpu|memory  the busiest programmes on this PC right now (empty when they cannot be read)
router.get('/processes', auth.requireAuth, async (req, res) => {
    const by = req.query.by === 'memory' ? 'memory' : 'cpu';
    try {
        const programmes = await processes.top(by);
        res.json({ success: true, by, programmes: settings.localAiOn() ? programmes : processes.withoutAiKeep(programmes) });
    } catch (error) { fail(res, error, 'read the busiest programmes'); }
});

// GET /api/admin/aiops/advisor  the advisor's state, its step list and the models Ollama has (empty when it is not
// running, and Ollama is not asked at all while the Local AI models switch is off)
router.get('/advisor', auth.requireAuth, async (req, res) => {
    const status = engine.advisor.getStatus();
    let models = [];
    if (status.localAi) {
        try {
            const response = await fetch(`${status.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (response.ok) models = ((await response.json()).models || []).map((m) => m && m.name).filter((name) => typeof name === 'string');
        } catch { /* Ollama not running: the page offers the saved model only */ }
    }
    res.json({ success: true, advisor: status, actions: ACTIONS, models });
});

// GET /api/admin/aiops/settings  the settings, their defaults and limits, the detector list, what each sensitivity level means, the
// fixes with their modes and how this PC runs programmes (KIOSK_AUTOMATION)
router.get('/settings', auth.requireAuth, (req, res) => {
    const conf = settings.read();
    res.json({
        success: true, settings: conf, defaults: settings.DEFAULTS, limits: settings.LIMITS, detectors: settings.DETECTORS, learned: learning.read(),
        levels: detectors.levels(),
        testKinds: testIncidents.testKinds(),
        fixes: Object.entries(fixes.FIXES).map(([key, fix]) => ({ key, label: fix.label, forIncident: fix.forIncident, describe: fix.describe, modes: fix.modes.map((mode) => ({ key: mode, label: fixes.modeLabel(mode, conf) })) })),
        automation: fixes.automationSetting()
    });
});

// PUT /api/admin/aiops/settings  (system_admin) the whole settings object, or only the keys that change
router.put('/settings', auth.requireAdmin, (req, res) => {
    const result = settings.validate(req.body);
    if (result.error) return res.status(400).json({ success: false, error: result.error, field: result.field });
    try {
        // a level the admin saves wins over what the verdicts taught that detector
        const before = settings.read();
        const changed = settings.DETECTORS.map((x) => x.key).filter((key) => before.detectors[key].sensitivity !== result.settings.detectors[key].sensitivity);
        if (changed.length) learning.resetFor(changed);
        settings.write(result.settings);
        engine.applySettings(result.settings);
        logAudit('AIOPS_SETTINGS_UPDATE', who(req), 'aiops', null, req);
        // approving a fix ahead (or taking that back) gets its own Audit Logs line
        for (const [key, mode] of Object.entries(result.settings.fixes)) {
            if (before.fixes[key] !== mode) logAudit(`AIOPS_FIX_MODE_${mode.toUpperCase()}`, who(req), 'aiops', key, req);
        }
        if (before.offerFixes !== result.settings.offerFixes) logAudit(result.settings.offerFixes ? 'AIOPS_FIXES_ON' : 'AIOPS_FIXES_OFF', who(req), 'aiops', null, req);
        // the local AI models switched on or off for the whole app (the advisor, Feedback Reports, System Health)
        if (before.localAi !== result.settings.localAi) logAudit(result.settings.localAi ? 'AIOPS_LOCAL_AI_ON' : 'AIOPS_LOCAL_AI_OFF', who(req), 'aiops', null, req);
        res.json({ success: true, settings: result.settings });
    } catch (error) { fail(res, error, 'save the settings'); }
});

// POST /api/admin/aiops/run-now  (system_admin) one check now; result.skipped is 'disabled' while the master switch is off
router.post('/run-now', auth.requireAdmin, async (req, res) => {
    try {
        res.json({ success: true, result: await engine.runNow() });
    } catch (error) { fail(res, error, 'run the check'); }
});

// POST /api/admin/aiops/test-incident  { kind }  one incident with made up numbers, of that kind (GET /settings lists the kinds; no
// kind means CPU), so an admin sees how the page handles it; it closes by itself after 10 minutes
router.post('/test-incident', auth.requireAuth, async (req, res) => {
    try {
        res.json({ success: true, incident: await engine.openTest(who(req), (req.body || {}).kind) });
    } catch (error) { fail(res, error, 'open the test incident'); }
});

module.exports = router;
// <Jun Kai end>
