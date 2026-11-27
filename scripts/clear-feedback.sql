-- ============================================================
-- CLEAR ALL FEEDBACK: a fresh start (Wei Jie)
-- ============================================================
-- Empties every visitor submission and what hangs off it, and starts their numbering again from 1:
--   feedback                 the submissions (the leaves on the 2D and 3D trees)
--   feedback_answers         each submission's answers
--   pledge_likes             likes on the pledges
--   users                    the visitors who submitted (names, encrypted emails, visit counts)
--   feedback_analysis_cache  sentiment results worked out from the comments
-- Keeps everything else: questions and their options, admin accounts, the VIP list, themes, overlays,
-- countdowns, lost & found reports, audit logs, hardware data and all the settings (parametersConfig.json).
-- Photos saved with feedback stay in the uploads folder (delete them there by hand if wanted).
--
-- THIS CANNOT BE UNDONE. Back up first if the data may be needed:
--   mysqldump -u <user> -p dp_kiosk_db feedback feedback_answers pledge_likes users feedback_analysis_cache > feedback-backup.sql
-- Run:
--   mysql -u <user> -p dp_kiosk_db < scripts/clear-feedback.sql

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE pledge_likes;
TRUNCATE TABLE feedback_answers;
TRUNCATE TABLE feedback;
TRUNCATE TABLE users;
TRUNCATE TABLE feedback_analysis_cache;

SET FOREIGN_KEY_CHECKS = 1;

SELECT
  (SELECT COUNT(*) FROM feedback) AS feedback_left,
  (SELECT COUNT(*) FROM users) AS visitors_left;
