// Owner: Role 1, Zihan. Previous team: Preti (23), Nick (23), Caeden (9), XY (Xuanyang) (3), Nadhirah (2), Bernissa (2).
// ============================================================
// FEEDBACKROUTES.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
//
// DONE BY XY - FEEDBACK ROUTES BADGE, EMAIL AND PLEDGE AI SUMMARY
//  - Adds badge context into the combined thank-you/photo email.
//  - Supports the thank-you page social sharing state based on combined email queue status.
//  - Saves feedback submissions with long-term retention.
//  - Passes visit summary context into thank-you emails, including topic, retention, badge and tree leaf message.
//  - Adds the same visit summary context when retrying failed thank-you emails.
//  - Added pledge sentiment detection so negative pledges enter admin review while neutral/positive pledges auto-approve. (DONE BY XY)
//  - Uses school-safe rules + local AI pledge sentiment flow without requiring a personal online API key. (DONE BY XY)
//
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
// - Added admin-configurable feature flag checks for thank-you email sending. (DONE BY CAEDEN)
// - Added centralized validation rule enforcement for feedback submissions. (DONE BY CAEDEN)
//
// FIND COMMAND
//   rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// 
// 1. DEPENDENCIES & CONFIGURATION
//    const express                    - Express framework import (DONE BY PRETI)
//    const router                     - Express router instance (DONE BY PRETI)
//    const path                       - Path utilities (DONE BY PRETI)
//    const fs                         - File system operations (DONE BY PRETI)
//    const db                         - Database connection (DONE BY PRETI)
//    const emailService               - Email service utilities (DONE BY NADH)
//    const auth                       - Authentication and encryption utilities (DONE BY PRETI)
//
// 2. DIRECTORY SETUP
//    const uploadsDir                 - Upload directory for photos (DONE BY PRETI)
//    const processedDir               - Directory for processed photos (DONE BY PRETI)
//
// 3. QUESTION MANAGEMENT ROUTES
//    router.get('/questions'          - Get active questions for feedback form (DONE BY PRETI)
//
// 4. PHOTO UPLOAD ROUTES
//    router.post('/save-photo'        - Upload and save raw photo (DONE BY PRETI)
//    router.post('/save-processed-photo' - Save processed photo with overlay (DONE BY PRETI)
//
// 5. FEEDBACK SUBMISSION ROUTES
//    router.post('/submit-feedback'   - Submit complete feedback with retention and email (DONE BY PRETI)
//    router.post('/send-email'        - Send email endpoint (manual) (DONE BY PRETI)
//    router.post('/feedback/:id/retry-email' - Retry sending email for feedback entry (DONE BY PRETI)
//    router.post('/test-email'        - Test email endpoint (DONE BY PRETI)
//    router.get('/email-status'       - Check email service status (DONE BY PRETI)
//
// 6. DATABASE OPERATIONS
//    function isValidEmail()          - Validate email format (DONE BY PRETI)
//    function saveFeedbackToDatabase() - Save feedback to database with encrypted email (DONE BY PRETI)
//    function saveFeedbackRecord()    - Save feedback record (nested function) (DONE BY PRETI)
//    function saveQuestionAnswers()   - Save question answers (nested function) (DONE BY PRETI)
//
// 7. OVERLAY MANAGEMENT ROUTES
//    router.get('/overlays'           - Get all available overlay themes (DONE BY PRETI)
//
// 8. FORM UI CONFIGURATION
//    router.get('/form-ui'            - Get form UI settings (DONE BY NADH)
//
// 9. UTILITY ENDPOINTS
//    router.get('/test-db'            - Test database connection endpoint (DONE BY PRETI)
//    router.get('/'                   - Root endpoint for feedback routes (DONE BY PRETI)
//    router.get('/countdown-timer'    - Get countdown timer setting for photo capture (DONE BY BERNISSA)


const express = require('express');
const router = express.Router();
const path = require('path');
const paths = require('../../core/paths');
const fs = require('fs');
const db = require('../../core/db'); // Import database connection
const emailService = require('../email/service');
const auth = require('../../core/auth');
const { forLog, emailForLog } = require('../../core/log'); // <Jun Kai/> no line breaks from requests, emails masked
const requestLimit = require('../../core/requestLimit'); // <Jun Kai/> request limits per address
const { plainName } = require('../../core/photoFiles'); // <Jun Kai/> photo names from the kiosk are plain file names only
const parametersConfigStore = require('../parameters/store');
const { validateFeedbackSubmission } = require('./validationRules');
const { analyzePledgeSentiment } = require('./pledgeSentiment');
const lostFoundStore = require('../lostFound/store'); // changes made by nick
// <Jun Kai start>
const saveGate = require('../archive/saveGate');
const deletedCounts = require('../archive/deletedCounts');
const uploadsGate = require('../../core/uploadsGate'); // /uploads asks for a sign-in; a browser may still open the photos it just made
// <Jun Kai end>

function normalizeRetentionSelection(retention) {
    const normalized = String(retention || '').toLowerCase();

    if (normalized === '7days' || normalized === '7day') {
        return 'temporary';
    }

    if (normalized === 'indefinite') {
        return 'longterm';
    }

    return normalized;
}

const PASSPORT_TOPIC_LABELS = {
    'climate-change': 'Climate Champion',
    'renewable-energy': 'Renewable Innovator',
    'sustainable-living': 'Sustainable Living Advocate',
    'ocean-conservation': 'Ocean Guardian',
    'ethical-governance': 'Governance Guardian',
    'community-impact': 'Social Champion'
};

const PLEDGE_TOPIC_KEYS = new Set(Object.keys(PASSPORT_TOPIC_LABELS));

function normalizePledgeTopics(userData = {}) {
    const rawTopics = Array.isArray(userData.pledgeTopics)
        ? userData.pledgeTopics
        : (typeof userData.pledgeTopic === 'string' ? userData.pledgeTopic.split(',') : []);

    return [...new Set(rawTopics
        .map(topic => String(topic || '').trim())
        .filter(topic => PLEDGE_TOPIC_KEYS.has(topic)))];
}

function parseFeedbackMetadata(metadata) {
    if (!metadata || typeof metadata !== 'string') return {};
    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
}

function normalizePassportText(value) {
    return String(value || '').trim();
}

function maskEmailAddress(email) {
    const normalized = String(email || '').trim();
    const [local, domain] = normalized.split('@');
    if (!local || !domain) return '';
    const visibleLocal = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***`;
    return `${visibleLocal}@${domain}`;
}

function buildVisitorPassport(users, feedbackRows, email) {
    const safeUsers = Array.isArray(users) ? users : [];
    const safeRows = Array.isArray(feedbackRows) ? feedbackRows : [];
    const latestUser = safeUsers
        .slice()
        .sort((a, b) => new Date(b.last_visit || b.created_at || 0) - new Date(a.last_visit || a.created_at || 0))[0] || {};
    const badgeMap = new Map();
    const topics = new Set();
    let pledgeCount = 0;
    let photoCount = 0;
    let keepsakeCount = 0;

    safeRows.forEach((row) => {
        const metadata = parseFeedbackMetadata(row.metadata);
        const pledgeText = normalizePassportText(row.comment || metadata.pledge);
        const rowTopics = normalizePledgeTopics({
            pledgeTopic: metadata.pledgeTopic || '',
            pledgeTopics: metadata.pledgeTopics || []
        });
        const rowBadges = rowTopics.length > 0
            ? rowTopics.map(topic => ({
                topic,
                badge: emailService.getBadgeSummary({ pledge: pledgeText, pledgeTopic: topic })
            }))
            : [{
                topic: '',
                badge: emailService.getBadgeSummary({ pledge: pledgeText, pledgeTopic: '' })
            }];

        if (pledgeText) pledgeCount += 1;
        if (row.photo_path || row.processed_photo_path) photoCount += 1;
        if (Number(row.email_sent || 0) > 0 || row.processed_photo_path) keepsakeCount += 1;
        rowTopics.forEach(topic => topics.add(topic));

        rowBadges.forEach(({ topic, badge }) => {
            if (!badgeMap.has(badge.badgeKey)) {
                badgeMap.set(badge.badgeKey, {
                    key: badge.badgeKey,
                    name: badge.badgeName,
                    color: badge.badgeColor,
                    count: 0,
                    latestAt: row.created_at,
                    topics: new Set()
                });
            }

            const badgeEntry = badgeMap.get(badge.badgeKey);
            badgeEntry.count += 1;
            if (!badgeEntry.latestAt || new Date(row.created_at) > new Date(badgeEntry.latestAt)) {
                badgeEntry.latestAt = row.created_at;
            }
            if (topic && PASSPORT_TOPIC_LABELS[topic]) badgeEntry.topics.add(PASSPORT_TOPIC_LABELS[topic]);
        });
    });

    const feedbackCount = safeRows.length;
    const visitCount = Math.max(
        feedbackCount,
        safeUsers.reduce((sum, user) => sum + (Number(user.visit_count) || 0), 0)
    );
    const firstSeen = safeRows[0]?.created_at || latestUser.created_at || null;
    const lastSeen = safeRows[safeRows.length - 1]?.created_at || latestUser.last_visit || null;
    const stamps = [];

    if (feedbackCount > 0) {
        stamps.push({ key: 'feedback', label: 'Feedback Submitted', detail: `${feedbackCount} feedback submission${feedbackCount === 1 ? '' : 's'}` });
    }
    if (pledgeCount > 0) {
        stamps.push({ key: 'pledge', label: 'Pledge Shared', detail: `${pledgeCount} pledge${pledgeCount === 1 ? '' : 's'} shared` });
    }
    if (photoCount > 0 || keepsakeCount > 0) {
        stamps.push({ key: 'keepsake', label: 'Keepsake Collected', detail: `${Math.max(photoCount, keepsakeCount)} photo keepsake${Math.max(photoCount, keepsakeCount) === 1 ? '' : 's'}` });
    }
    if (visitCount >= 2 || feedbackCount >= 2) {
        stamps.push({ key: 'repeat', label: 'Repeat Visitor', detail: `${Math.max(visitCount, feedbackCount)} recorded visit${Math.max(visitCount, feedbackCount) === 1 ? '' : 's'}` });
    }
    if (topics.size >= 2) {
        stamps.push({ key: 'explorer', label: 'Topic Explorer', detail: `${topics.size} ESG topics explored` });
    }

    return {
        holderName: latestUser.name || safeRows[safeRows.length - 1]?.name || 'Visitor',
        maskedEmail: maskEmailAddress(email),
        visitCount,
        feedbackCount,
        pledgeCount,
        photoCount,
        firstSeen,
        lastSeen,
        stamps,
        badges: Array.from(badgeMap.values())
            .map((badge) => ({
                ...badge,
                topics: Array.from(badge.topics)
            }))
            .sort((a, b) => b.count - a.count || new Date(b.latestAt) - new Date(a.latestAt)),
        recentVisits: safeRows.slice(-5).reverse().map((row) => {
            const metadata = parseFeedbackMetadata(row.metadata);
            const pledgeText = normalizePassportText(row.comment || metadata.pledge);
            const rowTopics = normalizePledgeTopics({
                pledgeTopic: metadata.pledgeTopic || '',
                pledgeTopics: metadata.pledgeTopics || []
            });
            const rowBadges = emailService.getBadgeSummaries({
                pledge: pledgeText,
                pledgeTopic: metadata.pledgeTopic || '',
                pledgeTopics: rowTopics
            });
            const primaryBadge = rowBadges[0] || emailService.getBadgeSummary({
                pledge: pledgeText,
                pledgeTopic: metadata.pledgeTopic || ''
            });
            const topicLabels = rowTopics.map(topic => PASSPORT_TOPIC_LABELS[topic]).filter(Boolean);
            return {
                createdAt: row.created_at,
                badgeKey: primaryBadge.badgeKey,
                badgeName: rowBadges.map(badge => badge.badgeName).join(', ') || primaryBadge.badgeName,
                badgeColor: primaryBadge.badgeColor,
                badges: rowBadges,
                pledgeTopic: rowTopics[0] || metadata.pledgeTopic || '',
                pledgeTopics: rowTopics,
                topicLabel: topicLabels.join(', ') || 'General ESG feedback',
                pledgeSnippet: pledgeText.length > 90 ? `${pledgeText.slice(0, 87)}...` : pledgeText
            };
        })
    };
}
const sharp = require('sharp');

// ==================== 1. DIRECTORY SETUP ====================
// Ensure upload directories exist
const uploadsDir = path.join(paths.UPLOADS, 'photos');
const processedDir = path.join(paths.UPLOADS, 'processed');
const lostFoundUploadsDir = path.join(paths.UPLOADS, 'lost-found'); // Lost & Found item photos (DONE BY NICK)
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
}
if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
    console.log('Created processed directory:', processedDir);
}
if (!fs.existsSync(lostFoundUploadsDir)) { // Lost & Found item photo upload directory (DONE BY NICK)
    fs.mkdirSync(lostFoundUploadsDir, { recursive: true });
    console.log('Created Lost & Found uploads directory:', lostFoundUploadsDir);
}

function parsePhotoDataUrl(photo, fallbackMime = 'image/png') { // changes made by nick
    const match = String(photo || '').match(/^data:(image\/(?:png|gif|jpeg|webp));base64,(.+)$/);
    if (!match) {
        return {
            mimeType: fallbackMime,
            extension: fallbackMime === 'image/gif' ? 'gif' : fallbackMime === 'image/jpeg' ? 'jpg' : fallbackMime === 'image/webp' ? 'webp' : 'png',
            base64Data: String(photo || '').replace(/^data:image\/png;base64,/, '')
        };
    }

    const mimeType = match[1];
    return {
        mimeType,
        extension: mimeType === 'image/gif' ? 'gif' : mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png',
        base64Data: match[2]
    };
}

function sanitizeLostFoundPhotoName(name) { // Lost & Found photo filename cleanup (DONE BY NICK)
    return String(name || 'item-photo')
        .slice(0, 200) // <Jun Kai/> the patterns below get slow on a very long name; only 48 characters are kept anyway
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'item-photo';
}

async function saveLostFoundItemPhoto(report) { // Optional Lost & Found item photo upload (DONE BY NICK)
    const photoDataUrl = report.itemPhotoDataUrl || report.photoDataUrl || report.photo;
    if (!photoDataUrl) return {};

    const parsedPhoto = parsePhotoDataUrl(photoDataUrl);
    const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowedMimeTypes.has(parsedPhoto.mimeType)) {
        throw new Error('Lost & Found item photo must be PNG, JPEG, GIF, or WebP.');
    }

    const photoBuffer = Buffer.from(parsedPhoto.base64Data, 'base64');
    const maxBytes = 4 * 1024 * 1024;
    if (!photoBuffer.length) {
        throw new Error('Lost & Found item photo could not be read.');
    }
    if (photoBuffer.length > maxBytes) {
        throw new Error('Lost & Found item photo must be 4MB or smaller.');
    }

    const safeBaseName = sanitizeLostFoundPhotoName(report.itemPhotoName || report.photoName);
    const filename = `${safeBaseName}_${Date.now()}.${parsedPhoto.extension}`;
    const filepath = path.join(lostFoundUploadsDir, filename);
    await fs.promises.writeFile(filepath, photoBuffer);

    return {
        itemPhotoPath: `/uploads/lost-found/${filename}`,
        itemPhotoOriginalName: String(report.itemPhotoName || report.photoName || filename).slice(0, 255)
    };
}

function parseBoomerangFrameDataUrl(frame) { // Backend GIF frame parser - changes made by nick
    const parsedFrame = parsePhotoDataUrl(frame);
    if (!['image/png', 'image/jpeg'].includes(parsedFrame.mimeType)) {
        throw new Error('Boomerang frames must be PNG or JPEG images.');
    }

    return Buffer.from(parsedFrame.base64Data, 'base64');
}

async function buildBoomerangGifBuffer(frameDataUrls, delayMs) { // Backend animated GIF generation - changes made by nick
    if (!Array.isArray(frameDataUrls) || frameDataUrls.length < 2) {
        throw new Error('At least two boomerang frames are required.');
    }

    const safeDelayMs = Math.max(40, Math.min(300, Number(delayMs) || 90));
    const selectedFrames = frameDataUrls.slice(0, 24).map(parseBoomerangFrameDataUrl);
    const normalizedFrames = await Promise.all(selectedFrames.map(async (frameBuffer) => {
        return sharp(frameBuffer)
            .rotate()
            .png()
            .toBuffer();
    }));

    return sharp(normalizedFrames, { join: { animated: true } })
        .gif({
            delay: normalizedFrames.map(() => safeDelayMs),
            loop: 0,
            colours: 256,
            dither: 1,
            effort: 7,
            reuse: false,
            interFrameMaxError: 0,
            keepDuplicateFrames: true
        })
        .toBuffer();
}

// ==================== 2. QUESTION MANAGEMENT ROUTES ====================
// Get active questions for feedback form
router.get('/questions', (req, res) => {
    console.log('📋 Fetching active questions for feedback form...');
    
    const query = `
        SELECT 
            q.id,
            q.question_text,
            q.question_type,
            q.is_required,
            q.display_order,
            q.is_active,
            qo.id as option_id,
            qo.option_label,
            qo.display_order as option_order
        FROM questions q
        LEFT JOIN question_options qo ON q.id = qo.question_id
        WHERE q.is_active = 1
        ORDER BY q.display_order ASC, qo.display_order ASC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching questions:', err);
            return res.json({
                success: true,
                questions: []
            });
        }
        
        // Group questions and their options
        const questionsMap = new Map();
        
        rows.forEach(row => {
            if (!questionsMap.has(row.id)) {
                questionsMap.set(row.id, {
                    id: row.id,
                    question_text: row.question_text,
                    question_type: row.question_type,
                    is_required: row.is_required === 1,
                    display_order: row.display_order,
                    is_active: row.is_active === 1,
                    options: []
                });
            }
            
            // Add option if it exists (for choice questions)
            if (row.option_id && row.option_label) {
                const question = questionsMap.get(row.id);
                question.options.push({
                    id: row.option_id,
                    option_label: row.option_label,
                    display_order: row.option_order
                });
            }
        });
        
        const questions = Array.from(questionsMap.values());
        
        console.log(`✅ Found ${questions.length} active questions for feedback form`);
        
        res.json({
            success: true,
            questions: questions
        });
    });
});

// ==================== 3. PHOTO UPLOAD ROUTES ====================
// Upload and save raw photo
router.post('/save-photo', requestLimit.kioskForms, (req, res) => {
    try {
        const { photo, userName, device } = req.body;
        // Enforce capture feature flags and photo size validation before saving raw photos (DONE BY CAEDEN)
        const { featureFlags, validationRules } = parametersConfigStore.readParametersConfig();
        const captureEnabled = device === 'mobile'
            ? featureFlags.photoUploadEnabled !== false
            : featureFlags.cameraCaptureEnabled !== false;

        if (!captureEnabled) {
            return res.status(403).json({ error: 'Photo capture is disabled by feature flag' });
        }
        
        if (!photo) {
            return res.status(400).json({ error: 'No photo data provided' });
        }

        // Convert base64 to buffer - changes made by nick
        const parsedPhoto = parsePhotoDataUrl(photo);
        const buffer = Buffer.from(parsedPhoto.base64Data, 'base64');
        const maxBytes = (Number(validationRules.maxPhotoFileSizeMb) || 5) * 1024 * 1024;
        if (buffer.length > maxBytes) {
            return res.status(400).json({ error: `Photo exceeds ${validationRules.maxPhotoFileSizeMb || 5}MB limit` });
        }

        // Generate filename with user name, device, and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeUserName = userName ? userName.replace(/[^a-zA-Z0-9]/g, '_') : 'anonymous';
        // <Jun Kai start> only letters, digits, - and _ from the request reach the file name, so it cannot leave the folder
        const safeDevice = String(device || 'device').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${safeUserName}_${safeDevice}_${timestamp}.${parsedPhoto.extension}`;
        // <Jun Kai end>
        const filepath = path.join(uploadsDir, filename);

        // Save the file
        fs.writeFileSync(filepath, buffer);

        console.log(`Photo saved to: ${forLog(filepath)}`); // <Jun Kai/>
        uploadsGate.remember(req, `photos/${filename}`); // <Jun Kai/> for the photo download on the thank-you page
        
        res.json({ 
            success: true, 
            message: 'Photo saved successfully',
            filename: filename,
            photoId: filename,
            filepath: filepath,
            device: device
        });
    } catch (error) {
        console.error('Error saving photo:', error);
        res.status(500).json({ error: 'Failed to save photo' });
    }
});

// Save processed photo with overlay
router.post('/save-processed-photo', requestLimit.kioskForms, async (req, res) => {
    try {
        const { photo, boomerangFrames, boomerangFrameDelayMs, userName, device, theme, captureMode, expectedFormat } = req.body;
        // Enforce capture feature flags and photo size validation before saving processed photos (DONE BY CAEDEN)
        const { featureFlags, validationRules } = parametersConfigStore.readParametersConfig();
        const captureEnabled = device === 'mobile'
            ? featureFlags.photoUploadEnabled !== false
            : featureFlags.cameraCaptureEnabled !== false;

        if (!captureEnabled) {
            return res.status(403).json({ error: 'Photo processing is disabled by feature flag' });
        }
        
        const requiresGif = captureMode === 'boomerang' || expectedFormat === 'gif'; // changes made by nick
        if (!photo && !requiresGif) {
            return res.status(400).json({ error: 'No processed photo data provided' });
        }

        const configuredMaxBytes = (Number(validationRules.maxPhotoFileSizeMb) || 5) * 1024 * 1024;
        let buffer;
        let extension;
        let mimeType;

        if (requiresGif) {
            if (Array.isArray(boomerangFrames) && boomerangFrames.length >= 2) {
                buffer = await buildBoomerangGifBuffer(boomerangFrames, boomerangFrameDelayMs);
                extension = 'gif';
                mimeType = 'image/gif';
            } else {
                const parsedPhoto = parsePhotoDataUrl(photo, 'image/gif');
                if (parsedPhoto.mimeType !== 'image/gif') {
                    return res.status(400).json({
                        success: false,
                        error: 'Boomerang keepsakes must be saved from animation frames or uploaded as animated GIF files.'
                    });
                }
                buffer = Buffer.from(parsedPhoto.base64Data, 'base64');
                extension = 'gif';
                mimeType = parsedPhoto.mimeType;
            }
        } else {
            // Convert base64 to buffer for normal processed PNG/JPEG photos - changes made by nick
            const parsedPhoto = parsePhotoDataUrl(photo);
            buffer = Buffer.from(parsedPhoto.base64Data, 'base64');
            extension = parsedPhoto.extension;
            mimeType = parsedPhoto.mimeType;
        }

        const maxBytes = mimeType === 'image/gif'
            ? Math.max(configuredMaxBytes, 15 * 1024 * 1024)
            : configuredMaxBytes; // Allow email-friendly animated boomerang GIFs - changes made by nick
        if (buffer.length > maxBytes) {
            const limitMb = Math.round(maxBytes / (1024 * 1024));
            return res.status(400).json({ error: `Processed photo exceeds ${limitMb}MB limit` });
        }

        // Generate filename for processed photo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeUserName = userName ? userName.replace(/[^a-zA-Z0-9]/g, '_') : 'anonymous';
        // <Jun Kai start> only letters, digits, - and _ from the request reach the file name, so it cannot leave the folder
        const safeDevice = String(device || 'device').replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeTheme = String(theme || 'theme').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${safeUserName}_${safeDevice}_${safeTheme}_processed_${timestamp}.${extension}`;
        // <Jun Kai end>
        const filepath = path.join(processedDir, filename);

        // Save the processed file
        fs.writeFileSync(filepath, buffer);

        console.log(`Processed photo saved to: ${forLog(filepath)}`); // <Jun Kai/>
        uploadsGate.remember(req, `processed/${filename}`); // <Jun Kai/>
        
        res.json({ 
            success: true, 
            message: 'Processed photo saved successfully',
            filename: filename,
            processedPhotoId: filename,
            filepath: filepath,
            device: device,
            theme: theme
        });
    } catch (error) {
        console.error('Error saving processed photo:', error);
        res.status(500).json({ error: 'Failed to save processed photo' });
    }
});

// ==================== 4. FEEDBACK SUBMISSION ROUTES ====================
// Save a Lost & Found report without interrupting feedback progress - changes made by nick
router.post('/lost-found', requestLimit.kioskForms, async (req, res) => {
    const body = req.body || {};
    const report = body.report || body;

    let itemPhoto = {};
    try {
        itemPhoto = await saveLostFoundItemPhoto(report); // Store optional item photo before creating report (DONE BY NICK)
    } catch (photoError) {
        console.error('Error saving Lost & Found item photo:', photoError);
        return res.status(400).json({ success: false, error: photoError.message });
    }

    lostFoundStore.createLostFoundReport({
        type: report.type,
        item: report.item,
        location: report.location,
        contact: report.contact,
        details: report.details,
        itemPhotoPath: itemPhoto.itemPhotoPath,
        itemPhotoOriginalName: itemPhoto.itemPhotoOriginalName,
        currentPage: report.activePageId || report.currentPage,
        feedbackProgress: body.feedbackProgress
    }, (err, result) => {
        if (err) {
            console.error('Error saving Lost & Found report:', err);
            return res.status(400).json({ success: false, error: err.message });
        }

        if (typeof emailService.sendLostFoundAlertEmail === 'function') { // Staff notification for new Lost & Found report (DONE BY NICK)
            setImmediate(() => {
                emailService.sendLostFoundAlertEmail(result.report).catch((emailError) => {
                    console.warn('Lost & Found alert email was not sent:', emailError.message);
                });
            });
        }

        res.json({
            success: true,
            reportId: result.id,
            trackingCode: result.trackingCode,
            itemPhotoPath: itemPhoto.itemPhotoPath || null,
            message: `Lost & Found report saved. Tracking code: ${result.trackingCode}.`
        });
    });
});

// Submit complete feedback with retention and email
router.post('/submit-feedback', requestLimit.kioskForms, async (req, res) => {
    const startTime = Date.now();
    const requestBody = req.body || {};
    const userData = requestBody.userData || {};
    // <Jun Kai start> an email longer than any real one (254 characters) is refused before a pattern looks at it: a very
    // long made-up address makes the email pattern slow enough to hold up the whole server
    if (typeof userData.email === 'string' && userData.email.length > 254) {
        return res.status(400).json({ success: false, message: 'Feedback validation failed', errors: [{ field: 'email', message: 'Email format is invalid.' }] });
    }
    // <Jun Kai end>
    const device = requestBody.device || 'unknown';
    const theme = requestBody.theme || 'unknown';
    requestBody.retention = 'longterm';
    const retention = requestBody.retention;
    
    try {
        const normalizedRetention = normalizeRetentionSelection(retention);
        // Centralized feature flag and validation rule enforcement for feedback submission (DONE BY CAEDEN)
        const parameterConfig = parametersConfigStore.readParametersConfig();
        const featureFlags = parameterConfig.featureFlags || {};
        const validationRules = parameterConfig.validationRules || {};
        const validation = validateFeedbackSubmission(requestBody, validationRules, featureFlags);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Feedback validation failed',
                errors: validation.errors
            });
        }

          // A visitor cannot skip the pledge while the pledge step is on, so the flag only counts when it is off.
        const pledgeStepSkipped = Boolean(userData.pledgeSkipped) && featureFlags.pledgeEnabled === false;
        const normalizedPledgeTopics = pledgeStepSkipped ? [] : normalizePledgeTopics(userData);
        userData.pledgeTopics = normalizedPledgeTopics;
        userData.pledgeTopic = normalizedPledgeTopics[0] || '';

        const dailyLimitCheck = await checkDailySubmissionLimit(userData.email, validationRules);
        if (!dailyLimitCheck.allowed) {
            return res.status(429).json({
                success: false,
                message: `Daily feedback limit reached for this email. You can submit ${dailyLimitCheck.limit} feedback form${dailyLimitCheck.limit === 1 ? '' : 's'} per day.`,
                errors: [{
                    field: 'email',
                    message: `This email has already submitted ${dailyLimitCheck.usedToday} feedback form${dailyLimitCheck.usedToday === 1 ? '' : 's'} today. Please try again tomorrow.`
                }],
                dailyLimit: dailyLimitCheck
            });
        }
        
        console.log('📝 Feedback submitted:', {
            userName: userData.name,
            email: userData.email,
            device: device,
            theme: theme,
            retention: normalizedRetention
        });

        const badgeSummaries = emailService.getBadgeSummaries(userData);
        const badgeSummary = badgeSummaries[0] || emailService.getBadgeSummary(userData);

        // Include visitor number for the thank-you milestone panel - changes made by nick
        const visitorNumber = await getActiveFeedbackCountForVisitorNumber();

        // 1. IMMEDIATELY send success response to user (within milliseconds)
        const responseData = {
            success: true, 
            message: 'Feedback submitted successfully',
            data: {
                userName: userData.name,
                email: userData.email,
                device: device,
                theme: theme,
                retention: normalizedRetention,
                submittedAt: new Date().toISOString(),
                emailQueued: false,
                badgeKey: badgeSummary.badgeKey,
                badgeName: badgeSummaries.map(badge => badge.badgeName).join(', ') || badgeSummary.badgeName,
                badgeColor: badgeSummary.badgeColor,
                badgeKeys: badgeSummaries.map(badge => badge.badgeKey),
                badges: badgeSummaries,
                visitorNumber
            }
        };
        
        // Check if the combined visitor email should be queued. Photo is optional; badge/passport details still send without it.
        const shouldQueueEmail = isValidEmail(userData.email) &&
            (featureFlags.thankYouEmailEnabled !== false || featureFlags.badgeEmailEnabled !== false);
        
        if (shouldQueueEmail) {
            responseData.data.emailQueued = true;
            responseData.data.emailQueuedMessage = 'Combined thank-you and visitor passport email will be sent shortly';
            responseData.data.combinedEmailQueued = true;
        }
        
        // Send the visitor response before background database and email work. (DONE BY CAEDEN)
        res.json(responseData);
        const responseTime = Date.now() - startTime;
        console.log(`✅ Response sent in ${responseTime}ms`);
        
        // 2. AFTER sending response, process database and background thank-you email
        setTimeout(async () => {
            console.log('🔄 Background processing started...');
            const bgStartTime = Date.now();
            // <Jun Kai start>
            // an archive deleting old visitors backs off until this save is done, so a returning visitor is never lost mid-save
            const saveDone = await saveGate.enterSave();
            // <Jun Kai end>

            try {
                saveFeedbackToDatabase(userData, device, theme, normalizedRetention, async (error, result) => {
                    // <Jun Kai start>
                    saveDone();
                    // <Jun Kai end>
                    if (error) {
                        console.error('❌ Error saving to database:', error);
                        return;
                    }
                    
                    console.log('✅ Feedback saved to database:', result);
                    const bgTime = Date.now() - bgStartTime;
                    console.log(`🔄 Database completed in ${bgTime}ms`);
                    
                    // Send combined visitor email AFTER database is committed.
                    if (shouldQueueEmail && result && result.feedbackId) {
                        const photoToSend = plainName(userData.processedPhotoId) || plainName(userData.photoId) || null; // <Jun Kai/> never a path out of the uploads folder
                        
                        console.log(`📧 Starting thank-you email for ${emailForLog(userData.email)}...`); // <Jun Kai/>
                        
                        setImmediate(async () => {
                            try {
                                const emailResult = await emailService.sendThankYouEmail(
                                    userData.name,
                                    userData.email,
                                    photoToSend,
                                    userData.pledge || '',
                                    {
                                        visitDate: new Date().toISOString(),
                                        pledgeTopic: userData.pledgeTopic || '',
                                        pledgeTopics: userData.pledgeTopics || [],
                                        retention: normalizedRetention,
                                        includeBadge: featureFlags.badgeEmailEnabled !== false,
                                        badgeKey: badgeSummary.badgeKey,
                                        badgeName: badgeSummary.badgeName,
                                        badgeNames: badgeSummaries.map(badge => badge.badgeName).join(', '),
                                        badgeColor: badgeSummary.badgeColor,
                                        badgeKeys: badgeSummaries.map(badge => badge.badgeKey),
                                        badges: badgeSummaries,
                                        treeLeafMessage: 'Your virtual leaf has been added to the RP Xperience Centre digital tree.'
                                    }
                                );
                                
                                if (emailResult.success) {
                                    console.log(`✅ Thank-you email sent to ${emailForLog(userData.email)}`); // <Jun Kai/>
                                    
                                    // Update email flag (separate query, non-blocking)
                                    db.run(
                                        'UPDATE feedback SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                                        [result.feedbackId],
                                        function(err) {
                                            if (err) {
                                                console.error(`⚠️ Email flag update failed:`, err.message);
                                            } else {
                                                console.log(`✅ Email flag updated for feedback ${result.feedbackId}`);
                                            }
                                        }
                                    );
                                } else {
                                    console.error(`❌ Thank-you email failed:`, emailResult.error);
                                }
                            } catch (emailError) {
                                console.error(`❌ Thank-you email exception:`, emailError.message);
                            }
                        });
                    }
                });
            } catch (err) {
                // <Jun Kai start>
                saveDone();
                // <Jun Kai end>
                console.error('❌ Background error:', err);
            }
        }, 0);

        
    } catch (error) {
        console.error('❌ Error in submit-feedback:', error);
        // Even on error, return success to user quickly
        const errorResponseTime = Date.now() - startTime;
        console.log(`⚠️ Error response sent in ${errorResponseTime}ms`);
        
        res.status(500).json({ 
            success: false, 
            message: 'Feedback could not be submitted. Please try again.',
            error: error.message
        });
    }
});

// Send email endpoint (manual)
router.post('/send-email', auth.requireAuth, async (req, res) => { // <Jun Kai/> signed-in admins only: it sends mail to any address
    try {
        const { name, email, photoFilename, pledgeText } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name or email'
            });
        }
        
        console.log(`📧 Manual email request for ${emailForLog(email)} with photo ${forLog(photoFilename)}`); // <Jun Kai/>

        const result = await emailService.sendEmailAndUpdateFlag(
        db,
        name,
        email,
        photoFilename,
        pledgeText || ''
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Email sent successfully',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send email',
                details: result.error
            });
        }
        
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Retry sending email for feedback entry
router.post('/feedback/:id/retry-email', auth.requireAuth, async (req, res) => { // <Jun Kai/> signed-in admins only
    const { id } = req.params;
    
    const query = `
        SELECT f.*, u.name, u.email_encrypted 
        FROM feedback f 
        JOIN users u ON f.user_id = u.id 
        WHERE f.id = ?
    `;
    
    db.get(query, [id], async (err, feedback) => {
        if (err || !feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }
        
        if (!feedback.email_encrypted) {
            return res.status(400).json({ error: 'No email address' });
        }
        
        // Decrypt email for sending
        let email;
        try {
            email = auth.decryptEmail(feedback.email_encrypted);
        } catch (error) {
            console.error('❌ Failed to decrypt email:', error);
            return res.status(500).json({ error: 'Failed to decrypt email' });
        }
        
        const photoFilename = feedback.processed_photo_path 
            ? feedback.processed_photo_path.split('/').pop()
            : feedback.photo_path ? feedback.photo_path.split('/').pop() : null;
        
        try {
            let metadata = {};
            try {
                metadata = feedback.metadata ? JSON.parse(feedback.metadata) : {};
            } catch {
                metadata = {};
            }

            const retryPledgeTopics = normalizePledgeTopics({
                pledgeTopic: metadata.pledgeTopic || '',
                pledgeTopics: metadata.pledgeTopics || []
            });
            const retryBadges = emailService.getBadgeSummaries({
                pledge: feedback.comment || metadata.pledge || '',
                pledgeTopic: metadata.pledgeTopic || '',
                pledgeTopics: retryPledgeTopics
            });
            const retryBadgeSummary = retryBadges[0] || emailService.getBadgeSummary({
                pledge: feedback.comment || metadata.pledge || '',
                pledgeTopic: metadata.pledgeTopic || ''
            });
            const parameterConfig = parametersConfigStore.readParametersConfig();
            const retryFeatureFlags = parameterConfig.featureFlags || {};

            const emailResult = await emailService.sendThankYouEmail(
                feedback.name,
                email,
                photoFilename,
                feedback.comment || metadata.pledge || '',
                {
                    visitDate: feedback.created_at,
                    pledgeTopic: metadata.pledgeTopic || '',
                    pledgeTopics: retryPledgeTopics,
                    retention: feedback.data_retention || metadata.retention || '',
                    includeBadge: retryFeatureFlags.badgeEmailEnabled !== false,
                    badgeKey: retryBadgeSummary.badgeKey,
                    badgeName: retryBadgeSummary.badgeName,
                    badgeNames: retryBadges.map(badge => badge.badgeName).join(', '),
                    badgeColor: retryBadgeSummary.badgeColor,
                    badgeKeys: retryBadges.map(badge => badge.badgeKey),
                    badges: retryBadges,
                    treeLeafMessage: 'Your virtual leaf has been added to the RP Xperience Centre digital tree.'
                }
            );
            
            if (emailResult.success) {
                db.run(
                    'UPDATE feedback SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [id],
                    (err) => {
                        res.json({
                            success: true,
                            emailSent: true,
                            flagUpdated: !err
                        });
                    }
                );
            } else {
                res.json({
                    success: false,
                    error: emailResult.error
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

// Test email endpoint
// <Jun Kai start> signed-in admins only, and a POST: a GET could be started from a link on another site
router.post('/test-email', auth.requireAuth, async (req, res) => {
    try {
        const testEmail = (req.body && req.body.email) || 'test@example.com';
// <Jun Kai end>
        
        console.log('🧪 Testing email service...');
        
        const result = await emailService.testEmailService(testEmail);
        
        res.json({
            success: result.success,
            message: result.success ? 'Email service test completed' : 'Email service test failed',
            data: result
        });
        
    } catch (error) {
        console.error('Error testing email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test email service',
            details: error.message
        });
    }
});

// Check email service status
router.get('/email-status', async (req, res) => {
    try {
        const status = await emailService.checkEmailService();
        
        res.json({
            success: status.available,
            data: status
        });
        
    } catch (error) {
        console.error('Error checking email status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check email service status'
        });
    }
});

// Visitor-facing passport mapped by submitted email address.
router.post('/visitor-passport', requestLimit.visitorLookup, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    db.all(
        `SELECT id, name, email_encrypted, visit_count, created_at, last_visit
         FROM users
         WHERE email_encrypted IS NOT NULL
           AND email_encrypted != ''`,
        [],
        (userErr, users) => {
            if (userErr) {
                console.error('Visitor passport user lookup failed:', userErr);
                return res.status(500).json({ success: false, error: 'Failed to load visitor passport' });
            }

            const matchingUsers = (users || []).filter((user) => {
                const decrypted = auth.tryDecryptEmail
                    ? auth.tryDecryptEmail(user.email_encrypted)
                    : (() => {
                        try {
                            return auth.decryptEmail(user.email_encrypted);
                        } catch {
                            return null;
                        }
                    })();
                return decrypted && decrypted.toLowerCase() === email;
            });

            if (matchingUsers.length === 0) {
                return res.json({
                    success: true,
                    passport: null,
                    message: 'No previous passport records found for this email yet.'
                });
            }

            const userIds = matchingUsers.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');
            db.all(
                `
                SELECT
                    f.id,
                    f.user_id,
                    u.name,
                    f.comment,
                    f.metadata,
                    f.photo_path,
                    f.processed_photo_path,
                    f.email_sent,
                    f.created_at
                FROM feedback f
                JOIN users u ON f.user_id = u.id
                WHERE f.user_id IN (${placeholders})
                  AND f.is_active = 1
                  AND f.archive_status = 'not_archived'
                ORDER BY f.created_at ASC, f.id ASC
                `,
                userIds,
                (feedbackErr, rows) => {
                    if (feedbackErr) {
                        console.error('Visitor passport feedback lookup failed:', feedbackErr);
                        return res.status(500).json({ success: false, error: 'Failed to load visitor passport' });
                    }

                    return res.json({
                        success: true,
                        generatedAt: new Date().toISOString(),
                        passport: buildVisitorPassport(matchingUsers, rows || [], email)
                    });
                }
            );
        }
    );
});

// ==================== 5. DATABASE OPERATIONS ====================

// Validate email format
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    if (email.length > 254) return false; // <Jun Kai/> no real email is longer, and a very long one makes the pattern slow
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Count active feedback rows to estimate the current visitor number - changes made by nick
function getActiveFeedbackCountForVisitorNumber() {
    return new Promise((resolve) => {
        // <Jun Kai start>
        // live feedback plus the feedback that archives and deletes removed, read in one statement (deletedCounts.js), so a
        // visitor number is never handed out twice; without the deleted_record_counts table it falls back to the count below
        db.get(deletedCounts.VISITOR_NUMBER_SQL, [], (totalErr, totalRow) => {
            const total = Number(totalRow?.count);
            if (!totalErr && Number.isFinite(total)) return resolve(total + 1);
            if (totalErr && !['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(totalErr.code)) return resolve(null);
        // <Jun Kai end>
        db.get('SELECT COUNT(*) AS count FROM feedback WHERE is_active = 1', [], (err, row) => {
            if (err) {
                db.get('SELECT COUNT(*) AS count FROM feedback', [], (fallbackErr, fallbackRow) => {
                    if (fallbackErr) {
                        console.warn('Visitor number count unavailable:', fallbackErr.message);
                        resolve(null);
                        return;
                    }

                    const fallbackCount = Number(fallbackRow?.count);
                    resolve(Number.isFinite(fallbackCount) ? fallbackCount + 1 : null);
                });
                return;
            }

            const count = Number(row?.count);
            resolve(Number.isFinite(count) ? count + 1 : null);
        });
        // <Jun Kai start>
        });
        // <Jun Kai end>
    });
}

function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getDailySubmissionLimit(validationRules = {}) {
    const configuredLimit = Number(validationRules.dailySubmissionLimitPerEmail ?? 1);
    if (!Number.isFinite(configuredLimit)) return 1;
    return Math.max(0, Math.floor(configuredLimit));
}

async function findUsersByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) return [];

    const users = await dbAllAsync(
        `SELECT id, name, email_encrypted, visit_count, created_at, last_visit
         FROM users
         WHERE email_encrypted IS NOT NULL
           AND email_encrypted != ''`,
        []
    );

    return users.filter((user) => {
        const decrypted = auth.tryDecryptEmail
            ? auth.tryDecryptEmail(user.email_encrypted)
            : (() => {
                try {
                    return auth.decryptEmail(user.email_encrypted);
                } catch {
                    return null;
                }
            })();

        return decrypted && decrypted.toLowerCase() === normalizedEmail;
    });
}

async function checkDailySubmissionLimit(email, validationRules = {}) {
    const limit = getDailySubmissionLimit(validationRules);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (limit <= 0 || !isValidEmail(normalizedEmail)) {
        return { allowed: true, limit, usedToday: 0 };
    }

    const matchingUsers = await findUsersByEmail(normalizedEmail);
    if (matchingUsers.length === 0) {
        return { allowed: true, limit, usedToday: 0 };
    }

    const userIds = matchingUsers.map(user => user.id);
    const placeholders = userIds.map(() => '?').join(',');
    const row = await dbGetAsync(
        `
        SELECT COUNT(*) AS count
        FROM feedback
        WHERE user_id IN (${placeholders})
          AND is_active = 1
          AND (archive_status = 'not_archived' OR archive_status IS NULL)
          AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
        `,
        userIds
    );
    const usedToday = Number(row?.count || 0);

    return {
        allowed: usedToday < limit,
        limit,
        usedToday
    };
}

// Save feedback to database with encrypted email
function saveFeedbackToDatabase(userData, device, theme, retention, callback) {
    console.log('💾 Saving feedback with pledge and retention:', {
        userName: userData.name,
        hasEmail: !!userData.email,
        pledge: userData.pledge,
        retention: retention,
        pledgeLength: userData.pledge ? userData.pledge.length : 0
    });
    
    // Find user by email
    db.all('SELECT * FROM users WHERE email_encrypted IS NOT NULL', [], (err, allUsers) => {
        if (err) {
            console.error('Error fetching users:', err);
            return callback(err);
        }
        
        // Try to find matching user by decrypting emails. A returning visitor is the same email AND the same
        // name: a different name typed with an email already used (a family or class sharing one email, or a
        // test) is its own visitor, so its leaf on the 2D and 3D trees, the pledge board and the admin lists
        // show the name typed on that form, not the first one. The passport and the daily limit still gather
        // every visitor with that email (findUsersByEmail). (Wei Jie)
        const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        let user = null;
        if (userData.email) {
            for (const u of allUsers) {
                try {
                    // Quietly skip old undecryptable emails during duplicate lookup. (Done by Caeden)
                    const decryptedEmail = auth.tryDecryptEmail
                        ? auth.tryDecryptEmail(u.email_encrypted)
                        : auth.decryptEmail(u.email_encrypted);
                    if (decryptedEmail && decryptedEmail.toLowerCase() === userData.email.toLowerCase()
                        && sameName(u.name, userData.name)) {
                        user = u;
                        break;
                    }
                } catch (error) {
                    // Skip invalid encrypted emails
                    continue;
                }
            }
        }
        
        if (!user) {
            // Create new user with encrypted email
            let encryptedEmail = null;
            if (userData.email && isValidEmail(userData.email)) {
                try {
                    encryptedEmail = auth.encryptEmail(userData.email);
                    console.log('🔒 Email encrypted for new user');
                } catch (error) {
                    console.error('❌ Email encryption failed:', error);
                    return callback(new Error('Email encryption failed'));
                }
            }
            
            db.run(
                'INSERT INTO users (name, email_encrypted, visit_count, last_visit) VALUES (?, ?, 1, CURRENT_TIMESTAMP)',
                [userData.name, encryptedEmail],
                function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return callback(err);
                    }
                    const userId = this.lastID;
                    console.log(`✅ Created new user with ID: ${userId}${encryptedEmail ? ' (email encrypted)' : ''}`);
                    saveFeedbackRecord(userId);
                }
            );
        } else {
            // Update existing user
            let updateQuery, params;
            let encryptedEmail = null;
            
            if (user.email_encrypted) {
                // User already has encrypted email
                updateQuery = 'UPDATE users SET visit_count = visit_count + 1, last_visit = CURRENT_TIMESTAMP WHERE id = ?';
                params = [user.id];
            } else if (userData.email && isValidEmail(userData.email)) {
                // Encrypt email for existing user
                try {
                    encryptedEmail = auth.encryptEmail(userData.email);
                    updateQuery = 'UPDATE users SET visit_count = visit_count + 1, last_visit = CURRENT_TIMESTAMP, email_encrypted = ? WHERE id = ?';
                    params = [encryptedEmail, user.id];
                    console.log(`🔒 Encrypting email for existing user ${user.id}`);
                } catch (error) {
                    console.error('❌ Email encryption failed:', error);
                    return callback(new Error('Email encryption failed'));
                }
            } else {
                // No email to update
                updateQuery = 'UPDATE users SET visit_count = visit_count + 1, last_visit = CURRENT_TIMESTAMP WHERE id = ?';
                params = [user.id];
            }
            
            db.run(updateQuery, params, (err) => {
                if (err) {
                    console.error('Error updating user:', err);
                    return callback(err);
                }
                console.log(`✅ Updated user ${user.id}, visit count: ${user.visit_count + 1}${!user.email_encrypted && encryptedEmail ? ' (email encrypted)' : ''}`);
                saveFeedbackRecord(user.id);
            });
        }
    });

    // Save feedback record (nested)
    async function saveFeedbackRecord(userId) {
        let pledgeAnalysis;
        try {
            pledgeAnalysis = await analyzePledgeSentiment(userData.pledge);
        } catch (error) {
            console.warn('Pledge sentiment analysis failed, auto-approving as neutral:', error.message);
            pledgeAnalysis = { sentiment: 'neutral', moderationStatus: 'approved', source: 'fallback' };
        }

        const metadata = JSON.stringify({
            device: device,
            theme: theme,
            retention: retention,
            photoId: userData.photoId,
            processedPhotoId: userData.processedPhotoId,
            captureMode: userData.captureMode || null, // Nick photo/boomerang analytics metadata (DONE BY NICK)
            photoSkipped: userData.photoSkipped === true, // Optional photo flow analytics metadata (DONE BY NICK)
            selectedFaceAccessory: userData.selectedFaceAccessory || null, // Face filter analytics metadata (DONE BY NICK)
            beautyFilterStrength: userData.beautyFilterStrength || null, // Beauty filter analytics metadata (DONE BY NICK)
            boomerangQuality: userData.boomerangQuality || null, // Boomerang quality analytics metadata (DONE BY NICK)
            classGroup: userData.classGroup || null,
            likedFeedback: userData.q2,
            improvementFeedback: userData.q3,
            pledge: userData.pledge,
            pledgeTopic: userData.pledgeTopic || null,
            pledgeTopics: Array.isArray(userData.pledgeTopics) ? userData.pledgeTopics : normalizePledgeTopics(userData),
            badgeKeys: emailService.determineBadgeKeys(userData),
            pledgeSentiment: pledgeAnalysis.sentiment,
            pledgeSentimentConfidence: pledgeAnalysis.confidence,
            pledgeSentimentSource: pledgeAnalysis.source,
            pledgeStatus: pledgeAnalysis.moderationStatus
        });
        
        // <Jun Kai start> a name with a folder part or ".." is not saved, so no later delete or download can leave the uploads folder
        let photoPath = plainName(userData.photoId) ? `photos/${plainName(userData.photoId)}` : null;
        let processedPhotoPath = plainName(userData.processedPhotoId) ? `processed/${plainName(userData.processedPhotoId)}` : null;
        // <Jun Kai end>
        
        db.run(
            `INSERT INTO feedback (user_id, comment, metadata, photo_path, processed_photo_path, data_retention, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [userId, userData.pledge, metadata, photoPath, processedPhotoPath, retention],
            function(err) {
                if (err) {
                    console.error('Error saving feedback:', err);
                    return callback(err);
                }
                
                const feedbackId = this.lastID;
                console.log(`✅ Saved feedback with ID: ${forLog(feedbackId)}, Retention: ${forLog(retention)}, Pledge: ${userData.pledge ? 'Yes (' + forLog(userData.pledge.length) + ' chars)' : 'No'}`); // <Jun Kai/>
                console.log(`Raw Photo Path: ${forLog(photoPath)}`); // <Jun Kai/>
                console.log(`Processed Photo Path: ${forLog(processedPhotoPath)}`); // <Jun Kai/>
                
                saveQuestionAnswers(userId, feedbackId, userData, (error) => {
                    if (error) {
                        console.log('⚠️ Some answers could not be saved');
                    }
                    console.log(`📊 Feedback saved successfully - User: ${userId}, Feedback: ${feedbackId}`);
                    console.log(`📝 Pledge: ${userData.pledge ? forLog(userData.pledge.substring(0, 50)) + '...' : 'None'}`); // <Jun Kai/>
                    console.log(`📅 Retention: ${retention}`);
                    // The tree screens show the new leaf at once (features/tree/liveEvents.js).
                    try { require('../tree/routes').nudgeTreeScreens(); } catch (nudgeError) { console.warn('Tree screens not told of the new feedback:', nudgeError.message); }
                    callback(null, { userId, feedbackId });
                });
            }
        );
    }

    // Save question answers (nested)
    function saveQuestionAnswers(userId, feedbackId, userData, callback) {
        const getQuestionsQuery = 'SELECT id, question_type FROM questions WHERE is_active = 1';
        console.log('📝 Saving answers for feedback:', feedbackId);
        
        db.all(getQuestionsQuery, [], (err, questions) => {
            if (err || !questions || questions.length === 0) {
                console.log(err ? '❌ Error fetching questions' : '⚠️ No questions');
                return callback(null);
            }
            
            console.log(`📋 Saving ${questions.length} answers in parallel...`);
            
            const insertPromises = questions.map(question => {
                let answerValue = userData.answers?.[question.id] || userData[`q${question.id}`];
                
                if (answerValue !== undefined && answerValue !== null && answerValue !== '') {
                    return new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO feedback_answers (feedback_id, question_id, answer_value, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                            [feedbackId, question.id, String(answerValue)],
                            (err) => {
                                if (err) {
                                    console.error(`❌ Q${question.id}:`, err.message);
                                    reject(err);
                                } else {
                                    console.log(`✅ Q${question.id} saved`);
                                    resolve();
                                }
                            }
                        );
                    });
                }
                return Promise.resolve();
            });
            
            Promise.allSettled(insertPromises).then(results => {
                const saved = results.filter(r => r.status === 'fulfilled').length;
                console.log(`📊 Saved ${saved}/${questions.length} answers`);
                callback(null);
            });
        });
    };
};




// ==================== 6. OVERLAY MANAGEMENT ROUTES ====================
// Get all overlays for theme selection in feedback form
router.get('/overlays', (req, res) => {
    console.log('🎨 Fetching overlay data for feedback form...');
    
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
            console.log('⚠️ Overlays table does not exist - using fallback');
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
            
            console.log(`✅ Found ${rows.length} overlays for feedback form`);
            
            res.json({
                success: true,
                overlays: rows
            });
        });
    });
});

// ==================== 7. FORM UI CONFIGURATION ====================
// Get form UI configuration (public)
router.get('/form-ui', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const configPath = paths.dataFile('form-ui.json');

    if (!fs.existsSync(configPath)) {
      return res.json({
        background: '',
        landingTitle: '',
        landingSubtitle: '',
        showLandingPageQRCode: false
      });
    }

    const data = fs.readFileSync(configPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error loading form UI configuration:', error);
    res.status(500).json({ error: 'Failed to load form UI configuration' });
  }
});

// ==================== 8. UTILITY ENDPOINTS ====================

// Test database connection endpoint
router.get('/test-db', (req, res) => {
        db.get("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() LIMIT 1", (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json({ 
            message: 'Database is working!',
            tables: row ? 'Tables exist' : 'No tables found'
        });
    });
});

// Live visitor count for the feedback start screen (DONE BY NICK)
router.get('/visitor-count', async (req, res) => {
    try {
        const nextVisitorNumber = await getActiveFeedbackCountForVisitorNumber();
        const totalVisitors = Number.isFinite(Number(nextVisitorNumber))
            ? Math.max(0, Number(nextVisitorNumber) - 1)
            : null;
        // <Jun Kai start>
        // every pledge ever made, archived and deleted ones included, for the thank-you page's pledge totals
        const totalPledges = await deletedCounts.allTimePledges();
        // <Jun Kai end>

        res.json({
            success: true,
            totalVisitors,
            nextVisitorNumber,
            // <Jun Kai start>
            totalPledges,
            // <Jun Kai end>
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error loading live visitor count:', error);
        res.status(500).json({ success: false, error: 'Unable to load visitor count' });
    }
});

// Root endpoint for feedback routes
router.get('/', (req, res) => {
    res.json({ 
        success: true,
        message: 'Feedback routes are working!',
        endpoints: {
            questions: 'GET /api/feedback/questions',
            submit: 'POST /api/feedback/submit-feedback',
            sendEmail: 'POST /api/feedback/send-email',
            testEmail: 'POST /api/feedback/test-email',
            getFeedback: 'GET /api/feedback/feedback',
            getArchive: 'GET /api/feedback/archive',
            updateArchiveStatus: 'POST /api/feedback/archive/update-status',
            archiveStats: 'GET /api/feedback/archive/stats',
            visitorCount: 'GET /api/feedback/visitor-count',
            emailStatus: 'GET /api/feedback/email-status'
        }
    });
});

// Get countdown timer setting for photo capture (DONE BY BERNISSA)
router.get('/countdown-timer', (req, res) => {
    console.log('⏱️ Fetching countdown timer setting for feedback form...');
    
    const query = `
        SELECT countdown_seconds
        FROM countdown_management
        WHERE id = 1
        LIMIT 1
    `;
    
    db.get(query, [], (err, row) => {
        if (err) {
            console.error('❌ Error fetching countdown timer:', err);
            return res.json({
                success: true,
                countdown_seconds: 3
            });
        }
        
        const seconds = row?.countdown_seconds;
        const safeSeconds = Number.isInteger(seconds) && seconds >= 0 ? seconds : 3;
        
        console.log(`✅ Countdown timer setting: ${safeSeconds} seconds`);
        
        res.json({
            success: true,
            countdown_seconds: safeSeconds
        });
    });
});

// Serve the languages.json file
router.get('/languages/languages.json', (req, res) => {
    res.sendFile(path.join(paths.ROOT, 'languages.json'));
});

module.exports = router;
