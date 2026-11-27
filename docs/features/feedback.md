# Feedback screen (kiosk)

**Owner:** Role 1, Zihan

**Where the code is**

- backend/features/feedback/ (routes.js, validationRules.js, pledgeSentiment.js)
- frontend/feedback/ (feedback.html, feedback.css, js/*.js in load order: core, bear, lostFound, flowPages, faceDetect, faceFilters, init, inactivity, questions, submit, photo, overlays, navigation, backNavigation, events, config, language)

**What it does**

The visitor flow on the tablets: landing page with the QR code and the RP bear, consent, details, feedback questions, pledge, photo with face detection and filters, thank-you page and email. Server side it validates the submission, encrypts the email, stores the feedback and answers, picks badges and sends the thank-you email.

<!-- <Jun Kai start> -->
Role 3 hooks (Visitor Data Archive, marked in routes.js): the visitor number adds the feedback the archive deleted (backend/features/archive/deletedCounts.js), so a number is never handed out twice; GET /api/feedback/visitor-count also returns totalPledges (every pledge ever made, archived and deleted ones included), which the thank-you page's "total pledges" and "crossed N pledges" use (navigation.js); and the background save goes through backend/features/archive/saveGate.js, so an archive never deletes a returning visitor in the middle of their save. See docs/features/archive.md.
<!-- <Jun Kai end> -->

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| POST | `/api/feedback/feedback/:id/retry-email` | backend/features/feedback/routes.js |
| GET | `/api/feedback/languages/languages.json` | backend/features/feedback/routes.js |
| POST | `/api/feedback/save-photo` | backend/features/feedback/routes.js |
| POST | `/api/feedback/save-processed-photo` | backend/features/feedback/routes.js |
| POST | `/api/feedback/submit-feedback` | backend/features/feedback/routes.js |
| GET | `/api/feedback/test-db` | backend/features/feedback/routes.js |
| GET | `/api/feedback/visitor-count` | backend/features/feedback/routes.js |
| POST | `/api/feedback/visitor-passport` | backend/features/feedback/routes.js |
| GET | `/feedback` | backend/kioskServer.js |

**Task-sheet items for this feature**

- Face detection must block the photo when no face is in front (already the case; supervisor confirmed the task-sheet wording was inverted).
- RP photo props and a more interactive RP bear.
- Pledge required, feedback skippable; admin-editable titles and button names. (skip pledged removed, skip feedback added)
- Display is 7 m by 2 m.
- Application able to remotely monitor tablet battery status (not built yet; a web page can only read the battery through navigator.getBattery, which needs HTTPS and Android Chrome).

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Hidden rating inputs survive form.reset(), so the next visitor can submit the previous visitor's rating (old feedback.js 2284, 2468-2473).
- After a successful submit the kiosk never auto-resets: the idle warning appears over the thank-you page and hangs (old 4662, 4686-4717).
- The upload page keeps the previous visitor's photo preview and an enabled Continue button after a reset (old 3108).
- A theme reset leaves a stale overlay preview, so the previewed frame differs from the saved one (old 2268, 4057).
- The on-screen keepsake shows the raw unframed capture because processedPhoto is nulled before the thank-you page (old 3880, 5146).
- An empty allowedPhotoFormats list rejects every upload: the shipped config was repaired on 31 Oct, but config.js still has no fallback for an empty array (old 3043).
- Empty feedbackMessages blank the page text; setText has no fallback and runs again after translations (old 6028, 6774). The shipped blanks were restored on 31 Oct.
- The photoRequired rule never takes effect: Skip Photo is always offered and the server accepts photoSkipped (old 2968; validationRules).
- Returning to the landing page depends on an async /form-ui fetch: blank kiosk when it fails (old 1018, 5864).
- initializeCamera has no in-flight guard: double taps leak a MediaStream, Back during getUserMedia leaves the camera on (old 3648).
- The capture countdown is never cancelled on navigation and fires on a hidden page (old 3740).
- Android tablets are classified as "mobile", so the in-page camera, filters and boomerang are unreachable on the real hardware and the upload input opens the rear camera (old 2066; html 774).
- "View Pledgeboards" on tablets redirects back to /feedback (server.js 150 gate).
- The thank-you page always says the photo was emailed (html 1079).
- Overlay load failure silently produces an unframed keepsake; schema.sql seeds a wrong Tech mobile overlay path (old 4502; schema 289).
- face-api script and model come from the internet; offline, every capture and upload fails with a camera error (old 1170, 3655).
- Upload size is checked on the JPEG file but the server checks the re-encoded PNG (old 3331; routes 466).
- One failed questions fetch permanently disables the feedback step until a reload (old 2557).
- form-ui background overrides the parameters background on every return to landing (old 5846).
- Idle warning and timeout toast appear on the landing page itself (old 2165).
- confirmStyle writes its error to an alert on a hidden page (old 4590).
- "N questions answered" counts unanswered questions (old 4629).
- No touch-reachable language switcher in the shipped configuration (html 147).
- With pledge disabled, Back from the photo-choice page returns to the disabled pledge page (old 5783).
- Lost and Found is unreachable: both openers are inside HTML comments (html 155, 944).
- MediaPipe and face-api load from CDNs: keep local copies for the day the centre has no internet.
- overlaySettings and photoSettings.supportedFormats are saved by the admin but read by nothing (admin/js/parameters.js 14586 old layout).
- Backend (feedback/routes.js, old line numbers): submit-feedback answers "success" before anything is saved and DB failures are only logged (718, 724-733).
- The "Photo Thank You Email" toggle cannot stop the email (OR with badgeEmailEnabled, 706); the photo is attached unconditionally (743).
- device and theme go unsanitised into saved filenames (474, 556): path traversal with a crafted POST; a non-string userName is a 500.
- School-impact report uses the PULSE_CAMPAIGN_GOAL env while pulse uses campaignSettings.pulseGoal (409).
- GET /api/feedback/test-db never answers (db.get without params, 1510); /languages/languages.json serves a file that does not exist (1594).
- Fixed 26 Nov 2026: POST /send-email, /test-email and /feedback/:id/retry-email need an admin sign-in, a photo name with a folder part is ignored, and an empty photo name no longer marks every row as sent. Still no caller in the pages.
- Visitors are told the email is on its way before the transporter is known to work; failures leave no trace and retry-email has no UI (706-712).
- Retention is hard-coded to long-term on both ends (634; LONG_TERM_RETENTION) so temporaryRetentionDays never applies; stale privacy texts.
- Required questions are enforced client-side only (validationRules never checks answers).
- Unmatched data URLs are decoded as garbage and saved as .png (282-298); allowedPhotoFormats is never enforced server-side.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
