# Admin page shell and the big admin router

**Owner:** Role 3, Jun Kai (lead); each route group belongs to the role listed on its page

**Where the code is**

- backend/features/admin/routes.js: the former adminRoutes.js, 8.7k lines, still one file
- frontend/admin/admin.html, admin.css, js/core.js, js/navigation.js, js/init.js, js/dashboard.js

**What it does**

The login card has "Forgot password?": a code or a link by email resets the password (docs/features/users.md).

Login, session timeout, navigation between the admin pages, the dashboard with its charts and alerts, and the feedback data table. The router file still holds every admin route group; each owner extracts theirs into backend/features/<feature>/routes.js when they first work on it (see "Extracting a route group" below).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/admin` | backend/server.js |
| GET | `/admin/` | backend/server.js |
| GET | `/api/admin/dashboard` | backend/features/admin/routes.js |
| GET | `/api/admin/download-file/:filename` | backend/features/admin/routes.js |
| GET | `/api/admin/feedback` | backend/features/admin/routes.js |
| GET | `/api/admin/feedback-stats` | backend/features/admin/routes.js |
| DELETE | `/api/admin/feedback/:id` | backend/features/admin/routes.js |
| PUT | `/api/admin/feedback/:id` | backend/features/admin/routes.js |
| GET | `/api/admin/feedback/:id/questions` | backend/features/admin/routes.js |
| GET | `/api/admin/intervention-alerts` | backend/features/admin/routes.js |
| GET | `/api/admin/journey-passport` | backend/features/admin/routes.js |
| POST | `/api/admin/keep-alive` | backend/features/admin/routes.js |
| GET | `/api/admin/leaf-pledge-trends` | backend/features/admin/routes.js |
| POST | `/api/admin/login` | backend/features/admin/routes.js |
| POST | `/api/admin/logout-audit` | backend/features/admin/routes.js |
| GET | `/api/admin/nick-usage-analytics` | backend/features/admin/routes.js |
| GET | `/api/admin/school-summary` | backend/features/admin/routes.js |
| GET | `/api/admin/sign-in-settings` | backend/core/idleSignOut.js |
| PUT | `/api/admin/sign-in-settings` | backend/core/idleSignOut.js |
| GET | `/api/admin/test-db` | backend/features/admin/routes.js |
| POST | `/api/admin/verify-password` | backend/features/admin/routes.js |
| GET | `/api/admin/visitor-trends` | backend/features/admin/routes.js |

**Task-sheet items for this feature**

- Health monitoring including the LLM (Ollama) status.
- Hardware usage graphs with statistical forecasting (no AI).
- Policy-based hibernation, archive workflow, install and uninstall scripts, hide the email-pattern setting, set the sender address (see the archive, serverControl, email and parameters pages).

**Dashboard, Visitors tab** (26 Nov 2026, Jun Kai; it replaces the old Visitors and Journey Passport tabs, so the Dashboard has three tabs: Overview, Visitors, System)

- Four tiles: visitors who left feedback (from GET /api/admin/journey-passport), and of all feedback how much left an email, took a photo and was kept long term (from GET /api/admin/feedback-stats). The note under each says what it is counted against, for example "of 52 feedback".
- Journey Passport: a bar for each of the six milestones (First Feedback, First Pledge, Photo Keepsake, Community Liked, Repeat Visitor, Topic Explorer) and each of the six pledge topic badges, as "N of all visitors", with a few words on what earns each one. The text above says the most stamps there are (12) and the average.
- Last 6 days: leaves and pledges per day as a small table with a total row (GET /api/admin/leaf-pledge-trends).
- Most stamps: the 10 visitors with the most stamps, with the stamp names, their feedback, pledges and likes and the last visit. On a phone each visitor becomes a small block.
- No visitors yet, or a failed load, shows a sentence (and Try again) instead of empty bars.
- Fixed in buildJourneyPassport (backend/features/admin/routes.js, code by Nick): the stamp totals counted visitors without feedback, so Repeat Visitor said 35 next to 31 repeat visitors; the totals now count the same visitors as the summary. The query only takes visitors with active feedback and has no row limit any more (LIMIT 1200 cut the counts on a busy kiosk). Every pledge topic is listed, 0 too, the stamp and topic keys are sent, `summary.maxStamps` says 12, and the list holds 10 visitors instead of 6.
- Checked with build-check/check-visitors.js (22 steps, throwaway visitors with 12, 7 and 1 stamps, a very long name, no name and one without feedback).

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Fixed 19 Nov 2026: 36 routes of `backend/features/admin/routes.js` answered without a sign-in ("only 39 of about 108 admin routes use auth.requireAuth"). Now every route of that file starts with `auth.requireAuth` (any signed-in admin role: the dashboard numbers, the feedback list, the overlay and question lists, the email decrypt) or `auth.requireAuth, auth.requireAdmin` (system admin: users, VIPs, archive, audit log, every change to overlays and questions, the old download routes). Only `/login` and `/logout-audit` have none. The handlers used to take "who is asking" from an `x-username` header that fell back to `systemadmin`; they now use the admin of the session. The contract check "sign-in" in `tests/contracts/run.js` fails when a route of that file has no check as its first argument. The same check covers the `/admin` routes of `backend/features/pledgeboard/routes.js`, which got their sign-in check the same day (see pledgeboard.md). Routes in other files are not covered by it.
- Fixed 19 Nov 2026: three queries used a feedback.rating column that does not exist (the count in GET /api/admin/test-db and the Rating column of the two old CSV downloads).
- Fixed 19 Nov 2026: wrong passwords at the sign-in are limited (`backend/core/loginLimit.js`: 5 for one username from one address in 15 minutes, 20 from one address; the lock lasts 15 minutes and is kept in memory). The login page shows "Too many wrong passwords. Try again in N minutes." and the audit log gets a LOGIN_LOCKED line.
- Fixed 19 Nov 2026: `/uploads` asks for a sign-in (`backend/core/uploadsGate.js`), except for the browser that just saved the file. `/api/server-info`, `/api/network-interfaces`, `/api/test-db` and `/api/test-email-service` answer a signed-in admin or a request made on the PC itself (`backend/core/localPc.js`).
- Fixed 19 Nov 2026: `/tree/tree.html` and `/3dTree/3dTree.html` are sent to their gated routes (`backend/core/pageGates.js`). The pledgeboard page is still a plain file, and the kiosk server has no gates.
- Phones are always bounced off /pledgeboard: req.session.mobileAccessGranted is set by nothing (server.js 140).
- getSelectedIP falls back to the first adapter unless one is literally named "Wi-Fi 2" (server.js 227); set SERVER_IP on the wall PC.
- kioskServer.js has drifted from server.js (no page gates, different static handling) if the wall browser is pointed at :3003.
- Fixed 19 Nov 2026: restart-app.bat and startup-monitor.bat could double-launch the servers. The monitor looks twice, 10 seconds apart, before it starts them; restart-app.bat is unchanged. Tested with a stand-in copy of the monitor, not with the real programs.
- Dashboard kiosk status poller was removed because its elements never existed; the Kiosk Server badge is updated by checkServerStatus instead.
- scripts/setup: Simulation_Generator stores bare filenames in photo_path (the app expects photos/<file>) and needs pngjs, which is not a dependency; Purge_Actuator "CLEAR ALL TEST DATA" leaves photo files and several tables behind.

**Extracting a route group from routes.js**

1. Create `backend/features/<feature>/routes.js` with an Express router and move your `router.get/post/...` blocks and the helpers only they use into it.
2. Helpers shared with other groups stay in `backend/features/admin/routes.js` and are exported from it (or move to `backend/core/`).
3. Mount the new router in `backend/server.js` under `/api/admin` **before** the big router so the registration order is preserved, run `npm run routes:update`, and check that the snapshot only changed the "Registered in" column.
4. `npm run check` and `npm run smoke` must pass; ESLint `no-undef` tells you which helper you forgot to import.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.

## Login: show password and "keep me signed in" (12 Nov 2026, supervisor meeting 04)
- The eye button inside the password field shows or hides the password (aria-pressed, the label says what it does).
- "Keep me signed in on this computer for 1 day": the login answer sets an httpOnly, SameSite=Strict cookie (esg_admin_remember, path /api/admin, secure over HTTPS) holding a random 256-bit token. The server keeps only its SHA-256 hash, the admin, a fingerprint of the password hash and the expiry in backend/data/remember-tokens.json (at most 10 per admin); the password is never stored. backend/core/rememberMe.js runs on every /api/admin request: with no session but a valid token it opens a fresh session for that admin, as long as the account is active and not deleted and its password is unchanged. GET /api/admin/remember lets the page sign in by itself on load (the browser keeps only a hint with the username and the end time in localStorage). While the day lasts the page's 30-minute idle logout is off and the server renews the session from the token. Logout deletes the token; it ends after 24 hours in any case.

## Sign out after no activity (15 Nov 2026)
- The previous team's page timer (frontend/admin/js/core.js, Preti) signed an admin out after 30 minutes without a click
  or key press, with a warning popup 2 minutes before. The 30 minutes is now a setting: User Management, Sign-in card,
  "Sign out after no activity for" (5 min to 8 h, or Never; 30 minutes by default), the same for every admin. A System
  Admin changes it (`PUT /api/admin/sign-in-settings`, Audit Logs `ADMIN_IDLE_SIGNOUT_UPDATE`); every admin page asks
  for it when monitoring starts (`loadAdminIdleSetting`, after a login, a kept session or a remembered sign-in). Stored in
  `backend/data/sign-in-settings.json` (backend/core/idleSignOut.js).
- The notice is a calm dialog (`#idle-dialog`): "Still there?", a countdown in m:ss, Stay signed in and Sign out now;
  Esc counts as Stay signed in. 2 minutes of notice, 1 minute below 10 minutes. The popup with an emoji and the browser
  alert boxes are gone: after signing out by itself (or when the server session ended, the 401 path) the login page says
  why ("You were signed out after 30 minutes without activity.", "Your session ended. Please sign in again.").
- The latest activity of any admin tab of this browser counts (localStorage `adminLastActivity`), so a busy tab keeps an
  idle one signed in and closes its notice. Tab and the arrow keys count as activity too (keydown).
- Unchanged on purpose: a browser signed in with "Keep me signed in" is not signed out this way (12 Nov 2026, PR #21).
- The page's own requests (the Incidents count every minute) keep the 30-minute server session alive, so this page timer
  is what signs an idle admin out; a closed browser still loses its session after 30 minutes on the server.
