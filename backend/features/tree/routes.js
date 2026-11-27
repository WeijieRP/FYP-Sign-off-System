// Owner: Role 2, Wei Jie. Previous team: XY (Xuanyang) (12).
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. BADGE DATA FOR DIGITAL TREE
//    const getBadgeSummary            - Import badge summary helper from email service (DONE BY XY)
//    GET /api/tree                    - Include badge summary data for visitor tree leaves (DONE BY XY)
//
// 2. TREE LEAF BEHAVIOR
//    visitor records                  - Supports one visible leaf per feedback submission (DONE BY XY)
//    badge summary fallback           - Aligns skipped/no-topic submissions with Feedback Contributor (DONE BY XY)
//
// 3. YEARLY TREE REVIEW
//    getCurrentTreeYear               - Default live tree to current calendar year (DONE BY XY)
//    GET /api/tree?year=YYYY          - Load a completed tree for a selected year (DONE BY XY)
//    GET /api/tree/years              - Return available years for the year review book (DONE BY XY)
//
// 4. INTERACTIVE LEAF DETAILS
//    GET /api/tree                    - Return pledgeSnippet for click-to-view leaf detail cards (DONE BY XY)
//    privacy-safe displayName         - Show Anonymous visitor unless retention allows public name display (DONE BY XY)
//    privacyLabel                     - Explain whether the visitor name is shown or hidden for privacy (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================

const express = require('express');
const router = express.Router();
const { getBadgeSummary, determineBadgeKeys, BADGE_CONFIGS } = require('../email/service');
const { MULTI_PLEDGE_KEY, MULTI_PLEDGE_COLOUR } = require('../parameters/tree3d');
const { isFeedbackFlagged } = require('../analysis/flagged');
<<<<<<< HEAD
// <Jun Kai start>
const deletedCounts = require('../archive/deletedCounts');
const archivedLeaves = require('../archive/archivedLeaves');
// <Jun Kai end>

let db;

// <Jun Kai start>
// The tree page asks for its leaves every second, so nothing is printed when it works. A problem is printed as one
// short line, and at most 3 lines in 10 minutes: a fault that lasts (or comes and goes) cannot fill the terminal.
const TREE_LOG_MAX = 3;
const TREE_LOG_WINDOW_MS = 10 * 60 * 1000;
let treeLogCount = 0;
let treeLogSince = 0;
function treeProblem(text, err, now = Date.now()) {
    if (now - treeLogSince >= TREE_LOG_WINDOW_MS) {
        treeLogCount = 0;
        treeLogSince = now;
    }
    if (treeLogCount >= TREE_LOG_MAX) return false;
    treeLogCount++;
    const detail = err ? `: ${[err.code, err.message || String(err)].filter(Boolean).join(' ')}`.replace(/\s+/g, ' ') : '';
    const last = treeLogCount === TREE_LOG_MAX ? ' (further tree problems are not shown for 10 minutes)' : '';
    console.error(`Tree: ${text}${detail}${last}`);
    return true;
}
// <Jun Kai end>
=======
const paths = require('../../core/paths');
const { createTreeLiveEvents, FINGERPRINT_SQL } = require('./liveEvents');

let db;

// The tree screens' live connection (GET /api/tree/events, ./liveEvents.js): told at once when the tree's data
// or the admin's settings change, instead of checking on a timer.
const liveEvents = createTreeLiveEvents({
    readFingerprint: callback => {
        if (!db) return callback(new Error('Database not initialized'));
        return db.all(FINGERPRINT_SQL, [], (error, rows) => callback(error, rows?.[0] || null));
    },
    settingsFile: paths.dataFile('parametersConfig.json'),
    // The leaf count for the automatic growth stage is counted again at once, not after its 10 seconds.
    onChange: () => { leafCountCache.at = 0; }
});
>>>>>>> weijie_working_branches

function setDatabase(database) {
    db = database;
}

function parseMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function getCurrentTreeYear() {
    return new Date().getFullYear();
}

function parseTreeYear(value) {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    return year;
}

/**
 * GET /api/tree
 * Returns ARRAY of visitors from users table
 * Adds isVip based on vip_management table (case-insensitive)
 */
router.get('/', (req, res) => {
    if (!db) {
        treeProblem('the database is not ready (GET /api/tree)'); // <Jun Kai/>
        return res.status(500).json({ error: 'Database not initialized' });
    }

    // 1) Get ALL VIP names (no is_deleted column anymore)
    const vipQuery = `
        SELECT name
        FROM vip_management
    `;

    db.all(vipQuery, [], (vipErr, vipRows) => {
        if (vipErr) {
            treeProblem('the VIP names could not be read', vipErr); // <Jun Kai/>
            return res.status(500).json({ error: 'VIP fetch error: ' + vipErr.message });
        }

        const vipSet = new Set(
            (vipRows || []).map(v => String(v.name || '').trim().toLowerCase()).filter(Boolean)
        );

        // 2) Get each feedback/pledge submission as its own leaf.
        // A returning visitor can therefore grow multiple leaves instead of only updating one user row.
        const requestedYear = parseTreeYear(req.query.year);
        const treeYear = requestedYear || getCurrentTreeYear();

        loadLeafRows(treeYear, (userErr, visibleRows, hiddenCount) => {
            if (userErr) {
                treeProblem('the leaves could not be read', userErr); // <Jun Kai/>
                return res.status(500).json({ error: 'Leaf query error: ' + userErr.message });
            }

<<<<<<< HEAD
            const visibleRows = (rows || []).filter(row => !isFeedbackFlagged([
                row.comment,
                row.answer_values
            ]));
            // <Jun Kai start>
            // leaves the Visitor Data Archive kept for this year (no name, no pledge, archived: true) are drawn with the
            // live ones, in the same order: created_at, then id
            return archivedLeaves.withKept(mapRowsToVisitors(visibleRows, vipSet), treeYear).then((leaves) => { res.json(leaves); });
            // <Jun Kai end>
=======
            console.log('✅ Tree leaves fetched:', visibleRows.length, hiddenCount ? `(${hiddenCount} flagged hidden)` : '');
            return res.json(mapRowsToVisitors(visibleRows, vipSet));
>>>>>>> weijie_working_branches
        });
    });
});

// The tree's leaves for a year: one per active feedback submission, oldest first, without flagged
// feedback. GET /api/tree shows these, and the automatic growth stage counts them (countLiveTreeLeaves).
const LEAF_QUERY = `
    SELECT
        f.id AS feedback_id,
        u.name,
        u.visit_count,
        u.created_at AS user_created_at,
        f.created_at,
        f.comment,
        f.data_retention,
        f.metadata,
        fa.answer_values
    FROM feedback f
    JOIN users u ON f.user_id = u.id
    LEFT JOIN (
        SELECT feedback_id, GROUP_CONCAT(answer_value SEPARATOR ' ') AS answer_values
        FROM feedback_answers
        WHERE answer_value IS NOT NULL
          AND TRIM(answer_value) != ''
        GROUP BY feedback_id
    ) fa ON fa.feedback_id = f.id
    WHERE f.is_active = 1
      AND YEAR(CONVERT_TZ(f.created_at, '+00:00', '+08:00')) = ?
    ORDER BY f.created_at ASC, f.id ASC
`;

function loadLeafRows(treeYear, callback) {
    db.all(LEAF_QUERY, [treeYear], (error, rows) => {
        if (error) return callback(error);
        const visibleRows = (rows || []).filter(row => !isFeedbackFlagged([row.comment, row.answer_values]));
        return callback(null, visibleRows, (rows || []).length - visibleRows.length);
    });
}

// How many leaves the live tree has now (this year's, as GET /api/tree returns them), for the automatic
// growth stage (features/parameters/treeStage.js). The 2D and 3D trees ask every 5 seconds, so the count
// is kept for 10 seconds.
const LEAF_COUNT_CACHE_MS = 10 * 1000;
let leafCountCache = { at: 0, year: null, count: 0 };
function countLiveTreeLeaves() {
    const year = getCurrentTreeYear();
    if (leafCountCache.year === year && Date.now() - leafCountCache.at < LEAF_COUNT_CACHE_MS) {
        return Promise.resolve(leafCountCache.count);
    }
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        loadLeafRows(year, (error, visibleRows) => {
            if (error) return reject(error);
            leafCountCache = { at: Date.now(), year, count: visibleRows.length };
            return resolve(visibleRows.length);
        });
    });
}

/**
 * GET /api/tree/events
 * Server-Sent Events for the 2D and 3D tree screens: "tree" when a feedback is added, deleted or archived or a
 * VIP changes, "settings" when the admin saves settings (features/tree/liveEvents.js).
 */
router.get('/events', liveEvents.handler);

/**
 * GET /api/tree/years
 * Returns yearly tree summary data for the review book.
 */
router.get('/years', (req, res) => {
    if (!db) {
        treeProblem('the database is not ready (GET /api/tree/years)'); // <Jun Kai/>
        return res.status(500).json({ success: false, currentYear: getCurrentTreeYear(), years: [] });
    }

    const currentYear = getCurrentTreeYear();
    const sql = `
        SELECT
            f.id,
            f.created_at,
            f.comment,
            fa.answer_values
        FROM feedback f
        LEFT JOIN (
            SELECT feedback_id, GROUP_CONCAT(answer_value SEPARATOR ' ') AS answer_values
            FROM feedback_answers
            WHERE answer_value IS NOT NULL
              AND TRIM(answer_value) != ''
            GROUP BY feedback_id
        ) fa ON fa.feedback_id = f.id
        WHERE f.is_active = 1
        ORDER BY f.created_at DESC
    `;

    // <Jun Kai start>
    db.all(sql, [], async (err, rows) => {
    // <Jun Kai end>
        if (err) {
            treeProblem('the tree years could not be read', err); // <Jun Kai/>
            return res.status(500).json({ success: false, currentYear, years: [] });
        }

        const yearMap = new Map();

        (rows || [])
            .filter(row => !isFeedbackFlagged([row.comment, row.answer_values]))
            .forEach(row => {
                const createdAt = row.created_at;
                const year = Number(new Date(createdAt).toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Singapore' }));
                if (!Number.isInteger(year)) return;

                if (!yearMap.has(year)) {
                    yearMap.set(year, {
                        year,
                        leafCount: 0,
                        firstSubmission: createdAt,
                        lastSubmission: createdAt,
                        isCurrentYear: year === currentYear
                    });
                }

                const item = yearMap.get(year);
                item.leafCount += 1;
                if (!item.firstSubmission || new Date(createdAt) < new Date(item.firstSubmission)) {
                    item.firstSubmission = createdAt;
                }
                if (!item.lastSubmission || new Date(createdAt) > new Date(item.lastSubmission)) {
                    item.lastSubmission = createdAt;
                }
            });

        // <Jun Kai start>
        // leaves deleted by the Visitor Data Archive still count in their year (archivedLeafCount says how many)
        await deletedCounts.addToYearBook(yearMap, currentYear);
        // leaves the archive kept on the tree are still drawn, so they count as leaves of their year (not as archived)
        await archivedLeaves.addToYearBook(yearMap, currentYear);
        // <Jun Kai end>
        const years = Array.from(yearMap.values()).sort((a, b) => b.year - a.year);

        if (!years.some(item => item.year === currentYear)) {
            years.unshift({
                year: currentYear,
                leafCount: 0,
                firstSubmission: null,
                lastSubmission: null,
                isCurrentYear: true
            });
        }

        return res.json({ success: true, currentYear, years });
    });
});

function mapRowsToVisitors(rows, vipSet) {
    return (rows || []).map(r => {
        const name = String(r.name || '').trim();
        const metadata = parseMetadata(r.metadata);
        const retention = String(r.data_retention || '').toLowerCase();
        const canShowName = retention === 'longterm' || retention === 'indefinite';
        const displayName = canShowName ? name : 'Anonymous visitor';
        const pledgeText = String(r.comment || metadata.pledge || '').trim();
        const pledgeSnippet = pledgeText.length > 140 ? `${pledgeText.slice(0, 137)}...` : pledgeText;
        const isVip = canShowName && vipSet.has(name.toLowerCase());
        // Every topic the visitor chose in the pledge form (several can be ticked), each its own badge. With more
        // than one badge the leaf is "Multiple pledges" (MULTI_PLEDGE_KEY), brown unless the admin sets another
        // colour (Owner: Role 2, Wei Jie); with one, that badge as before.
        const pledgeTopics = Array.isArray(metadata.pledgeTopics) && metadata.pledgeTopics.length
            ? metadata.pledgeTopics.map(String)
            : (metadata.pledgeTopic ? String(metadata.pledgeTopic).split(',').map(topic => topic.trim()).filter(Boolean) : []);
        const badgeKeys = determineBadgeKeys({ pledgeTopics });
        const badge = badgeKeys.length > 1
            ? {
                badgeKey: MULTI_PLEDGE_KEY,
                badgeName: `Multiple pledges: ${badgeKeys.map(key => BADGE_CONFIGS[key]?.name || key).join(', ')}`,
                badgeColor: MULTI_PLEDGE_COLOUR
            }
            : getBadgeSummary({
                pledge: pledgeText,
                pledgeTopic: metadata.pledgeTopic || pledgeTopics[0] || ''
            });

        return {
            id: r.feedback_id || r.user_id,
            name: displayName,
            visit_count: Number(r.visit_count) || 1,
            user_created_at: r.user_created_at,
            created_at: r.created_at,
            isVip,
            badgeKey: badge.badgeKey,
            badgeName: badge.badgeName,
            badgeColor: badge.badgeColor,
            badgeKeys, // every badge of the topics chosen (one for most visitors)
            pledgeTopic: metadata.pledgeTopic || '',
            pledgeTopics,
            pledgeSnippet,
            hasPublicName: canShowName,
            privacyLabel: canShowName ? 'Name shown with long-term consent' : 'Name hidden for privacy'
        };
    });
}

/**
 * GET /api/tree/vip-names
 * Returns VIP names from vip_management
 */
router.get('/vip-names', (req, res) => {
    if (!db) {
        treeProblem('the database is not ready (GET /api/tree/vip-names)'); // <Jun Kai/>
        return res.status(500).json({ success: false, vipNames: [] });
    }

    const sql = `
        SELECT name
        FROM vip_management
        ORDER BY created_at DESC
    `;

    // IMPORTANT: db.query needs (sql, params, callback)
    db.query(sql, [], (err, rows) => {
        if (err) {
            treeProblem('the VIP name list could not be read', err); // <Jun Kai/>
            return res.status(500).json({ success: false, vipNames: [] });
        }

        const vipNames = (Array.isArray(rows) ? rows : [])
            .map(r => String(r.name || '').trim())
            .filter(Boolean);

        return res.json({ success: true, vipNames });
    });
});

module.exports = {
    router,
    setDatabase,
<<<<<<< HEAD
    treeProblem // <Jun Kai/> for the unit test of the 3 line limit
=======
    countLiveTreeLeaves,
    // A feedback was saved here (features/feedback/routes.js): the tree screens are told at once.
    nudgeTreeScreens: () => liveEvents.nudge()
>>>>>>> weijie_working_branches
};
