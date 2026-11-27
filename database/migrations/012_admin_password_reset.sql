-- Migration 012: admin_password_reset
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 012: resetting a forgotten admin password by email (backend/features/passwordReset).
-- admin_password_resets: at most one open reset per account. Only keyed hashes are kept, never the code or the link
-- itself. It ends 15 minutes after it was asked for, and the moment the password is changed (by the code or by the
-- link: the row is deleted, so both stop working at once). After 5 wrong codes the code stops working; the link
-- keeps working for its owner.
-- admin_password_reset_requests: when each reset was asked for, so the limit of a few emails per account per hour
-- holds even though a new request replaces the open reset. Rows older than a day are removed.
-- admin_password_reset_failures: each wrong code, so the guesses of one account stay few per day across resets.
-- The server also creates the three tables by itself when they are missing (backend/features/passwordReset/store.js).
CREATE TABLE IF NOT EXISTS admin_password_resets (
  id INT NOT NULL AUTO_INCREMENT,
  admin_user_id INT NOT NULL,
  link_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  code_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  requested_ip VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_user (admin_user_id),
  UNIQUE KEY uq_password_reset_link (link_hash),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_password_reset_requests (
  id INT NOT NULL AUTO_INCREMENT,
  admin_user_id INT NOT NULL,
  requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  requested_ip VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_password_reset_requests_user (admin_user_id, requested_at),
  CONSTRAINT fk_password_reset_request_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_password_reset_failures (
  id INT NOT NULL AUTO_INCREMENT,
  admin_user_id INT NOT NULL,
  failed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_password_reset_failures_user (admin_user_id, failed_at),
  CONSTRAINT fk_password_reset_failure_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
