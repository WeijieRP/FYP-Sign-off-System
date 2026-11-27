// Owner: Role 3, Jun Kai.
// Unit tests for what happens around a start after the PC was off: the database check waits for a MySQL that is not
// answering yet, the scheduler records the switch to on hours and leaves the first kiosk start to startAll.js, the
// History list stays in time order, and startAll.js leaves a note that says why it stopped.
// MySQL, the kiosk programs and the timers are stand-ins. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-start-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Loads backend/core/db.js in its own process with a stand-in for mysql2: the connection fails `failures` times with
// `code`, then works. Waits are cut to 1 ms; `clockStep` is how far the clock moves at every look, so the 5 minutes pass.
function startDb({ failures, code, clockStep = 0 }) {
    const script = `
        const Module = require('module');
        let tries = 0;
        const pool = {
            on() {},
            getConnection(callback) {
                tries++;
                if (tries <= ${failures}) { const error = new Error('stand-in ${code}'); error.code = '${code}'; return callback(error); }
                callback(null, { release() {} });
            },
            promise() { return {}; }
        };
        const load = Module._load;
        Module._load = function (request, ...rest) { return request === 'mysql2' ? { createPool: () => pool } : load.call(this, request, ...rest); };
        const realTimeout = setTimeout;
        global.setTimeout = (fn, ms, ...args) => realTimeout(fn, ms >= 1000 ? 1 : ms, ...args);
        let clock = 1000000;
        Date.now = () => (clock += ${clockStep});
        process.on('exit', (exitCode) => console.log('TRIES ' + tries + ' EXIT ' + exitCode));
        require(${JSON.stringify(path.join(ROOT, 'backend', 'core', 'db.js'))});
    `;
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
    const match = /TRIES (\d+) EXIT (\d+)/.exec(result.stdout || '');
    return { tries: match ? Number(match[1]) : null, exitCode: match ? Number(match[2]) : null, text: `${result.stdout}${result.stderr}` };
}

test('a MySQL that is not answering yet is waited for: 40 failed tries still end connected', () => {
    const run = startDb({ failures: 40, code: 'ECONNREFUSED' });
    assert.deepEqual([run.tries, run.exitCode], [41, 0], run.text.slice(-400));
    assert.match(run.text, /Connected to MySQL database/);
    assert.match(run.text, /MySQL is not answering yet: trying for 5 minutes/);
    const lines = run.text.split('\n').filter((line) => line.includes('Error connecting')).length;
    assert.ok(lines < 12, `the log gets a line a minute while it waits, not one per try (${lines} lines for 40 tries)`);
});

test('a MySQL that never answers ends the server once the 5 minutes are over', () => {
    // every look at the clock moves it 20 seconds, so the 5 minutes pass after about 15 tries
    const run = startDb({ failures: 1000, code: 'ETIMEDOUT', clockStep: 20000 });
    assert.equal(run.exitCode, 1, run.text.slice(-400));
    assert.ok(run.tries > 6 && run.tries < 40, `it gave up after the 5 minutes, not after 6 tries (${run.tries} tries)`);
});

test('a MySQL that answers with an error still ends the server after 6 tries', () => {
    const run = startDb({ failures: 1000, code: 'ER_ACCESS_DENIED_ERROR' });
    assert.deepEqual([run.tries, run.exitCode], [6, 1], run.text.slice(-400));
    assert.match(run.text, /attempt 6\/6/);
});

// ---------------------------------------------------------------- the scheduler, with a stand-in for control.js
function loadScheduler(control) {
    const controlPath = require.resolve('../../backend/features/serverControl/control');
    const schedulerPath = require.resolve('../../backend/features/serverControl/scheduler');
    delete require.cache[schedulerPath];
    require.cache[controlPath] = { id: controlPath, filename: controlPath, loaded: true, exports: control };
    const scheduler = require('../../backend/features/serverControl/scheduler');
    delete require.cache[controlPath];
    delete require.cache[schedulerPath];
    return scheduler;
}

function fakeControl(over = {}) {
    const calls = { events: [], kioskStarts: 0, attempts: [] };
    let last = 0;
    return {
        calls,
        START_GAP_MS: 5 * 60 * 1000,
        readSchedulesConfig: () => ({ schedules: over.policies }),
        readAutomation: () => ({ events: calls.events, lastHibernateKey: null }),
        readModeConfig: () => ({ mode: over.mode ? over.mode() : 'auto' }),
        setLastHibernateKey() {},
        recordEvent: (type, detail, dryRun) => calls.events.push({ at: new Date().toISOString(), type, detail, dryRun: !!dryRun }),
        byTime: (events) => events,
        resolveKioskStatus: (callback) => callback({ running: over.kioskUp === undefined ? true : over.kioskUp }),
        startKiosk: (callback) => { calls.kioskStarts++; callback({ success: true, message: 'Server started successfully' }); },
        noteStartAttempt: (at = Date.now()) => { last = at; calls.attempts.push(at); },
        lastStartAttempt: () => last
    };
}

// every day 08:00 to 18:00
const HOURS = { id: 1, is_active: true, action: 'active', schedule_type: 'daily', start_time: '08:00', end_time: '18:00', schedule_name: 'Opening hours' };
const at = (h, m = 0) => new Date(2026, 10, 18, h, m);

test('the scheduler records the switch to on hours once, and never on the first check after a start', () => {
    const control = fakeControl({ policies: [HOURS] });
    const scheduler = loadScheduler(control);
    scheduler.tick(at(9));
    assert.deepEqual(control.calls.events, [], 'the first check after a start is not a switch, even in on hours');
    scheduler.tick(at(19));
    scheduler.tick(at(19, 1));
    assert.deepEqual(control.calls.events.map((e) => e.type), ['off'], 'the switch to off hours is recorded once, as before');
    scheduler.tick(at(8));
    scheduler.tick(at(8, 1));
    scheduler.tick(at(8, 2));
    assert.deepEqual(control.calls.events.slice(1).map((e) => [e.type, e.detail]), [['on', 'on hours started: "Opening hours" is in force']], 'one line for the switch to on hours, none for the minutes after');
});

test('manual mode pauses the policies: no on-hours line while it is on, and none for the switch back', () => {
    let mode = 'manual';
    const control = fakeControl({ policies: [HOURS], mode: () => mode });
    const scheduler = loadScheduler(control);
    scheduler.tick(at(7));
    scheduler.tick(at(8));
    assert.deepEqual(control.calls.events, [], 'manual mode: nothing is recorded for the policies');
    mode = 'auto';
    scheduler.tick(at(8, 1));
    assert.deepEqual(control.calls.events, [], 'on hours had begun before the switch to automatic mode');
});

test('the first automatic kiosk start waits 90 seconds: startAll.js starts the kiosk server at the same moment', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: at(9).getTime() });
    const control = fakeControl({ policies: [HOURS], kioskUp: false });
    const scheduler = loadScheduler(control);
    const saved = process.env.KIOSK_AUTOMATION;
    process.env.KIOSK_AUTOMATION = 'on';
    try {
        scheduler.start();
    } finally {
        if (saved === undefined) delete process.env.KIOSK_AUTOMATION; else process.env.KIOSK_AUTOMATION = saved;
    }
    assert.equal(scheduler.STARTUP_GRACE_MS, 90 * 1000);
    assert.equal(control.calls.attempts.length, 1, 'start() marks the moment the kiosk server was started by startAll.js');
    t.mock.timers.tick(5000);     // the first check, 5 seconds after the start
    assert.equal(control.calls.kioskStarts, 0, 'the kiosk server does not answer yet, but it is not started a second time');
    t.mock.timers.tick(60000);    // the check at 65 seconds
    assert.equal(control.calls.kioskStarts, 0);
    t.mock.timers.tick(60000);    // the check at 125 seconds: the 90 seconds are over
    assert.equal(control.calls.kioskStarts, 1, 'a kiosk server that is still down after 90 seconds is started');
    assert.deepEqual(control.calls.events.map((e) => e.type), ['start', 'start-ok']);
});

test('the History list is kept in time order, also when a stop is written down later with its own time', () => {
    const control = require('../../backend/features/serverControl/control');
    const events = [
        { at: '2026-11-18T00:01:00.000Z', type: 'started' },
        { at: '2026-11-17T15:00:00.000Z', type: 'stopped' },      // written at the next start, with the time it happened
        { at: '2026-11-18T00:01:00.000Z', type: 'recovery' },     // the same moment as the start: stays after it
        { at: 'not a time', type: 'old-line' }
    ];
    assert.deepEqual(control.byTime(events).map((e) => e.type), ['old-line', 'stopped', 'started', 'recovery']);
    assert.equal(control.MAX_EVENTS, 500);
});

// ---------------------------------------------------------------- startAll.js, with stand-ins for the two servers
// Runs startAll.js in its own process. child_process.spawn gives back stand-in servers, and the stop note goes to a
// temp file. `act` is run once both servers are "started".
function runStartAll(act, args = []) {
    const noteFile = path.join(tmp, `note-${Math.random().toString(16).slice(2)}.json`);
    const script = `
        const { EventEmitter } = require('events');
        const childProcess = require('child_process');
        const servers = [];
        childProcess.spawn = (command, argv, options) => {
            const server = new EventEmitter();
            server.script = argv[0]; server.args = argv.slice(1); server.killed = false;
            server.kill = () => { server.killed = true; return true; };
            servers.push(server);
            return server;
        };
        const stopNote = require(${JSON.stringify(path.join(ROOT, 'backend', 'core', 'stopNote.js'))});
        const write = stopNote.write;
        stopNote.write = (reason, detail) => write(reason, detail, { file: ${JSON.stringify(noteFile)} });
        process.argv = [process.argv[0], ${JSON.stringify(path.join(ROOT, 'startAll.js'))}, ...${JSON.stringify(args)}];
        require(${JSON.stringify(path.join(ROOT, 'startAll.js'))});
        (${act.toString()})(servers);
        console.log('RESULT ' + JSON.stringify({ scripts: servers.map((s) => require('path').basename(s.script)), killed: servers.map((s) => s.killed), args: servers.map((s) => s.args) }));
        process.exit(0);
    `;
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
    const match = /RESULT (.+)/.exec(result.stdout || '');
    let note = null;
    try { note = JSON.parse(fs.readFileSync(noteFile, 'utf8')); } catch { /* no note */ }
    return { result: match ? JSON.parse(match[1]) : null, note, text: `${result.stdout}${result.stderr}` };
}

test('startAll.js: Ctrl+C and a closed window leave their own stop note, and both servers are stopped', () => {
    const ctrlC = runStartAll(() => process.emit('SIGINT'));
    assert.deepEqual(ctrlC.result, { scripts: ['server.js', 'kioskServer.js'], killed: [true, true], args: [[], []] }, ctrlC.text.slice(-400));
    assert.equal(ctrlC.note.reason, 'ctrl-c');
    const closed = runStartAll(() => process.emit('SIGHUP'));
    assert.deepEqual([closed.result.killed, closed.note.reason], [[true, true], 'window-closed'], closed.text.slice(-400));
});

test('startAll.js: a server that ends by itself is named in the note, and the other server is stopped', () => {
    const run = runStartAll((servers) => servers[1].emit('exit', 1, null));
    assert.deepEqual(run.result.killed, [true, false], run.text.slice(-400));
    assert.equal(run.note.reason, 'child-exit');
    assert.match(run.note.detail, /^backend[\\/]kioskServer\.js ended \(code 1\), so startAll\.js stopped the other server too\.$/);
    // the Ctrl+C that follows a server's own end does not replace the first reason
    const both = runStartAll((servers) => { servers[0].emit('exit', 1, null); process.emit('SIGINT'); });
    assert.equal(both.note.reason, 'child-exit');
});

test('startAll.js --logon tells the servers that Windows sign-in started them', () => {
    assert.deepEqual(runStartAll(() => {}, ['--logon']).result.args, [['--logon'], ['--logon']], 'both servers get --logon');
    const shortcut = fs.readFileSync(path.join(ROOT, 'scripts', 'install', 'install.ps1'), 'utf8');
    assert.match(shortcut, /\$link\.Arguments = "\/k title RP Xperience Centre Kiosk server & `"\$node`" `"\$start`" --logon"/, 'the logon shortcut of install.cmd passes --logon');
});
// <Jun Kai end>
