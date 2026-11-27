-- Migration 005: deleted_record_counts
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 005: how many visitor records were deleted, per kind and per Singapore day the record was made. Written in the same
-- transaction as the delete (Visitor Data Archive, Permanent Data Deletion) by backend/features/archive/deletedCounts.js,
-- so running totals such as the kiosk's visitor number and the tree's year book keep counting deleted records.
-- Counts only: no names, emails or ids.
CREATE TABLE IF NOT EXISTS deleted_record_counts (
  record_day DATE NOT NULL,                     -- Singapore date of the record's created_at
  kind VARCHAR(20) NOT NULL,                    -- see KINDS in deletedCounts.js
  record_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (record_day, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
