// Owner: Role 3, Jun Kai.
// Fixes the app can do itself on an incident, always with a System Admin's approval: on the incident (Approve), or once in
// the settings ("Automatic", or "Ask, then automatic" after fixDelayMinutes when nobody approved first). Only what is safe and
// already exists elsewhere in the app: starting the kiosk server the way Start kiosk on Server Schedule does.
// KIOSK_AUTOMATION governs what runs by itself, like the policies: off = nothing runs by itself, dry-run = only
// recorded. An approval by hand always runs, like the Start kiosk button on Server Schedule (that setting does not
// stop the button either). A test incident's fix is only recorded, never run. Every run goes on the incident's timeline
// ('fix' when it starts, 'fix-done' with the result) and into Audit Logs.
// <Jun Kai start>
const FIXES = {
    'start-kiosk': {
        label: 'Start the kiosk server',
        forIncident: 'Kiosk server down',
        describe: 'Runs the same start as Start kiosk on Operating Hours. The tablets come back in about 30 seconds.',
        modes: ['ask', 'delayed', 'auto'],
        appliesTo: (incident) => incident.detector === 'services' && incident.kind === 'down' && incident.subject === 'kiosk'
    }
};
const MODE_LABELS = { ask: 'Ask first', delayed: 'Ask, then automatic after 5 min', auto: 'Automatic' };
const DELAY_MS = 5 * 60 * 1000;   // "delayed" by default: runs by itself once the incident is this old and nobody approved
const RETRY_MS = 10 * 60 * 1000;  // an automatic run is not tried again on the same incident sooner than this
// test incidents (Send a test incident) start with this; detector 'test' is the single test incident of before 17 Nov 2026
const TEST_PREFIX = 'test:';

const isTest = (incident) => !!incident && (String(incident.fingerprint || '').startsWith(TEST_PREFIX) || incident.detector === 'test');
const fail = (status, message) => Object.assign(new Error(message), { status });

function fixFor(incident) {
    if (!incident) return null;
    for (const [fixKey, fix] of Object.entries(FIXES)) if (fix.appliesTo(incident)) return fixKey;
    return null;
}

function modeOf(settings, fixKey) {
    const fix = FIXES[fixKey];
    const mode = settings && settings.fixes ? settings.fixes[fixKey] : null;
    return fix && fix.modes.includes(mode) ? mode : 'ask';
}

function automationSetting(value = process.env.KIOSK_AUTOMATION) {
    const v = String(value || 'on').toLowerCase();
    return ['off', 'dry-run'].includes(v) ? v : 'on';
}

// the "Ask, then automatic" wait from the settings, in minutes
function delayMinutes(settings) {
    const n = Number(settings && settings.fixDelayMinutes);
    return Number.isFinite(n) && n >= 1 ? n : DELAY_MS / 60000;
}

const modeLabel = (mode, settings) => (mode === 'delayed' ? `Ask, then automatic after ${delayMinutes(settings)} min` : MODE_LABELS[mode]);

// Whether an automatic run is due now: "auto" at once, "delayed" once the incident has been open for delayMs since it
// opened or last opened again (sinceMs); never twice within RETRY_MS on one incident, never on a test incident, and only
// while the incident is open (Acknowledge = someone is on it, so nothing runs by itself)
function autoDue(incident, mode, nowMs, lastTriedMs, { delayMs = DELAY_MS, sinceMs = 0 } = {}) {
    if (!incident || isTest(incident) || incident.status !== 'open') return false;
    if (mode !== 'auto' && mode !== 'delayed') return false;
    if (lastTriedMs && nowMs - lastTriedMs < RETRY_MS) return false;
    if (mode === 'delayed') return nowMs - Math.max(Date.parse(incident.opened_at) || 0, sinceMs || 0) >= delayMs;
    return true;
}

// store: the incident store; settings(): the aiops settings; actions: { fixKey: async () => ({ success, message|error }) };
// lastAttempt() / noteAttempt(): the kiosk start record shared with the policies (serverControl/control.js); gapMs (a
// number or a function): no automatic start sooner than this after any start; automation(): 'on' | 'off' | 'dry-run';
// stillNeeded: { fixKey: async () => boolean }, asked before an automatic run (the kiosk may be up again before its
// incident closes); allowAuto(): false while automatic runs must wait (the policies keep the kiosk off); audit(action, by, id).
function createFixer({ store, settings, actions, lastAttempt = () => 0, noteAttempt = () => {}, gapMs = 5 * 60 * 1000, automation = automationSetting, stillNeeded = {}, allowAuto = () => true, audit = () => {}, now = () => new Date() }) {
    const running = new Map(); // incident id -> fix key while its start is being checked (up to 30 s)
    const tried = new Map();   // incident id -> ms of the last automatic run
    const iso = () => now().toISOString();
    const gap = () => (typeof gapMs === 'function' ? gapMs() : gapMs);
    const record = (action, by, id) => {
        try { audit(action, by, id); } catch (error) { console.warn(`[aiops] audit ${action} failed: ${error.message}`); }
    };

    // Starts the fix and answers at once; the result arrives on the timeline as 'fix-done'
    async function run(id, fixKey, by, { automatic = false } = {}) {
        const incident = await store.get(id);
        if (!incident) return null;
        if (incident.status === 'resolved') throw fail(400, 'This incident is resolved: there is nothing to fix');
        if (!FIXES[fixKey] || fixFor(incident) !== fixKey) throw fail(400, 'This fix does not apply to this incident');
        // a test incident follows the Offer fixes switch like a real one, but its fix only goes on its history
        const test = isTest(incident);
        if ((settings() || {}).offerFixes === false) throw fail(409, 'Fixes are switched off in the incident settings');
        if (running.has(incident.id)) throw fail(409, 'This fix is already running');
        // only a run by itself asks KIOSK_AUTOMATION; an admin's approval is a press of Start kiosk
        const mode = automatic ? automation() : 'on';
        if (!test && mode === 'off') throw fail(409, 'This PC does not start programmes by itself (KIOSK_AUTOMATION=off in backend/.env), so nothing runs without an approval');
        if (automatic) tried.set(incident.id, now().getTime());
        const dryRun = !test && mode === 'dry-run';
        await store.addEvent(incident.id, 'fix', { fix: fixKey, by, automatic, test, dryRun }, iso());
        record(automatic ? 'AIOPS_INCIDENT_FIX_AUTO' : 'AIOPS_INCIDENT_FIX', by, incident.id);
        if (test || dryRun) {
            const message = test ? 'Test incident: nothing was run' : 'Dry run: nothing was started (KIOSK_AUTOMATION=dry-run)';
            await store.addEvent(incident.id, 'fix-done', { fix: fixKey, ok: true, message, test, dryRun }, iso());
            return { started: true, done: true, test, dryRun };
        }
        running.set(incident.id, fixKey);
        noteAttempt(now().getTime());
        Promise.resolve()
            .then(() => actions[fixKey]())
            .then((result) => store.addEvent(incident.id, 'fix-done', { fix: fixKey, ok: !!(result && result.success), message: String((result && (result.message || result.error)) || '').slice(0, 300) }, iso()))
            .catch((error) => store.addEvent(incident.id, 'fix-done', { fix: fixKey, ok: false, message: String(error && error.message ? error.message : error).slice(0, 300) }, iso()))
            .catch((error) => console.warn(`[aiops] could not record the fix result of incident ${incident.id}: ${error.message}`))
            .finally(() => running.delete(incident.id));
        return { started: true, done: false };
    }

    // After every check: the fixes an admin made automatic in the settings. The policies' own start counts too, so the
    // two never start the kiosk within gapMs of each other.
    async function sweep() {
        const conf = settings() || {};
        if (conf.offerFixes === false || automation() === 'off' || !allowAuto()) return 0;
        const nowMs = now().getTime();
        let started = 0;
        const candidates = (await store.listOpen()).filter((incident) => fixFor(incident) && !running.has(incident.id));
        if (!candidates.length) return 0;
        // a reopened incident waits again: the wait counts from its newest reopening
        const waiting = candidates.some((incident) => modeOf(conf, fixFor(incident)) === 'delayed');
        const reopened = waiting && typeof store.latestEvents === 'function'
            ? await store.latestEvents(candidates.map((incident) => incident.id), 'reopened').catch(() => ({}))
            : {};
        const delayMs = delayMinutes(conf) * 60000;
        for (const incident of candidates) {
            const fixKey = fixFor(incident);
            const sinceMs = reopened[incident.id] ? Date.parse(reopened[incident.id].at) || 0 : 0;
            if (!autoDue(incident, modeOf(conf, fixKey), nowMs, tried.get(incident.id), { delayMs, sinceMs })) continue;
            if (nowMs - lastAttempt() < gap()) continue;
            // already better (the incident closes at the next checks): nothing to run, nothing to record
            if (stillNeeded[fixKey] && !(await Promise.resolve().then(stillNeeded[fixKey]).catch(() => false))) continue;
            try {
                await run(incident.id, fixKey, 'automatic (approved in Settings)', { automatic: true });
                started++;
            } catch (error) {
                console.warn(`[aiops] automatic fix on incident ${incident.id} did not start: ${error.message}`);
            }
        }
        return started;
    }

    return { run, sweep, isRunning: (id) => running.has(Number(id)) };
}

// Where the fix of one incident stands, from its newest 'fix' and 'fix-done' events ({ at, detail }):
// offer   nothing ran yet (or a start long enough ago that did not close the incident: `last` says when)
// running started, the answer is not in yet (up to 30 s; a start with no answer after 2 minutes counts as failed)
// started it worked; the incident closes by itself once the next health checks see the kiosk (confirmMs)
// failed  it did not work, with the reason
const NO_ANSWER_MS = 2 * 60 * 1000;
function fixStatus({ running = false, lastFix = null, lastDone = null, nowMs = Date.now(), confirmMs = 15 * 60 * 1000 } = {}) {
    const ms = (event) => (event ? Date.parse(event.at) || 0 : 0);
    const fixDetail = (lastFix && lastFix.detail) || {};
    const who = { by: fixDetail.by || null, automatic: !!fixDetail.automatic };
    const pending = lastFix && ms(lastFix) > ms(lastDone);
    if (running || (pending && nowMs - ms(lastFix) < NO_ANSWER_MS)) return { state: 'running', at: lastFix ? lastFix.at : null, ...who };
    if (pending) return { state: 'failed', at: lastFix.at, ...who, message: 'No answer was recorded: the server may have restarted during the start', test: false, dryRun: false };
    if (!lastDone) return { state: 'offer' };
    const done = lastDone.detail || {};
    const result = { at: lastDone.at, ...who, message: String(done.message || ''), test: !!done.test, dryRun: !!done.dryRun };
    if (!done.ok) return { state: 'failed', ...result };
    if (nowMs - ms(lastDone) < confirmMs) return { state: 'started', ...result };
    // a test or a dry run started nothing, so there is no start that "did not bring it back"
    return result.test || result.dryRun ? { state: 'offer' } : { state: 'offer', last: result };
}

// What the page needs to show a fix on one incident
function describeFix(incident, settings, fixer) {
    const fixKey = fixFor(incident);
    if (!fixKey) return null;
    const fix = FIXES[fixKey];
    return {
        key: fixKey, label: fix.label, describe: fix.describe, mode: modeOf(settings, fixKey), delayMinutes: delayMinutes(settings),
        offered: (settings || {}).offerFixes !== false,
        running: fixer ? fixer.isRunning(incident.id) : false,
        test: isTest(incident), automation: automationSetting()
    };
}

module.exports = { FIXES, MODE_LABELS, DELAY_MS, RETRY_MS, TEST_PREFIX, isTest, fixFor, modeOf, automationSetting, delayMinutes, modeLabel, autoDue, createFixer, fixStatus, describeFix };
// <Jun Kai end>
