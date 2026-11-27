# VIP visitors

**Owner:** shared

**Where the code is**

- routes inside backend/features/admin/routes.js; table vip_management
- frontend/admin/js/vips.js; gold leaves in frontend/tree/tree.js

**What it does**

Names on this list get a gold leaf on the tree. A gold leaf is never archived by the Visitor Data Archive, so it stays on the tree with its name (see "VIP leaves are never archived" in [archive.md](archive.md)).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/vips` | backend/features/admin/routes.js |
| POST | `/api/admin/vips` | backend/features/admin/routes.js |
| DELETE | `/api/admin/vips/:name` | backend/features/admin/routes.js |

**Where the VIP list is** (26 Nov 2026, Jun Kai)

- The VIP list is a card on the Tree Leaves page (VIP B), for a System Admin only. The sidebar has no VIPs link any more: it only opened Tree Leaves, so it showed the same page twice. A System Admin who searches the sidebar for VIP finds Tree Leaves, marked "Has: VIPs" (`data-also` on the link, sidebar.js). An old call to showPage('vip') still opens Tree Leaves with the card in view (vips.js loadVipManagementData).

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
