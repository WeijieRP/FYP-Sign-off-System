# Lost and found

**Owner:** shared

**Where the code is**

- backend/features/lostFound/store.js, backend/features/lostFound/contact.js (the encrypted contact); routes inside backend/features/admin/routes.js and backend/features/feedback/routes.js
- frontend/feedback/js/lostFound.js, frontend/admin/js/lostFound.js

**What it does**

Visitors report a lost item from the kiosk (with a photo); admins list, export and update the reports. Reports older than the keep period (12 months by default, set on the Visitor Data Archive page, optionally only resolved ones) are saved to the archive zip with their item photos, contact details encrypted, and then deleted (docs/features/archive.md).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/lost-found-reports` | backend/features/admin/routes.js |
| PATCH | `/api/admin/lost-found-reports/:id/status` | backend/features/admin/routes.js |
| POST | `/api/admin/lost-found-reports/:id/contact` | backend/features/admin/routes.js |
| POST | `/api/admin/lost-found-reports/export.csv` | backend/features/admin/routes.js |
| POST | `/api/feedback/lost-found` | backend/features/feedback/routes.js |

**The contact is encrypted** (26 Nov 2026, Jun Kai)

- New reports store the contact like visitor emails: `auth.encryptEmail` (AES-256-GCM, the same ENCRYPTION_KEY) into `contact_info_encrypted` (migration 010); `contact_info` stays empty.
- The admin list never sends a contact, only `has_contact`. A System Admin sees it after typing their password again (`POST .../:id/contact`, audit VIEW_LOST_FOUND_CONTACT). The CSV export is a POST with the password and holds the decrypted contacts (audit DOWNLOAD_LOST_FOUND_CSV).
- The staff alert email is sent at the kiosk with the contact the visitor typed, before it is saved.
- The visitor archive copies the encrypted value as it is.
- Reports saved before the change: after a backup and `npm run db:migrate`, run `npm run lostfound:encrypt-contacts` (a dry run that names the database and counts the rows), then `npm run lostfound:encrypt-contacts -- --apply`. On a PC set up with the installer (no npm there), in `C:\RPXperienceKiosk\app`: `runtime\node\node.exe database\encrypt-lostfound-contacts.js`, then the same with `--apply` (the installer keeps backups in `C:\RPXperienceKiosk\data\backups`). Until then old reports are shown through the same password check.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- The staff alert email's "View attached item photo" is a relative link and nothing is attached (feedback/routes.js 1535-1561 old).

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
