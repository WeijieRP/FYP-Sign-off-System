// Owner: Role 3, Jun Kai.
// Usage forecasting for the Hardware page, statistics only (no AI, as agreed with the supervisor):
// Holt's damped trend (double exponential smoothing) for CPU, memory and GPU, a straight-line fit for
// the disk, daily averages for forecasts more than 2 days ahead, and the check that tells a dependable forecast from
// a rough guide. Pure functions, unit-tested in tests/unit/forecast.test.js.
// <Jun Kai start>
const ALPHAS = [0.2, 0.35, 0.5, 0.65, 0.8];
const BETAS = [0.02, 0.05, 0.1, 0.2, 0.3];
// An undamped trend runs on for the whole horizon, so two hours of the PC settling after a wake-up became
// "memory 0 % tomorrow". A trend is now trusted for about as long as it has been seen: it fades by half over
// half the unbroken run (at least 6 steps), and a run shorter than TRUST_STEPS (6 hours of 10-minute steps)
// counts for less. Since 18 Nov 2026 it also fades by half within TRUST_STEPS at the latest: on a PC that ran for
// days without a break, half the run was days, so a small trend of the last hour carried on for days (on the test
// data memory 7 days ahead came out at 92.7 % instead of 81.6 %). The forecast still continues from the current
// level, so a steep fall in the last hour can still reach 0 % within hours. For the daily forecast the cap is 36 days.
const MIN_HALF_LIFE_STEPS = 6;
const TRUST_STEPS = 36;
const MAX_HALF_LIFE_STEPS = TRUST_STEPS;
const dampingFor = (steps) => 0.5 ** (1 / Math.min(MAX_HALF_LIFE_STEPS, Math.max(MIN_HALF_LIFE_STEPS, steps / 2)));
const DAMPING = dampingFor(24);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// One pass of Holt's damped method. Returns the final level and trend plus the one-step-ahead error.
function holt(values, alpha, beta, phi = DAMPING) {
    let level = values[0];
    let trend = 0; // learned from the data: one noisy first difference must not steer the whole forecast
    let squaredError = 0;
    for (let t = 1; t < values.length; t++) {
        const predicted = level + phi * trend;
        squaredError += (values[t] - predicted) ** 2;
        const previousLevel = level;
        level = alpha * values[t] + (1 - alpha) * predicted;
        trend = beta * (level - previousLevel) + (1 - beta) * phi * trend;
    }
    return { level, trend, rmse: values.length > 1 ? Math.sqrt(squaredError / (values.length - 1)) : 0 };
}

// Tries a small grid of smoothing factors and keeps the pair with the smallest one-step error
function fitHolt(values, phi = DAMPING) {
    let best = null;
    for (const alpha of ALPHAS) {
        for (const beta of BETAS) {
            const fit = holt(values, alpha, beta, phi);
            if (!best || fit.rmse < best.rmse) best = { ...fit, alpha, beta };
        }
    }
    return best;
}

// values: evenly spaced readings, oldest first; steps: how many future points to produce.
// Only the unbroken run of readings up to the latest one is used (a gap such as a night in hibernation is
// not a step). Returns null with fewer than 6 readings.
// - The trend is damped (see TRUST_STEPS above) and never carries the forecast further from the last level
//   than the readings moved within the run: CPU, memory and GPU swing around a level, they do not drift forever.
// - The band (about 80 %) starts at the typical one-step error and widens with sqrt(h), up to twice the usual
//   spread of the readings.
function holtForecast(values, steps, { min = 0, max = 100, phi } = {}) {
    let start = values.length;
    while (start > 0 && Number.isFinite(values[start - 1])) start--;
    const clean = values.slice(start);
    if (clean.length < 6 || steps < 1) return null;
    const damping = phi === undefined ? dampingFor(clean.length) : phi;
    const fit = fitHolt(clean, damping);
    const trend = fit.trend * Math.min(1, clean.length / TRUST_STEPS);
    const range = Math.max(...clean) - Math.min(...clean);
    const mean = clean.reduce((sum, v) => sum + v, 0) / clean.length;
    const spread = Math.sqrt(clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / clean.length);
    const bandCap = 2 * Math.max(fit.rmse, spread);
    const points = [];
    let carried = 0; // damping + damping^2 + ... + damping^h
    for (let h = 1; h <= steps; h++) {
        carried += damping ** h;
        const value = clamp(fit.level + clamp(carried * trend, -range, range), min, max);
        const halfBand = 1.28 * Math.min(fit.rmse * Math.sqrt(h), bandCap);
        points.push({ value: round1(value), low: round1(clamp(value - halfBand, min, max)), high: round1(clamp(value + halfBand, min, max)) });
    }
    return { points, rmse: round1(fit.rmse), trendPerStep: round1(trend), alpha: fit.alpha, beta: fit.beta, damping: Math.round(damping * 1000) / 1000 };
}

// Least-squares line through { t (ms), v } points: slope in value per ms
function linearTrend(points) {
    const clean = points.filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t));
    if (clean.length < 2) return null;
    const n = clean.length;
    const t0 = clean[0].t;
    let sumT = 0; let sumV = 0; let sumTT = 0; let sumTV = 0;
    for (const p of clean) {
        const t = p.t - t0;
        sumT += t; sumV += p.v; sumTT += t * t; sumTV += t * p.v;
    }
    const denominator = n * sumTT - sumT * sumT;
    if (denominator === 0) return null;
    const slope = (n * sumTV - sumT * sumV) / denominator;
    const intercept = (sumV - slope * sumT) / n;
    return { slope, intercept, t0, n };
}

// Disk: growth in GB per day and the days left before the drive is full (null when not growing)
function diskForecast(points, totalGb) {
    const fit = linearTrend(points);
    if (!fit || !totalGb) return null;
    const gbPerDay = Math.round(fit.slope * 86400000 * 100) / 100;
    const lastUsed = points[points.length - 1].v;
    const freeGb = totalGb - lastUsed;
    const daysUntilFull = gbPerDay >= 0.01 ? freeGb / gbPerDay : null;
    return {
        gbPerDay,
        daysUntilFull: daysUntilFull === null ? null : Math.max(0, Math.round(daysUntilFull)),
        spanDays: round1((points[points.length - 1].t - points[0].t) / 86400000),
        totalGb,
        lastUsedGb: lastUsed
    };
}

// Averages rows into fixed buckets: rows [{ t, ...numbers }] -> [{ t, n, ...averages }]
function bucketAverage(rows, bucketMs, keys) {
    const buckets = new Map();
    for (const row of rows) {
        const t = Math.floor(row.t / bucketMs) * bucketMs;
        let b = buckets.get(t);
        if (!b) { b = { t, n: 0, sums: {}, counts: {} }; buckets.set(t, b); }
        b.n++;
        for (const key of keys) {
            if (!Number.isFinite(row[key])) continue;
            b.sums[key] = (b.sums[key] || 0) + row[key];
            b.counts[key] = (b.counts[key] || 0) + 1;
        }
    }
    return [...buckets.values()].sort((a, b) => a.t - b.t).map((b) => {
        const out = { t: b.t, n: b.n };
        for (const key of keys) out[key] = b.counts[key] ? round1(b.sums[key] / b.counts[key]) : null;
        return out;
    });
}

// Forecasts more than DAILY_AFTER_HOURS (2 days) ahead work on one average per day instead of 10 minute steps. Until
// 18 Nov 2026 the steps went up to 7 days, but they carry on from the current level: a forecast 7 days ahead made at
// night showed tonight's low CPU, while 30 days ahead on the daily averages showed the usual level.
const DAILY_AFTER_HOURS = 48;
const usesDailyAverages = (hours) => Number(hours) > DAILY_AFTER_HOURS;

// values: daily averages, oldest first, only the days that have samples; days: how far ahead.
// Returns the Holt result with at most maxPoints points, each { day (1 = tomorrow), value, low, high }, or null
// with fewer than 6 days. The damped trend fades within weeks, so far ahead this is the usual level and range.
function dailyForecast(values, days, maxPoints = 200) {
    const result = holtForecast(values, days);
    if (!result) return null;
    const stepDays = Math.max(1, Math.ceil(days / maxPoints));
    const points = [];
    result.points.forEach((p, i) => { if ((i + 1) % stepDays === 0 || i === result.points.length - 1) points.push({ day: i + 1, ...p }); });
    return { ...result, points, stepDays };
}

// A forecast is dependable for about as far ahead as the stored samples go back (5 % short still counts: the
// hourly clean-up keeps the oldest sample hovering around the keep period).
// rough: the history is shorter than the horizon. reason 'history': it gets there by waiting (waitHours);
// reason 'retention': samples are deleted before it can (neededRetentionDays is the keep period that would do).
const HISTORY_TOLERANCE = 0.95;
// keptForGood: a forecast more than 2 days ahead reads the daily summaries, which are never deleted (no 'retention' reason)
function horizonCheck({ horizonHours, historyHours, retentionDays, keptForGood = false }) {
    const keptHours = keptForGood ? Infinity : retentionDays * 24;
    const history = Math.max(0, Math.min(Number(historyHours) || 0, keptHours));
    const base = { horizonHours, historyHours: Math.round(history), retentionDays, keptForGood };
    if (history >= horizonHours * HISTORY_TOLERANCE) return { ...base, rough: false, reason: null, waitHours: 0 };
    if (keptHours < horizonHours * HISTORY_TOLERANCE) return { ...base, rough: true, reason: 'retention', waitHours: null, neededRetentionDays: Math.ceil(horizonHours / 24) };
    return { ...base, rough: true, reason: 'history', waitHours: Math.ceil(horizonHours - history) };
}

function round1(n) { return Math.round(n * 10) / 10; }

module.exports = { holt, fitHolt, holtForecast, dailyForecast, horizonCheck, linearTrend, diskForecast, bucketAverage, clamp, dampingFor, DAILY_AFTER_HOURS, usesDailyAverages };
// <Jun Kai end>
