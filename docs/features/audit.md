# Audit logs

**Owner:** shared

**Where the code is**

- routes inside backend/features/admin/routes.js; table audit_logs
- backend/core/audit.js: the same logAudit for feature routers (the Visitor Data Archive writes VISITOR_ARCHIVE_SETTINGS, _RUN, _AUTO, _UNLOCK, _UNLOCK_FAILED, _DOWNLOAD, _DECRYPT, _DELETE_FILE and _EXPIRE)
- frontend/admin/js/audit.js

**What it does**

Every admin action is logged and listed with filters and CSV export (since 31 Oct logAudit records every action; text target ids go into target_type).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/audit-logs` | backend/features/admin/routes.js |

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Fixed 19 Nov 2026: the Download button of the Audit Logs page called `/api/admin/logout-audit` "to log the download". That route is the Logout, so every download wrote a LOGOUT line and signed the admin out. The call is gone. The file it builds puts every cell in quotes and a ' in front of text that starts with = + - @, because a username typed at the login and a browser's user agent both land in it.
- Several routes write the audit row before the role or password check succeeds (old 3545, 3647, 4182, 4368, 4516, 4738, 5090), and EDIT_USER named the target instead of the actor (old 3850; fixed 19 Nov 2026, it names the admin who made the edit). Since 19 Nov 2026 these routes ask for a sign-in first, so the row is only written for a signed-in admin and carries the name of the session, not a name sent by the browser.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
