// Owner: Role 3, Jun Kai. Previous team: Preti (10), XY (Xuanyang) (8).
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. ADMIN-CONFIGURABLE TEMPORARY RETENTION
//    parametersConfigStore            - Read contentSettings from shared parameter config (DONE BY XY)
//    getTemporaryRetentionDays        - Use admin-configured retention days instead of hardcoded 7 days (DONE BY XY)
//    isExpired                        - Expire temporary feedback after configured number of days (DONE BY XY)
//    TEMPORARY_RETENTION_VALUES       - Support temporary, 7days and 7day legacy cleanup values (DONE BY XY)
//    LONGTERM_RETENTION_VALUES        - Preserve emails for longterm and indefinite consent records (DONE BY XY)
//    cleanupExpiredData logs          - Show configured temporary retention duration in cleanup logs (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================
//
// ============================================================
// DATARETENTIONCLEANUP.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
// 
// 1. IMPORTS & DEPENDENCIES
//    const db                             - Database module (DONE BY PRETI)
//    const fs                             - File system module (DONE BY PRETI)
//    const path                           - Path module (DONE BY PRETI)
//
// 2. CORE CLEANUP FUNCTIONS
//    function isExpired()                 - Calculate if data has expired based on Singapore timezone (DONE BY PRETI)
//    function deletePhotoFile()           - Delete photo files from filesystem (DONE BY PRETI)
//    function cleanupExpiredData()        - Main cleanup function - removes expired emails and photos (DONE BY PRETI)
//    function cleanupAuditLogs()          - Cleanup audit logs older than 1 year (DONE BY PRETI)
//
// 3. INITIALIZATION & SCHEDULING
//    function initializeCleanup()         - Initialize cleanup system with scheduled intervals (DONE BY PRETI)
//    function runManualCleanup()          - Manual cleanup function (DONE BY PRETI)
//
// 4. MODULE EXPORTS
//    module.exports                       - Export cleanup functions (DONE BY PRETI)
//
// ============================================================

// =================== 1. IMPORTS & DEPENDENCIES =================== 
const db = require('../../core/db');
const fs = require('fs');
const path = require('path');
const { insideUploads } = require('../../core/photoFiles'); // <Jun Kai/> stored photo paths stay inside the uploads folder
const parametersConfigStore = require('../parameters/store');

const TEMPORARY_RETENTION_VALUES = new Set(['temporary', '7days', '7day']);
const LONGTERM_RETENTION_VALUES = new Set(['longterm', 'indefinite']);

function getTemporaryRetentionDays() {
    const config = parametersConfigStore.readParametersConfig();
    const days = Number(config.contentSettings?.temporaryRetentionDays);
    return Number.isFinite(days) && days > 0 ? Math.round(days) : 7;
}

function isTemporaryRetention(retentionPeriod) {
    return TEMPORARY_RETENTION_VALUES.has(String(retentionPeriod || '').toLowerCase());
}

function getTemporaryRetentionLabel() {
    const days = getTemporaryRetentionDays();
    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// =================== 2. CORE CLEANUP FUNCTIONS =================== 
// Calculate if data has expired based on Singapore timezone
function isExpired(createdAt, retentionPeriod, feedbackId) {
    const normalizedRetention = String(retentionPeriod || '').toLowerCase();

    if (LONGTERM_RETENTION_VALUES.has(normalizedRetention)) {
        return false;
    }

    if (isTemporaryRetention(normalizedRetention)) {
        const retentionDays = getTemporaryRetentionDays();
        const created = new Date(createdAt);

        // Current time in Singapore timezone (UTC+8)
        const now = new Date();
        const singaporeOffset = 8 * 60; // minutes
        const localOffset = now.getTimezoneOffset();
        const singaporeTime = new Date(
            now.getTime() + (singaporeOffset + localOffset) * 60000
        );

        // Calculate days difference
        const daysDifference = Math.floor(
            (singaporeTime - created) / (1000 * 60 * 60 * 24)
        );

        console.debug(
            `📅 Checking: ID ${feedbackId ?? 'N/A'}, ` +
            `Created: ${created.toLocaleDateString()}, Days old: ${daysDifference}, Retention: ${retentionDays} days`
        );

        return daysDifference >= retentionDays;
    }

    return false;
}

// Delete photo files from filesystem
function deletePhotoFile(photoPath) {
    if (!photoPath) return;

    const fullPath = insideUploads(photoPath); // <Jun Kai/> null when the stored path leaves the uploads folder

    if (fullPath && fs.existsSync(fullPath)) {
        try {
            fs.unlinkSync(fullPath);
            console.debug(`   ✅ Deleted photo: ${path.basename(photoPath)}`);
        } catch (error) {
            console.error(`   ❌ Error deleting ${photoPath}:`, error.message);
        }
    } else {
        console.debug(`   ⚠️  Photo not found: ${photoPath}`);
    }
}

// Main cleanup function removes expired emails and photos
function cleanupExpiredData() {
    console.debug('\n🧹 ============================================');
    console.debug('   DATA RETENTION CLEANUP STARTED');
    console.debug('   Time:', new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }));
    console.debug('============================================');

    const retentionLabel = getTemporaryRetentionLabel();

    // Query feedback entries with temporary retention. Legacy rows may still use 7days/7day.
    const query = `
        SELECT
            f.id,
            f.user_id,
            f.photo_path,
            f.processed_photo_path,
            f.data_retention,
            f.created_at,
            u.email_encrypted,
            u.name
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE LOWER(f.data_retention) IN ('temporary', '7days', '7day')
          AND f.is_active = 1
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Database error during cleanup:', err);
            return;
        }

        if (rows.length === 0) {
            console.debug(`📋 No feedback entries with temporary retention (${retentionLabel}) found`);
            console.debug('============================================\n');
            return;
        }

        console.debug(`\n📋 Found ${rows.length} feedback entries with temporary retention (${retentionLabel})\n`);

        let expiredCount = 0;
        let processedCount = 0;

        rows.forEach(feedback => {
            if (isExpired(feedback.created_at, feedback.data_retention, feedback.id)) {
                expiredCount++;
                console.debug(`\n⏰ EXPIRED - Feedback ID: ${feedback.id}, User: ${feedback.name}`);
                console.debug(`   Created: ${new Date(feedback.created_at).toLocaleDateString()}`);

                // Delete photos from filesystem for this submission
                if (feedback.photo_path) {
                    deletePhotoFile(feedback.photo_path);
                }
                if (feedback.processed_photo_path) {
                    deletePhotoFile(feedback.processed_photo_path);
                }

                // Check if user has any longterm feedback before clearing email
                const hasLongtermQuery = `
                    SELECT COUNT(*) AS count
                    FROM feedback
                    WHERE user_id = ?
                      AND LOWER(data_retention) IN ('longterm', 'indefinite')
                      AND is_active = 1
                `;

                db.get(hasLongtermQuery, [feedback.user_id], (checkErr, row) => {
                    if (checkErr) {
                        console.error(
                            `   ❌ Error checking longterm feedback for user ${feedback.user_id}:`,
                            checkErr.message
                        );
                    } else if (row && row.count > 0) {
                        console.debug(
                            `   ℹ️  Skipping email clear for user ${feedback.user_id} (has longterm feedback)`
                        );
                    } else {
                        // Clear encrypted email for user with no longterm feedback
                        const updateUserQuery = `
                            UPDATE users
                            SET email_encrypted = NULL
                            WHERE id = ?
                        `;
                        db.run(updateUserQuery, [feedback.user_id], (updateErr) => {
                            if (updateErr) {
                                console.error(
                                    `   ❌ Error clearing encrypted email for user ${feedback.user_id}:`,
                                    updateErr.message
                                );
                            } else {
                                console.debug(`   ✅ Cleared encrypted email for user ${feedback.user_id}`);
                            }
                        });
                    }
                });

                // Clear photo paths in feedback table for this feedback row
                const clearPhotosQuery = `
                    UPDATE feedback
                    SET photo_path = NULL,
                        processed_photo_path = NULL
                    WHERE id = ?
                `;

                db.run(clearPhotosQuery, [feedback.id], (photoErr) => {
                    if (photoErr) {
                        console.error('   ❌ Error clearing photo paths:', photoErr.message);
                    } else {
                        console.debug('   ✅ Cleared photo paths in database');
                    }
                });
            }

            processedCount++;

            // Display final summary after processing all entries
            if (processedCount === rows.length) {
                console.debug('\n============================================');
                console.debug('📊 CLEANUP SUMMARY:');
                console.debug(`   • Total checked: ${rows.length}`);
                console.debug(`   • Expired & cleaned: ${expiredCount}`);
                console.debug(`   • Still valid: ${rows.length - expiredCount}`);
                console.debug('============================================\n');
                // <Jun Kai start>
                if (expiredCount) console.log(`🧹 Retention cleanup: ${expiredCount} expired feedback entr${expiredCount === 1 ? 'y' : 'ies'} cleaned (photos deleted, emails cleared)`);
                // <Jun Kai end>
            }
        });
    });
}

// Cleanup audit logs older than 1 year
function cleanupAuditLogs() {
    console.debug('\n🗂️  ============================================');
    console.debug('   AUDIT LOG CLEANUP STARTED (1 YEAR RETENTION)');
    console.debug('   Time:', new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }));
    console.debug('============================================');

    console.debug(`📅 Deleting audit logs older than 1 year (using MySQL NOW())`);

    // Count how many logs will be deleted using MySQL's native date functions
    const countQuery = `
        SELECT COUNT(*) as count
        FROM audit_logs
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)
    `;

    db.get(countQuery, [], (countErr, countResult) => {
        if (countErr) {
            console.error('❌ Error counting audit logs:', countErr.message);
            return;
        }

        const logsToDelete = countResult ? countResult.count : 0;

        if (logsToDelete === 0) {
            console.debug('📋 No audit logs older than 1 year found');
            console.debug('============================================\n');
            return;
        }

        console.debug(`\n🗑️  Found ${logsToDelete} audit logs older than 1 year`);

        // Delete old audit logs using MySQL's native date calculation
        const deleteQuery = `
            DELETE FROM audit_logs
            WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)
        `;

        db.run(deleteQuery, [], function(deleteErr) {
            if (deleteErr) {
                console.error('❌ Error deleting audit logs:', deleteErr.message);
                return;
            }

            console.log(`✅ Successfully deleted ${this.changes} audit log entries`);
            console.debug('============================================\n');
        });
    });
}

// =================== 3. INITIALIZATION & SCHEDULING =================== 
// Initialize cleanup system with scheduled intervals
function initializeCleanup() {
    console.debug('\n🚀 ============================================');
    console.debug('   DATA RETENTION CLEANUP SYSTEM');
    console.debug('============================================');
    console.debug('⏰ Cleanup Schedule:');
    console.debug(`   FEEDBACK (temporary retention: ${getTemporaryRetentionLabel()}):`);
    console.debug('     1. On server startup (in 5 seconds)');
    console.debug('     2. Every 6 hours while running');
    console.debug('   AUDIT LOGS (1-year retention):');
    console.debug('     1. On server startup (in 10 seconds)');
    console.debug('     2. Every 24 hours while running');
    console.debug('   3. Manual trigger via admin panel');
    console.debug('============================================\n');

    // Run feedback cleanup 5 seconds after server starts
    setTimeout(() => {
        console.debug('🔄 Running initial feedback cleanup on server startup...');
        cleanupExpiredData();
    }, 5000);

    // Run audit log cleanup 10 seconds after server starts
    setTimeout(() => {
        console.debug('🔄 Running initial audit log cleanup on server startup...');
        cleanupAuditLogs();
    }, 10000);

    // Run feedback cleanup every 6 hours
    setInterval(() => {
        console.debug('🔄 Running scheduled feedback cleanup (6-hour interval)...');
        cleanupExpiredData();
    }, 6 * 60 * 60 * 1000);

    // Run audit log cleanup every 24 hours
    setInterval(() => {
        console.debug('🔄 Running scheduled audit log cleanup (24-hour interval)...');
        cleanupAuditLogs();
    }, 24 * 60 * 60 * 1000);
}

// Manual cleanup function triggered by admin
function runManualCleanup() {
    console.log('\n🔧 Manual cleanup triggered by admin');
    cleanupExpiredData();
    
    // Run audit log cleanup after feedback cleanup
    setTimeout(() => {
        cleanupAuditLogs();
    }, 2000);
}

// =================== 4. MODULE EXPORTS =================== 
module.exports = {
    initializeCleanup,
    runManualCleanup,
    cleanupExpiredData,
    cleanupAuditLogs
};
