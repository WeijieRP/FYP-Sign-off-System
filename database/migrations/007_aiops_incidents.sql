-- Migration 007: aiops_incidents
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 007: anomaly detection on the System Health page: the incidents the detectors open, their timeline, and the health
-- check results the background recorder keeps (backend/features/aiops/*, server.js only). Times are UTC.
CREATE TABLE IF NOT EXISTS incidents (
  id INT NOT NULL AUTO_INCREMENT,
  fingerprint VARCHAR(120) NOT NULL,
  detector VARCHAR(30) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  subject VARCHAR(120) NULL,
  severity VARCHAR(10) NOT NULL,
  status VARCHAR(12) NOT NULL,
  title VARCHAR(200) NOT NULL,
  explanation TEXT NULL,
  evidence JSON NULL,
  opened_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  acknowledged_at DATETIME(3) NULL,
  acknowledged_by VARCHAR(50) NULL,
  resolved_at DATETIME(3) NULL,
  resolved_by VARCHAR(50) NULL,
  resolve_note VARCHAR(500) NULL,
  verdict VARCHAR(12) NULL,
  verdict_by VARCHAR(50) NULL,
  verdict_at DATETIME(3) NULL,
  occurrences INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_incidents_status_seen (status, last_seen_at),
  KEY idx_incidents_fingerprint (fingerprint, resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  incident_id INT NOT NULL,
  at DATETIME(3) NOT NULL,
  type VARCHAR(20) NOT NULL,
  detail JSON NULL,
  PRIMARY KEY (id),
  KEY idx_incident_events_incident (incident_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_check_results (
  id INT NOT NULL AUTO_INCREMENT,
  checked_at DATETIME NOT NULL,
  check_key VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL,
  latency_ms INT UNSIGNED NULL,
  summary VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_health_results_key_time (check_key, checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
