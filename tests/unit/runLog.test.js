// Owner: Role 3, Jun Kai.
// Unit tests for the activity log of the kiosk's starts and stops and the check after the PC was off: the stop note,
// reading the Windows events, why a run ended, what started the next one, and what the recovery does.
// Everything that touches Windows (the event log, the kiosk server, the browser) is a stand-in. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stopNote = require('../../backend/core/stopNote');
const powerEvents = require('../../backend/features/serverControl/powerEvents');
const runLog = require('../../backend/features/serverControl/runLog');
const recoveryView = require('../../backend/features/serverControl/recoveryView');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-runlog-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const T0 = Date.parse('2026-11-17T15:00:00Z'); // the last "still alive" of the run that ended
const MIN = 60 * 1000;
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();
const event = (offsetMs, provider, id, values = []) => ({ at: iso(offsetMs), id, provider, values: values.map(String) });
const state = (over = {}) => ({ pid: 1, startedAt: iso(-8 * 60 * MIN), aliveAt: iso(0), kioskUp: true, ...over });
const summaryOf = (events) => powerEvents.summarize(events, T0 - 2 * MIN);

// what Windows wrote on this laptop on 11 Nov 2026 when Windows Update restarted it (values shortened)
const RESTART = [
    event(1 * MIN, 'User32', 1074, ['C:\\WINDOWS\\uus\\AMD64\\MoNotificationUx.exe (PC)', 'PC', 'Operating System: Service pack (Planned)', '0x80020010', 'restart', '', 'PC\\user']),
    event(3 * MIN + 39000, 'Microsoft-Windows-Kernel-General', 13, ['11/11/2026 23:16:41']),
    event(3 * MIN + 51000, 'Microsoft-Windows-Kernel-General', 12, ['10', '0', '26100']),
    event(3 * MIN + 51000, 'Microsoft-Windows-Kernel-Boot', 27, ['0', ' NOEXECUTE=OPTIN'])
];
// a power cut: nothing before the start, then Kernel-Power 41 and EventLog 6008 while Windows starts
const POWER_CUT = [
    event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-General', 12, ['10', '0', '26100']),
    event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0', '']),
    event(9 * 60 * MIN + 4000, 'Microsoft-Windows-Kernel-Power', 41, ['0', '0', '0']),
    event(9 * 60 * MIN + 20000, 'EventLog', 6008, ['11:00:05 PM', '17/11/2026'])
];
// the PC went into hibernation and came back: no start, the programs were only paused
const HIBERNATE = [
    event(1 * MIN, 'Microsoft-Windows-Kernel-Power', 42, ['5', '5', '13', '0', '165']),
    event(1 * MIN + 16000, 'Microsoft-Windows-Kernel-Power', 107, ['5', '5', '5']),
    event(4 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['2', ''])
];

test('the stop note: written in one go, the first note of a stop wins, a later stop replaces it', () => {
    const file = path.join(tmp, 'note', 'run-stop.json');
    assert.equal(stopNote.read(file), null, 'no note yet');
    assert.equal(stopNote.write('crash', 'x is not defined', { file, now: new Date(T0) }), true, 'the folder is made when it is missing');
    assert.deepEqual(stopNote.read(file), { at: iso(0), reason: 'crash', detail: 'x is not defined' });
    assert.equal(stopNote.write('child-exit', 'backend/server.js ended', { file, now: new Date(T0 + 2000) }), false, 'startAll.js sees the same stop 2 s later');
    assert.equal(stopNote.read(file).reason, 'crash');
    assert.equal(stopNote.write('ctrl-c', '', { file, now: new Date(T0 + 60 * MIN) }), true, 'an hour later it is another stop');
    assert.equal(stopNote.read(file).reason, 'ctrl-c');
    assert.equal(stopNote.write('exit', 'y'.repeat(900), { file, now: new Date(T0 + 3 * 60 * MIN) }), true);
    assert.equal(stopNote.read(file).detail.length, 300, 'a long message is cut');
    fs.writeFileSync(file, '{ half a no');
    assert.equal(stopNote.read(file), null, 'a broken note counts as no note');
    stopNote.clear(file);
    stopNote.clear(file);
    assert.equal(fs.existsSync(file), false);
    fs.writeFileSync(file, 'a file, not a folder');
    assert.equal(stopNote.write('ctrl-c', '', { file: path.join(file, 'under-a-file.json') }), false, 'a note that cannot be written never throws');
});

test('the Windows events: PowerShell prints nothing, one object or a list', () => {
    assert.deepEqual(powerEvents.parse(''), []);
    assert.deepEqual(powerEvents.parse('  \r\n'), []);
    const one = powerEvents.parse(JSON.stringify({ at: iso(0), id: 13, provider: 'Microsoft-Windows-Kernel-General', values: '11/11/2026' }));
    assert.deepEqual(one, [{ at: iso(0), id: 13, provider: 'Microsoft-Windows-Kernel-General', values: ['11/11/2026'] }]);
    const two = powerEvents.parse(JSON.stringify([event(5 * MIN, 'User32', 1074, ['a']), event(0, 'EventLog', 6008), { id: 1 }, null]));
    assert.deepEqual(two.map((e) => e.id), [6008, 1074], 'sorted by time, entries without a time dropped');
    assert.equal(powerEvents.parse('Get-WinEvent : access denied'), null, 'text that is not JSON means the events are not known');
    assert.equal(powerEvents.programName('C:\\WINDOWS\\system32\\shutdown.exe (PC-NAME)'), 'shutdown.exe');
    assert.equal(powerEvents.programName(''), '');
});

test('the Windows events are only read on Windows, and a failed read gives null', () => {
    let calls = 0;
    const run = (file, args, options, callback) => { calls++; callback(null, JSON.stringify(RESTART)); };
    powerEvents.read(new Date(T0), (events) => assert.equal(events, null), { run, platform: 'linux' });
    assert.equal(calls, 0);
    powerEvents.read(new Date(T0), (events) => assert.equal(events.length, 4), { run, platform: 'win32' });
    powerEvents.read(new Date(T0), (events) => assert.equal(events, null), { run: (f, a, o, callback) => callback(new Error('timed out')), platform: 'win32', tries: 1 });
    powerEvents.read(new Date(T0), (events) => assert.deepEqual(events, []), { run: (f, a, o, callback) => callback(null, ''), platform: 'win32' });
    const seen = [];
    powerEvents.read(new Date(T0), () => {}, { run: (file, args, o, callback) => { seen.push(file, args.join(' ')); callback(null, ''); }, platform: 'win32' });
    assert.equal(seen[0], 'powershell.exe');
    assert.match(seen[1], /Get-WinEvent/);
    assert.match(seen[1], /2026-11-17T15:00:00\.000Z/, 'the start of the window is passed as an exact time');
    assert.equal(/Message/.test(seen[1]), false, 'the message text is never read: it changes with the display language');
});

test('the Windows events get a second try: PowerShell is slow right after sign-in', async () => {
    const read = (answers) => new Promise((resolve) => {
        let calls = 0;
        const run = (file, args, options, callback) => { const answer = answers[Math.min(calls, answers.length - 1)]; calls++; callback(answer instanceof Error ? answer : null, answer instanceof Error ? '' : answer); };
        powerEvents.read(new Date(T0), (events) => resolve({ events, calls }), { run, platform: 'win32', retryAfterMs: 1 });
    });
    const second = await read([new Error('timed out'), JSON.stringify(RESTART)]);
    assert.deepEqual([second.calls, second.events.length], [2, 4], 'the second try gives the events');
    const never = await read([new Error('timed out')]);
    assert.deepEqual([never.calls, never.events], [2, null], 'two tries, then "cannot be read"');
    const garbage = await read(['not json', '']);
    assert.deepEqual([garbage.calls, garbage.events], [2, []], 'an answer that cannot be parsed is tried again too');
    const first = await read([JSON.stringify(RESTART)]);
    assert.equal(first.calls, 1, 'a good answer is not asked for twice');
});

test('summarize: a restart by Windows Update, a power cut, a fast startup and a hibernation', () => {
    const restart = summaryOf(RESTART);
    assert.equal(restart.unexpected, false);
    assert.deepEqual(restart.asked, { at: iso(1 * MIN), program: 'MoNotificationUx.exe', reason: 'Operating System: Service pack (Planned)', restart: true });
    assert.equal(restart.shutdownAt, iso(1 * MIN), 'the shutdown began when it was asked for, 2 minutes before Windows went down');
    assert.equal(restart.started.kind, 'cold start');
    assert.equal(restart.started.count, 1, 'Kernel-General 12 and Kernel-Boot 27 of one start count once');

    const cut = summaryOf(POWER_CUT);
    assert.deepEqual([cut.unexpected, cut.bugCheck, cut.asked, cut.shutdownAt], [true, false, null, null]);
    const bugCheck = summaryOf([...POWER_CUT.slice(0, 2), event(9 * 60 * MIN + 4000, 'Microsoft-Windows-Kernel-Power', 41, ['159', '0', '0'])]);
    assert.deepEqual([bugCheck.unexpected, bugCheck.bugCheck], [true, true], 'a bug check code means Windows itself stopped');

    const fast = summaryOf([event(2 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(10 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['1', ''])]);
    assert.equal(fast.started.kind, 'fast startup', 'a fast startup is a start too, without Kernel-General 12');
    assert.equal(fast.unexpected, false);

    const sleep = summaryOf(HIBERNATE);
    assert.equal(sleep.started, null, 'coming back from hibernation (Kernel-Boot 27 with 2) is not a start');
    assert.deepEqual(sleep.sleep, { at: iso(1 * MIN), kind: 'hibernation' });
    assert.equal(summaryOf([event(1 * MIN, 'Microsoft-Windows-Kernel-Power', 42, ['4'])]).sleep.kind, 'sleep');
    assert.deepEqual(summaryOf([]), { started: null, sleep: null });
    assert.deepEqual(powerEvents.summarize(RESTART, T0 + 60 * MIN), { started: null, sleep: null }, 'events from before the window are left out');

    // two restarts in a row (Windows Update does that): the first one ended the run, the last one is the start now
    const twice = summaryOf([...RESTART, event(5 * MIN, 'User32', 1074, ['TrustedInstaller.exe', 'PC', 'Operating System: Upgrade (Planned)', '0', 'restart']),
        event(6 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(7 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0'])]);
    assert.equal(twice.asked.program, 'MoNotificationUx.exe');
    assert.deepEqual([twice.started.firstAt, twice.started.lastAt, twice.started.count], [iso(3 * MIN + 51000), iso(7 * MIN), 2]);
});

test('why a run ended: the stop note, the Windows events, or "the program was ended"', () => {
    const cause = (input) => runLog.classifyStop(input);
    assert.equal(cause({ state: null }), null, 'a first start has no earlier run');
    assert.equal(cause({ state: { aliveAt: 'not a date' } }), null);

    const cut = cause({ state: state(), summary: summaryOf(POWER_CUT) });
    assert.deepEqual([cut.cause, cut.at, cut.pcWasOff, cut.kioskWasUp], ['power-lost', iso(0), true, true]);
    assert.match(cut.detail, /lost power or was switched off without shutting down/);
    assert.equal(cause({ state: state(), summary: summaryOf([...POWER_CUT.slice(0, 2), event(9 * 60 * MIN + 4000, 'Microsoft-Windows-Kernel-Power', 41, ['159'])]) }).cause, 'windows-crash');

    const restart = cause({ state: state(), summary: summaryOf(RESTART) });
    assert.equal(restart.cause, 'pc-restart');
    assert.match(restart.detail, /The PC was restarted\. It was asked for by MoNotificationUx\.exe \(Operating System: Service pack \(Planned\)\)\./);
    const off = summaryOf([event(1 * MIN, 'User32', 1074, ['C:\\Windows\\Explorer.EXE (PC)', 'PC', 'Other (Unplanned)', '0x0', 'power off']), event(2 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['1'])]);
    assert.equal(cause({ state: state(), summary: off }).cause, 'pc-shutdown');
    assert.equal(cause({ state: state(), summary: summaryOf([event(2 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0'])]) }).cause, 'pc-shutdown');
    assert.equal(cause({ state: state(), summary: summaryOf([event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0'])]) }).cause, 'pc-off', 'a start with no shutdown and no unexpected-shutdown record');

    // the PC stayed on (or only slept): without a note the program was ended some other way
    const ended = cause({ state: state(), summary: summaryOf(HIBERNATE) });
    assert.deepEqual([ended.cause, ended.pcWasOff], ['ended', false]);
    assert.deepEqual([cause({ state: state(), summary: summaryOf([]) }).cause, cause({ state: state(), summary: summaryOf([]) }).pcWasOff], ['ended', false]);

    // a stop note: a program that left one was stopping already
    const note = (reason, offsetMs = 5000, detail = '') => ({ at: iso(offsetMs), reason, detail });
    const ctrlC = cause({ state: state(), note: note('ctrl-c'), summary: summaryOf([]) });
    assert.deepEqual([ctrlC.cause, ctrlC.at, ctrlC.pcWasOff], ['ctrl-c', iso(5000), false]);
    assert.match(cause({ state: state(), note: note('crash', 5000, 'x is not defined'), summary: summaryOf([]) }).detail, /stopped on an error: x is not defined/);
    assert.match(cause({ state: state(), note: note('restart-request', 5000, 'Restart application was pressed on the admin page by systemadmin.'), summary: summaryOf([]) }).detail, /by systemadmin/);
    assert.equal(cause({ state: state(), note: note('child-exit', 5000, 'backend/kioskServer.js ended (code 1), so startAll.js stopped the other server too.'), summary: summaryOf([]) }).cause, 'child-exit');
    assert.equal(cause({ state: state(), note: note('ctrl-c', -9 * 60 * MIN), summary: summaryOf([]) }).cause, 'ended', 'a note from before that run began is an old one');
    assert.equal(cause({ state: state(), note: note('ctrl-c', -2 * MIN), summary: summaryOf([]) }).cause, 'ended', 'so is one from earlier in that run');
    // the power went, and a start in between failed and left its own note: that note is not about the power cut
    const between = cause({ state: state(), note: note('child-exit', 9 * 60 * MIN + 30000, 'backend/server.js ended (code 1)'), summary: summaryOf(POWER_CUT) });
    assert.equal(between.cause, 'power-lost');
    assert.equal(cause({ state: state(), note: note('exit', 50000, 'exit code 1'), summary: summaryOf([]) }).cause, 'exit', 'a note up to a minute after the last "still alive" is that run\'s own');
    // Ctrl+C in the afternoon, the PC shut down or lost power only later: the Ctrl+C ended the run, and the PC was off
    const later = cause({ state: state(), note: note('ctrl-c'), summary: summaryOf(POWER_CUT) });
    assert.deepEqual([later.cause, later.pcWasOff], ['ctrl-c', true]);
    // Windows closes the server window while it shuts down: the shutdown is the cause
    const closing = cause({ state: state(), note: note('window-closed', 2 * MIN + 30000), summary: off });
    assert.equal(closing.cause, 'pc-shutdown');
    assert.equal(cause({ state: state(), note: note('window-closed', 5000), summary: summaryOf([event(60 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0'])]) }).cause, 'window-closed', 'closed an hour before the shutdown');
    // no note, and the shutdown came long after the last "still alive": the program had ended before
    const before = cause({ state: state(), summary: summaryOf([event(60 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(9 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['0'])]) });
    assert.deepEqual([before.cause, before.pcWasOff], ['ended', true]);

    // without the event log (another system, or the read failed) the uptime is the only sign that the PC restarted
    assert.deepEqual([cause({ state: state(), summary: null, bootMs: T0 + 30 * MIN }).cause, cause({ state: state(), summary: null, bootMs: T0 + 30 * MIN }).pcWasOff], ['pc-off', true]);
    assert.match(cause({ state: state(), summary: null, bootMs: T0 + 30 * MIN }).detail, /the Windows event log could not be read/);
    // no note, no events and no sign of a restart: said as "not known", never as "the PC stayed on"
    const unknown = cause({ state: state(), summary: null, bootMs: T0 - 5 * 24 * 60 * MIN });
    assert.deepEqual([unknown.cause, unknown.pcWasOff], ['unknown', false]);
    assert.match(unknown.detail, /^The cause is not known/);
    assert.equal(cause({ state: state(), summary: null, bootMs: null }).cause, 'unknown');
    assert.equal(cause({ state: state(), note: note('ctrl-c'), summary: null, bootMs: null }).cause, 'ctrl-c', 'a stop note needs no events');
    assert.equal(cause({ state: state({ kioskUp: undefined }), summary: summaryOf([]) }).kioskWasUp, null);
    assert.equal(cause({ state: state({ kioskUp: false }), summary: summaryOf([]) }).kioskWasUp, false);
});

test('the record of the last run: missing on a first start, and a half-written file still gives its time', () => {
    const file = path.join(tmp, 'run-state.json');
    assert.deepEqual(runLog.readState(file), { state: null });
    fs.writeFileSync(file, JSON.stringify(state()));
    assert.equal(runLog.readState(file).state.aliveAt, iso(0));
    fs.writeFileSync(file, '{"pid": 1, "startedAt": "2026-11-17T07:0');
    const half = runLog.readState(file).state;
    assert.equal(half.unreadable, true);
    assert.ok(Math.abs(new Date(half.aliveAt).getTime() - Date.now()) < 60000, 'the time the file was last written stands in for the last "still alive"');
    assert.equal(runLog.classifyStop({ state: half, summary: powerEvents.summarize(POWER_CUT.map((e) => ({ ...e, at: new Date(Date.now() + 60000).toISOString() })), Date.now() - 2 * MIN) }).cause, 'power-lost',
        'a power cut that broke the file is still found through the Windows events');
    fs.writeFileSync(file, '');
    assert.equal(runLog.readState(file).state.unreadable, true);
});

test('what started a run', () => {
    const start = (input) => runLog.describeStart(input);
    assert.deepEqual(start({ stop: null }), { cause: 'first', detail: 'First start on record.' });
    assert.match(start({ stop: null, startedBy: 'logon' }).detail, /at Windows sign-in/);
    const afterCut = start({ stop: runLog.classifyStop({ state: state(), summary: summaryOf(POWER_CUT) }), summary: summaryOf(POWER_CUT), startedBy: 'logon' });
    assert.equal(afterCut.cause, 'pc-start');
    assert.match(afterCut.detail, /^The PC started on .+\. The kiosk programs started at Windows sign-in\.$/);
    const fast = [event(2 * MIN, 'Microsoft-Windows-Kernel-General', 13), event(10 * 60 * MIN, 'Microsoft-Windows-Kernel-Boot', 27, ['1', ''])];
    assert.match(start({ stop: runLog.classifyStop({ state: state(), summary: summaryOf(fast) }), summary: summaryOf(fast) }).detail, /\(fast startup\)\. The kiosk programs were started\.$/);
    assert.equal(start({ stop: { pcWasOff: true, cause: 'pc-off' }, summary: null }).detail, 'The PC was started again. The kiosk programs were started.');
    assert.deepEqual(start({ stop: { pcWasOff: false, cause: 'restart-request' } }), { cause: 'restart', detail: 'Started again by Restart application.' });
    assert.equal(start({ stop: { pcWasOff: false, cause: 'ended' }, startedBy: 'logon' }).cause, 'logon');
    assert.equal(start({ stop: { pcWasOff: false, cause: 'ctrl-c' } }).cause, 'manual');
});

const POLICY = { id: 1, is_active: true, action: 'active', schedule_type: 'daily', start_time: '00:00', end_time: '00:00', schedule_name: 'Always on' };
const STOP_POLICY = { ...POLICY, id: 2, action: 'stop', schedule_name: 'Closed' };

test('the plan once the PC is back: the policies decide in automatic mode, the old state in manual mode', () => {
    const plan = (input) => runLog.recoveryPlan({ automation: 'on', mode: 'auto', kioskWasUp: true, ...input });
    const on = { on: true, policy: POLICY, nextStart: null };
    const stopped = { on: false, policy: STOP_POLICY, nextStart: new Date(T0 + 9 * 60 * MIN) };
    assert.deepEqual(plan({ schedule: on }), { act: true, reason: 'the policy "Always on" says the kiosk runs now' });
    const closed = plan({ schedule: stopped });
    assert.equal(closed.act, false);
    assert.match(closed.reason, /^the Stop policy "Closed" is in force, and the next start is /);
    assert.deepEqual(plan({ schedule: { on: false, policy: null, nextStart: null } }), { act: false, reason: 'no policy says the kiosk runs now' });
    assert.equal(plan({ schedule: on, automation: 'off' }).act, false, 'KIOSK_AUTOMATION=off: nothing is started or opened');
    assert.equal(plan({ schedule: on, automation: 'dry-run' }).act, true);
    assert.equal(plan({ schedule: stopped, mode: 'manual' }).act, true, 'manual mode: the policies are paused, so they do not hold the kiosk back');
    assert.equal(plan({ schedule: on, mode: 'manual', kioskWasUp: false }).act, false);
    assert.equal(plan({ schedule: on, mode: 'manual', kioskWasUp: null }).act, true, 'not known counts as running');
    assert.equal(runLog.automationSetting({}), 'on');
    assert.equal(runLog.automationSetting({ KIOSK_AUTOMATION: 'OFF' }), 'off');
    assert.equal(runLog.automationSetting({ KIOSK_AUTOMATION: 'dry-run' }), 'dry-run');
    assert.equal(runLog.automationSetting({ KIOSK_AUTOMATION: 'whatever' }), 'on');
});

// stand-ins for everything recover touches
function standIns(over = {}) {
    const calls = { record: [], opened: [], kioskStarts: 0, probes: 0, startAttempts: 0 };
    const answers = over.probe || [true];
    return {
        calls,
        deps: {
            now: () => new Date(T0 + 10 * 60 * MIN),
            pollMs: 1,
            waitMs: over.waitMs === undefined ? 50 : over.waitMs,
            readMode: () => over.mode || 'auto',
            readPolicies: () => over.policies || [POLICY],
            probe: (callback) => { const running = answers[Math.min(calls.probes, answers.length - 1)]; calls.probes++; callback({ running }); },
            startKiosk: (callback) => { calls.kioskStarts++; callback(over.startResult || { success: true, message: 'Server started successfully' }); },
            noteStartAttempt: () => { calls.startAttempts++; },
            openUrl: (url) => { calls.opened.push(url); return over.openFails ? false : true; },
            bootMs: () => (over.bootMs === undefined ? T0 - 24 * 60 * MIN : over.bootMs), // Windows was running since the day before
            record: (type, detail, dryRun = false, extra = {}) => calls.record.push({ type, detail, dryRun, ...extra }),
            ...over.deps
        }
    };
}
const URL = 'https://localhost:3000/admin/recovery.html';
const recover = (s, over = {}) => new Promise((resolve) => runLog.recover({ url: URL, deps: s.deps, kioskWasUp: true, env: {}, done: resolve, ...over }));

test('after the PC was off: the kiosk server is waited for, then the History is opened', async () => {
    const s = standIns({ probe: [false, false, true] });
    await recover(s);
    assert.deepEqual([s.calls.probes, s.calls.kioskStarts, s.calls.startAttempts], [3, 0, 1], 'startAll.js started the kiosk server, so no second one is started');
    assert.deepEqual(s.calls.opened, [URL]);
    assert.equal(s.calls.record.length, 1);
    assert.deepEqual([s.calls.record[0].type, s.calls.record[0].cause, s.calls.record[0].dryRun], ['recovery', 'acted', false]);
    assert.equal(s.calls.record[0].detail, `The PC was off and the policy "Always on" says the kiosk runs now. The kiosk server is running. The History was opened in the default browser (${URL}).`);
});

test('after the PC was off: the browser gets the page with its link, and the History line never holds the link', async () => {
    const s = standIns();
    let made = 0;
    await recover(s, { openTarget: () => { made++; return `${URL}#${'ab'.repeat(24)}`; } });
    assert.deepEqual(s.calls.opened, [`${URL}#${'ab'.repeat(24)}`]);
    assert.equal(made, 1);
    assert.ok(!JSON.stringify(s.calls.record).includes('abab'), 'the link is not written into the History');
    assert.match(s.calls.record[0].detail, /The History was opened in the default browser \(https:\/\/localhost:3000\/admin\/recovery\.html\)\.$/);

    const none = standIns({ policies: [STOP_POLICY] });
    await recover(none, { openTarget: () => { made++; return URL; } });
    assert.equal(made, 1, 'no link is made when nothing is opened');
    const dry = standIns();
    await recover(dry, { env: { KIOSK_AUTOMATION: 'dry-run' }, openTarget: () => { made++; return URL; } });
    assert.equal(made, 1, 'a dry run makes no link either');
});

test('after the PC was off: the page opens at the address the PC has when the browser is opened', async () => {
    assert.equal(runLog.recoveryPage({ port: 3000, https: true, host: '192.168.1.50' }), 'https://192.168.1.50:3000/admin/recovery.html');
    assert.equal(runLog.recoveryPage({ port: 3100, https: false, host: () => '10.0.0.8' }), 'http://10.0.0.8:3100/admin/recovery.html');
    assert.equal(runLog.recoveryPage({ port: 3000 }), URL, 'no address given: localhost, which always works on the PC itself');
    assert.equal(runLog.recoveryPage({ port: 3000, host: () => '' }), URL);
    assert.equal(runLog.recoveryPage({ port: 3000, host: () => { throw new Error('no network yet'); } }), URL);

    // the address is asked for when the browser is opened, not before the wait for the kiosk server
    const s = standIns({ probe: [false, false, true] });
    let asked = 0;
    let probesWhenAsked = null;
    const page = 'https://192.168.1.50:3000/admin/recovery.html';
    await recover(s, { url: () => { asked++; probesWhenAsked = s.calls.probes; return page; }, openTarget: (address) => `${address}#${'cd'.repeat(24)}` });
    assert.deepEqual([asked, probesWhenAsked], [1, 3], 'asked once, after the kiosk server answered');
    assert.deepEqual(s.calls.opened, [`${page}#${'cd'.repeat(24)}`]);
    assert.match(s.calls.record[0].detail, /The History was opened in the default browser \(https:\/\/192\.168\.1\.50:3000\/admin\/recovery\.html\)\.$/);

    const off = standIns({ policies: [STOP_POLICY] });
    await recover(off, { url: () => { asked++; return page; } });
    assert.equal(asked, 1, 'nothing is opened in off hours, so no address is asked for');
});

test('after the PC was off in off hours: the line says the kiosk page shows the closed screen', async () => {
    const closed = standIns({ policies: [STOP_POLICY], deps: { kioskOpen: () => false } });
    await recover(closed);
    assert.match(closed.calls.record[0].detail, /^The PC was off\. Nothing was started or opened: .*\. The kiosk page shows the closed screen\.$/);
    assert.deepEqual([closed.calls.opened.length, closed.calls.kioskStarts], [0, 0]);
    const open = standIns({ policies: [STOP_POLICY], deps: { kioskOpen: () => true } });
    await recover(open);
    assert.ok(!open.calls.record[0].detail.includes('closed screen'), 'not when the kiosk counts as open (automation off, manual mode)');
});

test('after the PC was off: a kiosk server that never answers is started, and a failed start is said', async () => {
    const s = standIns({ probe: [false], waitMs: 5 });
    await recover(s);
    assert.equal(s.calls.kioskStarts, 1);
    assert.match(s.calls.record[0].detail, /The kiosk server was started\. The History was opened/);
    const failing = standIns({ probe: [false], waitMs: 5, startResult: { success: false, error: 'Kiosk server did not become reachable within 30 seconds of the start command' }, openFails: true });
    await recover(failing);
    assert.match(failing.calls.record[0].detail, /The kiosk server did not start: Kiosk server did not become reachable within 30 seconds of the start command\. The History could not be opened in the default browser/);
});

test('after the PC was off: off hours, automation off and a dry run start and open nothing', async () => {
    const offHours = standIns({ policies: [STOP_POLICY] });
    await recover(offHours);
    assert.deepEqual([offHours.calls.probes, offHours.calls.kioskStarts, offHours.calls.opened.length, offHours.calls.startAttempts], [0, 0, 0, 0]);
    assert.equal(offHours.calls.record[0].cause, 'left');
    assert.match(offHours.calls.record[0].detail, /^The PC was off\. Nothing was started or opened: the Stop policy "Closed" is in force/);

    const none = standIns({ policies: [] });
    await recover(none);
    assert.match(none.calls.record[0].detail, /no policy says the kiosk runs now\.$/);

    const off = standIns();
    await recover(off, { env: { KIOSK_AUTOMATION: 'off' } });
    assert.deepEqual([off.calls.probes, off.calls.opened.length], [0, 0]);
    assert.match(off.calls.record[0].detail, /KIOSK_AUTOMATION=off/);

    const dry = standIns();
    await recover(dry, { env: { KIOSK_AUTOMATION: 'dry-run' } });
    assert.deepEqual([dry.calls.probes, dry.calls.kioskStarts, dry.calls.opened.length], [0, 0, 0]);
    assert.deepEqual([dry.calls.record[0].dryRun, dry.calls.record[0].cause], [true, 'acted']);

    const manual = standIns({ mode: 'manual', policies: [STOP_POLICY] });
    await recover(manual);
    assert.deepEqual(manual.calls.opened, [URL], 'manual mode: back the way it was');
    const manualDown = standIns({ mode: 'manual' });
    await recover(manualDown, { kioskWasUp: false });
    assert.equal(manualDown.calls.opened.length, 0);
});

test('the browser is opened with the command of the system, and a command that cannot start gives false', () => {
    const seen = [];
    const run = (command, args, options) => { seen.push([command, args, options.detached]); return { on() {}, unref() {} }; };
    assert.equal(runLog.openUrl(URL, { platform: 'win32', run }), true);
    assert.equal(runLog.openUrl(URL, { platform: 'linux', run }), true);
    assert.equal(runLog.openUrl(URL, { platform: 'darwin', run }), true);
    assert.deepEqual(seen, [['rundll32.exe', ['url.dll,FileProtocolHandler', URL], true], ['xdg-open', [URL], true], ['open', [URL], true]]);
    assert.equal(runLog.openUrl(URL, { platform: 'win32', run: () => { throw new Error('spawn failed'); } }), false);
});

// begin() with stand-ins and its own files: what goes into the History list at a start
function beginWith({ previous, note, events, startedBy = '', over = {}, env = {} }) {
    runLog.reset();
    const dir = fs.mkdtempSync(path.join(tmp, 'begin-'));
    const stateFile = path.join(dir, 'run-state.json');
    const noteFile = path.join(dir, 'run-stop.json');
    if (previous) fs.writeFileSync(stateFile, typeof previous === 'string' ? previous : JSON.stringify(previous));
    if (note) fs.writeFileSync(noteFile, JSON.stringify(note));
    const s = standIns(over);
    let asked = null;
    s.deps.readEvents = (since, callback) => { asked = since; callback(events === undefined ? [] : events); };
    return new Promise((resolve) => {
        runLog.begin({ port: 3000, https: true, startedBy, env, deps: { ...s.deps, stateFile, noteFile, noTimers: true }, done: (result) => resolve({ ...result, calls: s.calls, asked, stateFile, noteFile, deps: s.deps }) });
    });
}

test('a start writes the stop of the last run with its own time, then the start, then the check', async () => {
    const first = await beginWith({});
    assert.deepEqual(first.calls.record.map((r) => [r.type, r.cause]), [['started', 'first']], 'a first start has no stop to write');
    assert.equal(first.asked, null, 'and no events to read');
    const written = JSON.parse(fs.readFileSync(first.stateFile, 'utf8'));
    assert.deepEqual([written.pid, written.aliveAt, written.kioskUp], [process.pid, iso(10 * 60 * MIN), null], 'the new run is on record at once');

    const cut = await beginWith({ previous: state(), events: POWER_CUT, startedBy: 'logon' });
    assert.equal(cut.asked.toISOString(), iso(-2 * MIN), 'the events are read from 2 minutes before the last "still alive"');
    assert.deepEqual(cut.calls.record.map((r) => [r.type, r.cause, r.at]), [['stopped', 'power-lost', iso(0)], ['started', 'pc-start', iso(10 * 60 * MIN)], ['recovery', 'acted', undefined]]);
    assert.equal(cut.calls.opened.length, 1);
    const [page, link] = cut.calls.opened[0].split('#');
    assert.equal(page, URL, 'the browser gets the History page');
    assert.equal(recoveryView.valid(link), true, 'with the link that this start made for it');
    assert.ok(!JSON.stringify(cut.calls.record).includes(link), 'and the link is not in the History');
    assert.equal(cut.plan.act, true);

    const closed = await beginWith({ previous: state(), note: { at: iso(4000), reason: 'ctrl-c', detail: '' }, events: [] });
    assert.deepEqual(closed.calls.record.map((r) => [r.type, r.cause, r.at]), [['stopped', 'ctrl-c', iso(4000)], ['started', 'manual', iso(10 * 60 * MIN)]]);
    assert.deepEqual([closed.calls.opened.length, closed.plan], [0, null], 'the PC stayed on: no check, nothing opened');
    assert.equal(fs.existsSync(closed.noteFile), false, 'the stop note is used once');

    const http = await beginWith({ previous: state({ kioskUp: false }), events: POWER_CUT, over: { mode: 'manual' } });
    assert.equal(http.calls.opened.length, 0, 'manual mode and the kiosk server was down before: left alone');
    assert.equal(http.calls.record[2].cause, 'left');

    const noLog = await beginWith({ previous: state(), events: null });
    assert.deepEqual(noLog.calls.record.map((r) => r.type), ['stopped', 'started'], 'events that cannot be read never stop the start from being written');
    assert.equal(noLog.calls.record[0].cause, 'unknown', 'and the stop does not claim to know more than it does');
    const noLogOff = await beginWith({ previous: state(), events: null, over: { bootMs: T0 + 30 * MIN } });
    assert.deepEqual(noLogOff.calls.record.map((r) => [r.type, r.cause]), [['stopped', 'pc-off'], ['started', 'pc-start'], ['recovery', 'acted']], 'without the events, a Windows that started after the last "still alive" still shows the PC was off');
    const half = await beginWith({ previous: '{"pid": 1, "aliveAt": "2026-1', events: [] });
    assert.deepEqual(half.calls.record.map((r) => [r.type, r.cause]), [['stopped', 'ended'], ['started', 'manual']], 'a half-written record does not throw');
    runLog.reset();
});

test('a "still alive" that comes much too late is a pause: sleep or hibernation, with how long', async () => {
    const started = await beginWith({});
    let now = T0 + 10 * 60 * MIN;
    const record = [];
    const deps = { ...started.deps, now: () => new Date(now), record: (type, detail, dryRun, extra = {}) => record.push({ type, detail, at: extra.at }) };
    now += 20 * 1000;
    runLog.beat(deps);
    assert.equal(record.length, 0, 'an ordinary beat writes nothing down');
    const before = now;
    now += 4 * 60 * MIN + 21 * MIN;
    deps.readEvents = (since, callback) => callback([{ at: new Date(before + 5000).toISOString(), id: 42, provider: 'Microsoft-Windows-Kernel-Power', values: ['5'] }]);
    runLog.beat(deps);
    assert.deepEqual(record.map((r) => [r.type, r.at]), [['sleep', new Date(before).toISOString()], ['wake', new Date(now).toISOString()]]);
    assert.equal(record[0].detail, 'The PC went into hibernation. The kiosk programs were paused, not closed.');
    assert.equal(record[1].detail, 'The PC woke up after 4 h 21 min and the kiosk programs carried on.');

    record.length = 0;
    now += 30 * MIN;
    deps.readEvents = (since, callback) => callback(null);
    runLog.beat(deps);
    assert.match(record[0].detail, /went into sleep or hibernation/, 'without the events it is still a pause');
    record.length = 0;
    now += 30 * MIN;
    deps.readEvents = (since, callback) => callback([]);
    runLog.beat(deps);
    assert.deepEqual(record.map((r) => r.type), ['pause'], 'Windows recorded no sleep: said as it is');
    assert.equal(JSON.parse(fs.readFileSync(started.stateFile, 'utf8')).aliveAt, new Date(now).toISOString());
    assert.deepEqual([runLog.duration(30 * 1000), runLog.duration(59 * MIN), runLog.duration(60 * MIN), runLog.duration(3 * 24 * 60 * MIN)], ['1 min', '59 min', '1 h', '3 days']);
    runLog.reset();
});

test('the kiosk server as the main server sees it: only a change is written down', async () => {
    const started = await beginWith({});
    const record = [];
    let running = false;
    const deps = { ...started.deps, probe: (callback) => callback({ running }), record: (type, detail) => record.push([type, detail]) };
    runLog.watchKiosk(deps);
    runLog.watchKiosk(deps);
    running = true;
    runLog.watchKiosk(deps);
    runLog.watchKiosk(deps);
    running = false;
    runLog.watchKiosk(deps);
    assert.deepEqual(record.map((r) => r[0]), ['kiosk-down', 'kiosk-up', 'kiosk-down']);
    assert.match(record[0][1], /has not answered since this start/);
    assert.match(record[2][1], /stopped answering/);
    runLog.beat({ ...started.deps });
    assert.equal(JSON.parse(fs.readFileSync(started.stateFile, 'utf8')).kioskUp, false, 'the next "still alive" keeps it for the check after a stop');
    runLog.reset();
});
// <Jun Kai end>
