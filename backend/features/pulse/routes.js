// Owner: Role 2, Wei Jie. Previous team: XY (Xuanyang) (2).
// ============================================================
// DONE BY XY - LIVE PULSE ROUTES SUMMARY
//  - Added live RP Xperience Centre Kiosk pulse summary API routes.
//  - Aggregates pledge counts for today, this month, all-time pledges, and digital tree visitors.
//  - Builds anonymized recent pledge feed for public display.
//  - Maps pledge topics to badge labels and builds badge earner/badge mix summaries.
//  - Supports the frontend live pulse dashboard and monthly campaign progress.
//  - Removed Commitment Champion from pulse fallback labels; skipped/no-topic entries use Feedback Contributor.
//  - Find command: rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../../core/db');
const parametersConfigStore = require('../parameters/store');
// <Jun Kai start>
const deletedCounts = require('../archive/deletedCounts');
// <Jun Kai end>

const CAMPAIGN_GOAL = Number(process.env.PULSE_CAMPAIGN_GOAL || 100);

function getActiveCampaign(config = parametersConfigStore.readParametersConfig()) {
    const campaign = config.campaignSettings || {};
    return campaign.enabled === true ? campaign : null;
}

function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row || {});
        });
    });
}

function parseMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function topicToBadge(topic, hasPledge) {
    const map = {
        'climate-change': 'Climate Champion',
        'renewable-energy': 'Renewable Innovator',
        'sustainable-living': 'Sustainable Living Advocate',
        'ocean-conservation': 'Ocean Guardian',
        'ethical-governance': 'Governance Guardian',
        'community-impact': 'Social Champion'
    };

    return hasPledge && topic && map[topic] ? map[topic] : 'Feedback Contributor';
}

function topicToBadgeKey(topic, hasPledge) {
    const map = {
        'climate-change': 'climate-champion',
        'renewable-energy': 'renewable-innovator',
        'sustainable-living': 'sustainable-living-advocate',
        'ocean-conservation': 'ocean-guardian',
        'ethical-governance': 'governance-guardian',
        'community-impact': 'social-champion'
    };

    return hasPledge && topic && map[topic] ? map[topic] : 'feedback-completer';
}

function anonymizePledge(row, index) {
    const metadata = parseMetadata(row.metadata);
    const hasPledge = Boolean(row.comment && String(row.comment).trim());
    return {
        id: row.id,
        pledge: row.comment || '',
        created_at: row.created_at,
        displayName: `Visitor ${index + 1}`,
        badge: topicToBadge(metadata.pledgeTopic, hasPledge),
        badgeKey: topicToBadgeKey(metadata.pledgeTopic, hasPledge)
    };
}

function buildBadgeEarners(rows) {
    const earners = new Map();

    rows.forEach((row) => {
        const name = String(row.name || 'Anonymous Visitor').trim() || 'Anonymous Visitor';
        const metadata = parseMetadata(row.metadata);
        const badges = ['Feedback Contributor'];
        const topicBadge = topicToBadge(metadata.pledgeTopic, Boolean(row.comment && String(row.comment).trim()));

        if (topicBadge !== 'Feedback Contributor') {
            badges.push(topicBadge);
        }

        if (!earners.has(name)) {
            earners.set(name, {
                name,
                badgeCount: 0,
                latestBadge: badges[badges.length - 1],
                lastSeen: row.created_at
            });
        }

        const earner = earners.get(name);
        earner.badgeCount += badges.length;

        if (!earner.lastSeen || new Date(row.created_at) > new Date(earner.lastSeen)) {
            earner.latestBadge = badges[badges.length - 1];
            earner.lastSeen = row.created_at;
        }
    });

    return Array.from(earners.values())
        .sort((a, b) => b.badgeCount - a.badgeCount || new Date(b.lastSeen) - new Date(a.lastSeen))
        .slice(0, 5);
}

function buildBadgeBreakdown(rows, activeCampaign) {
    const counts = new Map();

    rows.forEach((row) => {
        const metadata = parseMetadata(row.metadata);
        const badge = topicToBadge(metadata.pledgeTopic, Boolean(row.comment));
        counts.set(badge, (counts.get(badge) || 0) + 1);
    });

    return Array.from(counts.entries())
        .map(([badge, count]) => ({
            badge,
            count,
            emphasized: activeCampaign?.badgeEmphasis
                ? badge === topicToBadge(activeCampaign.badgeEmphasis, true)
                : false
        }))
        .sort((a, b) => Number(b.emphasized) - Number(a.emphasized) || b.count - a.count);
}

router.get('/summary', async (req, res) => {
    try {
        const parameterConfig = parametersConfigStore.readParametersConfig();
        const activeCampaign = getActiveCampaign(parameterConfig);
        const badgeLeafStyles = parameterConfig.badgeLeafStyles || {};
        const badgeLeafColors = badgeLeafStyles.colors || {};
        const badgeLeafScale = Number(badgeLeafStyles.leafScale);
        const safeBadgeLeafScale = Number.isFinite(badgeLeafScale)
            ? Math.min(2, Math.max(0.4, badgeLeafScale))
            : 1;
        const [today, week, month, total, recentPledges, badgeRows, treeVisitors] = await Promise.all([
            queryOne(`
                SELECT COUNT(*) AS count
                FROM feedback
                WHERE is_active = 1
                  AND archive_status = 'not_archived'
                  AND comment IS NOT NULL
                  AND comment != ''
                  AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
            `),
            queryOne(`
                SELECT COUNT(*) AS count
                FROM feedback
                WHERE is_active = 1
                  AND archive_status = 'not_archived'
                  AND comment IS NOT NULL
                  AND comment != ''
                  AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')), INTERVAL WEEKDAY(CONVERT_TZ(NOW(), '+00:00', '+08:00')) DAY)
                  AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) <= DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
            `),
            queryOne(`
                SELECT COUNT(*) AS count
                FROM feedback
                WHERE is_active = 1
                  AND archive_status = 'not_archived'
                  AND comment IS NOT NULL
                  AND comment != ''
                  AND YEAR(CONVERT_TZ(created_at, '+00:00', '+08:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
                  AND MONTH(CONVERT_TZ(created_at, '+00:00', '+08:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
            `),
            // <Jun Kai start>
            // All-Time Pledges: every pledge ever made, archived and deleted ones included (deletedCounts.js); when it
            // cannot be read the whole summary fails, as before, so the screen keeps its last numbers instead of a 0
            deletedCounts.allTimePledges().then((count) => {
                if (count === null) throw new Error('all-time pledge total unavailable');
                return { count };
            }),
            // <Jun Kai end>
            queryAll(`
                SELECT id, comment, metadata, created_at
                FROM feedback
                WHERE is_active = 1
                  AND archive_status = 'not_archived'
                  AND comment IS NOT NULL
                  AND comment != ''
                ORDER BY created_at DESC
                LIMIT 8
            `),
            queryAll(`
                SELECT u.name, f.comment, f.metadata, f.created_at
                FROM feedback f
                JOIN users u ON f.user_id = u.id
                WHERE f.is_active = 1
                  AND f.archive_status = 'not_archived'
                ORDER BY f.created_at DESC
                LIMIT 300
            `),
            queryAll(`
                SELECT
                    f.id,
                    u.name,
                    u.visit_count,
                    f.created_at,
                    f.comment,
                    f.data_retention,
                    f.metadata
                FROM feedback f
                JOIN users u ON f.user_id = u.id
                WHERE f.is_active = 1
                  AND f.archive_status = 'not_archived'
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT 80
            `)
        ]);

        const pledgesThisMonth = Number(month.count || 0);
        const configuredGoal = Number(activeCampaign?.pulseGoal);
        const goal = Number.isFinite(configuredGoal) && configuredGoal > 0
            ? configuredGoal
            : (Number.isFinite(CAMPAIGN_GOAL) && CAMPAIGN_GOAL > 0 ? CAMPAIGN_GOAL : 100);
        const progressPercent = Math.min(100, Math.round((pledgesThisMonth / goal) * 100));

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            stats: {
                pledgesToday: Number(today.count || 0),
                pledgesThisWeek: Number(week.count || 0),
                pledgesThisMonth,
                totalPledges: Number(total.count || 0),
                campaignGoal: goal,
                progressPercent,
                treeLeaves: treeVisitors.length
            },
            activeCampaign: activeCampaign ? {
                title: activeCampaign.title || 'Current RP Xperience Centre Campaign',
                cadence: activeCampaign.cadence || 'weekly',
                badgeEmphasis: activeCampaign.badgeEmphasis || '',
                treeSubtitle: activeCampaign.treeSubtitle || ''
            } : null,
            newestPledges: recentPledges.map(anonymizePledge),
            topBadgeEarners: buildBadgeEarners(badgeRows),
            badgeBreakdown: buildBadgeBreakdown(badgeRows, activeCampaign),
            treeVisitors: treeVisitors.map((visitor, index) => {
                const metadata = parseMetadata(visitor.metadata);
                const retention = String(visitor.data_retention || '').toLowerCase();
                const canShowName = retention === 'longterm' || retention === 'indefinite';
                const hasPledge = Boolean(visitor.comment && String(visitor.comment).trim());
                const badgeKey = topicToBadgeKey(metadata.pledgeTopic, hasPledge);
                const badge = topicToBadge(metadata.pledgeTopic, hasPledge);

                return {
                    id: visitor.id,
                    name: canShowName ? (visitor.name || `Visitor ${index + 1}`) : `Visitor ${index + 1}`,
                    visit_count: Number(visitor.visit_count) || 1,
                    created_at: visitor.created_at,
                    badge,
                    badgeKey,
                    badgeColor: badgeLeafColors[badgeKey] || '#4a7c59',
                    leafScale: safeBadgeLeafScale
                };
            })
        });
    } catch (error) {
        console.error('Pulse summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load school pulse data'
        });
    }
});

module.exports = router;
