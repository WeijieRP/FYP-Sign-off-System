// Owner: Role 3, Jun Kai.
// The 24-hour strip on each System Health card: the background check results (table health_check_results, written by
// the anomaly detection's health recorder) in half-hour blocks, each block showing the worst result in it.
// slotsOf is pure and unit-tested in tests/unit/healthHistory.test.js.
// <Jun Kai start>
// loaded on first use, so the unit tests run without a database
const db = () => require('../../core/db');

const SLOT_MS = 30 * 60 * 1000;
const SLOTS = 48;
const RANK = { unknown: 0, ok: 1, warn: 2, down: 3 };
const LETTER = { ok: 'o', warn: 'w', down: 'd', unknown: 'u' };

// rows [{ key, t (ms), status }] -> { key: 'oowd-...' }: one letter per block, oldest first, '-' where nothing was checked
function slotsOf(rows, { from, slotMs = SLOT_MS, slots = SLOTS }) {
    const worst = {};
    for (const row of rows) {
        const i = Math.floor((row.t - from) / slotMs);
        if (i < 0 || i >= slots || !(row.status in RANK)) continue;
        const list = worst[row.key] || (worst[row.key] = new Array(slots).fill(null));
        if (list[i] === null || RANK[row.status] > RANK[list[i]]) list[i] = row.status;
    }
    const out = {};
    for (const [key, list] of Object.entries(worst)) out[key] = list.map((status) => (status === null ? '-' : LETTER[status])).join('');
    return out;
}

// The last 24 hours, the blocks lined up on the half hour (the last one is the half hour now running)
function lastDay(now = Date.now()) {
    const end = Math.ceil((now + 1) / SLOT_MS) * SLOT_MS;
    const from = end - SLOTS * SLOT_MS;
    return new Promise((resolve, reject) => {
        db().all('SELECT check_key AS check_key, UNIX_TIMESTAMP(checked_at) * 1000 AS t, status FROM health_check_results WHERE checked_at >= ?', [new Date(from)], (err, rows) => {
            if (err) return reject(err);
            const clean = (rows || []).map((row) => ({ key: row.check_key, t: Number(row.t), status: row.status }));
            resolve({ from, slotMs: SLOT_MS, slots: SLOTS, checks: slotsOf(clean, { from }) });
        });
    });
}

module.exports = { slotsOf, lastDay, SLOT_MS, SLOTS };
// <Jun Kai end>
