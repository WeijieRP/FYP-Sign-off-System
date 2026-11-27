-- Migration 014: tech_overlay_mobile_file
-- Applied once, in order, by: npm run db:migrate
-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.

-- <Jun Kai start>
-- 014: the Tech Theme's mobile overlay pointed at the desktop picture's name inside the mobile folder
-- (MobileOverlay/techThemeDesktop.png). That file does not exist, so phones got a broken Tech overlay; the real file is
-- MobileOverlay/techThemeMobile.png. Only that exact wrong path changes, so a path an admin set by hand stays as it
-- is, and running this twice changes nothing.
UPDATE overlays
SET mobile_filename = '/assets/overlays/MobileOverlay/techThemeMobile.png'
WHERE mobile_filename = '/assets/overlays/MobileOverlay/techThemeDesktop.png';
-- <Jun Kai end>
