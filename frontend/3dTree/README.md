# Ketapang River | Stage 4

A self-contained web scene for the ESG Centre tree screen. The centrepiece is the full-grown Ketapang exported from the refined Blender tree, with its bark and leaf-vein textures embedded.

## Run on Windows

1. Extract the entire ZIP and open the extracted folder in VS Code.
2. In the project, start the servers (`node startAll.js`), set Admin → Digital Tree Adjustment → Display 2D/3D Tree to **3D Tree**, and open `/3dTree`. On its own, open `3dTree.html` with **Live Server** (remove its `<base href="/3dTree/">` line first). With Python installed, you can also run `py -m http.server 8000` in the extracted folder and visit `http://localhost:8000/`.
3. The opening view centres the Ketapang, with the river, banks and forest visible across the 7 m × 2 m display. **Enable sound** starts the ambience. **Wind now** previews a gust.

On a wall-shaped screen such as the 7 m x 2 m display (3.5:1), the camera moves closer and aims a little lower so the tree fills the height as the main focus (`wallDistance` and `wallAimDrop` in `tree-view.js`), and the panels move to the sides (the `min-aspect-ratio: 12/5` rule at the end of `scene.css`). Ordinary screens keep the original view.

**Year Review.** The bottom-right button opens the same year review book as the 2D tree (`year-review.js`, styles at the end of `scene.css`): turn through the years, see each year's leaf count, and **View Tree** shows that year's review in the heading; **Live** returns to the live tree. It reads `/api/tree/years` and `/api/tree?year=`.

**Admin settings.** Admin > Digital Tree Adjustment > 3D Tree Settings sets the weather (live or a manual time of day and rain), the rain area, the river level, the slow orbit, sound and volume, the soil cutaway, which on-screen panels are shown, and the title box (text, opacity, blur, corners, padding, position). `tree3d-settings.js` reads them from `/api/parameters` every 5 seconds and applies a change by operating the page's own controls, so hidden panels still work and someone using the on-screen controls is not overruled until the next change. "Wind gust now" and "Play sunset now" run once on the screen.

**Feedback leaves.** `feedback-leaves.js` puts one leaf per feedback of the year on the tree, using the RainTree leaf model in `/assets/Tree/3dTreeLeaves/`, with the 2D tree's leaf behaviour: each leaf gets its own spot on the outer canopy (random, kept between refreshes, never overlapping) and its own angle; a new feedback's leaf appears at the bottom middle of the screen at twice its size and stays there for 12 seconds (SHOWCASE_MS in feedback-leaves.js), drifting gently with its name level so the visitor can find and read it, then slowly floats up to its place like a falling leaf in reverse (swinging gently from side to side and rocking like a cradle, the swings dying away as it shrinks and settles onto its twig; several new leaves take turns at the bottom middle, each appearing once the one before has started floating up); leaves are placed where the viewer sees them, on screen and not under the title box; a new visitor's leaf glows green for a minute; each leaf shows its visitor's name as on the 2D tree (lying on the leaf, centred in the middle of its blade and along its midrib so it turns with the leaf, wrapped inside the blade in up to three lines of whole words with "…" when too long, the same font size on every leaf, never upside down or mirrored; the admin can turn names off); every leaf is drawn on top of the foliage so the tree's own leaves never cover it (nearer leaves over farther ones, never overlapping each other as the viewer sees them; when the view turns round the tree, by dragging, the arrow keys or the slow 24h orbit, every leaf stays where it is on the tree at its own angle, without turning or moving, and a leaf the view leaves round the back fades away instead of showing through until the view comes back), is never darker than a set lightness so it stands out on the canopy, and shows its veins: the leaf model's own vein relief (its normal map) shades it as if lit from the upper left and the faint vein lines of its picture are strengthened (VEIN_RELIEF and VEIN_LINES in feedback-leaves.js); changing the leaf scale spaces the leaves out again for the new size; it shows the same leaves as the 2D tree (the 2D Maximum Visible Leaves newest, none at growth stage 0, all of a reviewed year), so past that count the oldest leaf falls; and Year Review's View Tree shows that year's leaves. New feedback is checked every 5 seconds from `/api/tree`. The admin's 3D Leaf Adjustments set the new and older leaf colours, how long a leaf counts as new, and the leaf scale. A VIP's leaf (a name in the admin's VIP Management, as `/api/tree` marks it or as `/api/tree/vip-names` lists it) is gold with the 2D tree's gold pulse; the admin's 3D VIP Leaf Adjustments set its gold, its scale and the glow, and a change to the VIP list shows within about 5 seconds (at once in the same browser, through the `tree-vip-refresh` signal).

A local or hosted HTTP server loads the bundled models. The scene uses WebGL 2. Manual weather works offline when the scene is served locally. Live Singapore needs internet access to the weather feeds.


## Leaf placement and animation

The admin's 3D Tree Visualization Parameters are the 2D tree's Visualization Parameters for the 3D tree (saved in `tree3dParameters`, used by `feedback-leaves.js`): the leaf area (how much of the canopy's width and height leaves may sit on, and moved up or down; 2D: Leaf Canopy Width, Height and Top Offset), the leaf refresh interval (how often new feedback is checked, 5 seconds by default), leaf opacity, how long a new leaf takes to fade in, stays at the bottom middle (12 seconds) and floats up (7.2 seconds), how long the oldest leaf takes to fall (4.2 seconds), and Maximum Visible Leaves (shared with the 2D tree). Maximum Visible Leaves is first in, first out: at 100, the 101st feedback makes the oldest leaf fall and the new one joins. The falling leaf drops smoothly like a real leaf: it lets go gently, glides down in one wide curve out from the tree (no zigzag), rocking softly and turning slowly, and settles on the ground as it fades; when more leaves are on the tree than fit side by side on the canopy at their size, they are all made just small enough to fit. A leaf joins light and turns dark after "A leaf stays light for" (3D Leaf Adjustments, in minutes or hours, for example 1 hour), fading over a few seconds: light green to dark green, or, with badge leaf styling on (off by default), a light shade of its badge's colour to a dark shade of it, as the 2D tree tints new leaves. VIP leaves stay gold.

## Growth stage

The tree grows in the same five stages as the 2D tree: 0 Bare Trunk, 1 Early Growth, 2 Young Canopy, 3 Mature Canopy and 4 Full Canopy. It is the same setting as the 2D tree's (`treeParameters.treeStage`), set in the admin's 3D Tree Growth Stage (or the 2D Tree Display), so both trees always match. In **Auto** (`treeStageMode: 'auto'`) the tree grows by itself: the server reports the stage for this year's leaf count in `/api/parameters` (`backend/features/parameters/treeStage.js`), so when the count reaches a stage's minimum (for example 10 leaves for stage 2) both trees move to that stage within about 15 seconds. In **Manual** the tree stays at the chosen stage. `tree-stage.js` loads that stage's model, `/assets/Tree/3dTreeLeaves/Ketapang_Stage_0.glb` to `Ketapang_Stage_4.glb` (stage 4 is the same tree as `ketapang-stage-4.glb`, which is also the fallback if a stage's model cannot be loaded). Stages 0 to 3 were exported smaller, so they are scaled up (`YOUNG_STAGE_SCALE`) to grow towards stage 4, and their own patch of soil is left out. The birds perch on the nearest branches of the stage shown, the wind drops leaves from its canopy (none from the bare trunk), and the feedback leaves sit on its canopy (none at stage 0). When the admin saves a different stage, the page reloads into it within about 5 seconds. Add `?stage=0` to `?stage=4` to the address to try a stage without changing the setting.

## Tree view

The camera keeps one fixed, close framing with the tree as the main focus: on a laptop screen the canopy fills the width, and on the 3.5:1 wall the tree fills the height with the river and hills either side (frameHeight and frameWidth in `tree-view.js`). Zooming is off (no scroll, pinch or **+**/**−**), so every screen always shows the tree at this size. Drag on the scene or use the arrow keys to orbit the tree.

**24h orbit** moves the camera at 15° per hour while the scene is visible. It pauses during camera input and resumes a few seconds afterward. It starts on unless reduced motion is enabled. Select the button to toggle it.

## Weather and sky

- **Live Singapore** starts automatically and displays the local time and sky period alongside the rain status. The sky moves through **Sunrise**, **Day**, **Sunset** and **Night** as Singapore time advances.
- **All Singapore** enables rain when any gauge in the latest [NEA rainfall report](https://data.gov.sg/datasets/d_6580738cdd7db79374ed3152159fbd69/view) records rain. The readout shows the number of wet gauges. NEA publishes readings every five minutes, and the scene checks for a new report every minute.
- **Rain area** lets you select a named Singapore area, including Jurong West, Woodlands and Yishun. The scene uses the closest reporting gauge to that area's reference point. The wider area list comes from [NEA's area metadata](https://data.gov.sg/datasets/d_3f9e064e25005b0e42969944ccaf2e7a/view). If the area list is temporarily unavailable, the three built-in areas and any named rain gauges are available.
- Choose **Use my location** and allow location access to follow the nearest rain gauge as you move. The detected area name is approximate, and location coordinates stay in your browser. Use HTTPS or localhost for browser location access. You can select an area directly if location access is unavailable.
- The readout marks missing or stale readings as unavailable. When recent rain data is unavailable, the sky follows the Singapore clock and the scene stays dry.
- [Open-Meteo](https://open-meteo.com/en/docs) supplies local sunrise and sunset times, cloud cover and weather codes. The scene uses approximate local sunrise and sunset times while that feed is unavailable.
- **Manual** gives you **Sunrise**, **Day**, **Sunset** and **Night**, with a gentle 16-second fade when you switch. **Play sunset** takes about 42 seconds from daylight through sunset to moonlit night. If you start it after dark, the scene first eases into daylight through sunrise. The **Rain** button works with any manual sky, including at night.
- Manual rain includes lightning and delayed thunder. Live mode adds thunder when the weather feed reports thunderstorms alongside rain. Enable sound to hear the thunder. The system's reduced-motion setting suppresses bright lightning pulses.
- Two cloud layers drift at different speeds through daylight, sunrise, sunset, night and rain.
- At night, soft moonlight brings out the island, banks and forest floor, and the river takes on a brighter blue tone.

## River level

The **River level** panel shows the simulated water height relative to the island bank mark. At 100%, the water reaches that mark. The river surface rises over the lower banks and drops again as the reading changes. Fish, ducks and floating leaves follow the surface.

| Level | Modeled bank height |
| --- | --- |
| Normal | Below 70% |
| High | 70% to below 90% |
| Danger | 90% and above |

**Auto (rain)** responds gradually to the scene's rain intensity and drains after the rain eases. Use **Preview Normal**, **Preview High** or **Preview Danger** to show each level during a demonstration. The scale and thresholds are for the scene simulation. For real-world Singapore water-level updates and flood alerts, see [PUB's flood monitoring information](https://www.pub.gov.sg/Public/KeyInitiatives/Flood-Resilience/Flood-Forecasting-and-Monitoring).

## Birds and wind

Birds fly and perch while the Ketapang keeps its steady matte shading. **Wind now** or an automatic gust drops one or two textured leaves. Some fall directly into the river, and a later gust can lift settled leaves off the island. A leaf makes a small ripple and a soft splash when it touches the water. The current carries it downstream until it fades from view.

Select **Enable sound**, then **Wind now** to preview a splash. Wait about nine seconds before sending another gust to see settled leaves lift off the island.

## Explore the forest

- The forest behind the Ketapang has a tall canopy, shorter trees, woody shrubs and ferns. Wildflowers, mushrooms, fallen logs, moss, lichen, lianas and epiphytes add detail at ground and trunk level.
- A small creek flows down the left bank into the river, with wet-bank reeds and local spray. Look for the plantain squirrel, water monitor, frog, butterflies and ground beetles.
- **Soil life** opens a 3D cutaway of litter, topsoil and subsoil, with roots, fungal threads and enlarged microbe symbols.

## Add to an existing website

Keep the extracted files together in a folder such as `public/ketapang-river/`. Embed its page wherever the tree screen goes.

```html
<iframe
  src="/ketapang-river/index.html?embed=1"
  title="Ketapang River, full-grown Stage 4"
  style="display:block;width:100%;aspect-ratio:7/2;border:0"
  allow="fullscreen; autoplay; geolocation"
  allowfullscreen
></iframe>
```

| URL option | Behaviour |
| --- | --- |
| `embed=1` | Compact view with the controls |
| `orbit=off` | Start with automatic orbit paused |
| `weather=live` | Start with Live Singapore weather enabled |
| `weather=manual` | Start in manual Day mode |
| `quality=low` | Optional performance mode: lighter model placement and adaptive lower resolution |
| `clean=1` | Show the landscape with attribution. Press **H** to toggle the controls. |

The opening camera fits the canopy and roots within the 7:2 frame, with the animated valley visible on both sides.

## Image clarity and 3D assets

The background has 238 taller trees at default quality, with an understory of shorter trees and shrubs. Red and copper Ketapang foliage is mixed among green trees, gold Yellow Flame and pink Trumpet Tree-inspired groves, and low riverbank shrubs. Two 3D mountain ridges wrap around the valley and appear in the river reflections. The main Ketapang has a matte mix of deeper greens, olive and muted copper, with the original leaf veins and bark textures.

The default view uses multisample anti-aliasing, smoothed leaf-mask edges, trilinear mipmaps and up to 16× anisotropic texture filtering. The render buffer follows device pixels up to 2× CSS resolution, subject to a 20-million-pixel budget and the GPU's maximum buffer size. It no longer automatically reduces resolution when the default scene is busy. For example, a 7,000 × 2,000-pixel output fits that budget. The optional `quality=low` mode retains adaptive resolution for slower hardware.

The scene loads all visible 3D meshes and their source materials from the bundled GLBs. Image textures, including the sky panorama and bank surfaces, are embedded in those files. Anti-aliasing smooths edges at the display's native resolution.

## Reuse the models

The ZIP contains 21 GLB files. The website loads 19 at a time, with two alternate models for the low-quality mode.

| In `assets/models/` | Contents |
| --- | --- |
| `ketapang-stage-4.glb` | Textured mature tree, exposed roots, branches and individual broad leaves |
| `river-terrain.glb` | River valley, riverbed and centre island, with loam and gravel materials |
| `river-water.glb` | Water surface fitted to the mapped shoreline and low banks |
| `river-hawk.glb` | Textured hawk with separate body and wing groups |
| `barramundi.glb`, `mallard.glb` | Textured fish and swimming duck model |
| `forest-tree.glb`, `forest-tree-distant.glb` | Two detail levels of the smaller Stage 4 Ketapang, with textured leaves and branches |
| `river-rock.glb`, `river-grass.glb`, `river-ferns.glb` | Scanned rock and authored plants |
| `river-mountains.glb`, `river-mountains-low.glb` | Two levels of detail for the wooded mountain ridges |
| `forest-habitat.glb`, `forest-habitat-low.glb` | Two levels of detail for moss, wildflowers, mushrooms, logs, reeds, vines, epiphytes and the creek |
| `forest-blossoms.glb` | Yellow Flame and Trumpet Tree flowers |
| `forest-wildlife.glb` | Squirrel, monitor lizard, frog, beetle and three butterfly variants |
| `forest-soil.glb` | Soil layers, roots, fungi, microbes and litter |
| `ketapang-drift-leaves.glb` | Four textured leaves used for falling and floating animations |
| `river-sky.glb` | Sky dome with the embedded panorama |
| `river-weather.glb` | Rain and spray droplets and four branching lightning meshes |

Import the GLBs into Blender through **File → Import → glTF 2.0**. The website places the models and applies the live weather, water shaders, camera controls and wildlife motion. Those effects play when you open the served scene. See `CREDITS.md` for source licences.
