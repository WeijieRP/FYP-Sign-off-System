// Owner: Role 3, Jun Kai.
// Unit tests for the leaves that stay on the digital tree after the Visitor Data Archive: the label, what a kept leaf
// holds, the counting, the setting, the tree rows and the year book. No database. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zip = require('../../backend/core/zip');
const settingsStore = require('../../backend/features/archive/visitorSettings');
const writer = require('../../backend/features/archive/visitorWriter');
const deletedCounts = require('../../backend/features/archive/deletedCounts');
const leaves = require('../../backend/features/archive/archivedLeaves');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'va-leaves-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }));

const clone = (value) => JSON.parse(JSON.stringify(value));
const defaults = () => clone(settingsStore.DEFAULTS);
const at = (iso) => new Date(iso);
const ARCHIVED_AT = at('2026-11-11T02:00:00Z');
const VIPS = new Set(['jun kai tan', 'grace lim']);
// the email service's rule, without loading it: one badge per chosen topic, Feedback Contributor without one
const TOPIC_BADGES = { 'climate-change': 'climate-champion', 'ocean-conservation': 'ocean-guardian' };
const badgeKeysOf = ({ pledgeTopic, pledgeTopics }) => {
    const topics = Array.isArray(pledgeTopics) ? pledgeTopics : String(pledgeTopic || '').split(',');
    const keys = topics.map((topic) => TOPIC_BADGES[String(topic).trim()]).filter(Boolean);
    return keys.length ? [...new Set(keys)] : ['feedback-completer'];
};
const BADGES = {
    'feedback-completer': { name: 'Feedback Contributor', color: '#10b981' },
    'ocean-guardian': { name: 'Ocean Guardian', color: '#0ea5e9' }
};
const options = (mode) => ({ mode, vipNames: VIPS, archiveId: 7, archivedAt: ARCHIVED_AT, badgeKeysOf });
const record = (changes = {}) => ({
    id: 41, created_at: at('2024-03-05T04:00:00Z'), name: 'Jun Kai Tan', data_retention: 'longterm',
    metadata: JSON.stringify({ pledgeTopic: 'ocean-conservation', pledge: 'I pledge to bring my own bottle', device: 'kiosk', ip: '10.0.0.8' }),
    ...changes
});

test('the leaf rules load without the database, auth or the email service', () => {
    const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, '/'));
    assert.deepEqual(loaded.filter((file) => /backend\/(core\/(db|auth)|features\/(analysis\/cacheStore|email\/service))\.js$/.test(file)), []);
});

test('initials: the first letter of the first and of the last word, or "Visitor" when that would give the name away', () => {
    const cases = [
        ['Jun Kai Tan', 'J. T.'], ['jun kai tan', 'J. T.'], ['  Grace   Lim  ', 'G. L.'], ['Madonna', 'M.'],
        ['Tan, Jun-Kai', 'T. J.'], ["o'brien", 'O.'], ['Dr. 2 Lee', 'D. L.'], ['😀 Lee', 'L.'],
        ['Мария Иванова', 'М. И.'], ['محمد علي', 'م. ع.'],
        // one character is a whole word in Chinese, Japanese and Korean, and a one-letter word is its own initial
        ['陈俊凯', 'Visitor'], ['陈 俊凯', 'Visitor'], ['王 伟', 'Visitor'], ['김 민', 'Visitor'], ['たなか', 'Visitor'], ['A B', 'Visitor'], ['Q', 'Visitor'],
        ['', 'Visitor'], ['   ', 'Visitor'], ['123 456', 'Visitor'], ['!!!', 'Visitor'], [null, 'Visitor'], [undefined, 'Visitor']
    ];
    for (const [name, expected] of cases) assert.equal(leaves.initialsOf(name), expected, `initials of ${JSON.stringify(name)}`);
    const letters = (text) => text.replace(/[^\p{L}]/gu, '').length;
    assert.ok(cases.every(([name]) => leaves.initialsOf(name) === 'Visitor' || letters(leaves.initialsOf(name)) <= 2), 'two letters at most, inside the limit of three');
    assert.equal(leaves.initialsOf('A B C D E F'), 'A. F.', 'two letters however long the name is');
});

test('the label: "Visitor" with keep, initials only when the admin chose them and the tree was showing the name', () => {
    assert.equal(leaves.labelFor('keep', 'Jun Kai Tan', true), 'Visitor');
    assert.equal(leaves.labelFor('initials', 'Jun Kai Tan', true), 'J. T.');
    assert.equal(leaves.labelFor('initials', 'Jun Kai Tan', false), 'Visitor', 'a name the tree was hiding stays hidden');
    assert.equal(leaves.labelFor('initials', '12345', true), 'Visitor');
    assert.equal(leaves.labelFor('remove', 'Jun Kai Tan', true), 'Visitor');
    assert.deepEqual(['longterm', 'LongTerm', 'indefinite', 'temporary', '7days', '', null].map(leaves.nameShown), [true, true, true, false, false, false, false]);
    assert.deepEqual(['keep', 'initials', 'remove', 'KEEP', '', undefined].map(leaves.keeps), [true, true, false, false, false, false]);
});

test('a kept leaf holds its id, date, label, badge and VIP mark, and nothing personal', () => {
    const kept = leaves.leafRow(record(), options('keep'));
    assert.deepEqual(kept, {
        feedback_id: 41, created_at: at('2024-03-05T04:00:00Z'), label: 'Visitor', badge_key: 'ocean-guardian', badge_keys: null,
        is_vip: 1, archive_id: 7, archived_at: ARCHIVED_AT
    });
    assert.deepEqual(Object.keys(kept), leaves.COLUMNS, 'exactly the columns of archived_leaves');

    // everything else a feedback row and its visitor hold is ignored, whatever the record carries
    const full = record({
        email: 'junkai@example.com', email_encrypted: 'aa:bb:cc', comment: 'I pledge to bring my own bottle', user_id: 9, visit_count: 4,
        photo_path: 'photos/junkai.png', processed_photo_path: 'processed/junkai.png', admin_notes: 'met at the booth',
        answers: [{ answer_value: 'I study at RP' }]
    });
    for (const mode of ['keep', 'initials']) {
        const text = JSON.stringify(leaves.leafRow(full, options(mode)));
        for (const secret of ['Jun', 'Kai', 'Tan', 'junkai', 'example.com', 'aa:bb:cc', 'pledge', 'bottle', 'photos/', 'booth', 'RP', 'kiosk', '10.0.0.8', 'visit_count', 'user_id']) {
            assert.equal(text.includes(secret), false, `${mode}: the leaf does not hold ${secret}`);
        }
    }
    assert.equal(leaves.leafRow(record(), options('initials')).label, 'J. T.');
});

test('a kept leaf: badge keys from the pledge topic, VIP and initials only for a name the tree showed', () => {
    // the shape the kiosk writes: the first topic in pledgeTopic, every chosen topic in pledgeTopics
    const several = leaves.leafRow(record({ metadata: JSON.stringify({ pledgeTopic: 'ocean-conservation', pledgeTopics: ['ocean-conservation', 'climate-change'] }) }), options('keep'));
    assert.equal(several.badge_key, 'ocean-guardian', 'the first badge decides the leaf colour');
    assert.equal(several.badge_keys, 'ocean-guardian,climate-champion');
    const one = leaves.leafRow(record({ metadata: JSON.stringify({ pledgeTopic: 'ocean-conservation', pledgeTopics: ['ocean-conservation'] }) }), options('keep'));
    assert.deepEqual([one.badge_key, one.badge_keys], ['ocean-guardian', null], 'one topic: no list');
    for (const metadata of [null, '', '{ not json', '{}', '[]', '"text"', { pledgeTopic: 'ocean-conservation' }]) {
        const row = leaves.leafRow(record({ metadata }), options('keep'));
        assert.deepEqual([row.badge_key, row.badge_keys], ['feedback-completer', null], `metadata ${JSON.stringify(metadata)}`);
    }
    const hidden = leaves.leafRow(record({ data_retention: 'temporary' }), options('initials'));
    assert.deepEqual([hidden.label, hidden.is_vip], ['Visitor', 0], 'the tree was not showing this name, so no initials and no gold leaf');
    assert.equal(leaves.leafRow(record({ name: 'Someone Else' }), options('keep')).is_vip, 0);
    assert.equal(leaves.leafRow(record({ name: '  GRACE LIM ' }), options('keep')).is_vip, 1, 'VIP names match without case, like the tree');
    const bare = leaves.leafRow({ id: 5, created_at: at('2024-01-01T00:00:00Z') }, { mode: 'initials', vipNames: new Set(), badgeKeysOf });
    assert.deepEqual([bare.label, bare.badge_key, bare.is_vip, bare.archive_id], ['Visitor', 'feedback-completer', 0, null]);
    assert.ok(leaves.leafRow(record({ name: `${'A'.repeat(60)} ${'B'.repeat(60)}` }), options('initials')).label.length <= 40);
});

test('a VIP leaf is a name on the VIP list that the tree shows: the rule that keeps a submission out of the archive', () => {
    const vipNames = leaves.vipNameSet([{ name: ' Grace Lim ' }, { name: 'PRESIDENT' }, { name: '' }, { name: null }, {}]);
    assert.deepEqual([...vipNames], ['grace lim', 'president'], 'names are trimmed and lower-cased, empty ones dropped');
    assert.equal(leaves.vipNameSet(null).size, 0);
    assert.equal(leaves.isVipLeaf('Grace Lim', 'longterm', vipNames), true);
    assert.equal(leaves.isVipLeaf('  grace LIM ', 'INDEFINITE', vipNames), true, 'no case, no outer spaces, like the tree');
    assert.equal(leaves.isVipLeaf('Grace Lim', 'temporary', vipNames), false, 'the tree hides this name, so the leaf is not gold');
    assert.equal(leaves.isVipLeaf('Grace Lim', null, vipNames), false);
    assert.equal(leaves.isVipLeaf('Grace Lim Tan', 'longterm', vipNames), false, 'a longer name is another visitor');
    assert.equal(leaves.isVipLeaf('Grace', 'longterm', vipNames), false, 'part of a name is another visitor');
    assert.equal(leaves.isVipLeaf('', 'longterm', vipNames), false);
    assert.equal(leaves.isVipLeaf(null, 'longterm', vipNames), false);
    assert.equal(leaves.isVipLeaf('Grace Lim', 'longterm', new Set()), false, 'an empty VIP list has no VIP leaves');
});

test('finding the VIP leaves among some rows: the SQL narrows by name, the rule of the tree decides', async () => {
    const dbPath = require.resolve('../../backend/core/db');
    const asked = [];
    let vipRows = [{ name: 'Grace Lim' }, { name: '50%_off' }];
    let found = [
        { id: 1, name: 'Grace Lim', data_retention: 'longterm' },
        { id: 2, name: 'Grace Lim Tan', data_retention: 'longterm' },   // a longer name: someone else
        { id: 3, name: ' GRACE LIM ', data_retention: 'indefinite' },
        { id: 4, name: 'Grace Lim', data_retention: 'temporary' }       // the tree hides this name
    ];
    const fake = { pool: { promise: () => ({ query: async (sql, values) => {
        asked.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
        if (/FROM vip_management/.test(sql)) { if (vipRows instanceof Error) throw vipRows; return [vipRows]; }
        return [found];
    } }) } };
    const had = require.cache[dbPath];
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake };
    try {
        assert.deepEqual(await leaves.vipLeafIds('f.created_at < ?', ['2025-01-01']), [1, 3]);
        assert.equal(asked[1].sql, 'SELECT f.id, f.data_retention, u.name FROM feedback f JOIN users u ON u.id = f.user_id WHERE (f.created_at < ?) AND (u.name LIKE ? OR u.name LIKE ?)');
        assert.deepEqual(asked[1].values, ['2025-01-01', '%grace lim%', '%50\\%\\_off%'], 'the values of the caller first, then one pattern per VIP name with % and _ escaped');
        asked.length = 0;
        vipRows = [];
        assert.deepEqual(await leaves.vipLeafIds('f.id IN (?)', [[1, 2]]), [], 'an empty VIP list has no VIP leaves');
        assert.equal(asked.length, 1, 'and the submissions are not even read');
        vipRows = Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
        assert.deepEqual(await leaves.vipLeafIds('f.id IN (?)', [[1]]), [], 'a database without the VIP table has no VIP leaves');
        vipRows = Object.assign(new Error('gone away'), { code: 'PROTOCOL_CONNECTION_LOST' });
        await assert.rejects(leaves.vipLeafIds('f.id IN (?)', [[1]]), /gone away/, 'any other error is passed on: a delete must not go ahead without the check');
    } finally {
        if (had) require.cache[dbPath] = had; else delete require.cache[dbPath];
    }
    assert.equal(leaves.vipKeptText(0), '');
    assert.equal(leaves.vipKeptText(1), '1 VIP leaf was kept: a VIP leaf stays on the tree. To delete one, take the name off the VIP list first.');
    assert.match(leaves.vipKeptText(2), /^2 VIP leaves were kept:/);
});

// what the delete step locks for each feedback row: three leaves on the tree, one flagged, one hidden by an admin
const LOCKED = [
    { id: 1, created_at: at('2024-03-05T04:00:00Z'), is_active: 1, comment: 'I pledge to recycle' },
    { id: 2, created_at: at('2024-03-05T05:00:00Z'), is_active: 1, comment: 'Carry a bottle' },
    { id: 3, created_at: at('2024-03-06T05:00:00Z'), is_active: 1, comment: '' },
    { id: 4, created_at: at('2024-03-06T06:00:00Z'), is_active: 1, comment: 'This kiosk is bad' },
    { id: 5, created_at: at('2024-03-06T07:00:00Z'), is_active: 0, comment: 'hidden by an admin' }
];
const DETAILS = leaves.detailsOf({
    visitors: [{ id: 9, name: 'Jun Kai Tan', email_encrypted: 'aa:bb:cc' }, { id: 10, name: 'Grace Lim' }],
    feedback: [
        { id: 1, user_id: 9, data_retention: 'longterm', metadata: JSON.stringify({ pledgeTopic: 'ocean-conservation' }), comment: 'I pledge to recycle' },
        { id: 2, user_id: 10, data_retention: 'temporary', metadata: '{}', comment: 'Carry a bottle' },
        { id: 3, user_id: 9, data_retention: 'longterm', metadata: null, comment: '' },
        { id: 4, user_id: 10, data_retention: 'longterm', metadata: '{}', comment: 'This kiosk is bad' },
        { id: 5, user_id: 10, data_retention: 'longterm', metadata: '{}', comment: 'hidden by an admin' }
    ]
});

function fakeTx() {
    const calls = [];
    const tx = {
        calls,
        all: async (sql, params) => {
            if (/FROM feedback WHERE/.test(sql)) { calls.push({ type: 'lock', sql }); return LOCKED.filter((row) => params[0].includes(row.id)).map((row) => ({ ...row })); }
            if (/FROM feedback_answers/.test(sql)) { calls.push({ type: 'answers', sql }); return []; }
            if (/FROM vip_management/.test(sql)) { calls.push({ type: 'vips', sql }); return [{ name: 'Jun Kai Tan' }, { name: null }]; }
            throw new Error(`unexpected query: ${sql}`);
        },
        run: async (sql, params) => {
            const type = /^INSERT INTO archived_leaves/.test(sql) ? 'leaves' : /^INSERT INTO deleted_record_counts/.test(sql) ? 'counts' : /^DELETE FROM feedback/.test(sql) ? 'delete' : 'other';
            calls.push({ type, sql, values: params[0] });
            return params[0].length;
        }
    };
    return tx;
}
const countsOf = (tx) => tx.calls.filter((call) => call.type === 'counts').flatMap((call) => call.values).sort();

test('counting: a leaf that stays is not counted as deleted; with remove it is counted like before', async () => {
    const keepTx = fakeTx();
    const deleted = await deletedCounts.deleteCounted(keepTx, 'feedback', [1, 2, 3, 4, 5], {
        keepLeaves: leaves.keeper({ mode: 'keep', details: DETAILS, archiveId: 7, archivedAt: ARCHIVED_AT, badgeKeysOf })
    });
    assert.equal(deleted, 5);
    assert.deepEqual(keepTx.calls.map((call) => call.type), ['lock', 'answers', 'vips', 'leaves', 'counts', 'delete'], 'the leaves are written before the rows are counted and deleted');
    // feedback and pledge are counted exactly as before; no leaf, because rows 1 to 3 are still on the tree
    assert.deepEqual(countsOf(keepTx), [['2024-03-05', 'feedback', 2], ['2024-03-05', 'pledge', 2], ['2024-03-06', 'feedback', 2], ['2024-03-06', 'pledge', 1]]);
    assert.deepEqual(keepTx.calls.find((call) => call.type === 'delete').values, [1, 2, 3, 4, 5], 'every selected row is still deleted');

    const removeTx = fakeTx();
    await deletedCounts.deleteCounted(removeTx, 'feedback', [1, 2, 3, 4, 5]);
    assert.deepEqual(removeTx.calls.map((call) => call.type), ['lock', 'answers', 'counts', 'delete'], 'no leaf is written without the option');
    assert.deepEqual(countsOf(removeTx), [
        ['2024-03-05', 'feedback', 2], ['2024-03-05', 'leaf', 2], ['2024-03-05', 'pledge', 2],
        ['2024-03-06', 'feedback', 2], ['2024-03-06', 'leaf', 1], ['2024-03-06', 'pledge', 1]
    ]);

    const offTx = fakeTx();
    await deletedCounts.deleteCounted(offTx, 'feedback', [1, 2, 3, 4, 5], { keepLeaves: leaves.keeper({ mode: 'remove', details: DETAILS, archiveId: 7, badgeKeysOf }) });
    assert.deepEqual(offTx.calls.map((call) => call.type), ['lock', 'answers', 'counts', 'delete'], 'a keeper made with remove writes nothing');
    assert.deepEqual(countsOf(offTx), countsOf(removeTx));

    const kinds = deletedCounts.withoutKeptLeaves(deletedCounts.SOURCES.feedback.kinds, new Set([1]));
    assert.deepEqual([kinds({ ...LOCKED[0] }), kinds({ ...LOCKED[1] })], [['feedback', 'pledge'], ['feedback', 'pledge', 'leaf']]);
    assert.equal(deletedCounts.withoutKeptLeaves(deletedCounts.SOURCES.feedback.kinds, new Set()), deletedCounts.SOURCES.feedback.kinds);
});

test('the keeper writes one leaf per row the tree was drawing, in the delete transaction, and replaces a stale row', async () => {
    const tx = fakeTx();
    const keep = leaves.keeper({ mode: 'initials', details: DETAILS, archiveId: 7, archivedAt: ARCHIVED_AT, badgeKeysOf });
    const kept = await keep(tx, LOCKED.map((row) => ({ ...row, answer_values: row.id === 3 ? 'The screen was broken' : null })), deletedCounts.SOURCES.feedback.kinds);
    assert.deepEqual([...kept], [1, 2], 'flagged words in an answer, a flagged pledge and a hidden row leave no leaf');
    const insert = tx.calls.find((call) => call.type === 'leaves');
    assert.match(insert.sql, /^INSERT INTO archived_leaves \(feedback_id, created_at, label, badge_key, badge_keys, is_vip, archive_id, archived_at\) VALUES \? AS added\s+ON DUPLICATE KEY UPDATE created_at = added\.created_at, label = added\.label/);
    assert.deepEqual(insert.values, [
        [1, at('2024-03-05T04:00:00Z'), 'J. T.', 'ocean-guardian', null, 1, 7, ARCHIVED_AT],
        [2, at('2024-03-05T05:00:00Z'), 'Visitor', 'feedback-completer', null, 0, 7, ARCHIVED_AT]
    ]);
    assert.equal(JSON.stringify(insert.values).includes('aa:bb:cc'), false);

    // the VIP names are read once per transaction, and nothing is read or written when no row is on the tree
    await keep(tx, [{ ...LOCKED[0] }], deletedCounts.SOURCES.feedback.kinds);
    assert.equal(tx.calls.filter((call) => call.type === 'vips').length, 1);
    const none = fakeTx();
    assert.equal((await keep(none, [{ ...LOCKED[4] }], deletedCounts.SOURCES.feedback.kinds)).size, 0);
    assert.deepEqual(none.calls, []);
    // a row the archive has no details for still gets a leaf, with nothing but the defaults
    const bare = fakeTx();
    await leaves.keeper({ mode: 'initials', details: new Map(), archiveId: 8, archivedAt: ARCHIVED_AT, badgeKeysOf })(bare, [{ ...LOCKED[0] }], deletedCounts.SOURCES.feedback.kinds);
    assert.deepEqual(bare.calls.find((call) => call.type === 'leaves').values, [[1, at('2024-03-05T04:00:00Z'), 'Visitor', 'feedback-completer', null, 0, 8, ARCHIVED_AT]]);
});

test('countDrawn counts the submissions the tree draws, the way the delete counts a leaf', () => {
    const records = [
        { id: 1, is_active: 1, comment: 'I pledge to recycle', data_retention: 'longterm', answers: [{ answer_value: 'Yes' }, { answer_value: '  ' }, { answer_value: null }] },
        { id: 2, is_active: 1, comment: 'Carry a bottle', data_retention: 'temporary', answers: [] },
        { id: 3, is_active: 1, comment: 'Fine', data_retention: 'longterm', answers: [{ answer_value: 'The screen was broken' }] },
        { id: 4, is_active: 0, comment: 'hidden', data_retention: 'longterm' },
        { id: 5, is_active: 1, comment: null, data_retention: 'indefinite' }
    ];
    assert.deepEqual(leaves.countDrawn(records), { leaves: 3, named: 2 });
    assert.deepEqual(leaves.countDrawn([]), { leaves: 0, named: 0 });
    assert.deepEqual(leaves.countDrawn(undefined), { leaves: 0, named: 0 });
});

test('settings: "Leaves on the tree" is keep by default and takes keep, initials or remove only', (t) => {
    assert.equal(settingsStore.DEFAULTS.leaves, 'keep');
    assert.deepEqual(settingsStore.LIMITS.leaves, ['keep', 'initials', 'remove']);
    for (const choice of settingsStore.LIMITS.leaves) {
        assert.equal(settingsStore.validate({ ...defaults(), leaves: choice }, defaults()).settings.leaves, choice);
    }
    for (const bad of ['', 'Keep', 'delete', 'none', null, true, 1, ['keep'], { mode: 'keep' }]) {
        assert.equal(settingsStore.validate({ ...defaults(), leaves: bad }, defaults()).field, 'leaves', `refuses ${JSON.stringify(bad)}`);
    }
    // a body without the key keeps the saved choice (an older page), and the choice survives other changes
    const saved = { ...defaults(), leaves: 'initials' };
    const { leaves: left, ...withoutKey } = defaults();
    assert.equal(left, 'keep');
    assert.equal(settingsStore.validate(withoutKey, saved).settings.leaves, 'initials');
    assert.equal(settingsStore.validate({ ...saved, includePhotos: false }, saved).settings.leaves, 'initials');

    const file = path.join(TMP, 'settings', settingsStore.FILE_NAME);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    t.mock.method(require('../../backend/core/paths'), 'dataFile', () => file);
    assert.equal(settingsStore.read().leaves, 'keep', 'no file yet');
    fs.writeFileSync(file, JSON.stringify({ includePhotos: false }));
    assert.equal(settingsStore.read().leaves, 'keep', 'a settings file saved before this setting existed');
    fs.writeFileSync(file, JSON.stringify({ leaves: 'everything' }));
    assert.equal(settingsStore.read().leaves, 'keep', 'a hand-edited value is repaired');
    for (const choice of ['initials', 'remove']) {
        settingsStore.write({ ...defaults(), leaves: choice });
        assert.equal(settingsStore.read().leaves, choice);
    }
});

test('a kept leaf goes to the tree shaped like a live row: the label as the name, no pledge, archived true', () => {
    const row = { feedback_id: 41, created_at: at('2024-03-05T04:00:00Z'), label: 'J. T.', badge_key: 'ocean-guardian', is_vip: 1 };
    assert.deepEqual(leaves.treeLeaf(row, BADGES), {
        id: 41, name: 'J. T.', visit_count: 1, user_created_at: null, created_at: at('2024-03-05T04:00:00Z'), isVip: true,
        badgeKey: 'ocean-guardian', badgeName: 'Ocean Guardian', badgeColor: '#0ea5e9', pledgeTopic: '', pledgeSnippet: '',
        hasPublicName: false, privacyLabel: 'Details archived', archived: true
    });
    // the same keys as a live row from mapRowsToVisitors, plus archived
    const tree = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'features', 'tree', 'routes.js'), 'utf8');
    const liveKeys = [...tree.slice(tree.indexOf('function mapRowsToVisitors')).match(/return \{([\s\S]*?)\};/)[1].matchAll(/^\s*(\w+)[,:]/gm)].map((m) => m[1]);
    assert.deepEqual(Object.keys(leaves.treeLeaf(row, BADGES)), [...liveKeys, 'archived']);

    // a badge that no longer exists, or a row with nothing in it, still gives every field a value
    for (const odd of [{ feedback_id: 2, created_at: at('2024-01-01T00:00:00Z'), label: '', badge_key: 'retired-badge', is_vip: 0 }, { feedback_id: 3, created_at: at('2024-01-01T00:00:00Z'), label: null, badge_key: null, is_vip: null }]) {
        const leaf = leaves.treeLeaf(odd, BADGES);
        assert.deepEqual([leaf.name, leaf.badgeName, leaf.badgeColor, leaf.isVip], ['Visitor', 'Feedback Contributor', '#10b981', false]);
        for (const [key, value] of Object.entries(leaf)) assert.notEqual(value, undefined, `${key} is set`);
        assert.equal(JSON.stringify(leaf).includes('undefined'), false);
    }
});

test('live and kept leaves share one order: created_at, then id', () => {
    const live = [
        { id: 10, created_at: at('2024-03-01T00:00:00Z'), name: 'Anonymous visitor' },
        { id: 12, created_at: at('2024-03-05T04:00:00Z'), name: 'Grace Lim' },
        { id: 30, created_at: '2024-06-01T00:00:00.000Z', name: 'Anonymous visitor' }
    ];
    const kept = [
        { id: 5, created_at: at('2024-01-15T00:00:00Z'), archived: true },
        { id: 11, created_at: at('2024-03-05T04:00:00Z'), archived: true },
        { id: 13, created_at: at('2024-03-05T04:00:00Z'), archived: true },
        { id: 40, created_at: at('2024-12-30T00:00:00Z'), archived: true }
    ];
    assert.deepEqual(leaves.mergeLeaves(live, kept).map((leaf) => leaf.id), [5, 10, 11, 12, 13, 30, 40]);
    assert.equal(leaves.mergeLeaves(live, []), live, 'nothing kept: the live rows as they are');
    assert.deepEqual(leaves.mergeLeaves([], kept).map((leaf) => leaf.id), [5, 11, 13, 40]);
});

test('the year book: kept leaves are leaves of their year, only leaves that are gone count as archived', () => {
    const book = new Map([[2025, { year: 2025, leafCount: 3, firstSubmission: at('2025-03-01T02:00:00Z'), lastSubmission: at('2025-11-20T02:00:00Z'), isCurrentYear: false }]]);
    // 2025: 3 live, 40 kept on the tree, 5 removed. 2024: only kept leaves. 2023: only removed leaves.
    leaves.mergeYearBook(book, new Map([
        [2025, { count: 40, first: at('2025-01-05T01:00:00Z'), last: at('2025-10-31T09:00:00Z') }],
        [2024, { count: 12, first: at('2024-02-01T03:00:00Z'), last: at('2024-12-30T10:00:00Z') }],
        [2022, { count: 0, first: null, last: null }]
    ]), 2026);
    deletedCounts.mergeYearBook(book, new Map([[2025, { count: 5, firstDay: '2025-02-01', lastDay: '2025-09-30' }], [2023, { count: 7, firstDay: '2023-05-01', lastDay: '2023-05-02' }]]), 2026);

    const y2025 = book.get(2025);
    assert.equal(y2025.leafCount, 48, '3 live + 40 kept + 5 removed');
    assert.equal(y2025.keptLeafCount, 40);
    assert.equal(y2025.archivedLeafCount, 5, 'the book says "48 leaves · 5 archived": the kept ones are drawn');
    assert.equal(new Date(y2025.firstSubmission).toISOString(), '2025-01-05T01:00:00.000Z');
    assert.equal(new Date(y2025.lastSubmission).toISOString(), '2025-11-20T02:00:00.000Z');
    assert.deepEqual(book.get(2024), { year: 2024, leafCount: 12, keptLeafCount: 12, firstSubmission: '2024-02-01T03:00:00.000Z', lastSubmission: '2024-12-30T10:00:00.000Z', isCurrentYear: false });
    assert.equal(book.get(2024).archivedLeafCount, undefined, 'a year whose leaves all stayed shows no "archived" part');
    assert.deepEqual([book.get(2023).leafCount, book.get(2023).archivedLeafCount, book.get(2023).keptLeafCount], [7, 7, undefined]);
    assert.equal(book.has(2022), false, 'a year with no kept leaf is not listed');
    assert.equal(leaves.mergeYearBook(new Map(), new Map([[2026, { count: 1, first: at('2026-01-02T00:00:00Z'), last: at('2026-01-02T00:00:00Z') }]]), 2026).get(2026).isCurrentYear, true);
});

// a small archive written with the given choices; returns its README.txt
async function readmeWith(meta) {
    const created = at('2024-01-02T03:04:05Z');
    const raw = {
        feedback: [{ id: 5, user_id: 9, comment: 'I pledge to recycle', metadata: '{}', photo_path: null, processed_photo_path: null, data_retention: 'longterm', is_active: 1, created_at: created }],
        answers: [], likes: [], users: [{ id: 9, name: 'Test Visitor', email_encrypted: null, visit_count: 1, created_at: created, last_visit: created }],
        userTotals: new Map([[9, { total: 1, temporary: 0 }]]), orphanIds: [], lostFound: [], questions: [], options: []
    };
    const plan = { sources: [], photos: [], missing: [], onDisk: 0, onDiskBytes: 0, includedBytes: 0, temporaryTrimmed: 0 };
    const selection = writer.buildSelection(raw, plan, {});
    const file = path.join(fs.mkdtempSync(path.join(TMP, 'zip-')), 'archive.zip.partial');
    await writer.writeArchive(selection, {
        archiveId: 77, createdAt: at('2026-11-09T06:32:00Z'), createdBy: 'systemadmin', trigger: 'manual',
        criteria: { types: ['feedback'], feedbackBefore: at('2025-11-08T16:00:00Z'), lostFoundBefore: null, onlyResolved: false },
        photosIncluded: true, deleteAfterArchive: true, encryption: { keyFingerprint: 'f00df00df00df00d', developmentKey: false }, ...meta
    }, file);
    const handle = await zip.openZip(file);
    try {
        const entries = await zip.listEntries(handle);
        return { readme: (await zip.readEntry(handle, entries.get('README.txt'))).toString('utf8'), manifest: await zip.readJsonEntry(handle, entries.get('manifest.json')), selection, file };
    } finally {
        handle.close();
    }
}

test('README.txt gets one sentence about the leaves on the tree, and the manifest stays as it was', async () => {
    const keep = await readmeWith({ leaves: { mode: 'keep', leaves: 12, named: 3 } });
    assert.ok(keep.readme.includes('\r\nDigital tree: 12 leaves were to stay on the tree without names; only the date, the badge and the VIP mark of a leaf are kept in the database.\r\n'));
    assert.equal(Object.prototype.hasOwnProperty.call(keep.manifest, 'leaves'), false);
    assert.equal((await writer.verifyArchive(keep.file, { ids: keep.selection.ids })).ok, true);

    const one = await readmeWith({ leaves: { mode: 'keep', leaves: 1, named: 0 } });
    assert.ok(one.readme.includes('Digital tree: 1 leaf was to stay on the tree without a name;'));
    const initials = await readmeWith({ leaves: { mode: 'initials', leaves: 12, named: 3 } });
    assert.ok(initials.readme.includes("Digital tree: 12 leaves were to stay on the tree, with the visitor's initials where the tree showed the name;"));
    const remove = await readmeWith({ leaves: { mode: 'remove', leaves: 12, named: 3 } });
    assert.ok(remove.readme.includes("Digital tree: 12 leaves were to leave the tree with the records; the tree's year book still counts them."));

    // nothing about the tree for an export only, when no submission is a leaf, or from a caller that sends no choice
    for (const meta of [{ deleteAfterArchive: false, leaves: { mode: 'keep', leaves: 12 } }, { leaves: { mode: 'keep', leaves: 0 } }, {}]) {
        assert.equal((await readmeWith(meta)).readme.includes('Digital tree'), false, JSON.stringify(meta));
    }
});
test('a leaf that is still in the database is not drawn twice, and a tree year is a Singapore-time range', () => {
    const live = [{ id: 5, created_at: at('2024-01-01T00:00:00Z'), name: 'Jun Kai Tan' }];
    const kept = [{ id: 5, created_at: at('2024-01-01T00:00:00Z'), name: 'Visitor', archived: true }, { id: 6, created_at: at('2024-01-02T00:00:00Z'), name: 'Visitor', archived: true }];
    assert.deepEqual(leaves.mergeLeaves(live, kept).map((leaf) => [leaf.id, !!leaf.archived]), [[5, false], [6, true]]);
    assert.deepEqual(leaves.yearRange(2026).map((d) => d.toISOString()), ['2025-12-31T16:00:00.000Z', '2026-12-31T16:00:00.000Z']);
});
// <Jun Kai end>
