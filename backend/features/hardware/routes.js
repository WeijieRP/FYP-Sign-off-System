// Owner: Role 3, Jun Kai.
// Admin hardware API, mounted at /api/admin/hardware (session required):
//   GET  /overview            latest sample, sampler status, settings and the processor's name (the part cards)
//   GET  /live                <Jun Kai/> the part cards' reading, asked every second while the page is open (live.js)
//   GET  /series?range=24h&horizon=24   averaged samples for the graphs (1h up to 5y, see ranges.js) plus the forecast
//                             horizon hours ahead (1 hour to 1 year; the saved forecastHours when it is left out). A range
//                             longer than the samples are kept comes from the daily summaries, one point per day or more
//   GET  /settings  PUT /settings   interval, retention, and forecastHours (the length when /series gets no horizon)
//   PUT  /alert-lines        (System Admin) amber and red per part; System Health's Server PC and Disk cards use them
// <Jun Kai start>
const express = require('express');
const auth = require('../../core/auth');
const db = require('../../core/db');
const sampler = require('./sampler');
const settings = require('./settings');
const forecast = require('./forecast');
const ranges = require('./ranges');
const dailyStore = require('./daily');
const live = require('./live'); // <Jun Kai/>
const { cpuInfo } = require('./collect');
const { logAudit } = require('../../core/audit');

const router = express.Router();
const all = (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const FORECAST_BUCKET_SECONDS = 600;
// more than 2 days ahead the forecast works on daily averages (forecast.usesDailyAverages); they barely move within
// minutes, so the answer is kept a while
const LONG_CACHE_MS = 10 * 60 * 1000;
let longCache = { key: null, at: 0, value: null };
const NUMBER_KEYS = ['cpu', 'memory', 'disk', 'gpu', 'diskUsedGb', 'diskTotalGb', 'memoryUsedMb', 'gpuMemoryUsedMb'];

function fail(res, error, what) {
    if (error.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success: false, error: 'A hardware table is missing: run npm run db:migrate' });
    console.error(`❌ Hardware ${what} failed:`, error);
    return res.status(500).json({ success: false, error: `Hardware ${what} failed: ${error.message}` });
}

async function bucketedRows(secondsBack, bucketSeconds, since = '1970-01-01') {
    const rows = await all(
        `SELECT FLOOR(UNIX_TIMESTAMP(sampled_at) / ?) * ? AS t, COUNT(*) AS n,
                AVG(cpu_percent) AS cpu, AVG(memory_percent) AS memory, AVG(disk_percent) AS disk, AVG(gpu_percent) AS gpu,
                AVG(disk_used_gb) AS diskUsedGb, MAX(disk_total_gb) AS diskTotalGb, AVG(memory_used_mb) AS memoryUsedMb, AVG(gpu_memory_used_mb) AS gpuMemoryUsedMb
         FROM hardware_samples
         WHERE sampled_at >= UTC_TIMESTAMP() - INTERVAL ? SECOND AND sampled_at >= ?
         GROUP BY t ORDER BY t`,
        [bucketSeconds, bucketSeconds, secondsBack, since]
    );
    return rows.map((row) => {
        const point = { t: Number(row.t) * 1000, n: Number(row.n) };
        for (const key of NUMBER_KEYS) point[key] = row[key] === null || row[key] === undefined ? null : Math.round(Number(row[key]) * 10) / 10;
        return point;
    });
}

// Buckets of a day or more: the daily summaries for the days already summed up, the samples for the rest (today,
// and a day the sampler has not summed up yet), so nothing is counted twice
async function longRows(secondsBack, bucketSeconds) {
    const next = await dailyStore.nextDay();
    const summaries = next ? await dailyStore.summaryBuckets(secondsBack, bucketSeconds) : [];
    return dailyStore.mergeBuckets(summaries, await bucketedRows(secondsBack, bucketSeconds, next || '1970-01-01'));
}

async function stepForecast(horizonHours) {
    const steps = Math.round((horizonHours * 3600) / FORECAST_BUCKET_SECONDS);
    const windowSeconds = Math.max(24 * 3600, 2 * horizonHours * 3600);
    const buckets = await bucketedRows(windowSeconds, FORECAST_BUCKET_SECONDS);
    // only the unbroken run of buckets up to the latest one: a gap (the PC was hibernated) is not a step
    let cut = buckets.length - 1;
    while (cut > 0 && buckets[cut].t - buckets[cut - 1].t <= FORECAST_BUCKET_SECONDS * 1500) cut--;
    const history = buckets.slice(Math.max(0, cut));
    const lastT = history.length ? history[history.length - 1].t : null;
    const stamp = (series) => series && { ...series, points: series.points.map((p, i) => ({ t: lastT + (i + 1) * FORECAST_BUCKET_SECONDS * 1000, ...p })) };
    const diskPoints = (await bucketedRows(30 * 86400, 3600)).filter((p) => p.diskUsedGb !== null).map((p) => ({ t: p.t, v: p.diskUsedGb }));
    const diskTotal = diskPoints.length ? history.concat().reverse().find((p) => p.diskTotalGb)?.diskTotalGb : null;
    return {
        method: `Holt damped trend (double exponential smoothing) over the unbroken run of 10-minute averages in the last ${Math.round(windowSeconds / 3600)} hours: a trend is trusted for about as long as it has been seen, at most 6 hours, and never carries the value further than the readings moved; disk: straight-line fit over the last 30 days. Statistics only, no AI.`,
        basis: 'steps',
        windowHours: Math.round(windowSeconds / 3600),
        stepSeconds: FORECAST_BUCKET_SECONDS,
        basedOnPoints: history.length,
        cpu: stamp(forecast.holtForecast(history.map((p) => p.cpu), steps)),
        memory: stamp(forecast.holtForecast(history.map((p) => p.memory), steps)),
        gpu: stamp(forecast.holtForecast(history.map((p) => p.gpu), steps)),
        disk: forecast.diskForecast(diskPoints, diskTotal)
    };
}

// More than 2 days ahead: one average per day that has at least an hour of samples (closed days are left out)
async function dailyForecast(current) {
    const key = [current.forecastHours, current.retentionDays, current.intervalSeconds].join('|');
    if (longCache.key === key && Date.now() - longCache.at < LONG_CACHE_MS) return longCache.value;
    const days = Math.round(current.forecastHours / 24);
    // the daily summaries are kept for good, so the window is not cut to the keep period of the samples
    const windowDays = Math.max(30, 2 * days);
    const enough = Math.ceil(3600 / current.intervalSeconds);
    const daily = (await longRows(windowDays * 86400, 86400)).filter((p) => p.n >= enough);
    const from = Date.now();
    const stamp = (series) => series && { ...series, points: series.points.map((p) => ({ t: from + p.day * 86400000, value: p.value, low: p.low, high: p.high })) };
    const diskPoints = daily.filter((p) => p.diskUsedGb !== null).map((p) => ({ t: p.t, v: p.diskUsedGb }));
    const diskTotal = diskPoints.length ? daily.concat().reverse().find((p) => p.diskTotalGb)?.diskTotalGb : null;
    const value = {
        method: `Daily averages of the last ${windowDays} days (${daily.length} with samples) continued with Holt's damped trend. This far ahead CPU, memory and GPU show their usual level and range, not a prediction for one day; disk: straight-line fit over the same days. Statistics only, no AI.`,
        basis: 'daily',
        windowHours: windowDays * 24,
        stepSeconds: 86400,
        basedOnPoints: daily.length,
        cpu: stamp(forecast.dailyForecast(daily.map((p) => p.cpu), days)),
        memory: stamp(forecast.dailyForecast(daily.map((p) => p.memory), days)),
        gpu: stamp(forecast.dailyForecast(daily.map((p) => p.gpu), days)),
        disk: forecast.diskForecast(diskPoints, diskTotal)
    };
    longCache = { key, at: Date.now(), value };
    return value;
}

// How far back the stored samples go, and with the daily summaries (what a forecast more than 2 days ahead uses)
async function sampleHistory() {
    const rows = await all('SELECT UNIX_TIMESTAMP(MIN(sampled_at)) * 1000 AS oldest FROM hardware_samples', []);
    const oldest = rows[0] && rows[0].oldest !== null && rows[0].oldest !== undefined ? Number(rows[0].oldest) : null;
    const days = await dailyStore.summary();
    const firstDay = days.oldest ? Date.parse(`${days.oldest}T00:00:00Z`) : null;
    const known = [oldest, firstDay].filter((t) => t !== null);
    const longOldest = known.length ? Math.min(...known) : null;
    const hoursSince = (t) => (t === null ? 0 : Math.max(0, (Date.now() - t) / 3600000));
    return { oldest, hours: hoursSince(oldest), longOldest, longHours: hoursSince(longOldest) };
}

// The horizon check plus the dates the page shows: the oldest sample and when the forecast becomes dependable
// A forecast more than 2 days ahead reads the daily summaries, which are never deleted: only waiting makes it dependable
function describeCheck(current, history) {
    const long = forecast.usesDailyAverages(current.forecastHours);
    const oldest = long ? history.longOldest : history.oldest;
    const check = forecast.horizonCheck({ horizonHours: current.forecastHours, historyHours: long ? history.longHours : history.hours, retentionDays: current.retentionDays, keptForGood: long });
    const start = oldest === null ? Date.now() : oldest;
    return {
        ...check,
        oldestAt: oldest === null ? null : new Date(oldest).toISOString(),
        dependableAt: check.reason === 'history' ? new Date(start + current.forecastHours * 3600000).toISOString() : null
    };
}

// <Jun Kai start> "24" -> 24: how far ahead the graph asks to forecast (its Past / Forecast switch, 17 Nov 2026), within
// the limits of the saved forecast length (1 hour to 1 year); the saved length when it is left out, null when it is wrong
function readHorizon(value, saved) {
    if (value === undefined || value === '') return saved;
    if (!/^\d{1,5}$/.test(String(value))) return null;
    const hours = Number(value);
    const [min, max] = settings.LIMITS.forecastHours;
    return hours >= min && hours <= max ? hours : null;
}
// <Jun Kai end>

async function buildForecast(current) {
    const body = forecast.usesDailyAverages(current.forecastHours) ? await dailyForecast(current) : await stepForecast(current.forecastHours);
    return { ...body, horizonHours: current.forecastHours, check: describeCheck(current, await sampleHistory()) };
}

router.get('/overview', auth.requireAuth, async (req, res) => {
    try {
        const status = sampler.getStatus();
        let latest = status.lastSample;
        if (!latest) {
            const rows = await all('SELECT UNIX_TIMESTAMP(sampled_at) * 1000 AS t, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, disk_percent, disk_used_gb, disk_total_gb, gpu_percent, gpu_memory_used_mb, gpu_memory_total_mb FROM hardware_samples ORDER BY sampled_at DESC LIMIT 1', []);
            const r = rows[0];
            if (r) {
                latest = {
                    at: new Date(Number(r.t)).toISOString(),
                    cpu: r.cpu_percent === null ? null : Number(r.cpu_percent),
                    memory: { percent: Number(r.memory_percent), usedMb: r.memory_used_mb, totalMb: r.memory_total_mb },
                    disk: { percent: Number(r.disk_percent), usedGb: Number(r.disk_used_gb), totalGb: Number(r.disk_total_gb) },
                    gpu: r.gpu_percent === null ? null : { percent: Number(r.gpu_percent), memoryUsedMb: r.gpu_memory_used_mb, memoryTotalMb: r.gpu_memory_total_mb }
                };
            }
        }
        const counts = await all('SELECT COUNT(*) AS total, SUM(sampled_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY) AS day, UNIX_TIMESTAMP(MIN(sampled_at)) * 1000 AS oldest FROM hardware_samples', []);
        const oldest = counts[0].oldest === null || counts[0].oldest === undefined ? null : new Date(Number(counts[0].oldest)).toISOString();
        const days = await dailyStore.summary();
        res.json({ success: true, overview: { latest, sampler: { ...status, lastSample: undefined }, machine: { cpu: cpuInfo() }, settings: settings.read(), limits: settings.LIMITS, alerts: settings.readAlerts(), alertLimits: settings.ALERT_LIMITS, alertDefaults: settings.ALERT_DEFAULTS, stored: { total: Number(counts[0].total), last24h: Number(counts[0].day || 0), oldestAt: oldest, daily: days }, serverTime: new Date().toISOString() } });
    } catch (error) { fail(res, error, 'overview'); }
});

// <Jun Kai start> CPU, memory and disk read now, the GPU every few seconds; nothing is stored (live.js)
router.get('/live', auth.requireAuth, async (req, res) => {
    try {
        res.json({ success: true, live: await live.read(sampler.getStatus()) });
    } catch (error) { fail(res, error, 'live reading'); }
});
// <Jun Kai end>

router.get('/series', auth.requireAuth, async (req, res) => {
    try {
        const range = ranges.parse(req.query.range === undefined ? '24h' : req.query.range);
        if (!range) return res.status(400).json({ success: false, error: 'range must be 1 hour to 5 years, written like 12h, 10d, 3w, 6mo or 2y' });
        const current = settings.read();
        // <Jun Kai start>
        const horizon = readHorizon(req.query.horizon, current.forecastHours);
        if (horizon === null) return res.status(400).json({ success: false, error: 'horizon must be a whole number of hours from 1 to 8760 (1 year)' });
        // <Jun Kai end>
        const long = range.bucketSeconds >= 86400 || range.seconds > current.retentionDays * 86400;
        const bucketSeconds = long ? Math.max(range.bucketSeconds, 86400) : range.bucketSeconds;
        const points = long ? await longRows(range.seconds, bucketSeconds) : await bucketedRows(range.seconds, bucketSeconds);
        res.json({ success: true, range: range.key, seconds: range.seconds, bucketSeconds, source: long ? 'daily' : 'samples', points, forecast: await buildForecast({ ...current, forecastHours: horizon }), serverTime: new Date().toISOString() }); // <Jun Kai/>
    } catch (error) { fail(res, error, 'series'); }
});

router.get('/settings', auth.requireAuth, (req, res) => {
    res.json({ success: true, settings: settings.read(), limits: settings.LIMITS, alerts: settings.readAlerts(), alertLimits: settings.ALERT_LIMITS, alertDefaults: settings.ALERT_DEFAULTS });
});

router.put('/settings', auth.requireAdmin, (req, res) => { // <Jun Kai/> System Admin only, like its page
    const result = settings.validate(req.body);
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    try {
        settings.write(result.settings);
        sampler.applySettings(result.settings);
        res.json({ success: true, settings: result.settings });
    } catch (error) { fail(res, error, 'settings save'); }
});

// PUT /api/admin/hardware/alert-lines  (System Admin) { alerts: { cpu: { warn, critical }, memory, gpu, disk } }; a part
// left out keeps its line. 400 names the field ("disk.critical") so the page can mark it.
router.put('/alert-lines', auth.requireAdmin, (req, res) => {
    const result = settings.validateAlerts(req.body && req.body.alerts);
    if (result.error) return res.status(400).json({ success: false, error: result.error, field: result.field });
    try {
        settings.writeAlerts(result.alerts);
        logAudit('HARDWARE_ALERT_LINES_UPDATE', req.session.user.username, 'hardware', null, req);
        res.json({ success: true, alerts: result.alerts });
    } catch (error) { fail(res, error, 'alert lines save'); }
});

module.exports = router;
// <Jun Kai end>
