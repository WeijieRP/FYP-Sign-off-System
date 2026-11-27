-- Migration 010: lost_found_contact_encrypted
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 010: the contact on a Lost & Found report is stored encrypted, like visitor emails (auth.encryptEmail,
-- "iv:authTag:data", which is longer than the 255 characters of contact_info, so it gets a TEXT column of its own).
-- New reports leave contact_info empty. Older rows are converted by database/encrypt-lostfound-contacts.js.
-- The server also adds this column by itself when it is missing (backend/features/lostFound/store.js), so this
-- checks first and does nothing when the column is already there.
SET @has_column := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_reports' AND COLUMN_NAME = 'contact_info_encrypted');
SET @add_column := IF(@has_column = 0,
    'ALTER TABLE lost_found_reports ADD COLUMN contact_info_encrypted TEXT NULL AFTER contact_info',
    'SELECT 1');
PREPARE add_column_statement FROM @add_column;
EXECUTE add_column_statement;
DEALLOCATE PREPARE add_column_statement;
-- <Jun Kai end>
