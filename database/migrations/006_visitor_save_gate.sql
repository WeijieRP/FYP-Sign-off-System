-- Migration 006: visitor_save_gate
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 006: lets a kiosk save and an archive's delete step take turns, across both server processes (server.js and
-- kioskServer.js). A save adds a 'save' row while it runs; a delete step adds a 'delete' row and backs off (rolls back,
-- then tries again) whenever a 'save' row appears, so the visitor's save always goes first.
-- Used by backend/features/archive/saveGate.js. Rows are removed when done; an expired row no longer counts.
CREATE TABLE IF NOT EXISTS visitor_save_gate (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  holder VARCHAR(10) NOT NULL,                  -- save | delete
  expires_at DATETIME(3) NOT NULL,              -- UTC; left behind by a server that stopped, it stops counting here
  PRIMARY KEY (id),
  KEY idx_visitor_save_gate_holder (holder, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
