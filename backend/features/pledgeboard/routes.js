// Owner: Role 1, Zihan. Previous team: Preti (6), XY (Xuanyang) (3).
// ============================================================
// PLEDGEBOARDROUTES.JS - TABLE OF CONTENT
// ============================================================
// 
// 1. GET PLEDGEBOARD DATA
//    router.get('/pledges'                    - Get all pledges with like counts for public pledgeboard (DONE BY PRETI)
//
// 2. LIKE A PLEDGE 
//    router.post('/like/:feedbackId'          - Add a like to a specific pledge (DONE BY PRETI)
// 
// 3. UNLIKE A PLEDGE 
//    router.delete('/unlike/:feedbackId'      - Remove a like from a specific pledge (DONE BY PRETI)
//
// 4. CHECK IF USER LIKED A PLEDGE 
//    router.get('/check-like/:feedbackId'     - Check if a user has already liked a specific pledge (DONE BY PRETI)
//
// 5. ADMIN: GET PLEDGEBOARD WITH SORTING
//    router.get('/admin/pledges'              - Admin endpoint to get pledges with sorting options for pledgeboard (DONE BY PRETI)
//    detectPledgeSentiment                    - Infer pledge tone for moderation queue fallback (DONE BY XY)
//    router.put('/admin/pledges/:feedbackId/status' - Update admin pledge moderation status (DONE BY XY)
//
// 6. ROOT ENDPOINT 
//    router.get('/'                           - API status and endpoint information (DONE BY PRETI)

const express = require('express');
const router = express.Router();
const db = require('../../core/db');
const auth = require('../../core/auth'); // <Jun Kai/> the sign-in check of the /admin routes below
const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');
const { forLog } = require('../../core/log'); // <Jun Kai/> request values are printed without line breaks
const { detectPledgeSentimentRule } = require('../feedback/pledgeSentiment');

const pledgeTopicsPath = paths.dataFile('pledge-topics.json');
const DEFAULT_PLEDGE_TOPICS = [
    { value: 'climate-change', label: 'Climate Change' },
    { value: 'renewable-energy', label: 'Renewable Energy' },
    { value: 'sustainable-living', label: 'Sustainable Living' },
    { value: 'ocean-conservation', label: 'Ocean Conservation' },
    { value: 'ethical-governance', label: 'Ethical Governance' },
    { value: 'community-impact', label: 'Community Impact' }
];

function parseMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function formatPledgeRow(row) {
    const metadata = parseMetadata(row.metadata);
    const detectedSentiment = detectPledgeSentimentRule(row.pledge).sentiment;
    const pledgeSentiment = metadata.pledgeSentiment === 'negative'
        ? 'negative'
        : (detectedSentiment !== 'neutral' ? detectedSentiment : (metadata.pledgeSentiment || 'neutral'));
    const moderationStatus = metadata.pledgeStatus
        ? (pledgeSentiment === 'negative' ? metadata.pledgeStatus : 'approved')
        : (pledgeSentiment === 'negative' ? 'pending' : 'approved');

    return {
        ...row,
        metadata: {
            ...metadata,
            pledgeSentiment,
            pledgeStatus: moderationStatus
        },
        pledge_topic: metadata.pledgeTopic || '',
        moderation_status: moderationStatus,
        moderated_at: metadata.moderatedAt || null,
        moderated_by: metadata.moderatedBy || null
    };
}

function ensurePledgeTopicConfig() {
    const configDir = path.dirname(pledgeTopicsPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    if (!fs.existsSync(pledgeTopicsPath)) {
        fs.writeFileSync(pledgeTopicsPath, JSON.stringify(DEFAULT_PLEDGE_TOPICS, null, 2));
    }
}

function readPledgeTopics() {
    try {
        ensurePledgeTopicConfig();
        const topics = JSON.parse(fs.readFileSync(pledgeTopicsPath, 'utf8'));
        if (Array.isArray(topics) && topics.length > 0) return topics;
    } catch (error) {
        console.error('Error reading pledge topic config:', error.message);
    }
    return DEFAULT_PLEDGE_TOPICS;
}

function sanitizePledgeTopics(topics) {
    if (!Array.isArray(topics)) return [];
    return topics
        .map(topic => ({
            value: String(topic.value || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, ''),
            label: String(topic.label || '').trim()
        }))
        .filter(topic => topic.value && topic.label)
        .slice(0, 12);
}

// ==================== 1. GET PLEDGEBOARD DATA ====================
// This route retrieves all pledges with their like counts for the public pledgeboard.
// Returns pledges sorted by like count (most liked first).
router.get('/pledges', (req, res) => {
    console.log('🏆 Fetching pledgeboard data...');
    
    const query = `
        SELECT 
            f.id,
            u.name,
            f.comment as pledge,
            f.metadata,
            f.created_at,
            COUNT(pl.id) as like_count
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        LEFT JOIN pledge_likes pl ON f.id = pl.feedback_id
        WHERE f.is_active = 1 
            AND f.archive_status = 'not_archived'
            AND f.comment IS NOT NULL
            AND f.comment != ''
        GROUP BY f.id, u.name, f.comment, f.metadata, f.created_at
        ORDER BY like_count DESC, f.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching pledgeboard data:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch pledgeboard data' 
            });
        }
        
        console.log(`✅ Found ${rows.length} pledges for pledgeboard`);
        
        const approvedPledges = rows
            .map(formatPledgeRow)
            .filter(row => row.moderation_status === 'approved');

        res.json({
            success: true,
            pledges: approvedPledges
        });
    });
});

// ==================== 2. LIKE A PLEDGE ====================
// This route adds a like to a specific pledge.
// Prevents duplicate likes from the same user using user_identifier.
router.post('/like/:feedbackId', (req, res) => {
    const { feedbackId } = req.params;
    const { userIdentifier } = req.body;
    
    if (!userIdentifier) {
        return res.status(400).json({ 
            success: false, 
            error: 'User identifier is required' 
        });
    }
    
    console.log(`👍 Like request for feedback ${forLog(feedbackId)} from user ${forLog(userIdentifier)}`); // <Jun Kai/>
    
    // Check if user already liked this pledge
    const checkQuery = 'SELECT id FROM pledge_likes WHERE feedback_id = ? AND user_identifier = ?';
    
    db.get(checkQuery, [feedbackId, userIdentifier], (err, existingLike) => {
        if (err) {
            console.error('❌ Error checking existing like:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Database error' 
            });
        }
        
        if (existingLike) {
            console.log('⚠️ User already liked this pledge');
            return res.status(400).json({ 
                success: false, 
                error: 'You have already liked this pledge',
                alreadyLiked: true
            });
        }
        
        // Insert new like into database
        const insertQuery = 'INSERT INTO pledge_likes (feedback_id, user_identifier, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)';
        
        db.run(insertQuery, [feedbackId, userIdentifier], function(err) {
            if (err) {
                console.error('❌ Error adding like:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to add like' 
                });
            }
            
            // Get updated like count for this pledge
            const countQuery = 'SELECT COUNT(*) as like_count FROM pledge_likes WHERE feedback_id = ?';
            
            db.get(countQuery, [feedbackId], (err, result) => {
                if (err) {
                    console.error('❌ Error getting updated count:', err);
                    return res.json({ 
                        success: true,
                        message: 'Like added successfully',
                        like_count: null
                    });
                }
                
                console.log(`✅ Like added! New count: ${result.like_count}`);
                
                res.json({
                    success: true,
                    message: 'Like added successfully',
                    like_count: result.like_count
                });
            });
        });
    });
});

// ==================== 3. UNLIKE A PLEDGE ====================
// This route removes a like from a specific pledge.
router.delete('/unlike/:feedbackId', (req, res) => {
    const { feedbackId } = req.params;
    const { userIdentifier } = req.body;
    
    if (!userIdentifier) {
        return res.status(400).json({ 
            success: false, 
            error: 'User identifier is required' 
        });
    }
    
    console.log(`👎 Unlike request for feedback ${forLog(feedbackId)} from user ${forLog(userIdentifier)}`); // <Jun Kai/>
    
    // Delete the like from database
    const deleteQuery = 'DELETE FROM pledge_likes WHERE feedback_id = ? AND user_identifier = ?';
    
    db.run(deleteQuery, [feedbackId, userIdentifier], function(err) {
        if (err) {
            console.error('❌ Error removing like:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to remove like' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Like not found' 
            });
        }
        
        // Get updated like count after removal
        const countQuery = 'SELECT COUNT(*) as like_count FROM pledge_likes WHERE feedback_id = ?';
        
        db.get(countQuery, [feedbackId], (err, result) => {
            if (err) {
                console.error('❌ Error getting updated count:', err);
                return res.json({ 
                    success: true,
                    message: 'Like removed successfully',
                    like_count: null
                });
            }
            
            console.log(`✅ Like removed! New count: ${result.like_count}`);
            
            res.json({
                success: true,
                message: 'Like removed successfully',
                like_count: result.like_count
            });
        });
    });
});

// ==================== 4. CHECK IF USER LIKED A PLEDGE ====================
// This route checks if a user has already liked a specific pledge.
router.get('/check-like/:feedbackId', (req, res) => {
    const { feedbackId } = req.params;
    const { userIdentifier } = req.query;
    
    if (!userIdentifier) {
        return res.status(400).json({ 
            success: false, 
            error: 'User identifier is required' 
        });
    }
    
    // Query database to check for existing like
    const query = 'SELECT id FROM pledge_likes WHERE feedback_id = ? AND user_identifier = ?';
    
    db.get(query, [feedbackId, userIdentifier], (err, row) => {
        if (err) {
            console.error('❌ Error checking like status:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            hasLiked: !!row
        });
    });
});

// ==================== 5. ADMIN: GET PLEDGEBOARD WITH SORTING ====================
// Admin endpoint to get pledges with sorting options.
// Used in admin panel for viewing and managing pledgeboard.
router.get('/admin/pledges', auth.requireAuth, (req, res) => { // <Jun Kai/> signed-in admins only
    const { sortBy, status = 'all' } = req.query; // 'most_liked' or 'least_liked'
    
    console.log(`🏆 Admin fetching pledgeboard data (sort: ${forLog(sortBy || 'most_liked')})...`); // <Jun Kai/>

    
    // Determine sort order based on query parameter
    const sortOrder = sortBy === 'least_liked' ? 'ASC' : 'DESC';
    
    const query = `
        SELECT 
            f.id,
            u.name,
            f.comment as pledge,
            f.metadata,
            f.created_at,
            COUNT(pl.id) as like_count
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        LEFT JOIN pledge_likes pl ON f.id = pl.feedback_id
        WHERE f.is_active = 1 
            AND f.archive_status = 'not_archived'
            AND f.comment IS NOT NULL
            AND f.comment != ''
        GROUP BY f.id, u.name, f.comment, f.metadata, f.created_at
        ORDER BY like_count ${sortOrder}, f.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching admin pledgeboard data:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch pledgeboard data' 
            });
        }
        
        console.log(`✅ Found ${rows.length} pledges for admin pledgeboard`);
        
        let pledges = rows.map(formatPledgeRow);
        if (status !== 'all') {
            pledges = pledges.filter(row => row.moderation_status === status);
        }

        res.json({
            success: true,
            pledges,
            sortBy: sortBy || 'most_liked'
        });
    });
});

// Update pledge moderation status from the admin pledgeboard queue. (DONE BY XY)
router.put('/admin/pledges/:feedbackId/status', auth.requireAuth, (req, res) => { // <Jun Kai/> signed-in admins only
    const { feedbackId } = req.params;
    const { status } = req.body;
    const username = req.session.user.username; // <Jun Kai/> "moderated by" is the signed-in admin, not a name the browser sends
    const allowedStatuses = ['pending', 'approved', 'rejected'];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid pledge status' });
    }

    db.get('SELECT metadata FROM feedback WHERE id = ?', [feedbackId], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (!row) {
            return res.status(404).json({ success: false, error: 'Pledge not found' });
        }

        const metadata = parseMetadata(row.metadata);
        metadata.pledgeStatus = status;
        metadata.moderatedAt = new Date().toISOString();
        metadata.moderatedBy = username;

        db.run(
            'UPDATE feedback SET metadata = ? WHERE id = ?',
            [JSON.stringify(metadata), feedbackId],
            function(updateErr) {
                if (updateErr) {
                    return res.status(500).json({ success: false, error: 'Failed to update pledge status' });
                }
                res.json({ success: true, status, feedbackId: Number(feedbackId) });
            }
        );
    });
});

// Public topic list used by the kiosk feedback form.
router.get('/topics', (req, res) => {
    res.json({ success: true, topics: readPledgeTopics() });
});

// Admin topic list and save endpoint so staff can edit pledge topics without code changes.
router.get('/admin/topics', auth.requireAuth, (req, res) => { // <Jun Kai/> signed-in admins only
    res.json({ success: true, topics: readPledgeTopics() });
});

router.put('/admin/topics', auth.requireAuth, (req, res) => { // <Jun Kai/> signed-in admins only
    const topics = sanitizePledgeTopics(req.body.topics);
    if (topics.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one pledge topic is required' });
    }

    try {
        ensurePledgeTopicConfig();
        fs.writeFileSync(pledgeTopicsPath, JSON.stringify(topics, null, 2));
        res.json({ success: true, topics });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save pledge topics' });
    }
});

// ==================== 6. ROOT ENDPOINT ====================
// This route provides API status and endpoint information.
router.get('/', (req, res) => {
    res.json({ 
        success: true,
        message: 'Pledgeboard API is working!',
        endpoints: {
            publicPledgeboard: 'GET /api/pledgeboard/pledges',
            like: 'POST /api/pledgeboard/like/:feedbackId',
            unlike: 'DELETE /api/pledgeboard/unlike/:feedbackId',
            checkLike: 'GET /api/pledgeboard/check-like/:feedbackId',
            adminPledgeboard: 'GET /api/pledgeboard/admin/pledges?sortBy=most_liked|least_liked'
        }
    });
});

module.exports = router;
