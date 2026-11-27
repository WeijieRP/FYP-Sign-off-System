// Owner: Role 3, Jun Kai.
// Turns what the engine loaded (sample rows, bucket means, health runs, tablets, log lines) into the input the
// detectors read. MySQL hands DECIMAL columns over as strings, so every number is converted here; anything that is
// not a finite number becomes null and the detectors skip it. Pure functions, no database.
// <Jun Kai start>
const HOUR = 60 * 60 * 1000;

// a number, or null for null, '', undefined and anything not finite (Number(null) would be 0)
function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// ms since epoch from a Date, a number, a numeric string or an ISO string; null when unreadable
function toMs(t) {
    if (t instanceof Date) return Number.isFinite(t.getTime()) ? t.getTime() : null;
    const n = num(t);
    if (n !== null) return n;
    const parsed = typeof t === 'string' ? Date.parse(t) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

// rows [{ t, <key> }] -> [{ t, v }] oldest first; a row without a time is dropped, a missing value stays null
function series(rows, key) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => (row ? { t: toMs(row.t), v: num(row[key]) } : null))
        .filter((p) => p && p.t !== null)
        .sort((a, b) => a.t - b.t);
}

const points = (list) => series(list, 'v');

// hours between the first and the last row, 1 decimal (the "24 h of samples" the status shows)
function spanHours(rows) {
    let first = Infinity;
    let last = -Infinity;
    for (const row of Array.isArray(rows) ? rows : []) {
        const t = row ? toMs(row.t) : null;
        if (t === null) continue;
        if (t < first) first = t;
        if (t > last) last = t;
    }
    return last > first ? Math.round(((last - first) / HOUR) * 10) / 10 : 0;
}

// rows: the last 24 h of samples [{ t, cpu, memory, gpu, disk }]; hourRows: the same shape for the last 14 days at
// the same Singapore hour; memoryBuckets: 10-minute means of memory over 24 h; diskBuckets: hourly disk % over
// 7 days; diskPoints: hourly used GB over 30 days; the rest comes straight from the recorder, the heartbeats and
// the log reader. The result is the shape detectors.runAll reads.
// awakeSeconds: time since the server started or the PC woke up; watchSeconds: time the PC has been awake with the
// kiosk meant to be on (both null when unknown).
function assembleInput({
    now, intervalSeconds, rows, hourRows, memoryBuckets, diskBuckets, diskPoints, totalGb, percent,
    runs, devices, events, known, historyHours, quiet, awakeSeconds, watchSeconds
} = {}) {
    const at = toMs(now);
    return {
        now: at === null ? Date.now() : at,
        intervalSeconds: num(intervalSeconds) || 60,
        awakeSeconds: num(awakeSeconds),
        watchSeconds: num(watchSeconds),
        samples: { cpu: series(rows, 'cpu'), memory: series(rows, 'memory'), gpu: series(rows, 'gpu'), disk: series(rows, 'disk') },
        hourSeries: { cpu: series(hourRows, 'cpu'), memory: series(hourRows, 'memory'), gpu: series(hourRows, 'gpu') },
        driftSeries: { memory: points(memoryBuckets), disk: points(diskBuckets) },
        disk: { points: points(diskPoints), totalGb: num(totalGb), percent: num(percent) },
        health: { runs: Array.isArray(runs) ? runs : [] },
        tablets: { devices: Array.isArray(devices) ? devices : [] },
        logs: {
            events: Array.isArray(events) ? events : [],
            known: known instanceof Set ? known : new Set(Array.isArray(known) ? known : []),
            historyHours: num(historyHours) || 0
        },
        quiet: quiet === true
    };
}

module.exports = { assembleInput, series, points, spanHours, num, toMs };
// <Jun Kai end>
