// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// "Is the kiosk open now?" for the kiosk page. Both servers put the answer into GET /api/status, and the page shows a
// closed screen while it is not (frontend/feedback/js/heartbeat.js). No program is stopped for this.
// Closed means all of these: the automation is on on this machine (KIOSK_AUTOMATION), the mode is Automatic, at least
// one policy is enabled, and the policies say the kiosk is off now. Manual mode, automation off or dry-run, or no
// enabled policy at all: open, so a PC that does not use the policies never shows a closed kiosk.
const control = require('./control');
const policies = require('./policies');

const CACHE_MS = 5000; // every kiosk page asks every 10 seconds: read the two files at most this often
let cached = null;     // { at, state }

function work({ now = new Date(), env = process.env, readMode = () => control.readModeConfig().mode,
    readPolicies = () => control.readSchedulesConfig().schedules } = {}) {
    const automation = String(env.KIOSK_AUTOMATION || 'on').toLowerCase();
    if (automation === 'off' || automation === 'dry-run') return { open: true };
    if (readMode() !== 'auto') return { open: true };
    const list = readPolicies() || [];
    if (!list.some(policies.isEnabled)) return { open: true };
    const status = policies.status(list, now);
    if (status.on) return { open: true };
    return {
        open: false,
        opensAt: status.nextStart ? status.nextStart.toISOString() : null,
        closedBy: status.policy ? status.policy.schedule_name : null
    };
}

// the answer for now, worked out again every few seconds. A file that cannot be read leaves the kiosk open
function current(nowMs = Date.now()) {
    if (cached && nowMs - cached.at < CACHE_MS) return cached.state;
    let state;
    try { state = work({ now: new Date(nowMs) }); } catch { state = { open: true }; }
    cached = { at: nowMs, state };
    return state;
}

// for the tests
function reset() {
    cached = null;
}

module.exports = { work, current, reset, CACHE_MS };
// <Jun Kai end>
