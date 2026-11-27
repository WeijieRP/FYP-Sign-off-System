# Pledgeboard

**Owner:** Role 1, Zihan (decided 31 Oct 2026; it is on nobody's task sheet)

**Where the code is**

- backend/features/pledgeboard/routes.js
- frontend/Pledgeboard/
- frontend/admin/js/pledgeboard.js (moderation tab)

**What it does**

Public list of pledges with likes and a search box; phones reach it after submitting feedback. The admin tab approves or rejects pledges and edits the topic list.

**The admin page** (26 Nov 2026, Jun Kai, admin redesign option A picked by the team)

- A card on top lists every pledge that waits for a decision, most liked first, with Approve and Reject. Only a pledge with a negative tone can wait; the others are approved at once.
- The ranking table follows: most liked first, with chips for All, Approved, Waiting and Rejected, a search by name or pledge, and 25 pledges a page. The rank is the place among all pledges, also when the list is filtered.
- A pledge with a negative tone offers only the two other choices (for example Reject and Back to waiting for an approved one). Its buttons are switched off while a decision is on its way, so a double click saves once, and the result or an error is a line on the page.
- Any state other than approved or rejected (an old "flagged" value too) counts as waiting, because the public board shows only approved pledges.
- Known issue (not changed): formatPledgeRow in backend/features/pledgeboard/routes.js approves every pledge whose tone is not "negative", so a pledge the tone check marks "needs_review" is shown on the public board without a decision.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/pledgeboard` | backend/features/pledgeboard/routes.js |
| GET | `/api/pledgeboard/admin/pledges` | backend/features/pledgeboard/routes.js |
| PUT | `/api/pledgeboard/admin/pledges/:feedbackId/status` | backend/features/pledgeboard/routes.js |
| GET | `/api/pledgeboard/admin/topics` | backend/features/pledgeboard/routes.js |
| PUT | `/api/pledgeboard/admin/topics` | backend/features/pledgeboard/routes.js |
| GET | `/api/pledgeboard/check-like/:feedbackId` | backend/features/pledgeboard/routes.js |
| POST | `/api/pledgeboard/like/:feedbackId` | backend/features/pledgeboard/routes.js |
| GET | `/api/pledgeboard/pledges` | backend/features/pledgeboard/routes.js |
| GET | `/api/pledgeboard/topics` | backend/features/pledgeboard/routes.js |
| DELETE | `/api/pledgeboard/unlike/:feedbackId` | backend/features/pledgeboard/routes.js |
| GET | `/pledgeboard` | backend/kioskServer.js |

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Phones are always bounced off /pledgeboard: server.js 150 needs a session flag that nothing sets.
- Unlimited likes: the identity is a browser-made string sent in the body (Pledgeboard.js 65, routes 161).
- The public /pledges API returns every visitor's survey answers and photo ids (routes 62).
- One check-like request per pledge on every search keystroke (Pledgeboard.js 386).
- Fixed 19 Nov 2026 (by Role 3, because the admin page calls them): the moderation and topic routes had no auth. `GET /admin/pledges`, `PUT /admin/pledges/:feedbackId/status`, `GET /admin/topics` and `PUT /admin/topics` now start with `auth.requireAuth` (any signed-in admin role, since every role sees the Pledgeboard page of the admin screen). The same router is mounted on the kiosk server (port 3003), where nobody signs in, so there these four are always refused. "Moderated by" is the admin of the session, not a name sent by the browser. A new `/admin` route in this file has to start with `auth.requireAuth` too, or the contract check "sign-in" fails.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
