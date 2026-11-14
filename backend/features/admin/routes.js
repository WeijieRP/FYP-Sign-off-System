// Owner: Role 3, Jun Kai (admin page; each route group is extracted by the role that owns it). Previous team: Preti (67), Yu Kang (22), XY (Xuanyang) (17), Caeden (17), Nick (12), Bernissa (9), Nadhirah (4), Zah (3).
// ============================================================
// YU KANG — Feedback Analysis Options & LocalGPT (Done by Yu Kang)
// - Feedback analysis modes handled by admin endpoints:
//   * rule-based: server-side heuristic analysis
//   * xenova: transformer-based processing (Xenova)
//   * localgpt: on-prem LocalGPT inference for offline/private processing
// - LocalGPT note: Use local models to avoid external API calls and protect data privacy.
//
// - Flagged feedback analysis:
//   * Added keyword-based flagging for potential issues (e.g. "bad", "worst", "disappointed") (Done by Yu Kang)
//   * Admin dashboard highlights flagged feedback for review (Done by Yu Kang)
//
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. BADGE EMAIL TEMPLATE ADMIN API
//    const badgeEmailTemplateStore    - Badge template JSON storage helper import (DONE BY XY)
//    GET /badge-email-templates       - Load active badges and editable email templates (DONE BY XY)
//    PUT /badge-email-templates       - Save per-badge subject, message and highlights (DONE BY XY)
//
// 2. ACTIVE BADGE FILTERING
//    emailService.ACTIVE_BADGE_KEYS   - Limit admin editor to Feedback Contributor plus 6 topic badges (DONE BY XY)
//    auth.requireAdmin                - Protect badge email template API with system admin access (DONE BY XY)
//
// 3. DAILY LEAVES AND PLEDGES REPORTING
//    GET /leaf-pledge-trends          - Return day-by-day leaf and pledge counts for admin dashboard (DONE BY XY)
//    leaves count                     - Count active feedback submissions as digital tree leaves (DONE BY XY)
//    pledges count                    - Count submissions with non-empty pledge text for each day (DONE BY XY)
//
// 4. PARAMETER CONTENT ADMIN API
//    PUT /parameters                  - Save contentSettings such as retention days and pledge examples (DONE BY XY)
//    auth.requireAdmin                - Restrict parameter edits to system admin users only (DONE BY XY)
//    normalizeContentSettings         - Validate temporary retention days and pledge examples before saving (DONE BY XY)
//
// 5. RETENTION CLEANUP ADMIN CONTROL
//    POST /retention-cleanup/run      - Trigger manual temporary retention cleanup from admin UI (DONE BY XY)
//    dataRetentionCleanup             - Reuse existing cleanup module for admin-triggered cleanup (DONE BY XY)
//
// 6. KIOSK HEALTH DETAILS
//    resolveHealthDetails             - Report camera feature status and storage folder access in server status APIs (DONE BY XY)
//    checkPathAccess                  - Check required upload and overlay directories for read/write access (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
//
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
//
// 1. PARAMETER ADJUSTMENT ADMIN API
//    const parametersConfigStore      - JSON-backed parameter configuration helper import (DONE BY CAEDEN)
//    GET /parameters                  - Load all editable kiosk parameters for admin UI (DONE BY CAEDEN)
//    PUT /parameters                  - Save feature flags, validation rules, text, email, tree, photo and visual asset settings (DONE BY CAEDEN)
//    POST /parameters/reset           - Restore parameter defaults for system admins (DONE BY CAEDEN)
//    POST /parameters/background      - Upload and activate feedback background image files (DONE BY CAEDEN)
//    POST /translate                  - Translate visitor feedback text to English from admin popups (Done by Caeden)
//    archiveSettings                  - Configure auto-archive timing without changing the stored procedure (Done by Caeden)
//
// 2. ADMIN INTERVENTION ALERTS
//    GET /intervention-alerts         - Return dashboard alerts for food waste, low pledge rate, negative feedback and upload risk (DONE BY CAEDEN)
//    getInterventionAlertsFromRows    - Build severity-ranked staff action alerts from recent feedback, pledges and health checks (DONE BY CAEDEN)
//    resolveHealthDetails fallback    - Keep alerts route available even when camera/storage health checks fail (DONE BY CAEDEN)
//
// FIND COMMAND
//    rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// ============================================================
// NICK CHANGE SUMMARY (DONE BY NICK)
// ============================================================
//
// 1. ESG JOURNEY PASSPORT
//    GET /journey-passport            - Return visitor passport milestones for repeat engagement tracking (DONE BY NICK)
//    buildJourneyPassport             - Derive feedback, pledge, keepsake, liked pledge, repeat visit and topic stamps (DONE BY NICK)
//
// FIND COMMAND
//    rg -n "DONE BY NICK|NICK CHANGE SUMMARY" frontend backend
// ============================================================
// YU KANG CHANGE SUMMARY (DONE BY YU KANG)
// ============================================================
//
// - Added backend route to accept custom leaf image uploads and store
//   the asset path in parameters config. Uploaded files are saved to
//   ./assets/Tree/leaf and used by the frontend tree when active. (Done by Yu Kang)
// - Added leaf image revert endpoint that swaps current and previous images,
//   allowing users to revert to prior leaf image with one click. (Done by Yu Kang)
// - Added endpoints to list available leaf images and select from existing images
//   in ./assets/Tree/leaf without re-uploading. (Done by Yu Kang)
// - Added AI Insight Summary endpoint for top concerns, top compliments,
//   weekly summary and suggested admin actions. (Done by Yu Kang)
//
// FIND COMMAND
//    rg -n "YU KANG CHANGE SUMMARY|DONE BY YU KANG" frontend backend
// ============================================================


// ============================================================
// ADMINROUTES.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
// 
// 1. DEPENDENCIES & CONFIGURATION
//    const express                    - Express framework import (DONE BY PRETI)
//    const router                     - Express router instance (DONE BY PRETI)
//    const auth                       - Authentication middleware (DONE BY PRETI)
//    const db                         - Database connection (DONE BY PRETI)
//    const multer                     - File upload middleware (DONE BY PRETI)
//    const path                       - Path utilities (DONE BY PRETI)
//    const fs                         - File system operations (DONE BY PRETI)
//    const archiver                   - ZIP archive creation (DONE BY PRETI)
//    const emailService               - Email service utilities (DONE BY NADH)
//    const emailConfigStore           - Email configuration storage (DONE BY NADH)
//
// 2. AUDIT LOGGING FUNCTIONS
//    function logAudit()              - Log admin actions to database with IP and user agent (DONE BY PRETI)
//
// 3. FILE UPLOAD CONFIGURATION
//    const storage                    - Configure multer storage for overlay file uploads (DONE BY PRETI)
//    const upload                     - Handle PNG file uploads with validation (DONE BY PRETI)
//
// 4. AUTHENTICATION ROUTES
//    router.post('/login'             - Admin login with audit logging (DONE BY PRETI)
//    router.post('/logout-audit'      - Log admin logout with audit trail (DONE BY PRETI)
//    router.post('/keep-alive'        - Keep session alive with heartbeat (DONE BY PRETI)
//
// 5. DASHBOARD ROUTES
//    router.get('/dashboard'          - Get dashboard statistics for last 1 month and recent activity (DONE BY PRETI)
//    router.get('/feedback-stats'     - Get feedback distribution statistics (DONE BY PRETI)
//    router.get('/visitor-trends'     - Get visitor trends data for charts (DONE BY PRETI)
//    router.get('/test-db'            - Test database connection and table counts (DONE BY PRETI)
//
// 6. FEEDBACK MANAGEMENT ROUTES
//    router.get('/feedback'           - Get all feedback with answers and pagination (DONE BY PRETI)
//    router.put('/feedback/:id'       - Update feedback entry with admin notes (DONE BY PRETI)
//    router.delete('/feedback/:id'    - Delete feedback with cascade and photo cleanup (DONE BY PRETI)
//    router.get('/feedback/:id/questions' - Get all feedback questions and answers (DONE BY PRETI)
// 
// 7. ARCHIVE MANAGEMENT ROUTES
//    router.get('/archive'            - Get archived feedback (older than 3 months) (DONE BY PRETI)
//    router.post('/archive/update-status' - Manually trigger archive status update (DONE BY PRETI)
//    router.get('/archive/stats'      - Archive Statistics (DONE BY PRETI)
//    router.post('/bulk-decrypt-archive' - Bulk decrypt archived emails with admin verification (DONE BY PRETI)
//    router.post('/download-archive-photos' - Download archived photos as ZIP (DONE BY PRETI)
//    router.get('/download-file/:filename' - Serve downloaded files from temp directory (DONE BY PRETI)
// 
// 8. ARCHIVE DELETION ROUTES (System Admin Only)
//    router.post('/archive/preview-deletion' - Preview deletion count before executing (System Admin only) (DONE BY PRETI)
//    router.post('/archive/delete-selected' - Permanently delete selected archived feedback (System Admin only) (DONE BY PRETI)
//    router.post('/archive/delete-by-date' - Permanently delete archived feedback by date range (System Admin only) (DONE BY PRETI)
// 
// 9. PHOTO ACCESS & EMAIL DECRYPTION ROUTES
//    router.post('/verify-photo-access' - Verify system admin password for photo access (DONE BY PRETI)
//    router.post('/decrypt-email'     - Decrypt email with system admin verification (DONE BY PRETI)
//    router.post('/decrypt-emails'    - Bulk decrypt multiple emails (DONE BY PRETI)
//
// 10. ADMIN USER MANAGEMENT ROUTES 
//     router.get('/users'              - Get all ACTIVE admin users (excludes soft-deleted) (DONE BY PRETI)
//     router.get('/users/deleted'      - Get all DELETED admin users (soft-deleted only) (DONE BY PRETI)
//     router.post('/users'             - Add new admin user with password hashing and full_name (DONE BY PRETI)
//     router.delete('/users/:id'       - Soft delete admin user (mark as deleted) (DONE BY PRETI)
//     router.post('/users/:id/restore' - Restore soft-deleted admin user (DONE BY PRETI)
//     router.delete('/users/:id/permanent' - Permanently delete soft-deleted user from database (DONE BY PRETI)
//     router.put('/users/:id'          - Update admin user details with validation (DONE BY PRETI)
//
// 11. DATA EXPORT MANAGEMENT ROUTES
//     router.post('/data-export/unlock' - Unlock data export with password verification (System Admin only) (DONE BY PRETI)
//
// 12. EXPORT/DOWNLOAD ROUTES
//     router.get('/download-excel'    - Download feedback as CSV with decrypted emails (DONE BY PRETI)
//     router.get('/download-archive-excel' - Download archived feedback as CSV with decryption (DONE BY PRETI)
//     router.get('/download-photos'   - Download photos as ZIP archive (DONE BY PRETI)
//     router.get('/download-audit-excel' - Download audit logs as CSV (DONE BY PRETI)
//
// 13. OVERLAY MANAGEMENT ROUTES
//     router.get('/overlays'          - Get all overlay themes with display order (DONE BY PRETI)
//     router.post('/overlays'         - Add new overlay with file uploads (System Admin only) (DONE BY PRETI)
//     router.get('/overlay/:id'       - Get overlay image by ID (DONE BY PRETI)
//     router.delete('/overlays/:id'   - Delete overlay and associated image files (DONE BY PRETI)
//
// 14. QUESTION MANAGEMENT ROUTES
//     router.get('/questions'         - Get all active questions with options (DONE BY PRETI)
//     router.post('/questions'        - Add new question with multiple choice options (DONE BY PRETI)
//     router.delete('/questions/:id'  - Delete question with soft/hard delete based on answers (DONE BY PRETI)
//     router.put('/questions/:id'     - Update question safely without breaking answers (DONE BY PRETI)
//
// 15. AUDIT LOGS ROUTES
//     router.get('/audit-logs'        - Get audit log entries with pagination (DONE BY PRETI)
//
// 16. SAVED THEMES ROUTES
//     router.get('/saved-themes'      - Get all saved themes for the current logged-in user (DONE BY PRETI)
//     router.post('/saved-themes'     - Save a new theme for the current user (DONE BY PRETI)
//     router.put('/saved-themes/:id/activate' - Set a saved theme as the active theme (DONE BY PRETI)
//     router.post('/saved-themes/deactivate-all' - Deactivate all themes for current user (DONE BY PRETI)
//     router.put('/saved-themes/:id'  - Update a saved theme (rename only) (DONE BY PRETI)
//     router.delete('/saved-themes/:id' - Delete a saved theme (DONE BY PRETI)
//     router.get('/saved-themes/active' - Get the currently active theme for the logged-in user (DONE BY PRETI)
//
// 17. VIP MANAGEMENT ROUTES
//     router.get('/vips'              - Get VIP list by status (active / deleted) with table check (DONE BY ZAH)
//     router.post('/vips'             - Add new VIP name (duplicate-safe, case-insensitive) (DONE BY ZAH)
//     router.delete('/vips/:name'       - Delete VIP by name (DONE BY Yu Kang)
//
// 18. FORM UI CONFIGURATION ROUTES (DONE BY NADH)
//     router.get('/form-ui'           - Get form UI settings
//     router.put('/form-ui'           - Update form UI settings 
//
// 19. EMAIL CONFIGURATION ROUTES (DONE BY NADH)
//     router.get('/email-config'      - Get email configuration 
//     router.put('/email-config'      - Update email configuration 
//     router.post('/email-config/test' - Test email configuration 
//
// 20. COUNTDOWN TIMER MANAGEMENT ROUTES (DONE BY BERNISSA)
//     router.get('/countdown-management' - Get countdown timer setting 
//     router.put('/countdown-management' - Update countdown timer setting 
//
// 21. SERVER SCHEDULE MANAGEMENT ROUTES (DONE BY BERNISSA)
//     router.get('/server-schedules'  - Get all server schedules 
//     router.post('/server-schedules' - Create new server schedule 
//     router.put('/server-schedules/:id' - Update server schedule 
//     router.delete('/server-schedules/:id' - Delete server schedule 
//     router.put('/server-schedules/:id/toggle' - Toggle schedule active status 
//     router.post('/server-schedules/enable-all' - Enable all schedules 
//     router.post('/server-schedules/disable-all' - Disable all schedules 
//
// 22. SERVER CONTROL ROUTES (DONE BY BERNISSA)
//     router.post('/server/start'     - Start kiosk server 
//     router.post('/server/stop'      - Stop kiosk server 
//     router.get('/server/mode'       - Get server control mode (auto/manual) 
//     router.post('/server/mode'      - Set server control mode 
//     router.get('/server/status'     - Get current server status 
//     router.get('/kiosk-status'      - Get kiosk server status 
//
// 24. PARAMETER ADJUSTMENT ROUTES
//     router.get('/parameters'        - Get all system parameters (DONE BY USER)
//     router.get('/parameters/:category' - Get parameters by category (DONE BY USER)
//     router.put('/parameters'        - Update system parameters (DONE BY USER)
//     router.put('/parameters/:category' - Update specific category (DONE BY USER)
//     router.post('/parameters/reset' - Reset parameters to defaults (DONE BY USER)
//
// 25. HELPER FUNCTIONS
//     function deleteUserPhotos()     - Delete user photo files from filesystem (DONE BY PRETI)
//     function deleteOverlayFiles()   - Delete overlay image files from assets directory (DONE BY PRETI)
//     function checkDirectoryForPhotos() - Check if directory contains image files (DONE BY PRETI)
//     async function createUploadsZip() - Create ZIP archive of uploads directory (DONE BY PRETI)
//     function convertToCSV()         - Convert data array to CSV format (DONE BY PRETI)
//     function readSchedulesConfig()  - Read schedules configuration from JSON file (DONE BY BERNISSA)
//     function writeSchedulesConfig() - Write schedules configuration to JSON file (DONE BY BERNISSA)
//     function readModeConfig()       - Read server control mode from JSON file (DONE BY BERNISSA)
//     function writeModeConfig()      - Write server control mode to JSON file (DONE BY BERNISSA)


const express = require('express');
const axios = require('axios');
const router = express.Router();
const auth = require('../../core/auth');
const bcrypt = require('bcrypt');
const lostFoundStore = require('../lostFound/store'); // changes made by nick
const db = require('../../core/db');
const multer = require('multer');
const path = require('path');
const paths = require('../../core/paths');
const fs = require('fs');
const https = require('https');
const { createZipArchive } = require('../../core/zip');
const emailService = require('../email/service');
const emailConfigStore = require('../email/configStore');
const {
    FLAGGED_FEEDBACK_KEYWORDS,
    analyzeFlaggedFeedbackText
} = require('../analysis/flagged');
const badgeEmailTemplateStore = require('../email/templateStore');
const assetStore = require('../assets/store');
const parametersConfigStore = require('../parameters/store');
const { normalizeTree3dParameters, mergeTree3dParameters } = require('../parameters/tree3d');
const { normalizeTreeStageMode, normalizeLeafThresholds } = require('../parameters/treeStage');
const dataRetentionCleanup = require('../archive/retention');
const feedbackAnalysisCacheStore = require('../analysis/cacheStore');


//AI for sentiment analysis testing (Done by Yu Kang)
let classifier;

async function getModel() {
    if (!classifier) {
        console.log("⏳ Loading AI model (first time only)...");
        const { pipeline } = require('@xenova/transformers'); // loaded lazily: requiring it at boot is slow and nothing else needs it
        classifier = await pipeline(
            'sentiment-analysis',
            'Xenova/bert-base-multilingual-uncased-sentiment'
        );
        console.log("✅ Model loaded");
    }
    return classifier;
}

// ===================== 1. ESG JOURNEY PASSPORT (Done by Nick) =====================
const PASSPORT_TOPIC_LABELS = {
    'climate-change': 'Climate Champion',
    'renewable-energy': 'Renewable Innovator',
    'sustainable-living': 'Sustainable Living Advocate',
    'ocean-conservation': 'Ocean Guardian',
    'ethical-governance': 'Governance Guardian',
    'community-impact': 'Social Champion'
};

const PASSPORT_STAMP_LABELS = {
    firstFeedback: 'First Feedback',
    firstPledge: 'First Pledge',
    photoKeepsake: 'Photo Keepsake',
    likedPledge: 'Community Liked',
    repeatVisitor: 'Repeat Visitor',
    topicExplorer: 'Topic Explorer'
};

function parsePassportMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function addPassportStamp(visitor, key, label, detail) {
    if (visitor._stampKeys.has(key)) return;
    visitor._stampKeys.add(key);
    visitor.stamps.push({ key, label, detail });
}

function buildJourneyPassport(rows) {
    const visitorsById = new Map();

    (rows || []).forEach(row => {
        if (!visitorsById.has(row.user_id)) {
            visitorsById.set(row.user_id, {
                id: row.user_id,
                name: row.name || 'Anonymous Visitor',
                visitCount: Number(row.visit_count || 0),
                firstSeen: row.user_created_at,
                lastSeen: row.last_visit || row.feedback_created_at,
                feedbackCount: 0,
                pledgeCount: 0,
                photoCount: 0,
                likedPledgeCount: 0,
                keepsakeCount: 0,
                topics: new Set(),
                stamps: [],
                _stampKeys: new Set()
            });
        }

        const visitor = visitorsById.get(row.user_id);
        if (!row.feedback_id) return;

        const metadata = parsePassportMetadata(row.metadata);
        const pledgeText = normalizeInsightText(row.comment);
        const topic = metadata.pledgeTopic || '';
        visitor.feedbackCount += 1;
        visitor.pledgeCount += pledgeText ? 1 : 0;
        visitor.photoCount += row.photo_path || row.processed_photo_path ? 1 : 0;
        visitor.keepsakeCount += Number(row.email_sent || 0) > 0 || row.processed_photo_path ? 1 : 0;
        visitor.likedPledgeCount += Number(row.like_count || 0);
        if (topic && PASSPORT_TOPIC_LABELS[topic]) visitor.topics.add(topic);
        if (!visitor.lastSeen || new Date(row.feedback_created_at) > new Date(visitor.lastSeen)) {
            visitor.lastSeen = row.feedback_created_at;
        }
    });

    const stampBreakdown = Object.fromEntries(
        Object.keys(PASSPORT_STAMP_LABELS).map(key => [key, { label: PASSPORT_STAMP_LABELS[key], count: 0 }])
    );

    const passports = Array.from(visitorsById.values()).map(visitor => {
        if (visitor.feedbackCount > 0) {
            addPassportStamp(visitor, 'firstFeedback', PASSPORT_STAMP_LABELS.firstFeedback, `${visitor.feedbackCount} feedback submission${visitor.feedbackCount === 1 ? '' : 's'}`);
        }
        if (visitor.pledgeCount > 0) {
            addPassportStamp(visitor, 'firstPledge', PASSPORT_STAMP_LABELS.firstPledge, `${visitor.pledgeCount} pledge${visitor.pledgeCount === 1 ? '' : 's'} shared`);
        }
        if (visitor.keepsakeCount > 0 || visitor.photoCount > 0) {
            addPassportStamp(visitor, 'photoKeepsake', PASSPORT_STAMP_LABELS.photoKeepsake, `${Math.max(visitor.keepsakeCount, visitor.photoCount)} keepsake moment${Math.max(visitor.keepsakeCount, visitor.photoCount) === 1 ? '' : 's'}`);
        }
        if (visitor.likedPledgeCount > 0) {
            addPassportStamp(visitor, 'likedPledge', PASSPORT_STAMP_LABELS.likedPledge, `${visitor.likedPledgeCount} pledge like${visitor.likedPledgeCount === 1 ? '' : 's'}`);
        }
        if (visitor.visitCount >= 2 || visitor.feedbackCount >= 2) {
            addPassportStamp(visitor, 'repeatVisitor', PASSPORT_STAMP_LABELS.repeatVisitor, `${Math.max(visitor.visitCount, visitor.feedbackCount)} recorded visit${Math.max(visitor.visitCount, visitor.feedbackCount) === 1 ? '' : 's'}`);
        }
        if (visitor.topics.size >= 2) {
            addPassportStamp(visitor, 'topicExplorer', PASSPORT_STAMP_LABELS.topicExplorer, `${visitor.topics.size} pledge topics explored`);
        }

        const topicBadges = Array.from(visitor.topics)
            .map(topic => ({ topic, label: PASSPORT_TOPIC_LABELS[topic] }))
            .sort((a, b) => a.label.localeCompare(b.label));

        visitor.stamps.forEach(stamp => {
            if (stampBreakdown[stamp.key]) stampBreakdown[stamp.key].count += 1;
        });

        const stampCount = visitor.stamps.length + topicBadges.length;

        return {
            id: visitor.id,
            name: visitor.name,
            visitCount: visitor.visitCount,
            feedbackCount: visitor.feedbackCount,
            pledgeCount: visitor.pledgeCount,
            photoCount: visitor.photoCount,
            likedPledgeCount: visitor.likedPledgeCount,
            firstSeen: visitor.firstSeen,
            lastSeen: visitor.lastSeen,
            stampCount,
            progressPercent: Math.min(100, Math.round((stampCount / 12) * 100)),
            stamps: visitor.stamps,
            topicBadges
        };
    })
        .filter(visitor => visitor.feedbackCount > 0)
        .sort((a, b) => b.stampCount - a.stampCount || b.feedbackCount - a.feedbackCount || new Date(b.lastSeen) - new Date(a.lastSeen));

    const totalStamps = passports.reduce((sum, visitor) => sum + visitor.stampCount, 0);
    const repeatVisitors = passports.filter(visitor => visitor.visitCount >= 2 || visitor.feedbackCount >= 2).length;
    const topicBreakdown = Object.entries(passports.reduce((counts, visitor) => {
        (visitor.topicBadges || []).forEach(badge => {
            counts[badge.label] = (counts[badge.label] || 0) + 1;
        });
        return counts;
    }, {}))
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
        summary: {
            passportHolders: passports.length,
            repeatVisitors,
            totalStamps,
            averageStamps: passports.length ? Number((totalStamps / passports.length).toFixed(1)) : 0,
            repeatRate: passports.length ? Math.round((repeatVisitors / passports.length) * 100) : 0
        },
        stampBreakdown: Object.values(stampBreakdown),
        topicBreakdown,
        topPassports: passports.slice(0, 6)
    };
}

// Dashboard intervention alerts for staff action.
router.get('/intervention-alerts', auth.requireAuth, (req, res) => {
    const activeCampaign = getActiveCampaignSettings();
    const feedbackQuery = `
        SELECT id, comment, metadata, photo_path, processed_photo_path, created_at
        FROM feedback
        WHERE is_active = 1
          AND archive_status = 'not_archived'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        ORDER BY created_at DESC
        LIMIT 800
    `;

    const answersQuery = `
        SELECT fa.answer_value AS text, fa.created_at
        FROM feedback_answers fa
        JOIN feedback f ON fa.feedback_id = f.id
        WHERE fa.answer_value IS NOT NULL
          AND TRIM(fa.answer_value) != ''
          AND f.is_active = 1
          AND f.archive_status = 'not_archived'
          AND fa.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        ORDER BY fa.created_at DESC
        LIMIT 800
    `;

    db.all(feedbackQuery, [], (feedbackErr, feedbackRows) => {
        if (feedbackErr) {
            console.error('Error loading intervention feedback data:', feedbackErr);
            return res.status(500).json({ success: false, error: feedbackErr.message });
        }

        db.all(answersQuery, [], async (answersErr, answerRows) => {
            if (answersErr) {
                console.error('Error loading intervention answer data:', answersErr);
                return res.status(500).json({ success: false, error: answersErr.message });
            }

            let health = null;
            try {
                health = resolveHealthDetails();
            } catch (healthError) {
                console.warn('Intervention alert health check unavailable:', healthError.message);
            }

            const alerts = await getInterventionAlertsFromRows(feedbackRows || [], answerRows || [], health, activeCampaign);
            res.json({
                success: true,
                generatedAt: new Date().toISOString(),
                activeCampaign,
                alerts
            });
        });
    });
});

// ESG Journey Passport dashboard summary for repeat engagement tracking.
router.get('/journey-passport', auth.requireAuth, (req, res) => {
    const query = `
        SELECT
            u.id AS user_id,
            u.name,
            u.visit_count,
            u.created_at AS user_created_at,
            u.last_visit,
            f.id AS feedback_id,
            f.comment,
            f.metadata,
            f.photo_path,
            f.processed_photo_path,
            f.email_sent,
            f.created_at AS feedback_created_at,
            COALESCE(pl.like_count, 0) AS like_count
        FROM users u
        LEFT JOIN feedback f
            ON f.user_id = u.id
           AND f.is_active = 1
           AND f.archive_status = 'not_archived'
        LEFT JOIN (
            SELECT feedback_id, COUNT(*) AS like_count
            FROM pledge_likes
            GROUP BY feedback_id
        ) pl ON pl.feedback_id = f.id
        ORDER BY u.last_visit DESC, f.created_at DESC
        LIMIT 1200
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error loading journey passport data:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            passport: buildJourneyPassport(rows || [])
        });
    });
});


// ==================== 2. AUDIT LOGGING FUNCTIONS ====================

function logAudit(action, adminUsername, targetType = null, targetId = null, req = null) {
    // target_id is an INT column: text ids such as 'form-ui' go into target_type instead
    let targetIdValue = null;
    let targetTypeValue = targetType;
    if (targetId !== null && targetId !== undefined && /^\d+$/.test(String(targetId))) targetIdValue = Number(targetId);
    else if (targetId) targetTypeValue = String(targetType ? `${targetType}:${targetId}` : targetId).slice(0, 50);
    
    const ip = req ? req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress : 'unknown';
    const userAgent = req ? req.headers['user-agent'] : 'unknown';
    
    const query = `
        INSERT INTO audit_logs (action, admin_username, target_type, target_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    // Fire and forget - don't await
    db.run(query, [action, adminUsername, targetTypeValue, targetIdValue, ip, userAgent], (err) => {
        if (err) console.error('Audit log failed:', err);
    });
}

// Lost & Found reports for the admin Administration section - changes made by nick
router.get('/lost-found-reports', auth.requireAdmin, (req, res) => {
    lostFoundStore.listLostFoundReports((err, reports) => {
        if (err) {
            console.error('Error loading Lost & Found reports:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        res.json({
            success: true,
            reports: reports || []
        });
    });
});

router.get('/lost-found-reports/export.csv', auth.requireAdmin, (req, res) => { // Lost & Found CSV export (DONE BY NICK)
    lostFoundStore.listLostFoundReports((err, reports) => {
        if (err) {
            console.error('Error exporting Lost & Found reports:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        const csvData = convertToCSV((reports || []).map(report => ({
            TrackingCode: report.tracking_code || '',
            Type: report.report_type || '',
            Item: report.item_description || '',
            Location: report.location_text || '',
            Contact: report.contact_info || '',
            Details: report.details || '',
            Photo: report.item_photo_path || '',
            CurrentPage: report.current_page || '',
            Status: report.status || '',
            CreatedAt: report.created_at || '',
            UpdatedAt: report.updated_at || ''
        })));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=lost_found_reports_${Date.now()}.csv`);
        res.send(csvData || 'TrackingCode,Type,Item,Location,Contact,Details,Photo,CurrentPage,Status,CreatedAt,UpdatedAt\n');
    });
});

router.get('/nick-usage-analytics', auth.requireAdmin, (req, res) => { // Nick feature usage analytics for admin dashboard (DONE BY NICK)
    db.all(`
        SELECT metadata, photo_path, processed_photo_path
        FROM feedback
        WHERE is_active = 1 AND archive_status = 'not_archived'
        ORDER BY created_at DESC
        LIMIT 1000
    `, [], (feedbackErr, feedbackRows) => {
        if (feedbackErr) {
            console.error('Error loading Nick usage analytics:', feedbackErr);
            return res.status(500).json({ success: false, error: feedbackErr.message });
        }

        lostFoundStore.listLostFoundReports((lostFoundErr, reports) => {
            if (lostFoundErr) {
                console.error('Error loading Lost & Found analytics:', lostFoundErr);
                return res.status(500).json({ success: false, error: lostFoundErr.message });
            }

            const analytics = {
                submissionsAnalyzed: feedbackRows.length,
                captures: { photo: 0, boomerang: 0, skipped: 0 },
                keepsakesSaved: 0,
                filterUses: {},
                beautyFilterStrengths: {},
                lostFound: {
                    total: reports.length,
                    withPhotos: 0,
                    byStatus: { new: 0, reviewed: 0, resolved: 0 },
                    byType: { lost: 0, found: 0 }
                }
            };

            feedbackRows.forEach(row => {
                const metadata = parsePassportMetadata(row.metadata);
                const captureMode = String(metadata.captureMode || '').toLowerCase();
                if (metadata.photoSkipped === true || captureMode === 'none') {
                    analytics.captures.skipped += 1;
                } else if (captureMode === 'boomerang') {
                    analytics.captures.boomerang += 1;
                } else if (captureMode === 'photo' || row.photo_path || row.processed_photo_path) {
                    analytics.captures.photo += 1;
                }

                if (row.processed_photo_path || metadata.processedPhotoId) {
                    analytics.keepsakesSaved += 1;
                }

                const accessory = String(metadata.selectedFaceAccessory || '').trim();
                if (accessory && accessory !== 'none') {
                    analytics.filterUses[accessory] = (analytics.filterUses[accessory] || 0) + 1;
                }

                const beautyStrength = String(metadata.beautyFilterStrength || '').trim();
                if (beautyStrength) {
                    analytics.beautyFilterStrengths[beautyStrength] = (analytics.beautyFilterStrengths[beautyStrength] || 0) + 1;
                }
            });

            reports.forEach(report => {
                const status = String(report.status || 'new').toLowerCase();
                const type = String(report.report_type || '').toLowerCase();
                if (analytics.lostFound.byStatus[status] !== undefined) {
                    analytics.lostFound.byStatus[status] += 1;
                }
                if (analytics.lostFound.byType[type] !== undefined) {
                    analytics.lostFound.byType[type] += 1;
                }
                if (report.item_photo_path) {
                    analytics.lostFound.withPhotos += 1;
                }
            });

            res.json({ success: true, analytics });
        });
    });
});

router.patch('/lost-found-reports/:id/status', auth.requireAdmin, (req, res) => {
    const status = req.body?.status;

    lostFoundStore.updateLostFoundReportStatus(req.params.id, status, (err, result) => {
        if (err) {
            console.error('Error updating Lost & Found report status:', err);
            return res.status(400).json({ success: false, error: err.message });
        }

        if (!result.changes) {
            return res.status(404).json({ success: false, error: 'Lost & Found report not found.' });
        }

        logAudit(
            'EDIT_LOST_FOUND_REPORT',
            req.session?.user?.username || 'unknown',
            'lost_found_report',
            req.params.id,
            req
        );

        res.json({ success: true });
    });
});

// ==================== 3. FILE UPLOAD CONFIGURATION ====================

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let destFolder;
        if (file.fieldname === 'desktop_file') {
            destFolder = path.join(paths.ASSETS, 'overlays', 'DesktopOverlay');
        } else if (file.fieldname === 'mobile_file') {
            destFolder = path.join(paths.ASSETS, 'overlays', 'MobileOverlay');
        } else {
            return cb(new Error('Invalid file type'));
        }
        
        console.debug('Saving file to:', destFolder); // Debug log
        
        // Ensure directory exists
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
            console.debug('Created directory:', destFolder);
        }
        cb(null, destFolder);
    },
    filename: (req, file, cb) => {
        const themeId = req.body.theme_id;
        // Preserve PNG/GIF extension for animated overlay uploads - changes made by nick
        const extension = path.extname(file.originalname).toLowerCase();
        let filename;
        
        if (file.fieldname === 'desktop_file') {
            filename = `${themeId}ThemeDesktop${extension}`;
        } else if (file.fieldname === 'mobile_file') {
            filename = `${themeId}ThemeMobile${extension}`;
        } else {
            return cb(new Error('Invalid file type'));
        }
        
        console.debug('Saving file as:', filename); // Debug log
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Allow static PNG and animated GIF overlay files - changes made by nick
        const allowedTypes = ['image/png', 'image/gif'];
        const allowedExtensions = ['.png', '.gif'];
        const extension = path.extname(file.originalname).toLowerCase();

        if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(extension)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG and animated GIF overlay files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Return upload validation errors as JSON instead of an HTML error page - changes made by nick
function handleOverlayUploadErrors(err, req, res, next) {
    if (!err) {
        return next();
    }

    console.error('❌ Overlay upload failed:', err.message);
    return res.status(400).json({
        success: false,
        error: err.message || 'Overlay upload failed'
    });
}

const parameterBackgroundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destFolder = path.join(paths.ASSETS, 'backgrounds');
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }
        cb(null, destFolder);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `feedback-bg-${Date.now()}${ext}`);
    }
});

const uploadParameterBackground = multer({
    storage: parameterBackgroundStorage,
    fileFilter: (req, file, cb) => {
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, and WebP files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

// Storage for custom leaf image uploads
const leafStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destFolder = path.join(paths.ASSETS, 'Tree', 'leaf');
        console.debug('📂 Destination folder:', destFolder);
        try {
            if (!fs.existsSync(destFolder)) {
                console.debug('📁 Creating directory:', destFolder);
                fs.mkdirSync(destFolder, { recursive: true });
                console.debug('✅ Directory created successfully');
            } else {
                console.debug('✅ Directory already exists');
            }
        } catch (err) {
            console.error('❌ Failed to create directory:', err.message);
            return cb(err);
        }
        cb(null, destFolder);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const filename = `CustomLeaf-${Date.now()}${ext}`;
        console.debug(`📁 Leaf filename: ${filename}`);
        cb(null, filename);
    }
});

const uploadParameterLeaf = multer({
    storage: leafStorage,
    fileFilter: (req, file, cb) => {
        console.debug('🔍 Checking file type:', file.mimetype, 'name:', file.originalname);
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
            console.debug('✅ File type accepted');
            cb(null, true);
        } else {
            console.error('❌ File type rejected:', file.mimetype);
            cb(new Error('Only PNG, JPG, and WebP files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Storage for custom tree background image uploads
const treeBackgroundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destFolder = path.join(paths.ASSETS, 'Tree', 'background');
        try {
            if (!fs.existsSync(destFolder)) {
                fs.mkdirSync(destFolder, { recursive: true });
            }
        } catch (err) {
            console.error('❌ Failed to create directory:', err.message);
            return cb(err);
        }
        cb(null, destFolder);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const filename = `tree-bg-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const uploadTreeBackground = multer({
    storage: treeBackgroundStorage,
    fileFilter: (req, file, cb) => {
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, and WebP files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// ==================== 4. AUTHENTICATION ROUTES ====================

// In /login endpoint, replace or modify:
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    auth.loginUser(username, password, (err, user) => {
        if (err) {
            logAudit('LOGIN_FAILED', username, null, null, req);
            return res.status(401).json({ error: err.message });
        }
        
        // Store user in session
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };
        
        logAudit('LOGIN', username, null, null, req);
        res.json({ 
            success: true, 
            user: user,
            message: 'Login successful'
        });
    });
});

// Endpoint for logout logging
router.post('/logout-audit', (req, res) => {
    const { username } = req.body;
    if (username) {
        logAudit('LOGOUT', username, null, null, req);
    }
    
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.json({ success: true });
    });
});

// ==================== SESSION KEEP-ALIVE ENDPOINT ====================

// Keep-alive endpoint - refreshes session timeout
// Called by frontend when user clicks "Stay Logged In" on timeout warning
router.post('/keep-alive', auth.requireAuth, (req, res) => {
    // Simply responding to an authenticated request refreshes the session
    // The auth middleware and session middleware handle the session refresh automatically
    
    const username = req.session?.user?.username || 'unknown';
    console.debug(`🔄 Session keep-alive for user: ${username}`);
    
    // Optional: Touch the session to ensure it's refreshed
    req.session.touch();
    
    res.json({ 
        success: true, 
        message: 'Session refreshed',
        timestamp: new Date().toISOString()
    });
});

// ==================== 5. DASHBOARD ROUTES ====================

// Dashboard data endpoint - FEEDBACK ONLY (matches Feedback Data page filters)
router.get('/dashboard', (req, res) => {
    console.debug('📊 Fetching dashboard data (feedback only, SGT timezone)...');
    
    // ── All queries now use DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) for consistency ──
    // This ensures all date comparisons happen in Singapore timezone
    
    // ── Queries (FEEDBACK ONLY) ──────────────────────────────────────────
    // Feedback submitted today (SGT) - matches "Today" filter
    const feedbackTodayQuery = `
        SELECT COUNT(*) as count 
        FROM feedback 
        WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
          AND is_active = 1 
          AND archive_status = 'not_archived'
    `;
    
    // Feedback submitted this week (SGT) - matches "This Week" filter (Mon-Today)
    // WEEKDAY() returns 0=Monday, 6=Sunday
    const feedbackThisWeekQuery = `
        SELECT COUNT(*) as count 
        FROM feedback 
        WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')), INTERVAL WEEKDAY(CONVERT_TZ(NOW(), '+00:00', '+08:00')) DAY)
          AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) <= DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
          AND is_active = 1 
          AND archive_status = 'not_archived'
    `;
    
    // Feedback submitted this month (SGT) - matches "This Month" filter (1st-Today)
    const feedbackThisMonthQuery = `
        SELECT COUNT(*) as count 
        FROM feedback 
        WHERE YEAR(CONVERT_TZ(created_at, '+00:00', '+08:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
          AND MONTH(CONVERT_TZ(created_at, '+00:00', '+08:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
          AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) <= DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
          AND is_active = 1 
          AND archive_status = 'not_archived'
    `;
    // ─────────────────────────────────────────────────────────────────────

    // Execute queries
    db.get(feedbackTodayQuery, [], (err, feedbackToday) => {
        if (err) {
            console.error('❌ Error fetching today\'s feedback:', err);
            feedbackToday = { count: 0 };
        }
        
        db.get(feedbackThisWeekQuery, [], (err, feedbackThisWeek) => {
            if (err) {
                console.error('❌ Error fetching this week\'s feedback:', err);
                feedbackThisWeek = { count: 0 };
            }
            
            db.get(feedbackThisMonthQuery, [], (err, feedbackThisMonth) => {
                if (err) {
                    console.error('❌ Error fetching this month\'s feedback:', err);
                    feedbackThisMonth = { count: 0 };
                }
                
                // Compile stats - FEEDBACK ONLY
                const stats = {
                    feedbackToday: feedbackToday?.count || 0,
                    feedbackThisWeek: feedbackThisWeek?.count || 0,
                    feedbackThisMonth: feedbackThisMonth?.count || 0,
                    // Keep feedbackSubmissions for backward compatibility
                    feedbackSubmissions: feedbackThisMonth?.count || 0,
                    // Timezone info for debugging
                    timezone: 'Asia/Singapore (UTC+8) - using DATE(CONVERT_TZ) for all queries'
                };
                
                console.debug('📊 Dashboard stats (feedback only, SGT DATE filtering):', {
                    feedbackToday: stats.feedbackToday,
                    feedbackThisWeek: stats.feedbackThisWeek,
                    feedbackThisMonth: stats.feedbackThisMonth
                });
                
                res.json({
                    success: true,
                    stats: stats
                });
            });
        });
    });
});

// Staff-facing sustainability summary for school reporting.
router.get('/school-summary', (req, res) => {
    const summary = {
        feedbackCount: 0,
        pledgeCount: 0,
        photoSubmissions: 0,
        pendingPledges: 0,
        approvedPledges: 0,
        temporaryRetention: 0,
        longtermRetention: 0,
        topTopics: []
    };

    const baseQuery = `
        SELECT id, comment, metadata, photo_path, processed_photo_path, data_retention
        FROM feedback
        WHERE is_active = 1
          AND archive_status = 'not_archived'
    `;

    db.all(baseQuery, [], (err, rows) => {
        if (err) {
            console.error('Error loading school summary:', err);
            return res.status(500).json({ success: false, error: 'Failed to load school summary' });
        }

        const topicCounts = {};

        rows.forEach(row => {
            let metadata = {};
            try {
                metadata = row.metadata ? JSON.parse(row.metadata) : {};
            } catch {
                metadata = {};
            }

            summary.feedbackCount++;
            if (row.comment) summary.pledgeCount++;
            if (row.photo_path || row.processed_photo_path) summary.photoSubmissions++;
            if (row.data_retention === 'temporary' || row.data_retention === '7days' || row.data_retention === '7day') {
                summary.temporaryRetention++;
            }
            if (row.data_retention === 'longterm' || row.data_retention === 'indefinite') {
                summary.longtermRetention++;
            }

            const pledgeStatus = metadata.pledgeStatus || 'approved';
            if (row.comment && pledgeStatus === 'pending') summary.pendingPledges++;
            if (row.comment && pledgeStatus === 'approved') summary.approvedPledges++;

            const topic = metadata.pledgeTopic || 'not-selected';
            if (row.comment) {
                topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            }
        });

        summary.topTopics = Object.entries(topicCounts)
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({ success: true, summary });
    });
});

// ==================== REAL DATA CHART ENDPOINTS (ADDED FOR LIVE DASHBOARD) ====================

// Get real feedback statistics for distribution chart
router.get('/feedback-stats', (req, res) => {
    console.debug('📊 Fetching REAL feedback statistics for charts...');
    
    const queries = {
        withEmail: `
            SELECT COUNT(DISTINCT f.id) as count 
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.is_active = 1 
            AND f.archive_status = 'not_archived'
            AND u.email_encrypted IS NOT NULL 
            AND u.email_encrypted != ''
        `,
        withoutEmail: `
            SELECT COUNT(DISTINCT f.id) as count 
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.is_active = 1 
            AND f.archive_status = 'not_archived'
            AND (u.email_encrypted IS NULL OR u.email_encrypted = '')
        `,
        withPhoto: `
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE is_active = 1 
            AND archive_status = 'not_archived'
            AND (photo_path IS NOT NULL OR processed_photo_path IS NOT NULL)
        `,
        withoutPhoto: `
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE is_active = 1 
            AND archive_status = 'not_archived'
            AND photo_path IS NULL 
            AND processed_photo_path IS NULL
        `,
        longterm: `
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE is_active = 1 
            AND archive_status = 'not_archived'
            AND LOWER(data_retention) IN ('longterm', 'indefinite')
        `,
        temporary: `
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE is_active = 1 
            AND archive_status = 'not_archived'
            AND LOWER(data_retention) IN ('temporary', '7days', '7day')
        `
    };
    
    const results = {};
    const queryKeys = Object.keys(queries);
    let completed = 0;
    
    queryKeys.forEach(key => {
        db.get(queries[key], [], (err, result) => {
            if (err) {
                console.error(`❌ Error fetching ${key}:`, err);
                results[key] = 0;
            } else {
                results[key] = result.count || 0;
            }
            
            completed++;
            
            if (completed === queryKeys.length) {
                console.debug('✅ Feedback statistics (REAL DATA):', results);
                res.json({
                    success: true,
                    stats: results
                });
            }
        });
    });
});

// Get real feedback trends for line chart (FEEDBACK ONLY)
router.get('/visitor-trends', (req, res) => {
    const range = req.query.range || 'week';
    let days = 7;
    
    if (range === 'month') days = 30;
    if (range === 'year') days = 365;
    
    console.debug(`📈 Fetching REAL feedback trends for last ${days} days (SGT)...`);
    
    // SGT offset
    const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
    
    // Query feedback data grouped by date (in SGT)
    // CONVERT_TZ converts from UTC to SGT for proper day grouping
    // Use SGT-based date filtering to match chart iteration
    const feedbackQuery = `
        SELECT 
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d') as date,
            COUNT(*) as feedback
        FROM feedback
        WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) >= DATE(DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '+08:00'), INTERVAL ? DAY))
        AND is_active = 1
        AND archive_status = 'not_archived'
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d')
        ORDER BY date ASC
    `;
    
    db.pool.query(feedbackQuery, [days], (err, feedbackResults) => {
        if (err) {
            console.error('❌ Error fetching feedback trends:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message 
            });
        }
        
        console.debug(`📊 Raw feedback results: ${feedbackResults ? feedbackResults.length : 0} rows`);
        if (feedbackResults && feedbackResults.length > 0) {
            console.debug('   Sample:', feedbackResults[0]);
        }
        
        // Build feedback map
        const feedbackMap = {};
        if (feedbackResults && feedbackResults.length > 0) {
            feedbackResults.forEach(r => {
                let dateStr;
                if (r.date instanceof Date) {
                    const year = r.date.getUTCFullYear();
                    const month = String(r.date.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(r.date.getUTCDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                } else if (typeof r.date === 'string') {
                    dateStr = r.date.split(' ')[0];
                } else {
                    console.warn('⚠️  Unexpected date format:', typeof r.date, r.date);
                    return;
                }
                feedbackMap[dateStr] = parseInt(r.feedback) || 0;
            });
        }
        
        console.debug('📊 Feedback map keys:', Object.keys(feedbackMap));
        console.debug('📊 Feedback map FULL:', feedbackMap);

        // Build labels and data arrays using SGT dates
        const labels = [];
        const feedbackData = [];
        
        // Use SGT for date iteration
        const sgtNow = new Date(Date.now() + SGT_OFFSET_MS);
        
        for (let i = days - 1; i >= 0; i--) {
            // Calculate date in SGT
            const sgtDate = new Date(sgtNow);
            sgtDate.setUTCDate(sgtDate.getUTCDate() - i);
            
            const dateStr = sgtDate.getUTCFullYear() + '-' +
                           String(sgtDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                           String(sgtDate.getUTCDate()).padStart(2, '0');
            
            // Format label
            const dayName = new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short' });
            const dateLabel = new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            labels.push(`${dayName}\n${dateLabel}`);
            
            const feedback = feedbackMap[dateStr] || 0;
            feedbackData.push(feedback);
        }
        
        // Calculate total for debugging
        const totalFeedback = feedbackData.reduce((a, b) => a + b, 0);
        
        console.debug(`✅ Found REAL feedback trends: ${feedbackResults.length} days with data`);
        console.debug(`📈 Total feedback in range: ${totalFeedback}`);
        console.debug('📊 Final feedback data:', feedbackData);
        
        res.json({
            success: true,
            data: {
                labels,
                feedbackData
                // No visitorData - feedback only
            }
        });
    });
});

// Get daily digital tree leaf and pledge counts for admin handover/reporting.
router.get('/leaf-pledge-trends', (req, res) => {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 6));
    console.debug(`🌿 Fetching leaf and pledge trends for last ${days} days (SGT)...`);

    const trendQuery = `
        SELECT
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d') AS date,
            COUNT(*) AS leaves,
            SUM(CASE WHEN comment IS NOT NULL AND TRIM(comment) != '' THEN 1 ELSE 0 END) AS pledges
        FROM feedback
        WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) >= DATE(DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '+08:00'), INTERVAL ? DAY))
          AND is_active = 1
          AND archive_status = 'not_archived'
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d')
        ORDER BY date ASC
    `;

    db.pool.query(trendQuery, [days - 1], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching leaf and pledge trends:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        const rowMap = {};
        (rows || []).forEach(row => {
            const dateStr = row.date instanceof Date
                ? `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, '0')}-${String(row.date.getUTCDate()).padStart(2, '0')}`
                : String(row.date || '').split(' ')[0];

            rowMap[dateStr] = {
                leaves: Number(row.leaves) || 0,
                pledges: Number(row.pledges) || 0
            };
        });

        const labels = [];
        const dates = [];
        const leafData = [];
        const pledgeData = [];
        const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
        const sgtNow = new Date(Date.now() + SGT_OFFSET_MS);

        for (let i = days - 1; i >= 0; i--) {
            const sgtDate = new Date(sgtNow);
            sgtDate.setUTCDate(sgtDate.getUTCDate() - i);

            const dateStr = `${sgtDate.getUTCFullYear()}-${String(sgtDate.getUTCMonth() + 1).padStart(2, '0')}-${String(sgtDate.getUTCDate()).padStart(2, '0')}`;
            const labelDate = new Date(`${dateStr}T00:00:00Z`);
            const dayName = labelDate.toLocaleDateString('en-US', { weekday: 'short' });
            const dateLabel = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const counts = rowMap[dateStr] || { leaves: 0, pledges: 0 };

            dates.push(dateStr);
            labels.push(`${dayName}\n${dateLabel}`);
            leafData.push(counts.leaves);
            pledgeData.push(counts.pledges);
        }

        res.json({
            success: true,
            data: {
                labels,
                dates,
                leafData,
                pledgeData,
                totalLeaves: leafData.reduce((sum, value) => sum + value, 0),
                totalPledges: pledgeData.reduce((sum, value) => sum + value, 0)
            }
        });
    });
});


// Database test endpoint
router.get('/test-db', (req, res) => {
    console.debug('🧪 Testing database connection...');
    
    // Test individual table counts
    const queries = {
        users: 'SELECT COUNT(*) as count FROM users',
        feedback: 'SELECT COUNT(*) as count FROM feedback WHERE is_active = 1',
        admin_users: 'SELECT COUNT(*) as count FROM admin_users',
        feedback_with_rating: 'SELECT COUNT(*) as count FROM feedback WHERE rating IS NOT NULL AND is_active = 1',
        users_today: "SELECT COUNT(*) as count FROM users WHERE DATE(CONVERT_TZ(last_visit, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))"
    };
    
    const results = {};
    const queryKeys = Object.keys(queries);
    let completed = 0;
    
    queryKeys.forEach(table => {
        db.get(queries[table], [], (err, result) => {
            if (err) {
                results[table] = { error: err.message };
            } else {
                results[table] = { count: result.count };
            }
            
            completed++;
            
            // When all queries are done
            if (completed === queryKeys.length) {
                console.debug('📋 Database test results:', results);
                res.json({
                    success: true,
                    message: 'Database test completed',
                    results: results
                });
            }
        });
    });
});


// ==================== 6. FEEDBACK MANAGEMENT ROUTES ====================

router.get('/feedback', (req, res) => {
    console.debug('🔍 Fetching ALL feedback data (pagination handled by frontend)...');
    
    // Get ALL feedback data (no LIMIT/OFFSET - frontend handles pagination like archive page)
    // DATE_FORMAT returns SGT datetime as string for consistent display
    const query = `
        SELECT 
            f.id,
            u.name,
            u.email_encrypted,
            u.visit_count as visits,
            f.comment as pledge,
            f.data_retention,
            f.photo_path,
            f.processed_photo_path,
            DATE_FORMAT(CONVERT_TZ(f.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') as date,
            f.admin_notes
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE f.is_active = 1 AND f.archive_status = 'not_archived'
        ORDER BY f.created_at DESC
    `;
    
    db.all(query, [], (err, feedbackRows) => {
        if (err) {
            console.error('❌ Error fetching feedback data:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        // Now get question answers for each feedback
        const feedbackWithAnswers = [];
        let processed = 0;
        
        if (feedbackRows.length === 0) {
            console.debug('✅ No feedback data found');
            return res.json({
                success: true,
                feedback: []
            });
        }
        
        feedbackRows.forEach(feedback => {
            // Get question answers for this feedback
            const answersQuery = `
                SELECT 
                    q.question_text,
                    q.question_type,
                    fa.answer_value,
                    qo.option_label
                FROM feedback_answers fa
                JOIN questions q ON fa.question_id = q.id
                LEFT JOIN question_options qo ON (
                    q.question_type = 'choice' 
                    AND fa.answer_value = qo.id
                )
                WHERE fa.feedback_id = ?
                ORDER BY q.display_order ASC
            `;
            
            db.all(answersQuery, [feedback.id], (err, answers) => {
                if (err) {
                    console.error('❌ Error fetching answers for feedback:', feedback.id, err);
                    // Continue without answers
                    feedbackWithAnswers.push({
                        ...feedback,
                        question_answers: []
                    });
                } else {
                    feedbackWithAnswers.push({
                        ...feedback,
                        question_answers: answers
                    });
                }
                
                processed++;
                
                if (processed === feedbackRows.length) {
                    console.debug(`✅ Found ${feedbackWithAnswers.length} feedback entries with answers`);
                    
                    res.json({
                        success: true,
                        feedback: feedbackWithAnswers
                    });
                }
            });
        });
    });
});

router.get('/flagged-feedback', auth.requireAuth, (req, res) => {
    console.debug('Fetching flagged feedback using keyword analysis...');

    const query = `
        SELECT
            f.id AS feedback_id,
            u.name,
            DATE_FORMAT(CONVERT_TZ(f.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS date,
            f.comment AS text,
            'Comment' AS source,
            'Visitor pledge' AS question
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE f.comment IS NOT NULL
          AND TRIM(f.comment) != ''
          AND f.is_active = 1
          AND f.archive_status = 'not_archived'
        UNION ALL
        SELECT
            f.id AS feedback_id,
            u.name,
            DATE_FORMAT(CONVERT_TZ(fa.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS date,
            fa.answer_value AS text,
            'Answer' AS source,
            q.question_text AS question
        FROM feedback_answers fa
        JOIN feedback f ON fa.feedback_id = f.id
        JOIN users u ON f.user_id = u.id
        LEFT JOIN questions q ON fa.question_id = q.id
        WHERE fa.answer_value IS NOT NULL
          AND TRIM(fa.answer_value) != ''
          AND f.is_active = 1
          AND f.archive_status = 'not_archived'
        ORDER BY date DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching flagged feedback candidates:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        const flagged = (rows || [])
            .map(row => {
                const analysis = analyzeFlaggedFeedbackText(row.text);
                if (!analysis.flagged) return null;

                return {
                    feedback_id: row.feedback_id,
                    name: row.name || 'Anonymous',
                    date: row.date,
                    source: row.source || 'Feedback',
                    question: row.question || row.source || 'Feedback',
                    text: analysis.text,
                    matchedKeywords: analysis.matchedKeywords
                };
            })
            .filter(Boolean);

        const flaggedFeedbackIds = [...new Set(flagged.map(item => item.feedback_id))];

        return res.json({
            success: true,
            keywords: FLAGGED_FEEDBACK_KEYWORDS,
            flaggedCount: flagged.length,
            flaggedFeedbackIds,
            feedbackCount: flaggedFeedbackIds.length,
            flagged
        });
    });
});

// Update feedback
router.put('/feedback/:id', (req, res) => {
    const { id } = req.params;
    const { comment, admin_notes } = req.body;  
    const query = 'UPDATE feedback SET comment = ?, admin_notes = ? WHERE id = ?';
    db.run(query, [comment, admin_notes, id], function(err) {
        if (err) {
            console.error('❌ Error updating feedback:', err);
            return res.status(500).json({ error: 'Failed to update feedback' });
        }
        
        res.json({ 
            success: true, 
            message: 'Feedback updated successfully',
            changes: this.changes 
        });
    });
});

// Delete feedback - with photo deletion and proper cascade
router.delete('/feedback/:id', auth.requireAuth, async (req, res) => {
    const { id } = req.params;
    const username = req.session.user.username;
    
    console.debug('🗑️ Delete feedback request from:', username);
    
    // Get user role from database
    const getUserRoleQuery = 'SELECT role FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(getUserRoleQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error fetching user role:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!user) {
            console.error('❌ User not found or inactive:', username);
            return res.status(401).json({ error: 'User not authorized' });
        }
        
        console.debug('👤 User role:', user.role);
        
        // IT_staff CANNOT delete feedback
        if (user.role === 'IT_staff') {
            console.error('🚫 IT_staff user attempted to delete feedback:', username);
            logAudit('DELETE_FEEDBACK_DENIED', username, 'feedback', id, req);
            return res.status(403).json({ 
                success: false,
                error: 'Access Denied: IT Staff cannot delete feedback data.',
                role: user.role,
                hint: 'Only IT Admin and System Admin can delete feedback.'
            });
        }
        
        // IT_admin and system_admin CAN delete
        if (user.role !== 'IT_admin' && user.role !== 'system_admin') {
            console.error('❌ Unauthorized role attempted to delete:', user.role);
            logAudit('DELETE_FEEDBACK_DENIED', username, 'feedback', id, req);
            return res.status(403).json({ 
                success: false,
                error: 'Insufficient permissions to delete feedback.',
                role: user.role
            });
        }
        
        console.debug('✅ Authorized deletion by:', username, '(', user.role, ')');
    
    try {
        // Step 1: Get feedback and user data BEFORE deletion (to get photo paths and user_id)
        const getFeedbackQuery = `
            SELECT 
                f.id,
                f.user_id,
                f.photo_path,
                f.processed_photo_path,
                u.name
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.id
            WHERE f.id = ?
        `;
        
        db.get(getFeedbackQuery, [id], (err, feedback) => {
            if (err) {
                console.error('❌ Error fetching feedback data:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!feedback) {
                console.debug('❌ Feedback not found');
                return res.status(404).json({ error: 'Feedback not found' });
            }
            
            console.debug('📋 Feedback data retrieved:', {
                id: feedback.id,
                user_id: feedback.user_id,
                has_photo: !!feedback.photo_path,
                has_processed: !!feedback.processed_photo_path
            });
            
            // Step 2: delete this feedback row (answers and likes cascade). The visitor's users row is only
            // removed when no other feedback points at it, so a returning visitor keeps their other entries.
            db.run('DELETE FROM feedback WHERE id = ?', [feedback.id], function(err) {
                if (err) {
                    console.error('❌ Error deleting feedback:', err);
                    return res.status(500).json({ error: 'Failed to delete feedback: ' + err.message });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Feedback not found or already deleted' });
                }
                logAudit('DELETE_FEEDBACK', username, 'feedback', id, req);
                db.run('DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM feedback WHERE user_id = ?)',
                    [feedback.user_id, feedback.user_id], (userErr) => {
                        if (userErr) console.error('⚠️ Could not remove the empty visitor row:', userErr.message);
                    });
                
                // Step 3: Delete associated photos from filesystem
                deleteUserPhotos(feedback, (photoError) => {
                    if (photoError) {
                        console.error('⚠️ Warning: Some photos could not be deleted:', photoError);
                        // Still return success since database deletion worked
                        return res.json({
                            success: true,
                            message: 'Feedback deleted successfully, but some photos could not be removed',
                            warning: photoError.message,
                            changes: this.changes
                        });
                    }
                    
                    console.debug('✅ All photos deleted successfully');
                    res.json({
                        success: true,
                        message: 'Feedback and all associated data deleted successfully',
                        changes: this.changes
                    });
                });
            });
        });
    } catch (error) {
        console.error('❌ Unexpected error:', error);
        res.status(500).json({ error: 'Unexpected error: ' + error.message });
    }
    }); // Close db.get callback
});


// ==================== 7. FEEDBACK SENTIMENT ANALYSIS (Done by Yu Kang) ====================

//AI analysis modes
const analysis_modes = {
    RULE_BASED: 'rule-based',
    XENOVA: 'xenova',
    LOCALGPT: 'localgpt',
    QWEN: 'qwen',
    GEMMA: 'gemma'
}

function getAnalysisModelName(mode) {
    switch (mode) {
        case analysis_modes.LOCALGPT:
            return 'phi3';
        case analysis_modes.QWEN:
            return 'qwen2.5:3b';
        case analysis_modes.GEMMA:
            return 'gemma2:2b';
        case analysis_modes.XENOVA:
            return 'Xenova/bert-base-multilingual-uncased-sentiment';
        default:
            return 'rule-based';
    }
}

let activeFeedbackAnalysisController = null;
let activeFeedbackAnalysisRunId = 0;

function createAbortError(message = 'Feedback analysis was cancelled') {
    const abortError = new Error(message);
    abortError.name = 'AbortError';
    return abortError;
}

function throwIfAnalysisAborted(signal) {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

const INSIGHT_POSITIVE_KEYWORDS = [
    'good', 'great', 'excellent', 'amazing', 'awesome', 'wonderful', 'fantastic',
    'love', 'best', 'perfect', 'beautiful', 'happy', 'enjoy', 'impressed',
    'satisfied', 'recommend', 'superb', 'outstanding', 'brilliant', 'nice',
    'helpful', 'clear', 'easy', 'friendly', 'interesting', 'fun', 'smooth'
];

const INSIGHT_NEGATIVE_KEYWORDS = [
    'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'poor',
    'disappointing', 'disappointed', 'useless', 'waste', 'angry', 'frustrated',
    'annoyed', 'unhappy', 'dislike', 'rubbish', 'pathetic', 'mediocre',
    'negative', 'concerning', 'problem', 'issue', 'difficult', 'confusing',
    'slow', 'broken', 'error', 'unclear', 'boring', 'hard', 'cannot', "can't"
];

const INSIGHT_CONCERN_CATEGORIES = [
    {
        label: 'Usability or navigation confusion',
        keywords: ['confusing', 'unclear', 'hard', 'difficult', 'cannot', "can't", 'lost', 'complicated', 'navigation', 'button', 'form'],
        action: 'Review the visitor flow and simplify labels, button placement, and instructions on the affected pages.'
    },
    {
        label: 'Performance or technical reliability',
        keywords: ['slow', 'lag', 'loading', 'hang', 'broken', 'error', 'crash', 'bug', 'camera', 'photo', 'qr', 'upload'],
        action: 'Check kiosk logs and test the camera, QR, upload, and network paths during peak visitor usage.'
    },
    {
        label: 'Content clarity',
        keywords: ['unclear', 'explain', 'information', 'more info', 'details', 'understand', 'meaning', 'question'],
        action: 'Rewrite unclear prompts and add short examples for questions visitors struggle to answer.'
    },
    {
        label: 'Experience engagement',
        keywords: ['boring', 'plain', 'not fun', 'dull', 'uninteresting', 'long', 'too much', 'tired'],
        action: 'Add more visual feedback, shorter steps, and clearer progress cues in the visitor journey.'
    },
    {
        label: 'Facilities or service feedback',
        keywords: ['staff', 'service', 'facility', 'place', 'room', 'queue', 'waiting', 'clean', 'noise'],
        action: 'Share these comments with the responsible operations team and track whether the issue repeats next week.'
    }
];

const INSIGHT_COMPLIMENT_CATEGORIES = [
    { label: 'Positive visitor experience', keywords: ['good', 'great', 'excellent', 'amazing', 'awesome', 'wonderful', 'fun', 'interesting', 'enjoy'] },
    { label: 'Clear and useful content', keywords: ['clear', 'helpful', 'informative', 'useful', 'understand', 'learn', 'knowledge'] },
    { label: 'Smooth kiosk interaction', keywords: ['easy', 'smooth', 'fast', 'simple', 'convenient', 'nice', 'friendly'] },
    { label: 'Sustainability motivation', keywords: ['sustainability', 'green', 'recycle', 'environment', 'pledge', 'inspired', 'aware'] }
];

function normalizeInsightText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function isUsefulInsightText(text) {
    if (!text || text.length < 4) return false;
    if (/^[0-9.\-/]+$/.test(text)) return false;
    if (/^(yes|no|true|false|n\/a)$/i.test(text)) return false;
    return true;
}

function countKeywordHits(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.reduce((count, keyword) => count + (lower.includes(keyword) ? 1 : 0), 0);
}

function classifyRuleBasedSentiment(text) {
    const positiveScore = countKeywordHits(text, INSIGHT_POSITIVE_KEYWORDS);
    const negativeScore = countKeywordHits(text, INSIGHT_NEGATIVE_KEYWORDS);

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
}

// Xenova Analysis Engine
async function analyzeWithXenova(text, signal) {
    try {
        throwIfAnalysisAborted(signal);
        const model = await getModel();
        throwIfAnalysisAborted(signal);
        const result = await model(text);
        throwIfAnalysisAborted(signal);
        const label =
            result[0]?.label || '';
        if (
            label.includes('5')
            || label.toLowerCase() === 'positive'
        ) {
            return 'positive';
        }
        if (
            label.includes('1')
            || label.toLowerCase() === 'negative'
        ) {
            return 'negative';
        }
        return 'neutral';
    } catch (error) {
        console.error(
            '❌ Xenova analysis error:',
            error
        );
        return 'neutral';
    }
}

// LocalGPT Analysis Engine
async function analyzeWithLocalGPT(text, signal) {
    try {
        throwIfAnalysisAborted(signal);
        const prompt = `Reply ONLY with one word: positive, negative, or neutral. Text: "${text}" `;

        const response = await axios.post(
            (process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api/generate',
            { model: 'phi3', prompt, stream: false },
            { signal }
        );

        throwIfAnalysisAborted(signal);

        const result = String(response.data.response || '').trim().toLowerCase();
        if (result.includes('positive')) {
            return 'positive';
        }
        if (result.includes('negative')) {
            return 'negative';
        }
        return 'neutral';

    } catch (error) {
        console.error('❌ LocalGPT analysis error:', error);
        return 'neutral';
    }
}

// Qwen Analysis Engine
async function analyzeWithQwen(text, signal) {
    try {
        throwIfAnalysisAborted(signal);
        const prompt = `Reply ONLY with one word: positive, negative, or neutral. Text: "${text}" `;
        
        const response = await axios.post((process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api/generate', {
            model: 'qwen2.5:3b',
            prompt,
            stream: false
        }, {
            signal
        });

        throwIfAnalysisAborted(signal);

        const result = String(response.data.response || '').trim().toLowerCase();
        if (result.includes('positive')) {
            return 'positive';
        }

        if (result.includes('negative')) {
            return 'negative';
        }

        return 'neutral';

    } catch (error) {
        console.error('❌ Qwen analysis error:', error.message);
        return 'neutral';
    }
}

// Gemma Analysis Engine
async function analyzeWithGemma(text, signal) {
    try {
        throwIfAnalysisAborted(signal);
        const response = await axios.post((process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api/generate', {
            model: 'gemma2:2b',
            prompt: `Reply ONLY with one word: positive, negative, or neutral. Text: "${text}" `,
            stream: false
        }, {
            signal
        });

        throwIfAnalysisAborted(signal);

        const result = String(response.data.response || '').trim().toLowerCase();
        if (result.includes('positive')) {
            return 'positive';
        }
        if (result.includes('negative')) {
            return 'negative';
        }
        return 'neutral';

    } catch (error) {
        console.error('❌ Gemma analysis error:', error.message);
        return 'neutral';
    }
}


// Master Classifier
async function classifySentiment(text, mode, signal) {
    throwIfAnalysisAborted(signal);
    switch (mode) {
        case analysis_modes.XENOVA: return await analyzeWithXenova(text, signal);

        case analysis_modes.LOCALGPT: return await analyzeWithLocalGPT(text, signal);

        case analysis_modes.QWEN: return await analyzeWithQwen(text, signal);

        case analysis_modes.GEMMA: return await analyzeWithGemma(text, signal);

        case analysis_modes.RULE_BASED:
        default: return classifyRuleBasedSentiment(text);
    }
}



function buildInsightCategories(items, categories, sentimentFilter) {
    return categories.map(category => {
        const matches = items.filter(item => {
            if (sentimentFilter && item.sentiment !== sentimentFilter) return false;
            return countKeywordHits(item.text, category.keywords) > 0;
        });

        return {
            label: category.label,
            count: matches.length,
            action: category.action,
            examples: matches
                .slice()
                .sort((a, b) => b.text.length - a.text.length)
                .slice(0, 2)
                .map(item => ({
                    text: item.text,
                    question: item.question || item.source,
                    date: item.date
                }))
        };
    })
        .filter(row => row.count > 0)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 5);
}

function buildSuggestedActions(concerns, sentiment) {
    const total = sentiment.total || 0;
    const actions = concerns
        .filter(concern => concern.action)
        .slice(0, 4)
        .map(concern => ({
            title: concern.label,
            action: concern.action,
            priority: concern.count >= 3 ? 'High' : 'Medium'
        }));

    if (total > 0 && sentiment.negative / total >= 0.35) {
        actions.unshift({
            title: 'Negative feedback above normal',
            action: 'Run a quick review of recent visitor comments and fix the most repeated issue before the next kiosk session.',
            priority: 'High'
        });
    }

    if (actions.length === 0) {
        actions.push({
            title: 'Maintain current visitor experience',
            action: 'No repeated concern was detected. Continue monitoring next week and collect more free-text responses.',
            priority: 'Low'
        });
    }

    return actions.slice(0, 5);
}

// Build timeline data structure for frontend charting (Done by Yu Kang)
function buildTimelineFromItems(items) {
    const dateMap = {};

    items.forEach(item => {
        // Use item.date (from backend) or fallback to item.created_at
        const dateStr = item.date || item.created_at || '';
        const date = dateStr.split('T')[0];  // "YYYY-MM-DD"
        if (!date) return; // skip if no date

        if (!dateMap[date]) {
            dateMap[date] = { positive: 0, neutral: 0, negative: 0 };
        }
        const sentiment = (item.sentiment || '').toLowerCase();
        if (sentiment === 'positive') dateMap[date].positive += 1;
        else if (sentiment === 'neutral') dateMap[date].neutral += 1;
        else if (sentiment === 'negative') dateMap[date].negative += 1;
    });

    // Convert to array and sort by date
    return Object.entries(dateMap)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => a.date.localeCompare(b.date));
}


function buildWeeklySummary(items, sentiment, concerns, compliments) {
    const total = sentiment.total || 0;
    const dominantSentiment = [
        ['positive', sentiment.positive],
        ['neutral', sentiment.neutral],
        ['negative', sentiment.negative]
    ].sort((a, b) => b[1] - a[1])[0][0];
    const topConcern = concerns[0]?.label || 'No repeated concern detected';
    const topCompliment = compliments[0]?.label || 'No repeated compliment detected';
    const pledgeCount = items.filter(item => item.source === 'Pledge').length;

    return {
        responseWindow: 'last 7 days',
        totalResponses: total,
        pledgeMentions: pledgeCount,
        dominantSentiment,
        topConcern,
        topCompliment,
        summaryText: total === 0
            ? 'No visitor comments were available for analysis in the last 7 days.'
            : `In the last 7 days, ${total} visitor text response(s) were analyzed. The overall tone is ${dominantSentiment}. The most repeated concern is ${topConcern.toLowerCase()}, while the strongest positive signal is ${topCompliment.toLowerCase()}.`
    };
}

function formatSgtDateKey(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getSgtDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return formatSgtDateKey(date);
}

function getSgtWeekStartKey(daysAgo = 0) {
    const now = new Date();
    const sgtNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    sgtNow.setDate(sgtNow.getDate() - daysAgo);
    const day = sgtNow.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    sgtNow.setDate(sgtNow.getDate() - mondayOffset);
    return formatSgtDateKey(sgtNow);
}

function parseAlertMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function buildInterventionAlert(id, severity, title, message, suggestedAction, metric) {
    return {
        id,
        severity,
        title,
        message,
        suggestedAction,
        metric
    };
}

function getAlertSeverityRank(severity) {
    return { high: 3, medium: 2, low: 1 }[severity] || 0;
}

function getActiveCampaignSettings() {
    const config = parametersConfigStore.readParametersConfig();
    const campaign = config.campaignSettings || {};
    return campaign.enabled === true ? campaign : null;
}

function getCampaignKeywordList(campaign) {
    const keywords = Array.isArray(campaign?.focusKeywords) ? campaign.focusKeywords : [];
    return keywords.map(keyword => normalizeInsightText(keyword).toLowerCase()).filter(Boolean);
}

async function getInterventionAlertsFromRows(feedbackRows, answerRows, health, campaign = null) {
    const todayKey = getSgtDateKey();
    const thisWeekStart = getSgtWeekStartKey(0);
    const previousWeekStart = getSgtWeekStartKey(7);
    const textItems = [];

    (feedbackRows || []).forEach(row => {
        const metadata = parseAlertMetadata(row.metadata);
        const dateKey = getSgtDateKey(row.created_at);
        const pledge = normalizeInsightText(row.comment);
        if (isUsefulInsightText(pledge)) {
            textItems.push({
                text: pledge,
                dateKey,
                created_at: row.created_at,
                source: 'Pledge'
            });
        }
        row._alertMetadata = metadata;
        row._alertDateKey = dateKey;
    });

    (answerRows || []).forEach(row => {
        const text = normalizeInsightText(row.text);
        if (isUsefulInsightText(text)) {
            textItems.push({
                text,
                dateKey: getSgtDateKey(row.created_at),
                created_at: row.created_at,
                source: 'Answer'
            });
        }
    });

    const todayFeedback = (feedbackRows || []).filter(row => row._alertDateKey === todayKey);
    const todayPledges = todayFeedback.filter(row => normalizeInsightText(row.comment).length > 0);
    const todayPhotos = todayFeedback.filter(row => row.photo_path || row.processed_photo_path);
    const pledgeRate = todayFeedback.length > 0 ? todayPledges.length / todayFeedback.length : 1;
    const photoRate = todayFeedback.length > 0 ? todayPhotos.length / todayFeedback.length : 1;

    const thisWeekItems = textItems.filter(item => item.dateKey >= thisWeekStart);
    const previousWeekItems = textItems.filter(item => item.dateKey >= previousWeekStart && item.dateKey < thisWeekStart);
    //const negativeThisWeek = thisWeekItems.filter(item => classifySentiment(item.text) === 'negative');
    const negativeThisWeekResults = await Promise.all(
        thisWeekItems.map(async item => {
            const sentiment = await classifySentiment(item.text, analysis_modes.RULE_BASED);
            return sentiment === 'negative';
        })
    );

    const negativeThisWeek = thisWeekItems.filter((_, index) => negativeThisWeekResults[index]);
    //const negativePreviousWeek = previousWeekItems.filter(item => classifySentiment(item.text) === 'negative');
    const negativePreviousWeekResults = await Promise.all(
        previousWeekItems.map(async item => {
            const sentiment = await classifySentiment(item.text, analysis_modes.RULE_BASED);
            return sentiment === 'negative';
        })
    );

    const negativePreviousWeek = previousWeekItems.filter((_, index) => negativePreviousWeekResults[index]);

    const negativeRate = thisWeekItems.length > 0 ? negativeThisWeek.length / thisWeekItems.length : 0;

    const foodWasteKeywords = ['food waste', 'food', 'meal', 'leftover', 'leftovers', 'canteen', 'waste food', 'throw food'];
    const campaignKeywords = getCampaignKeywordList(campaign);
    const focusKeywords = campaignKeywords.length > 0 ? campaignKeywords : foodWasteKeywords;
    const focusThisWeek = thisWeekItems.filter(item => countKeywordHits(item.text, focusKeywords) > 0);
    const focusPreviousWeek = previousWeekItems.filter(item => countKeywordHits(item.text, focusKeywords) > 0);
    const pendingPledges = (feedbackRows || []).filter(row => {
        const metadata = row._alertMetadata || {};
        return normalizeInsightText(row.comment) && metadata.pledgeStatus === 'pending';
    });

    const alerts = [];

    if (focusThisWeek.length >= 2 && focusThisWeek.length >= Math.max(2, Math.ceil(focusPreviousWeek.length * 1.5))) {
        const focusTitle = campaign?.title ? `${campaign.title} comments increased this week` : 'Food waste comments increased this week';
        alerts.push(buildInterventionAlert(
            campaign?.title ? 'campaign-focus-comments' : 'food-waste-complaints',
            focusThisWeek.length >= 4 ? 'high' : 'medium',
            focusTitle,
            `${focusThisWeek.length} campaign-related concern(s) were detected this week, compared with ${focusPreviousWeek.length} last week.`,
            campaign?.title
                ? 'Review recent feedback against the active campaign focus and update pledge examples if the same issue repeats.'
                : 'Review recent free-text feedback for food waste patterns and share the repeated issue with the sustainability or operations lead.',
            `${focusThisWeek.length} this week`
        ));
    }

    if (todayFeedback.length >= 3 && pledgeRate < 0.4) {
        alerts.push(buildInterventionAlert(
            'low-pledge-rate-today',
            pledgeRate < 0.2 ? 'high' : 'medium',
            'Low pledge rate today',
            `${todayPledges.length} of ${todayFeedback.length} visitor(s) submitted a pledge today.`,
            campaign?.title
                ? `Check whether the pledge step is visible and whether the ${campaign.title} examples are clear enough for visitors.`
                : 'Check whether the pledge step is enabled, visible, and easy to complete. Consider refreshing the pledge examples for the current campaign.',
            `${Math.round(pledgeRate * 100)}% pledge rate`
        ));
    }

    if ((negativeThisWeek.length >= 3 && negativeRate >= 0.3) || pendingPledges.length >= 2) {
        alerts.push(buildInterventionAlert(
            'negative-feedback-spike',
            negativeThisWeek.length >= 5 || pendingPledges.length >= 4 ? 'high' : 'medium',
            'Negative feedback needs review',
            `${negativeThisWeek.length} negative text response(s) and ${pendingPledges.length} pending pledge(s) were detected in the active feedback set.`,
            'Open the feedback insight summary and pledge moderation table, then resolve the repeated concern before the next kiosk session.',
            `${negativeThisWeek.length} negative`
        ));
    }

    const storageIssue = health?.storage && health.storage.ok === false;
    const cameraIssue = health?.camera && health.camera.ok === false;
    if (storageIssue || cameraIssue || (todayFeedback.length >= 3 && photoRate < 0.25)) {
        const severity = storageIssue || cameraIssue ? 'high' : 'medium';
        alerts.push(buildInterventionAlert(
            'camera-upload-risk',
            severity,
            'Camera or upload flow may need attention',
            storageIssue
                ? health.storage.message
                : (cameraIssue ? health.camera.message : `${todayPhotos.length} of ${todayFeedback.length} visitor(s) submitted a photo today.`),
            'Check kiosk camera permissions, upload folders, and the photo feature flags before the next visitor group arrives.',
            storageIssue ? `${health.storage.failing} folder issue(s)` : `${Math.round(photoRate * 100)}% photo rate`
        ));
    }

    if (alerts.length === 0 && todayFeedback.length > 0) {
        alerts.push(buildInterventionAlert(
            'monitoring-normal',
            'low',
            'No urgent intervention detected',
            'Today\'s kiosk activity does not show repeated concerns, low pledge engagement, or upload risk.',
            'Continue monitoring the dashboard after the next visitor group.',
            `${todayFeedback.length} feedback today`
        ));
    }

    return alerts
        .sort((a, b) => getAlertSeverityRank(b.severity) - getAlertSeverityRank(a.severity))
        .slice(0, 5);
}



// AI Insight Summary for admin feedback analysis (Done by Yu Kang)
router.get('/feedback-insight-summary', auth.requireAuth, async(req, res) => {
    const mode = req.query.mode || analysis_modes.RULE_BASED;
    console.debug(`🧠 Generating feedback insights using mode: ${mode}`);

    if (activeFeedbackAnalysisController) {
        activeFeedbackAnalysisController.abort();
    }

    const analysisController = new AbortController();
    const analysisRunId = ++activeFeedbackAnalysisRunId;
    activeFeedbackAnalysisController = analysisController;
    const { signal } = analysisController;

    req.on('close', () => {
        if (activeFeedbackAnalysisController === analysisController) {
            analysisController.abort();
        }
    });

    const query = `
        SELECT
            fa.answer_value AS text,
            q.question_text AS question,
            'Answer' AS source,
            fa.created_at AS created_at
        FROM feedback_answers fa
        JOIN feedback f ON fa.feedback_id = f.id
        LEFT JOIN questions q ON fa.question_id = q.id
        WHERE fa.answer_value IS NOT NULL
          AND TRIM(fa.answer_value) != ''
          AND f.is_active = 1
          AND f.archive_status = 'not_archived'
        UNION ALL
        SELECT
            f.comment AS text,
            'Visitor pledge' AS question,
            'Pledge' AS source,
            f.created_at AS created_at
        FROM feedback f
        WHERE f.comment IS NOT NULL
          AND TRIM(f.comment) != ''
          AND f.is_active = 1
          AND f.archive_status = 'not_archived'
        ORDER BY created_at DESC;
    `;

    db.all(query, [], async (err, rows) => {
        if (signal.aborted || activeFeedbackAnalysisRunId !== analysisRunId) {
            return;
        }

        if (err) {
            if (activeFeedbackAnalysisController === analysisController) {
                activeFeedbackAnalysisController = null;
            }
            console.error('Error loading feedback insight data:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        try {
            throwIfAnalysisAborted(signal);
            const modelName = getAnalysisModelName(mode);
            const rawItems = (rows || []).map(row => ({
                text: normalizeInsightText(row.text),
                question: row.question || row.source || 'Feedback',
                source: row.source || 'Feedback',
                date: row.created_at
            })).filter(item => isUsefulInsightText(item.text));

            const cacheableMode = mode !== analysis_modes.RULE_BASED;
            const uniqueItems = [];
            const uniqueTexts = new Set();

            rawItems.forEach(item => {
                const normalizedText = feedbackAnalysisCacheStore.normalizeAnalysisText(item.text);
                if (!normalizedText || uniqueTexts.has(normalizedText)) {
                    return;
                }

                uniqueTexts.add(normalizedText);
                uniqueItems.push({
                    text: item.text,
                    normalizedText
                });
            });

            const cachedItems = cacheableMode
                ? await feedbackAnalysisCacheStore.getMany(mode, modelName, uniqueItems.map(item => item.text))
                : new Map();

            const analysisByText = new Map();
            const cacheWrites = [];

            for (const item of uniqueItems) {
                throwIfAnalysisAborted(signal);

                const cached = cachedItems.get(item.normalizedText);
                if (cached) {
                    analysisByText.set(item.normalizedText, cached.sentiment);
                    continue;
                }

                let sentiment = 'neutral';
                try {
                    sentiment = await classifySentiment(item.text, mode, signal);
                } catch (err) {
                    if (err.name === 'AbortError') {
                        return;
                    }
                    console.error('❌ classifySentiment failed:', err.message);
                }

                analysisByText.set(item.normalizedText, sentiment);

                if (cacheableMode) {
                    cacheWrites.push({
                        mode,
                        modelName,
                        text: item.text,
                        sentiment
                    });
                }
            }

            if (cacheWrites.length > 0) {
                await feedbackAnalysisCacheStore.saveMany(cacheWrites);
            }

            const items = rawItems.map(item => {
                const normalizedText = feedbackAnalysisCacheStore.normalizeAnalysisText(item.text);

                return {
                    ...item,
                    sentiment: analysisByText.get(normalizedText) || 'neutral',
                    cached: cacheableMode && cachedItems.has(normalizedText)
                };
            });

            throwIfAnalysisAborted(signal);

            const sentiment = items.reduce((counts, item) => {
                counts[item.sentiment]++;
                counts.total++;
                return counts;
            }, {positive: 0, neutral: 0, negative: 0, total: 0});

            const topConcerns = buildInsightCategories(
                items,
                INSIGHT_CONCERN_CATEGORIES,
                'negative'
            );

            const topCompliments = buildInsightCategories(
                items,
                INSIGHT_COMPLIMENT_CATEGORIES,
                'positive'
            );

            const suggestedActions = buildSuggestedActions(
                topConcerns,
                sentiment
            );

            const weeklySummary = buildWeeklySummary(
                items,
                sentiment,
                topConcerns,
                topCompliments
            );

            return res.json({
                success: true,
                sentiment,
                analyzedItems: items,
                insights: {
                    weeklySummary,
                    topConcerns,
                    topCompliments,
                    suggestedActions,
                    analyzedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }

            console.error('❌ Route crash:', error);

            if (!res.headersSent) {
                return res.status(500).json({ success: false, error: error.message });
            }
        } finally {
            if (activeFeedbackAnalysisController === analysisController) {
                activeFeedbackAnalysisController = null;
            }
        }
    });
});

// Sentiment AI analysis of feedback answers (added by Yu Kang)
router.get('/feedback-sentiment-analysis', async (req, res) => {
    console.debug('🧠 Running LOCAL AI sentiment analysis...');

    const query = `
        SELECT answer_value
        FROM feedback_answers
        WHERE answer_value IS NOT NULL AND answer_value != ''
    `;

    db.all(query, [], async (err, answers) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        try {
            const model = await getModel();

            let positive = 0, neutral = 0, negative = 0;

            for (const answer of answers) {
                const text = answer.answer_value;

                const result = await model(text);
                const label = result[0].label;

                if (label.includes('5') || label === 'POSITIVE') positive++;
                else if (label.includes('1') || label === 'NEGATIVE') negative++;
                else neutral++;
            }

            res.json({
                success: true,
                sentiment: {
                    positive,
                    neutral,
                    negative,
                    total: answers.length
                }
            });

        } catch (error) {
            console.error('❌ AI Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// ==================== 8. ARCHIVE MANAGEMENT ROUTES ====================

// Get archived feedback (older than 3 months)
router.get('/archive', (req, res) => {
    console.debug('📂 Fetching archived feedback data...');
    
    // DATE_FORMAT returns SGT datetime as string for consistent display
    const query = `
        SELECT 
            f.id,
            u.name,
            u.email_encrypted,
            u.visit_count as visits,
            f.comment as pledge,
            f.data_retention,
            f.photo_path,
            f.processed_photo_path,
            DATE_FORMAT(CONVERT_TZ(f.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') as date
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE f.is_active = 1 AND f.archive_status = 'archived'
        ORDER BY f.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching archived feedback:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        if (rows.length === 0) {
            console.debug('📂 No archived feedback found');
            return res.json({
                success: true,
                feedback: []
            });
        }
        
        // Fetch question answers for each archived feedback (same as /feedback route)
        const archiveWithAnswers = [];
        let processed = 0;
        
        rows.forEach(feedback => {
            const answersQuery = `
                SELECT 
                    q.question_text,
                    q.question_type,
                    fa.answer_value,
                    qo.option_label
                FROM feedback_answers fa
                JOIN questions q ON fa.question_id = q.id
                LEFT JOIN question_options qo ON (
                    q.question_type = 'choice' 
                    AND fa.answer_value = qo.id
                )
                WHERE fa.feedback_id = ?
                ORDER BY q.display_order ASC
            `;
            
            db.all(answersQuery, [feedback.id], (err, answers) => {
                archiveWithAnswers.push({
                    ...feedback,
                    question_answers: err ? [] : answers
                });
                
                processed++;
                
                if (processed === rows.length) {
                    console.debug(`📂 Found ${archiveWithAnswers.length} archived feedback entries with answers`);
                    res.json({
                        success: true,
                        feedback: archiveWithAnswers
                    });
                }
            });
        });
    });
});

// Manually trigger archive status update using configurable archive timing (Done by Caeden)
router.post('/archive/update-status', (req, res) => {
    console.debug('Manually updating archive status with configured archive timing...');

    runConfiguredArchive((err, result) => {
        if (err) {
            console.error('Error updating archive status:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to update archive status: ' + err.message
            });
        }
        
        console.log(`Archive update complete - Archived now: ${result.archivedNow}, Archived total: ${result.archived}, Active: ${result.active}`);
        res.json({
            success: true,
            archived: result.archived,
            active: result.active,
            archivedNow: result.archivedNow,
            archiveAfterDays: result.archiveAfterDays
        });
    });
});

// Get archive statistics
router.get('/archive/stats', async (req, res) => {
    try {
        const [archivedCount] = await db.pool.promise().query(`
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE archive_status = 'archived' AND is_active = 1
        `);

        const [oldestArchived] = await db.pool.promise().query(`
            SELECT MIN(created_at) as oldest_date 
            FROM feedback 
            WHERE archive_status = 'archived' AND is_active = 1
        `);

        res.json({
            success: true,
            total_archived: archivedCount[0].count,
            oldest_date: oldestArchived[0].oldest_date
        });
    } catch (error) {
        console.error('Error fetching archive stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch archive statistics'
        });
    }
});

// Bulk Decrypt Archive Emails
router.post('/bulk-decrypt-archive', async (req, res) => {
    try {
        const { username, password, emails } = req.body;
        
        if (!username || !password || !emails) {
            return res.json({ success: false, message: 'Missing required fields' });
        }
        
        // Verify admin password
        const [adminUsers] = await db.query(
            'SELECT * FROM admin_users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (adminUsers.length === 0) {
            // Log failed attempt
            await db.query(
                'INSERT INTO audit_logs (action, admin_username, target_type, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                ['ARCHIVE_BULK_DECRYPT_FAILED', username, 'archive_emails', req.ip, req.get('user-agent')]
            );
            
            return res.json({ success: false, message: 'User not found' });
        }
        
        const user = adminUsers[0];
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordMatch) {
            // Log failed attempt
            await db.query(
                'INSERT INTO audit_logs (action, admin_username, target_type, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                ['ARCHIVE_BULK_DECRYPT_FAILED', username, 'archive_emails', req.ip, req.get('user-agent')]
            );
            
            return res.json({ success: false, message: 'Invalid password' });
        }
        
        // Decrypt emails
        const decryptedEmails = {};
        
        for (const item of emails) {
            if (item.email_encrypted && item.email_encrypted.includes(':')) {
                try {
                    const decrypted = auth.decryptEmail(item.email_encrypted);
                    if (decrypted) {
                        decryptedEmails[item.id] = decrypted;
                    }
                } catch (error) {
                    console.error(`Error decrypting email for ID ${item.id}:`, error);
                }
            }
        }
        
        // Log successful decryption
        await db.query(
            'INSERT INTO audit_logs (action, admin_username, target_type, target_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
            ['ARCHIVE_BULK_DECRYPT', username, 'archive_emails', Object.keys(decryptedEmails).length, req.ip, req.get('user-agent')]
        );
        
        res.json({
            success: true,
            decryptedEmails: decryptedEmails
        });
        
    } catch (error) {
        console.error('Error in bulk decrypt archive:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during decryption'
        });
    }
});

// Download Archive Photos (ZIP)
router.post('/download-archive-photos', async (req, res) => {
    try {
        const { username, feedbackIds } = req.body;
        
        if (!username || !feedbackIds || !Array.isArray(feedbackIds)) {
            return res.json({ success: false, message: 'Missing required fields' });
        }
        
        // Get photos for archived feedback
        const placeholders = feedbackIds.map(() => '?').join(',');
        const [feedbackData] = await db.query(
            `SELECT id, photo_path, processed_photo_path 
             FROM feedback 
             WHERE id IN (${placeholders}) AND archive_status = 'archived'`,
            feedbackIds
        );
        
        if (feedbackData.length === 0) {
            return res.json({ success: false, message: 'No photos found in archived feedback' });
        }
        
        // Collect all photo paths
        const photoPaths = [];
        for (const item of feedbackData) {
            if (item.photo_path) {
                photoPaths.push({
                    id: item.id,
                    type: 'raw',
                    path: path.join(paths.UPLOADS, item.photo_path)
                });
            }
            if (item.processed_photo_path) {
                photoPaths.push({
                    id: item.id,
                    type: 'processed',
                    path: path.join(paths.UPLOADS, item.processed_photo_path)
                });
            }
        }
        
        if (photoPaths.length === 0) {
            return res.json({ success: false, message: 'No photo files found' });
        }
        
        // Create ZIP file
        const zipFilename = `archived_photos_${Date.now()}.zip`;
        const zipPath = path.join(paths.UPLOADS, 'temp', zipFilename);
        
        // Ensure temp directory exists
        const tempDir = path.join(paths.UPLOADS, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const output = fs.createWriteStream(zipPath);
        const archive = createZipArchive({ zlib: { level: 9 } });
        
        output.on('close', async () => {
            // Log the download
            await db.query(
                'INSERT INTO audit_logs (action, admin_username, target_type, target_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
                ['ARCHIVE_PHOTOS_DOWNLOAD', username, 'archive_photos', photoPaths.length, req.ip, req.get('user-agent')]
            );
            
            res.json({
                success: true,
                zipPath: zipFilename,
                photoCount: photoPaths.length
            });
        });
        
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).json({
                success: false,
                message: 'Error creating ZIP file'
            });
        });
        
        archive.pipe(output);
        
        // Add photos to archive
        for (const photo of photoPaths) {
            if (fs.existsSync(photo.path)) {
                const filename = `feedback_${photo.id}_${photo.type}_${path.basename(photo.path)}`;
                archive.file(photo.path, { name: filename });
            }
        }
        
        archive.finalize();
        
    } catch (error) {
        console.error('Error downloading archive photos:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Download file (for ZIP downloads)
router.get('/download-file/:filename', auth.requireAuth, async (req, res) => {
    try {
        const filename = path.basename(req.params.filename || '');
        const tempDir = path.join(paths.UPLOADS, 'temp');
        const filePath = path.join(tempDir, filename);
        if (!filename || !filePath.startsWith(tempDir + path.sep)) {
            return res.status(400).send('Invalid file name');
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
            }
            
            // Delete temp file after download
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }, 60000); // Delete after 1 minute
        });
        
    } catch (error) {
        console.error('Error in download-file:', error);
        res.status(500).send('Server error');
    }
});

// ==================== 9. ARCHIVE DELETION ROUTES (System Admin Only) ====================


// Preview deletion count before executing
// POST /api/admin/archive/preview-deletion
router.post('/archive/preview-deletion', auth.requireAuth, (req, res) => {
    const { feedbackIds, dateRange } = req.body;
    const userRole = req.session.user.role;
    
    // Only system_admin can delete
    if (userRole !== 'system_admin') {
        return res.status(403).json({
            success: false,
            error: 'Only System Administrators can delete archived data'
        });
    }
    
    let query;
    let params;
    
    if (feedbackIds && feedbackIds.length > 0) {
        // Preview for selected IDs
        const placeholders = feedbackIds.map(() => '?').join(',');
        query = `
            SELECT COUNT(*) as count
            FROM feedback
            WHERE id IN (${placeholders}) 
            AND archive_status = 'archived'
            AND is_active = 1
        `;
        params = feedbackIds;
    } else if (dateRange && dateRange.before) {
        // Preview for date range
        query = `
            SELECT COUNT(*) as count
            FROM feedback
            WHERE archive_status = 'archived'
            AND is_active = 1
            AND created_at < CONVERT_TZ(?, '+08:00', '+00:00')
        `;
        params = [dateRange.before];
    } else {
        return res.status(400).json({
            success: false,
            error: 'Either feedbackIds or dateRange must be provided'
        });
    }
    
    db.get(query, params, (err, result) => {
        if (err) {
            console.error('❌ Error previewing deletion:', err);
            return res.status(500).json({
                success: false,
                error: 'Database error: ' + err.message
            });
        }
        
        res.json({
            success: true,
            count: result.count
        });
    });
});


// Delete selected archived feedback (HARD DELETE)
// POST /api/admin/archive/delete-selected
router.post('/archive/delete-selected', auth.requireAuth, (req, res) => {
    const { feedbackIds, password } = req.body;
    const username = req.session.user.username;
    const userRole = req.session.user.role;
    
    // Only system_admin can delete
    if (userRole !== 'system_admin') {
        return res.status(403).json({
            success: false,
            error: 'Only System Administrators can delete archived data'
        });
    }
    
    // Validate inputs
    if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No feedback IDs provided'
        });
    }
    
    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password verification required'
        });
    }
    
    // Verify admin password
    auth.loginUser(username, password, (authErr, user) => {
        if (authErr) {
            // Log failed attempt
            logAudit('DELETE_ARCHIVE_FAILED', username, 'archived_feedback', null, req);
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }
        
        // Get feedback data before deletion (for photo cleanup and logging)
        const placeholders = feedbackIds.map(() => '?').join(',');
        const selectQuery = `
            SELECT f.id, f.user_id, f.photo_path, f.processed_photo_path, u.name, f.created_at
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.id IN (${placeholders})
            AND f.archive_status = 'archived'
            AND f.is_active = 1
        `;
        
        db.all(selectQuery, feedbackIds, (selectErr, feedbackData) => {
            if (selectErr) {
                console.error('❌ Error fetching feedback for deletion:', selectErr);
                return res.status(500).json({
                    success: false,
                    error: 'Database error: ' + selectErr.message
                });
            }
            
            if (feedbackData.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No archived feedback found with the provided IDs'
                });
            }
            
            // Delete photos from filesystem
            feedbackData.forEach(feedback => {
                if (feedback.photo_path) {
                    const photoPath = path.join(paths.UPLOADS, feedback.photo_path);
                    if (fs.existsSync(photoPath)) {
                        try {
                            fs.unlinkSync(photoPath);
                            console.debug(`🗑️ Deleted photo: ${feedback.photo_path}`);
                        } catch (err) {
                            console.error(`❌ Error deleting photo ${feedback.photo_path}:`, err);
                        }
                    }
                }
                
                if (feedback.processed_photo_path) {
                    const processedPath = path.join(paths.UPLOADS, feedback.processed_photo_path);
                    if (fs.existsSync(processedPath)) {
                        try {
                            fs.unlinkSync(processedPath);
                            console.debug(`🗑️ Deleted processed photo: ${feedback.processed_photo_path}`);
                        } catch (err) {
                            console.error(`❌ Error deleting processed photo ${feedback.processed_photo_path}:`, err);
                        }
                    }
                }
            });
            
            // Hard delete feedback (CASCADE will delete feedback_answers)
            const deleteQuery = `
                DELETE FROM feedback
                WHERE id IN (${placeholders})
                AND archive_status = 'archived'
            `;
            
            db.run(deleteQuery, feedbackIds, function(deleteErr) {
                if (deleteErr) {
                    console.error('❌ Error deleting feedback:', deleteErr);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error: ' + deleteErr.message
                    });
                }
                
                const deletedCount = this.changes;
                
                // Check for orphaned users and delete them
                const userIds = [...new Set(feedbackData.map(f => f.user_id))];
                const checkOrphanQuery = `
                    SELECT id FROM users
                    WHERE id IN (${userIds.map(() => '?').join(',')})
                    AND NOT EXISTS (
                        SELECT 1 FROM feedback WHERE user_id = users.id AND is_active = 1
                    )
                `;
                
                db.all(checkOrphanQuery, userIds, (orphanErr, orphanUsers) => {
                    if (!orphanErr && orphanUsers && orphanUsers.length > 0) {
                        const orphanIds = orphanUsers.map(u => u.id);
                        const deleteUsersQuery = `DELETE FROM users WHERE id IN (${orphanIds.map(() => '?').join(',')})`;
                        
                        db.run(deleteUsersQuery, orphanIds, (userDeleteErr) => {
                            if (!userDeleteErr) {
                                console.debug(`🗑️ Deleted ${orphanIds.length} orphaned user(s)`);
                            }
                        });
                    }
                });
                
                // Log deletion
                logAudit('DELETE_ARCHIVE_SELECTED', username, 'archived_feedback', deletedCount, req);
                
                console.log(`✅ Successfully deleted ${deletedCount} archived feedback entries`);
                res.json({
                    success: true,
                    deletedCount: deletedCount,
                    message: `Successfully deleted ${deletedCount} archived feedback ${deletedCount === 1 ? 'entry' : 'entries'}`
                });
            });
        });
    });
});

// Delete archived feedback by date range (HARD DELETE)
// POST /api/admin/archive/delete-by-date
router.post('/archive/delete-by-date', auth.requireAuth, (req, res) => {
    const { beforeDate, password } = req.body;
    const username = req.session.user.username;
    const userRole = req.session.user.role;
    
    // Only system_admin can delete
    if (userRole !== 'system_admin') {
        return res.status(403).json({
            success: false,
            error: 'Only System Administrators can delete archived data'
        });
    }
    
    // Validate inputs
    if (!beforeDate) {
        return res.status(400).json({
            success: false,
            error: 'Date parameter required'
        });
    }
    
    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password verification required'
        });
    }
    
    // Verify admin password
    auth.loginUser(username, password, (authErr, user) => {
        if (authErr) {
            // Log failed attempt
            logAudit('DELETE_ARCHIVE_BY_DATE_FAILED', username, 'archived_feedback', null, req);
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }
        
        // Get feedback data before deletion (for photo cleanup)
        const selectQuery = `
            SELECT f.id, f.user_id, f.photo_path, f.processed_photo_path, u.name, f.created_at
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.archive_status = 'archived'
            AND f.is_active = 1
            AND f.created_at < CONVERT_TZ(?, '+08:00', '+00:00')
        `;
        
        db.all(selectQuery, [beforeDate], (selectErr, feedbackData) => {
            if (selectErr) {
                console.error('❌ Error fetching feedback for deletion:', selectErr);
                return res.status(500).json({
                    success: false,
                    error: 'Database error: ' + selectErr.message
                });
            }
            
            if (feedbackData.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No archived feedback found before the specified date'
                });
            }
            
            // Delete photos from filesystem
            let photosDeleted = 0;
            feedbackData.forEach(feedback => {
                if (feedback.photo_path) {
                    const photoPath = path.join(paths.UPLOADS, feedback.photo_path);
                    if (fs.existsSync(photoPath)) {
                        try {
                            fs.unlinkSync(photoPath);
                            photosDeleted++;
                            console.debug(`🗑️ Deleted photo: ${feedback.photo_path}`);
                        } catch (err) {
                            console.error(`❌ Error deleting photo ${feedback.photo_path}:`, err);
                        }
                    }
                }
                
                if (feedback.processed_photo_path) {
                    const processedPath = path.join(paths.UPLOADS, feedback.processed_photo_path);
                    if (fs.existsSync(processedPath)) {
                        try {
                            fs.unlinkSync(processedPath);
                            photosDeleted++;
                            console.debug(`🗑️ Deleted processed photo: ${feedback.processed_photo_path}`);
                        } catch (err) {
                            console.error(`❌ Error deleting processed photo ${feedback.processed_photo_path}:`, err);
                        }
                    }
                }
            });
            
            // Hard delete feedback
            const deleteQuery = `
                DELETE FROM feedback
                WHERE archive_status = 'archived'
                AND created_at < CONVERT_TZ(?, '+08:00', '+00:00')
            `;
            
            db.run(deleteQuery, [beforeDate], function(deleteErr) {
                if (deleteErr) {
                    console.error('❌ Error deleting feedback:', deleteErr);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error: ' + deleteErr.message
                    });
                }
                
                const deletedCount = this.changes;
                
                // Check for orphaned users and delete them
                const userIds = [...new Set(feedbackData.map(f => f.user_id))];
                const checkOrphanQuery = `
                    SELECT id FROM users
                    WHERE id IN (${userIds.map(() => '?').join(',')})
                    AND NOT EXISTS (
                        SELECT 1 FROM feedback WHERE user_id = users.id AND is_active = 1
                    )
                `;
                
                db.all(checkOrphanQuery, userIds, (orphanErr, orphanUsers) => {
                    if (!orphanErr && orphanUsers && orphanUsers.length > 0) {
                        const orphanIds = orphanUsers.map(u => u.id);
                        const deleteUsersQuery = `DELETE FROM users WHERE id IN (${orphanIds.map(() => '?').join(',')})`;
                        
                        db.run(deleteUsersQuery, orphanIds, (userDeleteErr) => {
                            if (!userDeleteErr) {
                                console.debug(`🗑️ Deleted ${orphanIds.length} orphaned user(s)`);
                            }
                        });
                    }
                });
                
                // Log deletion
                logAudit('DELETE_ARCHIVE_BY_DATE', username, 'archived_feedback', deletedCount, req);
                
                console.log(`✅ Successfully deleted ${deletedCount} archived feedback entries before ${beforeDate}`);
                console.log(`🗑️ Total photos deleted: ${photosDeleted}`);
                
                res.json({
                    success: true,
                    deletedCount: deletedCount,
                    photosDeleted: photosDeleted,
                    message: `Successfully deleted ${deletedCount} archived feedback ${deletedCount === 1 ? 'entry' : 'entries'}`
                });
            });
        });
    });
});

// ==================== 10. PHOTO ACCESS & EMAIL DECRYPTION ROUTES ====================

// Verify system admin password for photo access
router.post('/verify-photo-access', (req, res) => {
    const { password } = req.body;
    const username = 'systemadmin';
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    auth.loginUser(username, password, (err, user) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        res.json({ 
            success: true,
            message: 'Access granted'
        });
    });
});

// POST /decrypt-email - Decrypt email (System Admin only)
router.post('/decrypt-email', (req, res) => {
    const { feedbackId, password, username: bodyUsername } = req.body;
    
    // Get username from body OR header (frontend sends it in header as 'x-username')
    const username = bodyUsername || req.headers['x-username'];
    
    if (!feedbackId) {
        return res.status(400).json({ error: 'Feedback ID required' });
    }
    
    if (!username) {
        return res.status(400).json({ error: 'Username not found. Please login again.' });
    }
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    console.debug('🔍 Debug - Decrypt email request:', { feedbackId, username });
    
    // Verify the user's password first
    auth.loginUser(username, password, (err, user) => {
        if (err) {
            console.error('❌ Password verification failed:', err);
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        console.debug('👤 User authenticated, role:', user.role);
        
        // ONLY system_admin can decrypt emails
        if (user.role !== 'system_admin') {
            console.error('🚫 Non-admin user attempted to decrypt email:', username, '(', user.role, ')');
            logAudit('DECRYPT_EMAIL_DENIED', username, 'feedback', feedbackId, req);
            return res.status(403).json({ 
                success: false,
                error: 'Access Denied: Email decryption is only available to System Administrators.',
                role: user.role,
                hint: 'Only System Admins can decrypt emails.'
            });
        }
        
        console.debug('✅ User authorized as system admin');
        
        // Get the encrypted email from database
        const query = `
            SELECT u.email_encrypted, u.id as user_id
            FROM feedback f 
            JOIN users u ON f.user_id = u.id 
            WHERE f.id = ?
        `;
        
    db.get(query, [feedbackId], (err, row) => {
            if (err) {
                console.error('❌ Error fetching encrypted email:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            console.debug('🔍 Database query result:', row ? 'Found' : 'Not found');
            
            if (!row) {
                return res.status(404).json({ error: 'Feedback entry not found' });
            }
            
            if (!row.email_encrypted) {
                return res.status(404).json({ 
                    error: 'No encrypted email found for this feedback',
                    hint: 'The user may not have provided an email address'
                });
            }
            
            // Verify email is actually encrypted (should contain colons for iv:authTag:data)
            if (!row.email_encrypted.includes(':')) {
                console.error('⚠️ Email appears to be plain text, not encrypted');
                return res.status(500).json({ 
                    error: 'Email is not properly encrypted',
                    hint: 'Database migration may be required'
                });
            }
            
            // Decrypt the email using AES-256-GCM
            try {
                const decryptedEmail = auth.decryptEmail(row.email_encrypted);
                
                // Log the decryption action for audit
                logAudit('VIEW_ENCRYPTED_EMAIL', username, 'feedback', feedbackId, req);
                
                console.debug('✅ Email decrypted successfully');
                
                res.json({
                    success: true,
                    decryptedEmail: decryptedEmail,
                    message: 'Email decrypted successfully'
                });
            } catch (decryptError) {
                console.error('❌ Email decryption failed:', decryptError);
                return res.status(500).json({ 
                    error: 'Failed to decrypt email',
                    details: 'The email may not be properly encrypted or the encryption key may be incorrect'
                });
            }
        });
    });
});

// ==================== 11. ADMIN USER MANAGEMENT ROUTES  ====================

// Get all ACTIVE admin users (excludes soft-deleted users)
router.get('/users', (req, res) => {
    console.debug('👥 Fetching active admin users...');
    
    // First check if admin_users table exists
    const tableCheckQuery = `SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'admin_users'`;
    
    db.get(tableCheckQuery, [], (err, table) => {
        if (err) {
            console.error('❌ Error checking admin_users table:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        if (!table) {
            console.log('❌ admin_users table does not exist');
            return res.status(404).json({
                success: false,
                error: 'Admin users table not found. Please run database setup.'
            });
        }
        
        // SOFT DELETE: Only get users where is_deleted = 0 (active users)
        const query = `
            SELECT 
                id,
                username,
                full_name,
                role,
                is_active,
                created_at,
                last_login
            FROM admin_users 
            WHERE is_deleted = 0
            ORDER BY created_at DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching admin users:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Database error: ' + err.message 
                });
            }
            
            console.debug(`✅ Found ${rows.length} active admin users`);
            
            // Ensure each user has required fields
            const users = rows.map(user => ({
                id: user.id,
                username: user.username || 'Unknown',
                full_name: user.full_name || user.username || 'Unknown',
                role: user.role || 'IT_staff',
                department: 'IT',
                is_active: user.is_active !== undefined ? user.is_active : 1,
                created_at: user.created_at,
                last_login: user.last_login
            }));
            
            res.json({
                success: true,
                users: users,
                count: users.length
            });
        });
    });
});

// Get all DELETED admin users (soft-deleted only)
router.get('/users/deleted', (req, res) => {
    console.debug('🗑️ Fetching deleted admin users...');
    
    // SOFT DELETE: Only get users where is_deleted = 1 (deleted users)
    const query = `
        SELECT 
            id,
            username,
            full_name,
            role,
            is_active,
            created_at,
            last_login,
            is_deleted,
            deleted_at,
            deleted_by
        FROM admin_users 
        WHERE is_deleted = 1
        ORDER BY deleted_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching deleted users:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        console.debug(`✅ Found ${rows.length} deleted users`);
        
        const users = rows.map(user => ({
            id: user.id,
            username: user.username || 'Unknown',
            full_name: user.full_name || user.username || 'Unknown',
            role: user.role || 'IT_staff',
            department: 'IT',
            is_active: user.is_active !== undefined ? user.is_active : 1,
            created_at: user.created_at,
            last_login: user.last_login,
            is_deleted: user.is_deleted,
            deleted_at: user.deleted_at,
            deleted_by: user.deleted_by
        }));
        
        res.json({
            success: true,
            users: users,
            count: users.length
        });
    });
});

// Add new admin user to save full_name
router.post('/users', async (req, res) => {
    const { username, full_name, role, password } = req.body;
    const currentUsername = req.headers['x-username'] || 'systemadmin';
    
    logAudit('ADD_USER', currentUsername, 'user', null, req);

    console.debug('➕ Adding new user:', { username, full_name, role, currentUsername });
    
    // First, check if current user is system admin
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_deleted = 0';
    
    db.get(checkUserQuery, [currentUsername], async (err, currentUser) => {
        if (err) {
            console.error('❌ Error checking current user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!currentUser || currentUser.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Validate input
        if (!username || !full_name || !password || !role) {
            return res.status(400).json({ error: 'Username, full name, password and role are required' });
        }
        
        const validRoles = ['system_admin', 'IT_admin', 'IT_staff'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Allowed roles: system_admin, IT_admin, IT_staff' });
        }
        
        // Check if username already exists (including soft-deleted users)
        const checkUsernameQuery = 'SELECT id, is_deleted FROM admin_users WHERE username = ?';
        
        db.get(checkUsernameQuery, [username], async (err, existingUser) => {
            if (err) {
                console.error('❌ Error checking username:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (existingUser) {
                if (existingUser.is_deleted === 1) {
                    return res.status(400).json({ error: 'Username exists in deleted users. Please permanently delete it first or restore it.' });
                } else {
                    return res.status(400).json({ error: 'Username already exists' });
                }
            }
            
            // Hash the password
            try {
                const hashedPassword = await auth.hashPassword(password);
                
                // Insert new user WITH full_name
                const insertQuery = `
                    INSERT INTO admin_users (username, full_name, password_hash, role, created_at, is_active, is_deleted)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0)
                `;
                
                db.run(insertQuery, [username, full_name, hashedPassword, role], function(err) {
                    if (err) {
                        console.error('❌ Error inserting user:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    console.debug(`✅ New user added with ID: ${this.lastID}`);
                    
                    // Get the newly created user
                    const getUserQuery = 'SELECT id, username, full_name, role, created_at, is_active FROM admin_users WHERE id = ?';
                    
                    db.get(getUserQuery, [this.lastID], (err, newUser) => {
                        if (err) {
                            console.error('❌ Error fetching new user:', err);
                            return res.json({
                                success: true,
                                message: 'User added successfully',
                                userId: this.lastID
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'User added successfully',
                            user: {
                                id: newUser.id,
                                username: newUser.username,
                                full_name: newUser.full_name,
                                role: newUser.role,
                                is_active: newUser.is_active,
                                created_at: newUser.created_at
                            }
                        });
                    });
                });
            } catch (hashErr) {
                console.error('❌ Error hashing password:', hashErr);
                return res.status(500).json({ error: 'Failed to hash password' });
            }
        });
    });
});

// Delete admin user - SOFT DELETE (mark as deleted but keep in database)
router.delete('/users/:id', (req, res) => {
    const { id } = req.params;
    const username = req.headers['x-username'] || 'systemadmin';
    
    logAudit('DELETE_USER', username, 'user', id, req);
    
    console.debug('🗑️ Attempting to SOFT DELETE user ID:', id, 'by:', username);
    
    // Check if current user is system admin
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_deleted = 0';
    
    db.get(checkUserQuery, [username], (err, currentUser) => {
        if (err) {
            console.error('❌ Error checking current user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!currentUser || currentUser.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Get target user info
        const getTargetUserQuery = 'SELECT * FROM admin_users WHERE id = ?';
        
        db.get(getTargetUserQuery, [id], (err, targetUser) => {
            if (err) {
                console.error('❌ Error fetching target user:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!targetUser) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Check if trying to delete yourself
            if (targetUser.username === username) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }
            
            // Prevent deleting the root 'systemadmin' account
            if (targetUser.username === 'systemadmin') {
                return res.status(403).json({ error: 'Cannot delete the root systemadmin account' });
            }
            
            // SOFT DELETE - Update is_deleted flag instead of removing from database
            const deleteQuery = 'UPDATE admin_users SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ?';
            
            db.run(deleteQuery, [username, id], function(err) {
                if (err) {
                    console.error('❌ Error soft-deleting user:', err);
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                
                console.debug('✅ User SOFT DELETED (marked as deleted):', { 
                    changes: this.changes,
                    id,
                    username: targetUser.username 
                });
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found or already deleted' });
                }
                
                res.json({ 
                    success: true, 
                    message: 'User moved to deleted users (can be restored)',
                    deletedUser: {
                        id: targetUser.id,
                        username: targetUser.username,
                        role: targetUser.role
                    },
                    changes: this.changes 
                });
            });
        });
    });
});

// Restore deleted admin user (undo soft delete)
router.post('/users/:id/restore', (req, res) => {
    const { id } = req.params;
    const username = req.headers['x-username'] || 'systemadmin';
    
    logAudit('RESTORE_USER', username, 'user', id, req);
    
    console.debug('🔄 Attempting to RESTORE user ID:', id, 'by:', username);
    
    // Check if current user is system admin
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_deleted = 0';
    
    db.get(checkUserQuery, [username], (err, currentUser) => {
        if (err) {
            console.error('❌ Error checking current user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!currentUser || currentUser.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Restore the user (clear soft delete flags)
        const restoreQuery = 'UPDATE admin_users SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ?';
        
        db.run(restoreQuery, [id], function(err) {
            if (err) {
                console.error('❌ Error restoring user:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found or already restored' });
            }
            
            console.debug('✅ User RESTORED successfully:', { 
                userId: id,
                restoredBy: username,
                changes: this.changes 
            });
            
            res.json({ 
                success: true, 
                message: 'User restored successfully',
                changes: this.changes
            });
        });
    });
});

// Permanently delete a user (hard delete - only for soft-deleted users)
router.delete('/users/:id/permanent', (req, res) => {
    const { id } = req.params;
    const username = req.headers['x-username'] || 'systemadmin';
    
    logAudit('PERMANENT_DELETE_USER', username, 'user', id, req);
    
    console.debug('🗑️ Attempting to PERMANENTLY DELETE user ID:', id, 'by:', username);
    
    // Check if current user is system admin
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_deleted = 0';
    
    db.get(checkUserQuery, [username], (err, currentUser) => {
        if (err) {
            console.error('❌ Error checking current user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!currentUser || currentUser.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Check if user is already soft-deleted
        const checkDeletedQuery = 'SELECT * FROM admin_users WHERE id = ? AND is_deleted = 1';
        
        db.get(checkDeletedQuery, [id], (err, deletedUser) => {
            if (err) {
                console.error('❌ Error checking deleted user:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!deletedUser) {
                return res.status(400).json({ error: 'User must be soft-deleted first before permanent deletion' });
            }
            
            // Prevent deleting root account
            if (deletedUser.username === 'systemadmin') {
                return res.status(403).json({ error: 'Cannot permanently delete the root systemadmin account' });
            }
            
            // Permanently delete the user from database
            const permanentDeleteQuery = 'DELETE FROM admin_users WHERE id = ? AND is_deleted = 1';
            
            db.run(permanentDeleteQuery, [id], function(err) {
                if (err) {
                    console.error('❌ Error permanently deleting user:', err);
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found or not deleted' });
                }
                
                console.debug('✅ User PERMANENTLY DELETED:', { 
                    userId: id,
                    username: deletedUser.username,
                    deletedBy: username,
                    changes: this.changes 
                });
                
                res.json({ 
                    success: true, 
                    message: 'User permanently deleted from database',
                    username: deletedUser.username,
                    changes: this.changes
                });
            });
        });
    });
});





router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, full_name, role, password } = req.body;
    const currentUsername = req.headers['x-username'] || 'systemadmin';
    logAudit('EDIT_USER', username, 'user', id, req);
    
    console.debug('✏️ Updating admin user:', { id, username, full_name, role, currentUsername });
    
    // Check if current user is system admin
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_deleted = 0';
    
    db.get(checkUserQuery, [currentUsername], async (err, currentUser) => {
        if (err) {
            console.error('❌ Error checking current user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!currentUser || currentUser.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Get the target user
        const getTargetUserQuery = 'SELECT * FROM admin_users WHERE id = ?';
        
        db.get(getTargetUserQuery, [id], async (err, targetUser) => {
            if (err) {
                console.error('❌ Error fetching target user:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!targetUser) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            
            if (targetUser.username === 'systemadmin') {
                // Check if the current user IS the systemadmin
                if (currentUsername === 'systemadmin') {
                    console.debug('🔐 systemadmin is updating their own account');
                    
                    // systemadmin can ONLY update their own password and full_name
                    // They CANNOT change username or role
                    if (username !== 'systemadmin' || role !== 'system_admin') {
                        return res.status(403).json({ 
                            error: 'Root account username and role cannot be changed',
                            hint: 'You can only update your password and full name'
                        });
                    }
                    
                    // Allow password and full_name update only
                    await performSystemAdminSelfUpdate();
                } else {
                    // Other users (even system_admin role) cannot modify systemadmin
                    console.log('🚫 Another admin tried to modify systemadmin account');
                    return res.status(403).json({ 
                        error: 'The root systemadmin account can only be modified by itself',
                        hint: 'Log in as systemadmin to change this account'
                    });
                }
                return; // Exit early for systemadmin cases
            }
            
            // STANDARD USER UPDATE (non-systemadmin accounts)
            if (role && !['system_admin', 'IT_admin', 'IT_staff'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role. Allowed roles: system_admin, IT_admin, IT_staff' });
            }
            
            // Check if username already exists (for other users)
            if (username !== targetUser.username) {
                const checkUsernameQuery = 'SELECT id FROM admin_users WHERE username = ? AND id != ?';
                db.get(checkUsernameQuery, [username, id], async (err, existingUser) => {
                    if (err) {
                        console.error('❌ Error checking username:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    if (existingUser) {
                        return res.status(400).json({ error: 'Username already exists' });
                    }
                    
                    await performUserUpdate();
                });
            } else {
                await performUserUpdate();
            }
            
            // FUNCTION: Update systemadmin's own password and full_name
            async function performSystemAdminSelfUpdate() {
                let updateQuery = 'UPDATE admin_users SET ';
                const updateParams = [];
                const updateFields = [];
                
                // Always include full_name (even if null/empty)
                if (full_name !== undefined) {
                    updateFields.push('full_name = ?');
                    updateParams.push(full_name);
                }
                
                // Include password if provided
                if (password && password.trim() !== '') {
                    try {
                        const hashedPassword = await auth.hashPassword(password);
                        updateFields.push('password_hash = ?');
                        updateParams.push(hashedPassword);
                        console.debug('🔐 systemadmin password will be updated');
                    } catch (hashErr) {
                        console.error('❌ Error hashing password:', hashErr);
                        return res.status(500).json({ error: 'Failed to hash password' });
                    }
                }
                
                if (updateFields.length === 0) {
                    return res.status(400).json({ error: 'No fields to update' });
                }
                
                updateQuery += updateFields.join(', ') + ' WHERE id = ?';
                updateParams.push(id);
                
                console.debug('📝 Executing systemadmin self-update query');
                
                db.run(updateQuery, updateParams, function(err) {
                    if (err) {
                        console.error('❌ Error updating systemadmin account:', err);
                        return res.status(500).json({ error: 'Failed to update account: ' + err.message });
                    }
                    
                    console.debug('✅ systemadmin account updated successfully:', { changes: this.changes, id });
                    
                    // Get the updated user data
                    const getUpdatedUserQuery = 'SELECT * FROM admin_users WHERE id = ?';
                    db.get(getUpdatedUserQuery, [id], (err, updatedUser) => {
                        if (err) {
                            console.error('❌ Error fetching updated user:', err);
                            return res.json({
                                success: true,
                                message: 'Root account updated successfully',
                                changes: this.changes
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Root account updated successfully',
                            changes: this.changes,
                            updatedUser: {
                                id: updatedUser.id,
                                username: updatedUser.username,
                                full_name: updatedUser.full_name,
                                role: updatedUser.role
                            }
                        });
                    });
                });
            }
            
            // FUNCTION: Update standard (non-systemadmin) users
            async function performUserUpdate() {
                // Build update query based on provided fields
                let updateQuery = 'UPDATE admin_users SET ';
                const updateParams = [];
                const updateFields = [];
                
                if (username !== targetUser.username) {
                    updateFields.push('username = ?');
                    updateParams.push(username);
                }
                
                if (full_name !== undefined) {
                    updateFields.push('full_name = ?');
                    updateParams.push(full_name);
                }
                
                if (role !== undefined) {
                    updateFields.push('role = ?');
                    updateParams.push(role);
                }
                
                if (password && password.trim() !== '') {
                    try {
                        const hashedPassword = await auth.hashPassword(password);
                        updateFields.push('password_hash = ?');
                        updateParams.push(hashedPassword);
                    } catch (hashErr) {
                        console.error('❌ Error hashing password:', hashErr);
                        return res.status(500).json({ error: 'Failed to hash password' });
                    }
                }
                
                if (updateFields.length === 0) {
                    return res.status(400).json({ error: 'No fields to update' });
                }
                
                updateQuery += updateFields.join(', ') + ' WHERE id = ?';
                updateParams.push(id);
                
                db.run(updateQuery, updateParams, function(err) {
                    if (err) {
                        console.error('❌ Error updating user:', err);
                        return res.status(500).json({ error: 'Failed to update user: ' + err.message });
                    }
                    
                    console.debug('✅ User updated successfully:', { changes: this.changes, id });
                    
                    // Get the updated user data
                    const getUpdatedUserQuery = 'SELECT * FROM admin_users WHERE id = ?';
                    db.get(getUpdatedUserQuery, [id], (err, updatedUser) => {
                        if (err) {
                            console.error('❌ Error fetching updated user:', err);
                            return res.json({
                                success: true,
                                message: 'User updated successfully',
                                changes: this.changes
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'User updated successfully',
                            changes: this.changes,
                            updatedUser: {
                                id: updatedUser.id,
                                username: updatedUser.username,
                                full_name: updatedUser.full_name,
                                role: updatedUser.role
                            }
                        });
                    });
                });
            }
        });
    });
});

// ==================== 12. DATA EXPORT MANAGEMENT ROUTES ====================

// Unlock data export with password verification (System Admin only)
// POST /data-export/unlock lives in backend/features/archive/exportRoutes.js (mounted at /api/admin/data-export)

// Re-check the logged-in admin's password before a destructive action (feedback delete).
router.post('/verify-password', auth.requireAuth, (req, res) => {
    const password = req.body && req.body.password;
    const username = req.session.user.username;
    if (!password) return res.status(400).json({ success: false, error: 'Password required' });

    db.get('SELECT password_hash FROM admin_users WHERE username = ? AND is_active = 1', [username], async (err, row) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });
        if (!row) return res.status(403).json({ success: false, error: 'Account is not active' });
        const matches = await bcrypt.compare(password, row.password_hash).catch(() => false);
        if (!matches) {
            logAudit('PASSWORD_VERIFY_FAILED', username, null, null, req);
            return res.status(403).json({ success: false, error: 'Invalid password' });
        }
        res.json({ success: true });
    });
});

// ==================== 13. EXPORT/IMPORT ROUTES ====================

// Excel download endpoint with email decryption
router.get('/download-excel', (req, res) => {
    const { password } = req.query;
    const username = req.headers['x-username'] || 'systemadmin';
    logAudit('DOWNLOAD_EXCEL', username, null, null, req);
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    // Verify the user's password and role
    auth.loginUser(username, password, (err, user) => {
        if (err || user.role !== 'system_admin') {
            return res.status(401).json({ error: 'Invalid password or insufficient permissions' });
        }
        
        // Get all feedback data for Excel (excluding archived)
        const query = `
            SELECT 
                f.id,
                u.name,
                u.email_encrypted,
                u.visit_count as visits,
                f.comment as feedback,
                f.data_retention,
                f.photo_path,
                f.processed_photo_path,
                f.created_at as date,
                f.admin_notes
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.is_active = 1 AND f.archive_status = 'not_archived'
            ORDER BY f.created_at DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching data for Excel:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            console.debug(`📊 Processing ${rows.length} feedback records for Excel download...`);
            
            // Decrypt emails before converting to CSV
            const decryptedRows = rows.map(row => {
                let decryptedEmail = '';
                
                // Try to decrypt email if it exists
                if (row.email_encrypted) {
                    try {
                        decryptedEmail = auth.decryptEmail(row.email_encrypted);
                        console.debug(`✅ Decrypted email for user: ${row.name}`);
                    } catch (error) {
                        console.error(`❌ Failed to decrypt email for user ${row.name}:`, error.message);
                        decryptedEmail = '[Decryption Failed]';
                    }
                }
                
                // Return row with decrypted email
                return {
                    ...row,
                    email_encrypted: decryptedEmail,
                    email: decryptedEmail
                };
            });
            
            console.debug(`✅ Decrypted ${decryptedRows.filter(r => r.email).length} emails`);
            
            // Convert to CSV with decrypted emails
            const csvData = convertToCSV(decryptedRows.map(row => ({
                ID: row.id,
                Name: row.name || '',
                Email: row.email || '',
                Visits: row.visits || 0,
                Rating: row.rating || '',
                Feedback: row.feedback || '',
                'Data Retention (Days)': row.data_retention || 'Forever',
                'Photo Path': row.photo_path || '',
                'Processed Photo Path': row.processed_photo_path || '',
                Date: row.date,
                'Admin Notes': row.admin_notes || ''
            })));
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=feedback_data.csv');
            res.send(csvData);
            
            console.log(`✅ Excel download complete: ${decryptedRows.length} records sent`);
        });
    });
});

// Archive Excel download endpoint with email decryption
router.get('/download-archive-excel', (req, res) => {
    const { password } = req.query;
    const username = req.headers['x-username'] || 'systemadmin';
    logAudit('DOWNLOAD_ARCHIVE_EXCEL', username, null, null, req);
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    // Verify the user's password and role
    auth.loginUser(username, password, (err, user) => {
        if (err || user.role !== 'system_admin') {
            return res.status(401).json({ error: 'Invalid password or insufficient permissions' });
        }
        
        // Get all archived feedback data
        const query = `
            SELECT 
                f.id,
                u.name,
                u.email_encrypted,
                u.visit_count as visits,
                f.comment as feedback,
                f.data_retention,
                f.photo_path,
                f.processed_photo_path,
                f.created_at as date,
                f.admin_notes,
                f.archive_status
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.is_active = 1 AND f.archive_status = 'archived'
            ORDER BY f.created_at DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching archived data for Excel:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            console.debug(`📊 Processing ${rows.length} archived feedback records for Excel download...`);
            
            // Decrypt emails before converting to CSV
            const decryptedRows = rows.map(row => {
                let decryptedEmail = '';
                
                // Try to decrypt email if it exists
                if (row.email_encrypted) {
                    try {
                        decryptedEmail = auth.decryptEmail(row.email_encrypted);
                        console.debug(`✅ Decrypted email for archived user: ${row.name}`);
                    } catch (error) {
                        console.error(`❌ Failed to decrypt email for user ${row.name}:`, error.message);
                        decryptedEmail = '[Decryption Failed]';
                    }
                }
                
                // Return row with decrypted email
                return {
                    ...row,
                    email_encrypted: decryptedEmail,
                    email: decryptedEmail
                };
            });
            
            console.debug(`✅ Decrypted ${decryptedRows.filter(r => r.email).length} emails from archive`);
            
            // Convert to CSV with decrypted emails
            const csvData = convertToCSV(decryptedRows.map(row => ({
                ID: row.id,
                Name: row.name || '',
                Email: row.email || '',
                Visits: row.visits || 0,
                Rating: row.rating || '',
                Feedback: row.feedback || '',
                'Data Retention (Days)': row.data_retention || 'Forever',
                'Photo Path': row.photo_path || '',
                'Processed Photo Path': row.processed_photo_path || '',
                Date: row.date,
                'Admin Notes': row.admin_notes || '',
                'Archive Status': row.archive_status || 'archived'
            })));
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=archived_feedback_data.csv');
            res.send(csvData);
            
            console.log(`✅ Archive Excel download complete: ${decryptedRows.length} records sent`);
        });
    });
});

// Update the download-photos endpoint in adminRoutes.js with correct path
router.get('/download-photos', async (req, res) => {
    const { password } = req.query;
    const username = req.headers['x-username'] || 'systemadmin';
    logAudit('DOWNLOAD_PHOTOS', username, null, null, req);
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    try {
        // Verify the user's password and role
        const verifyUser = await new Promise((resolve, reject) => {
            auth.loginUser(username, password, (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
        
        if (!verifyUser || verifyUser.role !== 'system_admin') {
            return res.status(401).json({ error: 'Invalid password or insufficient permissions' });
        }
        
        const uploadsPath = paths.UPLOADS;
        
        console.debug(`🔍 Looking for uploads at: ${uploadsPath}`);
        console.debug(`🔍 Backend directory: ${paths.BACKEND}`);
        console.debug(`🔍 Resolved absolute path: ${path.resolve(uploadsPath)}`);
        
        // Check if uploads directory exists
        if (!fs.existsSync(uploadsPath)) {
            console.error(`❌ Uploads directory not found at: ${uploadsPath}`);
            
            // Debug: Check what's in the parent directory
            const parentDir = paths.ROOT;
            try {
                const files = fs.readdirSync(parentDir);
                console.debug(`📂 Files in parent directory (${parentDir}):`, files);
            } catch (e) {
                console.error('Error reading parent directory:', e);
            }
            
            return res.status(404).json({ 
                error: 'Uploads directory not found. Please check server logs for details.' 
            });
        }
        
        // Check if uploads directory is empty
        const uploadsContent = fs.readdirSync(uploadsPath);
        console.debug(`📂 Content of uploads directory:`, uploadsContent);
        
        if (uploadsContent.length === 0) {
            console.debug('📂 uploads directory is empty');
            return res.status(404).json({ error: 'Uploads directory is empty' });
        }
        
        // Check each subdirectory for photos
        const hasPhotos = checkDirectoryForPhotos(uploadsPath);
        if (!hasPhotos) {
            console.debug('📂 No image files found in uploads directory');
            return res.status(404).json({ error: 'No photos found in uploads directory' });
        }
        
        console.debug(`📸 Creating ZIP of uploads directory: ${uploadsPath}`);
        
        // Create zip file of uploads directory
        const zipBuffer = await createUploadsZip(uploadsPath);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=uploads_backup_' + new Date().toISOString().split('T')[0] + '.zip');
        res.setHeader('Content-Length', zipBuffer.length);
        res.send(zipBuffer);
        
    } catch (error) {
        console.error('❌ Error downloading photos:', error);
        res.status(500).json({ error: 'Error creating zip file: ' + error.message });
    }
});

// ==================== 14. OVERLAY MANAGEMENT ROUTES ====================

// Overlay list route
router.get('/overlays', (req, res) => {
    console.debug('🎨 Fetching overlay data...');
    
    // First, check if the overlays table exists
    const tableCheckQuery = `
        SELECT TABLE_NAME AS name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'overlays'
    `;
    
    db.get(tableCheckQuery, [], (err, table) => {
        if (err) {
            console.error('❌ Error checking overlays table:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        if (!table) {
            console.log('❌ Overlays table does not exist');
            return res.json({
                success: true,
                overlays: [],
                message: 'Overlays table does not exist yet'
            });
        }
        
        // Table exists, now fetch the data
        const query = `
            SELECT 
                id,
                display_name,
                theme_id,
                desktop_filename,
                mobile_filename,
                display_order,
                created_at
            FROM overlays 
            ORDER BY display_order ASC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching overlays:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Database error: ' + err.message 
                });
            }
            
            console.debug(`✅ Found ${rows.length} overlays`);
            
            res.json({
                success: true,
                overlays: rows
            });
        });
    });
});

// Overlay addition endpoint
router.post('/overlays', upload.fields([
    { name: 'desktop_file', maxCount: 1 },
    { name: 'mobile_file', maxCount: 1 }
]), handleOverlayUploadErrors, (req, res) => {
    const { display_name, theme_id } = req.body;
    const username = req.headers['x-username'] || 'systemadmin';

    logAudit('ADD_OVERLAY', username, 'overlay', null, req);
    
    console.debug('🎨 Adding new overlay:', { display_name, theme_id, username });
    
    // First, check if user exists and has system_admin role
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(checkUserQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error checking user:', err);
            // Clean up uploaded files
            if (req.files) {
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                });
            }
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!user || user.role !== 'system_admin') {
            // Clean up uploaded files if auth fails
            if (req.files) {
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                });
            }
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Check if files were uploaded
        if (!req.files || !req.files.desktop_file || !req.files.mobile_file) {
            // Clean up any partially uploaded files
            if (req.files) {
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                });
            }
            return res.status(400).json({ error: 'Both desktop and mobile overlay files are required' });
        }
        
        // Check if overlays table exists
        const tableCheckQuery = `SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'overlays'`;
        
        db.get(tableCheckQuery, [], (err, table) => {
            if (err) {
                console.error('❌ Error checking overlays table:', err);
                // Clean up files
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                });
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!table) {
                // Clean up files
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                });
                return res.status(400).json({ error: 'Overlays table does not exist. Please run database setup first.' });
            }
            
            // Check current overlay count
            const countQuery = 'SELECT COUNT(*) as count FROM overlays';
            
            db.get(countQuery, [], (err, result) => {
                if (err) {
                    console.error('❌ Error counting overlays:', err);
                    // Clean up files
                    Object.values(req.files).forEach(files => {
                        files.forEach(file => {
                            if (fs.existsSync(file.path)) {
                                fs.unlinkSync(file.path);
                            }
                        });
                    });
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                
                // Validate input
                if (!display_name || !theme_id) {
                    // Clean up files
                    Object.values(req.files).forEach(files => {
                        files.forEach(file => {
                            if (fs.existsSync(file.path)) {
                                fs.unlinkSync(file.path);
                            }
                        });
                    });
                    return res.status(400).json({ error: 'Display name and theme ID are required' });
                }
                
                // Validate theme_id format (lowercase letters and numbers only)
                if (!/^[a-z0-9]+$/.test(theme_id)) {
                    // Clean up files
                    Object.values(req.files).forEach(files => {
                        files.forEach(file => {
                            if (fs.existsSync(file.path)) {
                                fs.unlinkSync(file.path);
                            }
                        });
                    });
                    return res.status(400).json({ error: 'Theme ID must contain only lowercase letters and numbers, no spaces' });
                }
                
                // Check if theme_id already exists
                const checkThemeQuery = 'SELECT id FROM overlays WHERE theme_id = ?';
                
                db.get(checkThemeQuery, [theme_id], (err, existing) => {
                    if (err) {
                        console.error('❌ Error checking existing theme:', err);
                        // Clean up files
                        Object.values(req.files).forEach(files => {
                            files.forEach(file => {
                                if (fs.existsSync(file.path)) {
                                    fs.unlinkSync(file.path);
                                }
                            });
                        });
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    if (existing) {
                        // Clean up files
                        Object.values(req.files).forEach(files => {
                            files.forEach(file => {
                                if (fs.existsSync(file.path)) {
                                    fs.unlinkSync(file.path);
                                }
                            });
                        });
                        return res.status(400).json({ error: 'Theme ID already exists. Please choose a different one.' });
                    }
                    
                    // Generate filenames from the saved upload names so PNG and GIF overlays are both supported.
                    const desktop_filename = `/assets/overlays/DesktopOverlay/${req.files.desktop_file[0].filename}`;
                    const mobile_filename = `/assets/overlays/MobileOverlay/${req.files.mobile_file[0].filename}`;
                    
                    // Get next display order
                    const maxOrderQuery = 'SELECT MAX(display_order) as max_order FROM overlays';
                    
                    db.get(maxOrderQuery, [], (err, result) => {
                        if (err) {
                            console.error('❌ Error getting max display order:', err);
                            // Clean up files
                            Object.values(req.files).forEach(files => {
                                files.forEach(file => {
                                    if (fs.existsSync(file.path)) {
                                        fs.unlinkSync(file.path);
                                    }
                                });
                            });
                            return res.status(500).json({ error: 'Database error: ' + err.message });
                        }
                        
                        const display_order = (result.max_order || 0) + 1;
                        
                        // Insert new overlay
                        const insertQuery = `
                            INSERT INTO overlays (display_name, theme_id, desktop_filename, mobile_filename, display_order, created_at)
                            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        `;
                        
                        db.run(insertQuery, [display_name, theme_id, desktop_filename, mobile_filename, display_order], function(err) {
                            if (err) {
                                console.error('❌ Error inserting overlay:', err);
                                // Clean up files
                                Object.values(req.files).forEach(files => {
                                    files.forEach(file => {
                                        if (fs.existsSync(file.path)) {
                                            fs.unlinkSync(file.path);
                                        }
                                    });
                                });
                                return res.status(500).json({ error: 'Database error: ' + err.message });
                            }
                            
                            console.debug(`✅ New overlay added with ID: ${this.lastID}`);
                            
                            res.json({
                                success: true,
                                message: 'Overlay added successfully',
                                overlay: {
                                    id: this.lastID,
                                    display_name,
                                    theme_id,
                                    desktop_filename,
                                    mobile_filename,
                                    display_order
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

// Delete overlay endpoint
router.delete('/overlays/:id', (req, res) => {
    const { id } = req.params;
    const username = req.headers['x-username'] || 'systemadmin';
    logAudit('DELETE_OVERLAY', username, 'overlay', id, req);
    
    console.debug('🗑️ Attempting to delete overlay ID:', id);
    
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(checkUserQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error checking user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!user || user.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        const getOverlayQuery = 'SELECT * FROM overlays WHERE id = ?';
        
        db.get(getOverlayQuery, [id], (err, overlay) => {
            if (err) {
                console.error('❌ Error fetching overlay data:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            if (!overlay) {
                return res.status(404).json({ error: 'Overlay not found' });
            }
            
            console.debug('🔍 Overlay to delete:', overlay);
            
            const deleteQuery = 'DELETE FROM overlays WHERE id = ?';
            
            db.run(deleteQuery, [id], function(err) {
                if (err) {
                    console.error('❌ Error deleting overlay from database:', err);
                    return res.status(500).json({ error: 'Failed to delete overlay: ' + err.message });
                }
                
                console.debug('✅ Overlay deleted from database:', {
                    changes: this.changes,
                    id: id
                });
                
                deleteOverlayFiles(overlay, (fileError) => {
                    if (fileError) {
                        console.error('❌ Error deleting overlay files:', fileError);
                        return res.json({
                            success: true,
                            message: 'Overlay deleted from database but some files could not be removed',
                            fileError: fileError.message,
                            changes: this.changes
                        });
                    }
                    
                    console.debug('✅ Overlay files deleted successfully');
                    res.json({
                        success: true,
                        message: 'Overlay and associated files deleted successfully',
                        changes: this.changes
                    });
                });
            });
        });
    });
});

// ==================== 15. QUESTION MANAGEMENT ROUTES ====================

// Get all active questions with their options
router.get('/questions', (req, res) => {
    console.debug('❓ Fetching questions data...');
    
    // First check if questions table exists
    const tableCheckQuery = `SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'questions'`;
    
    db.get(tableCheckQuery, [], (err, table) => {
        if (err) {
            console.error('❌ Error checking questions table:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Database error: ' + err.message 
            });
        }
        
        if (!table) {
            console.log('❌ Questions table does not exist');
            return res.status(404).json({
                success: false,
                error: 'Questions table not found. Please run database setup.'
            });
        }
        
        // Get all active questions
        const questionsQuery = `
            SELECT 
                id,
                question_text,
                question_type,
                is_required,
                display_order,
                is_active,
                created_at
            FROM questions
            WHERE ${req.query.includeInactive === '1' ? '1 = 1' : 'is_active = 1'}
            ORDER BY display_order ASC, created_at ASC
        `;
        
        db.all(questionsQuery, [], (err, questions) => {
            if (err) {
                console.error('❌ Error fetching questions:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Database error: ' + err.message 
                });
            }
            
            console.debug(`✅ Found ${questions.length} questions`);
            
            if (questions.length === 0) {
                return res.json({
                    success: true,
                    questions: []
                });
            }
            
            // Use Map to preserve order during async processing
            const questionsMap = new Map();
            let processed = 0;
            
            questions.forEach((question, index) => {
                // Initialize ALL questions in order first
                questionsMap.set(index, {
                    ...question,
                    options: []
                });
                
                if (question.question_type === 'choice') {
                    // Get options for this question
                    const optionsQuery = `
                        SELECT 
                            id,
                            question_id,
                            option_label,
                            display_order
                        FROM question_options 
                        WHERE question_id = ?
                        ORDER BY display_order ASC
                    `;
                    
                    db.all(optionsQuery, [question.id], (err, options) => {
                        if (err) {
                            console.error('❌ Error fetching options for question:', question.id, err);
                            // Keep empty options array on error
                        } else {
                            // preserves original order
                            questionsMap.get(index).options = options;
                        }
                        
                        processed++;
                        
                        // Check if all async operations are complete
                        if (processed === questions.length) {
                            // Convert Map to Array while preserving order
                            const questionsWithOptions = Array.from(questionsMap.values());
                            res.json({
                                success: true,
                                questions: questionsWithOptions
                            });
                        }
                    });
                } else {
                    // Not a choice question, no options needed
                    // Already initialized with empty options array
                    processed++;
                    
                    // Check if all async operations are complete
                    if (processed === questions.length) {
                        // Convert Map to Array while preserving order
                        const questionsWithOptions = Array.from(questionsMap.values());
                        res.json({
                            success: true,
                            questions: questionsWithOptions
                        });
                    }
                }
            });
        });
    });
});

// Add new question
router.post('/questions', (req, res) => {
    const { question_text, question_type, display_order, is_required, is_active, options } = req.body;
    const username = req.headers['x-username'] || 'systemadmin';
    
    console.debug('➕ Adding new question:', { 
        question_text, 
        question_type, 
        display_order, 
        is_required, 
        is_active, 
        options_count: options ? options.length : 0,
        username 
    });
    
    // First, check if user exists and has system_admin role
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(checkUserQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error checking user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!user || user.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Validate input
        if (!question_text || !question_type) {
            return res.status(400).json({ error: 'Question text and type are required' });
        }
        
        // Validate question type
        const validTypes = ['text', 'yesno', 'rating', 'choice'];
        if (!validTypes.includes(question_type)) {
            return res.status(400).json({ error: 'Invalid question type. Valid types are: text, yesno, rating, choice' });
        }
        
        // Validate options for choice type
        if (question_type === 'choice') {
            if (!options || !Array.isArray(options) || options.length === 0) {
                return res.status(400).json({ error: 'Multiple choice questions require at least one option' });
            }
            
            // Validate each option
            for (const option of options) {
                if (!option.option_label || option.option_label.trim() === '') {
                    return res.status(400).json({ error: 'All options must have a label' });
                }
            }
        }
        
        // For non-choice questions, options should be empty or undefined
        if (question_type !== 'choice' && options && options.length > 0) {
            console.debug('⚠️ Warning: Options provided for non-choice question type, ignoring options');
        }
        
        // One connection, one real transaction: the question and its options land together or not at all
        db.withTransaction((tx, finish) => {
            const insertQuestionQuery = `
                INSERT INTO questions (question_text, question_type, is_required, display_order, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            tx.run(insertQuestionQuery, [
                question_text,
                question_type,
                is_required ? 1 : 0,
                display_order || 0,
                is_active ? 1 : 0
            ], function(err) {
                if (err) return finish(err);
                const questionId = this.lastID;
                const optionRows = question_type === 'choice' && Array.isArray(options) ? options : [];
                let index = 0;
                const insertNext = () => {
                    if (index >= optionRows.length) return finish(null, questionId);
                    const option = optionRows[index];
                    const position = index;
                    index++;
                    tx.run('INSERT INTO question_options (question_id, option_label, display_order) VALUES (?, ?, ?)',
                        [questionId, option.option_label, option.display_order || position],
                        (optionErr) => (optionErr ? finish(optionErr) : insertNext()));
                };
                insertNext();
            });
        }, (err, questionId) => {
            if (err) {
                console.error('❌ Error adding question:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            console.debug(`✅ Question added with ID: ${questionId}`);
            res.json({
                success: true,
                message: 'Question added successfully',
                questionId: questionId
            });
        });
    });
});

// Delete question with soft-delete logic when answers exist
router.delete('/questions/:id', (req, res) => {
    const { id } = req.params;
    const username = req.headers['x-username'] || 'systemadmin';

    logAudit('DELETE_QUESTION', username, 'question', id, req);
    
    console.debug('🗑️ Attempting to delete question ID:', id);
    
    // First, check if user exists and has system_admin role
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(checkUserQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error checking user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!user || user.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Check if question has existing answers
        const checkAnswersQuery = 'SELECT COUNT(*) as answer_count FROM feedback_answers WHERE question_id = ?';
        
        db.get(checkAnswersQuery, [id], (err, result) => {
            if (err) {
                console.error('❌ Error checking question answers:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            const hasAnswers = result && result.answer_count > 0;
            
            if (hasAnswers) {
                // Soft delete keep question for historical data
                const softDeleteQuery = 'UPDATE questions SET is_active = 0 WHERE id = ?';
                
                db.run(softDeleteQuery, [id], function(err) {
                    if (err) {
                        console.error('❌ Error soft-deleting question:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    console.debug(`✅ Question ID ${id} soft-deleted, historical answers preserved`);
                    
                    res.json({
                        success: true,
                        message: 'Question deactivated. Historical answers preserved.',
                        changes: this.changes
                    });
                });
            } else {
                // No answers safe to hard delete (question and options)
                db.withTransaction((tx, finish) => {
                    tx.run('DELETE FROM question_options WHERE question_id = ?', [id], (optionErr) => {
                        if (optionErr) return finish(optionErr);
                        tx.run('DELETE FROM questions WHERE id = ?', [id], function(questionErr) {
                            if (questionErr) return finish(questionErr);
                            finish(null, this.changes);
                        });
                    });
                }, (err, changes) => {
                    if (err) {
                        console.error('❌ Error deleting question:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    console.debug(`✅ Question completely deleted (no historical answers): ${id}`);
                    res.json({
                        success: true,
                        message: 'Question and associated options deleted successfully (no historical answers)',
                        changes: changes
                    });
                });
            }
        });
    });
});

router.put('/questions/:id', (req, res) => {
    const { id } = req.params;
    const { question_text, display_order, is_required, is_active } = req.body;
    const username = req.headers['x-username'] || 'systemadmin';
    
    console.debug('✏️ Safe editing question ID:', id);
    
    // First, check if user exists and has system_admin role
    const checkUserQuery = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1';
    
    db.get(checkUserQuery, [username], (err, user) => {
        if (err) {
            console.error('❌ Error checking user:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!user || user.role !== 'system_admin') {
            return res.status(403).json({ error: 'Insufficient permissions. System Admin required.' });
        }
        
        // Only allow safe fields to be updated
        const updateQuery = `
            UPDATE questions 
            SET question_text = ?, display_order = ?, is_required = ?, is_active = ?
            WHERE id = ?
        `;
        
        db.run(updateQuery, [
            question_text,
            display_order || 0,
            is_required ? 1 : 0,
            is_active ? 1 : 0,
            id
        ], function(err) {
            if (err) {
                console.error('❌ Error updating question:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            console.debug('✅ Question updated safely:', { changes: this.changes, id });
            
            res.json({
                success: true,
                message: 'Question updated successfully (safe edit)',
                changes: this.changes
            });
        });
    });
});

// ==================== 16. AUDIT LOGS ROUTES ====================

// Get audit logs
router.get('/audit-logs', (req, res) => {
    const { limit = 100, offset = 0 } = req.query;
    
    const query = `
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
    `;
    
    db.all(query, [parseInt(limit), parseInt(offset)], (err, logs) => {
        if (err) {
            console.error('❌ Error fetching audit logs:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Get total count
        db.get('SELECT COUNT(*) as total FROM audit_logs', [], (err, countResult) => {
            if (err) {
                return res.json({ success: true, logs: logs, total: logs.length });
            }
            
            res.json({
                success: true,
                logs: logs,
                total: countResult.total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// ==================== 17. HELPER FUNCTIONS ====================

// Helper function to delete user photos from filesystem
function deleteUserPhotos(feedback, callback) {
    const filesToDelete = [];
    
    // Add raw photo if exists
    if (feedback.photo_path) {
        // Handle both absolute and relative paths
        let photoFullPath;
        if (feedback.photo_path.startsWith('photos/')) {
            photoFullPath = path.join(paths.UPLOADS, feedback.photo_path);
        } else {
            photoFullPath = path.join(paths.UPLOADS, 'photos', path.basename(feedback.photo_path));
        }
        filesToDelete.push({
            path: photoFullPath,
            type: 'raw photo'
        });
    }
    
    // Add processed photo if exists
    if (feedback.processed_photo_path) {
        let processedFullPath;
        if (feedback.processed_photo_path.startsWith('processed/')) {
            processedFullPath = path.join(paths.UPLOADS, feedback.processed_photo_path);
        } else {
            processedFullPath = path.join(paths.UPLOADS, 'processed', path.basename(feedback.processed_photo_path));
        }
        filesToDelete.push({
            path: processedFullPath,
            type: 'processed photo'
        });
    }
    
    console.debug('🗑️ Files to delete:', filesToDelete.map(f => f.path));
    
    if (filesToDelete.length === 0) {
        console.debug('ℹ️ No photos to delete');
        return callback(null);
    }
    
    let deletedCount = 0;
    let errorOccurred = null;
    let processedCount = 0;
    
    filesToDelete.forEach(fileInfo => {
        if (fs.existsSync(fileInfo.path)) {
            try {
                fs.unlinkSync(fileInfo.path);
                console.debug(`✅ Deleted ${fileInfo.type}:`, fileInfo.path);
                deletedCount++;
            } catch (error) {
                console.error(`❌ Error deleting ${fileInfo.type}:`, fileInfo.path, error);
                errorOccurred = error;
            }
        } else {
            console.debug(`⚠️ ${fileInfo.type} not found, skipping:`, fileInfo.path);
        }
        
        processedCount++;
        
        // Call callback when all files are processed
        if (processedCount === filesToDelete.length) {
            console.debug(`🗑️ Photo deletion complete: ${deletedCount}/${filesToDelete.length} files deleted`);
            callback(errorOccurred);
        }
    });
}

// Helper function to delete overlay files
function deleteOverlayFiles(overlay, callback) {
    const filesToDelete = [];
    
    if (overlay.desktop_filename) {
        const desktopFilename = path.basename(overlay.desktop_filename);
        const desktopFullPath = path.join(paths.ASSETS, 'overlays', 'DesktopOverlay', desktopFilename);
        filesToDelete.push(desktopFullPath);
    }
    
    if (overlay.mobile_filename) {
        const mobileFilename = path.basename(overlay.mobile_filename);
        const mobileFullPath = path.join(paths.ASSETS, 'overlays', 'MobileOverlay', mobileFilename);
        filesToDelete.push(mobileFullPath);
    }
    
    console.debug('🗑️ Files to delete:', filesToDelete);
    
    let deletedCount = 0;
    let errorOccurred = null;
    
    if (filesToDelete.length === 0) {
        return callback(null);
    }
    
    filesToDelete.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.debug('✅ Deleted file:', filePath);
                deletedCount++;
            } catch (error) {
                console.error('❌ Error deleting file:', filePath, error);
                errorOccurred = error;
            }
        } else {
            console.debug('⚠️ File not found, skipping:', filePath);
        }
    });
    
    console.debug(`🗑️ Deleted ${deletedCount}/${filesToDelete.length} files`);
    callback(errorOccurred);
}

// Helper function to check if directory contains photos
function checkDirectoryForPhotos(dirPath) {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        
        console.debug(`🔍 Checking directory: ${dirPath}`);
        
        for (const item of items) {
            if (item.isDirectory()) {
                console.debug(`📂 Subdirectory found: ${item.name}`);
                // Recursively check subdirectories
                const subDirPath = path.join(dirPath, item.name);
                if (checkDirectoryForPhotos(subDirPath)) {
                    return true;
                }
            } else if (item.isFile()) {
                // Check if it's an image file
                const ext = path.extname(item.name).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
                    console.debug(`📸 Image file found: ${item.name} (${ext})`);
                    return true;
                } else {
                    console.debug(`📄 Other file found: ${item.name} (${ext})`);
                }
            }
        }
        
        console.debug(`📊 No image files found in ${dirPath}`);
        return false;
        
    } catch (error) {
        console.error('❌ Error checking directory:', error);
        return false;
    }
}

// Helper function to create zip of uploads directory
async function createUploadsZip(uploadsPath) {
    const { PassThrough } = require('stream');
    
    return new Promise((resolve, reject) => {
        console.debug(`🗜️ Starting ZIP creation for: ${uploadsPath}`);
        
        // Create a buffer stream to collect the zip data
        const chunks = [];
        const archive = createZipArchive({ zlib: { level: 9 } }); // maximum compression
        
        const bufferStream = new PassThrough();
        
        // Track files added
        let filesAdded = 0;
        
        bufferStream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        bufferStream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            console.log(`✅ ZIP created: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB, ${filesAdded} files added`);
            resolve(buffer);
        });
        
        bufferStream.on('error', (err) => {
            console.error('❌ Buffer stream error:', err);
            reject(err);
        });
        
        // Pipe archive to buffer stream
        archive.pipe(bufferStream);
        
        // Handle archive events
        archive.on('entry', (entry) => {
            filesAdded++;
            console.debug(`📄 Adding to ZIP: ${entry.name} (${entry.stats ? (entry.stats.size / 1024).toFixed(2) + ' KB' : 'size unknown'})`);
        });
        
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.log('⚠️ Archive warning (file not found):', err.message);
            } else {
                console.log('⚠️ Archive warning:', err);
            }
        });
        
        archive.on('error', (err) => {
            console.error('❌ Archive error:', err);
            reject(err);
        });
        
        archive.on('progress', (progress) => {
            console.debug(`📦 ZIP progress: ${progress.entries.processed} entries processed`);
        });
        
        try {
            console.debug(`🗜️ Adding directory to archive: ${uploadsPath}`);
            archive.directory(uploadsPath, false); // false = preserve relative paths
            
            // Add a readme file with information
            const readmeContent = `Uploads Backup
Generated: ${new Date().toISOString()}
Source Directory: ${uploadsPath}

Directory Structure:
- uploads/photos/         - User selfies from feedback
- uploads/processed/      - Photos with overlays applied

Backup includes all files in the uploads directory.`;
            
            archive.append(readmeContent, { name: 'README.txt' });
            console.debug('📄 Added README.txt to archive');
            
            // Finalize the archive
            archive.finalize();
            console.debug('✅ Archive finalized');
            
        } catch (error) {
            console.error('❌ Error adding directory to archive:', error);
            reject(error);
        }
    });
}

// Helper function to convert data to CSV
function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
        Object.values(row).map(field => 
            `"${String(field || '').replace(/"/g, '""')}"`
        ).join(',')
    );
    
    return [headers, ...rows].join('\n');
}

// ==================== 18. SAVED THEMES ROUTES ====================


// GET /api/admin/saved-themes
// Get all saved themes for the current logged-in user
router.get('/saved-themes', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    
    const query = `
        SELECT 
            id,
            theme_name,
            theme_data,
            is_active,
            created_at,
            updated_at
        FROM saved_themes
        WHERE admin_user_id = ?
        ORDER BY is_active DESC, created_at DESC
    `;
    
    db.all(query, [adminUserId], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching saved themes:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to load saved themes' 
            });
        }
        
        // Parse JSON theme_data for each theme
        const themes = rows.map(row => ({
            ...row,
            theme_data: typeof row.theme_data === 'string' 
                ? JSON.parse(row.theme_data) 
                : row.theme_data
        }));
        
        console.debug(`✅ Loaded ${themes.length} saved themes for user ${adminUserId}`);
        res.json({ success: true, themes });
    });
});


// POST /api/admin/saved-themes
// Save a new theme for the current user
// Limit: 6 themes per user

router.post('/saved-themes', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    const { theme_name, theme_data, is_active } = req.body;
    
    // Validate required fields
    if (!theme_name || !theme_data) {
        return res.status(400).json({ 
            success: false, 
            error: 'Theme name and theme data are required' 
        });
    }
    
    // Check current theme count for this user
    const countQuery = 'SELECT COUNT(*) as count FROM saved_themes WHERE admin_user_id = ?';
    
    db.get(countQuery, [adminUserId], (err, row) => {
        if (err) {
            console.error('❌ Error checking theme count:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to check theme count' 
            });
        }
        
        if (row.count >= 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Maximum of 6 saved themes reached. Please delete a theme before adding a new one.' 
            });
        }
        
        // If this theme should be active, deactivate all other themes for this user
        if (is_active) {
            const deactivateQuery = 'UPDATE saved_themes SET is_active = 0 WHERE admin_user_id = ?';
            db.run(deactivateQuery, [adminUserId], (deactivateErr) => {
                if (deactivateErr) {
                    console.error('❌ Error deactivating themes:', deactivateErr);
                }
            });
        }
        
        // Insert the new theme
        const insertQuery = `
            INSERT INTO saved_themes (admin_user_id, theme_name, theme_data, is_active)
            VALUES (?, ?, ?, ?)
        `;
        
        const themeDataJson = JSON.stringify(theme_data);
        
        db.run(insertQuery, [adminUserId, theme_name, themeDataJson, is_active ? 1 : 0], function(insertErr) {
            if (insertErr) {
                console.error('❌ Error saving theme:', insertErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to save theme' 
                });
            }
            
            console.debug(`✅ Theme "${theme_name}" saved successfully for user ${adminUserId}`);
            
            // Log audit trail
            logAudit('SAVE_THEME', req.session.user.username, 'saved_themes', this.lastID, req);
            
            res.json({ 
                success: true, 
                message: 'Theme saved successfully',
                theme_id: this.lastID
            });
        });
    });
});


// PUT /api/admin/saved-themes/:id/activate
// Set a saved theme as the active theme
router.put('/saved-themes/:id/activate', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    const themeId = req.params.id;
    
    // Verify the theme belongs to this user
    const verifyQuery = 'SELECT id FROM saved_themes WHERE id = ? AND admin_user_id = ?';
    
    db.get(verifyQuery, [themeId, adminUserId], (err, row) => {
        if (err) {
            console.error('❌ Error verifying theme ownership:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to verify theme' 
            });
        }
        
        if (!row) {
            return res.status(404).json({ 
                success: false, 
                error: 'Theme not found or access denied' 
            });
        }
        
        // Deactivate all themes for this user
        const deactivateQuery = 'UPDATE saved_themes SET is_active = 0 WHERE admin_user_id = ?';
        
        db.run(deactivateQuery, [adminUserId], (deactivateErr) => {
            if (deactivateErr) {
                console.error('❌ Error deactivating themes:', deactivateErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to deactivate themes' 
                });
            }
            
            // Activate the selected theme
            const activateQuery = 'UPDATE saved_themes SET is_active = 1 WHERE id = ?';
            
            db.run(activateQuery, [themeId], (activateErr) => {
                if (activateErr) {
                    console.error('❌ Error activating theme:', activateErr);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to activate theme' 
                    });
                }
                
                console.debug(`✅ Theme ${themeId} activated for user ${adminUserId}`);
                
                // Log audit trail
                logAudit('ACTIVATE_THEME', req.session.user.username, 'saved_themes', themeId, req);
                
                res.json({ 
                    success: true, 
                    message: 'Theme activated successfully' 
                });
            });
        });
    });
});


// POST /api/admin/saved-themes/deactivate-all
// Deactivate all themes for current user
router.post('/saved-themes/deactivate-all', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    
    const query = 'UPDATE saved_themes SET is_active = 0 WHERE admin_user_id = ?';
    
    db.run(query, [adminUserId], function(err) {
        if (err) {
            console.error('❌ Error deactivating themes:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to deactivate themes' 
            });
        }
        
        console.debug(`✅ Deactivated all themes for user ${adminUserId}`);
        
        // Log audit trail
        logAudit('DEACTIVATE_ALL_THEMES', req.session.user.username, 'saved_themes', null, req);
        
        res.json({ 
            success: true, 
            message: 'All themes deactivated',
            deactivated: this.changes
        });
    });
});


// PUT /api/admin/saved-themes/:id
// Update a saved theme (rename only)
router.put('/saved-themes/:id', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    const themeId = req.params.id;
    const { theme_name } = req.body;
    
    if (!theme_name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Theme name is required' 
        });
    }
    
    // Verify the theme belongs to this user
    const verifyQuery = 'SELECT id FROM saved_themes WHERE id = ? AND admin_user_id = ?';
    
    db.get(verifyQuery, [themeId, adminUserId], (err, row) => {
        if (err) {
            console.error('❌ Error verifying theme ownership:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to verify theme' 
            });
        }
        
        if (!row) {
            return res.status(404).json({ 
                success: false, 
                error: 'Theme not found or access denied' 
            });
        }
        
        // Update theme name
        const updateQuery = 'UPDATE saved_themes SET theme_name = ? WHERE id = ?';
        
        db.run(updateQuery, [theme_name, themeId], (updateErr) => {
            if (updateErr) {
                console.error('❌ Error updating theme:', updateErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to update theme' 
                });
            }
            
            console.debug(`✅ Theme ${themeId} renamed to "${theme_name}"`);
            
            // Log audit trail
            logAudit('UPDATE_THEME', req.session.user.username, 'saved_themes', themeId, req);
            
            res.json({ 
                success: true, 
                message: 'Theme updated successfully' 
            });
        });
    });
});

// DELETE /api/admin/saved-themes/:id
// Delete a saved theme
router.delete('/saved-themes/:id', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    const themeId = req.params.id;
    
    // Verify the theme belongs to this user
    const verifyQuery = 'SELECT id, theme_name FROM saved_themes WHERE id = ? AND admin_user_id = ?';
    
    db.get(verifyQuery, [themeId, adminUserId], (err, row) => {
        if (err) {
            console.error('❌ Error verifying theme ownership:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to verify theme' 
            });
        }
        
        if (!row) {
            return res.status(404).json({ 
                success: false, 
                error: 'Theme not found or access denied' 
            });
        }
        
        // Delete the theme
        const deleteQuery = 'DELETE FROM saved_themes WHERE id = ?';
        
        db.run(deleteQuery, [themeId], function(deleteErr) {
            if (deleteErr) {
                console.error('❌ Error deleting theme:', deleteErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to delete theme' 
                });
            }
            
            console.debug(`✅ Theme "${row.theme_name}" deleted successfully`);
            
            // Log audit trail
            logAudit('DELETE_THEME', req.session.user.username, 'saved_themes', themeId, req);
            
            res.json({ 
                success: true, 
                message: 'Theme deleted successfully' 
            });
        });
    });
});


// GET /api/admin/saved-themes/active
// Get the currently active theme for the logged-in user
router.get('/saved-themes/active', auth.requireAuth, (req, res) => {
    const adminUserId = req.session.user.id;
    
    const query = `
        SELECT 
            id,
            theme_name,
            theme_data,
            created_at,
            updated_at
        FROM saved_themes
        WHERE admin_user_id = ? AND is_active = 1
        LIMIT 1
    `;
    
    db.get(query, [adminUserId], (err, row) => {
        if (err) {
            console.error('❌ Error fetching active theme:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to load active theme' 
            });
        }
        
        if (!row) {
            return res.json({ 
                success: true, 
                theme: null,
                message: 'No active theme set'
            });
        }
        
        // Parse JSON theme_data
        const theme = {
            ...row,
            theme_data: typeof row.theme_data === 'string' 
                ? JSON.parse(row.theme_data) 
                : row.theme_data
        };
        
        console.debug(`✅ Active theme loaded for user ${adminUserId}`);
        res.json({ success: true, theme });
    });
});

// ==================== 19. VIP MANAGEMENT ROUTES (DONE BY ZAH) ====================

// Get VIP list (Active only)
// GET /vips
router.get('/vips', (req, res) => {
    console.debug('👑 Fetching VIP list...');

    // Check if vip_management table exists
    const tableCheckQuery = `
        SELECT TABLE_NAME AS name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'vip_management'
    `;

    db.get(tableCheckQuery, [], (err, table) => {
        if (err) {
            console.error('❌ Error checking vip_management table:', err);
            return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
        }

        if (!table) {
            console.log('❌ vip_management table does not exist');
            return res.status(404).json({ success: false, error: 'VIP table not found. Please run database setup.' });
        }

        const query = `
            SELECT id, name, created_at
            FROM vip_management
            ORDER BY created_at DESC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching VIPs:', err);
                return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
            }

            console.debug(`✅ Found ${rows.length} VIP records`);

            const vips = rows.map(vip => ({
                id: vip.id,
                name: vip.name || 'Unknown',
                createdAt: vip.created_at
            }));

            return res.json({ success: true, vips, count: vips.length });
        });
    });
});

// Add VIP
// POST /vips { name: "Zaheera" }
router.post('/vips', (req, res) => {
    console.debug('➕ Adding VIP...');

    const name = (req.body.name || '').trim();
    if (!name || name.length < 2) {
        return res.status(400).json({ success: false, error: 'VIP name is required' });
    }

    // With your table design, duplicates are already prevented by UNIQUE(name_lower)
    const insertQuery = `
        INSERT INTO vip_management (name)
        VALUES (?)
    `;

    db.run(insertQuery, [name], function (err) {
        if (err) {
            // Duplicate VIP (case-insensitive) -> MySQL duplicate key error
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, error: 'VIP already exists' });
            }

            console.error('❌ Error adding VIP:', err);
            return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
        }

        console.debug(`✅ VIP added with ID: ${this.lastID}`);

        return res.json({
            success: true,
            message: 'VIP added successfully',
            vip: {
                id: this.lastID,
                name,
                createdAt: new Date().toISOString()
            }
        });
    });
});

// Delete VIP (Done by Yu Kang)
router.delete('/vips/:name', (req, res) => {
    console.debug('🗑️ Deleting VIP...');

    const name = (req.params.name || '').trim();

    if (!name || name.length < 2) {
        return res.status(400).json({ success: false, error: 'Valid VIP name is required' });
    }

    const deleteQuery = `DELETE FROM vip_management WHERE name = ?`;

    db.run(deleteQuery, [name], function(err) {
        if (err) {
            console.error('❌ Error deleting VIP:', err);
            return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
        }

        // this.changes works in SQLite's db.run callback
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'VIP not found' });
        }

        console.debug(`✅ VIP deleted: ${name}`);
        return res.json({
            success: true,
            message: 'VIP deleted successfully',
            name: name
        });
    });
});


// ==================== 20. FORM UI CONFIGURATION ====================
// Read + write feedback form UI settings 

const FORM_UI_CONFIG_PATH = paths.dataFile('form-ui.json');

// GET /api/admin/form-ui
// Load current form UI configuration
router.get('/form-ui', auth.requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(FORM_UI_CONFIG_PATH)) {
      return res.json({
        background: '',
        landingTitle: '',
        landingSubtitle: '',
        showLandingPageQRCode: false
      });
    }

    const raw = fs.readFileSync(FORM_UI_CONFIG_PATH, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (error) {
    console.error('❌ Error reading form-ui.json:', error);
    res.status(500).json({ success: false, error: 'Failed to load form UI config' });
  }
});

// PUT /api/admin/form-ui
// Save/update form UI configuration
router.put('/form-ui', auth.requireAuth, (req, res) => {
  try {
    const { background, landingTitle, landingSubtitle, showLandingPageQRCode } = req.body;

    // Basic validation (keeps it safe + prevents weird payloads)
    if (typeof background !== 'string' || background.length > 300) {
      return res.status(400).json({ success: false, error: 'Invalid background value' });
    }
    if (typeof landingTitle !== 'string' || landingTitle.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid landing title' });
    }
    if (typeof landingSubtitle !== 'string' || landingSubtitle.length > 200) {
      return res.status(400).json({ success: false, error: 'Invalid landing subtitle' });
    }
    if (typeof showLandingPageQRCode !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid landing page QR toggle value' });
    }

    const payload = {
      background: background.trim(),
      landingTitle: landingTitle.trim(),
      landingSubtitle: landingSubtitle.trim(),
      showLandingPageQRCode
    };

    // Ensure config folder exists
    const dir = path.dirname(FORM_UI_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(FORM_UI_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');

    // Optional: audit log (uses your existing audit logger)
    if (req.session?.user?.username) {
      logAudit('FORM_UI_UPDATED', req.session.user.username, 'config', 'form-ui', req);
    }

    res.json({ success: true, message: 'Form UI settings saved' });
  } catch (error) {
    console.error('❌ Error writing form-ui.json:', error);
    res.status(500).json({ success: false, error: 'Failed to save form UI config' });
  }
});

// ==================== 20B. FEEDBACK ANALYSIS CACHE STORAGE ====================
// Admin control for where feedback analysis cache is persisted.

router.get('/feedback-analysis-cache-storage', auth.requireAdmin, async (req, res) => {
  try {
    await feedbackAnalysisCacheStore.ensureReady();

    res.json({
      success: true,
      storageMode: feedbackAnalysisCacheStore.getStorageMode()
    });
  } catch (error) {
    console.error('❌ Error loading feedback analysis cache storage mode:', error);
    res.status(500).json({ success: false, error: 'Failed to load cache storage mode' });
  }
});

router.put('/feedback-analysis-cache-storage', auth.requireAdmin, async (req, res) => {
  try {
    const storageMode = feedbackAnalysisCacheStore.normalizeStorageMode(req.body?.storageMode);
    const savedMode = feedbackAnalysisCacheStore.setStorageMode(storageMode);

    if (!savedMode) {
      return res.status(500).json({ success: false, error: 'Failed to save cache storage mode' });
    }

    await feedbackAnalysisCacheStore.reloadCache();

    res.json({
      success: true,
      message: 'Feedback analysis cache storage mode updated',
      storageMode: savedMode
    });
  } catch (error) {
    console.error('❌ Error updating feedback analysis cache storage mode:', error);
    res.status(500).json({ success: false, error: 'Failed to update cache storage mode' });
  }
});

// ==================== 21. PARAMETER ADJUSTMENT MANAGEMENT ====================
// System-wide parameter configuration, including feature toggles and centralized validation rules (DONE BY CAEDEN)
// Translation, archive timing, and auto-archive helpers added for admin controls. (Done by Caeden)

function normalizeContentSettings(contentSettings) {
  if (!contentSettings || typeof contentSettings !== 'object') {
    return contentSettings;
  }

  const normalized = { ...contentSettings };

  if (Object.prototype.hasOwnProperty.call(normalized, 'temporaryRetentionDays')) {
    const days = Number(normalized.temporaryRetentionDays);

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      const error = new Error('Temporary retention duration must be between 1 and 365 days');
      error.statusCode = 400;
      throw error;
    }

    normalized.temporaryRetentionDays = Math.round(days);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'pledgeExamples')) {
    if (!Array.isArray(normalized.pledgeExamples)) {
      const error = new Error('Pledge examples must be an array');
      error.statusCode = 400;
      throw error;
    }

    normalized.pledgeExamples = normalized.pledgeExamples
      .map(example => String(example || '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return normalized;
}

function normalizeArchiveSettings(archiveSettings) {
  if (!archiveSettings || typeof archiveSettings !== 'object') {
    return archiveSettings;
  }

  const normalized = { ...archiveSettings };

  if (Object.prototype.hasOwnProperty.call(normalized, 'autoArchiveEnabled')) {
    normalized.autoArchiveEnabled = normalized.autoArchiveEnabled === true;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'archiveAfterDays')) {
    const days = Number(normalized.archiveAfterDays);
    const allowedDays = [15, 30, 60, 90, 180, 365];

    if (!Number.isFinite(days) || !allowedDays.includes(days)) {
      const error = new Error('Archive timing must be 15, 30, 60, 90, 180, or 365 days');
      error.statusCode = 400;
      throw error;
    }

    normalized.archiveAfterDays = days;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'keepRecentFeedbackCount')) {
    const keepRecent = Number(normalized.keepRecentFeedbackCount);
    if (!Number.isFinite(keepRecent) || keepRecent < 0 || keepRecent > 100000) {
      const error = new Error('Feedback retention count must be between 0 and 100000');
      error.statusCode = 400;
      throw error;
    }
    normalized.keepRecentFeedbackCount = Math.floor(keepRecent);
  }

  return normalized;
}

function normalizeCampaignSettings(campaignSettings) {
  if (!campaignSettings || typeof campaignSettings !== 'object') {
    return campaignSettings;
  }

  const normalized = { ...campaignSettings };
  normalized.enabled = normalized.enabled === true;
  normalized.title = String(normalized.title || '').trim().slice(0, 80) || 'ESG Campaign';
  normalized.cadence = ['weekly', 'monthly'].includes(String(normalized.cadence)) ? normalized.cadence : 'weekly';
  normalized.treeSubtitle = String(normalized.treeSubtitle || '').trim().slice(0, 180);
  normalized.badgeEmphasis = String(normalized.badgeEmphasis || '').trim().slice(0, 80);

  const goal = Number(normalized.pulseGoal);
  normalized.pulseGoal = Number.isFinite(goal) ? Math.max(1, Math.min(10000, Math.round(goal))) : 100;

  normalized.focusKeywords = Array.isArray(normalized.focusKeywords)
    ? normalized.focusKeywords.map(keyword => String(keyword || '').trim()).filter(Boolean).slice(0, 10)
    : [];

  normalized.pledgeExamples = Array.isArray(normalized.pledgeExamples)
    ? normalized.pledgeExamples.map(example => String(example || '').trim()).filter(Boolean).slice(0, 3)
    : [];

  return normalized;
}

function normalizeTreeDisplayMode(treeParameters) {
    if (!treeParameters || typeof treeParameters !== 'object') {
        return treeParameters;
    }

    const normalized = { ...treeParameters };

    if (Object.prototype.hasOwnProperty.call(normalized, 'treeDisplayMode')) {
        const mode = String(normalized.treeDisplayMode || '').trim().toLowerCase();
        if (!['2d', '3d'].includes(mode)) {
            const error = new Error('Tree display mode must be either 2d or 3d');
            error.statusCode = 400;
            throw error;
        }
        normalized.treeDisplayMode = mode;
    }

    return normalized;
}

function normalizeFeedbackPageStyle(feedbackPageStyle) {
  if (!feedbackPageStyle || typeof feedbackPageStyle !== 'object') {
    return feedbackPageStyle;
  }

  const normalized = { ...feedbackPageStyle };

  if (Object.prototype.hasOwnProperty.call(normalized, 'backgroundCss')) {
    normalized.backgroundCss = String(normalized.backgroundCss || '').trim().slice(0, 500);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'cardOpacity')) {
    const opacity = Number(normalized.cardOpacity);
    if (!Number.isFinite(opacity) || opacity < 0.55 || opacity > 1) {
      const error = new Error('Feedback card opacity must be between 0.55 and 1');
      error.statusCode = 400;
      throw error;
    }
    normalized.cardOpacity = Number(opacity.toFixed(2));
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'accentColor')) {
    const color = String(normalized.accentColor || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      const error = new Error('Feedback accent colour must be a valid hex colour');
      error.statusCode = 400;
      throw error;
    }
    normalized.accentColor = color;
  }

  return normalized;
}

function normalizeBadgeLeafStyles(badgeLeafStyles) {
  if (!badgeLeafStyles || typeof badgeLeafStyles !== 'object') {
    return badgeLeafStyles;
  }

  const normalized = { ...badgeLeafStyles };

  if (Object.prototype.hasOwnProperty.call(normalized, 'leafScale')) {
    const scale = Number(normalized.leafScale);
    if (!Number.isFinite(scale) || scale < 0.4 || scale > 2) {
      const error = new Error('Badge leaf scale must be between 0.4 and 2');
      error.statusCode = 400;
      throw error;
    }
    normalized.leafScale = Number(scale.toFixed(2));
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'colors')) {
    if (!normalized.colors || typeof normalized.colors !== 'object' || Array.isArray(normalized.colors)) {
      const error = new Error('Badge leaf colours must be an object');
      error.statusCode = 400;
      throw error;
    }

    normalized.colors = Object.fromEntries(Object.entries(normalized.colors).map(([key, value]) => {
      const color = String(value || '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        const error = new Error(`Badge leaf colour for ${key} must be a valid hex colour`);
        error.statusCode = 400;
        throw error;
      }
      return [String(key), color];
    }));
}
  
if (Object.prototype.hasOwnProperty.call(normalized, 'tintDurationHours')) {
    const hours = Number(normalized.tintDurationHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
        const error = new Error('Badge tint duration must be between 0 and 168 hours (7 days)');
        error.statusCode = 400;
        throw error;
    }
    normalized.tintDurationHours = Number(hours.toFixed(1));
}

  return normalized;
}

function translateToEnglish(text, callback) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    callback(null, '');
    return;
  }

  const limitedText = cleanText.slice(0, 5000);
  const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(limitedText)}`;

  https.get(translateUrl, (translationRes) => {
    let body = '';

    translationRes.on('data', chunk => {
      body += chunk;
    });

    translationRes.on('end', () => {
      try {
        if (translationRes.statusCode < 200 || translationRes.statusCode >= 300) {
          throw new Error(`Translation service returned HTTP ${translationRes.statusCode}`);
        }

        const parsed = JSON.parse(body);
        const translatedText = Array.isArray(parsed?.[0])
          ? parsed[0].map(part => part?.[0] || '').join('')
          : '';

        callback(null, translatedText || limitedText);
      } catch (error) {
        callback(error);
      }
    });
  }).on('error', callback);
}

function runConfiguredArchive(callback) {
  const config = parametersConfigStore.readParametersConfig();
  const archiveSettings = normalizeArchiveSettings(config.archiveSettings || {}) || {};
  const archiveAfterDays = archiveSettings.archiveAfterDays || 90;
  const keepRecentFeedbackCount = Number(archiveSettings.keepRecentFeedbackCount || 0);

  const updateQuery = `
    UPDATE feedback
    SET archive_status = 'archived'
    WHERE is_active = 1
      AND archive_status = 'not_archived'
      AND created_at < DATE_SUB(NOW(), INTERVAL ${archiveAfterDays} DAY)
  `;

  db.run(updateQuery, [], function(updateErr) {
    if (updateErr) {
      callback(updateErr);
      return;
    }

    const archivedNow = this.changes || 0;

    if (keepRecentFeedbackCount > 0) {
      const countQuery = `
        SELECT id
        FROM feedback
        WHERE is_active = 1
          AND archive_status = 'not_archived'
        ORDER BY created_at ASC, id ASC
      `;

      db.all(countQuery, [], (countErr, rows) => {
        if (countErr) {
          callback(countErr);
          return;
        }

        const surplus = rows.length - keepRecentFeedbackCount;
        if (surplus <= 0) {
          return finalizeArchiveStats(archivedNow, archiveAfterDays, callback);
        }

        const idsToArchive = rows.slice(0, surplus).map(row => row.id);
        if (!idsToArchive.length) {
          return finalizeArchiveStats(archivedNow, archiveAfterDays, callback);
        }

        const placeholders = idsToArchive.map(() => '?').join(',');
        const countArchiveQuery = `UPDATE feedback SET archive_status = 'archived' WHERE id IN (${placeholders})`;
        db.run(countArchiveQuery, idsToArchive, function(countArchiveErr) {
          if (countArchiveErr) {
            callback(countArchiveErr);
            return;
          }

          finalizeArchiveStats(archivedNow + (this.changes || 0), archiveAfterDays, callback);
        });
      });
      return;
    }

    finalizeArchiveStats(archivedNow, archiveAfterDays, callback);
  });
}

function finalizeArchiveStats(archivedNow, archiveAfterDays, callback) {
  const archivedCountQuery = 'SELECT COUNT(*) as count FROM feedback WHERE archive_status = "archived" AND is_active = 1';
  const activeCountQuery = 'SELECT COUNT(*) as count FROM feedback WHERE archive_status = "not_archived" AND is_active = 1';

  db.get(archivedCountQuery, [], (archivedErr, archivedResult) => {
    if (archivedErr) {
      callback(archivedErr);
      return;
    }

    db.get(activeCountQuery, [], (activeErr, activeResult) => {
      if (activeErr) {
        callback(activeErr);
        return;
      }

      callback(null, {
        archiveAfterDays,
        archivedNow,
        archived: archivedResult.count,
        active: activeResult.count
      });
    });
  });
}

function runAutoArchiveIfEnabled() {
  const config = parametersConfigStore.readParametersConfig();
  const archiveSettings = config.archiveSettings || {};

  if (archiveSettings.autoArchiveEnabled !== true) {
    return;
  }

  runConfiguredArchive((error, result) => {
    if (error) {
      console.error('Auto archive failed:', error.message);
      return;
    }

    console.log(`Auto archive complete: ${result.archivedNow} moved after ${result.archiveAfterDays} days`);
  });
}

const autoArchiveTimer = setInterval(runAutoArchiveIfEnabled, 24 * 60 * 60 * 1000);
if (autoArchiveTimer.unref) {
  autoArchiveTimer.unref();
}

// GET /api/admin/parameters
// Load all system parameters
router.get('/parameters', auth.requireAuth, (req, res) => {
  try {
    const config = parametersConfigStore.readParametersConfig();
    res.json({ 
        success: true, 
        parameters: config
    });
  } catch (error) {
    console.error('❌ Error reading parameters:', error);
    res.status(500).json({ success: false, error: 'Failed to load parameters' });
  }
});

// POST /api/admin/translate
// Translate visitor-entered feedback text to English from the admin page (Done by Caeden)
router.post('/translate', auth.requireAuth, (req, res) => {
  const { text } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, error: 'Text is required for translation' });
  }

  translateToEnglish(text, (error, translatedText) => {
    if (error) {
      console.error('Translation failed:', error.message);
      return res.status(502).json({
        success: false,
        error: 'Translation service unavailable. Please check the server internet connection.'
      });
    }

    res.json({
      success: true,
      originalText: String(text),
      translatedText
    });
  });
});

router.post('/parameters/background', auth.requireAdmin, uploadParameterBackground.single('background'), handleTreeBackgroundUploadErrors, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No background file uploaded' });
    }

    const assetPath = `/assets/backgrounds/${req.file.filename}`;
    const backgroundCss = `url('${assetPath}') center / cover no-repeat fixed`;
    const config = parametersConfigStore.readParametersConfig();
    config.visualAssets = {
      ...config.visualAssets,
      feedbackBackground: backgroundCss
    };
    config.feedbackPageStyle = {
      ...config.feedbackPageStyle,
      backgroundCss
    };

    const success = parametersConfigStore.writeParametersConfig(config);
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to save uploaded background setting' });
    }

    if (req.session?.user?.username) {
      logAudit('PARAMETER_BACKGROUND_UPLOADED', req.session.user.username, 'config', 'feedbackPageStyle.backgroundCss', req);
    }

    res.json({
      success: true,
      message: 'Background uploaded successfully',
      assetPath,
      backgroundCss,
      parameters: parametersConfigStore.readParametersConfig()
    });
  } catch (error) {
    console.error('Error uploading parameter background:', error);
    res.status(500).json({ success: false, error: 'Failed to upload background' });
  }
});

// POST /api/admin/parameters/leaf - Upload a custom leaf image and activate it (Done by Yu Kang)
router.post('/parameters/leaf', auth.requireAdmin, uploadParameterLeaf.single('leaf'), handleTreeBackgroundUploadErrors, (req, res) => {
    try {
        console.debug('🍃 Leaf upload endpoint hit');
        console.debug('📦 Received file:', req.file);
        
        if (!req.file) {
            console.error('❌ No file received in request');
            return res.status(400).json({ success: false, error: 'No leaf file uploaded' });
        }

        const assetPath = `/assets/Tree/leaf/${req.file.filename}`;
        console.debug('✅ File saved to:', req.file.path);
        console.debug('🔗 Asset path:', assetPath);

        const config = parametersConfigStore.readParametersConfig();
        // Save current leaf image as previous before uploading new one
        if (config.visualAssets?.leafImage) {
            config.visualAssets.previousLeafImage = config.visualAssets.leafImage;
            console.debug('💾 Previous leaf image saved:', config.visualAssets.previousLeafImage);
        }
        config.visualAssets = { ...config.visualAssets, leafImage: assetPath };

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            console.error('❌ Failed to save parameters config');
            return res.status(500).json({ success: false, error: 'Failed to save leaf image setting' });
        }
        
        console.debug('💾 Parameters config saved successfully');

        if (req.session?.user?.username) {
            logAudit('PARAMETER_LEAF_UPLOADED', req.session.user.username, 'config', 'visualAssets.leafImage', req);
        }

        const finalConfig = parametersConfigStore.readParametersConfig();
        console.debug('✅ Leaf upload completed successfully');
        res.json({ success: true, message: 'Leaf image uploaded successfully', assetPath, parameters: finalConfig });
    } catch (error) {
        console.error('❌ Error uploading parameter leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload leaf image' });
    }
});

// POST /api/admin/parameters/leaf/revert - Revert to previous leaf image
router.post('/parameters/leaf/revert', auth.requireAdmin, (req, res) => {
    try {
        console.debug('🔄 Leaf revert endpoint hit');
        
        const config = parametersConfigStore.readParametersConfig();
        const assets = config.visualAssets || {};
        
        if (!assets.previousLeafImage) {
            console.debug('❌ No previous leaf image to revert to');
            return res.status(400).json({ success: false, error: 'No previous leaf image to revert to' });
        }
        
        // Swap current and previous
        const currentLeafImage = assets.leafImage;
        config.visualAssets.leafImage = assets.previousLeafImage;
        config.visualAssets.previousLeafImage = currentLeafImage;
        
        console.debug('🔄 Reverting leaf - current:', currentLeafImage, 'previous:', config.visualAssets.leafImage);
        
        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            console.error('❌ Failed to save parameters config');
            return res.status(500).json({ success: false, error: 'Failed to revert leaf image' });
        }
        
        console.debug('✅ Leaf reverted successfully');
        
        if (req.session?.user?.username) {
            logAudit('PARAMETER_LEAF_REVERTED', req.session.user.username, 'config', 'visualAssets.leafImage', req);
        }
        
        const finalConfig = parametersConfigStore.readParametersConfig();
        res.json({ success: true, message: 'Leaf image reverted successfully', parameters: finalConfig });
    } catch (error) {
        console.error('❌ Error reverting parameter leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to revert leaf image' });
    }
});

// GET /api/admin/parameters/leaf/list - List available leaf images (Done by Yu Kang)
router.get('/parameters/leaf/list', auth.requireAdmin, (req, res) => {
    try {
        console.debug('📂 Listing available leaf images');
        
        const leafDir = path.join(paths.ASSETS, 'Tree', 'leaf');
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        const leafImages = [];
        
        // Check if directory exists
        if (!fs.existsSync(leafDir)) {
            console.debug('📁 Leaf directory does not exist');
            return res.json({ success: true, leafImages: [] });
        }
        
        // Read directory
        const files = fs.readdirSync(leafDir);
        
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            if (imageExtensions.includes(ext)) {
                leafImages.push({
                    filename: file,
                    path: `/assets/Tree/leaf/${file}`,
                    name: path.parse(file).name // filename without extension
                });
            }
        });
        
        console.debug(`✅ Found ${leafImages.length} leaf images`);
        res.json({ success: true, leafImages });
    } catch (error) {
        console.error('❌ Error listing leaf images:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to list leaf images' });
    }
});

// POST /api/admin/parameters/leaf/select - Select an existing leaf image
router.post('/parameters/leaf/select', auth.requireAdmin, (req, res) => {
    try {
        console.debug('🍃 Leaf select endpoint hit');
        const { leafImage } = req.body;
        
        if (!leafImage) {
            console.error('❌ No leaf image path provided');
            return res.status(400).json({ success: false, error: 'Leaf image path is required' });
        }
        
        // Validate path to prevent directory traversal
        const leafDir = path.join(paths.ASSETS, 'Tree', 'leaf');
        const fullPath = path.join(leafDir, path.basename(leafImage));
        
        if (!fullPath.startsWith(leafDir)) {
            console.error('❌ Invalid leaf image path (directory traversal attempt)');
            return res.status(400).json({ success: false, error: 'Invalid leaf image path' });
        }
        
        // Verify file exists
        if (!fs.existsSync(fullPath)) {
            console.error('❌ Leaf image file does not exist:', fullPath);
            return res.status(400).json({ success: false, error: 'Leaf image file does not exist' });
        }
        
        console.debug('✅ Leaf image verified:', leafImage);
        const assetPath = `/assets/Tree/leaf/${path.basename(leafImage)}`;
        
        const config = parametersConfigStore.readParametersConfig();
        // Save current as previous before switching
        if (config.visualAssets?.leafImage) {
            config.visualAssets.previousLeafImage = config.visualAssets.leafImage;
            console.debug('💾 Previous leaf image saved:', config.visualAssets.previousLeafImage);
        }

        config.visualAssets = { ...config.visualAssets, leafImage: assetPath };
        
        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            console.error('❌ Failed to save parameters config');
            return res.status(500).json({ success: false, error: 'Failed to select leaf image' });
        }
        
        console.debug('✅ Leaf image selected successfully:', assetPath);
        
        if (req.session?.user?.username) {
            logAudit('PARAMETER_LEAF_SELECTED', req.session.user.username, 'config', 'visualAssets.leafImage', req);
        }
        
        const finalConfig = parametersConfigStore.readParametersConfig();
        res.json({ success: true, message: 'Leaf image selected successfully', parameters: finalConfig });
    } catch (error) {
        console.error('❌ Error selecting leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to select leaf image' });
    }
});

// GET /api/admin/parameters/tree-background/list - List available tree background images
router.get('/parameters/tree-background/list', auth.requireAdmin, (req, res) => {
    try {
        const backgroundDir = path.join(paths.ASSETS, 'Tree', 'background');
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        const backgroundImages = [];

        console.debug('📂 Looking for tree backgrounds in:', backgroundDir);

        if (!fs.existsSync(backgroundDir)) {
            console.warn('⚠️  Tree background directory does not exist:', backgroundDir);
            return res.json({ success: true, backgroundImages: [], currentTreeBackground: '' });
        }

        const files = fs.readdirSync(backgroundDir);
        console.debug('📄 Files found in background directory:', files);

        files.forEach((file) => {
            const ext = path.extname(file).toLowerCase();
            if (imageExtensions.includes(ext)) {
                backgroundImages.push({
                    filename: file,
                    path: `/assets/Tree/background/${file}`,
                    name: path.parse(file).name
                });
                console.debug(`✅ Added background: ${file}`);
            } else {
                console.debug(`⏭️  Skipped non-image file: ${file} (ext: ${ext})`);
            }
        });

        const config = parametersConfigStore.readParametersConfig();
        const currentTreeBackground = config?.visualAssets?.treeBackground || '';

        console.debug(`🖼️  Current tree background: ${currentTreeBackground}`);
        console.debug(`✨ Found ${backgroundImages.length} background images`);

        return res.json({ success: true, backgroundImages, currentTreeBackground });
    } catch (error) {
        console.error('❌ Error listing tree backgrounds:', error.message, error.stack);
        return res.status(500).json({ success: false, error: error.message || 'Failed to list tree backgrounds' });
    }
});

// POST /api/admin/parameters/tree-background/select - Select existing tree background image
router.post('/parameters/tree-background/select', auth.requireAdmin, (req, res) => {
    try {
        const { treeBackground } = req.body;
        if (!treeBackground) {
            return res.status(400).json({ success: false, error: 'Tree background is required' });
        }

        const backgroundDir = path.join(paths.ASSETS, 'Tree', 'background');
        const safeFilename = path.basename(treeBackground);
        const fullPath = path.join(backgroundDir, safeFilename);

        if (!fullPath.startsWith(backgroundDir)) {
            return res.status(400).json({ success: false, error: 'Invalid tree background path' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(400).json({ success: false, error: 'Tree background file does not exist' });
        }

        const assetPath = `/assets/Tree/background/${safeFilename}`;
        const config = parametersConfigStore.readParametersConfig();
        config.visualAssets = { ...config.visualAssets, treeBackground: assetPath };

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Failed to save tree background' });
        }

        if (req.session?.user?.username) {
            logAudit('PARAMETER_TREE_BACKGROUND_SELECTED', req.session.user.username, 'config', 'visualAssets.treeBackground', req);
        }

        return res.json({
            success: true,
            message: 'Tree background selected successfully',
            assetPath,
            parameters: parametersConfigStore.readParametersConfig()
        });
    } catch (error) {
        console.error('❌ Error selecting tree background:', error.message, error.stack);
        return res.status(500).json({ success: false, error: error.message || 'Failed to select tree background' });
    }
});

// POST /api/admin/parameters/tree-background/upload - Upload a new tree background image and activate it
function handleTreeBackgroundUploadErrors(err, req, res, next) {
    if (!err) {
        return next();
    }
    console.error('❌ Upload rejected:', err.message);
    return res.status(400).json({
        success: false,
        error: err.message || 'Upload failed'
    });
}

router.post('/parameters/tree-background/upload', auth.requireAdmin, uploadTreeBackground.single('background'), handleTreeBackgroundUploadErrors, (req, res) => {
    try {
        console.debug('🎨 Tree background upload endpoint hit');
        if (!req.file) {
            console.error('❌ No file received in request');
            return res.status(400).json({ success: false, error: 'No background file uploaded' });
        }

        const assetPath = `/assets/Tree/background/${req.file.filename}`;
        console.debug('✅ File saved to:', req.file.path);
        console.debug('🔗 Asset path:', assetPath);

        const config = parametersConfigStore.readParametersConfig();
        config.visualAssets = { ...config.visualAssets, treeBackground: assetPath };

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            console.error('❌ Failed to save parameters config');
            return res.status(500).json({ success: false, error: 'Failed to save tree background setting' });
        }

        console.debug('💾 Parameters config saved successfully');

        if (req.session?.user?.username) {
            logAudit('PARAMETER_TREE_BACKGROUND_UPLOADED', req.session.user.username, 'config', 'visualAssets.treeBackground', req);
        }

        const finalConfig = parametersConfigStore.readParametersConfig();
        res.json({
            success: true,
            message: 'Tree background uploaded and applied successfully',
            assetPath,
            parameters: finalConfig
        });
    } catch (error) {
        console.error('❌ Error uploading tree background:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload tree background' });
    }
});

// PUT /api/admin/parameters/treeParameters - Save tree parameters (including title box) - Done by Yu Kang
router.put('/parameters/treeParameters', auth.requireAdmin, (req, res) => {
    try {
        console.debug('🌳 Saving tree parameters');
        const { treeStage, treeStageMode, showTitleBox, leafDisplayScale, vipLeafDisplayScale, leafThresholds, treeTitleBox, treeDisplayMode, leafFallThreshold } = req.body;
        const normalizedDisplayMode = treeDisplayMode === undefined
            ? undefined
            : normalizeTreeDisplayMode({ treeDisplayMode }).treeDisplayMode;

        // Read current config
        const config = parametersConfigStore.readParametersConfig();

        // Ensure treeParameters object exists
        if (!config.treeParameters) {
            config.treeParameters = {};
        }

        // Update top-level fields (keep existing if not provided)
        if (treeStage !== undefined) config.treeParameters.treeStage = treeStage;
        if (showTitleBox !== undefined) config.treeParameters.showTitleBox = showTitleBox;
        if (leafDisplayScale !== undefined) config.treeParameters.leafDisplayScale = leafDisplayScale;
        if (vipLeafDisplayScale !== undefined) config.treeParameters.vipLeafDisplayScale = vipLeafDisplayScale;
        if (leafThresholds) config.treeParameters.leafThresholds = normalizeLeafThresholds(leafThresholds);
        // Auto: the tree grows by itself with its leaf count (features/parameters/treeStage.js).
        if (treeStageMode !== undefined) config.treeParameters.treeStageMode = normalizeTreeStageMode(treeStageMode);
        // Maximum Visible Leaves, shared by the 2D and 3D trees (also set from the 3D Visualization Parameters).
        if (leafFallThreshold !== undefined) {
            const maxLeaves = Math.round(Number(leafFallThreshold));
            if (!Number.isFinite(maxLeaves)) return res.status(400).json({ success: false, error: 'Maximum Visible Leaves must be a number' });
            config.treeParameters.leafFallThreshold = Math.min(500, Math.max(1, maxLeaves));
        }
        if (normalizedDisplayMode !== undefined) config.treeParameters.treeDisplayMode = normalizedDisplayMode;

        // Handle treeTitleBox – merge with existing, but DO NOT override with root showTitleBox
        if (treeTitleBox) {
            // Merge incoming into existing treeTitleBox (or create)
            config.treeParameters.treeTitleBox = {
                ...(config.treeParameters.treeTitleBox || {}),
                ...treeTitleBox
            };
            // If the root showTitleBox is provided separately, we keep it separate.
            // The tree page uses the nested one, so ensure both are updated accordingly.
            // Optionally sync the root one if you want them to match, but better to keep them independent.
        }

        // Write back
        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            console.error('❌ Failed to write parameters config');
            return res.status(500).json({ success: false, error: 'Failed to save tree parameters' });
        }

        console.debug('✅ Tree parameters saved successfully');

        // Audit log
        if (req.session?.user?.username) {
            logAudit('PARAMETER_TREE_UPDATED', req.session.user.username, 'config', 'treeParameters', req);
        }

        // Return updated config
        const updatedConfig = parametersConfigStore.readParametersConfig();
        res.json({ success: true, message: 'Tree parameters saved', parameters: updatedConfig });
    } catch (error) {
        console.error('❌ Error saving tree parameters:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to save tree parameters' });
    }
});


// GET /api/admin/parameters/:category
// Load parameters for specific category
router.get('/parameters/:category', auth.requireAuth, (req, res) => {
  try {
    const { category } = req.params;
    const categoryData = parametersConfigStore.getCategory(category);
    
    if (!categoryData || Object.keys(categoryData).length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, category, parameters: categoryData });
  } catch (error) {
    console.error('❌ Error reading parameter category:', error);
    res.status(500).json({ success: false, error: 'Failed to load parameter category' });
  }
});

// PUT /api/admin/parameters
// Update all system parameters
router.put('/parameters', auth.requireAdmin, (req, res) => {
  try {
    // Feature flags and validation rules are saved alongside other parameter categories (DONE BY CAEDEN)
    const { feedbackMessages, contentSettings, campaignSettings, emailContent, featureFlags, validationRules, treeParameters, feedbackPageStyle, badgeLeafStyles, photoSettings, overlaySettings, visualAssets, archiveSettings, layoutSettings } = req.body;
    
    // Validate inputs
    if (feedbackMessages && typeof feedbackMessages !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid feedbackMessages format' });
    }
    if (contentSettings && typeof contentSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid contentSettings format' });
    }
    if (campaignSettings && typeof campaignSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid campaignSettings format' });
    }
    if (treeParameters && typeof treeParameters !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid treeParameters format' });
    }
    if (feedbackPageStyle && typeof feedbackPageStyle !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid feedbackPageStyle format' });
    }
    if (badgeLeafStyles && typeof badgeLeafStyles !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid badgeLeafStyles format' });
    }
    if (badgeLeafStyles?.colors && typeof badgeLeafStyles.colors !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid badgeLeafStyles.colors format' });
    }
    if (emailContent && typeof emailContent !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid emailContent format' });
    }
    if (featureFlags && typeof featureFlags !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid featureFlags format' });
    }
    if (validationRules && typeof validationRules !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid validationRules format' });
    }
    if (photoSettings && typeof photoSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid photoSettings format' });
    }
    if (overlaySettings && typeof overlaySettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid overlaySettings format' });
    }
    if (visualAssets && typeof visualAssets !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid visualAssets format' });
    }
    if (layoutSettings && typeof layoutSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid layoutSettings format' });
    }
    if (archiveSettings && typeof archiveSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid archiveSettings format' });
    }
    const normalizedContentSettings = normalizeContentSettings(contentSettings);
    const normalizedCampaignSettings = normalizeCampaignSettings(campaignSettings);
    const normalizedTreeParameters = normalizeTreeDisplayMode(treeParameters);
    const normalizedArchiveSettings = normalizeArchiveSettings(archiveSettings);
    const normalizedFeedbackPageStyle = normalizeFeedbackPageStyle(feedbackPageStyle);
    const normalizedBadgeLeafStyles = normalizeBadgeLeafStyles(badgeLeafStyles);

    // Read current config
    const config = parametersConfigStore.readParametersConfig();
    
    // Update only provided categories
    if (feedbackMessages) config.feedbackMessages = { ...config.feedbackMessages, ...feedbackMessages };
    if (normalizedContentSettings) config.contentSettings = { ...config.contentSettings, ...normalizedContentSettings };
    if (normalizedCampaignSettings) config.campaignSettings = { ...config.campaignSettings, ...normalizedCampaignSettings };
    if (emailContent) config.emailContent = { ...config.emailContent, ...emailContent };
    if (featureFlags) config.featureFlags = { ...config.featureFlags, ...featureFlags };
    if (validationRules) config.validationRules = { ...config.validationRules, ...validationRules };
    if (normalizedTreeParameters) config.treeParameters = { ...config.treeParameters, ...normalizedTreeParameters };
    if (normalizedFeedbackPageStyle) config.feedbackPageStyle = { ...config.feedbackPageStyle, ...normalizedFeedbackPageStyle };
    if (normalizedBadgeLeafStyles) {
      config.badgeLeafStyles = {
        ...config.badgeLeafStyles,
        ...normalizedBadgeLeafStyles,
        colors: {
          ...(config.badgeLeafStyles?.colors || {}),
          ...(normalizedBadgeLeafStyles.colors || {})
        }
      };
    }
    if (photoSettings) config.photoSettings = { ...config.photoSettings, ...photoSettings };
    if (overlaySettings) config.overlaySettings = { ...config.overlaySettings, ...overlaySettings };
    if (visualAssets) config.visualAssets = { ...config.visualAssets, ...visualAssets };
    if (layoutSettings) config.layoutSettings = { ...config.layoutSettings, ...layoutSettings };
    if (normalizedArchiveSettings) config.archiveSettings = { ...config.archiveSettings, ...normalizedArchiveSettings };

    // Save updated config
    const success = parametersConfigStore.writeParametersConfig(config);
    
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to save parameters' });
    }
    
    // Audit log
    if (req.session?.user?.username) {
      logAudit('PARAMETERS_UPDATED', req.session.user.username, 'config', 'parameters', req);
    }
    
    res.json({ success: true, message: 'Parameters updated successfully', parameters: config });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('❌ Error updating parameters:', error);
    res.status(500).json({ success: false, error: 'Failed to update parameters' });
  }
});

// PUT /api/admin/parameters/:category
// Update specific parameter category
router.put('/parameters/:category', auth.requireAdmin, (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid parameter updates format' });
    }
    
    // Validate category exists. Missing categories can occur after older reset
    // logic writes an older defaults file, so known default-backed categories
    // are allowed to be recreated by updateCategory().
    const config = parametersConfigStore.readParametersConfig();
    const defaultBackedCategories = [
      'feedbackMessages',
      'contentSettings',
      'campaignSettings',
      'emailContent',
      'featureFlags',
      'validationRules',
      'treeParameters',
      'tree3dParameters',
      'feedbackPageStyle',
      'badgeLeafStyles',
      'photoSettings',
      'overlaySettings',
      'visualAssets',
      'archiveSettings',
      'layoutSettings'
    ];
    if (!config[category] && !defaultBackedCategories.includes(category)) {
      return res.status(404).json({ success: false, error: `Category '${category}' not found` });
    }
    
    let normalizedUpdates = updates;
    if (category === 'contentSettings') {
      normalizedUpdates = normalizeContentSettings(updates);
    } else if (category === 'campaignSettings') {
      normalizedUpdates = normalizeCampaignSettings(updates);
    } else if (category === 'archiveSettings') {
      normalizedUpdates = normalizeArchiveSettings(updates);
    } else if (category === 'feedbackPageStyle') {
      normalizedUpdates = normalizeFeedbackPageStyle(updates);
    } else if (category === 'tree3dParameters') {
      // 3D ESG Tree settings: checked, and merged with the stored ones so the title box keeps unsent fields.
      normalizedUpdates = mergeTree3dParameters(config.tree3dParameters, normalizeTree3dParameters(updates));
    } else if (category === 'badgeLeafStyles') {
      const normalizedBadgeUpdates = normalizeBadgeLeafStyles(updates);
      normalizedUpdates = {
        ...normalizedBadgeUpdates,
        colors: {
          ...(config.badgeLeafStyles?.colors || {}),
          ...(normalizedBadgeUpdates.colors || {})
        }
      };
    }

    // Update category
    const success = parametersConfigStore.updateCategory(category, normalizedUpdates);
    
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to save parameters' });
    }
    
    // Audit log
    if (req.session?.user?.username) {
      logAudit('PARAMETERS_UPDATED', req.session.user.username, 'config', `parameters.${category}`, req);
    }
    
    const updatedConfig = parametersConfigStore.readParametersConfig();
    res.json({ success: true, message: `${category} updated successfully`, parameters: updatedConfig });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('❌ Error updating parameter category:', error);
    res.status(500).json({ success: false, error: 'Failed to update parameter category' });
  }
});

// POST /api/admin/parameters/reset
// Reset all parameters to defaults
/*router.post('/parameters/reset', auth.requireAdmin, (req, res) => {
  try {
    const success = parametersConfigStore.resetToDefaults();
    
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to reset parameters' });
    }
    
    // Audit log
    if (req.session?.user?.username) {
      logAudit('PARAMETERS_RESET', req.session.user.username, 'config', 'parameters', req);
    }
    
    const resetConfig = parametersConfigStore.readParametersConfig();
    res.json({ success: true, message: 'Parameters reset to defaults', parameters: resetConfig });
  } catch (error) {
    console.error('❌ Error resetting parameters:', error);
    res.status(500).json({ success: false, error: 'Failed to reset parameters' });
  }
});*/

// POST /api/admin/retention-cleanup/run
// Trigger temporary retention and audit log cleanup manually from admin UI.
router.post('/retention-cleanup/run', auth.requireAdmin, (req, res) => {
  try {
    dataRetentionCleanup.runManualCleanup();

    if (req.session?.user?.username) {
      logAudit('RETENTION_CLEANUP_RUN', req.session.user.username, 'system', 'retention-cleanup', req);
    }

    res.json({
      success: true,
      message: 'Manual retention cleanup started. Check server logs for cleanup details.',
      startedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error running manual retention cleanup:', error);
    res.status(500).json({ success: false, error: 'Failed to start retention cleanup' });
  }
});


// ==================== 22. EMAIL MANAGEMENT ====================
// Get/Update SMTP config (Gmail / Outlook / Custom) without restarting server

router.get('/email-config', auth.requireAuth, (req, res) => {
  try {
    // Optional: return safe config (no real passwords)
    const safe = emailConfigStore.getSafeEmailConfig
      ? emailConfigStore.getSafeEmailConfig()
      : emailConfigStore.getEmailConfig();

    res.json({ success: true, config: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/email-config', auth.requireAuth, async (req, res) => {
  try {
    const incoming = req.body || {};

    // If frontend sends masked password "********" or empty, keep existing password
    const existing = emailConfigStore.getEmailConfig();
    const merged = structuredClone(existing);

    merged.provider = String(incoming.provider ?? merged.provider ?? '').toLowerCase();
    merged.senderEmail = incoming.senderEmail ?? merged.senderEmail;

    if (merged.provider === 'gmail') {
      merged.gmail.user = incoming.gmail?.user ?? merged.gmail.user;
      const pass = incoming.gmail?.pass;
      if (pass && pass !== '********') merged.gmail.pass = pass;
    }

    if (merged.provider === 'outlook') {
      merged.outlook.user = incoming.outlook?.user ?? merged.outlook.user;
      const pass = incoming.outlook?.pass;
      if (pass && pass !== '********') merged.outlook.pass = pass;
    }

    if (merged.provider === 'custom') {
      merged.custom.host = incoming.custom?.host ?? merged.custom.host;
      merged.custom.port = incoming.custom?.port ?? merged.custom.port;
      merged.custom.secure = incoming.custom?.secure ?? merged.custom.secure;
      merged.custom.user = incoming.custom?.user ?? merged.custom.user;

      const pass = incoming.custom?.pass;
      if (pass && pass !== '********') merged.custom.pass = pass;
    }

    const need = { gmail: ['user', 'pass'], outlook: ['user', 'pass'], custom: ['host', 'port'] }[merged.provider];
    if (!need) return res.status(400).json({ success: false, error: `Unknown provider "${merged.provider}"` });
    const missing = need.filter((f) => !merged[merged.provider] || String(merged[merged.provider][f] ?? '').trim() === '');
    if (missing.length) return res.status(400).json({ success: false, error: `Missing ${merged.provider} settings: ${missing.join(', ')}` });
    emailConfigStore.saveEmailConfig(merged);
    if (emailService.reloadEmailService) {
      try {
        await emailService.reloadEmailService(); // no restart
      } catch (reloadErr) {
        emailConfigStore.saveEmailConfig(existing); // keep the settings that worked
        await emailService.reloadEmailService().catch(() => {});
        return res.status(400).json({ success: false, error: `Not saved, the mail service rejected these settings: ${reloadErr.message}` });
      }
    }
    res.json({ success: true, message: 'Email config saved and reloaded.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/email-config/test', auth.requireAuth, async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).json({ success: false, error: 'Missing "to" email.' });

    const result = await emailService.testEmailService(to);
    if (!result || result.success === false) {
      return res.status(500).json({ success: false, error: (result && result.error) || 'Test email failed' });
    }
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== BADGE EMAIL TEMPLATE MANAGEMENT ====================

router.get('/badge-email-templates', auth.requireAdmin, (req, res) => {
  try {
    const templates = badgeEmailTemplateStore.getBadgeEmailTemplates();
    const badgeKeys = emailService.ACTIVE_BADGE_KEYS || Object.keys(emailService.BADGE_CONFIGS || {});
    const badges = badgeKeys.map((key) => {
      const badge = emailService.BADGE_CONFIGS[key];
      return badge && {
      key,
      name: badge.name,
      description: badge.description,
      color: badge.color
      };
    }).filter(Boolean);

    res.json({ success: true, badges, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/badge-email-templates', auth.requireAdmin, (req, res) => {
  try {
    const templates = req.body?.templates;
    if (!templates || typeof templates !== 'object') {
      return res.status(400).json({ success: false, error: 'Templates payload is required' });
    }

    const saved = badgeEmailTemplateStore.saveBadgeEmailTemplates(templates);

    if (req.session?.user?.username) {
      logAudit('BADGE_EMAIL_TEMPLATES_UPDATED', req.session.user.username, 'config', 'badge-email-templates', req);
    }

    res.json({ success: true, message: 'Badge email templates saved', templates: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 23. TIMER COUNTDOWN MANAGEMENT ROUTES (DONE BY BERNISSA) ====================

 // GET /api/admin/countdown-management
 // Returns: { success: true, countdown_seconds: number }

router.get('/countdown-management', auth.requireAuth, (req, res) => {
    const sql = `
        SELECT countdown_seconds
        FROM countdown_management
        WHERE id = 1
        LIMIT 1
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error('❌ Error loading countdown:', err);
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }

        const seconds = rows?.[0]?.countdown_seconds;
        const safeSeconds =
            Number.isInteger(seconds) && seconds >= 0 ? seconds : 3;

        return res.json({
            success: true,
            countdown_seconds: safeSeconds
        });
    });
});

// PUT /api/admin/countdown-management

router.put('/countdown-management', auth.requireAuth, (req, res) => {
    console.debug('🔄 PUT /countdown-management - Updating countdown');
    
    // Get username from session
    const username = req.session?.user?.username;
    const seconds = Number(req.body?.countdown_seconds);

    console.debug('📝 Request details:', {
        username: username,
        countdown_seconds: seconds,
        body: req.body
    });

    // Validate input
    if (!Number.isInteger(seconds) || seconds < 0) {
        console.debug('❌ Invalid input received:', seconds);
        return res.status(400).json({
            success: false,
            error: 'countdown_seconds must be a whole number (>= 0)'
        });
    }

    console.debug('✅ Valid input received:', seconds, 'seconds by user:', username);

    const sql = `
        UPDATE countdown_management
        SET countdown_seconds = ?, updated_by = ?
        WHERE id = 1
    `;

    db.query(sql, [seconds, username], (err, result) => {
        if (err) {
            console.error('❌ Database error saving countdown:', err);
            return res.status(500).json({
                success: false,
                error: 'Database error: ' + err.message
            });
        }

        console.debug('✅ Countdown updated successfully:', {
            seconds: seconds,
            username: username,
            affectedRows: result.affectedRows
        });

        return res.json({
            success: true,
            countdown_seconds: seconds,
            message: 'Countdown updated successfully'
        });
    });
});

// ==================== 24. SERVER SCHEDULE MANAGEMENT ROUTES (DONE BY BERNISSA) ====================

// SERVER SCHEDULE MANAGEMENT (Config File Based)

// Schedule, mode and automation files plus the kiosk status probe live in features/serverControl/control.js
const serverControl = require('../serverControl/control');
const scheduler = require('../serverControl/scheduler');
const { readSchedulesConfig, writeSchedulesConfig, readModeConfig, writeModeConfig, resolveKioskStatus, logKioskStatusIfNeeded } = serverControl;

// <Jun Kai start>
// Schedules are "policies" since supervisor meeting 03 (4 Nov 2026): Active or Stop, list order = priority.
// The rules live in features/serverControl/policies.js.
const schedulePolicies = require('../serverControl/policies');

const sameName = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Where a saved policy ended up, for the toast on the page
function placement(list, policy) {
  const index = list.indexOf(policy);
  const below = list[index + 1] || null;
  const above = index > 0 ? list[index - 1] : null;
  const beatenBy = list.slice(0, index).filter((other) => other.is_active !== false
    && schedulePolicies.actionOf(other) !== schedulePolicies.actionOf(policy)
    && schedulePolicies.overlaps(other, policy, new Date())).map((other) => other.schedule_name);
  return {
    beatenBy,
    position: index + 1,
    total: list.length,
    placedAbove: below && schedulePolicies.rank(policy) > schedulePolicies.rank(below) ? below.schedule_name : null,
    reason: below && schedulePolicies.rank(policy) > schedulePolicies.rank(below) ? schedulePolicies.placementReason(policy, below) : null,
    placedBelow: above ? above.schedule_name : null
  };
}

// GET /api/admin/server-schedules  in priority order
router.get('/server-schedules', auth.requireAuth, (req, res) => {
  try {
    const config = readSchedulesConfig();
    res.json({ success: true, schedules: config.schedules.map((s) => ({ ...s, action: schedulePolicies.actionOf(s) })) });
  } catch (err) {
    console.error('❌ Error fetching schedules:', err);
    res.status(500).json({ success: false, error: 'Failed to load the policies' });
  }
});

// POST /api/admin/server-schedules  new policy, placed just above the first policy it outranks
router.post('/server-schedules', auth.requireAuth, (req, res) => {
  const checked = schedulePolicies.normalize(req.body || {});
  if (checked.error) return res.status(400).json({ success: false, error: checked.error });
  try {
    const config = readSchedulesConfig();
    if (config.schedules.some((s) => sameName(s.schedule_name, checked.policy.schedule_name))) {
      return res.status(400).json({ success: false, error: `A policy called "${checked.policy.schedule_name}" already exists` });
    }
    const policy = {
      id: Date.now(),
      ...checked.policy,
      created_by: req.session?.user?.username || 'unknown',
      created_at: new Date().toLocaleString('sv-SE')
    };
    config.schedules.splice(schedulePolicies.insertIndex(config.schedules, policy), 0, policy);
    if (!writeSchedulesConfig(config)) throw new Error('Failed to write config file');
    console.debug(`✅ Policy "${policy.schedule_name}" added (${policy.action}, ${policy.schedule_type})`);
    res.json({ success: true, message: 'Policy created', schedule: policy, ...placement(config.schedules, policy) });
  } catch (err) {
    console.error('❌ Error adding policy:', err);
    res.status(500).json({ success: false, error: 'Failed to create the policy' });
  }
});

// PUT /api/admin/server-schedules/:id  edit; the policy only moves when its kind (repeat type or Active/Stop) changes
router.put('/server-schedules/:id', auth.requireAuth, (req, res) => {
  const scheduleId = parseInt(req.params.id, 10);
  try {
    const config = readSchedulesConfig();
    const index = config.schedules.findIndex((s) => s.id === scheduleId);
    if (index === -1) return res.status(404).json({ success: false, error: 'Policy not found' });
    const existing = config.schedules[index];
    const checked = schedulePolicies.normalize(req.body || {}, existing);
    if (checked.error) return res.status(400).json({ success: false, error: checked.error });
    if (config.schedules.some((s) => s.id !== scheduleId && sameName(s.schedule_name, checked.policy.schedule_name))) {
      return res.status(400).json({ success: false, error: `A policy called "${checked.policy.schedule_name}" already exists` });
    }
    const updated = { ...existing, ...checked.policy, id: existing.id, updated_at: new Date().toLocaleString('sv-SE') };
    const moved = schedulePolicies.rank(updated) !== schedulePolicies.rank(existing);
    if (moved) {
      config.schedules.splice(index, 1);
      config.schedules.splice(schedulePolicies.insertIndex(config.schedules, updated), 0, updated);
    } else {
      config.schedules[index] = updated;
    }
    if (!writeSchedulesConfig(config)) throw new Error('Failed to write config file');
    const where = placement(config.schedules, updated);
    if (!moved) { where.placedAbove = null; where.reason = null; }
    res.json({ success: true, message: 'Policy updated', schedule: updated, moved, ...where });
  } catch (err) {
    console.error('❌ Error updating policy:', err);
    res.status(500).json({ success: false, error: 'Failed to update the policy' });
  }
});

// POST /api/admin/server-schedules/reorder  { ids: [...] } after a drag, or { order: 'default' } to re-sort.
// (POST, because PUT /server-schedules/:id would take "reorder" for an id.)
router.post('/server-schedules/reorder', auth.requireAuth, (req, res) => {
  try {
    const config = readSchedulesConfig();
    const body = req.body || {};
    let ordered;
    if (body.order === 'default') {
      ordered = schedulePolicies.defaultOrder(config.schedules);
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number) : null;
      const known = new Map(config.schedules.map((s) => [s.id, s]));
      if (!ids || ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
        return res.status(400).json({ success: false, error: 'The list changed while you were moving it. Reload the page and try again.' });
      }
      ordered = ids.map((id) => known.get(id));
    }
    config.schedules = ordered;
    if (!writeSchedulesConfig(config)) throw new Error('Failed to write config file');
    res.json({ success: true, schedules: ordered.map((s) => ({ ...s, action: schedulePolicies.actionOf(s) })) });
  } catch (err) {
    console.error('❌ Error reordering policies:', err);
    res.status(500).json({ success: false, error: 'Failed to save the order' });
  }
});

// GET /api/admin/server-schedules/preview?days=7[&from=2026-11-10]  which policy decides each part of those days;
// manual: true in manual mode, where the policies are paused and the page shows the days empty
router.get('/server-schedules/preview', auth.requireAuth, (req, res) => {
  try {
    const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 7));
    const now = new Date();
    let start = now;
    if (req.query.from !== undefined) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.query.from));
      start = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
      if (!start || start.getMonth() !== Number(m[2]) - 1 || Math.abs(start - now) > 10 * 366 * 86400000) {
        return res.status(400).json({ success: false, error: 'from must be a date like 2026-11-10, within 10 years of today' });
      }
    }
    const manual = serverControl.readModeConfig().mode !== 'auto';
    res.json({ success: true, preview: { ...schedulePolicies.preview(readSchedulesConfig().schedules, now, days, start), manual } });
  } catch (err) {
    console.error('❌ Error building the policy preview:', err);
    res.status(500).json({ success: false, error: 'Failed to build the preview' });
  }
});
// <Jun Kai end>

// DELETE /api/admin/server-schedules/:id
// Delete schedule
router.delete('/server-schedules/:id', auth.requireAuth, (req, res) => {
  const scheduleId = parseInt(req.params.id);
  
  console.debug(`🗑️  Deleting schedule ID ${scheduleId}`);
  
  try {
    const config = readSchedulesConfig();
    const originalLength = config.schedules.length;
    
    config.schedules = config.schedules.filter(s => s.id !== scheduleId);
    
    if (config.schedules.length === originalLength) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    if (!writeSchedulesConfig(config)) {
      throw new Error('Failed to write config file');
    }
    
    console.debug(`✅ Schedule deleted successfully`);
    
    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
    
  } catch (err) {
    console.error('❌ Error deleting schedule:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete schedule'
    });
  }
});

// PUT /api/admin/server-schedules/:id/toggle
// Toggle schedule active status
router.put('/server-schedules/:id/toggle', auth.requireAuth, (req, res) => {
  const scheduleId = parseInt(req.params.id);
  const { is_active } = req.body;
  
  console.debug(`🔄 Toggling schedule ID ${scheduleId} to ${is_active}`);
  
  try {
    const config = readSchedulesConfig();
    const schedule = config.schedules.find(s => s.id === scheduleId);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    // Update active status
    schedule.is_active = is_active;
    schedule.updated_at = new Date().toLocaleString('sv-SE')
    
    if (!writeSchedulesConfig(config)) {
      throw new Error('Failed to write config file');
    }
    
    const status = is_active ? 'enabled' : 'disabled';
    console.debug(`✅ Schedule ${status} successfully`);
    
    res.json({
      success: true,
      message: `Schedule ${status} successfully`
    });
    
  } catch (err) {
    console.error('❌ Error toggling schedule:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle schedule'
    });
  }
});

// POST /api/admin/server-schedules/enable-all
// Enable all schedules
router.post('/server-schedules/enable-all', auth.requireAuth, (req, res) => {
  console.debug('✅ Enabling all schedules');
  
  try {
    const config = readSchedulesConfig();
    
    config.schedules.forEach(schedule => {
      schedule.is_active = true;
    });
    
    if (!writeSchedulesConfig(config)) {
      throw new Error('Failed to write config file');
    }
    
    res.json({
      success: true,
      message: `Enabled ${config.schedules.length} schedule(s)`,
      enabled_count: config.schedules.length
    });
    
  } catch (err) {
    console.error('❌ Error enabling schedules:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to enable schedules'
    });
  }
});

// POST /api/admin/server-schedules/disable-all
// Disable all schedules
router.post('/server-schedules/disable-all', auth.requireAuth, (req, res) => {
  console.debug('⏸️  Disabling all schedules');
  
  try {
    const config = readSchedulesConfig();
    
    config.schedules.forEach(schedule => {
      schedule.is_active = false;
    });
    
    if (!writeSchedulesConfig(config)) {
      throw new Error('Failed to write config file');
    }
    
    res.json({
      success: true,
      message: `Disabled ${config.schedules.length} schedule(s)`,
      disabled_count: config.schedules.length
    });
    
  } catch (err) {
    console.error('❌ Error disabling schedules:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to disable schedules'
    });
  }
});

// Done by Yu Kang
// kiosk status probe: see features/serverControl/control.js (resolveKioskStatus, logKioskStatusIfNeeded)

function checkPathAccess(targetPath) {
    const result = {
        path: targetPath,
        exists: false,
        readable: false,
        writable: false,
        status: 'missing'
    };

    try {
        const stats = fs.statSync(targetPath);
        result.exists = true;
        result.isDirectory = stats.isDirectory();

        if (!stats.isDirectory()) {
            result.status = 'not-directory';
            return result;
        }

        fs.accessSync(targetPath, fs.constants.R_OK);
        result.readable = true;
        fs.accessSync(targetPath, fs.constants.W_OK);
        result.writable = true;
        result.status = 'ok';
    } catch (error) {
        if (result.exists) {
            result.status = result.readable ? 'not-writable' : 'not-readable';
        }
        result.error = error.message;
    }

    return result;
}

function resolveHealthDetails() {
    const parameters = parametersConfigStore.readParametersConfig();
    const featureFlags = parameters.featureFlags || {};
    const cameraCaptureEnabled = featureFlags.cameraCaptureEnabled !== false;
    const photoUploadEnabled = featureFlags.photoUploadEnabled !== false;

    const storagePaths = [
        { key: 'uploads', label: 'Uploads root', path: paths.UPLOADS },
        { key: 'photos', label: 'Raw photos', path: path.join(paths.UPLOADS, 'photos') },
        { key: 'processed', label: 'Processed photos', path: path.join(paths.UPLOADS, 'processed') },
        { key: 'desktopOverlays', label: 'Desktop overlays', path: path.join(paths.ASSETS, 'overlays', 'DesktopOverlay') },
        { key: 'mobileOverlays', label: 'Mobile overlays', path: path.join(paths.ASSETS, 'overlays', 'MobileOverlay') }
    ].map(item => ({
        ...item,
        ...checkPathAccess(item.path)
    }));

    const failingPaths = storagePaths.filter(item => item.status !== 'ok');

    return {
        camera: {
            ok: cameraCaptureEnabled || photoUploadEnabled,
            status: cameraCaptureEnabled ? 'enabled' : (photoUploadEnabled ? 'upload-only' : 'disabled'),
            cameraCaptureEnabled,
            photoUploadEnabled,
            message: cameraCaptureEnabled
                ? 'Desktop webcam capture is enabled. Browser permission is checked on the kiosk page.'
                : (photoUploadEnabled
                    ? 'Desktop webcam capture is disabled; mobile photo upload is enabled.'
                    : 'Camera capture and photo upload are disabled in feature flags.')
        },
        storage: {
            ok: failingPaths.length === 0,
            status: failingPaths.length === 0 ? 'ok' : 'attention',
            checked: storagePaths.length,
            failing: failingPaths.length,
            paths: storagePaths,
            message: failingPaths.length === 0
                ? 'All required upload and asset folders are available and writable.'
                : `${failingPaths.length} storage folder${failingPaths.length === 1 ? '' : 's'} need attention.`
        }
    };
}

function normalizeBluetoothAssetPayload(body = {}) {
    const bluetoothId = String(body.bluetoothId || body.bluetooth_id || body.id || '').trim().toUpperCase();
    return {
        bluetoothId,
        name: String(body.name || body.assetName || '').trim(),
        category: String(body.category || '').trim(),
        location: String(body.location || '').trim(),
        notes: String(body.notes || '').trim(),
        active: body.active !== false && body.active !== 'false'
    };
}

function getNearbyDeviceMap() {
    try {
        const { nearbyDevices } = require('../assets/bluetooth');
        return nearbyDevices;
    } catch (error) {
        console.error('Failed to access nearby bluetooth devices:', error);
        return new Map();
    }
}

function enrichBluetoothAssets(list = []) {
    const nearbyDevices = getNearbyDeviceMap();

    return list.map((asset) => {
        const normalizedId = String(asset.bluetoothId || '').trim().toUpperCase();
        const nearby = nearbyDevices.get(normalizedId);

        return {
            ...asset,
            isDetected: Boolean(nearby),
            lastSeen: nearby?.lastSeen || null,
            rssi: nearby?.rssi ?? null,
            nearbyName: nearby?.name || null,
            source: nearby?.source || null
        };
    });
}

// GET /api/admin/assets
router.get('/assets', auth.requireAdmin, (req, res) => {
    try {
        const assets = enrichBluetoothAssets(assetStore.readBluetoothAssets());
        res.json({ success: true, assets });
    } catch (error) {
        console.error('❌ Failed to load Bluetooth assets:', error);
        res.status(500).json({ success: false, error: 'Failed to load assets' });
    }
});

// POST /api/admin/parameters/vip-leaf - Upload a custom VIP leaf image and activate it
// Storage for custom VIP leaf image uploads
const vipLeafStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destFolder = path.join(paths.ASSETS, 'Tree', 'vip-leaf');
        console.debug('📂 VIP leaf destination folder:', destFolder);
        try {
            if (!fs.existsSync(destFolder)) {
                console.debug('📁 Creating VIP leaf directory:', destFolder);
                fs.mkdirSync(destFolder, { recursive: true });
                console.debug('✅ VIP leaf directory created successfully');
            }
        } catch (err) {
            console.error('❌ Failed to create VIP leaf directory:', err.message);
            return cb(err);
        }
        cb(null, destFolder);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const filename = `CustomVipLeaf-${Date.now()}${ext}`;
        console.debug(`📁 VIP leaf filename: ${filename}`);
        cb(null, filename);
    }
});

const uploadParameterVipLeaf = multer({
    storage: vipLeafStorage,
    fileFilter: (req, file, cb) => {
        console.debug('🔍 Checking VIP leaf file type:', file.mimetype, 'name:', file.originalname);
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
            console.debug('✅ VIP leaf file type accepted');
            cb(null, true);
        } else {
            console.error('❌ VIP leaf file type rejected:', file.mimetype);
            cb(new Error('Only PNG, JPG, and WebP files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

router.post('/parameters/vip-leaf', auth.requireAdmin, uploadParameterVipLeaf.single('vipLeaf'), handleTreeBackgroundUploadErrors, (req, res) => {
    try {
        console.debug('🍃 VIP leaf upload endpoint hit');
        console.debug('📦 Received file:', req.file);

        if (!req.file) {
            console.error('❌ No file received in VIP leaf upload request');
            return res.status(400).json({ success: false, error: 'No VIP leaf file uploaded' });
        }

        const assetPath = `/assets/Tree/vip-leaf/${req.file.filename}`;
        const config = parametersConfigStore.readParametersConfig();
        if (config.visualAssets?.vipLeafImage) {
            config.visualAssets.previousVipLeafImage = config.visualAssets.vipLeafImage;
            console.debug('💾 Previous VIP leaf image saved:', config.visualAssets.previousVipLeafImage);
        }

        config.visualAssets = { ...config.visualAssets, vipLeafImage: assetPath };

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Failed to save VIP leaf image setting' });
        }

        if (req.session?.user?.username) {
            logAudit('PARAMETER_VIP_LEAF_UPLOADED', req.session.user.username, 'config', 'visualAssets.vipLeafImage', req);
        }

        res.json({
            success: true,
            message: 'VIP leaf image uploaded successfully',
            assetPath,
            parameters: parametersConfigStore.readParametersConfig()
        });
    } catch (error) {
        console.error('❌ Error uploading VIP leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload VIP leaf image' });
    }
});

// POST /api/admin/parameters/vip-leaf/revert - Revert to previous VIP leaf image
router.post('/parameters/vip-leaf/revert', auth.requireAdmin, (req, res) => {
    try {
        const config = parametersConfigStore.readParametersConfig();
        const assets = config.visualAssets || {};

        if (!assets.previousVipLeafImage) {
            return res.status(400).json({ success: false, error: 'No previous VIP leaf image to revert to' });
        }

        const currentVipLeafImage = assets.vipLeafImage;
        config.visualAssets.vipLeafImage = assets.previousVipLeafImage;
        config.visualAssets.previousVipLeafImage = currentVipLeafImage;

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Failed to revert VIP leaf image' });
        }

        if (req.session?.user?.username) {
            logAudit('PARAMETER_VIP_LEAF_REVERTED', req.session.user.username, 'config', 'visualAssets.vipLeafImage', req);
        }

        res.json({
            success: true,
            message: 'VIP leaf image reverted successfully',
            parameters: parametersConfigStore.readParametersConfig()
        });
    } catch (error) {
        console.error('❌ Error reverting VIP leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to revert VIP leaf image' });
    }
});

// GET /api/admin/parameters/vip-leaf/list - List available VIP leaf images
router.get('/parameters/vip-leaf/list', auth.requireAdmin, (req, res) => {
    try {
        const vipLeafDir = path.join(paths.ASSETS, 'Tree', 'vip-leaf');
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        const vipLeafImages = [];

        if (!fs.existsSync(vipLeafDir)) {
            return res.json({ success: true, vipLeafImages: [] });
        }

        const files = fs.readdirSync(vipLeafDir);
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            if (imageExtensions.includes(ext)) {
                vipLeafImages.push({
                    filename: file,
                    path: `/assets/Tree/vip-leaf/${file}`,
                    name: path.parse(file).name
                });
            }
        });

        res.json({ success: true, vipLeafImages });
    } catch (error) {
        console.error('❌ Error listing VIP leaf images:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to list VIP leaf images' });
    }
});

// POST /api/admin/parameters/vip-leaf/select - Select an existing VIP leaf image
router.post('/parameters/vip-leaf/select', auth.requireAdmin, (req, res) => {
    try {
        const { vipLeafImage } = req.body;

        if (!vipLeafImage) {
            return res.status(400).json({ success: false, error: 'VIP leaf image path is required' });
        }

        const vipLeafDir = path.join(paths.ASSETS, 'Tree', 'vip-leaf');
        const fullPath = path.join(vipLeafDir, path.basename(vipLeafImage));

        if (!fullPath.startsWith(vipLeafDir)) {
            return res.status(400).json({ success: false, error: 'Invalid VIP leaf image path' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(400).json({ success: false, error: 'VIP leaf image file does not exist' });
        }

        const assetPath = `/assets/Tree/vip-leaf/${path.basename(vipLeafImage)}`;
        const config = parametersConfigStore.readParametersConfig();
        if (config.visualAssets?.vipLeafImage) {
            config.visualAssets.previousVipLeafImage = config.visualAssets.vipLeafImage;
        }

        config.visualAssets = { ...config.visualAssets, vipLeafImage: assetPath };

        const success = parametersConfigStore.writeParametersConfig(config);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Failed to select VIP leaf image' });
        }

        if (req.session?.user?.username) {
            logAudit('PARAMETER_VIP_LEAF_SELECTED', req.session.user.username, 'config', 'visualAssets.vipLeafImage', req);
        }

        res.json({
            success: true,
            message: 'VIP leaf image selected successfully',
            parameters: parametersConfigStore.readParametersConfig()
        });
    } catch (error) {
        console.error('❌ Error selecting VIP leaf image:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to select VIP leaf image' });
    }
});

// POST /api/admin/assets
router.post('/assets', auth.requireAdmin, express.json(), (req, res) => {
    try {
        const payload = normalizeBluetoothAssetPayload(req.body);
        if (!payload.bluetoothId) {
            return res.status(400).json({ success: false, error: 'Bluetooth ID is required' });
        }

        const assets = assetStore.addBluetoothAsset(payload);
        res.json({ success: true, assets: enrichBluetoothAssets(assets) });
    } catch (error) {
        console.error('❌ Failed to save Bluetooth asset:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to save asset' });
    }
});

// DELETE /api/admin/assets/:bluetoothId
router.delete('/assets/:bluetoothId', auth.requireAdmin, (req, res) => {
    try {
        const bluetoothId = String(req.params.bluetoothId || '').trim().toUpperCase();
        const assets = assetStore.removeBluetoothAsset(bluetoothId);
        res.json({ success: true, assets: enrichBluetoothAssets(assets) });
    } catch (error) {
        console.error('❌ Failed to delete Bluetooth asset:', error);
        res.status(500).json({ success: false, error: 'Failed to delete asset' });
    }
});

// POST /api/admin/server/start
// Manually start the kiosk service
router.post('/server/start', auth.requireAuth, (req, res) => {
    console.log('▶️  Manual server start requested');
    serverControl.startKiosk((result) => res.status(result.success ? 200 : 500).json(result));
});


// POST /api/admin/server/restart
// Restart the kiosk application stack from the admin panel
router.post('/server/restart', auth.requireAuth, (req, res) => {
    const { spawn } = require('child_process');
    const rootDir = paths.ROOT;
    const logsDir = path.join(rootDir, 'logs');
    const batchFile = path.join(rootDir, 'restart-app.bat');

    try {
        if (!fs.existsSync(batchFile)) {
            throw new Error('Restart script not found');
        }

        fs.mkdirSync(logsDir, { recursive: true });
        console.log('🔄 Restart requested from admin panel');

        const child = spawn('cmd.exe', ['/c', batchFile], {
            cwd: rootDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: process.env
        });

        child.on('error', (error) => {
            console.error('❌ Failed to launch restart batch file:', error);
        });

        child.unref();

        setTimeout(() => {
            process.exit(0);
        }, 1000);

        res.json({
            success: true,
            message: 'Restart initiated. The application will relaunch shortly.'
        });
    } catch (error) {
        console.error('❌ Failed to restart server:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to restart server'
        });
    }
});

// POST /api/admin/server/stop (Done by Yu Kang)
// Manually stop the kiosk service
router.post('/server/stop', auth.requireAuth, (req, res) => {
    const username = (req.session.user && req.session.user.username) || 'unknown';
    console.log('⏹️  Manual stop requested by', username);
    res.json({ success: true, message: 'Computer entering hibernate mode. Please wait...' });
    // let the response reach the page first
    setTimeout(() => serverControl.hibernateNow(`manual stop by ${username}`), 3000);
});

// ==================== SERVER CONTROL MODE ROUTES ====================

// GET /api/admin/server/mode
// Get current server control mode (auto or manual)
router.get('/server/mode', auth.requireAuth, (req, res) => {
  console.debug('📡 Getting server control mode');
  
  const config = readModeConfig();
  
  res.json({
    success: true,
    mode: config.mode,
    last_updated: config.last_updated,
    updated_by: config.updated_by
  });
});

// POST /api/admin/server/mode
// Set server control mode (auto or manual)
router.post('/server/mode', auth.requireAuth, (req, res) => {
  const { mode } = req.body;
  
  console.debug(`🔄 Changing server control mode to: ${mode}`);
  
  // Validate mode
  if (!mode || !['auto', 'manual'].includes(mode)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid mode. Must be "auto" or "manual"'
    });
  }
  
  try {
    const config = {
      mode: mode,
      updated_by: (req.session.user && req.session.user.username) || 'unknown'
    };
    
    if (!writeModeConfig(config)) {
      throw new Error('Failed to write mode configuration');
    }
    
    // <Jun Kai start>
    console.log(`✅ Server mode changed to ${mode.toUpperCase()} by ${config.updated_by}`);
    scheduler.modeChanged();
    // <Jun Kai end>
    
    res.json({
      success: true,
      mode: mode,
      message: `Switched to ${mode.toUpperCase()} mode`
    });
    
  } catch (err) {
    console.error('❌ Error changing mode:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to change server mode'
    });
  }
});

// GET /api/admin/server/status
// Get current kiosk service status
router.get('/server/status', auth.requireAuth, (req, res) => {
    resolveKioskStatus((result) => {
        logKioskStatusIfNeeded(result);
        const health = resolveHealthDetails();

    res.json({
      success: true,
            kiosk_running: result.running,
            status: result.status,
            source: result.source,
            platform: process.platform,
            health
    });
  });
});

// GET /api/admin/server/automation
// What the scheduler will do next: mode, next stop and start, wake timer state, recent automatic actions
router.get('/server/automation', auth.requireAuth, (req, res) => {
    scheduler.getStatus((automation) => res.json({ success: true, automation }));
});

// GET /api/admin/kiosk-status
// Simple endpoint to check if kiosk service is active (for watchKioskService polling)
// This is called every 3 seconds by the frontend to detect service state changes
router.get('/kiosk-status', auth.requireAuth, (req, res) => {
    resolveKioskStatus((result) => {
        const health = resolveHealthDetails();
    res.json({
            active: result.running,
            status: result.status,
            source: result.source,
            platform: process.platform,
            health
    });
  });
});

module.exports = router;
