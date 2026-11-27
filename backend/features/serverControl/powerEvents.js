// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// What Windows itself wrote down about the PC going off, starting, sleeping and waking: the System event log, read with
// one PowerShell call. Only ids and values are used, never the message text, so it works in any display language.
// On another system, or when the call fails, there are no events and the caller says the cause is not known.
//
//   Kernel-Boot 27       the PC started; value 0 = cold start, 1 = fast startup, 2 = back from hibernation
//   Kernel-General 12/13 Windows started / Windows is shutting down (a normal shutdown or restart)
//   User32 1074          who asked for the shutdown or restart, why, and which of the two
//   Kernel-Power 41      the PC started again without a clean shutdown (power lost, held power button, bug check)
//   EventLog 6008        the previous shutdown was unexpected
//   Kernel-Power 42/107  going to sleep or hibernation (value 0: 4 = sleep, 5 = hibernation) / back from it
const { execFile } = require('child_process');

const WANTED = [
    ['Kernel-Boot', 27], ['Kernel-General', 12], ['Kernel-General', 13], ['User32', 1074],
    ['Kernel-Power', 41], ['EventLog', 6008], ['Kernel-Power', 42], ['Kernel-Power', 107]
];
const MAX_EVENTS = 400;
// Right after Windows signs in, PowerShell can take far longer than on a PC that has been on for a while, and nothing
// waits for the answer: a long limit, and one more try when the first one fails.
const READ_TIMEOUT_MS = 90 * 1000;
const RETRY_AFTER_MS = 10 * 1000;
const AFTER_BOOT_MS = 10 * 60 * 1000; // 41 and 6008 are written while Windows starts

const time = (event) => new Date(event.at).getTime();
const is = (event, provider, id) => Number(event.id) === id && String(event.provider || '').includes(provider);

// Reads the wanted events since `since`, oldest first. callback(events | null): null when they cannot be read.
function read(since, callback, { run = execFile, platform = process.platform, retryAfterMs = RETRY_AFTER_MS, tries = 2 } = {}) {
    if (platform !== 'win32') return callback(null);
    const ids = [...new Set(WANTED.map(([, id]) => id))].join(',');
    const providers = [...new Set(WANTED.map(([provider]) => provider))].join('|');
    const script = [
        `$since = [DateTimeOffset]::Parse('${new Date(since).toISOString()}').LocalDateTime`,
        `Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = ${ids}; StartTime = $since } -ErrorAction SilentlyContinue |`,
        `  Where-Object { $_.ProviderName -match '${providers}' } | Sort-Object TimeCreated | Select-Object -First ${MAX_EVENTS} |`,
        '  ForEach-Object { [pscustomobject]@{ at = $_.TimeCreated.ToUniversalTime().ToString(\'o\'); id = $_.Id; provider = $_.ProviderName; values = @($_.Properties | ForEach-Object { "$($_.Value)" }) } } |',
        '  ConvertTo-Json -Compress -Depth 3'
    ].join('\n');
    const attempt = (left) => {
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: READ_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
            const events = error ? null : parse(stdout);
            if (events || left <= 1) return callback(events);
            setTimeout(() => attempt(left - 1), retryAfterMs);
        });
    };
    attempt(tries);
}

// PowerShell prints nothing for no events, one object for one event and a list for more
function parse(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];
    try {
        const data = JSON.parse(trimmed);
        return (Array.isArray(data) ? data : [data])
            .filter((event) => event && event.at && !Number.isNaN(time(event)))
            .map((event) => ({ at: event.at, id: Number(event.id), provider: String(event.provider || ''), values: Array.isArray(event.values) ? event.values.map(String) : event.values === undefined || event.values === null ? [] : [String(event.values)] }))
            .sort((a, b) => time(a) - time(b));
    } catch {
        return null;
    }
}

// "C:\WINDOWS\system32\shutdown.exe (PC-NAME)" -> "shutdown.exe"
const programName = (value) => String(value || '').replace(/\s*\([^)]*\)\s*$/, '').split(/[\\/]/).pop().trim();

// What happened to the PC after `afterMs`, from the events. The first start after that moment tells how the PC went
// off (it ended the run that was alive at afterMs); the last start is the one the PC is running on now.
function summarize(events, afterMs) {
    const list = (events || []).filter((event) => time(event) >= afterMs).sort((a, b) => time(a) - time(b));
    const isStart = (event) => (is(event, 'Kernel-Boot', 27) && ['0', '1'].includes(String(event.values[0]))) || is(event, 'Kernel-General', 12);
    const starts = list.filter(isStart);
    const sleeps = list.filter((event) => is(event, 'Kernel-Power', 42));
    const lastSleep = sleeps.length ? sleeps[sleeps.length - 1] : null;
    const sleep = lastSleep ? { at: lastSleep.at, kind: String(lastSleep.values[0]) === '5' ? 'hibernation' : String(lastSleep.values[0]) === '4' ? 'sleep' : 'sleep or hibernation' } : null;
    if (!starts.length) return { started: null, sleep };

    const first = starts[0];
    const last = starts[starts.length - 1];
    const before = list.filter((event) => time(event) < time(first));
    const asked = [...before].reverse().find((event) => is(event, 'User32', 1074));
    const clean = before.find((event) => is(event, 'Kernel-General', 13));
    const afterStart = list.filter((event) => time(event) >= time(first) - 5000 && time(event) <= time(first) + AFTER_BOOT_MS);
    const power = afterStart.find((event) => is(event, 'Kernel-Power', 41));
    const unexpected = !!power || afterStart.some((event) => is(event, 'EventLog', 6008));
    const bootKind = (event) => {
        const boot = list.find((other) => is(other, 'Kernel-Boot', 27) && Math.abs(time(other) - time(event)) < 60000);
        return boot && String(boot.values[0]) === '1' ? 'fast startup' : 'cold start';
    };
    return {
        started: { firstAt: first.at, lastAt: last.at, kind: bootKind(last), count: new Set(starts.map((event) => Math.round(time(event) / 60000))).size },
        unexpected,
        bugCheck: !!power && !['', '0', '0x0'].includes(String(power.values[0] || '').toLowerCase()),
        // when the shutdown began: programs are closed right after it is asked for, Kernel-General 13 can come minutes later
        shutdownAt: asked ? asked.at : clean ? clean.at : null,
        asked: asked ? { at: asked.at, program: programName(asked.values[0]), reason: String(asked.values[2] || '').trim(), restart: /restart/i.test(String(asked.values[4] || '')) } : null,
        sleep
    };
}

module.exports = { WANTED, read, parse, summarize, programName };
// <Jun Kai end>
