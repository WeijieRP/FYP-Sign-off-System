// Owner: Role 3, Jun Kai. Previous team: Preti (24).
// ============================================================
// DATAEXPORTROUTES.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
// 
// 1. IMPORTS & CONFIGURATION
//    const express                    - Express framework (DONE BY PRETI)
//    const router                     - Router instance (DONE BY PRETI)
//    const auth                       - Authentication module (DONE BY PRETI)
//    const db                         - Database module (DONE BY PRETI)
//    const fs                         - File system module (DONE BY PRETI)
//    const path                       - Path module (DONE BY PRETI)
//    const archiver                   - ZIP archive library (DONE BY PRETI)
//
// 2. MIDDLEWARE FUNCTIONS
//    function requireDataExportUnlocked() - Check if data export session is unlocked (DONE BY PRETI)
//
// 3. SESSION UNLOCK ROUTES
//    router.post('/unlock'            - Verify password and unlock data export for 30 minutes (DONE BY PRETI)
//
// 4. FEEDBACK EXPORT ROUTES
//    router.get('/feedback/full'      - Export all feedback data (CSV) (DONE BY PRETI)
//    router.get('/feedback/not-archived' - Export not_archived feedback data (CSV) (DONE BY PRETI)
//    router.get('/feedback/archived'  - Export archived feedback data (CSV) (DONE BY PRETI)
//
// 5. PHOTO EXPORT ROUTES
//    router.get('/photos/all'         - Export all photos as ZIP (DONE BY PRETI)
//    router.get('/photos/not-archived' - Export not_archived photos as ZIP (DONE BY PRETI)
//    router.get('/photos/archived'    - Export archived photos as ZIP (DONE BY PRETI)
//
// 6. AUDIT LOG EXPORT ROUTES
//    router.get('/audit-log'          - Export audit logs as CSV (DONE BY PRETI)
//
// 7. HELPER FUNCTIONS - EMAIL DECRYPTION
//    function decryptEmailsInFeedback() - Decrypt all encrypted emails in feedback array (DONE BY PRETI)
//
// 8. HELPER FUNCTIONS - DATA RETRIEVAL
//    function getFeedbackData()       - Get feedback data with archive filter (DONE BY PRETI)
//
// 9. HELPER FUNCTIONS - EXCEL GENERATION
//    async function generateFeedbackExcel() - Generate Excel/CSV file from feedback data (DONE BY PRETI)
//
// 10. HELPER FUNCTIONS - PHOTO EXPORT
//     async function exportPhotos()   - Export photos as ZIP archive (DONE BY PRETI)
//
// 11. UTILITY FUNCTIONS
//     function convertToCSV()         - Convert array of objects to CSV format (DONE BY PRETI)
//     function getTimestamp()         - Get current timestamp for filenames (DONE BY PRETI)
//     function logAudit()             - Log admin actions to audit_logs table (DONE BY PRETI)
//
// 12. MODULE EXPORTS
//     module.exports = router         - Export router (DONE BY PRETI)
//
// ============================================================

const express = require('express');
const router = express.Router();
const auth = require('../../core/auth');
const { csvCell } = require('../../core/csv'); // <Jun Kai/> one CSV cell: 0 is kept, dates in Singapore time, no formulas
const db = require('../../core/db');
const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');
const requestLimit = require('../../core/requestLimit'); // <Jun Kai/> request limits per address
const { insideUploads } = require('../../core/photoFiles'); // <Jun Kai/> stored photo paths stay inside the uploads folder
const { createZipArchive } = require('../../core/zip');

const pledgeTopicsPath = paths.dataFile('pledge-topics.json');
const DEFAULT_PLEDGE_TOPICS = [
    { value: 'climate-change', label: 'Climate Change' },
    { value: 'renewable-energy', label: 'Renewable Energy' },
    { value: 'sustainable-living', label: 'Sustainable Living' },
    { value: 'ocean-conservation', label: 'Ocean Conservation' },
    { value: 'ethical-governance', label: 'Ethical Governance' },
    { value: 'community-impact', label: 'Community Impact' }
];

// ==================== 2. MIDDLEWARE FUNCTIONS ====================

// Check if data export is unlocked in session
function requireDataExportUnlocked(req, res, next) {
    console.debug('🔍 Data Export Middleware Check:');
    console.debug('   - Session exists:', !!req.session);
    console.debug('   - Session.user exists:', !!req.session?.user);
    console.debug('   - User role:', req.session?.user?.role);
    console.debug('   - Export unlocked:', req.session?.data_export_unlocked);
    console.debug('   - Unlock time:', req.session?.data_export_unlock_time);
    
    if (!req.session || !req.session.user) {
        console.debug('❌ Authentication failed: No session or user');
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    
    // Check if user has system_admin role
    if (req.session.user.role !== 'system_admin') {
        console.debug('❌ Authorization failed: User role is', req.session.user.role);
        return res.status(403).json({ error: 'System Administrator privileges required' });
    }
    
    // Check session unlock (with 30 min timeout)
    if (req.session.data_export_unlocked) {
        const unlockTime = new Date(req.session.data_export_unlock_time);
        const now = new Date();
        const minutesPassed = (now - unlockTime) / (1000 * 60);
        
        console.debug('   - Minutes since unlock:', minutesPassed.toFixed(2));
        
        if (minutesPassed < 30) {
            console.debug('✅ Data export access granted');
            return next();
        }
        
        console.debug('❌ Session expired:', minutesPassed.toFixed(2), 'minutes passed');
    } else {
        console.debug('❌ Data export not unlocked');
    }
    
    return res.status(401).json({ error: 'Data export session expired. Please unlock again.' });
}

// ==================== 3. SESSION UNLOCK ROUTES ====================


// POST /api/admin/data-export/unlock
// Verify password and unlock data export for 30 minutes
// <Jun Kai start> signed-in admins only, and the password of the signed-in admin. Without a sign-in this route was a
// password check for any account that anyone could try without the limit of the sign-in
router.post('/unlock', auth.requireAuth, requestLimit.passwordChecks, async (req, res) => {
    const { password } = req.body;
    const username = req.session.user.username;
// <Jun Kai end>
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        // Verify credentials
        auth.loginUser(username, password, (err, user) => {
            if (err) {
                console.log('❌ Login failed for data export:', username, err.message);
                logAudit('DATA_EXPORT_UNLOCK_FAILED', username, null, null, req);
                return res.status(401).json({ error: 'Invalid password' });
            }
            
            console.debug('✅ Login successful for data export:', username, 'Role:', user.role);
            
            if (user.role !== 'system_admin') {
                logAudit('DATA_EXPORT_UNLOCK_DENIED', username, null, null, req);
                return res.status(403).json({ error: 'System Administrator privileges required' });
            }
            
            // Set session flags session should exist from express-session middleware
            if (!req.session) {
                console.error('❌ Session not available! Check express-session middleware configuration');
                return res.status(500).json({ error: 'Server configuration error: sessions not available' });
            }
            
            req.session.data_export_unlocked = true;
            req.session.data_export_unlock_time = new Date().toISOString();
            
            // Explicitly save session before responding
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Failed to save session:', saveErr);
                    return res.status(500).json({ error: 'Failed to save session' });
                }
                
                console.debug('✅ Data export unlocked for:', username);
                console.debug('✅ Session saved successfully');
                logAudit('DATA_EXPORT_UNLOCKED', username, null, null, req);
                
                res.json({
                    success: true,
                    message: 'Data export unlocked for 30 minutes',
                    expiresIn: 30
                });
            });
        });
    } catch (error) {
        console.error('Error unlocking data export:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== 4. FEEDBACK EXPORT ROUTES ====================

// GET /api/admin/data-export/feedback/full
// Export all feedback (no archive filter) with DECRYPTED emails
router.get('/feedback/full', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_FEEDBACK_FULL', username, 'data_export', null, req);
    
    try {
        const data = await getFeedbackData(null);
        
        // DECRYPT EMAILS before generating Excel
        data.feedback = decryptEmailsInFeedback(data.feedback);
        
        const xlsx = await generateFeedbackExcel(data, 'Full Feedback Export');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=feedback_full_' + getTimestamp() + '.csv');
        res.send(xlsx);
        
        console.log(`✅ Exported ${data.feedback.length} records with decrypted emails`);
    } catch (error) {
        console.error('Error exporting full feedback:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// GET /api/admin/data-export/feedback/not-archived
// Export not_archived feedback only with DECRYPTED emails
router.get('/feedback/not-archived', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_FEEDBACK_NOT_ARCHIVED', username, 'data_export', null, req);
    
    try {
        const data = await getFeedbackData('not_archived');
        
        // DECRYPT EMAILS before generating Excel
        data.feedback = decryptEmailsInFeedback(data.feedback);
        
        const xlsx = await generateFeedbackExcel(data, 'Not Archived Feedback Export');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=feedback_not_archived_' + getTimestamp() + '.csv');
        res.send(xlsx);
        
        console.log(`✅ Exported ${data.feedback.length} records with decrypted emails`);
    } catch (error) {
        console.error('Error exporting not-archived feedback:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// GET /api/admin/data-export/feedback/archived
// Export archived feedback only with DECRYPTED emails
router.get('/feedback/archived', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_FEEDBACK_ARCHIVED', username, 'data_export', null, req);
    
    try {
        const data = await getFeedbackData('archived');
        
        // DECRYPT EMAILS before generating Excel
        data.feedback = decryptEmailsInFeedback(data.feedback);
        
        const xlsx = await generateFeedbackExcel(data, 'Archived Feedback Export');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=feedback_archived_' + getTimestamp() + '.csv');
        res.send(xlsx);
        
        console.log(`✅ Exported ${data.feedback.length} records with decrypted emails`);
    } catch (error) {
        console.error('Error exporting archived feedback:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// ==================== 5. PHOTO EXPORT ROUTES ====================

// GET /api/admin/data-export/photos/all
// Export all photos
router.get('/photos/all', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_PHOTOS_ALL', username, 'data_export', null, req);
    
    try {
        await exportPhotos(res, null, 'All photos', username);
    } catch (error) {
        console.error('Error exporting all photos:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// GET /api/admin/data-export/photos/not-archived
// Export photos for not_archived feedback
router.get('/photos/not-archived', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_PHOTOS_NOT_ARCHIVED', username, 'data_export', null, req);
    
    try {
        await exportPhotos(res, 'not_archived', 'Not archived photos', username);
    } catch (error) {
        console.error('Error exporting not-archived photos:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// GET /api/admin/data-export/photos/archived
// Export photos for archived feedback
router.get('/photos/archived', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_PHOTOS_ARCHIVED', username, 'data_export', null, req);
    
    try {
        await exportPhotos(res, 'archived', 'Archived photos', username);
    } catch (error) {
        console.error('Error exporting archived photos:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// ==================== 6. AUDIT LOG EXPORT ROUTES ====================

// GET /api/admin/data-export/audit-log
// Export audit logs
router.get('/audit-log', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_AUDIT_LOG', username, 'data_export', null, req);
    
    try {
        const query = 'SELECT * FROM audit_logs ORDER BY created_at DESC';
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Audit log export failed:', err);
                return res.status(500).json({ error: 'Failed to export audit logs' });
            }
            
            const csv = convertToCSV(rows);
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=audit_log_' + getTimestamp() + '.csv');
            res.send(csv);
        });
    } catch (error) {
        console.error('Error exporting audit log:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// ==================== 7. SCHOOL IMPACT REPORT ROUTES ====================

// GET /api/admin/data-export/school-impact/csv
// Export a school-friendly impact report with anonymized pledge samples.
router.get('/school-impact/csv', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_SCHOOL_IMPACT_CSV', username, 'data_export', null, req);

    try {
        const report = await buildSchoolImpactReport();
        const csv = generateSchoolImpactCSV(report);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=school_impact_report_' + getTimestamp() + '.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting school impact CSV:', error);
        res.status(500).json({ error: 'School impact report export failed: ' + error.message });
    }
});

// GET /api/admin/data-export/school-impact/pdf
// Export a compact PDF summary suitable for staff sharing and FYP evidence.
router.get('/school-impact/pdf', requireDataExportUnlocked, requestLimit.heavyWork, async (req, res) => {
    const username = req.session.user.username;
    logAudit('DATA_EXPORT_SCHOOL_IMPACT_PDF', username, 'data_export', null, req);

    try {
        const report = await buildSchoolImpactReport();
        const pdf = generateSchoolImpactPDF(report);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=school_impact_report_' + getTimestamp() + '.pdf');
        res.send(pdf);
    } catch (error) {
        console.error('Error exporting school impact PDF:', error);
        res.status(500).json({ error: 'School impact report export failed: ' + error.message });
    }
});

function parseMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function readPledgeTopics() {
    try {
        const topics = JSON.parse(fs.readFileSync(pledgeTopicsPath, 'utf8'));
        if (Array.isArray(topics) && topics.length > 0) return topics;
    } catch (error) {
        console.warn('Using default pledge topics for school report:', error.message);
    }
    return DEFAULT_PLEDGE_TOPICS;
}

function getGroupFromMetadata(metadata) {
    return String(
        metadata.classGroup ||
        metadata.className ||
        metadata.schoolClass ||
        metadata.course ||
        metadata.department ||
        metadata.group ||
        'Not provided'
    ).trim() || 'Not provided';
}

function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

async function buildSchoolImpactReport() {
    const topics = readPledgeTopics();
    const topicLabels = new Map(topics.map(topic => [topic.value, topic.label]));
    const campaignGoal = Number(process.env.PULSE_CAMPAIGN_GOAL || 100);
    const safeGoal = Number.isFinite(campaignGoal) && campaignGoal > 0 ? campaignGoal : 100;

    const rows = await queryAll(`
        SELECT
            f.id,
            u.name,
            f.comment,
            f.metadata,
            f.photo_path,
            f.processed_photo_path,
            f.data_retention,
            f.created_at,
            COALESCE(like_counts.like_count, 0) AS like_count
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        LEFT JOIN (
            SELECT feedback_id, COUNT(*) AS like_count
            FROM pledge_likes
            GROUP BY feedback_id
        ) like_counts ON f.id = like_counts.feedback_id
        WHERE f.is_active = 1
          AND f.archive_status = 'not_archived'
        ORDER BY f.created_at DESC
    `);

    const report = {
        generatedAt: new Date().toISOString(),
        campaignGoal: safeGoal,
        stats: {
            feedbackCount: rows.length,
            pledgeCount: 0,
            feedbackOnlyCount: 0,
            approvedPledges: 0,
            pendingPledges: 0,
            rejectedPledges: 0,
            photoSubmissions: 0,
            pledgesThisMonth: 0,
            campaignProgressPercent: 0
        },
        topicBreakdown: [],
        classParticipation: [],
        samplePledges: []
    };

    const topicCounts = new Map();
    const classCounts = new Map();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    rows.forEach((row) => {
        const metadata = parseMetadata(row.metadata);
        const pledge = String(row.comment || '').trim();
        const hasPledge = Boolean(pledge) && metadata.pledgeSkipped !== true;
        const status = metadata.pledgeStatus || 'approved';
        const createdAt = row.created_at ? new Date(row.created_at) : null;

        if (row.photo_path || row.processed_photo_path) {
            report.stats.photoSubmissions++;
        }

        const groupName = getGroupFromMetadata(metadata);
        if (!classCounts.has(groupName)) {
            classCounts.set(groupName, {
                group: groupName,
                pledgeCount: 0,
                feedbackCount: 0,
                latestSubmission: row.created_at
            });
        }

        const group = classCounts.get(groupName);
        group.feedbackCount++;
        if (!group.latestSubmission || new Date(row.created_at) > new Date(group.latestSubmission)) {
            group.latestSubmission = row.created_at;
        }

        if (!hasPledge) {
            report.stats.feedbackOnlyCount++;
            return;
        }

        report.stats.pledgeCount++;
        if (status === 'pending') report.stats.pendingPledges++;
        if (status === 'rejected') report.stats.rejectedPledges++;
        if (status === 'approved') report.stats.approvedPledges++;

        if (createdAt && createdAt.getFullYear() === currentYear && createdAt.getMonth() === currentMonth) {
            report.stats.pledgesThisMonth++;
        }

        const topicValue = metadata.pledgeTopic || 'not-selected';
        const topicLabel = topicLabels.get(topicValue) || (topicValue === 'not-selected' ? 'Not Selected' : topicValue);
        topicCounts.set(topicLabel, (topicCounts.get(topicLabel) || 0) + 1);

        group.pledgeCount++;

        if (status === 'approved' && report.samplePledges.length < 10) {
            report.samplePledges.push({
                visitor: `Visitor ${report.samplePledges.length + 1}`,
                pledge,
                topic: topicLabel,
                submittedAt: row.created_at,
                likeCount: Number(row.like_count) || 0
            });
        }
    });

    report.stats.campaignProgressPercent = Math.min(100, Math.round((report.stats.pledgesThisMonth / safeGoal) * 100));
    report.topicBreakdown = Array.from(topicCounts.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
    report.classParticipation = Array.from(classCounts.values())
        .sort((a, b) => b.pledgeCount - a.pledgeCount || a.group.localeCompare(b.group))
        .slice(0, 12);

    return report;
}

function generateSchoolImpactCSV(report) {
    const rows = [
        ['School Impact Report'],
        ['Generated At', report.generatedAt],
        [],
        ['Summary Metric', 'Value'],
        ['Feedback Submissions', report.stats.feedbackCount],
        ['Feedback With Pledge Added', report.stats.pledgeCount],
        ['Feedback Without Pledge', report.stats.feedbackOnlyCount],
        ['Approved Pledges', report.stats.approvedPledges],
        ['Pending Pledges', report.stats.pendingPledges],
        ['Rejected Pledges', report.stats.rejectedPledges],
        ['Photo Submissions', report.stats.photoSubmissions],
        ['Pledges This Month', report.stats.pledgesThisMonth],
        ['Campaign Goal', report.campaignGoal],
        ['Campaign Progress %', report.stats.campaignProgressPercent],
        [],
        ['Common Topics', 'Pledge Count'],
        ...report.topicBreakdown.map(item => [item.topic, item.count]),
        [],
        ['Class/Course Participation', 'Pledge Count', 'Feedback Count', 'Latest Submission'],
        ...report.classParticipation.map(item => [item.group, item.pledgeCount, item.feedbackCount, item.latestSubmission || 'N/A']),
        [],
        ['Anonymized Sample Pledges', 'Topic', 'Submitted At', 'Likes'],
        ...report.samplePledges.map(item => [item.pledge, item.topic, item.submittedAt || 'N/A', item.likeCount])
    ];

    return convertToCSV(rows);
}

function formatReportDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
}

function addSectionLines(lines, title, rows) {
    lines.push(title);
    rows.forEach(row => lines.push(row));
    lines.push('');
}

function generateSchoolImpactPDF(report) {
    const lines = [];
    lines.push('School Impact Report');
    lines.push(`Generated: ${formatReportDate(report.generatedAt)}`);
    lines.push('');

    addSectionLines(lines, 'Summary', [
        `Feedback submissions: ${report.stats.feedbackCount}`,
        `Feedback with pledge added: ${report.stats.pledgeCount}`,
        `Feedback without pledge: ${report.stats.feedbackOnlyCount}`,
        `Approved pledges: ${report.stats.approvedPledges}`,
        `Pending pledges: ${report.stats.pendingPledges}`,
        `Photo submissions: ${report.stats.photoSubmissions}`,
        `Campaign progress: ${report.stats.pledgesThisMonth}/${report.campaignGoal} pledges (${report.stats.campaignProgressPercent}%)`
    ]);

    addSectionLines(lines, 'Common Topics', report.topicBreakdown.length
        ? report.topicBreakdown.map(item => `${item.topic}: ${item.count}`)
        : ['No pledge topics recorded yet.']);

    addSectionLines(lines, 'Class/Course Participation', report.classParticipation.length
        ? report.classParticipation.map(item => `${item.group}: ${item.pledgeCount} pledges, latest ${formatReportDate(item.latestSubmission)}`)
        : ['No class/course metadata recorded yet.']);

    addSectionLines(lines, 'Anonymized Sample Pledges', report.samplePledges.length
        ? report.samplePledges.map(item => `${item.visitor} (${item.topic}): ${item.pledge}`)
        : ['No approved pledges available for sampling.']);

    return createSimplePdf(lines);
}

function escapePdfText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

function wrapPdfLine(line, maxLength = 92) {
    const text = String(line || '');
    if (text.length <= maxLength) return [text];

    const words = text.split(/\s+/);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxLength && current) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    });

    if (current) lines.push(current);
    return lines;
}

function createSimplePdf(lines) {
    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 54;
    const topY = 790;
    const lineHeight = 16;
    const bottomY = 54;
    const pages = [];
    let currentPage = [];
    let y = topY;

    lines.forEach((line) => {
        const wrapped = line === '' ? [''] : wrapPdfLine(line);
        wrapped.forEach((wrappedLine) => {
            if (y < bottomY) {
                pages.push(currentPage);
                currentPage = [];
                y = topY;
            }
            currentPage.push({ text: wrappedLine, x: marginX, y });
            y -= line === '' ? 10 : lineHeight;
        });
    });

    if (currentPage.length) pages.push(currentPage);

    const objects = [];
    const addObject = (content) => {
        objects.push(content);
        return objects.length;
    };

    const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageObjectIds = [];

    pages.forEach((pageLines) => {
        const content = [
            'BT',
            '/F1 10 Tf',
            '14 TL',
            ...pageLines.map(line => `1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj`),
            'ET'
        ].join('\n');
        const contentObjectId = addObject(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
        const pageObjectId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
        pageObjectIds.push(pageObjectId);
    });

    const pagesObjectId = addObject(`<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`);
    pageObjectIds.forEach((id) => {
        objects[id - 1] = objects[id - 1].replace('/Parent 0 0 R', `/Parent ${pagesObjectId} 0 R`);
    });
    const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach(offset => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
}

// ==================== 8. HELPER FUNCTIONS - EMAIL DECRYPTION ====================

// Decrypt emails in feedback array
function decryptEmailsInFeedback(feedbackArray) {
    return feedbackArray.map(feedback => {
        if (feedback.email_encrypted && feedback.email_encrypted.trim() !== '') {
            try {
                // Decrypt the email using auth.decryptEmail
                const decryptedEmail = auth.decryptEmail(feedback.email_encrypted);
                
                // Replace encrypted email with decrypted one
                return {
                    ...feedback,
                    email_encrypted: decryptedEmail, // Replace with decrypted
                    email: decryptedEmail // Also set email field
                };
            } catch (error) {
                console.error(`❌ Failed to decrypt email for feedback ${feedback.feedback_id}:`, error.message);
                // Keep encrypted if decryption fails
                return {
                    ...feedback,
                    email_encrypted: '[Decryption Failed]',
                    email: '[Decryption Failed]'
                };
            }
        } else {
            // No email or empty email
            return {
                ...feedback,
                email_encrypted: 'No email provided',
                email: 'No email provided'
            };
        }
    });
}

// ==================== 8. HELPER FUNCTIONS - DATA RETRIEVAL ====================

// Get feedback data with optional archive filter
function getFeedbackData(archiveFilter) {
    return new Promise((resolve, reject) => {
        let query = `
            SELECT 
                f.id as feedback_id,
                f.user_id,
                u.name as user_name,
                u.email_encrypted,
                u.visit_count,
                u.created_at as user_created,
                u.last_visit as user_last_visit,
                f.comment,
                f.metadata,
                f.photo_path,
                f.processed_photo_path,
                f.data_retention,
                f.email_sent,
                f.email_sent_at,
                f.admin_notes,
                f.is_active,
                f.archive_status,
                f.created_at as feedback_created
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            WHERE f.is_active = 1
        `;
        
        if (archiveFilter) {
            query += ` AND f.archive_status = '${archiveFilter}'`;
        }
        
        query += ' ORDER BY f.created_at DESC';
        
        db.all(query, [], async (err, feedbackRows) => {
            if (err) {
                return reject(err);
            }
            
            // Get all questions
            const questionsQuery = 'SELECT * FROM questions ORDER BY display_order';
            db.all(questionsQuery, [], (err, questions) => {
                if (err) {
                    return reject(err);
                }
                
                // Get all answers
                const answersQuery = `
                    SELECT 
                        fa.feedback_id,
                        fa.question_id,
                        fa.answer_value,
                        q.question_text,
                        q.question_type
                    FROM feedback_answers fa
                    JOIN questions q ON fa.question_id = q.id
                `;
                
                db.all(answersQuery, [], (err, answers) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    // Organize answers by feedback_id
                    const answersByFeedback = {};
                    answers.forEach(answer => {
                        if (!answersByFeedback[answer.feedback_id]) {
                            answersByFeedback[answer.feedback_id] = [];
                        }
                        answersByFeedback[answer.feedback_id].push(answer);
                    });
                    
                    resolve({
                        feedback: feedbackRows,
                        questions: questions,
                        answersByFeedback: answersByFeedback
                    });
                });
            });
        });
    });
}

// Generate Excel file from feedback data

async function generateFeedbackExcel(data, title) {
    // Convert to CSV 
    const rows = [];
    
    // Build headers
    const headers = [
        'Feedback ID',
        'User Name',
        'Email',
        'Visit Count',
        'Comment/Pledge',
        'Data Retention',
        'Photo Path',
        'Processed Photo Path',
        'Email Sent',
        'Email Sent At',
        'Admin Notes',
        'Archive Status',
        'Created At'
    ];
    
    // Add question headers
    data.questions.forEach(q => {
        headers.push(`Q: ${q.question_text}`);
    });
    
    rows.push(headers);
    
    
    data.feedback.forEach(f => {
        const row = [
            f.feedback_id,
            f.user_name,
            f.email_encrypted || 'No email provided', 
            f.visit_count,
            f.comment || 'N/A',
            f.data_retention,
            f.photo_path || 'N/A',
            f.processed_photo_path || 'N/A',
            f.email_sent ? 'Yes' : 'No',
            f.email_sent_at || 'N/A',
            f.admin_notes || 'N/A',
            f.archive_status,
            f.feedback_created
        ];
        
        
        const feedbackAnswers = data.answersByFeedback[f.feedback_id] || [];
        data.questions.forEach(q => {
            const answer = feedbackAnswers.find(a => a.question_id === q.id);
            row.push(answer ? answer.answer_value : 'N/A');
        });
        
        rows.push(row);
    });
    
    return convertToCSV(rows);
}

// Export photos as ZIP
async function exportPhotos(res, archiveFilter, exportName, username) {
    return new Promise((resolve, reject) => {
        // Get feedback with photo paths
        let query = `
            SELECT 
                f.id,
                f.photo_path,
                f.processed_photo_path,
                f.archive_status
            FROM feedback f
            WHERE f.is_active = 1
        `;
        
        if (archiveFilter) {
            query += ` AND f.archive_status = '${archiveFilter}'`;
        }
        
        db.all(query, [], async (err, feedbackRows) => {
            if (err) {
                return reject(err);
            }
            
            const uploadsPath = paths.UPLOADS;
            
            // Count photos
            let rawCount = 0;
            let processedCount = 0;
            feedbackRows.forEach(f => {
                if (f.photo_path) rawCount++;
                if (f.processed_photo_path) processedCount++;
            });
            
            // Create readme content
            const readme = `Data Export: ${exportName}
Exported at: ${new Date().toISOString()}
Exported by: ${username} (role: system_admin)

Source directories:
  - uploads/photos/ -> /photos/raw/
  - uploads/processed/ -> /photos/processed/

Filter applied:
  - archive_status: ${archiveFilter || 'all'}

Number of feedback records: ${feedbackRows.length}
Number of photo files (raw): ${rawCount}
Number of photo files (processed): ${processedCount}

Notes:
- Contains personal/user data. Handle according to internal policies.
`;
            
            // Create ZIP archive
            const archive = createZipArchive({ zlib: { level: 9 } });
            
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename=photos_${archiveFilter || 'all'}_${getTimestamp()}.zip`);
            
            archive.on('error', (zipErr) => {
                console.error('❌ Photo ZIP export failed:', zipErr);
                res.destroy(zipErr);
                reject(zipErr);
            });
            res.on('finish', resolve);
            archive.pipe(res);
            
            // Add readme
            archive.append(readme, { name: 'readme.txt' });
            
            // Add photos
            feedbackRows.forEach(f => {
                if (f.photo_path) {
                    const rawPath = insideUploads(f.photo_path, uploadsPath); // <Jun Kai/> null when the stored path leaves the uploads folder
                    if (rawPath && fs.existsSync(rawPath)) {
                        archive.file(rawPath, { name: `photos/raw/${path.basename(f.photo_path)}` });
                    }
                }
                
                if (f.processed_photo_path) {
                    const processedPath = insideUploads(f.processed_photo_path, uploadsPath); // <Jun Kai/> null when the stored path leaves the uploads folder
                    if (processedPath && fs.existsSync(processedPath)) {
                        archive.file(processedPath, { name: `photos/processed/${path.basename(f.processed_photo_path)}` });
                    }
                }
            });
            
            archive.finalize();
        });
    });
}

// Convert array of objects to CSV
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    // If first row is array, treat as headers + data
    if (Array.isArray(data[0])) {
        return data.map(row => 
            row.map(cell => 
                csvCell(cell) // <Jun Kai/> backend/core/csv.js
            ).join(',')
        ).join('\n');
    }
    
    // Otherwise treat as array of objects
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
        headers.map(header => 
            csvCell(row[header]) // <Jun Kai/>
        ).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
}

// Get timestamp for filenames
function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
}

// Log audit action
function logAudit(action, adminUsername, targetType, targetId, req) {
    const ip = req ? req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress : 'unknown';
    const userAgent = req ? req.headers['user-agent'] : 'unknown';
    
    const query = `
        INSERT INTO audit_logs (action, admin_username, target_type, target_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [action, adminUsername, targetType, targetId, ip, userAgent], (err) => {
        if (err) console.error('Audit log failed:', err);
    });
}

// ==================== 12. MODULE EXPORTS ====================

module.exports = router;
