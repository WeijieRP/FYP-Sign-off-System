// Owner: Role 3, Jun Kai.
// Daily summary of the hardware samples (hardware_daily, migration 009): one row per UTC day with that day's
// averages and peaks, kept for good. The sampler calls rollUp at its first sample after each UTC midnight, before the
// hourly clean-up deletes old samples, so a finished day is summed up while its samples are still there. The long
// forecast and the long graph ranges read it, so they reach further back than the samples themselves are kept.
// <Jun Kai start>
// loaded on first use, so the unit tests of mergeBuckets do not open a database pool
const db = () => require('../../core/db');

const KEYS = ['cpu', 'memory', 'disk', 'gpu', 'diskUsedGb', 'diskTotalGb', 'memoryUsedMb', 'gpuMemoryUsedMb'];
const run = (sql, params) => new Promise((resolve, reject) => db().run(sql, params, (err, result) => (err ? reject(err) : resolve(result))));
const all = (sql, params) => new Promise((resolve, reject) => db().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const round1 = (n) => Math.round(n * 10) / 10;
// before npm run db:migrate adds the table, the page keeps working on the samples alone
const missing = (error) => error && error.code === 'ER_NO_SUCH_TABLE';

// The day after the newest summary ('YYYY-MM-DD'), or null when there is none yet
async function nextDay() {
    try {
        const rows = await all("SELECT DATE_FORMAT(DATE_ADD(MAX(day), INTERVAL 1 DAY), '%Y-%m-%d') AS next FROM hardware_daily", []);
        return rows[0] && rows[0].next ? rows[0].next : null;
    } catch (error) {
        if (missing(error)) return null;
        throw error;
    }
}

// Sums up every finished UTC day after the newest summary that has samples; returns how many days were added.
// A day is summed up once: no sample can arrive later for a day that is over.
async function rollUp() {
    const from = (await nextDay()) || '1970-01-01';
    const result = await run(
        `INSERT INTO hardware_daily (day, samples, cpu_avg, cpu_max, memory_avg, memory_max, disk_avg, disk_max, gpu_avg, gpu_max,
                                     disk_used_gb, disk_total_gb, memory_used_mb, gpu_memory_used_mb, updated_at)
         SELECT DATE(sampled_at), COUNT(*), ROUND(AVG(cpu_percent), 1), MAX(cpu_percent), ROUND(AVG(memory_percent), 1), MAX(memory_percent),
                ROUND(AVG(disk_percent), 1), MAX(disk_percent), ROUND(AVG(gpu_percent), 1), MAX(gpu_percent),
                ROUND(AVG(disk_used_gb), 1), MAX(disk_total_gb), ROUND(AVG(memory_used_mb)), ROUND(AVG(gpu_memory_used_mb)), UTC_TIMESTAMP()
         FROM hardware_samples
         WHERE sampled_at >= ? AND sampled_at < UTC_DATE()
         GROUP BY DATE(sampled_at)
         ON DUPLICATE KEY UPDATE hardware_daily.samples = hardware_daily.samples`,
        [from]
    );
    return result && result.affectedRows ? result.affectedRows : 0;
}

function toPoint(row) {
    const point = { t: Number(row.t) * 1000, n: Number(row.n) };
    for (const key of KEYS) point[key] = row[key] === null || row[key] === undefined ? null : round1(Number(row[key]));
    return point;
}

// The summaries in buckets of whole days, each day weighted by its number of samples, shaped like the graph points
async function summaryBuckets(secondsBack, bucketSeconds) {
    const avg = (col) => `SUM(${col} * samples) / NULLIF(SUM(CASE WHEN ${col} IS NULL THEN 0 ELSE samples END), 0)`;
    try {
        const rows = await all(
            `SELECT FLOOR(UNIX_TIMESTAMP(day) / ?) * ? AS t, SUM(samples) AS n,
                    ${avg('cpu_avg')} AS cpu, ${avg('memory_avg')} AS memory, ${avg('disk_avg')} AS disk, ${avg('gpu_avg')} AS gpu,
                    ${avg('disk_used_gb')} AS diskUsedGb, MAX(disk_total_gb) AS diskTotalGb,
                    ${avg('memory_used_mb')} AS memoryUsedMb, ${avg('gpu_memory_used_mb')} AS gpuMemoryUsedMb
             FROM hardware_daily
             WHERE day >= DATE(UTC_TIMESTAMP() - INTERVAL ? SECOND)
             GROUP BY t ORDER BY t`,
            [bucketSeconds, bucketSeconds, secondsBack]
        );
        return rows.map(toPoint);
    } catch (error) {
        if (missing(error)) return [];
        throw error;
    }
}

// Puts two lists of bucket points together; a bucket in both is averaged by its number of samples (disk size: the larger)
function mergeBuckets(a, b) {
    const byT = new Map();
    for (const p of [...a, ...b]) {
        const cur = byT.get(p.t);
        if (!cur) { byT.set(p.t, { ...p }); continue; }
        for (const key of KEYS) {
            if (p[key] === null || p[key] === undefined) continue;
            if (cur[key] === null || cur[key] === undefined) cur[key] = p[key];
            else cur[key] = key === 'diskTotalGb' ? Math.max(cur[key], p[key]) : round1((cur[key] * cur.n + p[key] * p.n) / (cur.n + p.n));
        }
        cur.n += p.n;
    }
    return [...byT.values()].sort((x, y) => x.t - y.t);
}

// How many days are summed up, and since when (for the Hardware page and the forecast check)
async function summary() {
    try {
        const rows = await all("SELECT COUNT(*) AS days, DATE_FORMAT(MIN(day), '%Y-%m-%d') AS oldest, DATE_FORMAT(MAX(day), '%Y-%m-%d') AS newest FROM hardware_daily", []);
        return { days: Number(rows[0].days), oldest: rows[0].oldest || null, newest: rows[0].newest || null, missing: false };
    } catch (error) {
        if (missing(error)) return { days: 0, oldest: null, newest: null, missing: true };
        throw error;
    }
}

module.exports = { rollUp, nextDay, summaryBuckets, mergeBuckets, summary, toPoint, KEYS };
// <Jun Kai end>
