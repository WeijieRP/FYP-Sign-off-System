// Owner: Role 3, Jun Kai.
// Schedule policies (supervisor meeting 03, 4 Nov 2026). A policy is Active (the kiosk runs) or Stop (the kiosk is
// off) for a time window on the days it repeats. The list order is the priority: at any moment the first enabled
// policy whose window holds that moment decides; when none does, the kiosk is off. Pure functions, local clock.
// <Jun Kai start>
const TYPES = ['daily', 'monthly', 'weekly', 'specific_date'];
const SPECIFICITY = { daily: 0, monthly: 1, weekly: 2, specific_date: 3 };
const TYPE_LABEL = { daily: 'Every day', monthly: 'Selected months', weekly: 'Days of the week', specific_date: 'One date' };
const FAR_DAYS = 400; // how far to look for the next switch when the near window has none

const actionOf = (policy) => (policy && policy.action === 'stop' ? 'stop' : 'active');
const isEnabled = (policy) => !!policy && policy.is_active !== false && policy.is_active !== 'false';
const pad = (n) => String(n).padStart(2, '0');

function parseTime(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h > 23 || min > 59 ? null : { h, min };
}

// "2,3,4" or [2, 3, 4] -> sorted unique whole numbers inside [min, max]
function numberList(value, min, max) {
    const raw = Array.isArray(value) ? value : String(value === null || value === undefined ? '' : value).split(',');
    const nums = raw.map((v) => Number(String(v).trim())).filter((n) => Number.isInteger(n) && n >= min && n <= max);
    return [...new Set(nums)].sort((a, b) => a - b);
}

function localYmd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayStart = (date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

// days_of_week uses 1 = Sunday ... 7 = Saturday; months 1 = January ... 12 = December
function appliesOn(policy, day) {
    switch (policy.schedule_type) {
        case 'daily': return true;
        case 'weekly': return numberList(policy.days_of_week, 1, 7).includes(day.getDay() + 1);
        case 'monthly': return numberList(policy.months, 1, 12).includes(day.getMonth() + 1);
        case 'specific_date': return localYmd(day) === String(policy.specific_date || '').slice(0, 10);
        default: return false;
    }
}

// The window a policy opens on `day`: from the start time that day to the stop time the same day, or the next day
// when the stop is not later than the start (so 00:00 to 00:00 is the whole day)
function windowOn(policy, day) {
    if (!isEnabled(policy) || !appliesOn(policy, day)) return null;
    const start = parseTime(policy.start_time);
    const end = parseTime(policy.end_time);
    if (!start || !end) return null;
    const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.h, start.min);
    let endAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), end.h, end.min);
    if (endAt <= startAt) endAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, end.h, end.min);
    return { startAt, endAt };
}

// The policy that decides moment t (first match in list order), or null
function winnerAt(policies, t) {
    const days = [dayStart(t), dayStart(t, -1)];
    for (let index = 0; index < policies.length; index++) {
        for (const day of days) {
            const w = windowOn(policies[index], day);
            if (w && w.startAt <= t && t < w.endAt) return { policy: policies[index], index, window: w };
        }
    }
    return null;
}

// Pieces of [from, to) with one deciding policy each: { start, end, on, policy, index }
function timeline(policies, from, to) {
    const cuts = new Set([from.getTime(), to.getTime()]);
    for (let day = dayStart(from, -1); day < to; day = dayStart(day, 1)) {
        for (const policy of policies) {
            const w = windowOn(policy, day);
            if (!w) continue;
            for (const at of [w.startAt.getTime(), w.endAt.getTime()]) {
                if (at > from.getTime() && at < to.getTime()) cuts.add(at);
            }
        }
    }
    const times = [...cuts].sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < times.length - 1; i++) {
        const start = new Date(times[i]);
        const end = new Date(times[i + 1]);
        const win = winnerAt(policies, start);
        const segment = { start, end, on: !!win && actionOf(win.policy) === 'active', policy: win ? win.policy : null, index: win ? win.index : -1 };
        const last = segments[segments.length - 1];
        if (last && last.on === segment.on && last.policy === segment.policy) last.end = end;
        else segments.push(segment);
    }
    return segments;
}

// Moments in (from, to) where the kiosk switches on or off
function transitions(policies, from, to) {
    const segments = timeline(policies, from, to);
    const changes = [];
    for (let i = 1; i < segments.length; i++) {
        if (segments[i].on !== segments[i - 1].on) {
            changes.push({ at: segments[i].start, on: segments[i].on, policy: segments[i].policy, previous: segments[i - 1].policy });
        }
    }
    return changes;
}

// What the scheduler should do now. switchedOff is true only right after the kiosk switched off: at an on -> off
// change in the timeline (within graceMs), or because a policy change turned it off since the last tick (lastOn = what
// the last tick saw). Never just because the state is off. A gap that ends within minGapMs does not count as a
// switch-off (the kiosk is back in a few minutes).
function decide(policies, now, lastKey, { graceMs = 90 * 1000, lastOn = null, minGapMs = 5 * 60 * 1000 } = {}) {
    const winner = winnerAt(policies, now);
    const on = !!winner && actionOf(winner.policy) === 'active';
    const offs = transitions(policies, new Date(now.getTime() - graceMs), new Date(now.getTime() + 1)).filter((c) => !c.on);
    let due = offs.length ? offs[offs.length - 1] : null;
    let key = due ? `off|${due.at.toISOString()}` : null;
    if (!on && !due && lastOn === true) {
        due = { at: now, on: false, policy: winner ? winner.policy : null, previous: null, edited: true };
        key = `off|edit|${now.toISOString().slice(0, 16)}`;
    }
    const backSoon = !on && !!due && transitions(policies, now, new Date(now.getTime() + minGapMs)).some((c) => c.on);
    return { on, winner, due, key, backSoon, switchedOff: !!due && !on && key !== lastKey && !backSoon };
}

function offReason(change) {
    if (!change) return 'policies';
    if (change.edited) {
        return change.policy ? `a policy change, stop policy "${change.policy.schedule_name}" is in force` : 'a policy change, no policy keeps it on';
    }
    if (change.policy && actionOf(change.policy) === 'stop') return `stop policy "${change.policy.schedule_name}" starts`;
    return change.previous ? `"${change.previous.schedule_name}" ends` : 'no policy is in force';
}

// Current state and the next switches, for the Automation card and the health check
function status(policies, now, horizonDays = 14) {
    const end = dayStart(now, horizonDays + 1);
    const segments = timeline(policies, now, end);
    let changes = transitions(policies, now, end);
    if (!changes.some((c) => c.on) || !changes.some((c) => !c.on)) changes = transitions(policies, now, dayStart(now, FAR_DAYS));
    const current = segments[0] || null;
    const nextStart = changes.find((c) => c.on);
    const nextStop = changes.find((c) => !c.on);
    return {
        on: !!current && current.on,
        policy: current ? current.policy : null,
        until: changes.length ? changes[0].at : null,
        nextStart: nextStart ? nextStart.at : null,
        nextStop: nextStop ? nextStop.at : null
    };
}

// When Windows should wake the PC: a few minutes before every off -> on switch in the next `days` days. When a
// long Stop period leaves none in that window, the first switch-on after it is kept, or the PC would never wake.
function wakeTimes(policies, now, { days = 14, leadMinutes = 3, max = 40 } = {}) {
    const switchOns = (to) => transitions(policies, now, to)
        .filter((c) => c.on)
        .map((c) => new Date(c.at.getTime() - leadMinutes * 60 * 1000))
        .filter((t) => t > now);
    let all = switchOns(dayStart(now, days + 1));
    if (!all.length) all = switchOns(dayStart(now, FAR_DAYS)).slice(0, 1);
    return { times: all.slice(0, max), dropped: Math.max(0, all.length - max) };
}

// `days` days from `start` (today, or the date the admin picked), cut per day for the preview chart (minutes from
// local midnight)
function preview(policies, now, days = 7, start = now) {
    const minutes = (date, base) => Math.round((date - base) / 60000);
    const hhmm = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const out = [];
    for (let i = 0; i < days; i++) {
        const from = dayStart(start, i);
        const to = dayStart(start, i + 1);
        const segments = timeline(policies, from, to).filter((s) => s.policy).map((s) => ({
            startMin: minutes(s.start, from),
            endMin: minutes(s.end, from),
            from: hhmm(s.start),
            to: s.end.getTime() === to.getTime() ? '24:00' : hhmm(s.end),
            on: s.on,
            id: s.policy.id,
            name: s.policy.schedule_name,
            color: s.policy.color || null,
            action: actionOf(s.policy),
            position: s.index + 1
        }));
        out.push({ date: localYmd(from), weekday: from.getDay(), segments });
    }
    return { today: localYmd(now), start: localYmd(dayStart(start)), nowMin: minutes(now, dayStart(now)), days: out };
}

// Default priority: more specific first (one date > weekdays > months > every day), then Stop before Active
const rank = (policy) => (SPECIFICITY[policy.schedule_type] || 0) * 2 + (actionOf(policy) === 'stop' ? 1 : 0);

// Where a new (or re-ranked) policy goes. Only Active-against-Stop pairs matter (two Active or two Stop policies never
// disagree), so pick the place that breaks the fewest default rules among those pairs, as close as possible to "just
// above the first policy it outranks". In a list in default order that is exactly that place; after manual drags it
// keeps a new policy from jumping above, say, a one-date Stop that should still beat it.
function insertIndex(list, policy) {
    const others = list.filter((other) => other !== policy && other.id !== policy.id);
    const first = others.findIndex((other) => rank(policy) > rank(other));
    const preferred = first === -1 ? others.length : first;
    const cost = (p) => others.reduce((sum, other, i) => {
        if (actionOf(other) === actionOf(policy)) return sum;
        return sum + ((rank(policy) > rank(other)) === (p <= i) ? 0 : 1);
    }, 0);
    let best = preferred;
    let bestCost = cost(preferred);
    for (let p = 0; p <= others.length; p++) {
        const c = cost(p);
        if (c < bestCost || (c === bestCost && Math.abs(p - preferred) < Math.abs(best - preferred))) {
            best = p;
            bestCost = c;
        }
    }
    return best;
}

function defaultOrder(list) {
    return list.map((policy, i) => ({ policy, i })).sort((a, b) => rank(b.policy) - rank(a.policy) || a.i - b.i).map((x) => x.policy);
}

// True when the two policies cover a common moment in the next `days` days (enabled or not)
function overlaps(a, b, from, days = 400) {
    const on = (p) => ({ ...p, is_active: true });
    const pa = on(a);
    const pb = on(b);
    for (let i = -1; i < days; i++) {
        const day = dayStart(from, i);
        const wa = windowOn(pa, day);
        if (!wa) continue;
        for (const d of [day, dayStart(day, -1), dayStart(day, 1)]) {
            const wb = windowOn(pb, d);
            if (wb && wa.startAt < wb.endAt && wb.startAt < wa.endAt) return true;
        }
    }
    return false;
}

function placementReason(policy, below) {
    if (!below) return null;
    if ((SPECIFICITY[policy.schedule_type] || 0) > (SPECIFICITY[below.schedule_type] || 0)) {
        return `${TYPE_LABEL[policy.schedule_type]} is more specific than ${TYPE_LABEL[below.schedule_type].toLowerCase()}`;
    }
    return 'a Stop policy goes above an Active one at the same level';
}

function validDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) return false;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

// Checks a policy from the admin page (merged over `previous` when editing). Returns { policy } or { error }.
// The colours a policy can have on the calendar (Stop policies are always drawn grey); no colour = picked from the id
const COLORS = ['blue', 'green', 'purple', 'orange', 'teal', 'rose', 'indigo', 'amber', 'cyan', 'brown'];

function normalize(input, previous = {}) {
    const merged = { ...previous };
    for (const [key, value] of Object.entries(input || {})) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue; // never a field of a policy
        if (value !== undefined && value !== null) merged[key] = value; // a missing or null field keeps its saved value
    }
    if (typeof merged.schedule_name !== 'string') return { error: 'Give the policy a name' };
    for (const flag of ['is_active', 'all_day']) {
        if (merged[flag] !== undefined && typeof merged[flag] !== 'boolean') return { error: `${flag} must be true or false` };
    }
    const name = merged.schedule_name.trim().replace(/\s+/g, ' ');
    if (!name) return { error: 'Give the policy a name' };
    if (name.length > 80) return { error: 'The name can be 80 characters at most' };
    if (merged.action !== undefined && merged.action !== null && !['active', 'stop'].includes(merged.action)) {
        return { error: 'A policy is either Active or Stop' };
    }
    if (!TYPES.includes(merged.schedule_type)) return { error: 'Choose how often the policy repeats' };
    const allDay = merged.all_day === true;
    const start = allDay ? { h: 0, min: 0 } : parseTime(merged.start_time);
    const end = allDay ? { h: 0, min: 0 } : parseTime(merged.end_time);
    if (!start || !end) return { error: 'Start and stop times must look like 08:00' };
    const startText = `${pad(start.h)}:${pad(start.min)}`;
    const endText = `${pad(end.h)}:${pad(end.min)}`;
    if (!allDay && startText === endText) return { error: 'Start and stop cannot be the same time. Tick All day for a whole day.' };

    const policy = {
        schedule_name: name,
        action: actionOf(merged),
        schedule_type: merged.schedule_type,
        start_time: startText,
        end_time: endText,
        all_day: allDay,
        days_of_week: null,
        months: null,
        specific_date: null,
        is_active: isEnabled(merged),
        color: COLORS.includes(merged.color) ? merged.color : null
    };
    if (policy.schedule_type === 'weekly') {
        const days = numberList(merged.days_of_week, 1, 7);
        if (!days.length) return { error: 'Pick at least one day' };
        policy.days_of_week = days.join(',');
    } else if (policy.schedule_type === 'monthly') {
        const months = numberList(merged.months, 1, 12);
        if (!months.length) return { error: 'Pick at least one month' };
        policy.months = months.join(',');
    } else if (policy.schedule_type === 'specific_date') {
        const date = String(merged.specific_date || '').slice(0, 10);
        if (!validDate(date)) return { error: 'Pick the date' };
        policy.specific_date = date;
    }
    return { policy };
}

module.exports = {
    TYPES, SPECIFICITY, TYPE_LABEL,
    actionOf, isEnabled, parseTime, numberList, localYmd, appliesOn, windowOn, winnerAt, timeline, transitions,
    decide, offReason, status, wakeTimes, preview, rank, insertIndex, defaultOrder, placementReason, normalize, overlaps, COLORS
};
// <Jun Kai end>
