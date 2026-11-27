// Owner: Role 3, Jun Kai. Previous team: Bernissa (schedule and mode files), Yu Kang (kiosk status probe).
// Kiosk server control shared by the admin routes and the automation scheduler: the schedule, mode and
// automation-log files, the kiosk status probe, the start action, the previous team's manual hibernate (the Stop
// button), and the schedule maths.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, spawn } = require('child_process');
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const SCHEDULE_CONFIG_PATH = process.env.SCHEDULE_CONFIG_PATH || paths.dataFile('kiosk-schedules.json');
const MODE_FILE = paths.dataFile('server-control-mode.json');
const AUTOMATION_FILE = paths.dataFile('server-automation.json');
const MAX_EVENTS = 500; // <Jun Kai/> starts, stops and their causes are kept here too, so the list is longer than 50

const kioskControlConfig = {
    windowsPidFile: path.join(paths.BACKEND, 'kioskServer.pid'),
    kioskScriptPath: path.join(paths.BACKEND, 'kioskServer.js'),
    kioskPort: 3003
};

const localStamp = () => new Date().toLocaleString('sv-SE');
const scheduleListeners = [];

// ---------------------------------------------------------------- schedule + mode files
function readSchedulesConfig() {
    if (!fs.existsSync(SCHEDULE_CONFIG_PATH)) {
        const empty = { schedules: [], last_updated: localStamp() };
        try { writeJsonAtomic(SCHEDULE_CONFIG_PATH, empty); } catch (error) { console.error('❌ Could not create the schedules file:', error.message); }
        return empty;
    }
    const config = readJson(SCHEDULE_CONFIG_PATH, null);
    if (!config || !Array.isArray(config.schedules)) {
        console.error('❌ Schedules file is not valid JSON; treating it as empty until it is saved again');
        return { schedules: [], last_updated: null };
    }
    return config;
}

function writeSchedulesConfig(config) {
    try {
        config.last_updated = localStamp();
        writeJsonAtomic(SCHEDULE_CONFIG_PATH, config);
    } catch (error) {
        console.error('❌ Error writing schedules config:', error);
        return false;
    }
    for (const listener of scheduleListeners) {
        try { listener(config.schedules); } catch (error) { console.error('⚠️ Schedule listener failed:', error.message); }
    }
    return true;
}

// Called after every schedule save (the scheduler uses it to refresh the Windows wake timer)
function onSchedulesChanged(listener) {
    scheduleListeners.push(listener);
}

// Manual is the safe default: in auto mode the policies run the kiosk
function readModeConfig() {
    const config = readJson(MODE_FILE, null);
    if (config && ['auto', 'manual'].includes(config.mode)) return config;
    return { mode: 'manual', last_updated: new Date().toISOString(), updated_by: 'system' };
}

function writeModeConfig(config) {
    try {
        config.last_updated = new Date().toISOString();
        writeJsonAtomic(MODE_FILE, config);
        console.debug(`✅ Mode file updated: ${config.mode}`);
        return true;
    } catch (error) {
        console.error('❌ Error writing mode file:', error);
        return false;
    }
}

// ---------------------------------------------------------------- automation log
function readAutomation() {
    const data = readJson(AUTOMATION_FILE, null);
    return data && Array.isArray(data.events) ? data : { events: [], lastHibernateKey: null };
}

function saveAutomation(data) {
    try { writeJsonAtomic(AUTOMATION_FILE, data); } catch (error) { console.error('⚠️ Could not write the automation log:', error.message); }
}

// <Jun Kai start>
// extra.at: when it happened, for something that is only known later (a stop is written down at the next start);
// extra.cause: a short key the page uses for its label, for example 'power-lost'
function recordEvent(type, detail, dryRun = false, extra = {}) {
    const data = readAutomation();
    const event = { at: extra.at || new Date().toISOString(), type, detail, dryRun: !!dryRun };
    if (extra.cause) event.cause = extra.cause;
    data.events.push(event);
    data.events = byTime(data.events).slice(-MAX_EVENTS);
    saveAutomation(data);
    console.log(`🤖 Automation ${dryRun ? '[dry run] ' : ''}${type}: ${detail}`);
}

// oldest first; lines of the same moment stay in the order they were written
function byTime(events) {
    return events.map((event, index) => ({ event, index, at: new Date(event.at).getTime() || 0 }))
        .sort((a, b) => (a.at - b.at) || (a.index - b.index)).map((item) => item.event);
}
// <Jun Kai end>

function setLastHibernateKey(key) {
    const data = readAutomation();
    data.lastHibernateKey = key;
    saveAutomation(data);
}

// ---------------------------------------------------------------- kiosk status
function probeKioskHttp(callback) {
    const hostsToTry = ['127.0.0.1', '::1', 'localhost'];

    function tryHost(index) {
        if (index >= hostsToTry.length) {
            callback({ running: false, status: 'unreachable', source: 'http-probe' });
            return;
        }
        const host = hostsToTry[index];
        const formattedHost = host.includes(':') ? `[${host}]` : host;
        let settled = false; // a timeout followed by the 'error' event must not advance twice
        const next = (result) => {
            if (settled) return;
            settled = true;
            if (result) callback(result); else tryHost(index + 1);
        };
        const probe = http.get(`http://${formattedHost}:${kioskControlConfig.kioskPort}/feedback`, (probeRes) => {
            const reachable = probeRes.statusCode >= 200 && probeRes.statusCode < 500;
            probeRes.resume();
            next(reachable ? { running: true, status: `reachable (${host})`, source: 'http-probe' } : null);
        });
        probe.setTimeout(1500, () => { probe.destroy(); next(null); });
        probe.on('error', () => next(null));
    }

    tryHost(0);
}

function resolveKioskStatus(callback) {
    if (process.platform === 'win32') {
        probeKioskHttp(callback);
        return;
    }
    exec('systemctl is-active kiosk.service', (err, stdout) => {
        const status = (stdout || '').trim();
        if (!err && status) {
            callback({ running: status === 'active', status, source: 'systemctl' });
            return;
        }
        probeKioskHttp(callback);
    });
}

// <Jun Kai start>
let lastKioskStatusLogKey = null;

// The admin page asks every few seconds, so only a change is worth a line
function logKioskStatusIfNeeded(result) {
    const logKey = `${result.status}|${result.source}`;
    if (logKey === lastKioskStatusLogKey) return;
    lastKioskStatusLogKey = logKey;
    console.log(`📊 Kiosk service status: ${result.status} (${result.source})`);
}
// <Jun Kai end>

// ---------------------------------------------------------------- actions
// Starts the kiosk server if it is not reachable. callback({ success, message | error, ... })
function startKiosk(callback) {
    if (process.platform !== 'win32') {
        exec('sudo systemctl start kiosk.service', (err, stdout, stderr) => {
            if (err) {
                console.error('❌ Failed to start server:', stderr);
                return callback({ success: false, error: 'Failed to start server', platform: 'linux' });
            }
            callback({ success: true, message: 'Server started successfully', platform: 'linux' });
        });
        return;
    }

    resolveKioskStatus((statusInfo) => {
        if (statusInfo.running) {
            return callback({ success: true, message: 'Server is already running', platform: 'windows', source: statusInfo.source });
        }
        try {
            const child = spawn(process.execPath, [kioskControlConfig.kioskScriptPath], {
                cwd: paths.BACKEND,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
            fs.writeFileSync(kioskControlConfig.windowsPidFile, String(child.pid));
        } catch (error) {
            console.error('❌ Failed to start Windows kiosk server:', error);
            return callback({ success: false, error: 'Failed to start server on Windows', platform: 'windows' });
        }
        // A cold start loads the AI modules first, so keep checking for up to 30 s
        const verifyStarted = (attempt) => {
            resolveKioskStatus((verifyInfo) => {
                if (verifyInfo.running) {
                    return callback({ success: true, message: 'Server started successfully', platform: 'windows', source: verifyInfo.source });
                }
                if (attempt < 15) return setTimeout(() => verifyStarted(attempt + 1), 2000);
                callback({
                    success: false,
                    error: 'Kiosk server did not become reachable within 30 seconds of the start command',
                    platform: 'windows',
                    status: verifyInfo.status
                });
            });
        };
        setTimeout(() => verifyStarted(1), 1500);
    });
}

// Hibernates the PC. Processes survive hibernation, so nothing needs to be stopped first.
function hibernateNow(reason, { dryRun = false } = {}) {
    recordEvent('hibernate', reason, dryRun);
    if (dryRun) return;
    const batFile = path.join(paths.ROOT, 'hibernate.bat');
    let command;
    if (process.platform === 'win32') command = fs.existsSync(batFile) ? `cmd.exe /c "${batFile}"` : 'shutdown /h';
    else command = 'systemctl hibernate';
    exec(command, (err, stdout, stderr) => {
        if (err) console.error('❌ Hibernate command failed:', err.message);
        if (stderr) console.error('❌ Hibernate command output:', stderr);
    });
}

// <Jun Kai start>
// The schedule maths (which policy decides when) lives in policies.js.
// One record of the last kiosk start attempt, shared by the policies (scheduler.js) and the incident fix (aiops/fixes.js),
// so the two never start the kiosk server twice within the same few minutes
const START_GAP_MS = 5 * 60 * 1000; // at most one automatic kiosk start in this time
let lastStartAttemptMs = 0;
const noteStartAttempt = (at = Date.now()) => { lastStartAttemptMs = at; };
const lastStartAttempt = () => lastStartAttemptMs;

module.exports = {
    SCHEDULE_CONFIG_PATH, MODE_FILE, AUTOMATION_FILE, kioskControlConfig,
    readSchedulesConfig, writeSchedulesConfig, onSchedulesChanged, readModeConfig, writeModeConfig,
    readAutomation, recordEvent, byTime, MAX_EVENTS, setLastHibernateKey,
    resolveKioskStatus, logKioskStatusIfNeeded, startKiosk, hibernateNow, noteStartAttempt, lastStartAttempt, START_GAP_MS
};
// <Jun Kai end>
