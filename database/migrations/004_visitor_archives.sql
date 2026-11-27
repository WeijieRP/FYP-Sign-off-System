-- Migration 004: visitor_archives
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 004: one row per Visitor Data Archive run (Admin > Visitor Data Archive). Written by
-- backend/features/archive/visitorRunner.js; it is the lasting record of what was exported and deleted
-- (audit_logs rows are purged after a year). Every DATETIME is UTC (the DB session is UTC).
CREATE TABLE IF NOT EXISTS visitor_archives (
  id INT NOT NULL AUTO_INCREMENT,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  trigger_type VARCHAR(10) NOT NULL,          -- manual | automatic
  started_by VARCHAR(50) NULL,                -- admin username, NULL for automatic
  status VARCHAR(12) NOT NULL,                -- running | deleting | cleaning | done | saved | failed | interrupted
  stage VARCHAR(12) NULL,
  delete_records TINYINT(1) NOT NULL DEFAULT 1,
  photos_included TINYINT(1) NOT NULL DEFAULT 1,
  feedback_before DATETIME NULL,
  lost_found_before DATETIME NULL,
  visitor_count INT NOT NULL DEFAULT 0,
  visitors_deleted INT NOT NULL DEFAULT 0,
  feedback_count INT NOT NULL DEFAULT 0,
  answer_count INT NOT NULL DEFAULT 0,
  like_count INT NOT NULL DEFAULT 0,
  lost_found_count INT NOT NULL DEFAULT 0,
  photo_count INT NOT NULL DEFAULT 0,
  missing_photo_count INT NOT NULL DEFAULT 0,
  folder VARCHAR(500) NULL,
  file_name VARCHAR(255) NULL,
  file_size BIGINT UNSIGNED NULL,
  file_sha256 CHAR(64) NULL,
  key_fingerprint CHAR(16) NULL,
  file_state VARCHAR(10) NOT NULL DEFAULT 'none',   -- none | present | deleted | expired
  file_deleted_at DATETIME NULL,
  error_message VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_visitor_archives_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
