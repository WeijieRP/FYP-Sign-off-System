// Owner: Role 3, Jun Kai.
// Unit tests for the Visitor Data Archive: settings, Singapore dates and the schedule, folder and file rules, the zip writer. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const paths = require('../../backend/core/paths');
const zip = require('../../backend/core/zip');
const settingsStore = require('../../backend/features/archive/visitorSettings');
const schedule = require('../../backend/features/archive/visitorSchedule');
const files = require('../../backend/features/archive/visitorFiles');
const writer = require('../../backend/features/archive/visitorWriter');
const deletedCounts = require('../../backend/features/archive/deletedCounts');
const saveGate = require('../../backend/features/archive/saveGate');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'va-unit-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }));

const NOW = new Date('2026-11-09T06:32:00.000Z'); // Monday 9 Nov 2026, 14:32 in Singapore
const iso = (date) => (date ? date.toISOString() : date);
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaults = () => clone(settingsStore.DEFAULTS);
// always pass the previous settings, so the real backend/data file is never read
const check = (changes) => settingsStore.validate({ ...defaults(), ...changes }, defaults());

test('the archive helpers load without the database, auth or analysis cache modules', () => {
    const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, '/'));
    assert.deepEqual(loaded.filter((file) => /backend\/(core\/(db|auth)|features\/analysis\/cacheStore)\.js$/.test(file)), []);
});

test('the committed defaults file is DEFAULTS and passes validate()', () => {
    const file = JSON.parse(fs.readFileSync(path.join(paths.DEFAULTS, settingsStore.FILE_NAME), 'utf8'));
    assert.deepEqual(file, settingsStore.DEFAULTS);
    assert.deepEqual(settingsStore.validate(file, clone(file)).settings, file);
});

test('keep periods take their whole range and refuse one step past it', () => {
    for (const [unit, [min, max]] of Object.entries(settingsStore.LIMITS.keep)) {
        for (const key of ['feedback', 'lostFound']) {
            const keepFor = (amount) => check({ [key]: { ...defaults()[key], keep: { amount, unit } } });
            assert.ok(keepFor(min).settings, `${key} ${min} ${unit}`);
            assert.ok(keepFor(max).settings, `${key} ${max} ${unit}`);
            assert.equal(keepFor(min - 1).field, `${key}.keep.amount`);
            assert.equal(keepFor(max + 1).field, `${key}.keep.amount`);
        }
    }
    assert.equal(check({ feedback: { enabled: true, keep: { amount: 1.5, unit: 'months' } } }).field, 'feedback.keep.amount');
    assert.equal(check({ feedback: { enabled: true, keep: { amount: 12, unit: 'decades' } } }).field, 'feedback.keep.unit');
    assert.equal(check({ feedback: { enabled: true, keep: { amount: '6', unit: 'months' } } }).settings.feedback.keep.amount, 6, 'a number typed as text is fine');
});

test('schedule, storage and switch values are checked against LIMITS too', () => {
    const { LIMITS } = settingsStore;
    const auto = (changes) => check({ automatic: { ...defaults().automatic, ...changes } });
    for (const key of ['dayOfMonth', 'weekday', 'everyDays']) {
        const [min, max] = LIMITS[key];
        assert.ok(auto({ [key]: min }).settings, `${key} ${min}`);
        assert.ok(auto({ [key]: max }).settings, `${key} ${max}`);
        assert.equal(auto({ [key]: min - 1 }).field, `automatic.${key}`);
        assert.equal(auto({ [key]: max + 1 }).field, `automatic.${key}`);
    }
    for (const frequency of LIMITS.frequency) assert.ok(auto({ frequency }).settings, frequency);
    assert.equal(auto({ frequency: 'hourly' }).field, 'automatic.frequency');
    for (const time of ['', '00:00', '09:30', '23:59']) assert.ok(auto({ time }).settings, time);
    for (const time of ['24:00', '9:30', '12:60', 'noon', null]) assert.equal(auto({ time }).field, 'automatic.time', String(time));

    for (const [unit, [min, max]] of Object.entries(LIMITS.keepFiles)) {
        assert.ok(check({ keepFiles: { amount: min, unit } }).settings, `${min} ${unit}`);
        assert.ok(check({ keepFiles: { amount: max, unit } }).settings, `${max} ${unit}`);
        assert.equal(check({ keepFiles: { amount: max + 1, unit } }).field, 'keepFiles.amount');
    }
    assert.deepEqual(check({ keepFiles: { amount: 0, unit: 'months' } }).settings.keepFiles, { amount: 0, unit: 'months' }, '0 keeps files forever');
    assert.equal(check({ keepFiles: { amount: -1, unit: 'years' } }).field, 'keepFiles.amount');
    assert.equal(check({ keepFiles: { amount: 2, unit: 'days' } }).field, 'keepFiles.unit');

    assert.equal(check({ includePhotos: 'yes' }).field, 'includePhotos');
    assert.equal(check({ deleteAfterArchive: 1 }).field, 'deleteAfterArchive');
    assert.equal(check({ lostFound: { ...defaults().lostFound, onlyResolved: 'true' } }).field, 'lostFound.onlyResolved');

    const outside = path.join(TMP, 'archives');
    assert.equal(check({ folder: '' }).settings.folder, '');
    assert.equal(check({ folder: `  ${outside}  ` }).settings.folder, outside, 'spaces around the path are dropped');
    assert.equal(check({ folder: 'archives' }).field, 'folder');
    assert.equal(check({ folder: path.join(paths.FRONTEND, 'archives') }).field, 'folder');
    assert.equal(check({ folder: path.join(TMP, 'x'.repeat(LIMITS.folderMaxLength + 1)) }).field, 'folder');
    assert.equal(settingsStore.validate('nope', defaults()).error.length > 0, true);
});

test('automatic.enabledAt is set by the server when automatic archiving is switched on', () => {
    const off = defaults();
    const before = Date.now();
    const on = settingsStore.validate({ ...off, automatic: { ...off.automatic, enabled: true, enabledAt: '1999-01-01T00:00:00.000Z' } }, off).settings;
    const at = new Date(on.automatic.enabledAt).getTime();
    assert.ok(at >= before && at <= Date.now(), 'the value the page sent is ignored');

    const stillOn = settingsStore.validate({ ...on, automatic: { ...on.automatic, enabledAt: null, dayOfMonth: 15 } }, on).settings;
    assert.equal(stillOn.automatic.enabledAt, on.automatic.enabledAt, 'staying on keeps the first time');
    assert.equal(settingsStore.validate({ ...on, automatic: { ...on.automatic, enabled: false } }, on).settings.automatic.enabledAt, null);

    const leftOut = settingsStore.validate({ includePhotos: false }, on).settings;
    assert.equal(leftOut.includePhotos, false);
    assert.deepEqual(leftOut.automatic, on.automatic, 'keys the body leaves out keep their saved value');

    const nothingToArchive = { ...off, feedback: { ...off.feedback, enabled: false }, lostFound: { ...off.lostFound, enabled: false }, automatic: { ...off.automatic, enabled: true } };
    assert.equal(settingsStore.validate(nothingToArchive, off).field, 'automatic.enabled');
});

test('automatic archiving is refused with export only, and keys like password are never saved', () => {
    const off = defaults();
    const exportOnly = check({ deleteAfterArchive: false, automatic: { ...off.automatic, enabled: true } });
    assert.equal(exportOnly.field, 'automatic.enabled');
    assert.equal(exportOnly.error, 'Automatic archiving needs Delete the records from the database. With export only, every run would save the same records again.');
    assert.equal(exportOnly.error, settingsStore.EXPORT_ONLY_AUTOMATIC, 'the scheduler uses the same sentence');

    const on = settingsStore.validate({ ...off, automatic: { ...off.automatic, enabled: true } }, off).settings;
    assert.equal(settingsStore.validate({ deleteAfterArchive: false }, on).field, 'automatic.enabled', 'switching to export only while automatic is on');
    assert.equal(settingsStore.validate({ deleteAfterArchive: false, automatic: { enabled: false } }, on).settings.deleteAfterArchive, false);
    assert.equal(check({ deleteAfterArchive: false }).settings.deleteAfterArchive, false, 'export only by hand is fine');

    const saved = check({ password: 'typed-in', somethingElse: 1 }).settings;
    assert.deepEqual(Object.keys(saved).sort(), Object.keys(settingsStore.DEFAULTS).sort());
});

test('read() repairs a hand-edited settings file and write() saves what read() gives back', (t) => {
    const file = path.join(TMP, 'settings', settingsStore.FILE_NAME);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    t.mock.method(paths, 'dataFile', () => file);
    assert.deepEqual(settingsStore.read(), settingsStore.DEFAULTS, 'no file yet: the defaults');

    fs.writeFileSync(file, JSON.stringify({
        feedback: { enabled: 'no', keep: { amount: 999, unit: 'months' } },
        lostFound: { enabled: false, keep: { amount: 0, unit: 'fortnights' }, onlyResolved: 'yes' },
        includePhotos: false,
        automatic: { enabled: true, frequency: 'hourly', dayOfMonth: 31, weekday: 9, everyDays: 0, time: '25:00', enabledAt: 'not a date' },
        folder: 'relative/folder',
        keepFiles: { amount: 50, unit: 'years' }
    }));
    const repaired = settingsStore.read();
    assert.deepEqual(repaired, {
        feedback: { enabled: true, keep: { amount: 120, unit: 'months' } },
        lostFound: { enabled: false, keep: { amount: 1, unit: 'months' }, onlyResolved: false },
        includePhotos: false,
        deleteAfterArchive: true,
        leaves: 'keep',
        automatic: { enabled: true, frequency: 'monthly', dayOfMonth: 28, weekday: 6, everyDays: 1, time: '', enabledAt: null },
        folder: '',
        keepFiles: { amount: 20, unit: 'years' }
    });
    assert.ok(settingsStore.validate(repaired, repaired).settings, 'the repaired settings are valid');

    t.mock.method(console, 'error', () => {}); // jsonFile reports the broken file; not needed here
    fs.writeFileSync(file, '{ not json');
    assert.deepEqual(settingsStore.read(), settingsStore.DEFAULTS);
    fs.writeFileSync(file, JSON.stringify({ folder: '\\\\nas\\visitor-archives' }));
    assert.equal(settingsStore.read().folder, '', 'a network folder typed into the file falls back to the default folder');

    const off = defaults();
    const saved = settingsStore.validate({ ...off, includePhotos: false, automatic: { ...off.automatic, enabled: true, frequency: 'weekly', time: '07:15' } }, off).settings;
    settingsStore.write(saved);
    assert.deepEqual(settingsStore.read(), saved);
});

test('sgtDayStart and toSgtDay work in Singapore days', () => {
    assert.equal(iso(schedule.sgtDayStart('2025-11-09')), '2025-11-08T16:00:00.000Z');
    assert.equal(iso(schedule.sgtDayStart('2028-02-29')), '2028-02-28T16:00:00.000Z');
    for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-2-3', '09/11/2026', '', null, undefined]) {
        assert.equal(schedule.sgtDayStart(bad), null, String(bad));
    }
    assert.equal(schedule.toSgtDay(new Date('2025-11-08T16:00:00.000Z')), '2025-11-09');
    assert.equal(schedule.toSgtDay(new Date('2025-11-08T15:59:59.999Z')), '2025-11-08');
    assert.equal(schedule.toSgtDay(schedule.sgtDayStart('2026-01-01')), '2026-01-01');
});

test('cutoffFor counts back on the Singapore calendar and starts at midnight of that day', () => {
    const cut = (amount, unit, now = NOW) => iso(schedule.cutoffFor({ amount, unit }, now));
    assert.equal(cut(12, 'months'), '2025-11-08T16:00:00.000Z', '12 months: before 9 Nov 2025');
    assert.equal(cut(1, 'years'), '2025-11-08T16:00:00.000Z');
    assert.equal(cut(10, 'days'), '2026-10-29T16:00:00.000Z');
    assert.equal(cut(2, 'weeks'), '2026-10-25T16:00:00.000Z');
    assert.equal(cut(1, 'months', new Date('2026-03-31T02:00:00.000Z')), '2026-02-27T16:00:00.000Z', '31 Mar - 1 month = 28 Feb');
    assert.equal(cut(1, 'months', new Date('2028-03-31T02:00:00.000Z')), '2028-02-28T16:00:00.000Z', 'leap year: 29 Feb');
    assert.equal(cut(1, 'years', new Date('2028-02-29T10:00:00.000Z')), '2027-02-27T16:00:00.000Z');
    // 23:30 on 9 Nov and 00:30 on 10 Nov in Singapore are both 9 Nov in UTC
    assert.equal(cut(1, 'days', new Date('2026-11-09T15:30:00.000Z')), '2026-11-07T16:00:00.000Z');
    assert.equal(cut(1, 'days', new Date('2026-11-09T16:30:00.000Z')), '2026-11-08T16:00:00.000Z');
});

const MONTHLY = { enabled: true, frequency: 'monthly', dayOfMonth: 1, weekday: 1, everyDays: 30, time: '', enabledAt: '2026-10-15T00:00:00.000Z' };

test('monthly: a run missed while the PC was off happens at the next tick, one from before it was switched on never does', () => {
    const lastMonth = { lastAutomaticAt: '2026-10-01T02:00:00.000Z' };
    assert.equal(schedule.isDue(MONTHLY, lastMonth, NOW), true, '1 Nov passed while the server PC hibernated');
    assert.equal(iso(schedule.nextDueAt(MONTHLY, lastMonth, NOW)), iso(NOW));
    const ranThisMonth = { lastAutomaticAt: '2026-11-01T01:00:00.000Z' };
    assert.equal(schedule.isDue(MONTHLY, ranThisMonth, NOW), false);
    assert.equal(iso(schedule.nextDueAt(MONTHLY, ranThisMonth, NOW)), '2026-11-30T16:00:00.000Z', '1 Dec, 00:00 in Singapore');

    const switchedOnLate = { ...MONTHLY, enabledAt: '2026-11-05T00:00:00.000Z' };
    assert.equal(schedule.isDue(switchedOnLate, {}, NOW), false, 'switched on after 1 Nov: waits for 1 Dec');
    assert.equal(iso(schedule.nextDueAt(switchedOnLate, {}, NOW)), '2026-11-30T16:00:00.000Z');
    assert.equal(schedule.isDue({ ...MONTHLY, enabled: false }, lastMonth, NOW), false);
    assert.equal(schedule.nextDueAt({ ...MONTHLY, enabled: false }, lastMonth, NOW), null);
});

test('daily and weekly runs follow the chosen time in Singapore', () => {
    const daily = { ...MONTHLY, frequency: 'daily', time: '02:00', enabledAt: '2026-11-01T00:00:00.000Z' };
    assert.equal(iso(schedule.lastScheduledAt(daily, NOW)), '2026-11-08T18:00:00.000Z', '02:00 on 9 Nov in Singapore');
    assert.equal(schedule.isDue(daily, { lastAutomaticAt: '2026-11-07T18:05:00.000Z' }, NOW), true, '02:00 was missed while hibernating');
    assert.equal(schedule.isDue(daily, { lastAutomaticAt: '2026-11-08T18:05:00.000Z' }, NOW), false);
    assert.equal(iso(schedule.nextDueAt(daily, { lastAutomaticAt: '2026-11-08T18:05:00.000Z' }, NOW)), '2026-11-09T18:00:00.000Z');
    assert.equal(schedule.isDue(daily, { lastAutomaticAt: '2026-11-07T18:05:00.000Z' }, new Date('2026-11-08T18:00:00.000Z')), true, 'due on the minute');

    const weekly = { ...daily, frequency: 'weekly', weekday: 1, time: '09:00' };
    assert.equal(schedule.isDue(weekly, {}, NOW), true, 'Monday 09:00 has passed');
    const mondayMorning = new Date('2026-11-09T00:30:00.000Z'); // 08:30, before this week's run
    assert.equal(iso(schedule.lastScheduledAt(weekly, mondayMorning)), '2026-11-02T01:00:00.000Z');
    assert.equal(schedule.isDue(weekly, { lastAutomaticAt: '2026-11-02T01:05:00.000Z' }, mondayMorning), false);
    assert.equal(iso(schedule.nextDueAt(weekly, { lastAutomaticAt: '2026-11-02T01:05:00.000Z' }, mondayMorning)), '2026-11-09T01:00:00.000Z');
    assert.equal(iso(schedule.nextScheduledAt({ ...weekly, weekday: 0 }, NOW)), '2026-11-15T01:00:00.000Z', 'Sunday is 0');
});

test('custom: every N days after the last run, or after it was switched on', () => {
    const custom = { ...MONTHLY, frequency: 'custom', everyDays: 7, enabledAt: '2026-11-01T00:00:00.000Z' };
    assert.equal(schedule.isDue(custom, {}, NOW), true, '8 days after it was switched on');
    assert.equal(schedule.isDue(custom, { lastAutomaticAt: '2026-11-05T00:00:00.000Z' }, NOW), false);
    assert.equal(iso(schedule.nextDueAt(custom, { lastAutomaticAt: '2026-11-05T00:00:00.000Z' }, NOW)), '2026-11-12T00:00:00.000Z');
    assert.equal(iso(schedule.nextDueAt({ ...custom, time: '03:00' }, { lastAutomaticAt: '2026-11-05T00:00:00.000Z' }, NOW)), '2026-11-11T19:00:00.000Z', '12 Nov at 03:00 in Singapore');
});

test('custom: switched off and on again, it counts from the switch-on, not from an older run', () => {
    // ran on 20 Oct, then automatic archiving was off until 8 Nov
    const custom = { ...MONTHLY, frequency: 'custom', everyDays: 7, enabledAt: '2026-11-08T00:00:00.000Z' };
    const oldRun = { lastAutomaticAt: '2026-10-20T00:00:00.000Z' };
    assert.equal(schedule.isDue(custom, oldRun, NOW), false, 'switching it back on never fires at once');
    assert.equal(iso(schedule.nextDueAt(custom, oldRun, NOW)), '2026-11-15T00:00:00.000Z', '7 days after the switch-on');
    assert.equal(schedule.isDue(custom, oldRun, new Date('2026-11-15T00:00:00.000Z')), true);
    assert.equal(schedule.periodKey(custom, oldRun, NOW), '2026-11-15T00:00:00.000Z', 'failed attempts are counted for that same day');
    assert.equal(iso(schedule.nextDueAt(custom, { lastAutomaticAt: '2026-11-09T01:00:00.000Z' }, NOW)), '2026-11-16T01:00:00.000Z', 'a run after the switch-on counts from that run');
});

test('a failed automatic run is tried again after an hour, at most 3 times per period', () => {
    const key = schedule.periodKey(MONTHLY, {}, NOW);
    let state = schedule.afterFailure({}, key, NOW);
    assert.equal(state.failures.count, 1);
    assert.equal(schedule.isDue(MONTHLY, state, NOW), false, 'waits an hour');
    assert.equal(iso(schedule.nextDueAt(MONTHLY, state, NOW)), '2026-11-09T07:32:00.000Z');
    const later = new Date(NOW.getTime() + schedule.RETRY_AFTER_MS);
    assert.equal(schedule.isDue(MONTHLY, state, later), true);
    state = schedule.afterFailure(schedule.afterFailure(state, key, later), key, later);
    assert.equal(state.failures, null);
    assert.equal(state.lastAutomaticAt, later.toISOString(), 'third failure: this period is given up');
    assert.equal(schedule.isDue(MONTHLY, state, new Date(later.getTime() + 2 * schedule.RETRY_AFTER_MS)), false);
});

test('filesExpired counts calendar months and 0 keeps files forever', () => {
    const keep = (amount, unit) => ({ amount, unit });
    assert.equal(schedule.filesExpired(keep(0, 'years'), '2000-01-01T00:00:00Z', NOW), false);
    assert.equal(schedule.filesExpired(keep(1, 'years'), '2025-11-01T00:00:00Z', NOW), true);
    assert.equal(schedule.filesExpired(keep(1, 'years'), '2025-11-10T00:00:00Z', NOW), false);
    assert.equal(schedule.filesExpired(keep(6, 'months'), '2026-05-08T00:00:00Z', NOW), true);
    assert.equal(schedule.filesExpired(keep(6, 'months'), '2026-05-10T00:00:00Z', NOW), false);
    assert.equal(schedule.filesExpired(keep(6, 'months'), '2026-08-31T00:00:00Z', new Date('2027-02-28T01:00:00Z')), true, '31 Aug + 6 months = 28 Feb');
    assert.equal(schedule.filesExpired(keep(1, 'years'), null, NOW), false);
    assert.equal(schedule.filesExpired(keep(1, 'years'), 'not a date', NOW), false);
});

test('filesExpired: a file stays until the moment its keep period ends (finished_at comes from MySQL as a Date)', () => {
    const yearAgo = new Date('2025-11-09T06:32:00.000Z'); // exactly 1 year before NOW
    const later = new Date(NOW.getTime() + 1000);
    assert.equal(schedule.filesExpired({ amount: 1, unit: 'years' }, yearAgo, NOW), false);
    assert.equal(schedule.filesExpired({ amount: 1, unit: 'years' }, yearAgo, later), true);
    assert.equal(schedule.filesExpired({ amount: 12, unit: 'months' }, yearAgo, later), true, '12 months is the same as 1 year');
    assert.equal(schedule.filesExpired({ amount: 0, unit: 'months' }, yearAgo, later), false, '0 months keeps files forever too');
});

test('resolveUploadPath takes both stored path shapes and never leaves uploads/', () => {
    assert.equal(files.resolveUploadPath('photos/a.png'), path.join(paths.UPLOADS, 'photos', 'a.png'));
    assert.equal(files.resolveUploadPath('processed/b_processed.gif'), path.join(paths.UPLOADS, 'processed', 'b_processed.gif'));
    assert.equal(files.resolveUploadPath('/uploads/lost-found/c.jpg'), path.join(paths.UPLOADS, 'lost-found', 'c.jpg'));
    assert.equal(files.resolveUploadPath('photos\\d.png'), path.join(paths.UPLOADS, 'photos', 'd.png'));
    for (const bad of ['photos/../../package.json', '../package.json', '/uploads/../backend/server.js', 'photos/../..', '/uploads/', '', '   ', null, 42]) {
        assert.equal(files.resolveUploadPath(bad), null, String(bad));
    }
    if (process.platform === 'win32') assert.equal(files.resolveUploadPath('C:/Windows/win.ini'), null);
});

test('planPhotos lists missing files and never reads a path outside uploads/', async () => {
    const plan = await files.planPhotos(
        [
            { id: 1, photo_path: `photos/va-unit-missing-${Date.now()}.png`, processed_photo_path: null, data_retention: 'longterm' },
            { id: 2, photo_path: 'photos/../../package.json', processed_photo_path: '', data_retention: 'longterm' }
        ],
        [{ id: 3, item_photo_path: '/uploads/lost-found/va-unit-missing.png' }],
        true
    );
    assert.equal(plan.photos.length, 0, 'package.json exists, but it is not an upload');
    assert.deepEqual(plan.missing.map((m) => `${m.table}:${m.id}:${m.column}`), ['feedback:1:photo_path', 'feedback:2:photo_path', 'lost_found_reports:3:item_photo_path']);
    assert.ok(plan.sources.every((source) => source.entry === null));
});

test('planPhotos leaves temporary-consent and switched-off photos out of the zip but still lists them for deletion', async () => {
    const uploads = fs.mkdtempSync(path.join(TMP, 'uploads-'));
    for (const [folder, name, size] of [['photos', 'a.png', 10], ['processed', 'a.png', 20], ['photos', 'b.png', 30], ['lost-found', 'c.jpg', 40]]) {
        fs.mkdirSync(path.join(uploads, folder), { recursive: true });
        fs.writeFileSync(path.join(uploads, folder, name), Buffer.alloc(size));
    }
    const feedback = [
        { id: 1, photo_path: 'photos/a.png', processed_photo_path: 'processed/a.png', data_retention: 'longterm' },
        { id: 2, photo_path: 'photos/b.png', processed_photo_path: null, data_retention: '7days' }
    ];
    const lostFound = [{ id: 3, item_photo_path: '/uploads/lost-found/c.jpg' }];
    const original = paths.UPLOADS;
    paths.UPLOADS = uploads; // a temp uploads folder for this test only
    try {
        const plan = await files.planPhotos(feedback, lostFound, true);
        assert.deepEqual(plan.photos.map((p) => p.entry), ['photos/feedback/1-raw.png', 'photos/feedback/1-processed.png', 'photos/lost-found/3.jpg']);
        assert.equal(plan.temporaryTrimmed, 1);
        assert.deepEqual([plan.onDisk, plan.onDiskBytes, plan.includedBytes], [4, 100, 70]);
        assert.equal(plan.sources.length, 4, 'every photo still goes with its record');
        const off = await files.planPhotos(feedback, lostFound, false);
        assert.deepEqual([off.photos.length, off.temporaryTrimmed, off.sources.length, off.onDisk], [0, 0, 4, 4]);
    } finally {
        paths.UPLOADS = original;
    }
});

test('checkFolder refuses relative and web-served folders and accepts a temp folder', async () => {
    assert.match((await files.checkFolder('archives')).problem, /full folder path/);
    for (const served of [path.join(paths.FRONTEND, 'archives'), path.join(paths.UPLOADS, 'archives'), paths.UPLOADS]) {
        assert.match((await files.checkFolder(served)).problem, /served by the web server/, served);
    }
    assert.match((await files.checkFolder(path.join(paths.ROOT, 'backend', 'archives'))).problem, /outside the app folder/);
    assert.equal(files.folderProblem(path.join(paths.DATA, 'archives')), null, 'the default folder is allowed');

    const temp = await files.checkFolder(TMP);
    assert.equal(temp.problem, null);
    assert.equal(temp.exists, true);
    assert.equal(temp.writable, true);
    assert.ok(temp.freeBytes > 0 && temp.totalBytes >= temp.freeBytes);

    const notYet = path.join(TMP, 'not-made-yet', 'archives');
    const planned = await files.checkFolder(notYet);
    assert.equal(planned.problem, null);
    assert.equal(planned.exists, false);
    assert.equal(planned.willCreate, true);
    assert.equal(fs.existsSync(notYet), false, 'checking a folder never creates it');

    const aFile = path.join(TMP, 'not-a-folder.txt');
    fs.writeFileSync(aFile, 'x');
    assert.match((await files.checkFolder(aFile)).problem, /file, not a folder/);
    const byDefault = await files.checkFolder('');
    assert.equal(byDefault.isDefault, true);
    assert.equal(byDefault.path, files.DEFAULT_FOLDER);
});

test('network folders are refused wherever a folder is checked', async () => {
    const network = 'Choose a folder on this PC or on a drive plugged into it. Network folders are not supported.';
    for (const folder of ['\\\\server\\share\\archives', '//server/share/archives', '\\\\?\\C:\\archives', '\\\\.\\C:\\archives', '  \\\\nas\\backup  ']) {
        assert.equal(files.folderTextProblem(folder), network, folder);
        assert.deepEqual(check({ folder }), { error: network, field: 'folder' }, folder);
        assert.equal((await files.checkFolder(folder)).problem, network, folder);
    }
});

test('archive file names and photo entry names are made by the server', () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'names-'));
    assert.equal(files.pickArchiveName(dir, NOW), 'visitor-archive-2026-11-09-1432.zip');
    fs.writeFileSync(path.join(dir, 'visitor-archive-2026-11-09-1432.zip.partial'), '');
    assert.equal(files.pickArchiveName(dir, NOW), 'visitor-archive-2026-11-09-1432-2.zip', 'a leftover partial file counts as taken');
    assert.equal(files.pickArchiveName(dir, NOW, ['VISITOR-ARCHIVE-2026-11-09-1432-2.zip']), 'visitor-archive-2026-11-09-1432-3.zip', 'names in the history count too');
    const listing = ['visitor-archive-2026-11-09-1432.zip.sha256'];
    assert.equal(files.pickArchiveName(path.join(TMP, 'not-made'), NOW, [], listing), 'visitor-archive-2026-11-09-1432-2.zip', 'a run passes the folder listing it read itself');

    assert.equal(files.photoEntryName('feedback', 5, 'photo_path', 'photos/Visitor_kiosk.PNG'), 'photos/feedback/5-raw.png');
    assert.equal(files.photoEntryName('feedback', 5, 'processed_photo_path', 'processed/x_processed.gif'), 'photos/feedback/5-processed.gif');
    assert.equal(files.photoEntryName('lost_found_reports', 7, 'item_photo_path', '/uploads/lost-found/umbrella_1.jpeg'), 'photos/lost-found/7.jpeg');
    assert.equal(files.photoEntryName('feedback', 5, 'photo_path', 'photos/no-extension'), 'photos/feedback/5-raw.bin');
    assert.equal(files.photoEntryName('feedback', 5, 'photo_path', 'photos/odd.toolong'), 'photos/feedback/5-raw.bin');
});

test('CSV cells are quoted, formulas are neutralised and the file starts with a BOM', () => {
    assert.equal(files.csvCell('plain'), '"plain"');
    assert.equal(files.csvCell('say "hi"'), '"say ""hi"""');
    for (const risky of ['=1+1', '+65 1234', '-2', '@SUM(A1)', '\tx', '\rx']) assert.equal(files.csvCell(risky), `"'${risky}"`, JSON.stringify(risky));
    assert.equal(files.csvCell(0), '"0"');
    assert.equal(files.csvCell(-5), '"-5"', 'numbers are not text, so they stay numbers');
    assert.equal(files.csvCell(null), '""');
    assert.equal(files.csvCell(undefined), '""');
    assert.equal(files.csvCell(new Date('2026-11-09T06:32:00Z')), '"2026-11-09T06:32:00.000Z"');
    assert.equal(files.toCsv(['ID', 'Pledge'], [[1, '=cmd'], [2, 'ok']]), '\uFEFF"ID","Pledge"\r\n"1","\'=cmd"\r\n"2","ok"\r\n');
});

const CREATED = new Date('2024-01-02T03:04:05.000Z');
// made up, and low entropy so the gitleaks scan in CI leaves it alone
const FINGERPRINT = 'f00df00df00df00d';
const META = {
    archiveId: 77, createdAt: NOW, createdBy: 'systemadmin', trigger: 'manual',
    criteria: { types: ['feedback', 'lostFound'], feedbackBefore: new Date('2025-11-08T16:00:00Z'), lostFoundBefore: new Date('2025-11-08T16:00:00Z'), onlyResolved: false },
    photosIncluded: true, deleteAfterArchive: true, encryption: { keyFingerprint: FINGERPRINT, developmentKey: false }
};
const ENTRY_NAMES = ['README.txt', 'data/visitors.json', 'data/feedback.json', 'data/lost-found.json', 'data/questions.json', 'csv/feedback.csv',
    'csv/answers.csv', 'csv/lost-found.csv', 'photos/feedback/5-raw.png', 'photos/feedback/5-processed.jpg', 'manifest.json'];
const fakeEncrypt = (text) => `enc:${Buffer.from(text).toString('hex')}`;

// one visitor with two submissions (only one goes in), one lost & found report and two photo files
// (includePhotos false: the photos still go with the records, but none of them is put in the zip)
function makeSelection({ includePhotos = true } = {}) {
    const dir = fs.mkdtempSync(path.join(TMP, 'zip-'));
    const photo = { raw: path.join(dir, 'raw.png'), processed: path.join(dir, 'processed.jpg') };
    fs.writeFileSync(photo.raw, Buffer.alloc(5000, 7));
    fs.writeFileSync(photo.processed, Buffer.alloc(3000, 9));
    const raw = {
        feedback: [{ id: 5, user_id: 9, comment: '=HYPERLINK("x")', metadata: JSON.stringify({ pledgeTopics: ['Energy', 'Water'] }), photo_path: 'photos/raw.png',
            processed_photo_path: 'processed/processed.jpg', data_retention: 'longterm', is_active: 1, archive_status: 'archived', created_at: CREATED }],
        answers: [{ id: 1, feedback_id: 5, question_id: 3, answer_value: '2', created_at: CREATED, question_text: 'Which topic?', question_type: 'choice', option_label: 'Renewable Energy' }],
        likes: [{ id: 4, feedback_id: 5, user_identifier: 'user_1', created_at: CREATED }],
        users: [{ id: 9, name: 'Test Visitor', email_encrypted: 'aa:bb:cc', visit_count: 2, created_at: CREATED, last_visit: CREATED }],
        userTotals: new Map([[9, { total: 2, temporary: 0 }]]),
        orphanIds: [],
        lostFound: [{ id: 3, tracking_code: 'LF-00003', report_type: 'lost', item_description: 'Umbrella', location_text: 'Hall', contact_info: 'owner@example.com',
            details: null, item_photo_path: null, feedback_progress: '{"email":"owner@example.com"}', status: 'new', created_at: CREATED, updated_at: CREATED }],
        questions: [{ id: 3, question_text: 'Which topic?', question_type: 'choice', is_active: 1 }],
        options: [{ id: 2, question_id: 3, option_label: 'Renewable Energy', display_order: 2 }]
    };
    const plan = {
        sources: [
            { entry: 'photos/feedback/5-raw.png', table: 'feedback', id: 5, column: 'photo_path', path: 'photos/raw.png' },
            { entry: 'photos/feedback/5-processed.jpg', table: 'feedback', id: 5, column: 'processed_photo_path', path: 'processed/processed.jpg' }
        ],
        photos: [{ entry: 'photos/feedback/5-raw.png', file: photo.raw, size: 5000 }, { entry: 'photos/feedback/5-processed.jpg', file: photo.processed, size: 3000 }],
        missing: [], onDisk: 2, onDiskBytes: 8000, includedBytes: 8000, temporaryTrimmed: 0
    };
    if (!includePhotos) Object.assign(plan, { sources: plan.sources.map((s) => ({ ...s, entry: null })), photos: [], includedBytes: 0 });
    return { dir, photo, selection: writer.buildSelection(raw, plan, { encrypt: fakeEncrypt }) };
}

async function makeArchive({ meta = META, includePhotos = true } = {}) {
    const made = makeSelection({ includePhotos });
    const file = path.join(made.dir, 'archive.zip.partial');
    const progress = [];
    const written = await writer.writeArchive(made.selection, meta, file, (p) => progress.push(p));
    return { ...made, file, written, progress };
}

// an archive made with these choices, its entry names and its README.txt
async function archiveWith(choices) {
    const made = await makeArchive({ meta: { ...META, ...choices }, includePhotos: choices.photosIncluded !== false });
    const handle = await zip.openZip(made.file);
    try {
        const entries = await zip.listEntries(handle);
        return { ...made, names: [...entries.keys()], readme: (await zip.readEntry(handle, entries.get('README.txt'))).toString('utf8') };
    } finally {
        handle.close();
    }
}

// copies a zip without one of its entries; the manifest still lists it
async function copyWithout(from, to, skip) {
    const handle = await zip.openZip(from);
    const parts = [];
    try {
        for (const [name, entry] of await zip.listEntries(handle)) if (name !== skip) parts.push([name, await zip.readEntry(handle, entry)]);
    } finally {
        handle.close();
    }
    const archive = zip.createZipArchive();
    const done = pipeline(archive, fs.createWriteStream(to));
    for (const [name, buffer] of parts) archive.append(buffer, { name });
    await Promise.all([archive.finalize(), done]);
}

test('buildSelection: who stays in the database, what gets encrypted, what temporary consent leaves out', () => {
    const { selection } = makeSelection();
    assert.deepEqual(selection.counts, { visitors: 1, visitorsKept: 1, visitorsDeleted: 0, feedback: 1, answers: 1, likes: 1, lostFound: 1, photos: 2, missingPhotos: 0, temporaryTrimmed: 0 });
    assert.deepEqual(selection.ids, { feedback: [5], visitors: [9], visitorsDeleted: [], lostFound: [3] });
    const report = selection.records.lostFound[0];
    assert.equal('contact_info' in report || 'feedback_progress' in report, false, 'plain contact details are never kept');
    assert.equal(report.contact_info_encrypted, fakeEncrypt('owner@example.com'));
    assert.equal(report.feedback_progress_encrypted, fakeEncrypt('{"email":"owner@example.com"}'));
    assert.deepEqual(selection.records.feedback[0].answers.map((a) => [a.answer_value, a.answer_text]), [['2', 'Renewable Energy']]);

    const legacy = writer.buildSelection({
        feedback: [{ id: 6, user_id: 10, comment: 'x', data_retention: 'temporary', created_at: CREATED }],
        answers: [], likes: [],
        users: [{ id: 10, name: 'Old Visitor', email_encrypted: 'dd:ee:ff' }, { id: 11, name: 'No Feedback', email_encrypted: null }],
        userTotals: new Map([[10, { total: 1, temporary: 1 }]]),
        orphanIds: [11],
        lostFound: [{ id: 4, contact_info: 'x', feedback_progress: null, created_at: CREATED }],
        questions: [], options: []
    }, { sources: [], photos: [], missing: [], onDisk: 1, onDiskBytes: 10, includedBytes: 0, temporaryTrimmed: 1 });
    assert.deepEqual(legacy.ids.visitorsDeleted, [10, 11]);
    assert.equal(legacy.records.visitors[0].email_encrypted, null, 'temporary consent only: the email is not kept');
    assert.equal(legacy.counts.temporaryTrimmed, 2, 'one photo and one email');
    assert.equal('contact_info_encrypted' in legacy.records.lostFound[0] || 'contact_info' in legacy.records.lostFound[0], false, 'a preview has no contact details at all');
});

// <Jun Kai start> since migration 010 the contact is stored encrypted: the archive copies it, it never encrypts it twice
test('buildSelection copies an already encrypted contact as it is and still encrypts a plain one from before', () => {
    const plan = { sources: [], photos: [], missing: [], onDisk: 0, onDiskBytes: 0, includedBytes: 0, temporaryTrimmed: 0 };
    const raw = {
        feedback: [], answers: [], likes: [], users: [], userTotals: new Map(), orphanIds: [], questions: [], options: [],
        lostFound: [
            { id: 7, contact_info: '', contact_info_encrypted: 'aa:bb:cc', feedback_progress: null, created_at: CREATED },
            { id: 8, contact_info: 'old@example.com', contact_info_encrypted: null, feedback_progress: null, created_at: CREATED }
        ]
    };
    const real = writer.buildSelection(raw, plan, { encrypt: fakeEncrypt });
    assert.equal(real.records.lostFound[0].contact_info_encrypted, 'aa:bb:cc', 'copied as it is');
    assert.equal(real.records.lostFound[1].contact_info_encrypted, fakeEncrypt('old@example.com'), 'a plain one from before is encrypted');
    assert.equal(real.records.lostFound.some((r) => 'contact_info' in r), false, 'no plain contact column in the archive');
    const preview = writer.buildSelection(raw, plan, {});
    assert.equal(preview.records.lostFound.some((r) => 'contact_info_encrypted' in r || 'contact_info' in r), false, 'a preview has no contact at all');
});
// <Jun Kai end>

test('buildSelection keeps a visitor seen at or after the guard, the same rule as the users DELETE', () => {
    const guard = new Date('2025-11-08T16:00:00.000Z');
    const before = new Date(guard.getTime() - 1000);
    const visitor = (id, lastVisit, createdAt = CREATED) => ({ id, name: `Visitor ${id}`, email_encrypted: null, visit_count: 1, created_at: createdAt, last_visit: lastVisit });
    const raw = {
        // each visitor's only submission is in this archive, so only the guard can keep them
        feedback: [1, 2, 3, 4].map((id) => ({ id: 100 + id, user_id: id, comment: 'x', data_retention: 'longterm', created_at: CREATED })),
        answers: [], likes: [],
        // 3 came back to the kiosk while the zip was being written; 4 has no last visit, so the day they were added counts
        users: [visitor(1, before), visitor(2, guard), visitor(3, new Date('2026-11-09T06:31:30.000Z')), visitor(4, null, guard), visitor(5, before)],
        userTotals: new Map([1, 2, 3, 4].map((id) => [id, { total: 1, temporary: 0 }])),
        orphanIds: [5],
        lostFound: [], questions: [], options: [], guard
    };
    const noPhotos = { sources: [], photos: [], missing: [], onDisk: 0, onDiskBytes: 0, includedBytes: 0, temporaryTrimmed: 0 };
    const selection = writer.buildSelection(raw, noPhotos);
    assert.deepEqual(selection.ids.visitorsDeleted, [1, 5], 'only the visitors last seen before the guard are deleted');
    assert.deepEqual(selection.records.visitors.map((v) => v.keptInDatabase), [false, true, true, true, false]);
    assert.deepEqual([selection.counts.visitorsKept, selection.counts.visitorsDeleted, selection.counts.feedback], [3, 2, 4], 'their feedback is still archived');
    assert.deepEqual(writer.buildSelection({ ...raw, guard: undefined }, noPhotos).ids.visitorsDeleted, [1, 2, 3, 4, 5], 'without a guard only their feedback decides');
});

test('writer round trip: the zip passes the check, manifest.json comes last and photos are stored as they are', async () => {
    const { file, written, progress, selection } = await makeArchive();
    const bytes = fs.readFileSync(file);
    assert.equal(written.size, bytes.length);
    assert.equal(written.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'PK\x03\x04');
    const last = progress[progress.length - 1];
    assert.equal(last.processedEntries, last.totalEntries);

    const result = await writer.verifyArchive(file, { ids: selection.ids });
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
    assert.equal(result.checkedEntries, ENTRY_NAMES.length - 1);

    const handle = await zip.openZip(file);
    try {
        const entries = await zip.listEntries(handle);
        assert.deepEqual([...entries.keys()], ENTRY_NAMES);
        for (const [name, entry] of entries) assert.equal(entry.compressionMethod, name.startsWith('photos/') ? 0 : 8, name);
        const csv = (await zip.readEntry(handle, entries.get('csv/feedback.csv'))).toString('utf8');
        assert.ok(csv.startsWith('\uFEFF"Feedback ID"'));
        assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
    } finally {
        handle.close();
    }

    const data = await writer.readArchiveData(file);
    assert.equal(data.manifest.archiveId, 77);
    assert.equal(data.manifest.encryption.keyFingerprint, FINGERPRINT);
    assert.deepEqual(data.feedback[0].photos, { raw: 'photos/feedback/5-raw.png', processed: 'photos/feedback/5-processed.jpg' });
    assert.equal(data.visitors[0].keptInDatabase, true);
    assert.equal(data.visitors[0].email_encrypted, 'aa:bb:cc', 'emails are copied as they are, never decrypted');
    assert.equal(JSON.stringify(data).includes('owner@example.com'), false);

    const wrongIds = await writer.verifyArchive(file, { ids: { ...selection.ids, feedback: [6] } });
    assert.equal(wrongIds.ok, false);
    assert.match(wrongIds.problems.join(' '), /feedback ids in the archive are not the records that were selected/);
});

test('README.txt says what was chosen: delete or export only, photos kept or not', async () => {
    const deleting = await archiveWith({});
    assert.ok(deleting.readme.includes('This archive was made with "Delete the records from the database" switched on: the records were to be deleted after this file passed its check.'));
    assert.ok(deleting.readme.includes('- 1 visitor (1 to stay in the database because of newer feedback or a recent visit)\r\n'));
    assert.ok(deleting.readme.includes('- 2 photos\r\n'));
    assert.ok(deleting.readme.includes('- photos/'));

    const exportOnly = await archiveWith({ deleteAfterArchive: false });
    assert.ok(exportOnly.readme.includes('This archive was made as an export only: the records stayed in the database.'));
    assert.ok(exportOnly.readme.includes('- 1 visitor\r\n'), 'nobody "stays" when nothing is deleted');
    assert.equal(exportOnly.readme.includes('Delete the records'), false);

    const noPhotos = await archiveWith({ photosIncluded: false });
    assert.ok(noPhotos.readme.includes('- No photos: they were not kept in the zip (they were deleted with the records)\r\n'));
    assert.equal(noPhotos.readme.includes('- photos/'), false, 'no photos/ folder line');
    assert.deepEqual(noPhotos.names.filter((name) => name.startsWith('photos/')), []);
    assert.equal((await writer.verifyArchive(noPhotos.file, { ids: noPhotos.selection.ids })).ok, true);

    const exportNoPhotos = await archiveWith({ photosIncluded: false, deleteAfterArchive: false });
    assert.ok(exportNoPhotos.readme.includes('- No photos: they were not kept in the zip (they stayed on the server with the records)\r\n'));
});

test('verify fails when one byte of a photo changes', async () => {
    const { dir, file } = await makeArchive();
    const bytes = fs.readFileSync(file);
    const at = bytes.indexOf(Buffer.alloc(64, 7)); // inside the stored raw photo
    assert.ok(at > 0);
    bytes[at + 10] ^= 0xff;
    const flipped = path.join(dir, 'flipped.zip');
    fs.writeFileSync(flipped, bytes);
    const result = await writer.verifyArchive(flipped);
    assert.equal(result.ok, false);
    assert.match(result.problems.join(' '), /photos\/feedback\/5-raw\.png/);
});

test('verify finds an entry the manifest lists but the zip does not hold', async () => {
    const { dir, file } = await makeArchive();
    const short = path.join(dir, 'short.zip');
    await copyWithout(file, short, 'photos/feedback/5-processed.jpg');
    const result = await writer.verifyArchive(short);
    assert.equal(result.ok, false);
    assert.ok(result.problems.includes('photos/feedback/5-processed.jpg is missing from the zip.'), result.problems.join(' | '));
    assert.ok(result.problems.includes(`The zip holds ${ENTRY_NAMES.length - 1} entries but the manifest lists ${ENTRY_NAMES.length}.`));
});

test('a photo deleted while the zip is being written fails the write and removes the partial file', async () => {
    const { dir, photo, selection } = makeSelection();
    const partial = path.join(dir, 'archive.zip.partial');
    let deleted = false;
    const onProgress = (p) => {
        // the first photo has just gone in: take the second one away before it is read
        if (!deleted && p.processedEntries === p.totalEntries - 2) {
            fs.unlinkSync(photo.processed);
            deleted = true;
        }
    };
    await assert.rejects(writer.writeArchive(selection, META, partial, onProgress), /5-processed\.jpg could not be read/);
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(partial), false);
});

test('verify refuses a file that is not a zip', async () => {
    const junk = path.join(TMP, 'junk.zip');
    fs.writeFileSync(junk, 'not a zip at all');
    const result = await writer.verifyArchive(junk);
    assert.equal(result.ok, false);
    assert.match(result.problems[0], /not a readable zip/);
});

test('readJsonEntry refuses an entry over 256 MB before reading any of it', async () => {
    const huge = { fileName: 'data/feedback.json', uncompressedSize: 256 * 1024 * 1024 + 1 };
    await assert.rejects(zip.readJsonEntry(null, huge), /data\/feedback\.json is too large to open \(over 256 MB\)/);
});

test('a disk that fails while the zip is written stops the write at once and removes the partial file', { timeout: 15000 }, async (t) => {
    const { dir, selection } = makeSelection();
    // four more 64 KB photos, so the zip stream still has data to push after the disk fails
    const photos = [...selection.photos];
    for (let i = 1; i <= 4; i++) {
        const file = path.join(dir, `extra-${i}.png`);
        fs.writeFileSync(file, crypto.randomBytes(64 * 1024));
        photos.push({ entry: `photos/feedback/${100 + i}-raw.png`, file, size: 64 * 1024 });
    }
    let failAfter = 0;
    const realCreate = fs.createWriteStream;
    t.mock.method(fs, 'createWriteStream', (file, options) => {
        const stream = realCreate.call(fs, file, options);
        const full = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
        let written = 0;
        const write = stream._write.bind(stream);
        stream._write = (chunk, encoding, callback) => {
            written += chunk.length;
            if (written > failAfter) return callback(full());
            write(chunk, encoding, callback);
        };
        if (stream._writev) {
            const writev = stream._writev.bind(stream);
            stream._writev = (chunks, callback) => {
                written += chunks.reduce((n, c) => n + c.chunk.length, 0);
                if (written > failAfter) return callback(full());
                writev(chunks, callback);
            };
        }
        return stream;
    });
    // the disk fails almost at once, then after a few KB
    for (const limit of [100, 5000]) {
        failAfter = limit;
        const partial = path.join(dir, `disk-full-${limit}.zip.partial`);
        await assert.rejects(writer.writeArchive({ ...selection, photos }, META, partial), /ENOSPC/, `full after ${limit} bytes`);
        assert.equal(fs.existsSync(partial), false);
    }
});

test('deleted counts: one entry per Singapore day and kind; flagged rows count as feedback but not as leaves', () => {
    const at = (iso) => new Date(iso);
    const rows = [
        { id: 1, created_at: at('2025-12-31T16:30:00Z'), is_active: 1, comment: 'I pledge to recycle', answer_values: 'Yes' }, // 1 Jan 2026, 00:30 in Singapore
        { id: 2, created_at: at('2025-12-31T15:59:59Z'), is_active: 1, comment: 'Carry a bottle', answer_values: null },        // 31 Dec 2025, 23:59
        { id: 3, created_at: at('2026-01-01T02:00:00Z'), is_active: 1, comment: 'This kiosk is bad', answer_values: null },
        { id: 4, created_at: at('2026-01-01T03:00:00Z'), is_active: 1, comment: 'Fine', answer_values: 'The screen was broken' },
        { id: 5, created_at: at('2026-01-01T04:00:00Z'), is_active: 0, comment: 'hidden by an admin', answer_values: null },
        { id: 6, created_at: null, is_active: 1, comment: 'no date', answer_values: null },
        { id: 7, created_at: at('2026-01-01T05:00:00Z'), is_active: 1, comment: '   ', answer_values: 'Yes' } // no pledge written
    ];
    assert.deepEqual(deletedCounts.tally(rows, deletedCounts.SOURCES.feedback.kinds).sort(), [
        ['2025-12-31', 'feedback', 1], ['2025-12-31', 'leaf', 1], ['2025-12-31', 'pledge', 1],
        ['2026-01-01', 'feedback', 4], ['2026-01-01', 'leaf', 2], ['2026-01-01', 'pledge', 3]
    ]);
    assert.deepEqual([null, undefined, '', '   ', ' a', 'a  '].map(deletedCounts.hasPledge), [false, false, false, false, true, true]);
    const visitors = [{ id: 7, created_at: '2024-05-01T10:00:00.000Z' }, { id: 8, created_at: at('2024-05-01T17:00:00Z') }];
    assert.deepEqual(deletedCounts.tally(visitors, deletedCounts.SOURCES.users.kinds).sort(), [['2024-05-01', 'visitor', 1], ['2024-05-02', 'visitor', 1]]);
});

test('deleteCounted counts exactly the rows it locked, then deletes those ids, 500 at a time', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    const existing = ids.filter((id) => id % 3 !== 0); // a third are already gone
    const calls = [];
    const tx = {
        all: async (sql, params) => {
            calls.push({ type: 'select', sql, ids: params[0] });
            return params[0].filter((id) => existing.includes(id)).map((id) => ({ id, created_at: new Date('2025-03-04T01:00:00Z') }));
        },
        run: async (sql, params) => {
            calls.push({ type: /^INSERT/.test(sql) ? 'insert' : 'delete', sql, values: params[0] });
            return /^DELETE/.test(sql) ? params[0].length : 1;
        }
    };
    assert.equal(await deletedCounts.deleteCounted(tx, 'lost_found_reports', [...ids, 4, 4]), existing.length);
    assert.deepEqual(calls.map((c) => c.type), ['select', 'insert', 'delete', 'select', 'insert', 'delete', 'select', 'insert', 'delete']);
    assert.ok(calls.filter((c) => c.type === 'select').every((c) => /FOR UPDATE/.test(c.sql) && c.ids.length <= 500));
    const counted = calls.filter((c) => c.type === 'insert').flatMap((c) => c.values);
    assert.ok(counted.every(([day, kind]) => day === '2025-03-04' && kind === 'lost_found'));
    assert.equal(counted.reduce((n, entry) => n + entry[2], 0), existing.length);
    assert.deepEqual(calls.filter((c) => c.type === 'delete').flatMap((c) => c.values), existing);
    assert.ok(calls.filter((c) => c.type === 'delete').every((c) => /^DELETE FROM lost_found_reports WHERE id IN \(\?\)$/.test(c.sql)));

    calls.length = 0;
    assert.equal(await deletedCounts.deleteCounted(tx, 'users', []), 0);
    assert.equal(calls.length, 0);
    await assert.rejects(deletedCounts.deleteCounted(tx, 'admin_users', [1]), /unknown table/);
});

test('deleted counts lock the feedback rows, then join their answers the way the tree does', async () => {
    const calls = [];
    const tx = {
        all: async (sql, params) => {
            calls.push({ sql, ids: params[0] });
            if (/FROM feedback WHERE/.test(sql)) return params[0].filter((id) => id !== 3).map((id) => ({ id, created_at: new Date('2025-06-01T03:00:00Z'), is_active: 1, comment: `pledge ${id}` }));
            return [{ feedback_id: 2, answer_values: 'The kiosk was broken' }];
        }
    };
    const rows = await deletedCounts.SOURCES.feedback.load(tx, [1, 2, 3]);
    assert.deepEqual(rows.map((row) => [row.id, row.answer_values]), [[1, null], [2, 'The kiosk was broken']]);
    assert.match(calls[0].sql, /FOR UPDATE$/);
    assert.deepEqual(calls[1].ids, [1, 2], 'answers are read only for the rows that were locked');
    assert.doesNotMatch(calls[1].sql, /FOR UPDATE/);
    assert.deepEqual(deletedCounts.tally(rows, deletedCounts.SOURCES.feedback.kinds).sort(), [['2025-06-01', 'feedback', 2], ['2025-06-01', 'leaf', 1], ['2025-06-01', 'pledge', 2]]);
    const squash = (sql) => sql.replace(/\s+/g, ' ');
    const tree = squash(fs.readFileSync(path.join(paths.ROOT, 'backend', 'features', 'tree', 'routes.js'), 'utf8'));
    assert.ok(tree.includes("GROUP_CONCAT(answer_value SEPARATOR ' ') AS answer_values FROM feedback_answers WHERE answer_value IS NOT NULL AND TRIM(answer_value) != ''"), 'the tree still joins the answers this way');
    assert.ok(squash(deletedCounts.ANSWERS_SQL).includes("GROUP_CONCAT(answer_value SEPARATOR ' ') AS answer_values FROM feedback_answers WHERE answer_value IS NOT NULL AND TRIM(answer_value) != ''"));
});

test('the year book adds deleted leaves to their year and lists a year whose leaves were all deleted', () => {
    const live = new Map([[2025, { year: 2025, leafCount: 3, firstSubmission: new Date('2025-03-01T02:00:00Z'), lastSubmission: new Date('2025-11-20T02:00:00Z'), isCurrentYear: false }]]);
    const archived = new Map([[2025, { count: 40, firstDay: '2025-01-05', lastDay: '2025-10-31' }], [2024, { count: 12, firstDay: '2024-02-01', lastDay: '2024-12-30' }]]);
    deletedCounts.mergeYearBook(live, archived, 2026);
    const y2025 = live.get(2025);
    assert.equal(y2025.leafCount, 43);
    assert.equal(y2025.archivedLeafCount, 40);
    assert.equal(y2025.firstSubmission, '2025-01-04T16:00:00.000Z'); // 5 Jan, midnight in Singapore
    assert.equal(new Date(y2025.lastSubmission).toISOString(), '2025-11-20T02:00:00.000Z'); // the live one is later
    assert.deepEqual(live.get(2024), { year: 2024, leafCount: 12, archivedLeafCount: 12, firstSubmission: '2024-01-31T16:00:00.000Z', lastSubmission: '2024-12-30T15:59:59.000Z', isCurrentYear: false });
});

// the visitor_save_gate table, in memory, with a clock and a renewal timer the test moves by hand
function gateWithClock() {
    const clock = { now: 0, onSleep: async () => {} };
    const rows = new Map();
    const timers = [];
    let next = 1;
    const store = {
        rows,
        add: async (holder, ttlMs) => { const id = next++; rows.set(id, { holder, expiresAt: clock.now + ttlMs }); return id; },
        renew: async (id, ttlMs) => { if (rows.has(id)) rows.get(id).expiresAt = clock.now + ttlMs; },
        remove: async (id) => { rows.delete(id); },
        active: async (holder) => [...rows.values()].some((row) => row.holder === holder && row.expiresAt > clock.now)
    };
    const every = (fn) => { const timer = { fn, stopped: false }; timers.push(timer); return () => { timer.stopped = true; }; };
    const gate = saveGate.createGate(store, { now: () => clock.now, sleep: async (ms) => { clock.now += ms; await clock.onSleep(); }, every });
    return { clock, store, gate, timers, held: (holder) => [...rows.values()].filter((row) => row.holder === holder).length };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('save gate: a save that starts during a delete step makes it roll back and run again once the save is done', async () => {
    const { clock, store, gate, held } = gateWithClock();
    let attempts = 0;
    const result = await gate.deleteStep(async (checkpoint) => {
        attempts++;
        await checkpoint();
        if (attempts === 1) {
            const saveId = await store.add('save', saveGate.TTL_MS); // a kiosk save in the other server process
            let polls = 0;
            clock.onSleep = async () => { if (++polls === 3) await store.remove(saveId); };
        }
        await checkpoint();
        return 'deleted';
    });
    assert.equal(result, 'deleted');
    assert.equal(attempts, 2);
    assert.equal(held('delete'), 0);
});

test('save gate: a delete step does not start while a save is running, and a stale save row expires', async () => {
    const { clock, store, gate, held } = gateWithClock();
    const saveId = await store.add('save', saveGate.TTL_MS);
    let polls = 0;
    clock.onSleep = async () => { if (++polls === 5) await store.remove(saveId); };
    await gate.deleteStep(async () => { assert.equal(polls, 5, 'started only after the save ended'); });

    await store.add('save', saveGate.TTL_MS); // never removed: a server that stopped mid-save
    clock.onSleep = async () => {};
    const before = clock.now;
    let ran = false;
    await gate.deleteStep(async () => { ran = true; });
    assert.ok(ran && clock.now - before >= saveGate.TTL_MS && clock.now - before < saveGate.DELETE_WAIT_MS);
    assert.equal(held('delete'), 0);
});

test('save gate: too many back-offs end with kioskBusy, and a real error is passed on', async () => {
    const { clock, store, gate, held } = gateWithClock();
    let attempts = 0;
    await assert.rejects(gate.deleteStep(async (checkpoint) => {
        attempts++;
        const saveId = await store.add('save', saveGate.TTL_MS);
        clock.onSleep = async () => store.remove(saveId);
        await checkpoint();
    }), (error) => error.kioskBusy === true && error.message === saveGate.KIOSK_BUSY_MESSAGE);
    assert.equal(attempts, saveGate.MAX_TRIES);
    assert.equal(held('delete'), 0);

    await assert.rejects(gate.deleteStep(async () => { throw new Error('lock wait timeout'); }), /lock wait timeout/);
    assert.equal(held('delete'), 0);
});

test('save gate: a save waits while a delete step runs, at most 30 seconds, and never fails because of the gate', async (t) => {
    const { clock, store, gate, held } = gateWithClock();
    const deleteId = await store.add('delete', 10 * 60 * 1000);
    let polls = 0;
    clock.onSleep = async () => { if (++polls === 4) await store.remove(deleteId); };
    const done = await gate.enterSave();
    assert.equal(polls, 4);
    assert.equal(held('save'), 1);
    done();
    done();
    await settle();
    assert.equal(held('save'), 0);

    await store.add('delete', 10 * 60 * 1000); // left behind by a server that stopped
    clock.onSleep = async () => {};
    const before = clock.now;
    (await gate.enterSave())();
    assert.ok(clock.now - before >= saveGate.SAVE_WAIT_MS && clock.now - before < saveGate.SAVE_WAIT_MS + 1000);

    t.mock.method(console, 'warn', () => {});
    const broken = saveGate.createGate({ add: async () => { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }); }, renew: async () => {}, remove: async () => {}, active: async () => false });
    const release = await broken.enterSave();
    assert.doesNotThrow(release);
});

test('save gate: a long save (a first model download) keeps its row by renewing it, and stops renewing after 15 minutes', async () => {
    const { clock, gate, timers, held } = gateWithClock();
    const done = await gate.enterSave();
    const renewal = timers[0];
    for (let i = 0; i < 10; i++) { // 5 minutes, far past the 2-minute lease
        clock.now += saveGate.RENEW_MS;
        renewal.fn();
        await settle();
    }
    let polls = 0;
    clock.onSleep = async () => { if (++polls === 3) { done(); await settle(); } };
    let startedAfter = null;
    await gate.deleteStep(async () => { startedAfter = polls; });
    assert.equal(startedAfter, 3, 'the delete step waited for the 5-minute save to end');
    assert.equal(renewal.stopped, true, 'releasing the save stops its renewal');
    assert.equal(held('save'), 0);

    const before = timers.length;
    const stuck = await gate.enterSave();
    const stuckRenewal = timers[before];
    clock.now += saveGate.SAVE_MAX_MS + 1;
    stuckRenewal.fn();
    assert.equal(stuckRenewal.stopped, true, 'a save stuck for 15 minutes stops holding deletes back');
    stuck();
});

test('save gate: a long delete step keeps its own row alive while it runs, then stops renewing and removes it', async () => {
    const { clock, store, gate, timers, held } = gateWithClock();
    let renewal = null;
    await gate.deleteStep(async (checkpoint) => {
        renewal = timers[timers.length - 1];
        for (let i = 0; i < 8; i++) { // 4 minutes, past the 2-minute lease
            clock.now += saveGate.RENEW_MS;
            renewal.fn();
            await settle();
        }
        assert.equal(await store.active('delete'), true, 'kiosk saves still see the delete step after 4 minutes');
        await checkpoint();
    });
    assert.equal(renewal.stopped, true);
    assert.equal(held('delete'), 0);
});

test('save gate: an admin delete with small limits answers kioskBusy instead of waiting long', async () => {
    const { clock, store, gate } = gateWithClock();
    await store.add('save', saveGate.TTL_MS);
    clock.onSleep = async () => {};
    const before = clock.now;
    await assert.rejects(gate.deleteStep(async () => { throw new Error('must not run'); }, { maxTries: 3, waitMs: 20 * 1000 }), (error) => error.kioskBusy === true);
    assert.ok(clock.now - before >= 20 * 1000 && clock.now - before < 21 * 1000, 'gave up after the 20-second wait');

    assert.deepEqual(deletedCounts.deleteFailure(Object.assign(new Error('busy'), { kioskBusy: true })).status, 409);
    assert.deepEqual(deletedCounts.deleteFailure(Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' })).status, 503);
    assert.equal(deletedCounts.deleteFailure(new Error('deadlock')), null);
    assert.equal(deletedCounts.deleteFailure(null), null);
    assert.match(deletedCounts.VISITOR_NUMBER_SQL, /COUNT\(\*\) FROM feedback WHERE is_active = 1\)\s*\+ \(SELECT COALESCE\(SUM\(record_count\), 0\) FROM deleted_record_counts WHERE kind = 'feedback'\)/);
    // every pledge ever: archived rows count too (no archive_status filter), plus the deleted pledges
    assert.match(deletedCounts.ALL_PLEDGES_SQL, /^SELECT \(SELECT COUNT\(\*\) FROM feedback WHERE is_active = 1 AND comment IS NOT NULL AND comment != ''\)\s*\+ \(SELECT COALESCE\(SUM\(record_count\), 0\) FROM deleted_record_counts WHERE kind = 'pledge'\) AS count$/);
    assert.doesNotMatch(deletedCounts.ALL_PLEDGES_SQL, /archive_status/);
});
// <Jun Kai end>
