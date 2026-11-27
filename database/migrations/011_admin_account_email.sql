-- Migration 011: admin_account_email
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 011: an email for each admin account, so a forgotten password can be reset by email. Stored trimmed and in lower
-- case; an account without one keeps NULL (several NULLs are allowed by the unique index, two equal emails are not).
-- The server adds the same column and index by itself when they are missing (backend/core/accountEmail.js), so each
-- step checks first and does nothing when it is already there.
SET @has_email := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'email');
SET @add_email := IF(@has_email = 0,
    'ALTER TABLE admin_users ADD COLUMN email VARCHAR(254) NULL AFTER full_name',
    'SELECT 1');
PREPARE add_email_statement FROM @add_email;
EXECUTE add_email_statement;
DEALLOCATE PREPARE add_email_statement;

SET @has_email_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND INDEX_NAME = 'uq_admin_users_email');
SET @add_email_index := IF(@has_email_index = 0,
    'ALTER TABLE admin_users ADD UNIQUE INDEX uq_admin_users_email (email)',
    'SELECT 1');
PREPARE add_email_index_statement FROM @add_email_index;
EXECUTE add_email_index_statement;
DEALLOCATE PREPARE add_email_index_statement;
-- <Jun Kai end>
