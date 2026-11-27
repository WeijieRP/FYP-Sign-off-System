// Owner: Role 3, Jun Kai.
// Anomaly detectors behind the Incidents panel of the System Health page: plain statistics on the PC's own
// samples, health checks, tablet heartbeats and server logs (median/MAD z-scores, CUSUM, the disk forecast, counts).
// Pure functions with no clock, database or network, unit-tested in tests/unit/aiopsDetectors.test.js.
// <Jun Kai start>
const crypto = require('crypto');
const forecast = require('../hardware/forecast');

const K = { 1: 6, 2: 4.5, 3: 3.5, 4: 2.8, 5: 2.2 };          // robust z threshold
const H = { 1: 8, 2: 6.5, 3: 5, 4: 4, 5: 3 };                // CUSUM limit, in sigmas
const D = { 1: 3, 2: 7, 3: 14, 4: 21, 5: 30 };               // disk: days until full
const M = { 1: 30, 2: 20, 3: 10, 4: 5, 5: 3 };               // tablets: minutes without a heartbeat
const B = { 1: 15, 2: 10, 3: 6, 4: 4, 5: 3 };                // logs: errors in 5 minutes
const FLOORS = { cpu: 60, memory: 80, gpu: 60 };
const DRIFT_FLOORS = { cpu: 60, memory: 80, gpu: 60, disk: 70 };
const SEVERITY_ORDER = ['info', 'warn', 'critical'];
const DETECTOR_KEYS = ['spike', 'timeOfDay', 'drift', 'disk', 'services', 'tablets', 'logs'];
const SERVICES = {
    database: { severity: 'critical', title: 'Database down', what: 'the MySQL database' },
    kiosk: { severity: 'critical', title: 'Kiosk server down', what: 'the kiosk server' },
    email: { severity: 'warn', title: 'Mail login failing', what: 'the mail account' }
};
const LABEL = { cpu: 'CPU', memory: 'Memory', gpu: 'GPU', disk: 'Disk' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SGT_OFFSET = 8 * HOUR;
const MAX_POINTS = 60;
const MIN_BASELINE_HOURS = 2;
const MIN_BASELINE_DAYS = 3;
const WEEKDAY_SPAN_DAYS = 13.5;
const MIN_DRIFT_POINTS = 12;
const SIGMA_FLOOR = 1;
const LATENCY_FLOOR_MS = 500;
const MIN_LATENCY_HISTORY = 6;
const LOG_BUCKET_MS = 5 * MINUTE;
const NOVELTY_WINDOW_MS = 10 * MINUTE;
const SETTLE_SECONDS = 15 * 60; // after a start or a wake-up from hibernation the hardware readings settle first

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (n) => `${Math.round(n)} %`;
const pad = (n) => String(n).padStart(2, '0');
const sens = (s) => Math.min(5, Math.max(1, Math.round(Number(s) || 3)));
const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);
const label = (metric) => LABEL[metric] || metric;
const isAnomaly = (result) => Boolean(result && result.detector);
const learning = (note) => ({ state: 'learning', learning: true, note });
const noData = (note) => ({ state: 'no-data', learning: false, note });

// Date, ms number or ISO string -> ms (NaN when unreadable)
function toMs(t) {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number') return t;
    return Date.parse(t);
}

// finite { t, v } points only, oldest first
function clean(series) {
    return series.filter((p) => p && Number.isFinite(p.v) && Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
}

// at most max points, picked evenly; the first and the last are always kept
function thin(points, max = MAX_POINTS) {
    const list = points.map((p) => ({ t: p.t, v: round1(p.v) }));
    if (list.length <= max) return list;
    const out = [];
    for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
    return out;
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const stdDev = (values) => {
    const m = mean(values);
    return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
};

function median(values) {
    if (!values.length) return null;
    const sorted = Float64Array.from(values).sort(); // a typed array sorts by number, and far faster than a comparator
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// median absolute deviation: the typical distance from the median (m: the median, when the caller already has it)
function mad(values, m = median(values)) {
    if (m === null) return null;
    return median(values.map((v) => Math.abs(v - m)));
}

// z = (value - median) / MAD; a MAD of 0 (flat baseline) counts as a spread of 1
function robustZ(value, values) {
    const m = median(values);
    if (m === null) return { z: null, median: null, mad: null };
    const spread = mad(values, m);
    return { z: (value - m) / (spread || 1), median: m, mad: spread };
}

// mean of the samples with fromMs <= t <= toMs (null values skipped)
function windowMean(series, fromMs, toMs) {
    let sum = 0;
    let count = 0;
    for (const p of series) {
        if (!p || !Number.isFinite(p.v) || p.t < fromMs || p.t > toMs) continue;
        sum += p.v;
        count++;
    }
    return { mean: count ? sum / count : null, count };
}

const sgtHour = (t) => new Date(toMs(t) + SGT_OFFSET).getUTCHours();
const sgtWeekday = (t) => new Date(toMs(t) + SGT_OFFSET).getUTCDay();
const sgtDayKey = (t) => Math.floor((toMs(t) + SGT_OFFSET) / DAY);
const sgtTime = (t) => {
    const d = new Date(toMs(t) + SGT_OFFSET);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const hoursText = (h) => (h < 1 ? 'under an hour' : h < 1.5 ? 'about an hour' : `${Math.round(h)} hours`);
const daysText = (d) => (d < 1 ? 'less than a day' : d === 1 ? '1 day' : `${d} days`);
const minutesText = (seconds) => `${Math.round(seconds / 60)} minutes`;
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
function durationText(seconds) {
    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    if (minutes < 24 * 60) {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m ? `${h} h ${m} min` : `${h} h`;
    }
    const days = Math.floor(minutes / (24 * 60));
    const h = Math.round((minutes % (24 * 60)) / 60);
    return h ? `${days} d ${h} h` : `${days} d`;
}
function listText(names) {
    const shown = names.slice(0, 5);
    const rest = names.length - shown.length;
    const text = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
    return rest > 0 ? `${text} and ${rest} more` : text;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// old console messages start with an emoji; incident texts quote the words only
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*/gu;
const QUOTED = /"[^"\n]{0,300}"|(?<!\w)'[^'\n]{0,300}'(?!\w)/g;
const WIN_PATH = /(?<![A-Za-z])[A-Za-z]:[\\/][^\s"'`<>|()[\]{},;:]*/g;
const POSIX_PATH = /(?<![\w.:/\\])\/(?:[\w.@%+-]+\/)+[\w.@%+-]*/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_ID = /\b(?:0x[0-9a-f]+|(?=[0-9a-f]*[a-f])[0-9a-f]{8,})\b/gi;
const ISO_TIME = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\b/g;
const NUMBER = /\d+(?:\.\d+)?/g;

// "Cannot open 'C:\x\y.txt' (code 42)" -> 'Cannot open "..." (code #)': the same kind of message always gives
// the same template, so the log detector can count and recognise it
function templateOf(message) {
    return String(message === undefined || message === null ? '' : message)
        .replace(EMOJI, '')
        .replace(EMAIL, '<email>')
        .replace(QUOTED, '"..."')
        .replace(WIN_PATH, '<path>')
        .replace(POSIX_PATH, '<path>')
        .replace(UUID, '<id>')
        .replace(HEX_ID, '<id>')
        .replace(ISO_TIME, '#')
        .replace(NUMBER, '#')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

const templateHash = (template) => crypto.createHash('sha1').update(template).digest('hex').slice(0, 10);

function anomaly(detector, kind, subject, severity, title, explanation, evidence) {
    const id = subject === undefined || subject === null ? null : String(subject);
    return {
        detector, kind, subject: id,
        fingerprint: `${detector}:${kind}:${id || '-'}`,
        severity, title: cut(title, 80), explanation, evidence: evidence || {}
    };
}

// "(usual swing ± 4 %), so this is 19 times its usual swing above normal" for the explanations; the Incidents panel and
// its settings say "usual swing" for the same number (the median absolute deviation)
function spreadText(stats, unit = '%') {
    if (!stats.mad) return '(it almost never moves), so this is far above normal';
    return `(usual swing ± ${round1(stats.mad)} ${unit}), so this is ${Math.round(stats.z)} times its usual swing above normal`;
}

// Shared by the spike and time-of-day detectors: the window mean must be over the floor and K spreads over the
// baseline, and at least 60 % of the window's samples (3 or more) must be over that line themselves.
function compare(recent, baselineValues, metric, sensitivity) {
    const k = K[sens(sensitivity)];
    const floor = FLOORS[metric] === undefined ? 0 : FLOORS[metric];
    const value = mean(recent.map((p) => p.v));
    const stats = robustZ(value, baselineValues);
    const line = Math.max(floor, stats.median + k * (stats.mad || 1));
    const above = recent.filter((p) => p.v > line).length;
    const sustained = recent.length >= 3 && above >= 0.6 * recent.length;
    const fires = value >= floor && stats.z >= k && sustained;
    const severity = stats.z >= 2 * k || value >= 95 ? 'critical' : 'warn';
    return { value, stats, fires, severity, above };
}

// series: 24 h of raw samples. The last window (max 5 min, 3 x the sampler interval) against the median/MAD of
// the 24 h before it.
function detectSpike({ series, metric, now, sensitivity, intervalSeconds }) {
    const nowMs = toMs(now);
    const points = clean(series || []);
    if (!points.length) return noData(`No ${label(metric)} samples yet`);
    const windowSeconds = Math.max(300, 3 * (Number(intervalSeconds) || 60));
    const windowMs = windowSeconds * 1000;
    const baseline = points.filter((p) => p.t >= nowMs - DAY && p.t < nowMs - windowMs);
    const spanHours = baseline.length ? (baseline[baseline.length - 1].t - baseline[0].t) / HOUR : 0;
    if (spanHours < MIN_BASELINE_HOURS || baseline.length < 6) {
        return learning(`Needs ${MIN_BASELINE_HOURS} hours of samples (has ${round1(spanHours)} h)`);
    }
    const recent = points.filter((p) => p.t >= nowMs - windowMs && p.t <= nowMs);
    if (!recent.length) return null;
    const result = compare(recent, baseline.map((p) => p.v), metric, sensitivity);
    if (!result.fires) return null;
    const { value, stats } = result;
    return anomaly('spike', 'high', metric, result.severity,
        `${label(metric)} at ${pct(value)}, far above the usual ${pct(stats.median)}`,
        `${label(metric)} use averaged ${pct(value)} over the last ${minutesText(windowSeconds)}. Over the past 24 hours the typical level was ${pct(stats.median)} ${spreadText(stats)}.`,
        {
            metric, value: round1(value), baseline: round1(stats.median), spread: round1(stats.mad), z: round1(stats.z), unit: '%',
            windowSeconds, samples: recent.length, above: result.above,
            points: thin(points.filter((p) => p.t >= nowMs - 2 * HOUR))
        });
}

// series: up to 14 days of samples of the same Singapore hour as now. The last 15 minutes against the earlier days
// of that hour; once 14 days are in and 3 days of the same weekday, against that weekday only.
function detectTimeOfDay({ series, metric, now, sensitivity, intervalSeconds }) {
    const nowMs = toMs(now);
    const points = clean(series || []);
    if (!points.length) return noData(`No ${label(metric)} samples for this hour yet`);
    const today = sgtDayKey(nowMs);
    const earlier = points.filter((p) => sgtDayKey(p.t) < today);
    const days = new Set(earlier.map((p) => sgtDayKey(p.t)));
    if (days.size < MIN_BASELINE_DAYS) return learning(`Needs ${MIN_BASELINE_DAYS} days of samples for this hour (has ${days.size})`);
    const weekday = sgtWeekday(nowMs);
    const spanDays = (nowMs - points[0].t) / DAY;
    const sameWeekday = earlier.filter((p) => sgtWeekday(p.t) === weekday);
    const weekdayDays = new Set(points.filter((p) => sgtWeekday(p.t) === weekday).map((p) => sgtDayKey(p.t)));
    const useWeekday = spanDays >= WEEKDAY_SPAN_DAYS && weekdayDays.size >= MIN_BASELINE_DAYS && sameWeekday.length >= 3;
    const baseline = useWeekday ? sameWeekday : earlier;
    const windowSeconds = Math.max(900, 3 * (Number(intervalSeconds) || 60));
    const recent = points.filter((p) => p.t >= nowMs - windowSeconds * 1000 && p.t <= nowMs);
    if (!recent.length) return null;
    const result = compare(recent, baseline.map((p) => p.v), metric, sensitivity);
    if (!result.fires) return null;
    const { value, stats } = result;
    const hour = sgtHour(nowMs);
    const hourText = `${pad(hour)}:00`;
    const baselineDays = useWeekday ? new Set(sameWeekday.map((p) => sgtDayKey(p.t))).size : days.size;
    const when = useWeekday ? `On the ${baselineDays} earlier ${WEEKDAYS[weekday]}s` : `On the ${baselineDays} earlier days`;
    const byDay = new Map();
    for (const p of earlier) {
        const b = byDay.get(sgtDayKey(p.t)) || { t: p.t, sum: 0, n: 0 };
        b.sum += p.v;
        b.n++;
        byDay.set(sgtDayKey(p.t), b);
    }
    const dayPoints = [...byDay.values()].map((b) => ({ t: b.t, v: b.sum / b.n })).concat([{ t: recent[0].t, v: value }]);
    return anomaly('timeOfDay', 'unusual', metric, result.severity,
        useWeekday
            ? `${label(metric)} at ${pct(value)}, usually ${pct(stats.median)} on ${WEEKDAYS[weekday]}s at ${hourText}`
            : `${label(metric)} at ${pct(value)}, usually ${pct(stats.median)} at ${hourText}`,
        `${label(metric)} use averaged ${pct(value)} over the last ${minutesText(windowSeconds)}. ${when} with samples, this hour (${hourText} to ${pad((hour + 1) % 24)}:00 Singapore time) usually ran at ${pct(stats.median)} ${spreadText(stats)}.`,
        {
            metric, value: round1(value), baseline: round1(stats.median), spread: round1(stats.mad), z: round1(stats.z), unit: '%',
            windowSeconds, samples: recent.length, above: result.above, hour, baselineKind: useWeekday ? 'weekday' : 'hour',
            baselineDays, points: thin(dayPoints)
        });
}

// series: evenly spaced means (memory: 10-minute means over 24 h; disk: hourly % over 7 days). CUSUM against the
// mean of the first third; fires when the cumulative rise passes H sigmas, the fitted slope is up and the level
// is over the floor.
function detectDrift({ series, metric, now, sensitivity }) {
    const points = clean(series || []);
    if (!points.length) return noData(`No ${label(metric)} averages yet`);
    if (points.length < MIN_DRIFT_POINTS) return learning(`Needs ${MIN_DRIFT_POINTS} averages to see a trend (has ${points.length})`);
    const values = points.map((p) => p.v);
    const third = values.slice(0, Math.max(2, Math.floor(values.length / 3)));
    const mu0 = mean(third);
    const sigma = Math.max(SIGMA_FLOOR, stdDev(third));
    const k = 0.5 * sigma;
    const h = H[sens(sensitivity)] * sigma;
    let s = 0;
    let runStart = 0;
    for (let i = 0; i < values.length; i++) {
        s = Math.max(0, s + values[i] - mu0 - k);
        if (s === 0) runStart = i + 1;
    }
    const run = points.slice(Math.min(runStart, points.length - 1));
    const fit = forecast.linearTrend(run.length >= 3 ? run : points);
    const slopePerHour = fit ? fit.slope * HOUR : 0;
    const last = values[values.length - 1];
    const floor = DRIFT_FLOORS[metric] === undefined ? 70 : DRIFT_FLOORS[metric];
    if (s <= h || slopePerHour <= 0 || last < floor) return null;
    const hours = (points[points.length - 1].t - run[0].t) / HOUR;
    const from = run[0].v;
    return anomaly('drift', 'rising', metric, 'warn',
        `${label(metric)} creeping up: ${pct(last)}, about ${round1(slopePerHour)} % per hour for ${hoursText(hours)}`,
        `${label(metric)} has risen about ${round1(slopePerHour)} % per hour for ${hoursText(hours)}, from about ${pct(from)} to ${pct(last)}. This is a steady climb rather than a brief spike.`,
        {
            metric, value: round1(last), baseline: round1(mu0), slopePerHour: round1(slopePerHour), hours: round1(hours),
            cusum: round1(s), limit: round1(h), unit: '%', points: thin(points)
        });
}

// points: 30 days of hourly used GB; percent: disk_percent now. Straight-line forecast from forecast.diskForecast,
// trusted once the points span a day; the percent rules need no history.
function detectDisk({ points, totalGb, percent, sensitivity }) {
    const list = clean(points || []);
    const total = Number(totalGb) > 0 ? Number(totalGb) : null;
    const last = list.length ? list[list.length - 1] : null;
    const given = percent === null || percent === undefined || percent === '' ? NaN : Number(percent);
    const percentNow = Number.isFinite(given) ? given : last && total ? (last.v / total) * 100 : null;
    if (percentNow === null) return noData('No disk samples yet');
    const fit = list.length >= 2 && total ? forecast.diskForecast(list, total) : null;
    const ready = Boolean(fit && fit.spanDays >= 1);
    const usedGb = last ? last.v : total ? (percentNow / 100) * total : null;
    const usedText = usedGb !== null && total ? ` (${Math.round(usedGb)} of ${Math.round(total)} GB)` : '';
    const growth = !ready ? ''
        : fit.daysUntilFull !== null ? ` At the current growth of ${fit.gbPerDay} GB per day it will be full in about ${daysText(fit.daysUntilFull)}.`
            : ` Disk use has not been growing over the last ${Math.round(fit.spanDays)} days.`;
    const evidence = {
        metric: 'disk', value: usedGb === null ? null : round1(usedGb), unit: 'GB', percent: round1(percentNow), totalGb: total,
        gbPerDay: ready ? fit.gbPerDay : null, daysUntilFull: ready ? fit.daysUntilFull : null, spanDays: fit ? fit.spanDays : 0,
        points: thin(list)
    };
    if (percentNow >= 90) {
        return anomaly('disk', 'full', null, percentNow >= 95 ? 'critical' : 'warn', `Disk ${pct(percentNow)} full`,
            `The disk is ${pct(percentNow)} full${usedText}.${growth}`, evidence);
    }
    if (!ready) {
        const hours = list.length >= 2 ? round1((last.t - list[0].t) / HOUR) : 0;
        return learning(`Needs a day of disk samples to forecast (has ${hours} h)`);
    }
    if (fit.daysUntilFull !== null && fit.daysUntilFull <= D[sens(sensitivity)]) {
        return anomaly('disk', 'filling', null, 'warn',
            `Disk full in about ${daysText(fit.daysUntilFull)} at ${fit.gbPerDay} GB per day`,
            `Disk use grew by about ${fit.gbPerDay} GB per day over the last ${daysText(Math.round(fit.spanDays))}. It is ${pct(percentNow)} full now${usedText}, so at that rate it will be full in about ${daysText(fit.daysUntilFull)}.`,
            evidence);
    }
    return null;
}

// runs: health check runs, oldest first. A service is down when its last two results say so (one run alone is not
// enough); the database is also slow when its latest latency is over 500 ms and far above the last 24 hours.
function detectServices({ runs, now, sensitivity, quiet }) {
    const nowMs = toMs(now);
    const list = (runs || [])
        .map((run) => ({ at: toMs(run.at), results: Array.isArray(run.results) ? run.results : [] }))
        .filter((run) => Number.isFinite(run.at))
        .sort((a, b) => a.at - b.at);
    const out = [];
    const historyOf = (key) => list
        .map((run) => ({ at: run.at, result: run.results.find((r) => r && r.key === key) }))
        .filter((entry) => entry.result);
    for (const key of Object.keys(SERVICES)) {
        if (key === 'kiosk' && quiet) continue;
        const history = historyOf(key);
        if (history.length < 2) continue;
        if (!history.slice(-2).every((entry) => entry.result.status === 'down')) continue;
        let n = 0;
        while (n < history.length && history[history.length - 1 - n].result.status === 'down') n++;
        const since = history[history.length - n].at;
        const latest = history[history.length - 1].result;
        const summary = cut(String(latest.summary || ''), 140);
        const service = SERVICES[key];
        out.push(anomaly('services', 'down', key, service.severity, `${service.title} (${n} checks in a row)`,
            `The health check could not reach ${service.what} in the last ${n} runs, since ${sgtTime(since)} Singapore time.${summary ? ` Last message: ${summary}` : ''}`,
            { metric: key, status: 'down', runs: n, since: new Date(since).toISOString(), summary }));
    }
    const latency = historyOf('database')
        .filter((entry) => entry.at >= nowMs - DAY && Number.isFinite(Number(entry.result.latencyMs)))
        .map((entry) => ({ t: entry.at, v: Number(entry.result.latencyMs), status: entry.result.status }));
    if (latency.length > MIN_LATENCY_HISTORY) {
        const latest = latency[latency.length - 1];
        const stats = robustZ(latest.v, latency.slice(0, -1).map((p) => p.v));
        if (latest.status !== 'down' && latest.v >= LATENCY_FLOOR_MS && stats.z >= K[sens(sensitivity)]) {
            out.push(anomaly('services', 'slow', 'database', 'warn',
                `Database slow: ${Math.round(latest.v)} ms, usually ${Math.round(stats.median)} ms`,
                `The latest health check took ${Math.round(latest.v)} ms to query the database. Over the last 24 hours the checks usually took ${Math.round(stats.median)} ms ${spreadText(stats, 'ms')}.`,
                {
                    metric: 'database_latency', value: round1(latest.v), baseline: round1(stats.median), spread: round1(stats.mad),
                    z: round1(stats.z), unit: 'ms', points: thin(latency)
                }));
        }
    }
    return out;
}

const namedTablets = (devices) => (devices || []).filter((d) => d && typeof d.name === 'string' && d.name.trim() !== '');

// devices: [{ device_id, name, seconds_ago }] from the heartbeats. Only named tablets count; all of them silent
// (2 or more) is one critical incident, otherwise one warning per tablet. Nothing while the kiosk should be off.
// watchSeconds: how long the PC has been awake with the kiosk meant to be on. A tablet only counts as offline once it
// has been quiet for the limit within that time, so a night in hibernation does not turn every tablet into
// "offline for 15 hours" the moment the PC wakes up. Unknown (null) means no such cap.
function detectTablets({ devices, now, sensitivity, quiet, watchSeconds }) {
    if (quiet) return [];
    const limitMinutes = M[sens(sensitivity)];
    const watched = watchSeconds === null || watchSeconds === undefined || !Number.isFinite(Number(watchSeconds)) ? Infinity : Number(watchSeconds);
    const named = namedTablets(devices);
    const offline = named.filter((d) => Number.isFinite(Number(d.seconds_ago)) && Math.min(Number(d.seconds_ago), watched) > limitMinutes * 60);
    if (!offline.length) return [];
    if (named.length >= 2 && offline.length === named.length) {
        const newest = Math.min(...offline.map((d) => Number(d.seconds_ago)));
        const names = offline.map((d) => d.name.trim());
        return [anomaly('tablets', 'all-offline', null, 'critical', `All ${named.length} named tablets offline`,
            `None of the ${named.length} named tablets (${listText(names)}) has reported for more than ${limitMinutes} minutes. The most recent report was ${durationText(newest)} ago.`,
            { metric: 'seconds_ago', value: round1(newest / 60), unit: 'min', limitMinutes, count: named.length, names })];
    }
    return offline.map((d) => {
        const seconds = Number(d.seconds_ago);
        const name = d.name.trim();
        // a name such as "Tablet 9" already says what it is
        const shown = /^tablet\b/i.test(name) ? cut(name, 36) : `Tablet ${cut(name, 30)}`;
        return anomaly('tablets', 'offline', d.device_id, 'warn', `${shown} offline for ${durationText(seconds)}`,
            `${/^tablet\b/i.test(name) ? name : `The tablet ${name}`} last reported ${durationText(seconds)} ago. A named tablet that is quiet for more than ${limitMinutes} minutes counts as offline at this sensitivity.`,
            { metric: 'seconds_ago', value: round1(seconds / 60), unit: 'min', limitMinutes, name, device_id: d.device_id });
    });
}

const processText = (name) => (name === 'kiosk' ? 'The kiosk server' : name === 'server' ? 'The admin server' : 'The server');

// events: warn/error lines of the last 24 h from both processes. Burst: errors in the last 5 minutes against the
// median 5-minute count. Novelty: a template first seen in the last 10 minutes (not in `known`, the 7 days before
// this window, and not earlier in it), once 24 h of log history exist.
function detectLogs({ events, now, sensitivity, known, historyHours }) {
    const nowMs = toMs(now);
    const s = sens(sensitivity);
    const list = (events || [])
        .map((e) => ({ ...e, t: toMs(e.at) }))
        .filter((e) => Number.isFinite(e.t) && e.t <= nowMs && (e.level === 'error' || e.level === 'warn'));
    const templates = new Set();
    for (const e of list) {
        e.template = templateOf(e.message);
        templates.add(e.template);
    }
    const anomalies = [];
    const history = Number(historyHours);
    const hours = Number.isFinite(history) && history > 0 ? Math.min(24, history) : 24;
    const bucketCount = Math.max(1, Math.ceil(hours * (HOUR / LOG_BUCKET_MS)));
    const counts = new Array(bucketCount).fill(0); // index 0 = the last 5 minutes
    const recentErrors = [];
    for (const e of list) {
        if (e.level !== 'error') continue;
        const i = Math.floor((nowMs - e.t) / LOG_BUCKET_MS);
        if (i < 0 || i >= bucketCount) continue;
        counts[i]++;
        if (i === 0) recentErrors.push(e);
    }
    const others = counts.slice(1);
    const typical = others.length ? median(others) : 0;
    if (counts[0] >= B[s] && counts[0] >= 3 * typical) {
        const byTemplate = new Map();
        for (const e of recentErrors) byTemplate.set(e.template, (byTemplate.get(e.template) || 0) + 1);
        const top = [...byTemplate.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
        const points = counts.map((v, i) => ({ t: nowMs - (i + 1) * LOG_BUCKET_MS, v })).reverse();
        const span = hours < 1 ? 'so far' : hours < 1.5 ? 'of the last hour' : `of the last ${Math.round(hours)} hours`;
        anomalies.push(anomaly('logs', 'burst', null, counts[0] >= 3 * B[s] ? 'critical' : 'warn',
            `${counts[0]} server errors in 5 minutes`,
            `The servers logged ${counts[0]} errors in the last 5 minutes; a normal 5-minute slice ${span} has ${typical}. Most common: ${top.map(([template, n]) => `"${cut(template, 80)}" (${n})`).join(', ')}.`,
            {
                metric: 'errors', value: counts[0], baseline: typical, unit: 'errors', windowSeconds: LOG_BUCKET_MS / 1000,
                top: top.map(([template, n]) => ({ template, count: n })), points: thin(points)
            }));
    }
    let note = null;
    if (!(Number.isFinite(history) && history >= 24)) {
        note = `Learning the usual log messages: needs 24 hours of log history (has ${round1(Number.isFinite(history) ? history : 0)} h)`;
    } else {
        const seen = new Set(known || []);
        const since = nowMs - NOVELTY_WINDOW_MS;
        for (const e of list) if (e.t <= since) seen.add(e.template);
        const fresh = new Map();
        for (const e of list) {
            if (e.t <= since || seen.has(e.template)) continue;
            const f = fresh.get(e.template) || { template: e.template, level: e.level, process: e.process, count: 0, first: e.t };
            f.count++;
            if (e.level === 'error') f.level = 'error';
            fresh.set(e.template, f);
        }
        for (const f of fresh.values()) {
            const kind = f.level === 'error' ? 'error' : 'warning';
            anomalies.push(anomaly('logs', 'new', templateHash(f.template), 'info', `New ${kind}: ${cut(f.template, 60)}`,
                `${processText(f.process)} logged a kind of ${kind} not seen in the last 7 days: "${f.template}". It appeared ${times(f.count)} in the last 10 minutes.`,
                { metric: 'template', value: f.count, template: f.template, level: f.level, process: f.process || null, firstSeen: new Date(f.first).toISOString() }));
        }
    }
    return { anomalies, templates, learning: note !== null, note };
}

// 'ok' when any metric was fully checked, else 'learning' when any is learning, else 'no-data'
function combine(results) {
    const anomalies = results.map((r) => r.result).filter(isAnomaly);
    const states = results.map((r) => (isAnomaly(r.result) || r.result === null ? 'ok' : r.result.state));
    const state = states.includes('ok') ? 'ok' : states.includes('learning') ? 'learning' : 'no-data';
    const pending = results.find((r) => r.result && !isAnomaly(r.result) && r.result.state === state);
    return { anomalies, state, note: state === 'ok' || !pending ? null : `${label(pending.metric)}: ${pending.result.note}` };
}

// input: see the Interfaces section of the design (now, intervalSeconds, samples, hourSeries, driftSeries, disk,
// health, tablets, logs, quiet); settings.detectors[key] = { enabled, sensitivity }. Never throws: a detector that
// crashes gets state 'error' and its message in notes.
function runAll(input, settings) {
    const data = input || {};
    const now = Number.isFinite(toMs(data.now)) ? toMs(data.now) : Date.now();
    const config = (settings && settings.detectors) || {};
    const intervalSeconds = Number(data.intervalSeconds) || Number(settings && settings.intervalSeconds) || 60;
    const quiet = data.quiet === true;
    // awakeSeconds: time since the server started or the PC woke up (null when unknown)
    const awake = data.awakeSeconds === null || data.awakeSeconds === undefined ? NaN : Number(data.awakeSeconds);
    const settling = Number.isFinite(awake) && awake < SETTLE_SECONDS;
    const settleNote = `The PC started or woke up ${Math.max(0, Math.round(awake / 60))} min ago; hardware readings are left to settle for ${SETTLE_SECONDS / 60} minutes`;
    const anomalies = [];
    const states = {};
    const notes = {};
    const held = [];   // fingerprint prefixes nothing looked at in this check: their open incidents stay as they are
    const closed = []; // prefixes of detectors that are switched off: their open incidents are closed
    const metrics = (group, keys, detect, sensitivity) => combine(keys.map((metric) => ({
        metric, result: detect({ series: (group || {})[metric], metric, now, sensitivity, intervalSeconds })
    })));
    const runners = {
        spike: (sensitivity) => (settling
            ? { anomalies: [], state: 'muted', note: settleNote, held: ['spike:'] }
            : metrics(data.samples, ['cpu', 'memory', 'gpu'], detectSpike, sensitivity)),
        timeOfDay: (sensitivity) => (settling
            ? { anomalies: [], state: 'muted', note: settleNote, held: ['timeOfDay:'] }
            : metrics(data.hourSeries, ['cpu', 'memory', 'gpu'], detectTimeOfDay, sensitivity)),
        drift: (sensitivity) => metrics(data.driftSeries, ['memory', 'disk'], detectDrift, sensitivity),
        disk: (sensitivity) => combine([{ metric: 'disk', result: detectDisk({ ...(data.disk || {}), sensitivity }) }]),
        services: (sensitivity) => {
            const runs = (data.health && data.health.runs) || [];
            const found = detectServices({ runs, now, sensitivity, quiet });
            if (!runs.length) return { anomalies: found, state: 'no-data', note: 'No health check runs yet', held: ['services:'] };
            if (runs.length < 2) return { anomalies: found, state: 'learning', note: 'Needs 2 health check runs (has 1)', held: ['services:'] };
            const kioskHeld = quiet ? ['services:down:kiosk'] : [];
            if (quiet && !found.length) return { anomalies: found, state: 'muted', note: 'Kiosk server check muted in quiet hours; database and mail still watched', held: kioskHeld };
            return { anomalies: found, state: 'ok', note: null, held: kioskHeld };
        },
        tablets: (sensitivity) => {
            const devices = (data.tablets && data.tablets.devices) || [];
            const found = detectTablets({ devices, now, sensitivity, quiet, watchSeconds: data.watchSeconds });
            if (quiet) return { anomalies: found, state: 'muted', note: 'Muted in quiet hours: the kiosk is meant to be off', held: ['tablets:'] };
            // right after a wake-up or the end of quiet hours no tablet can have been quiet long enough yet
            const watch = data.watchSeconds === null || data.watchSeconds === undefined ? NaN : Number(data.watchSeconds);
            if (Number.isFinite(watch) && watch <= M[sensitivity] * 60 && namedTablets(devices).length) {
                return { anomalies: found, state: 'ok', note: `Watching again for ${Math.max(0, Math.round(watch / 60))} min: a tablet counts as offline after ${M[sensitivity]} quiet minutes`, held: ['tablets:'] };
            }
            if (!namedTablets(devices).length) return { anomalies: found, state: 'no-data', note: 'No named tablets yet' };
            return { anomalies: found, state: 'ok', note: null };
        },
        logs: (sensitivity) => {
            const logs = data.logs || {};
            const found = detectLogs({ events: logs.events, now, sensitivity, known: logs.known, historyHours: logs.historyHours });
            if (!(logs.events || []).length && !(Number(logs.historyHours) > 0)) return { anomalies: found.anomalies, state: 'no-data', note: 'No log history yet' };
            if (found.learning) return { anomalies: found.anomalies, state: 'learning', note: found.note };
            return { anomalies: found.anomalies, state: 'ok', note: null };
        }
    };
    for (const key of DETECTOR_KEYS) {
        const conf = config[key] || {};
        if (conf.enabled === false) {
            states[key] = 'off';
            notes[key] = 'Switched off';
            closed.push(`${key}:`);
            continue;
        }
        try {
            const result = runners[key](sens(conf.sensitivity));
            anomalies.push(...result.anomalies);
            states[key] = result.state;
            if (result.note) notes[key] = result.note;
            if (result.held) held.push(...result.held);
        } catch (error) {
            states[key] = 'error';
            notes[key] = `Detector failed: ${error && error.message ? error.message : String(error)}`;
            held.push(`${key}:`);
        }
    }
    return { anomalies, states, notes, held, closed };
}

// What each sensitivity level means for each detector, in numbers, for the settings drawer of the Incidents panel. Built
// from the tables above, so the page can never show other numbers than the detectors use. short: under each step of
// the 5-step bar; long: the same value in the sentence (short when missing); sentence: the chosen level in words, where
// {v} is that level's value.
function levels() {
    const steps = [1, 2, 3, 4, 5];
    const times = (table) => steps.map((s) => `${table[s]}×`);
    const floors = `CPU or GPU over ${FLOORS.cpu} %, memory over ${FLOORS.memory} %`;
    return {
        spike: { short: times(K), sentence: `Alarms when a reading is {v} its usual swing above normal (${floors}).` },
        timeOfDay: { short: times(K), sentence: `Alarms when this hour is {v} its usual swing above the same hour on earlier days (${floors}).` },
        drift: { short: times(H), sentence: `Alarms after a steady climb of {v} the usual swing (memory over ${DRIFT_FLOORS.memory} %, disk over ${DRIFT_FLOORS.disk} %).` },
        disk: { short: steps.map((s) => `${D[s]} d`), long: steps.map((s) => `${D[s]} days`), sentence: 'Alarms when the disk will be full within {v} at the current growth, and always at 90 % full.' },
        services: { short: times(K), sentence: `Down after 2 failed checks in a row at any level. Slow when the database answers {v} its usual swing slower than normal and takes at least ${LATENCY_FLOOR_MS} ms.` },
        tablets: { short: steps.map((s) => `${M[s]} min`), long: steps.map((s) => `${M[s]} minutes`), sentence: 'Alarms when a named tablet has not reported for {v}.' },
        logs: { short: steps.map((s) => String(B[s])), long: steps.map((s) => `${B[s]} errors`), sentence: 'Alarms at {v} in 5 minutes (and 3 times the usual), and at any kind of error never seen before.' }
    };
}

module.exports = {
    levels, K, H, D, M, B, FLOORS, DRIFT_FLOORS, SEVERITY_ORDER, DETECTOR_KEYS, SETTLE_SECONDS,
    median, mad, robustZ, windowMean, sgtHour, sgtWeekday, sgtDayKey, templateOf, templateHash, thin, namedTablets,
    detectSpike, detectTimeOfDay, detectDrift, detectDisk, detectServices, detectTablets, detectLogs, runAll
};
// <Jun Kai end>
