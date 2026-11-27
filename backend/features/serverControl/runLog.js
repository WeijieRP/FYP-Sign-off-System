// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// When the kiosk programs stopped and started, and why (supervisor, 18 Nov 2026). Started by backend/server.js only.
//
//  - While the server runs it writes backend/data/run-state.json every 20 seconds ("still alive at ...").
//  - A program that is closed in a normal way leaves a stop note first (core/stopNote.js): Ctrl+C, the server window
//    was closed, Restart application, an error.
//  - At the next start the server works out why the last run ended: the stop note when there is one, otherwise what
//    Windows wrote in its System event log (powerEvents.js: power lost, shut down, restarted), otherwise "the program
//    was ended". The stop and the new start go into the History list of the Server Schedule page.
//  - A "still alive" that comes much too late means the PC was asleep or hibernating in between: also recorded.
//  - When the PC was off since the last run, the policies are checked once (recover): if the kiosk should run now, the
//    kiosk server is made sure of and the History is opened in the default browser, on a page that needs no sign-in
//    and shows nothing else (recoveryView.js).
//
// Recording is always on. Starting the kiosk and opening the browser follow KIOSK_AUTOMATION (off: nothing is
// started or opened; dry-run: only written down). Sleep and hibernation are only recorded here, never caused or
// scheduled: that is the system-level part of Role 4.
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const paths = require('../../core/paths');
const { writeJsonAtomic } = require('../../core/jsonFile');
const stopNote = require('../../core/stopNote');
const control = require('./control');
const policies = require('./policies');
const powerEvents = require('./powerEvents');
const recoveryView = require('./recoveryView');
const openState = require('./openState');

const STATE_FILE = paths.dataFile('run-state.json');
const BEAT_MS = 20 * 1000;
const GAP_MS = 90 * 1000;            // a "still alive" this late means the programs were paused (sleep, hibernation)
const MARGIN_MS = 2 * 60 * 1000;     // events are read from a little before the last "still alive"
const LATE_MS = 3 * 60 * 1000;       // a shutdown this long after the last "still alive" did not end the run
const NOTE_BEFORE_MS = 30 * 1000;    // a stop note belongs to a run when it was written at that run's end:
const NOTE_AFTER_MS = 60 * 1000;     // from just before its last "still alive" to a minute after it
const KIOSK_WAIT_MS = 90 * 1000;     // startAll.js starts the kiosk server too; give it this long before starting one
const KIOSK_WATCH_MS = 60 * 1000;

// stop notes that Windows also causes while it shuts down, so a shutdown at the same moment is the real cause
const SOFT_NOTES = ['window-closed', 'terminated', 'exit', 'child-exit'];

const ms = (value) => new Date(value).getTime();
const valid = (value) => value !== null && value !== undefined && !Number.isNaN(ms(value));
const clock = (value) => new Date(value).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function duration(millis) {
    const minutes = Math.max(1, Math.round(millis / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
    return `${Math.round(hours / 24)} days`;
}

// The record of the last run: { state } when it reads, { state: null } on a first start. A file that is there but
// cannot be read (a power cut can leave it half written) still tells when it was last written.
function readState(file = STATE_FILE) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        return { state: null };
    }
    try {
        const state = JSON.parse(text);
        if (state && valid(state.aliveAt)) return { state };
    } catch { /* fall through to the file time */ }
    try {
        return { state: { aliveAt: fs.statSync(file).mtime.toISOString(), startedAt: null, kioskUp: null, unreadable: true } };
    } catch {
        return { state: null };
    }
}

function stopDetail(cause, { note, summary }) {
    const asked = summary && summary.asked;
    const by = asked && asked.program ? ` It was asked for by ${asked.program}${asked.reason ? ` (${asked.reason})` : ''}.` : '';
    switch (cause) {
    case 'power-lost': return 'The PC lost power or was switched off without shutting down. Windows recorded an unexpected shutdown.';
    case 'windows-crash': return 'Windows stopped with an error (bug check) and the PC started again.';
    case 'pc-restart': return `The PC was restarted.${by}`;
    case 'pc-shutdown': return `The PC was shut down.${by}`;
    case 'pc-off': return summary
        ? 'The PC went off and started again. Windows has no record of how it went off.'
        : 'The PC was started again. How it went off is not known: the Windows event log could not be read.';
    case 'window-closed': return 'The server window was closed.';
    case 'ctrl-c': return 'Stopped with Ctrl+C in the server window.';
    case 'terminated': return 'The program was asked to end by another program.';
    case 'restart-request': return note && note.detail ? note.detail : 'Restart application was pressed on the admin page.';
    case 'child-exit': return note && note.detail ? note.detail : 'One of the two servers ended, so the other was stopped too.';
    case 'crash': return `The server stopped on an error${note && note.detail ? `: ${note.detail}` : '.'}`;
    case 'exit': return `The server ended by itself${note && note.detail ? ` (${note.detail})` : ''}. The server log says why.`;
    case 'ended': return 'The program was ended without a normal stop, for example with End task in Task Manager. The PC itself stayed on.';
    default: return 'The cause is not known: the program left no stop note, and the event log of the system could not be read.';
    }
}

// Why the last run ended. state: the record of that run (readState); note: the stop note; summary: powerEvents.summarize
// of the events since that run's last "still alive", or null when they could not be read; bootMs: when this PC started
// according to its uptime (the only sign of a restart without the event log). Returns null on a first start.
function classifyStop({ state, note = null, summary = null, bootMs = null }) {
    if (!state || !valid(state.aliveAt)) return null;
    const aliveMs = ms(state.aliveAt);
    const started = summary ? summary.started : null;
    const pcWasOff = started ? true : summary ? false : (bootMs !== null && bootMs > aliveMs + MARGIN_MS);
    // a note from another moment belongs to another stop: an older one, or a start in between that failed
    const fresh = note && valid(note.at) && ms(note.at) >= aliveMs - NOTE_BEFORE_MS && ms(note.at) <= aliveMs + NOTE_AFTER_MS ? note : null;
    const stopMs = fresh ? ms(fresh.at) : aliveMs;

    let pcCause = null;
    if (started) {
        if (summary.unexpected) pcCause = summary.bugCheck ? 'windows-crash' : 'power-lost';
        else if (summary.asked) pcCause = summary.asked.restart ? 'pc-restart' : 'pc-shutdown';
        else pcCause = summary.shutdownAt ? 'pc-shutdown' : 'pc-off';
    } else if (pcWasOff) {
        pcCause = 'pc-off';
    }
    const shutdownMs = started && valid(summary.shutdownAt) ? ms(summary.shutdownAt) : null;

    let cause;
    if (fresh) {
        // a program that left a note was stopping already; only a shutdown at that same moment outranks a soft note
        const together = pcCause && shutdownMs !== null && !summary.unexpected && SOFT_NOTES.includes(fresh.reason) && Math.abs(shutdownMs - stopMs) <= LATE_MS;
        cause = together ? pcCause : fresh.reason;
    } else if (pcCause && !(shutdownMs !== null && shutdownMs - stopMs > LATE_MS)) {
        cause = pcCause;
    } else {
        // no note, and the PC stayed on (or went off only long after). Without the events even that much is not known
        cause = summary || pcCause ? 'ended' : 'unknown';
    }
    return {
        cause,
        at: new Date(stopMs).toISOString(),
        detail: stopDetail(cause, { note: fresh, summary }),
        pcWasOff,
        kioskWasUp: typeof state.kioskUp === 'boolean' ? state.kioskUp : null
    };
}

// What started this run: { cause, detail }. stop: classifyStop's answer (null on a first start); startedBy: 'logon'
// when the logon shortcut of install.cmd started it.
function describeStart({ stop, summary = null, startedBy = '' }) {
    const atLogon = startedBy === 'logon';
    if (!stop) return { cause: 'first', detail: `First start on record${atLogon ? ', at Windows sign-in' : ''}.` };
    if (stop.pcWasOff) {
        const started = summary && summary.started;
        const pc = started ? `The PC started on ${clock(started.lastAt)}${started.kind === 'fast startup' ? ' (fast startup)' : ''}.` : 'The PC was started again.';
        return { cause: 'pc-start', detail: `${pc} ${atLogon ? 'The kiosk programs started at Windows sign-in.' : 'The kiosk programs were started.'}` };
    }
    if (stop.cause === 'restart-request') return { cause: 'restart', detail: 'Started again by Restart application.' };
    if (atLogon) return { cause: 'logon', detail: 'Started at Windows sign-in.' };
    return { cause: 'manual', detail: 'The kiosk programs were started by hand or by a script.' };
}

// What to do once the PC is back. automation: 'on' | 'off' | 'dry-run'; mode: 'auto' | 'manual'; schedule:
// policies.status now; kioskWasUp: whether the kiosk server answered before the stop (null = not known).
function recoveryPlan({ automation, mode, schedule, kioskWasUp }) {
    if (automation === 'off') return { act: false, reason: 'automation is switched off on this machine (KIOSK_AUTOMATION=off)' };
    if (mode === 'auto') {
        const name = schedule && schedule.policy ? schedule.policy.schedule_name : null;
        if (schedule && schedule.on && name) return { act: true, reason: `the policy "${name}" says the kiosk runs now` };
        const next = schedule && schedule.nextStart ? `, and the next start is ${clock(schedule.nextStart)}` : '';
        return { act: false, reason: `${name ? `the Stop policy "${name}" is in force` : 'no policy says the kiosk runs now'}${next}` };
    }
    if (kioskWasUp === false) return { act: false, reason: 'the policies are paused (manual mode) and the kiosk server was not running before the stop' };
    return { act: true, reason: 'the policies are paused (manual mode), so the kiosk comes back the way it was' };
}

function automationSetting(env = process.env) {
    const value = String(env.KIOSK_AUTOMATION || 'on').toLowerCase();
    return ['off', 'dry-run'].includes(value) ? value : 'on';
}

// Opens a web address in the default browser of the person signed in to Windows. True when the command was started.
function openUrl(url, { platform = process.platform, run = spawn } = {}) {
    try {
        const [command, args] = platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
            : platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
        const child = run(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', (error) => console.error(`⚠️ Could not open ${url}: ${error.message}`));
        child.unref();
        return true;
    } catch (error) {
        console.error(`⚠️ Could not open ${url}: ${error.message}`);
        return false;
    }
}

// Asks until the kiosk server answers or `waitMs` is over. done(true | false)
function waitForKiosk(deps, waitMs, done, startedMs = Date.now()) {
    deps.probe((status) => {
        if (status && status.running) return done(true);
        if (Date.now() - startedMs >= waitMs) return done(false);
        setTimeout(() => waitForKiosk(deps, waitMs, done, startedMs), deps.pollMs || 3000);
    });
}

// The check after the PC was off. Writes one History line that says what was decided and done. done() when finished.
// url: the page that is opened, as the History line names it; a function is asked only when the browser is about to
// be opened, because the PC's network address may not be there yet right after the power came back.
// openTarget(page): the address the browser really gets (the page with its link), never written down.
function recover({ url, openTarget = (page) => page, deps, kioskWasUp, env = process.env, done = () => {} }) {
    const pageNow = () => (typeof url === 'function' ? url() : url);
    const automation = automationSetting(env);
    const plan = recoveryPlan({
        automation,
        mode: deps.readMode(),
        schedule: policies.status(deps.readPolicies(), deps.now()),
        kioskWasUp
    });
    if (!plan.act) {
        // in off hours the kiosk page shows its closed screen by itself (openState.js): the line says so
        const closed = deps.kioskOpen && !deps.kioskOpen();
        deps.record('recovery', `The PC was off. Nothing was started or opened: ${plan.reason}.${closed ? ' The kiosk page shows the closed screen.' : ''}`, false, { cause: 'left' });
        return done(plan);
    }
    if (automation === 'dry-run') {
        deps.record('recovery', `The PC was off and ${plan.reason}. The kiosk server would be checked and the History opened (${pageNow()}).`, true, { cause: 'acted' });
        return done(plan);
    }
    deps.noteStartAttempt(); // the scheduler leaves the kiosk start of the next minutes to this check
    waitForKiosk(deps, deps.waitMs === undefined ? KIOSK_WAIT_MS : deps.waitMs, (up) => {
        const finish = (kioskText) => {
            const page = pageNow();
            const opened = deps.openUrl(openTarget(page));
            deps.record('recovery', `The PC was off and ${plan.reason}. ${kioskText} ${opened ? `The History was opened in the default browser (${page}).` : `The History could not be opened in the default browser (${page}).`}`, false, { cause: 'acted' });
            done(plan);
        };
        if (up) return finish('The kiosk server is running.');
        deps.startKiosk((result) => finish(result && result.success ? 'The kiosk server was started.' : `The kiosk server did not start: ${(result && result.error) || 'no answer'}.`));
    });
}

// ---------------------------------------------------------------- the running server
const run = { begun: false, startedAt: null, lastBeat: 0, kioskUp: null, beatFailed: false, timers: [], stateFile: STATE_FILE };

function writeState(nowMs) {
    try {
        writeJsonAtomic(run.stateFile, { pid: process.pid, startedAt: run.startedAt.toISOString(), aliveAt: new Date(nowMs).toISOString(), kioskUp: run.kioskUp });
        run.beatFailed = false;
    } catch (error) {
        if (!run.beatFailed) console.error(`⚠️ Could not write ${run.stateFile}: ${error.message}`);
        run.beatFailed = true;
    }
}

// The programs were paused from fromMs to toMs: Windows says whether that was sleep or hibernation
function recordPause(fromMs, toMs, deps) {
    deps.readEvents(new Date(fromMs - MARGIN_MS), (events) => {
        const summary = events ? powerEvents.summarize(events, fromMs - MARGIN_MS) : null;
        const kind = summary && summary.sleep ? summary.sleep.kind : null;
        if (events && !kind) {
            deps.record('pause', `The kiosk programs did not run for ${duration(toMs - fromMs)}. Windows recorded no sleep in that time: the PC was frozen, or its clock was changed.`, false, { at: new Date(fromMs).toISOString() });
            return;
        }
        deps.record('sleep', `The PC went into ${kind || 'sleep or hibernation'}. The kiosk programs were paused, not closed.`, false, { at: new Date(fromMs).toISOString() });
        deps.record('wake', `The PC woke up after ${duration(toMs - fromMs)} and the kiosk programs carried on.`, false, { at: new Date(toMs).toISOString() });
    });
}

function beat(deps) {
    const nowMs = deps.now().getTime();
    if (run.lastBeat && nowMs - run.lastBeat > GAP_MS) recordPause(run.lastBeat, nowMs, deps);
    run.lastBeat = nowMs;
    writeState(nowMs);
}

// The kiosk server as the main server sees it: only a change is written down
function watchKiosk(deps) {
    deps.probe((status) => {
        const up = !!(status && status.running);
        const port = control.kioskControlConfig.kioskPort;
        if (run.kioskUp === null && !up) deps.record('kiosk-down', `The kiosk server (port ${port}) has not answered since this start.`);
        else if (run.kioskUp === true && !up) deps.record('kiosk-down', `The kiosk server (port ${port}) stopped answering.`);
        else if (run.kioskUp === false && up) deps.record('kiosk-up', `The kiosk server (port ${port}) answers again.`);
        run.kioskUp = up;
    });
}

// Leaves a stop note when this program is closed in a way it can notice. A listener on SIGINT or SIGHUP takes away
// Node's own exit, so each one exits itself.
function noteExits(proc = process) {
    const stop = (reason) => () => { stopNote.write(reason); proc.exit(0); };
    proc.once('SIGINT', stop('ctrl-c'));
    proc.once('SIGHUP', stop('window-closed')); // Windows sends this when the console window is closed
    proc.once('SIGTERM', stop('terminated'));
    proc.on('uncaughtExceptionMonitor', (error) => stopNote.write('crash', error && error.message ? error.message : String(error)));
    proc.on('exit', (code) => stopNote.write('exit', `exit code ${code}`));
}

// The page that opens after the PC was off. host: the PC's network address, or a function that gives it when asked
// (server.js passes the address the QR code uses). Without one, or when asking fails, the page opens on localhost,
// which always works on the PC itself.
function recoveryPage({ port, https = true, host }) {
    let name = 'localhost';
    try { name = (typeof host === 'function' ? host() : host) || 'localhost'; } catch { name = 'localhost'; }
    return `${https ? 'https' : 'http'}://${name}:${port}/admin/recovery.html`;
}

// Called once by server.js when it is listening. deps is only passed by the tests.
// startedBy: 'logon' when the logon shortcut started the programs (startAll.js passes its --logon on)
function begin({ port, https = true, host, startedBy = process.argv.includes('--logon') ? 'logon' : '', deps: given = {}, env = process.env, done = () => {} } = {}) {
    if (run.begun) return;
    run.begun = true;
    const deps = {
        now: () => new Date(),
        readEvents: (since, callback) => powerEvents.read(since, callback),
        probe: control.resolveKioskStatus,
        startKiosk: control.startKiosk,
        noteStartAttempt: control.noteStartAttempt,
        record: control.recordEvent,
        readMode: () => control.readModeConfig().mode,
        readPolicies: () => control.readSchedulesConfig().schedules,
        openUrl,
        kioskOpen: () => openState.work({ env }).open,
        bootMs: () => Date.now() - os.uptime() * 1000, // when Windows started, by its uptime
        ...given
    };
    run.stateFile = given.stateFile || STATE_FILE;
    const noteFile = given.noteFile || stopNote.FILE;
    const { state } = readState(run.stateFile);
    const note = stopNote.read(noteFile);
    stopNote.clear(noteFile);
    run.startedAt = deps.now();
    beat(deps);
    if (!given.noTimers) {
        noteExits();
        run.timers.push(setInterval(() => beat(deps), BEAT_MS));
        run.timers.push(setTimeout(() => {
            watchKiosk(deps);
            run.timers.push(setInterval(() => watchKiosk(deps), KIOSK_WATCH_MS).unref());
        }, KIOSK_WAIT_MS));
        run.timers.forEach((timer) => timer.unref());
    }

    const finish = (events) => {
        const afterMs = state ? ms(state.aliveAt) - MARGIN_MS : 0;
        const summary = events ? powerEvents.summarize(events, afterMs) : null;
        const stop = classifyStop({ state, note, summary, bootMs: deps.bootMs() });
        if (stop) deps.record('stopped', stop.detail, false, { at: stop.at, cause: stop.cause });
        const start = describeStart({ stop, summary, startedBy });
        deps.record('started', start.detail, false, { at: run.startedAt.toISOString(), cause: start.cause });
        if (!stop || !stop.pcWasOff) return done({ stop, start, plan: null });
        recover({
            url: () => recoveryPage({ port, https, host }),
            openTarget: (page) => `${page}#${recoveryView.issue()}`,
            deps, kioskWasUp: stop.kioskWasUp, env, done: (plan) => done({ stop, start, plan })
        });
    };
    if (state) deps.readEvents(new Date(ms(state.aliveAt) - MARGIN_MS), finish);
    else finish(null);
}

// for the tests: forget the run, so begin can be called again
function reset() {
    run.timers.forEach((timer) => { clearTimeout(timer); clearInterval(timer); });
    Object.assign(run, { begun: false, startedAt: null, lastBeat: 0, kioskUp: null, beatFailed: false, timers: [], stateFile: STATE_FILE });
}

module.exports = {
    STATE_FILE, BEAT_MS, GAP_MS, begin, beat, watchKiosk, reset, noteStop: stopNote.write, readState, classifyStop, describeStart, recoveryPlan, recover, recoveryPage, openUrl,
    waitForKiosk, automationSetting, duration, stopDetail
};
// <Jun Kai end>
