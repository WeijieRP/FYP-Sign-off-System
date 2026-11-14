# Digital tree (2D and 3D)

**Owner:** Role 2, Wei Jie

**Where the code is**

- backend/features/tree/routes.js
- frontend/tree/, frontend/3dTree/
- frontend/admin/js/tree.js (Digital Tree Adjustment tab), frontend/admin/js/tree3d.js (its 3D Tree Settings tab), backend/features/parameters/tree3d.js (3D settings defaults and checks), and the leaf / background / vip-leaf / treeParameters routes still inside backend/features/admin/routes.js

**What it does**

The wall display. /api/tree returns this year's visitors as leaves; tree.js places them around the trunk, animates falling leaves and VIP gold leaves, and polls for new feedback. The admin tab controls growth stage, backgrounds, leaf images and the title box. /3dtree is only served when the admin switches the display mode to 3D. The 3D page is the self-contained Ketapang River scene (frontend/3dTree/3dTree.html with scene.js and its modules, three.js bundled in vendor/, models and audio in assets/); see frontend/3dTree/README.md. The admin's 3D Tree Settings tab sets the 3D page's weather, rain area, river level, orbit, sound, soil cutaway, which on-screen panels show, and its title box (the same settings as the 2D title box); they are saved as `tree3dParameters` through PUT /api/admin/parameters/tree3dParameters and the 3D page (tree3d-settings.js) applies them from /api/parameters within about 5 seconds. Its 3D Leaf Adjustments set the feedback leaves on the 3D tree (frontend/3dTree/feedback-leaves.js, the RainTree leaf model in assets/Tree/3dTreeLeaves): new and older leaf colours, how long a leaf counts as new, leaf scale (how many leaves: the same as the 2D tree, its Maximum Visible Leaves and growth stage); there is no leaf upload for 3D. Its 3D VIP Leaf Adjustments set the gold VIP leaves (VIPs are the names in VIP Management): their gold, scale and gold glow. The 3D tree grows through the same stages 0 to 4 as the 2D tree (the same treeStage, also settable in the admin's 3D Tree Growth Stage panel), showing the Ketapang_Stage_0 to 4 models in assets/Tree/3dTreeLeaves (frontend/3dTree/tree-stage.js); the /3dTree page reloads into a newly saved stage. The 3D view has one fixed zoom (frontend/3dTree/tree-view.js); when it is turned round the tree, every feedback leaf stays where it is on the tree, without turning.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/3dtree` | backend/server.js |
| GET | `/3dTree` | backend/kioskServer.js |
| POST | `/api/admin/parameters/background` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/leaf` | backend/features/admin/routes.js |
| GET | `/api/admin/parameters/leaf/list` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/leaf/revert` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/leaf/select` | backend/features/admin/routes.js |
| GET | `/api/admin/parameters/tree-background/list` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/tree-background/select` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/tree-background/upload` | backend/features/admin/routes.js |
| PUT | `/api/admin/parameters/treeParameters` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/vip-leaf` | backend/features/admin/routes.js |
| GET | `/api/admin/parameters/vip-leaf/list` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/vip-leaf/revert` | backend/features/admin/routes.js |
| POST | `/api/admin/parameters/vip-leaf/select` | backend/features/admin/routes.js |
| GET | `/api/tree` | backend/features/tree/routes.js |
| GET | `/api/tree/vip-names` | backend/features/tree/routes.js |
| GET | `/api/tree/years` | backend/features/tree/routes.js |
| GET | `/tree` | backend/kioskServer.js |
| GET | `/tree-demo` | backend/server.js |
| GET | `/tree-demo/` | backend/server.js |

**Task-sheet items for this feature**

- 3D tree animation with a moving leaf container; smoother 2D animation; replace or enhance the 4 growth stages.
- New leaf appears at the bottom centre for 10 to 15 s before joining the tree.
- Event-driven refresh instead of polling.
- Corrected pulse screen layout (deliverables list).

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- Live tree polls every 5 s regardless of leafRefreshInterval, 4 requests and a full rebuild each time (tree.js 2042).
- Auto growth stage is computed once when the admin saves; nothing re-evaluates it as leaves arrive (the thresholds are stored and reloaded into the form since 31 Oct).
- Empty number boxes save 0 and the wall uses hidden defaults (admin/js/parameters.js + tree.js 411).
- Tree keeps archived rows that pulse and pledgeboard hide (treeRoutes 112).
- Default background path wrong in parameters/store.js 185 (black wall on a fresh install).
- param-tintDurationHours input missing so the badge tint duration is always 0.

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
