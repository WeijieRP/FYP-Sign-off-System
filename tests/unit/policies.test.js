// Owner: Role 3, Jun Kai.
// Unit tests for the schedule policy rules (meeting 03). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const policies = require('../../backend/features/serverControl/policies');

// Monday 9 Nov 2026, local time
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m);
let nextId = 1;
const make = (fields) => ({ id: nextId++, is_active: true, action: 'active', start_time: '08:00', end_time: '18:00', schedule_type: 'daily', schedule_name: `p${nextId}`, ...fields });
const weekdays = (fields) => make({ schedule_type: 'weekly', days_of_week: '2,3,4,5,6', ...fields });
const names = (list) => list.map((p) => p.schedule_name);

test('the test week starts on a Monday', () => {
    assert.equal(at(9, 0).getDay(), 1);
});

test('default order: one date > weekdays > months > every day, and Stop above Active at the same level', () => {
    const list = [
        make({ schedule_name: 'daily active' }),
        make({ schedule_name: 'daily stop', action: 'stop' }),
        make({ schedule_name: 'month active', schedule_type: 'monthly', months: '11' }),
        make({ schedule_name: 'month stop', schedule_type: 'monthly', months: '11', action: 'stop' }),
        weekdays({ schedule_name: 'week active' }),
        weekdays({ schedule_name: 'week stop', action: 'stop' }),
        make({ schedule_name: 'date active', schedule_type: 'specific_date', specific_date: '2026-11-11' }),
        make({ schedule_name: 'date stop', schedule_type: 'specific_date', specific_date: '2026-11-11', action: 'stop' })
    ];
    assert.deepEqual(names(policies.defaultOrder(list)), [
        'date stop', 'date active', 'week stop', 'week active', 'month stop', 'month active', 'daily stop', 'daily active'
    ]);
});

test('a new policy goes just above the first one it beats and keeps the manual order elsewhere', () => {
    const hours = weekdays({ schedule_name: 'hours' });
    const sunday = make({ schedule_name: 'sunday event', schedule_type: 'weekly', days_of_week: '1' });
    const everyDay = make({ schedule_name: 'every day' });
    const list = [sunday, hours, everyDay];
    assert.equal(policies.insertIndex(list, make({ schedule_name: 'holiday', schedule_type: 'specific_date', specific_date: '2026-12-25', action: 'stop' })), 0);
    assert.equal(policies.insertIndex(list, weekdays({ schedule_name: 'another week' })), 2, 'equal rank goes below the existing ones');
    assert.equal(policies.insertIndex(list, make({ schedule_name: 'low' })), 3, 'nothing to beat: goes last');
    assert.match(policies.placementReason(make({ schedule_type: 'specific_date', specific_date: '2026-12-25' }), hours), /more specific/);
    assert.match(policies.placementReason(weekdays({ action: 'stop' }), hours), /Stop policy goes above/);
});

test('after manual drags a new policy still lands where its Active/Stop rivals expect it', () => {
    const base = make({ schedule_name: 'base', start_time: '09:00', end_time: '17:00' });
    const holiday = make({ schedule_name: 'holiday', schedule_type: 'specific_date', specific_date: '2026-11-11', start_time: '00:00', end_time: '00:00', all_day: true, action: 'stop' });
    const weekday = weekdays({ schedule_name: 'weekday hours' });
    assert.equal(policies.insertIndex([base, holiday], weekday), 2, 'below the holiday that should beat it, not above');
    const lunch = weekdays({ schedule_name: 'lunch', start_time: '12:00', end_time: '13:00', action: 'stop' });
    assert.equal(policies.insertIndex([weekday, holiday], lunch), 0, 'above the Active hours it should beat');
    const ordered = policies.defaultOrder([base, holiday, weekday, lunch]);
    const extra = make({ schedule_name: 'extra date', schedule_type: 'specific_date', specific_date: '2026-11-12' });
    assert.equal(policies.insertIndex(ordered, extra), ordered.findIndex((p) => policies.rank(extra) > policies.rank(p)), 'default order: the plain rule');
});

test('the first matching policy decides: Stop above Active stops, Active dragged above Stop runs', () => {
    const hours = weekdays({ schedule_name: 'hours' });
    const lunch = make({ schedule_name: 'lunch', schedule_type: 'weekly', days_of_week: '2', start_time: '12:00', end_time: '13:00', action: 'stop' });
    const noon = at(9, 12, 30);
    assert.equal(policies.winnerAt([lunch, hours], noon).policy, lunch);
    assert.equal(policies.decide([lunch, hours], noon).on, false);
    assert.equal(policies.decide([hours, lunch], noon).on, true, 'manual order wins');
    assert.equal(policies.decide([lunch, hours], at(9, 13, 30)).on, true, 'after the stop window the hours apply again');
});

test('a one-date Active event beats a weekly Stop on that day', () => {
    const closedSundays = make({ schedule_name: 'closed sundays', schedule_type: 'weekly', days_of_week: '1', start_time: '00:00', end_time: '00:00', all_day: true, action: 'stop' });
    const event = make({ schedule_name: 'open house', schedule_type: 'specific_date', specific_date: '2026-11-15', start_time: '10:00', end_time: '16:00' });
    const list = policies.defaultOrder([closedSundays, event]);
    assert.deepEqual(names(list), ['open house', 'closed sundays']);
    assert.equal(policies.decide(list, at(15, 11)).on, true);
    assert.equal(policies.decide(list, at(15, 17)).on, false);
});

test('overnight and all-day windows', () => {
    const night = make({ schedule_name: 'night', start_time: '22:00', end_time: '06:00' });
    assert.equal(policies.winnerAt([night], at(10, 2)).policy, night, '02:00 belongs to the window that opened the evening before');
    assert.equal(policies.winnerAt([night], at(10, 7)), null);
    const allDay = make({ schedule_name: 'all day', schedule_type: 'specific_date', specific_date: '2026-11-12', start_time: '00:00', end_time: '00:00' });
    assert.ok(policies.winnerAt([allDay], at(12, 0)));
    assert.ok(policies.winnerAt([allDay], at(12, 23, 59)));
    assert.equal(policies.winnerAt([allDay], at(13, 0)), null);
});

test('a monthly policy applies on every day of the chosen months only', () => {
    const december = make({ schedule_name: 'december', schedule_type: 'monthly', months: '12' });
    assert.equal(policies.winnerAt([december], at(9, 9)), null);
    assert.ok(policies.winnerAt([december], new Date(2026, 11, 2, 9)));
});

test('disabled policies are ignored', () => {
    const off = weekdays({ is_active: false });
    assert.equal(policies.winnerAt([off], at(9, 9)), null);
});

test('timeline and switches for weekday hours with a Monday lunch stop', () => {
    const list = [
        make({ schedule_name: 'lunch', schedule_type: 'weekly', days_of_week: '2', start_time: '12:00', end_time: '13:00', action: 'stop' }),
        weekdays({ schedule_name: 'hours' })
    ];
    const segments = policies.timeline(list, at(9, 0), at(10, 0));
    assert.deepEqual(segments.filter((s) => s.policy).map((s) => [s.start.getHours(), s.end.getHours(), s.on, s.policy.schedule_name]), [
        [8, 12, true, 'hours'], [12, 13, false, 'lunch'], [13, 18, true, 'hours']
    ]);
    const changes = policies.transitions(list, at(9, 0), at(10, 0));
    assert.deepEqual(changes.map((c) => [c.at.getHours(), c.on]), [[8, true], [12, false], [13, true], [18, false]]);
});

test('with only Active policies the result is the old union of windows, in any order', () => {
    const list = [
        weekdays({ start_time: '08:00', end_time: '18:00' }),
        make({ schedule_type: 'weekly', days_of_week: '2', start_time: '07:00', end_time: '17:00' }),
        make({ schedule_type: 'specific_date', specific_date: '2026-11-14', start_time: '20:00', end_time: '02:00' }),
        make({ schedule_type: 'monthly', months: '11', start_time: '05:30', end_time: '06:15' })
    ];
    const union = (t) => list.some((p) => [0, -1].some((offset) => {
        const w = policies.windowOn(p, new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset));
        return w && w.startAt <= t && t < w.endAt;
    }));
    const orders = [list, [...list].reverse(), [list[2], list[0], list[3], list[1]]];
    for (let minute = 0; minute < 7 * 24 * 60; minute += 7) {
        const t = new Date(2026, 10, 9, 0, minute);
        for (const order of orders) assert.equal(policies.decide(order, t).on, union(t), t.toString());
    }
});

test('your example: Mon 08:00-18:00 and Mon 07:00-17:00 start at 7, ignore the 17:00 stop, switch off at 18:00', () => {
    const a = make({ schedule_name: 'A', schedule_type: 'weekly', days_of_week: '2', start_time: '08:00', end_time: '18:00' });
    const b = make({ schedule_name: 'B', schedule_type: 'weekly', days_of_week: '2', start_time: '07:00', end_time: '17:00' });
    const list = [a, b];
    assert.equal(policies.decide(list, at(9, 7, 1)).on, true);
    assert.equal(policies.decide(list, at(9, 17, 0, 30)).switchedOff, false);
    const six = policies.decide(list, new Date(2026, 10, 9, 18, 0, 30));
    assert.equal(six.switchedOff, true);
    assert.match(policies.offReason(six.due), /"A" ends/);
    assert.equal(policies.decide(list, new Date(2026, 10, 9, 18, 0, 30), six.key).switchedOff, false, 'the same stop never counts twice');
    assert.equal(policies.decide(list, at(9, 23)).switchedOff, false, 'off but no recent switch: a PC turned on by hand stays on');
    const state = policies.status(list, at(9, 9));
    assert.equal(state.until.getHours(), 18, 'the cards show 18:00, not 17:00');
    assert.equal(state.nextStop.getHours(), 18);
    assert.equal(state.nextStart.getDate(), 16);
});

test('a policy change that turns the kiosk off now is a switch-off; a very short gap is not', () => {
    const hours = weekdays({ schedule_name: 'hours' });
    const stopToday = make({ schedule_name: 'stop today', schedule_type: 'specific_date', specific_date: '2026-11-09', start_time: '09:00', end_time: '17:00', action: 'stop' });
    const tenOhOne = at(9, 10, 1);
    const edited = policies.decide([stopToday, hours], tenOhOne, null, { lastOn: true });
    assert.equal(edited.switchedOff, true);
    assert.match(edited.key, /^off\|edit\|/);
    assert.match(policies.offReason(edited.due), /policy change.*stop today/);
    assert.equal(policies.decide([stopToday, hours], tenOhOne, null, { lastOn: false }).switchedOff, false, 'already off at the last tick: leave it');
    assert.equal(policies.decide([stopToday, hours], tenOhOne, edited.key, { lastOn: true }).switchedOff, false, 'once only');
    const morning = make({ schedule_name: 'morning', start_time: '08:00', end_time: '12:00' });
    const afternoon = make({ schedule_name: 'afternoon', start_time: '12:02', end_time: '18:00' });
    const gap = policies.decide([morning, afternoon], new Date(2026, 10, 9, 12, 0, 30));
    assert.equal(gap.backSoon, true);
    assert.equal(gap.switchedOff, false, 'back on in 2 minutes: not a switch-off');
});

test('overlaps tells whether two policies ever cover the same moment', () => {
    const hours = weekdays({});
    const lunch = make({ schedule_name: 'lunch', start_time: '12:00', end_time: '13:00', action: 'stop' });
    const night = make({ schedule_name: 'night', start_time: '22:00', end_time: '02:00' });
    const sundays = make({ schedule_type: 'weekly', days_of_week: '1', start_time: '09:00', end_time: '17:00' });
    assert.equal(policies.overlaps(hours, lunch, at(9, 0), 14), true);
    assert.equal(policies.overlaps(hours, night, at(9, 0), 14), false);
    assert.equal(policies.overlaps(hours, sundays, at(9, 0), 14), false);
    assert.equal(policies.overlaps(night, make({ start_time: '01:00', end_time: '03:00' }), at(9, 0), 3), true, 'overnight windows count');
});

test('normalize keeps saved values for null fields and checks the types', () => {
    const saved = { schedule_name: 'lunch', action: 'stop', schedule_type: 'daily', start_time: '12:00', end_time: '13:00', is_active: true };
    assert.equal(policies.normalize({ action: null }, saved).policy.action, 'stop');
    assert.match(policies.normalize({ schedule_name: 42 }, saved).error, /name/);
    assert.match(policies.normalize({ is_active: 'yes' }, saved).error, /is_active/);
});

test('wake times: three minutes before each switch-on, none for a stop day, capped', () => {
    const hours = weekdays({ schedule_name: 'hours' });
    const holiday = make({ schedule_name: 'holiday', schedule_type: 'specific_date', specific_date: '2026-11-11', start_time: '00:00', end_time: '00:00', all_day: true, action: 'stop' });
    const { times } = policies.wakeTimes([holiday, hours], at(9, 20), { days: 7 });
    assert.deepEqual(times.map((t) => `${t.getDate()} ${t.getHours()}:${t.getMinutes()}`), ['10 7:57', '12 7:57', '13 7:57', '16 7:57']);
    const capped = policies.wakeTimes([make({})], at(9, 20), { days: 30, max: 5 });
    assert.equal(capped.times.length, 5);
    assert.ok(capped.dropped > 0);
});

test('a long Stop period still leaves one wake-up: the first switch-on after it', () => {
    const hours = make({ schedule_name: 'hours' });
    const december = make({ schedule_name: 'closed in December', schedule_type: 'monthly', months: '12', start_time: '00:00', end_time: '00:00', all_day: true, action: 'stop' });
    const now = new Date(2026, 11, 1, 20, 0);
    const { times } = policies.wakeTimes([december, hours], now, { days: 14 });
    assert.deepEqual(times.map((t) => `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()} ${t.getHours()}:${t.getMinutes()}`), ['2027-1-1 7:57']);
    const state = policies.status([december, hours], now);
    assert.equal(state.on, false);
    assert.equal(state.nextStart.getFullYear(), 2027, 'the card shows the far start instead of nothing');
    assert.equal(policies.wakeTimes([], now).times.length, 0, 'no policies: no wake-up');
});

test('normalize checks and tidies what the admin page sends', () => {
    assert.match(policies.normalize({ schedule_type: 'daily', start_time: '08:00', end_time: '18:00' }).error, /name/);
    assert.match(policies.normalize({ schedule_name: 'x', schedule_type: 'weekly', start_time: '08:00', end_time: '18:00', days_of_week: '' }).error, /day/);
    assert.match(policies.normalize({ schedule_name: 'x', schedule_type: 'monthly', start_time: '08:00', end_time: '18:00' }).error, /month/);
    assert.match(policies.normalize({ schedule_name: 'x', schedule_type: 'specific_date', specific_date: '2026-02-30', start_time: '08:00', end_time: '18:00' }).error, /date/);
    assert.match(policies.normalize({ schedule_name: 'x', schedule_type: 'daily', start_time: '09:00', end_time: '09:00' }).error, /All day/);
    assert.match(policies.normalize({ schedule_name: 'x', schedule_type: 'daily', action: 'pause', start_time: '08:00', end_time: '18:00' }).error, /Active or Stop/);
    const ok = policies.normalize({ schedule_name: '  Weekday   hours ', schedule_type: 'weekly', days_of_week: [6, 2, 2, 9], start_time: '8:00', end_time: '18:30' }).policy;
    assert.deepEqual(
        { name: ok.schedule_name, days: ok.days_of_week, start: ok.start_time, action: ok.action, enabled: ok.is_active },
        { name: 'Weekday hours', days: '2,6', start: '08:00', action: 'active', enabled: true }
    );
    const allDay = policies.normalize({ schedule_name: 'x', schedule_type: 'daily', all_day: true, action: 'stop' }).policy;
    assert.deepEqual([allDay.start_time, allDay.end_time, allDay.action], ['00:00', '00:00', 'stop']);
    const edited = policies.normalize({ is_active: false }, { schedule_name: 'kept', schedule_type: 'daily', start_time: '08:00', end_time: '18:00' }).policy;
    assert.equal(edited.schedule_name, 'kept');
    assert.equal(edited.is_active, false);
});

test('preview can start on a picked date, and today stays today', () => {
    const p = policies.preview([weekdays({ schedule_name: 'hours' })], at(9, 10), 7, new Date(2026, 11, 25));
    assert.equal(p.start, '2026-12-25');
    assert.equal(p.today, '2026-11-09');
    assert.deepEqual(p.days.map((d) => d.date), ['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
    assert.equal(p.days[0].segments.length, 1, 'Fri 25 Dec has the weekday hours');
    assert.equal(p.days[1].segments.length, 0, 'Sat 26 Dec has none');
    assert.equal(policies.preview([], at(9, 10), 1).start, '2026-11-09', 'without a date it starts today');
});

test('preview cuts each day at midnight and names the deciding policy', () => {
    const list = [
        make({ schedule_name: 'lunch', schedule_type: 'weekly', days_of_week: '2', start_time: '12:00', end_time: '13:00', action: 'stop' }),
        make({ schedule_name: 'late', start_time: '22:00', end_time: '02:00' })
    ];
    const p = policies.preview(list, at(9, 10), 2);
    assert.equal(p.days.length, 2);
    assert.equal(p.nowMin, 600);
    const monday = p.days[0].segments.map((s) => [s.from, s.to, s.on, s.name]);
    assert.deepEqual(monday, [['00:00', '02:00', true, 'late'], ['12:00', '13:00', false, 'lunch'], ['22:00', '24:00', true, 'late']]);
});
test('a policy keeps one of the calendar colours, an edit without one keeps the saved colour, the preview carries it', () => {
    const base = { schedule_name: 'Open house', schedule_type: 'daily', start_time: '09:00', end_time: '21:00' };
    assert.equal(policies.normalize({ ...base, color: 'teal' }).policy.color, 'teal');
    assert.equal(policies.normalize({ ...base, color: 'neon' }).policy.color, null);
    assert.equal(policies.normalize({ ...base }).policy.color, null);
    assert.equal(policies.normalize({ ...base, start_time: '10:00' }, { ...base, color: 'rose' }).policy.color, 'rose');
    assert.equal(policies.COLORS.length, 10);
    const open = make({ schedule_name: 'open', color: 'indigo' });
    const plain = make({ schedule_name: 'plain', start_time: '18:00', end_time: '20:00' });
    const day = policies.preview([open, plain], at(9, 7), 1).days[0];
    assert.deepEqual(day.segments.map((s) => [s.name, s.color]), [['open', 'indigo'], ['plain', null]]);
});
// <Jun Kai end>
