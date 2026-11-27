# Archive, export and retention

**Owner:** Role 3, Jun Kai

**Where the code is**

Look (12 Nov 2026, picked by the user from mock-ups): Ready to archive, Automatic archiving, Last archive and Archive folder are four plain tiles with big numbers (no colour on top, at the user's request); a long folder path is cut with an ellipsis. The history shows the 5 newest archives, with Show all, Show fewer and, past the first 50, Show more. Feedback and pledges, Lost and found reports and Include photos sit side by side at the bottom as coloured cards (blue, green, pink).

- backend/features/archive/exportRoutes.js (mounted at /api/admin/data-export) and retention.js (scheduled clean-up)
- archive, decrypt and download routes still inside backend/features/admin/routes.js
- frontend/admin/js/archive.js, archiveDeletion.js, dataExport.js, encryption.js, feedbackDeletion.js, photos.js, emailPopup.js

**What it does**

Marks feedback as archived, previews and deletes by selection or date, exports Excel, CSV, PDF and photo zips after a password unlock, decrypts emails for display, and deletes expired data on a timer.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/archive` | backend/features/admin/routes.js |
| POST | `/api/admin/archive/delete-by-date` | backend/features/admin/routes.js |
| POST | `/api/admin/archive/delete-selected` | backend/features/admin/routes.js |
| POST | `/api/admin/archive/preview-deletion` | backend/features/admin/routes.js |
| GET | `/api/admin/archive/stats` | backend/features/admin/routes.js |
| POST | `/api/admin/archive/update-status` | backend/features/admin/routes.js |
| POST | `/api/admin/bulk-decrypt-archive` | backend/features/admin/routes.js |
| GET | `/api/admin/data-export/audit-log` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/feedback/archived` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/feedback/full` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/feedback/not-archived` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/photos/all` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/photos/archived` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/photos/not-archived` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/school-impact/csv` | backend/features/archive/exportRoutes.js |
| GET | `/api/admin/data-export/school-impact/pdf` | backend/features/archive/exportRoutes.js |
| POST | `/api/admin/data-export/unlock` | backend/features/archive/exportRoutes.js |
| POST | `/api/admin/decrypt-email` | backend/features/admin/routes.js |
| POST | `/api/admin/decrypt-emails` | backend/features/admin/routes.js |
| POST | `/api/admin/download-archive-excel` | backend/features/admin/routes.js |
| POST | `/api/admin/download-archive-photos` | backend/features/admin/routes.js |
| GET | `/api/admin/download-audit-excel` | backend/features/admin/routes.js |
| POST | `/api/admin/download-excel` | backend/features/admin/routes.js |
| GET | `/api/admin/download-file/:filename` | backend/features/admin/routes.js |
| POST | `/api/admin/download-photos` | backend/features/admin/routes.js |
| POST | `/api/admin/retention-cleanup/run` | backend/features/admin/routes.js |
| POST | `/api/admin/verify-photo-access` | backend/features/admin/routes.js |

## Visitor Data Archive (task-sheet point 2)

**Where the code is**

- backend/features/archive/visitorRoutes.js (mounted at /api/admin/visitor-archive, system_admin only)
- visitorRunner.js (what is due, the preview, the run itself: write, check, delete, clean up; the history; recovery after a restart)
- visitorWriter.js (the zip: JSON, CSV, photos and manifest; reading and checking an archive back), visitorFiles.js (archive folder rules, photo paths, file names), visitorSchedule.js (keep periods, Singapore-time cutoffs, when an automatic run is due), visitorSettings.js (the settings file and its checks), visitorScheduler.js (the timer started by server.js)
- backend/core/audit.js (audit rows for the feature routers), backend/core/zip.js (reading zips back with yauzl), database/migrations/004_visitor_archives.sql (the history table)
- deletedCounts.js (counts of deleted rows per Singapore day, written in the delete transaction; table deleted_record_counts, migration 005) and saveGate.js (kiosk saves and delete steps take turns; table visitor_save_gate, migration 006)
- archivedLeaves.js (the leaves that stay on the digital tree after an archive: the label, what is kept, what the tree routes read back; table archived_leaves, migration 008)
- Hooks in other roles' files, each marked `<Jun Kai start>`: backend/features/feedback/routes.js (the visitor number adds the deleted feedback, GET /api/feedback/visitor-count also returns totalPledges, every pledge ever made; the background kiosk save goes through the save gate), frontend/feedback/js/navigation.js (the thank-you page's pledge totals use totalPledges), backend/features/pulse/routes.js and frontend/pulse/pulse.html (All-Time Pledges counts every pledge ever made), backend/features/tree/routes.js (`GET /api/tree` adds the year's kept leaves, `GET /api/tree/years` adds each year's kept and removed leaves), frontend/tree/tree.js and frontend/3dTree/3dTree.js (the year book says "· N archived"; the leaf card of a kept leaf shows the month, the year and "This visitor's details were archived.")
- frontend/admin/js/visitorArchive.js and the #visitor-archive-page block in frontend/admin/admin.html
- Settings: backend/config/defaults/visitor-archive-settings.json, copied to backend/data/ on first use; the automatic-run state is backend/data/visitor-archive-state.json
- Tests: tests/unit/visitorArchive.test.js, tests/unit/archivedLeaves.test.js, and the `--archive` step of tests/smoke.js (CI runs it; it also seeds a VIP leaf of the same age and checks that the archive leaves it alone)

**What it does**

Saves visitor records older than a keep period to one zip file per run on the server PC, then deletes them from the database. The keep period is set separately for feedback and for lost & found reports (12 months by default, in days, weeks, months or years). A run takes the visitors, their submissions with pledges, answers and likes, the raw and processed photos, and the lost & found reports with their item photos. The zip (JSON, CSV, photos and a manifest with a SHA-256 for every entry) is read back and checked before anything is deleted; the rows then go in one transaction, and the photo files are removed only after that, when no remaining row uses them. A visitor who came back recently, or records that changed while the file was being written, stay in the database. Emails stay encrypted exactly as in the database, and lost & found contact details are encrypted with the same key. Runs start from the page (with the admin's password) or on a schedule (daily, weekly, monthly or every N days; off by default; it needs "Delete the records") that catches up after the PC wakes from hibernation. The history lists every run; a run's records can be viewed after a password unlock, emails decrypted (audited), and the file downloaded, checked or deleted. Old zip files can expire after a set time (default: kept forever); a change that would delete existing files asks for the password first.

Running totals keep counting deleted records: every delete (this page, the old Permanent Data Deletion on Archived Feedback, and the Delete button on a Feedback Data or Archived Feedback row) adds how many feedback rows, pledges, tree leaves, visitors and lost & found reports it removed, per Singapore day of when each was made, to deleted_record_counts in the same transaction (counts only, no names or ids). The kiosk's visitor number ("You are visitor #N", the landing screen's visitor count), the pledge totals ("N total pledges" and "our school has now crossed N pledges" on the thank-you page, All-Time Pledges on Pulse: every pledge ever made, archived and deleted ones included, whatever their moderation) and the tree's year book add those counts back. Numbers that describe what is on show (the Pledgeboard, Pulse's today, week and month, the admin dashboard, which all leave out archived feedback) are not changed, and a returning visitor whose record was archived starts a new passport (the system has forgotten them on purpose).

Leaves stay on the tree (November 2026, after supervisor meeting 04). Each feedback row is also a leaf on the digital tree. The setting "Leaves on the tree" (`leaves` in the settings file) says what happens to that leaf when the Visitor Data Archive deletes the row:

- `keep` (default): the leaf stays and shows "Visitor".
- `initials`: the leaf stays; a visitor whose name the tree was showing (long-term consent) keeps their initials, the first letter of the first and of the last word of the name ("Jun Kai Tan" gives "J. T."). A name the tree was hiding, or a name with no letters, shows "Visitor", so archiving never shows more than the tree did before. A name whose initials would give it away also shows "Visitor": Chinese, Japanese or Korean characters (one character is a whole word, so "陈俊凯" would keep the surname) and names made of one-letter words ("A B").
- `remove`: the leaf goes with the records and is counted as a deleted leaf, as before this change.

For a leaf that stays, one row is written to archived_leaves in the same transaction as the delete, just before the feedback row goes: the feedback id (the leaf keeps its key), its created_at (it stays in its year and in the oldest-first order), the label, the badge key that decides the leaf colour (badge_keys holds the full list when a pledge had several topics), whether it was a VIP leaf, the archive run and when it was archived. Nothing else is kept: no name, email, pledge text, answers, photo paths, user id, device or IP, and the visit count is not kept either (a kept leaf is drawn at the size of a first visit). Only rows the tree was drawing leave a leaf (active, no flagged words): exactly the rows the delete used to count under the kind `leaf`. A row whose leaf stays is not counted under `leaf` in deleted_record_counts, so the year book never counts it twice; feedback, pledge, visitor and lost_found are counted as before, so the visitor number and the pledge totals do not change. The setting is read when a run starts, so a change only affects later archives. The other delete paths (Permanent Data Deletion on Archived Feedback and the per-row Delete) are deliberate removals: they leave no leaf and count it as deleted (VIP leaves aside, see the next paragraph). An export-only run changes nothing on the tree.

VIP leaves are never archived (supervisor, 18 Nov 2026). A submission that the tree draws in gold stays out of the Visitor Data Archive completely: it is not written to the zip and not deleted, so the leaf stays on the tree with its name and its pledge, and so does its visitor (the delete only removes a visitor who has no submission left). "Drawn in gold" is the tree's own rule: the visitor's name is on the VIP list (the VIP page, table `vip_management`, compared without case and outer spaces) and the submission has long-term consent, which is what makes the tree show the name. `vipLeafIds` in visitorRunner.js finds those submissions; the SQL only narrows the rows down by name and `archivedLeaves.isVipLeaf` decides, so a longer name that contains a VIP's name ("Grace Lim Tan" beside the VIP "Grace Lim") is archived as usual, and so is a submission of the same name that the tree shows as "Anonymous visitor". It applies everywhere the archive picks or counts rows: the automatic and manual runs, a run limited to chosen ids, the preview (`counts.vipLeaves`) and the Ready to archive tile (`due.feedback.vipLeaves`). The Archive dialog's Tree row and the tile's tooltip say "1 VIP leaf is not archived and stays on the tree as it is", and a run whose only matching records are VIP leaves answers "Nothing to archive: the only records that match these dates are VIP leaves, and VIP leaves stay on the tree". A name taken off the VIP list is an ordinary visitor again at the next archive. Permanent Data Deletion on the Archived Feedback page keeps VIP leaves too, both "by date" and "selected" (`POST /api/admin/archive/delete-by-date`, `/delete-selected`, and the count of `/preview-deletion`): a delete by date would otherwise take the VIP's pledge with everything else of that age, without the admin picking it. The answer says "1 VIP leaf was kept: a VIP leaf stays on the tree. To delete one, take the name off the VIP list first.", and when only VIP leaves matched nothing is deleted (409). The lookup for both is `archivedLeaves.vipLeafIds`. Nothing else removes a VIP leaf by itself: the consent clean-up (retention.js) only touches temporary-consent rows, and a VIP leaf has long-term consent by definition; the 90-day soft archive only sets `archive_status`, which the tree does not look at. So a VIP leaf stays however old it gets. The one way left is on purpose: the Delete button on a single row of Feedback Data, or taking the name off the VIP list. The tree shows one year at a time, so a VIP leaf stays on the tree of the year it was made (the tree itself is Role 2's).

The Archive dialog's summary has a Tree row ("12 leaves stay on the tree without names", "... with initials", or "12 leaves leave the tree"), README.txt in the zip gets one sentence about it, and a finished run shows the number in its result and under its records in the History table (counted from archived_leaves by run, `counts.leavesKept` and `counts.leavesWithInitials` in the run object; `counts.leaves` and `counts.leavesNamed` in the preview). The zip, its manifest and the viewer are unchanged.

A kiosk save always goes before a delete. The kiosk thanks the visitor first and saves in the background (look the visitor up by email, add the visit, insert the pledge); if an archive deleted that visitor in between, the pledge used to be lost without anyone seeing an error. Now a save adds a row to visitor_save_gate while it runs, from either server process (server.js or kioskServer.js), and renews it every 30 seconds (a first-time download of the pledge sentiment model can take minutes); the delete step checks that table before every statement and before its commit, and when a save shows up it rolls back, waits for the save and starts the delete again (the visitor then has a new pledge and stays). After 10 such restarts the run ends as "Saved records kept" and says to run it again. scripts/setup/Purge_Actuator.js and Datastore_Assembly.js clear deleted_record_counts, visitor_save_gate and archived_leaves along with the visitor tables (feedback ids start again from 1 after a purge; a kept leaf whose id is in the feedback table again is never drawn, and the next archive of that id replaces it).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/visitor-archive/overview` | backend/features/archive/visitorRoutes.js |
| PUT | `/api/admin/visitor-archive/settings` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/folder-check` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/preview` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/runs` | backend/features/archive/visitorRoutes.js |
| GET | `/api/admin/visitor-archive/runs` | backend/features/archive/visitorRoutes.js |
| GET | `/api/admin/visitor-archive/runs/:id` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/runs/:id/verify` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/unlock` | backend/features/archive/visitorRoutes.js |
| GET | `/api/admin/visitor-archive/runs/:id/download` | backend/features/archive/visitorRoutes.js |
| GET | `/api/admin/visitor-archive/runs/:id/records` | backend/features/archive/visitorRoutes.js |
| GET | `/api/admin/visitor-archive/runs/:id/photo` | backend/features/archive/visitorRoutes.js |
| POST | `/api/admin/visitor-archive/runs/:id/decrypt` | backend/features/archive/visitorRoutes.js |
| DELETE | `/api/admin/visitor-archive/runs/:id/file` | backend/features/archive/visitorRoutes.js |

**What other pages notice after an archive**

- Archived visitors leave the pledgeboard, the Feedback Data and Feedback Reports pages (those screens show what is in the database). On the digital tree their leaf stays, without the name and the pledge (see "Leaves stay on the tree" above): it keeps its colour and its gold VIP look, but it moves once to a new spot, because the tree places a leaf by its name among other things. With "Remove the leaf" the leaf goes and the year book adds "· N archived". The kiosk's "visitor #N", the pledge totals on the thank-you page and on Pulse, and the tree's year book keep their totals.
- On a development checkout, archiving deletes the previous team's photos that are tracked in git under uploads/; `git checkout -- uploads/` brings them back.

**Task-sheet items for this feature**

- Visitor data archiving to local disk with export and full deletion: done (the Visitor Data Archive page, November 2026). Leaves stay on the tree after an archive: done (November 2026). VIP leaves are left out of the archive: done (18 Nov 2026).
- Automatic daily archiving (Datastore_Assembly checks for a procedure and event that nothing creates): replaced by the page's own schedule, which runs inside server.js and catches up after hibernation.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Two dead routes (/archive/stats, /bulk-decrypt-archive) were fixed to use the promise pool, bcrypt and auth.decryptEmail; nothing calls them yet.
- Manual retention clean-up route (/retention-cleanup/run) has no button.
- Fixed in November 2026: archive hard-delete (the old Permanent Data Deletion) unlinked the photos before the SQL DELETE, with no transaction (old 3053, 3203). The DELETE now runs in one transaction with its deleted counts and takes turns with kiosk saves; the photos go after it, only for the rows it deleted. When a kiosk save is running it answers "try again in a minute" (409) after about 20 seconds instead of holding the page.
- Temporary retention is dead end-to-end: feedback/routes.js forces long-term (old 634) and the clean-up re-processes the same legacy rows forever, from both server processes (retention.js 149-252, 307-343).
- Fixed in November 2026: auto-archive (the 90-day soft archive) never ran on a PC that hibernates every night (old 6466-6487, a 24-hour interval that only counted uptime). It is now checked 2 minutes after the server starts and every 15 minutes, runs once per Singapore day and catches up after hibernation (last run in backend/data/auto-archive-state.json). New installs start with it off; an existing install keeps the setting it was last saved with (the old shipped default was on), so where it is on, the first check after the update moves every pledge older than the chosen age into Archived Feedback, off the Pledgeboard, Pulse's lists and the kiosk passport. A setting the page does not offer (for example 7 days, typed into the file) makes the check skip with a log line instead of stopping the server. "Run Archive Update Now" (POST /api/admin/archive/update-status) now needs a system admin login, like the Parameters page it sits on; it had no login check.
- Fixed 19 Nov 2026: CSV export turned 0 into a blank, had no formula neutralisation and printed raw Date strings. Every cell goes through `csvCell` in backend/core/csv.js now: 0 is kept, a date is YYYY-MM-DD HH:mm:ss in Singapore time, and text that starts with = + - @ gets a ' in front. POST /api/admin/data-export/unlock asks for a sign-in and checks the signed-in admin's own password.
- /archive/delete-selected and the data-export downloads answer 401 on a wrong password; the page now only logs out on the auth middleware's 401, but 403 would be the right status.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31; Visitor Data Archive added 2026-11-09, then the deleted counts, the save gate and the auto-archive timer fix the same day; leaves that stay on the tree added 2026-11-11. Update this page when you change the feature.
