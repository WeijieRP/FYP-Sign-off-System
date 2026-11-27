// Owner: Role 3, Jun Kai.
// Leaves that stay on the digital tree after the Visitor Data Archive deleted a visitor's records (table
// archived_leaves, migration 008): what is kept for a leaf, the label shown instead of the name, and what the tree
// routes read back. Nothing personal is kept: no name (initials only when the admin chose that), email, pledge or photo.
// <Jun Kai start>
const deletedCounts = require('./deletedCounts');

const DEFAULT_LABEL = 'Visitor';
const DEFAULT_BADGE = 'feedback-completer';
const PRIVACY_LABEL = 'Details archived';
const COLUMNS = ['feedback_id', 'created_at', 'label', 'badge_key', 'badge_keys', 'is_vip', 'archive_id', 'archived_at'];
// the tree's own year rule (Singapore time)
const YEAR_SQL = "YEAR(CONVERT_TZ(al.created_at, '+00:00', '+08:00'))";
// a kept leaf whose feedback id is in the database again (ids start over after a purge) is never drawn twice
const NOT_LIVE_SQL = 'NOT EXISTS (SELECT 1 FROM feedback f WHERE f.id = al.feedback_id)';
// loaded on first use, so the label and row rules below work without a database or the email service
const db = () => require('../../core/db');
const badges = () => require('../email/service');

// keep and initials leave a leaf behind; remove (and anything unknown) does not
const keeps = (mode) => mode === 'keep' || mode === 'initials';

// one written character is a whole word in these scripts, so an "initial" would be the surname or the full name
const WHOLE_WORD_SCRIPT = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u;

// "Jun Kai Tan" -> "J. T.": the first letter of the first and of the last word. "Visitor" when there is no letter
// or when the initials would give the name away: Chinese, Japanese or Korean characters, or one-letter words ("A B").
function initialsOf(name) {
    const words = String(name || '').split(/\s+/u).map((word) => word.match(/\p{L}/gu) || []).filter((letters) => letters.length);
    if (!words.length) return DEFAULT_LABEL;
    const picked = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0][0]];
    const lettersInName = words.reduce((count, letters) => count + letters.length, 0);
    if (picked.length >= lettersInName || picked.some((letter) => WHOLE_WORD_SCRIPT.test(letter))) return DEFAULT_LABEL;
    return picked.map((letter) => `${letter.toUpperCase()}.`).join(' ');
}

// The tree only shows a name with long-term consent (mapRowsToVisitors in the tree routes); the same rule here
function nameShown(retention) {
    const value = String(retention || '').toLowerCase();
    return value === 'longterm' || value === 'indefinite';
}

// The tree's rule for a gold leaf (mapRowsToVisitors in the tree routes): the name is on the VIP list and the tree
// shows the name. vipNames: the lower-case names of vip_management (vipNameSet).
function isVipLeaf(name, retention, vipNames) {
    const shown = String(name || '').trim();
    return nameShown(retention) && !!shown && vipNames.has(shown.toLowerCase());
}

// rows of vip_management -> the names the way the tree compares them
const vipNameSet = (rows) => new Set((rows || []).map((v) => String(v.name || '').trim().toLowerCase()).filter(Boolean));

// The ids of the VIP leaves among the feedback rows that match `where` (SQL about the table as f, with its params).
// Used by everything that archives or bulk-deletes submissions, so that a gold leaf never leaves the tree that way.
// The SQL only narrows the rows down by name; isVipLeaf decides, with the tree's own rule.
async function vipLeafIds(where, params = []) {
    const query = async (sql, values) => (await db().pool.promise().query(sql, values))[0];
    let listed;
    try {
        listed = await query('SELECT name FROM vip_management', []);
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') return []; // no VIP list in this database, so no VIP leaves
        throw error;
    }
    const vipNames = vipNameSet(listed);
    if (!vipNames.size) return [];
    const names = [...vipNames];
    const rows = await query(
        `SELECT f.id, f.data_retention, u.name FROM feedback f JOIN users u ON u.id = f.user_id
         WHERE (${where}) AND (${names.map(() => 'u.name LIKE ?').join(' OR ')})`,
        [...params, ...names.map((name) => `%${name.replace(/[\\%_]/g, '\\$&')}%`)]);
    return rows.filter((row) => isVipLeaf(row.name, row.data_retention, vipNames)).map((row) => row.id);
}

// "1 VIP leaf was kept: ..." for the answers of the delete routes; '' when none was kept
function vipKeptText(count) {
    if (!count) return '';
    return `${count} VIP ${count === 1 ? 'leaf was' : 'leaves were'} kept: a VIP leaf stays on the tree. To delete one, take the name off the VIP list first.`;
}

// Initials only when the admin chose them and the tree was showing the name: archiving never shows more than before
function labelFor(mode, name, shown) {
    return mode === 'initials' && shown ? initialsOf(name) : DEFAULT_LABEL;
}

// The pledge topics the kiosk stored: the first one in pledgeTopic (the tree colours the leaf by it), the whole
// list in pledgeTopics
function topicsOf(metadata) {
    if (!metadata || typeof metadata !== 'string') return { pledgeTopic: '', pledgeTopics: [] };
    try {
        const parsed = JSON.parse(metadata) || {};
        const list = Array.isArray(parsed.pledgeTopics) ? parsed.pledgeTopics.filter((topic) => typeof topic === 'string' && topic) : [];
        return { pledgeTopic: typeof parsed.pledgeTopic === 'string' ? parsed.pledgeTopic : '', pledgeTopics: list };
    } catch {
        return { pledgeTopic: '', pledgeTopics: [] };
    }
}

// One archived_leaves row. record: { id, created_at, name, data_retention, metadata } of a feedback row and its visitor.
// vipNames: lower-case names in vip_management; badgeKeysOf: the email service's determineBadgeKeys.
function leafRow(record, { mode, vipNames, archiveId = null, archivedAt = new Date(), badgeKeysOf = badges().determineBadgeKeys }) {
    const name = String(record.name || '').trim();
    const shown = nameShown(record.data_retention);
    const topics = topicsOf(record.metadata);
    // the leaf keeps the colour the tree gave it (the badge of the first topic); the full list is kept beside it
    const first = (badgeKeysOf({ pledgeTopic: topics.pledgeTopic }) || [])[0] || DEFAULT_BADGE;
    const all = topics.pledgeTopics.length > 1 ? [...new Set(badgeKeysOf({ pledgeTopics: topics.pledgeTopics }) || [])] : [];
    return {
        feedback_id: record.id,
        created_at: record.created_at,
        label: labelFor(mode, name, shown).slice(0, 40),
        badge_key: first,
        badge_keys: all.length > 1 ? all.join(',').slice(0, 255) : null,
        is_vip: isVipLeaf(name, record.data_retention, vipNames) ? 1 : 0,
        archive_id: archiveId,
        archived_at: archivedAt
    };
}

// The feedback rows the tree draws (active, no flagged words), counted the way the delete counts a leaf.
// records: the feedback records of an archive, each with its answers. named: how many of them show a name on the tree.
function countDrawn(records) {
    let leaves = 0;
    let named = 0;
    for (const record of records || []) {
        const answers = (record.answers || []).map((a) => a.answer_value).filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
        const row = { is_active: record.is_active, comment: record.comment, answer_values: answers.length ? answers.join(' ') : null };
        if (!deletedCounts.SOURCES.feedback.kinds(row).includes(deletedCounts.KINDS.leaf)) continue;
        leaves++;
        if (nameShown(record.data_retention)) named++;
    }
    return { leaves, named };
}

// What a leaf is made from, per feedback id, out of the records of an archive ({ visitors, feedback }). The delete
// step has already checked that these feedback columns did not change since the records were collected.
function detailsOf(records) {
    const names = new Map((records.visitors || []).map((visitor) => [visitor.id, visitor.name]));
    return new Map((records.feedback || []).map((f) => [f.id, { name: names.get(f.user_id), data_retention: f.data_retention, metadata: f.metadata }]));
}

// For deletedCounts.deleteCounted, inside the archive's delete transaction: called with the locked feedback rows just
// before they are counted and deleted. Writes a leaf for every row the tree was drawing and returns their ids.
// details: detailsOf(records). badgeKeysOf is only passed by the tests.
function keeper({ mode, details, archiveId, archivedAt = new Date(), badgeKeysOf }) {
    let vipNames = null;
    return async (tx, rows, kindsOf) => {
        const drawn = rows.filter((row) => kindsOf(row).includes(deletedCounts.KINDS.leaf));
        if (!keeps(mode) || !drawn.length) return new Set();
        if (!vipNames) vipNames = vipNameSet(await tx.all('SELECT name FROM vip_management', []));
        const leaves = drawn.map((row) => leafRow({ ...(details.get(row.id) || {}), id: row.id, created_at: row.created_at }, { mode, vipNames, archiveId, archivedAt, badgeKeysOf }));
        // a row left over from before a purge (the same id used again) is replaced, never an error
        await tx.run(
            `INSERT INTO archived_leaves (${COLUMNS.join(', ')}) VALUES ? AS added
             ON DUPLICATE KEY UPDATE ${COLUMNS.slice(1).map((column) => `${column} = added.${column}`).join(', ')}`,
            [leaves.map((leaf) => COLUMNS.map((column) => leaf[column]))]);
        return new Set(leaves.map((leaf) => leaf.feedback_id));
    };
}

// A kept leaf shaped like the rows GET /api/tree returns, plus archived: true. The name is the label; no pledge.
function treeLeaf(row, badgeConfigs = badges().BADGE_CONFIGS) {
    const badgeKey = row.badge_key || DEFAULT_BADGE;
    const badge = badgeConfigs[badgeKey] || badgeConfigs[DEFAULT_BADGE] || {};
    return {
        id: row.feedback_id,
        name: row.label || DEFAULT_LABEL,
        visit_count: 1,
        user_created_at: null,
        created_at: row.created_at,
        isVip: Number(row.is_vip) === 1,
        badgeKey,
        badgeName: badge.name || 'Feedback Contributor',
        badgeColor: badge.color || '',
        pledgeTopic: '',
        pledgeSnippet: '',
        hasPublicName: false,
        privacyLabel: PRIVACY_LABEL,
        archived: true
    };
}

// Live and kept leaves of one year in the tree's order: created_at, then id
function mergeLeaves(live, kept) {
    if (!kept || !kept.length) return live;
    // the live rows are read first: an archive that commits in between must not give the same leaf twice
    const liveIds = new Set(live.map((leaf) => Number(leaf.id)));
    const time = (leaf) => new Date(leaf.created_at).getTime();
    return [...live, ...kept.filter((leaf) => !liveIds.has(Number(leaf.id)))].sort((a, b) => (time(a) - time(b)) || (Number(a.id) - Number(b.id)));
}

const reported = new Set();
function readFailed(error) {
    const code = error.code || error.message;
    if (reported.has(code)) return;
    reported.add(code);
    console.warn(`Archived leaves could not be read (${code}), so the tree shows the database rows only.${error.code === 'ER_NO_SUCH_TABLE' ? ' Run npm run db:migrate.' : ''}`);
}

// A tree year (Singapore time) as two UTC instants, so the query below can use the created_at index
function yearRange(year) {
    const start = (y) => new Date(Date.UTC(y, 0, 1) - 8 * 3600 * 1000);
    return [start(year), start(year + 1)];
}

// The kept leaves of one tree year as tree rows, oldest first. Empty when the table cannot be read.
async function forYear(year) {
    const treeYear = Number(year);
    if (!Number.isInteger(treeYear)) return [];
    try {
        const [rows] = await db().pool.promise().query(
            `SELECT al.feedback_id, al.created_at, al.label, al.badge_key, al.is_vip FROM archived_leaves al
             WHERE al.created_at >= ? AND al.created_at < ? AND ${NOT_LIVE_SQL}
             ORDER BY al.created_at ASC, al.feedback_id ASC`, yearRange(treeYear));
        return rows.map((row) => treeLeaf(row));
    } catch (error) {
        readFailed(error);
        return [];
    }
}

// For GET /api/tree: the year's live leaves with its kept leaves added. Never rejects (the wall display must draw).
async function withKept(liveLeaves, year) {
    try {
        return mergeLeaves(liveLeaves, await forYear(year));
    } catch (error) {
        readFailed(error);
        return liveLeaves;
    }
}

// Kept leaves per Singapore year: Map(year -> { count, first, last }). Empty when unreadable.
async function byYear() {
    try {
        const [rows] = await db().pool.promise().query(
            `SELECT ${YEAR_SQL} AS year, COUNT(*) AS n, MIN(al.created_at) AS first_at, MAX(al.created_at) AS last_at
             FROM archived_leaves al WHERE ${NOT_LIVE_SQL} GROUP BY ${YEAR_SQL}`);
        return new Map(rows.map((row) => [Number(row.year), { count: Number(row.n), first: row.first_at, last: row.last_at }]));
    } catch (error) {
        readFailed(error);
        return new Map();
    }
}

// The tree's year book: kept leaves are leaves of their year (they are drawn), so they add to leafCount and never to
// archivedLeafCount. keptLeafCount says how many. Lists a year that only has kept leaves.
function mergeYearBook(yearMap, keptYears, currentYear) {
    for (const [year, kept] of keptYears) {
        if (!Number.isInteger(year) || !(kept.count > 0)) continue;
        const item = yearMap.get(year) || { year, leafCount: 0, firstSubmission: null, lastSubmission: null, isCurrentYear: year === currentYear };
        item.leafCount += kept.count;
        item.keptLeafCount = kept.count;
        if (kept.first && (!item.firstSubmission || new Date(kept.first) < new Date(item.firstSubmission))) item.firstSubmission = new Date(kept.first).toISOString();
        if (kept.last && (!item.lastSubmission || new Date(kept.last) > new Date(item.lastSubmission))) item.lastSubmission = new Date(kept.last).toISOString();
        yearMap.set(year, item);
    }
    return yearMap;
}

async function addToYearBook(yearMap, currentYear) {
    return mergeYearBook(yearMap, await byYear(), currentYear);
}

// How many leaves each archive run left on the tree: Map(run id -> { kept, initials }). Empty when unreadable.
async function countsForRuns(runIds) {
    const ids = [...new Set(runIds || [])];
    if (!ids.length) return new Map();
    try {
        const [rows] = await db().pool.promise().query(
            'SELECT archive_id, COUNT(*) AS kept, COALESCE(SUM(label <> ?), 0) AS initials FROM archived_leaves WHERE archive_id IN (?) GROUP BY archive_id',
            [DEFAULT_LABEL, ids]);
        return new Map(rows.map((row) => [Number(row.archive_id), { kept: Number(row.kept), initials: Number(row.initials) }]));
    } catch (error) {
        readFailed(error);
        return new Map();
    }
}

module.exports = {
    DEFAULT_LABEL, DEFAULT_BADGE, PRIVACY_LABEL, COLUMNS, keeps, initialsOf, nameShown, isVipLeaf, vipNameSet, vipLeafIds, vipKeptText, labelFor, leafRow, countDrawn, detailsOf, keeper,
    treeLeaf, mergeLeaves, yearRange, forYear, withKept, byYear, mergeYearBook, addToYearBook, countsForRuns
};
// <Jun Kai end>
