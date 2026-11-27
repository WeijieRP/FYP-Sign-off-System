-- Migration 009: hardware_daily
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 009: one row per UTC day with the averages and peaks of that day's hardware samples, kept for good (365 rows a
-- year), so the Hardware page can forecast months ahead and draw long ranges after the samples themselves are deleted.
-- Written by backend/features/hardware/daily.js at the first sample after each UTC midnight, before the hourly
-- clean-up of hardware_samples. Numbered 009 because 007 and 008 are taken on the anomaly-detection branches.
CREATE TABLE IF NOT EXISTS hardware_daily (
  day DATE NOT NULL,
  samples INT UNSIGNED NOT NULL,
  cpu_avg DECIMAL(5,1) NULL,
  cpu_max DECIMAL(5,1) NULL,
  memory_avg DECIMAL(5,1) NULL,
  memory_max DECIMAL(5,1) NULL,
  disk_avg DECIMAL(5,1) NULL,
  disk_max DECIMAL(5,1) NULL,
  gpu_avg DECIMAL(5,1) NULL,
  gpu_max DECIMAL(5,1) NULL,
  disk_used_gb DECIMAL(10,1) NULL,
  disk_total_gb DECIMAL(10,1) NULL,
  memory_used_mb INT UNSIGNED NULL,
  gpu_memory_used_mb INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- <Jun Kai end>
