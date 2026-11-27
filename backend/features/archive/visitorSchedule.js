// Owner: Role 3, Jun Kai.
// Date maths for the Visitor Data Archive in Singapore time (UTC+8 all year): cutoffs, the automatic schedule, file expiry.
// <Jun Kai start>
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

// A Date whose UTC fields read as Singapore wall-clock time
const sgtFields = (date) => new Date(date.getTime() + SGT_OFFSET_MS);
// The instant of a Singapore wall-clock time (Date.UTC rolls days and months over by itself)
const sgtInstant = (y, m, d, hh = 0, mm = 0) => new Date(Date.UTC(y, m, d, hh, mm) - SGT_OFFSET_MS);
const timeOf = (value) => (value ? new Date(value).getTime() : NaN);

function toSgtDay(date) {
    return sgtFields(date).toISOString().slice(0, 10);
}

function toSgtDateTime(date) {
    return sgtFields(date).toISOString().slice(0, 19).replace('T', ' ');
}

// 'YYYY-MM-DD' -> the start of that Singapore day as a UTC instant, or null when the date does not exist
function sgtDayStart(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    const check = new Date(Date.UTC(y, mo, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null;
    return sgtInstant(y, mo, d);
}

// Records created before this instant are due. Months and years are calendar months (31 Mar - 1 month = 28/29 Feb).
function cutoffFor(keep, now = new Date()) {
    const amount = Math.round(Number(keep.amount)) || 0;
    const f = sgtFields(now);
    const [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()];
    if (keep.unit === 'days' || keep.unit === 'weeks') return sgtInstant(y, m, d - amount * (keep.unit === 'weeks' ? 7 : 1));
    const months = amount * (keep.unit === 'years' ? 12 : 1);
    const lastDay = new Date(Date.UTC(y, m - months + 1, 0)).getUTCDate();
    return sgtInstant(y, m - months, Math.min(d, lastDay));
}

function clockOf(auto) {
    const m = /^(\d{2}):(\d{2})$/.exec(auto.time || '');
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

// Latest daily / weekly / monthly moment at or before now
function lastScheduledAt(auto, now) {
    const f = sgtFields(now);
    const [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()];
    const [hh, mm] = clockOf(auto);
    if (auto.frequency === 'daily') {
        const today = sgtInstant(y, m, d, hh, mm);
        return today <= now ? today : sgtInstant(y, m, d - 1, hh, mm);
    }
    if (auto.frequency === 'weekly') {
        const back = (f.getUTCDay() - auto.weekday + 7) % 7;
        const at = sgtInstant(y, m, d - back, hh, mm);
        return at <= now ? at : sgtInstant(y, m, d - back - 7, hh, mm);
    }
    const thisMonth = sgtInstant(y, m, auto.dayOfMonth, hh, mm);
    return thisMonth <= now ? thisMonth : sgtInstant(y, m - 1, auto.dayOfMonth, hh, mm);
}

// Earliest daily / weekly / monthly moment after now
function nextScheduledAt(auto, now) {
    const f = sgtFields(now);
    const [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()];
    const [hh, mm] = clockOf(auto);
    if (auto.frequency === 'daily') {
        const today = sgtInstant(y, m, d, hh, mm);
        return today > now ? today : sgtInstant(y, m, d + 1, hh, mm);
    }
    if (auto.frequency === 'weekly') {
        const ahead = (auto.weekday - f.getUTCDay() + 7) % 7;
        const at = sgtInstant(y, m, d + ahead, hh, mm);
        return at > now ? at : sgtInstant(y, m, d + ahead + 7, hh, mm);
    }
    const thisMonth = sgtInstant(y, m, auto.dayOfMonth, hh, mm);
    return thisMonth > now ? thisMonth : sgtInstant(y, m + 1, auto.dayOfMonth, hh, mm);
}

// Custom: everyDays after the last automatic run or after it was switched on, whichever is later (like the other
// frequencies, switching it back on never fires at once); on that day at `time` when one is set
function customDueAt(auto, state) {
    const base = Math.max(timeOf(state.lastAutomaticAt) || -Infinity, timeOf(auto.enabledAt) || -Infinity);
    if (!Number.isFinite(base)) return null;
    const due = new Date(base + auto.everyDays * DAY_MS);
    if (!auto.time) return due;
    const f = sgtFields(due);
    const [hh, mm] = clockOf(auto);
    return sgtInstant(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), hh, mm);
}

// Identifies the scheduled period a run belongs to (used to count failed attempts per period)
function periodKey(auto, state = {}, now = new Date()) {
    const at = auto.frequency === 'custom' ? customDueAt(auto, state) : lastScheduledAt(auto, now);
    return at ? at.toISOString() : 'first';
}

function isDue(auto, state = {}, now = new Date()) {
    if (!auto || !auto.enabled) return false;
    let due;
    if (auto.frequency === 'custom') {
        const at = customDueAt(auto, state);
        due = !at || now >= at;
    } else {
        // a moment that passed before it was switched on, or that already ran, is not due
        const baseline = Math.max(timeOf(state.lastAutomaticAt) || -Infinity, timeOf(auto.enabledAt) || -Infinity);
        due = lastScheduledAt(auto, now).getTime() > baseline;
    }
    if (!due) return false;
    const failures = state.failures;
    if (failures && failures.period === periodKey(auto, state, now)) {
        if (failures.count >= MAX_ATTEMPTS) return false;
        if (failures.retryAt && now < new Date(failures.retryAt)) return false;
    }
    return true;
}

// When the next automatic run should happen (for display), or null when switched off
function nextDueAt(auto, state = {}, now = new Date()) {
    if (!auto || !auto.enabled) return null;
    if (isDue(auto, state, now)) return now;
    const failures = state.failures;
    if (failures && failures.period === periodKey(auto, state, now) && failures.count < MAX_ATTEMPTS && failures.retryAt && new Date(failures.retryAt) > now) {
        return new Date(failures.retryAt);
    }
    if (auto.frequency === 'custom') return customDueAt(auto, state) || now;
    return nextScheduledAt(auto, now);
}

// State after a failed automatic attempt: retry after an hour, give the period up after 3 attempts
function afterFailure(state, key, now = new Date()) {
    const same = state.failures && state.failures.period === key;
    const count = (same ? Number(state.failures.count) || 0 : 0) + 1;
    if (count >= MAX_ATTEMPTS) return { ...state, lastAutomaticAt: now.toISOString(), failures: null };
    return { ...state, failures: { period: key, count, retryAt: new Date(now.getTime() + RETRY_AFTER_MS).toISOString() } };
}

function addMonthsUtc(date, months) {
    const [y, m] = [date.getUTCFullYear(), date.getUTCMonth() + months];
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
}

function filesExpired(keepFiles, finishedAt, now = new Date()) {
    const amount = Number(keepFiles && keepFiles.amount);
    if (!(amount > 0) || !finishedAt) return false;
    const done = new Date(finishedAt);
    if (Number.isNaN(done.getTime())) return false;
    return addMonthsUtc(done, amount * (keepFiles.unit === 'years' ? 12 : 1)) < now;
}

module.exports = {
    toSgtDay, toSgtDateTime, sgtDayStart, cutoffFor, lastScheduledAt, nextScheduledAt,
    periodKey, isDue, nextDueAt, afterFailure, filesExpired, RETRY_AFTER_MS, MAX_ATTEMPTS
};
// <Jun Kai end>
