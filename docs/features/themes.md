# Admin themes

**Owner:** Role 3, Jun Kai (decided 31 Oct 2026)

**Where the code is**

- routes inside backend/features/admin/routes.js; table saved_themes
- frontend/admin/js/themes.js

**What it does**

Colour themes for the admin page itself, saved per admin user.

**The Style & Theme page** (26 Nov 2026, Jun Kai, redesign option B)

- Saved themes are picture cards on top (at most 6 per account): a strip of the theme's colours, Apply (asks first when there are colour changes that are not saved, because Apply replaces the overall colours and saves them), Rename on the card itself, and Delete. The card next to them saves the current colours as a new theme.
- Every page is a row that folds open, one at a time; the first is the overall theme (tagged Global). A row says whether its page follows the overall theme or has its own colours. The editor (the switch "Use the overall theme on this page", the colour groups) waits in a hidden holder and moves into the open row, so a rebuild of the rows never removes it.
- The preview is a small admin page (header, sidebar, card, buttons) in the colours of the open row.
- "Save colour changes" keeps the colours for this account (browser storage). The page says when there are changes that are not saved yet, and every message is a line on the page instead of a popup, except the questions before Apply, Delete, Reset all and copying the overall colours.
- Colours from storage or a saved theme only reach the page as plain #hex values (themeSafeColor), and theme names are shown as text.
- Known gap: the colours of a page are not mapped onto the new card look of the redesigned pages yet (their own selectors still name the old classes), so a page with its own colours only changes where old elements remain. Mapping the theme onto the new look is a separate step. The three old class names that the new page reuses (.theme-settings-form, .theme-group-title, .theme-preview) were taken out of the lists, so a dark card colour never paints the editor behind its dark text.
- Opening the page loads the stored colours again, so changes that were not saved are dropped and nothing says unsaved any more. "Use it now" on a new theme applies it at once, like Apply.

**A theme on the new look (option A, "tinted glass", picked by the team 26 Nov 2026)**

- A saved theme or a page's own colours reach the rebuilt pages through the kit's colour variables (themes.js: themeKitColours, themeKitLight, themeKitDark), not through old selector lists. Old-style pages (Tree Adjustment, Live Pulse) keep their selector lists.
- A colour that is still the built-in default was not chosen and changes nothing, so an account that never opened Style & Theme looks exactly like the kit (a snapshot of every rebuilt page, light and dark, matches main).
- The card colour tints the glass cards only when every text that will sit on them reads 4.5:1: the theme's card texts when they are readable there, otherwise the kit's, and the kit's red warnings. A dark card colour is therefore left out in light mode; the header and sidebar still take the theme.
- The button colour becomes the accent: buttons, chips, links and focus rings. The sidebar, including the open item, keeps following the sidebar colours of the theme (Navbar settings in Style & Theme). It is darkened only as far as needed for white text and for links on the card (4.5:1), and the button text is the theme's when it reads on that colour, otherwise white.
- Dark mode takes only the accent, from its own small stylesheet (#dynamic-theme-dark-accent; the light theme sheet is switched off in dark mode): buttons keep the filled colour when white text reads on it and it stands out from the dark card (3:1), links and focus rings get a lighter shade that reads on the dark card (4.5:1). Signing out clears it.
- A page with its own colours gets the same rules, limited to that page (#users-page .ui-card and so on).
- Status tags, danger buttons, notices, table heads and charts keep their own colours. The retention badges keep their own theme option.
- The Style & Theme preview uses the same rules, so it shows what the pages will really look like.
- Links read --l3-link (falls back to the accent). In dark mode the kit's own link colour is #60a5fa: the button blue read only about 3:1 on the dark cards. Chosen chips use the button text colour instead of a fixed white.
- Checked with build-check/check-theme-map.js (18 steps: Emerald and Navy cards themes, light and dark, all 23 rebuilt pages, a page with its own colours, old-style pages, a Light/Dark switch without a reload, sign out), theme-snapshot.js with theme-compare.js (untouched account and the old default theme against main), and theme-reach.js.

**Starter themes** (26 Nov 2026, Jun Kai)

- Style & Theme has a Starter themes row under the saved themes. For now it holds Emerald: a very light mint page (#ECFDF5), a white header and sidebar, dark green texts and emerald buttons (#047857, white text reads 5.5:1 on it). The user asked for a better looking green than the dark green header and strong light green of the mock-ups; Emerald was my pick of three (Sage, Emerald, Teal) and was built after two hours without an answer.
- Use this theme saves it as one of the admin's own themes (POST /api/admin/saved-themes, one of the 6 places) and uses it at once. If the admin already has a theme called Emerald, the button says Apply and uses that one, so no second copy is made. With all 6 places used the button is off and the card says to delete a saved theme first.
- It changes nothing for an admin who does not pick it. In dark mode only its accent shows, like every theme (option A above).
- The list is THEME_STARTERS in themes.js; another starter is one more entry there.
- Checked with build-check/check-starter.js (11 steps).

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/saved-themes` | backend/features/admin/routes.js |
| POST | `/api/admin/saved-themes` | backend/features/admin/routes.js |
| DELETE | `/api/admin/saved-themes/:id` | backend/features/admin/routes.js |
| PUT | `/api/admin/saved-themes/:id` | backend/features/admin/routes.js |
| PUT | `/api/admin/saved-themes/:id/activate` | backend/features/admin/routes.js |
| GET | `/api/admin/saved-themes/active` | backend/features/admin/routes.js |
| POST | `/api/admin/saved-themes/deactivate-all` | backend/features/admin/routes.js |

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Fixed 19 Nov 2026: Save Theme always failed, because it read colour inputs that no longer exist (js/themes.js). The colours now come from themeSettings, where the swatches put them; a colour that was never changed is saved with its default. The swatches on a saved theme card use colour names a theme has today, so a card is no longer grey.
- Fixed 26 Nov 2026 (sweep after the rebuilt pages): selectors of the old pages that still matched kit parts of the rebuilt pages, and painted them with the theme colours !important, were taken out: the Decrypt and Re-encrypt buttons of Feedback and Archived Feedback, the bare label rules of Start Screen Text and Operating Hours, the Refresh and Save buttons of Photo Timer, and the Email page's card, label and button rules (its card keys are empty now, like every other rebuilt page, until the theme is mapped onto the new look). A check (build-check/theme-reach.js on the test copy) opens every page with an old light theme and a dark card theme and lists each theme rule that reaches inside a card or a kit button: only the retention badges are left, which are their own theme option. The default long-term badge colour is now #15803D instead of #2EAD00, because white text on the old green read only 3:1.
- Fixed 26 Nov 2026: saving a new theme as the one in use sometimes left no theme in use, because the switch off of the other themes and the insert of the new one ran at the same time; the insert now waits for the switch off (POST /api/admin/saved-themes).
- Fixed 26 Nov 2026: theme card swatches were always grey. The strip now shows up to five colours of the theme.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.

## Light / Dark mode (12 Nov 2026, supervisor meeting 04 admin UI review)
- One button in the top bar, left of the user name: a moon in light mode, a sun in dark mode. The choice is kept per
  browser (`localStorage.adminColorScheme`) and also applies to the login page.
- `frontend/admin/js/colorScheme.js` is loaded in `<head>` right after `admin.css`, so a dark page never flashes
  white. It sets `data-theme` on `<html>` and builds, once per page load, a dark twin of every colour rule in
  `admin.css` under `html[data-theme="dark"]`: light surfaces become dark (keeping a hint of their hue), dark text
  becomes light, light lines become dim, mid colours (a blue button, a red badge) stay. Every colour declaration of a
  rule is copied, changed or not, so the cascade between rules stays as in light mode. Pages added later follow
  without extra CSS.
- Colours that page scripts write into `style=""` get the same treatment while dark mode is on (a MutationObserver),
  and go back to their light values when light mode returns.
- `admin.css` holds only the dark values of the theme variables (`--theme-*`, the greys, the login card) and the button.
- The Style & Theme Settings colours are made for light mode: they rest while dark mode is on (the
  `#dynamic-theme-styles` element gets `media="not all"`). The Style & Theme preview is a small admin page, so since
  26 Nov 2026 it turns dark with the page (dark admin colours with only the theme accent, as themeKitDark) and follows a
  switch at once (updatePreview listens to `admin-color-scheme`).
- Previews of screens that have no dark mode keep their light look in dark mode, like the real screens (user, 26 Nov
  2026: "if it does not have a dark mode like gmail, leave it"). None of the kiosk screens and no email has a dark mode.
  `ADMIN_LIGHT_ONLY` in colorScheme.js lists their roots (the Kiosk Settings screens, Questions, Start Screen Text,
  Photo Timer, Feedback QR Code, the Live Pulse card, Badge Emails, the Mail Account email, the Tree Leaves live tree);
  every dark twin carries `:not(:where(those, those *))` (no extra specificity), the roots get the light values of the
  theme variables back, and their inline colours are not darkened. A new preview of such a screen only needs the class
  `ui-light-only`. The hand-written dark copies of the kiosk preview, the photo timer camera and the badge email are gone.
  Checked with build-check/check-previews.js (21 steps: every preview photographed in light mode and again after a switch
  to dark, the pictures must match; the theme preview must turn dark and back).
- Chart.js graphs get light text and grid lines; the Hardware graphs redraw at once (the `admin-color-scheme` event)
  and the dark-slate Disk line turns light grey.
- Checked with a script that opens all 27 admin pages in dark mode and lists text under 3:1 contrast: 87 spots before
  the fixes, 12 after, and those 12 are the same in light mode (greyed-out Previous / Next buttons, white text on the
  green and amber buttons, the light theme preview).
