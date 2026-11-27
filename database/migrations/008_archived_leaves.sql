-- Migration 008: archived_leaves
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 008: the leaf that stays on the digital tree after the Visitor Data Archive deleted a visitor's records. One row per
-- archived feedback row, written in the same transaction as the delete. Nothing personal: no name (only initials when the
-- admin chose that), no email, no pledge, no photo. Read by the tree routes; times are UTC.
CREATE TABLE IF NOT EXISTS archived_leaves (
  feedback_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  label VARCHAR(40) NOT NULL,
  badge_key VARCHAR(60) NULL,
  badge_keys VARCHAR(255) NULL,
  is_vip TINYINT(1) NOT NULL DEFAULT 0,
  archive_id INT NULL,
  archived_at DATETIME NOT NULL,
  PRIMARY KEY (feedback_id),
  KEY idx_archived_leaves_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
