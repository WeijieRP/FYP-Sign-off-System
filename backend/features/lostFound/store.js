// Owner: shared. Previous team: Nick (8).
// Lost and found report storage - changes made by nick
const db = require('../../core/db');
const auth = require('../../core/auth'); // <Jun Kai/> encryptEmail / decryptEmail for the contact
const contactColumns = require('./contact'); // <Jun Kai/>

const VALID_TYPES = new Set(['lost', 'found']);
const VALID_STATUSES = new Set(['new', 'reviewed', 'resolved']);

function trimTo(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function getTrackingCodeForId(id) { // Lost & Found tracking code helper (DONE BY NICK)
    const numericId = Number(id) || 0;
    return `LF-${String(numericId).padStart(5, '0')}`;
}

function ignoreDuplicateColumn(err) { // Lost & Found schema migration helper (DONE BY NICK)
    if (!err) return true;
    const message = String(err.message || '').toLowerCase();
    return message.includes('duplicate column') ||
        message.includes('duplicate column name') ||
        message.includes('er_dup_fieldname');
}

function ensureLostFoundColumns(callback) { // Extended Lost & Found fields for tracking/photo support (DONE BY NICK)
    const migrations = [
        `ALTER TABLE lost_found_reports ADD COLUMN tracking_code VARCHAR(32)`,
        `ALTER TABLE lost_found_reports ADD COLUMN item_photo_path VARCHAR(500)`,
        `ALTER TABLE lost_found_reports ADD COLUMN item_photo_original_name VARCHAR(255)`,
        // <Jun Kai/> the encrypted contact (migration 010 adds the same column; a server that has not run it yet adds it here)
        `ALTER TABLE lost_found_reports ADD COLUMN contact_info_encrypted TEXT NULL AFTER contact_info`
    ];

    let index = 0;
    function runNext() {
        if (index >= migrations.length) {
            callback(null);
            return;
        }

        db.run(migrations[index], [], (err) => {
            if (err && !ignoreDuplicateColumn(err)) {
                callback(err);
                return;
            }
            index += 1;
            runNext();
        });
    }

    runNext();
}

// changes made by nick
function ensureLostFoundTable(callback) {
    const query = `
        CREATE TABLE IF NOT EXISTS lost_found_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tracking_code VARCHAR(32),
            report_type VARCHAR(20) NOT NULL,
            item_description VARCHAR(255) NOT NULL,
            location_text VARCHAR(255) NOT NULL,
            contact_info VARCHAR(255) NOT NULL,
            details TEXT,
            item_photo_path VARCHAR(500),
            item_photo_original_name VARCHAR(255),
            current_page VARCHAR(120),
            feedback_progress TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_lost_found_status (status),
            INDEX idx_lost_found_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    db.run(query, [], (err) => {
        if (err) return callback(err);
        ensureLostFoundColumns(callback);
    });
}

// changes made by nick
function createLostFoundReport(payload, callback) {
    const type = trimTo(payload.type, 20).toLowerCase();
    const item = trimTo(payload.item, 255);
    const location = trimTo(payload.location, 255);
    const contact = trimTo(payload.contact, 255);
    const details = trimTo(payload.details, 1000);
    const itemPhotoPath = trimTo(payload.itemPhotoPath, 500);
    const itemPhotoOriginalName = trimTo(payload.itemPhotoOriginalName, 255);
    const currentPage = trimTo(payload.currentPage || payload.activePageId, 120);
    const progress = payload.feedbackProgress
        ? JSON.stringify(payload.feedbackProgress).slice(0, 12000)
        : null;

    if (!VALID_TYPES.has(type)) {
        return callback(new Error('Report type must be lost or found.'));
    }

    if (!item || !location || !contact) {
        return callback(new Error('Item, location, and contact are required.'));
    }

    ensureLostFoundTable((tableErr) => {
        if (tableErr) return callback(tableErr);

        // <Jun Kai start> the contact is saved encrypted (like visitor emails); contact_info stays empty
        let stored;
        try {
            stored = contactColumns.encryptedColumns(contact, auth.encryptEmail);
        } catch (encryptErr) {
            return callback(encryptErr);
        }
        const query = `
            INSERT INTO lost_found_reports
                (report_type, item_description, location_text, contact_info, contact_info_encrypted, details, item_photo_path, item_photo_original_name, current_page, feedback_progress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [type, item, location, stored.contact_info, stored.contact_info_encrypted, details, itemPhotoPath || null, itemPhotoOriginalName || null, currentPage, progress], function(insertErr) {
            if (insertErr) return callback(insertErr);
            // <Jun Kai end>
            const id = this.lastID;
            const trackingCode = getTrackingCodeForId(id);
            db.run(
                'UPDATE lost_found_reports SET tracking_code = ? WHERE id = ?',
                [trackingCode, id],
                (trackingErr) => {
                    if (trackingErr) return callback(trackingErr);
                    callback(null, {
                        id,
                        trackingCode,
                        report: {
                            id,
                            tracking_code: trackingCode,
                            report_type: type,
                            item_description: item,
                            location_text: location,
                            contact_info: contact,
                            details,
                            item_photo_path: itemPhotoPath || null,
                            item_photo_original_name: itemPhotoOriginalName || null,
                            current_page: currentPage,
                            status: 'new'
                        }
                    });
                }
            );
        });
    });
}

// changes made by nick
function listLostFoundReports(callback) {
    ensureLostFoundTable((tableErr) => {
        if (tableErr) return callback(tableErr);

        db.all(`
            SELECT
                id,
                COALESCE(tracking_code, CONCAT('LF-', LPAD(id, 5, '0'))) AS tracking_code,
                report_type,
                item_description,
                location_text,
                contact_info,
                contact_info_encrypted,
                details,
                item_photo_path,
                item_photo_original_name,
                current_page,
                feedback_progress,
                status,
                created_at,
                updated_at
            FROM lost_found_reports
            ORDER BY created_at DESC, id DESC
            LIMIT 500
        `, [], callback);
    });
}

// changes made by nick
function updateLostFoundReportStatus(id, status, callback) {
    const numericId = Number.parseInt(id, 10);
    const normalizedStatus = trimTo(status, 20).toLowerCase();

    if (!Number.isInteger(numericId) || numericId <= 0) {
        return callback(new Error('Invalid report id.'));
    }

    if (!VALID_STATUSES.has(normalizedStatus)) {
        return callback(new Error('Status must be new, reviewed, or resolved.'));
    }

    ensureLostFoundTable((tableErr) => {
        if (tableErr) return callback(tableErr);

        db.run(`
            UPDATE lost_found_reports
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [normalizedStatus, numericId], function(updateErr) {
            if (updateErr) return callback(updateErr);
            callback(null, { changes: this.changes });
        });
    });
}

// <Jun Kai start> the plain contact of one report (decrypted, or the plain value of a row from before the change)
function getLostFoundContact(id, callback) {
    ensureLostFoundTable((tableErr) => {
        if (tableErr) return callback(tableErr);
        db.get('SELECT id, contact_info, contact_info_encrypted FROM lost_found_reports WHERE id = ?', [id], (err, row) => {
            if (err) return callback(err);
            if (!row) return callback(null, undefined);
            try {
                callback(null, contactColumns.revealContact(row, auth.decryptEmail));
            } catch (decryptErr) {
                callback(decryptErr);
            }
        });
    });
}
// <Jun Kai end>

module.exports = {
    createLostFoundReport,
    listLostFoundReports,
    updateLostFoundReportStatus,
    getTrackingCodeForId,
    getLostFoundContact // <Jun Kai/>
};
