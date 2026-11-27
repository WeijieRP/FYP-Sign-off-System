# Photo frames (overlays)

**Owner:** Role 1, Zihan

**Where the code is**

- routes still inside backend/features/admin/routes.js (/overlays) and backend/features/feedback/routes.js (/api/feedback/overlays); files in assets/overlays/
- frontend/admin/js/overlays.js

**What it does**

Admins upload desktop and mobile frame images per theme; the kiosk draws the chosen frame over the photo.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/overlay/:id` | backend/features/admin/routes.js |
| GET | `/api/admin/overlays` | backend/features/admin/routes.js |
| POST | `/api/admin/overlays` | backend/features/admin/routes.js |
| DELETE | `/api/admin/overlays/:id` | backend/features/admin/routes.js |
| GET | `/api/feedback/overlays` | backend/features/feedback/routes.js |

**Task-sheet items for this feature**

- RP photo props.

**Pop-ups in the kit look** (26 Nov 2026, Jun Kai; the user asked for every pop-up to match the app)

- Add overlay opens in the page's side panel, where the details of an overlay show too. Name, theme ID (filled in from the name until it is changed) and a desktop and a mobile picture with a preview each. The server rules are checked in the panel first, each under its own field: a name, a theme ID of lowercase letters and numbers that no other overlay uses, PNG or GIF pictures of at most 10 MB. The old Display order field is gone: the server always puts a new overlay at the end of the list, so the panel says which number it gets. After adding, its details open.
- Escape or Cancel on a form with something typed in it asks "Drop this overlay?" first.
- The preview is a kit dialog with both pictures, the file of each and a Download button each; Escape and Close shut it.
- Delete asks in the kit confirm, naming the overlay. A failed load says so on the page with Try again. No browser alert or confirm box is left in overlays.js.
- Checked with build-check/check-overlay-popups.js (20 steps: empty form, used theme ID, wrong file type, a real add with test pictures, preview, delete, dropping a draft, dark mode, phone).
- Still open (server side, not changed): deleting an overlay removes only its row, its two picture files stay in assets/overlays.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- The required Display Order field is discarded on save (overlays.js 723; routes 4513, 4690 old).
- Preview onclick breaks on names with an apostrophe (overlays.js 131).
- POST /overlays overwrites the live overlay files when the theme id already exists (routes 759-761, 4657 old).
- schema.sql 289 seeds a Tech mobile overlay path that does not exist (needs a migration, not an edit of the frozen schema).

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
