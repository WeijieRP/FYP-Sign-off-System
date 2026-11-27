# Email and badges

**Owner:** Role 3, Jun Kai

**Where the code is**

Look (12 Nov 2026, picked by the user from mock-ups): a status line on top says whether the kiosk can send email (the System Health login check; Check again re-runs it), how many thank-you emails went out in the last 7 days (feedback.email_sent_at) and how the last test went (backend/data/email-last-test.json, no address kept): GET /api/admin/email/status, which never returns a password. Beside the settings, a preview shows the real thank-you email for a sample visitor: GET /api/admin/email/preview calls sendThankYouEmail with visitOptions.previewTransport, a stand-in transporter that keeps the message instead of sending it (real sends are unchanged).

- backend/features/email/service.js (transport, badges, templates), configStore.js, templateStore.js
- email routes still inside backend/features/admin/routes.js and backend/features/feedback/routes.js
- frontend/admin/js/email.js

**What it does**

The email account set up on this page also sends the emails of a forgotten admin password (the code and link, "your
password was changed", and "your email was changed" to the old address): see docs/features/users.md.

Sends the thank-you and badge emails through Gmail, Outlook or custom SMTP from the settings saved in the admin page; badge rules decide which badge a visitor earns.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/badge-email-templates` | backend/features/admin/routes.js |
| PUT | `/api/admin/badge-email-templates` | backend/features/admin/routes.js |
| GET | `/api/admin/email-config` | backend/features/admin/routes.js |
| PUT | `/api/admin/email-config` | backend/features/admin/routes.js |
| POST | `/api/admin/email-config/test` | backend/features/admin/routes.js |
| GET | `/api/feedback/email-status` | backend/features/feedback/routes.js |
| POST | `/api/feedback/send-email` | backend/features/feedback/routes.js |
| POST | `/api/feedback/test-email` | backend/features/feedback/routes.js |
| GET | `/api/test-email-service` | backend/kioskServer.js |

**Task-sheet items for this feature**

- Set the sender email address from the admin page (exists: Email Management, sender field).

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Credentials live in backend/config/defaults/emailConfig.json (tracked from the previous team) and are copied to backend/data/ at boot; rotate them.
- initEmailService always reports success, so the startup log and GET /api/test-email-service lie (service.js 1085).
- The transport reloads only in the server.js process; the kiosk server keeps stale credentials until restart; the custom provider insists on user+pass.
- Fixed 12 Nov 2026 (confirmed 19 Nov 2026): the visitor name was inserted raw into the thank-you HTML. The name and the pledge are escaped.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
