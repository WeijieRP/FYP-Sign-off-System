# Pulse screen

**Owner:** Role 2, Wei Jie

**Where the code is**

- backend/features/pulse/routes.js
- frontend/pulse/

**What it does**

Live sentiment wall: today / week / month counts, newest pledges, badge earners and a preview of tree visitors. Polls /api/pulse/summary on a fixed interval.

<!-- <Jun Kai start> -->
Role 3 hook (Visitor Data Archive, marked in routes.js and pulse.html): All-Time Pledges counts every pledge ever made, archived and deleted ones included (backend/features/archive/deletedCounts.js); its note says so. The today, week and month counts and the lists still show only what is on show. See docs/features/archive.md.
<!-- <Jun Kai end> -->

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/pulse/summary` | backend/features/pulse/routes.js |
| GET | `/pulse` | backend/kioskServer.js |

**Task-sheet items for this feature**

- Corrected pulse screen layout for the 7 m by 2 m wall.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- "Digital Leaves" is the length of a LIMIT 80 query, so it caps at 80 and counts a different set than the tree (pulseRoutes 226, 247).
- Shows pledges that moderation rejected (pulseRoutes 193).
- Badge earners print names regardless of consent (low priority: every visitor is stored as long-term).

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
