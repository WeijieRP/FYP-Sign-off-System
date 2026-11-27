// Feedback leaves on the 3D ESG Tree: one RainTree leaf (assets/Tree/3dTreeLeaves) per feedback of the
// year, with the same behaviour as the 2D tree's leaves (frontend/tree/tree.js):
//   - each leaf has its own spot on the outer canopy, chosen at random but kept between refreshes,
//     never overlapping another leaf, and its own random angle;
//   - left and right leaves, as the 2D tree's LeftLeaf / RightLeaf pictures: the RainTree leaf as it is
//     is a right leaf, mirrored it is a left leaf (mixed at random, or one side, from the admin);
//   - new feedbacks' leaves are split into groups as the admin sets (leafBatchMode: into leafBatchCount
//     groups, 3 by default, or into groups of up to leafBatchSize leaves), evenly: a group appears together in a row at the bottom of the screen, below the tree, spread
//     evenly over its width (clear of the title box and the Year Review button), the same size, for 12 seconds
//     (SHOWCASE_MS, the admin's time), drifting gently with their names level; then they join the tree in no
//     set order, each at its own moment within BATCH_SPREAD_MS, slowly floating up to their places like
//     falling leaves in reverse: swinging gently from side to side and rocking like a cradle, the swings
//     dying away as they shrink and settle onto their twigs. Then the next group appears;
//   - leaves are placed where the viewer sees them: on screen, and not under the title box; while the tree
//     is growing (tree-growth.js) only on the foliage grown in so far, new ones further out as it spreads;
//   - a new visitor's leaf glows green for the first minute;
//   - the same leaves as the 2D tree: its "Maximum Visible Leaves" (leafFallThreshold) newest leaves, the
//     oldest falling when a new one arrives; none at growth stage 0 (bare trunk); all of a reviewed year's;
//   - Year Review's "View Tree" shows that year's leaves, "Live" the current ones;
//   - each leaf shows its visitor's name, as on the 2D tree: on the leaf itself, along its midrib so it turns
//     with the leaf, wrapped inside the blade (up to three lines, whole words, "…" when too long), the same
//     font size on every leaf, never upside down or mirrored;
//   - feedback leaves are never covered by the tree's own leaves: they are drawn on top of the foliage (as
//     the 2D leaves sit on top of the tree picture), nearer ones over farther ones, never overlapping each
//     other as seen by the viewer;
//   - the leaves stay on the side of the tree facing the viewer, and when the tree turns (the automatic turn,
//     dragging or the arrow keys) they glide smoothly with it, keeping to the canopy and facing the viewer; a
//     leaf that has glided to the edge (GLIDE_REACH) fades away and comes back in on the other side, so the
//     front always has its leaves (shownSpot); with the view still, every leaf is exactly at its spot;
//   - every leaf stays easy to see on the canopy: it is never darker than a set lightness;
//   - in the glowing look every leaf glows like a leaf of light, green, blue or orange by its visitor's badge
//     (Environmental, Social, Governance: ESG_GLOW_COLOURS), brightest in its middle, with glowing veins, a
//     bright outline in its own colour, a soft glow around it that breathes gently and spills round it (the bloom,
//     glow-look.js), and now and then a light sweeping across it (GLOW_FRAGMENT); its name is white
//     handwriting with a soft glow;
//   - the names' font style, weight, colour and size are the admin's (3D Leaf Adjustments: leafNameFont,
//     leafNameWeight, leafNameColor, leafNameSize; NAME_FONTS, useNameStyle), written again within one check
//     of a change; VIP names can have their own (3D VIP Leaf Adjustments: vipNameOwnStyle, vipNameFont,
//     vipNameWeight, vipNameColor, vipNameSize), otherwise they are written as the others;
//   - a VIP's leaf (a name on the admin's VIP Management list, as /api/tree marks it, or a name from
//     /api/tree/vip-names) is gold, with the 2D tree's gold pulse, at its own VIP scale, and a star of light
//     twinkling at its tip (in both looks).
// Colours (light green new, dark green older), left or right leaves, size and how long a leaf counts as
// new come from the admin's 3D Leaf
// Adjustments (tree3d-settings.js). New feedback is checked every 5 seconds from /api/tree.

import { THREE as T, GLTFLoader } from './vendor/three-runtime.js';
import { onTree3dSettings } from './tree3d-settings.js';
import { createLeafDetail } from './leaf-detail.js';
import { isGrown } from './tree-growth.js';
import { GLOW_LAYER } from './glow-look.js';
import { orbitCentre } from './tree-view.js';
import { onLiveUpdate, liveConnected, LIVE_FALLBACK_MS } from './live-updates.js';
import { measureSurface, canopyReachAt, onSurface, keepOnSurface } from './canopy-surface.js';

const LEAF_MODEL = '/assets/Tree/3dTreeLeaves/RainTree_Leaf_Final12.glb';
const MODEL_SIZE = 0.1;          // the leaf model is 10 cm across
const BASE_SIZE = 1.8;           // metres across at scale 1, so a leaf and the name on it read from across the room
const LEAF_INSET = 0.4;          // a leaf sits this many of its sizes in from the canopy's outside (canopy-surface.js)
const POLL_MS = 5000;            // as the 2D tree's live refresh
const RECENT_LANDING_MS = 2 * 60 * 1000; // on opening, leaves this recent fly in (2D: recentLandingWindowMs)
const GLOW_MS = 60 * 1000;       // a new visitor's leaf glows for a minute (2D: leafGlowDurationMs)
const GLOW_FADE_MS = 900;
const FALL_MS = 4200;            // 2D: leafFallDuration
const FLOAT_MS = 7200;           // a new leaf floats up for 7.2 to 8.4 seconds (slower than the 2D flight)
const NAME_FLIP_MARGIN = 0.44;   // a name turns over only when its leaf is 25 degrees past upright (no flicker)
const SHOWCASE_MS = 12000;       // a new leaf shows at the bottom middle of the screen this long before floating up
const APPEAR_MS = 900;           // how long it takes to fade in there
const STAGE_CLEAR_MS = 3000;     // the next group of new leaves appears this long after the one before has left
const BATCH_SIZE = 3;            // new leaves are split into this many groups (the admin's leafBatchCount), or
                                 // into groups of up to this many (leafBatchSize), as the admin chooses (leafBatchMode)
const BATCH_SPREAD_MS = 2500;    // a group's leaves leave for the tree within this, each at its own moment
const BATCH_ROW_WIDTH = 0.8;     // how far across the screen the group's row spreads (of half its width, each way)
const SHOWCASE_SIZE = 1.4;       // a new leaf in the row is this many times its size on the tree
const SHRINK_SHARE = 0.18;       // it is back to its own size this far into its float up (then floats at it)
const TINT_BOOST = 2.3;          // the leaf picture is mid grey: this brings the chosen colour back to strength
const NEON = new T.Color(0x39ff14);
const MIN_LIGHTNESS = 0.38;      // a leaf colour is shown at least this light (HSL), so it stands out on the canopy
const OLD_MIN_LIGHTNESS = 0.24;  // an older leaf's dark shade may be this dark, so it is clearly a dark shade
// The glowing leaf: a leaf of light in a vivid badge colour, as if lit from within, with a bright outline in
// its own colour (never white), glowing veins and a soft glow around it in its colour too (AURA). The leaf picture is an almost even grey
// (its veins only ~5% lighter) and its normal map has clear vein relief, so the main veins are found from
// the relief and the finer ones from the picture, keeping only clear lines. The edge is found from the
// picture's outline: blurred (a smaller copy of the picture, its mipmap) it fades towards the edge, so 1
// minus the blurred outline is high just inside the edge. The material's colour is the leaf colour boosted
// by TINT_BOOST (displayColour).
const VEIN_GLOW = 0.65;          // how brightly the veins glow
const RIM_GLOW = 0.6;            // how brightly the leaf's outline glows (in its own colour)
const SHIMMER_EVERY = 7;         // seconds between the light sweeps across a leaf (each leaf at its own time)
const SHIMMER_SWEEP = 1.3;       // seconds a sweep takes to cross the leaf
const GLOW_FRAGMENT = `
#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  const vec3 lumaWeights = vec3( .2126, .7152, .0722 );
  float veinPoint = dot( texture2D( map, vMapUv, -.6 ).rgb, lumaWeights );
  float veinAround = dot( texture2D( map, vMapUv, 2.5 ).rgb, lumaWeights );
  float lines = smoothstep( .05, .16, ( veinPoint - veinAround ) / max( veinAround, .05 ) );
  vec3 relief = normalize( texture2D( veinNormal, vMapUv, -.75 ).xyz * 2. - 1. );
  float ridges = smoothstep( .8, .95, dot( relief, normalize( vec3( -.45, .55, .7 ) ) ) );
  float vein = max( .55 * lines, ridges );
  // The outline: a thin bright line and a wider glow just inside it.
  float rimLine = smoothstep( .1, .5, 1. - texture2D( map, vMapUv, 1.5 ).a );
  float rimGlow = 1. - texture2D( map, vMapUv, 3.5 ).a;
  float middle = texture2D( map, vMapUv, 5. ).a; // 1 in the middle of the blade, less towards its edge
  vec3 tint = diffuseColor.rgb / ${TINT_BOOST.toFixed(2)};
  vec3 glow = mix( tint, vec3( 1. ), .2 );   // little white, so the colour stays vivid
  vec3 hot = mix( tint, vec3( 1. ), .55 );
  // The leaf's own colour at full brightness (its strongest channel at 1), for its outline: it glows in the
  // leaf's colour, never white.
  vec3 vivid = tint / max( max( tint.r, tint.g ), max( tint.b, .001 ) );
  // A light sweeping across the leaf now and then (shimmer: where the sweep is, from 0 to 1; off below 0).
  float sweep = shimmer < 0. ? 0. : exp( -pow( ( vMapUv.x * .8 + vMapUv.y * .6 - shimmer * 1.9 + .25 ) / .07, 2. ) );
  // Lit from within: brightest in the middle, deeper colour towards the edge, glowing veins and outline.
  diffuseColor.rgb = tint * ( .55 + .6 * middle * middle )
    + glow * ${VEIN_GLOW.toFixed(2)} * vein
    + vivid * ( .35 * rimGlow + ${RIM_GLOW.toFixed(2)} * rimLine )
    + hot * .7 * sweep;
  diffuseColor.a *= texel.a;
#endif
`;
const AURA = 0.3;                // the soft glow every leaf has around it, in its own colour (it breathes gently;
                                 // the bloom, glow-look.js, spreads its light further)
const NEON_SATURATION = 0.85;    // leaf colours are shown at least this saturated, so they glow vividly

// The natural leaf (with the admin's "Glowing look" off): the leaf picture in its colour, its veins shown.
// The picture is an almost even grey (its veins only ~5% lighter), while its normal map has clear vein
// relief. The leaf is unlit like the tree, so the relief is turned into shading here.
const VEIN_LINES = 6.0;          // how much the picture's own light vein lines are strengthened
const VEIN_RELIEF = 1.6;         // how strongly the vein relief shades the leaf (0 = flat)
const VEIN_FRAGMENT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  const vec3 lumaWeights = vec3( .2126, .7152, .0722 );
  // The picture's fine vein lines: how much lighter each point is than the leaf around it, strengthened.
  float veinPoint = dot( texture2D( map, vMapUv, -.6 ).rgb, lumaWeights );
  float veinAround = dot( texture2D( map, vMapUv, 2.5 ).rgb, lumaWeights );
  float veinLines = 1. + ${VEIN_LINES.toFixed(2)} * ( veinPoint - veinAround ) / max( veinAround, .05 );
  // The vein relief, lit from the upper left: raised veins catch the light, the blade between them less.
  vec3 relief = normalize( texture2D( veinNormal, vMapUv, -.75 ).xyz * 2. - 1. );
  float lit = dot( relief, normalize( vec3( -.45, .55, .7 ) ) );
  float evenLit = .7; // how much a flat leaf faces the light
  float veinRelief = 1. + ${VEIN_RELIEF.toFixed(2)} * ( lit - evenLit ) / evenLit;
  sampledDiffuseColor.rgb = vec3( veinAround ) * clamp( veinLines * veinRelief, .4, 1.75 );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

// The two looks of the feedback leaves: glowing (the admin's "Glowing look", on by default) or natural.
// Set once when the leaves are added (addFeedbackLeaves); the page reloads when the admin changes it.
// The fonts the admin can choose for the visitors' names (3D Leaf Adjustments, leafNameFont; the same list in
// backend/features/parameters/tree3d.js LEAF_NAME_FONTS and admin/js/tree3d.js), all fonts Windows has, then
// the browser's own; each with its line height as a share of the leaf (handwriting has small letters, so a
// little larger). 'auto' is the look's own font (LEAF_LOOKS name).
const NAME_FONTS = {
  // An elegant, narrow calligraphic hand, as signed on the leaf (so longer names fit).
  'elegant-script': { family: '"Monotype Corsiva", "Segoe Script", "Lucida Handwriting", cursive', lineHeight: 0.0145 },
  'handwriting': { family: '"Segoe Print", "Segoe Script", "Comic Sans MS", cursive', lineHeight: 0.0128 },
  'modern': { family: 'Inter, "Segoe UI", Arial, sans-serif', lineHeight: 0.012 },
  'rounded': { family: '"Trebuchet MS", Verdana, "Segoe UI", sans-serif', lineHeight: 0.012 },
  'classic-serif': { family: 'Georgia, "Palatino Linotype", "Times New Roman", serif', lineHeight: 0.0125 },
  'typewriter': { family: '"Courier New", Consolas, monospace', lineHeight: 0.012 },
};
const NAME_WEIGHTS = [400, 500, 600, 700, 800];

const LEAF_LOOKS = {
  glow: {
    fragment: GLOW_FRAGMENT, cacheKey: 'feedback-leaf-glow', aura: true, saturation: NEON_SATURATION,
    name: NAME_FONTS['elegant-script'], // handwritten names, as signed on the leaf
  },
  natural: {
    fragment: VEIN_FRAGMENT, cacheKey: 'feedback-leaf-veins', aura: false, saturation: 0,
    name: NAME_FONTS.modern, // clean bold names, 12% of the leaf (as the 2D tree's)
  },
};
let leafLook = LEAF_LOOKS.glow;

// How the names are written, as the admin chose: the canvas font, its line height on the leaf (the font's own
// times the admin's size, 0.7 to 1.4: larger names wrap onto more lines and are shortened with "…" sooner,
// fitName), its colour, and whether that colour is dark (then it gets a light edge instead of a dark one, so
// it stays readable). One style for the names (leafNameFont, leafNameWeight, leafNameColor, leafNameSize) and
// one for VIP names: their own (vipNameFont, vipNameWeight, vipNameColor, vipNameSize) when the admin ticks
// vipNameOwnStyle, otherwise the same.
function nameStyleOf(font, weight, colour, size) {
  const chosen = NAME_FONTS[font] || leafLook.name;
  const heavy = NAME_WEIGHTS.includes(Number(weight)) ? Number(weight) : 700;
  const hex = /^#[0-9a-f]{6}$/i.test(String(colour || '')) ? String(colour).toLowerCase() : '#ffffff';
  const asked = Number(size);
  const scale = Number.isFinite(asked) && asked > 0 ? Math.min(1.4, Math.max(0.7, asked)) : 1;
  const { r, g, b } = new T.Color(hex);
  return {
    font: `${heavy} ${NAME_FONT_PX}px ${chosen.family}`, lineHeight: chosen.lineHeight * scale, colour: hex,
    dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25, // (linear light) darker than a mid grey
  };
}
// Until the admin's settings are used (useNameStyle): bold white modern letters for every name.
const FIRST_NAME_STYLE = { font: `700 64px ${NAME_FONTS.modern.family}`, lineHeight: NAME_FONTS.modern.lineHeight, colour: '#ffffff', dark: false };
let nameStyles = { normal: FIRST_NAME_STYLE, vip: FIRST_NAME_STYLE };
// Returns a key that changes when either style changes (then every name is written again).
function useNameStyle(settings) {
  const normal = nameStyleOf(settings.leafNameFont, settings.leafNameWeight, settings.leafNameColor, settings.leafNameSize);
  const vip = settings.vipNameOwnStyle === true
    ? nameStyleOf(settings.vipNameFont, settings.vipNameWeight, settings.vipNameColor, settings.vipNameSize)
    : normal;
  nameStyles = { normal, vip };
  nameScroll = settings.leafNameScroll !== false; // long names scroll inside the leaf (or are shortened with "…")
  return [normal, vip].map(style => [style.font, style.lineHeight, style.colour].join('|')).join('||') + `|${nameScroll}`;
}

// A flat normal, for a leaf model without a normal map.
function flatNormalTexture() {
  const texture = new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}
// The name on the leaf, in the leaf model's own units (the leaf is 0.1 across, x from stem to tip).
// Measured from the leaf's outline: the middle of the blade (without the thin stem and tip) is at
// x -0.0034, z -0.0011, and every name is centred exactly there. A text box centred on that middle fits
// inside the blade at these widths for one, two and three lines (as LEAF_NAME_MIDRIB_WIDTHS on the 2D
// tree), with a little margin. Every name uses the same font size, so the same line height (the look's
// lineHeight, LEAF_LOOKS).
const NAME_CENTRE_X = -0.0034;
const NAME_CENTRE_Z = -0.0011;
// The leaf's tip, where a VIP's star of light shines: the model is a flat 0.1 card with the leaf's picture on
// it, and the picture's outline ends at x 0.048 on the midrib (its stem at x -0.043).
const LEAF_TIP = new T.Vector3(0.048, 0, 0.0004);
const NAME_BOXES = [            // lines -> widest box inside the blade, centred on its middle
  { lines: 1, width: 0.054 },
  { lines: 2, width: 0.054 },
  { lines: 3, width: 0.045 },
];
const NAME_FONT_PX = 64;          // canvas pixels per font size
// A long name scrolling inside the leaf (scrollingNameLabel; the admin's "Scroll long names", leafNameScroll):
const SCROLL_HOLD = 1.4;          // seconds the start of the name shows before it scrolls
const SCROLL_SPEED = 0.5;         // how fast: the name box's width each second, a steady reading pace
const SCROLL_GAP = 0.6;           // the gap before the name comes round again, as a share of the box
const SCROLL_INSET = 0.1;         // where the name starts in the box, as a share of it (inside the fade)
const SCROLL_FADE = 0.12;         // the soft fade at each end of the box, as a share of it
const SCROLL_MAX_CHARS = 60;      // longer names are cut there (very rare)
let nameScroll = true;            // the admin's "Scroll long names" (useNameStyle)
const NAME_LIFT = 0.0006;        // how far the name sits off the leaf surface, towards the viewer
const GOLD_GLOW = new T.Color(0xffd23f); // the 2D VIP leaf's gold glow (vipGoldPulse in tree.css)
// In the glowing look a VIP's gold leaf already glows like the others, so it is darker there, for its name to
// read clearly on it: the leaf dimmer, its gold pulse and the gold glow around it gentler (the natural look
// keeps the 2D tree's pulse: up to 18% brighter, with the gold glow at up to 70%).
const VIP_GLOWING = { leaf: 0.62, pulse: 0.03, halo: 0.14 };
// The natural look's VIP leaf: its gold pulse (up to 8% brighter) and gold glow (up to 35%), gentle, so its name
// reads. Both looks: the admin's VIP leaf brightness (vipLeafBrightness, 70% by default; 100% as at first).
const VIP_NATURAL = { pulse: 0.08, halo: 0.35 };
// At night (natural look) the leaves are in moonlight, as the tree is (matte-tree.js), but less dim, so they
// and their names stay easy to read; the glowing look lights them itself.
const NIGHT_LEAF = new T.Color(0.6, 0.65, 0.78);

// The admin's 3D Tree Visualization Parameters (the 2D tree's, for the 3D tree) can change the timings
// above: POLL_MS (leafRefreshMs), APPEAR_MS (leafAppearMs), SHOWCASE_MS (leafShowcaseSeconds), FLOAT_MS
// (leafFloatMs) and FALL_MS (leafFallMs); also the leaf area, opacity and badge colours.
const BADGE_LEAF_COLOURS = { // the 2D tree's default badge colours
  'feedback-completer': '#4a7c59', 'climate-champion': '#0f766e', 'renewable-innovator': '#f59e0b',
  'sustainable-living-advocate': '#16a34a', 'ocean-guardian': '#0284c7', 'governance-guardian': '#7c3aed',
  'social-champion': '#d97706',
  'multi-pledge': '#8b5a2b', // a visitor who chose several pledge topics: brown, unless the admin sets another
};
// The feedback leaves take the admin's badge colours in both looks (badgeColour, tintLeaf). With "Colour
// leaves by their badge" off, the glowing look's leaves glow in three colours, as the tree's own glowing
// leaves and the ESG Centre's concept: green for Environmental, blue for Social, orange for Governance, by the visitor's
// badge (Social Champion: Social; Governance Guardian: Governance; the climate, energy, living and ocean
// badges and Feedback Contributor: Environmental). The vivid colour while new, a dark shade of it later.
const ESG_GLOW_COLOURS = { environmental: '#2ee05a', social: '#2f8fff', governance: '#ff8a1f' };
const BADGE_ESG = { 'social-champion': 'social', 'governance-guardian': 'governance' };
// A VIP's leaf has a star of light twinkling at its tip (both looks), as the VIP leaf of the concept.
const SPARKLE_SIZE = 0.9;        // the star's size (its rays tip to tip), as a share of the leaf's size (small,
                                 // clear of the name)
const SPARKLE_EVERY = 2.4;       // seconds between its brightest twinkles
// A VIP's leaf on the tree turns gently from left to right and back, on its stem, as the viewer sees it: a
// slow, smooth swing (VIP_TURN_SECONDS for left, right and back again), VIP_TURN_ANGLE each way, so its name
// stays readable; each VIP leaf at its own moment. It starts gently once the leaf has settled on the tree
// (VIP_TURN_EASE_IN). The admin can turn it off (3D VIP Leaf Adjustments: tree3dParameters.vipTurn).
const VIP_TURN_ANGLE = (40 * Math.PI) / 180;
const VIP_TURN_SECONDS = 6;
const VIP_TURN_EASE_IN = 1.5;
const DEFAULTS = { showFeedbackLeaves: true, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e', leafSide: 'both', leafNewHours: 24, leafScale: 1, showLeafNames: true, leafNameScroll: true,
  leafAreaWidth: 100, leafAreaHeight: 100, leafAreaOffset: 0, leafRefreshMs: POLL_MS, leafOpacity: 1,
  leafAppearMs: APPEAR_MS, leafShowcaseSeconds: SHOWCASE_MS / 1000, leafFloatMs: FLOAT_MS, leafFallMs: FALL_MS, leafBatchMode: 'groups', leafBatchCount: BATCH_SIZE, leafBatchSize: BATCH_SIZE,
  badgeColours: true, badgeLeafColors: BADGE_LEAF_COLOURS,
  tree2d: { leafFallThreshold: 15, treeStage: 4, leafShowcaseSeconds: SHOWCASE_MS / 1000 },
  vipLeafColor: '#d4af37', vipLeafScale: 1, vipLeafBrightness: 70, vipGlow: true, vipSparkle: true, vipTurn: true,
  leafNameFont: 'auto', leafNameWeight: 700, leafNameColor: '#ffffff', leafNameSize: 1, // the names: the look's own font, bold, white, standard size
  vipNameOwnStyle: false, vipNameFont: 'auto', vipNameWeight: 700, vipNameColor: '#ffffff', vipNameSize: 1 }; // VIP names: as the others unless ticked

const normaliseName = name => String(name || '').trim().toLowerCase();

// ---------- small helpers (seeded random numbers as on the 2D tree) ----------

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function leafKey(visitor, index) {
  const id = visitor?.feedback_id || visitor?.id;
  if (id !== undefined && id !== null && String(id).trim() !== '') return `feedback:${String(id).trim()}`;
  return ['leaf', visitor?.created_at || '', visitor?.name || 'visitor', visitor?.badgeKey || '', index].join('|');
}

function timeOf(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function sortOldestFirst(visitors) {
  return [...visitors].sort((a, b) => {
    const byTime = (timeOf(a.created_at) ?? Number.MAX_SAFE_INTEGER) - (timeOf(b.created_at) ?? Number.MAX_SAFE_INTEGER);
    if (byTime !== 0) return byTime;
    return String(a.feedback_id || a.id || '').localeCompare(String(b.feedback_id || b.id || ''), undefined, { numeric: true });
  });
}

const smoothstep = (edge0, edge1, x) => {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
};

// The 2D flight's easing, cubic-bezier(0.4, 0, 0.3, 1): slow start, long gentle landing.
function flightEase(t) {
  const x1 = 0.4, y1 = 0, x2 = 0.3, y2 = 1;
  const bez = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const x = bez(x1, x2, s) - t;
    const dx = 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
    if (Math.abs(dx) < 1e-6) break;
    s = Math.min(1, Math.max(0, s - x / dx));
  }
  return bez(y1, y2, s);
}

// A leaf colour as shown: the chosen colour, lifted to at least minLightness so a dark leaf still stands out
// against the tree's own dark foliage (MIN_LIGHTNESS; an older leaf's dark shade OLD_MIN_LIGHTNESS, so it
// still reads as a dark shade of its colour) and, in the glowing look, to at least NEON_SATURATION.
function displayColour(hex, minLightness = MIN_LIGHTNESS) {
  const colour = new T.Color(hex);
  const hsl = {};
  colour.getHSL(hsl, T.SRGBColorSpace);
  colour.setHSL(hsl.h, Math.max(hsl.s, leafLook.saturation), Math.max(hsl.l, minLightness), T.SRGBColorSpace);
  return colour.multiplyScalar(TINT_BOOST);
}

// A badge colour's light shade (a new leaf) or dark shade (an older one), as light green and dark green
// for the plain leaves. The dark shade is still shown at least MIN_LIGHTNESS light (displayColour).
function badgeShade(hex, light) {
  const colour = new T.Color(hex);
  const hsl = {};
  colour.getHSL(hsl, T.SRGBColorSpace);
  const lightness = light ? Math.min(0.66, Math.max(0.52, hsl.l + 0.08)) : Math.min(0.3, Math.max(0.2, hsl.l - 0.2));
  colour.setHSL(hsl.h, hsl.s, lightness, T.SRGBColorSpace);
  return `#${colour.getHexString(T.SRGBColorSpace)}`;
}

// Fits a name inside the leaf as the 2D tree does (fitLeafName): whole words, as few lines as fit (up to
// three), and when even three do not fit, the last line shortened with "…". In the name's style (nameStyles).
const measureContext = document.createElement('canvas').getContext('2d');
function fitName(name, nameStyle) {
  measureContext.font = nameStyle.font;
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) words.push('Anonymous');
  const pxPerUnit = NAME_FONT_PX / (nameStyle.lineHeight / 1.1); // canvas px per leaf unit
  const widthOf = text => measureContext.measureText(text).width / pxPerUnit;
  const shorten = (text, width) => {
    if (widthOf(text) <= width) return text;
    let short = text;
    while (short.length > 1 && widthOf(`${short}…`) > width) short = short.slice(0, -1);
    return `${short.trimEnd()}…`;
  };
  for (const box of NAME_BOXES) {
    const lines = [];
    let line = '';
    let fits = true;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next) <= box.width) { line = next; continue; }
      if (!line) { fits = false; break; } // one word wider than the box
      lines.push(line);
      line = word;
    }
    if (fits) lines.push(line);
    if (fits && lines.length <= box.lines) return { lines, box, pxPerUnit };
  }
  // Too long for three lines: fill them, then shorten the last (or a single very long word) with "…".
  const box = NAME_BOXES[NAME_BOXES.length - 1];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || widthOf(next) <= box.width) { line = next; continue; }
    lines.push(line);
    line = word;
    if (lines.length === box.lines - 1) break;
  }
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length;
  lines.push(words.slice(used).join(' ') || line);
  const shortened = lines.slice(0, box.lines).map(text => shorten(text, box.width));
  return { lines: shortened, box, pxPerUnit, shortened: shortened.join(' ') !== words.join(' ') };
}

// The name drawn for the leaf, on a canvas the size of its box in the blade, in the admin's font, weight and
// colour (nameStyles: a VIP's may be its own; white by default). Glowing look: the letters glowing softly in their own colour over a
// soft dark shadow, so they read clearly on the bright leaf. Natural look, and dark letters in the glowing
// look: crisp letters with an edge, readable on any leaf colour (2D: white bold with a text shadow); the edge is
// dark, or light for dark letters.
// onGold: a VIP's name, on its gold leaf: always crisp letters with a strong dark edge (a soft glow washes out
// on the light gold).
function nameLabel(name, nameStyle = nameStyles.normal, onGold = false) {
  const fitted = fitName(name, nameStyle);
  // Too long for the leaf: shown in full, scrolling, when the admin's "Scroll long names" is on (nameScroll).
  if (nameScroll && fitted.shortened) return scrollingNameLabel(name, nameStyle, onGold, fitted.pxPerUnit);
  const { lines, box, pxPerUnit } = fitted;
  const height = lines.length * nameStyle.lineHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(box.width * pxPerUnit);
  canvas.height = Math.ceil(height * pxPerUnit);
  const context = nameContext(canvas, nameStyle, 'center');
  const linePx = canvas.height / lines.length;
  lines.forEach((line, i) => drawNameLine(context, line, canvas.width / 2, linePx * (i + 0.5), nameStyle, onGold));
  return { texture: nameTexture(canvas), width: box.width, height };
}

function nameContext(canvas, nameStyle, align) {
  const context = canvas.getContext('2d');
  context.font = nameStyle.font;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  return context;
}

function nameTexture(canvas) {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// One line of a name at x (as the context aligns it) and y, in the look's way (see nameLabel).
function drawNameLine(context, line, x, y, nameStyle, onGold) {
  const { colour, dark } = nameStyle;
  const behind = dark ? 'rgba(255, 255, 255, 0.85)' : onGold ? 'rgba(46, 26, 0, 0.92)' : 'rgba(8, 28, 14, 0.85)';
  // Natural look, dark letters, or a VIP's name on its gold leaf: crisp letters with an edge (a glow would blur
  // dark letters, and wash out on the gold).
  if (!leafLook.aura || dark || onGold) {
    // A thin light edge round dark letters (a thick one would cover them, so they would look white); on gold
    // a bolder dark edge.
    context.lineWidth = NAME_FONT_PX * (dark ? 0.07 : onGold ? 0.22 : 0.16);
    context.strokeStyle = behind;
    context.fillStyle = colour;
    context.strokeText(line, x, y);
    context.fillText(line, x, y);
    return;
  }
  // A soft dark shadow behind the letters, then the letters with a glow in their own colour.
  context.shadowColor = 'rgba(0, 16, 10, 0.75)';
  context.shadowBlur = NAME_FONT_PX * 0.14;
  context.fillStyle = 'rgba(0, 16, 10, 0.45)';
  context.fillText(line, x, y);
  context.shadowColor = `${colour}e6`;
  context.shadowBlur = NAME_FONT_PX * 0.2;
  context.fillStyle = colour;
  context.fillText(line, x, y);
  context.shadowBlur = 0;
}

// A long name in full on one line, scrolling inside the leaf's one-line name box (Owner: Role 2, Wei Jie): drawn
// twice, a gap apart, on a long canvas of which the box shows a window (texture repeat); the window slides along
// it (the update, by the texture's offset): it holds at the start for SCROLL_HOLD seconds, then moves at a steady
// SCROLL_SPEED (the name glides from right to left, so it reads from left to right) until the second copy is
// where the first began, which looks the same, so it goes round again seamlessly. Its ends fade (scrollFadeMap).
function scrollingNameLabel(name, nameStyle, onGold, pxPerUnit) {
  const box = NAME_BOXES.find(item => item.lines === 1) || NAME_BOXES[0];
  const text = [...String(name || '').trim().replace(/\s+/g, ' ')].slice(0, SCROLL_MAX_CHARS).join('');
  measureContext.font = nameStyle.font;
  const boxPx = box.width * pxPerUnit;
  const startPx = boxPx * SCROLL_INSET;
  const copyPx = Math.ceil(measureContext.measureText(text).width + boxPx * SCROLL_GAP);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(copyPx * 2 + boxPx);
  canvas.height = Math.ceil(nameStyle.lineHeight * pxPerUnit);
  const context = nameContext(canvas, nameStyle, 'left');
  for (const at of [startPx, startPx + copyPx]) drawNameLine(context, text, at, canvas.height / 2, nameStyle, onGold);
  const texture = nameTexture(canvas);
  texture.repeat.set(boxPx / canvas.width, 1);
  return {
    texture, width: box.width, height: nameStyle.lineHeight,
    scroll: { share: copyPx / canvas.width, travel: copyPx / (boxPx * SCROLL_SPEED) },
  };
}

// The scrolling name's soft ends: transparent at both edges of its box, fading in over SCROLL_FADE of it.
let scrollFadeTexture = null;
function scrollFadeMap() {
  if (scrollFadeTexture) return scrollFadeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  const fade = context.createLinearGradient(0, 0, canvas.width, 0);
  fade.addColorStop(0, '#000');
  fade.addColorStop(SCROLL_FADE, '#fff');
  fade.addColorStop(1 - SCROLL_FADE, '#fff');
  fade.addColorStop(1, '#000');
  context.fillStyle = fade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  scrollFadeTexture = new T.CanvasTexture(canvas);
  return scrollFadeTexture;
}


const NAME_PLANE = new T.PlaneGeometry(1, 1);

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// The star of light at a VIP leaf's tip: a bright core with four long rays and four short ones between them,
// fading out, white in the middle and warm gold at the edges.
function sparkleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const centre = 128;
  const core = context.createRadialGradient(centre, centre, 0, centre, centre, 70);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.12, 'rgba(255,248,214,0.95)');
  core.addColorStop(0.35, 'rgba(255,214,120,0.35)');
  core.addColorStop(1, 'rgba(255,200,90,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, 256, 256);
  context.globalCompositeOperation = 'lighter';
  const ray = (angle, length, width) => {
    context.save();
    context.translate(centre, centre);
    context.rotate(angle);
    const beam = context.createLinearGradient(-length, 0, length, 0);
    beam.addColorStop(0, 'rgba(255,214,120,0)');
    beam.addColorStop(0.5, 'rgba(255,255,255,1)');
    beam.addColorStop(1, 'rgba(255,214,120,0)');
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(-length, 0);
    context.quadraticCurveTo(0, -width, length, 0);
    context.quadraticCurveTo(0, width, -length, 0);
    context.fill();
    context.restore();
  };
  ray(0, 126, 7);
  ray(Math.PI / 2, 126, 7);
  ray(Math.PI / 4, 70, 4);
  ray(-Math.PI / 4, 70, 4);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// ---------- where leaves can sit: the outer canopy of the tree ----------

// While the tree is growing (tree-growth.js), only the foliage grown in so far (or as far as `shown` says):
// the outer shell of that (all of the foliage if hardly any has grown in yet). Each spot also in the tree's
// own terms (local), so it keeps to the tree as the tree grows in size (followTree). With the canopy's outside
// as measured from that foliage (surface, canopy-surface.js), and every spot moved in onto it, `inset` metres
// in from its outside, top and bottom, so a leaf there has the tree's leaves all round it.
function canopyAnchors(tree, grownOnly = true, shown = tree.userData.foliageShown ?? 1, inset = LEAF_INSET * BASE_SIZE) {
  tree.updateMatrixWorld(true);
  const points = [];
  const point = new T.Vector3();
  tree.traverse(object => {
    if (!object.isMesh) return;
    if (![object.material].flat().some(material => material?.alphaTest > 0)) return; // leaves only
    const positions = object.geometry.attributes.position;
    const step = Math.max(1, Math.floor(positions.count / 3000));
    for (let i = 0; i < positions.count; i += step) {
      if (grownOnly && !isGrown(object.geometry, i, shown)) continue;
      points.push(point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).clone());
    }
  });
  if (grownOnly && points.length < 60) return canopyAnchors(tree, false, shown, inset);
  if (!points.length) return { anchors: [], centre: new T.Vector3(), surface: null };
  const surface = measureSurface(tree, points, orbitCentre);

  const box = new T.Box3().setFromPoints(points);
  const centre = box.getCenter(new T.Vector3());
  const radii = box.getSize(new T.Vector3()).multiplyScalar(0.5);
  const anchors = [];
  for (const p of points) {
    const n = new T.Vector3((p.x - centre.x) / radii.x, (p.y - centre.y) / radii.y, (p.z - centre.z) / radii.z);
    // The outer shell of the canopy, from a little below its middle upwards.
    if (n.length() < 0.78 || n.y < -0.55) continue;
    const outward = new T.Vector3(n.x / radii.x, n.y / radii.y, n.z / radii.z).normalize();
    // On the surface of the foliage, a little out from it (the leaf is drawn on top of the foliage anyway).
    const position = p.clone().addScaledVector(outward, 0.45);
    if (surface) keepOnSurface(surface, position, inset);
    anchors.push({ position, outward, local: tree.worldToLocal(position.clone()) });
  }
  return { anchors, centre, surface };
}

// glow: the admin's "Glowing look" (glowing leaves with handwritten names) or false for natural leaves.
export function addFeedbackLeaves({ scene, tree, clock, camera, renderer, glow = true }) {
  leafLook = glow ? LEAF_LOOKS.glow : LEAF_LOOKS.natural;
  let nameKey = useNameStyle(DEFAULTS); // the names' font, weight and colour, until the admin's settings load
  const group = new T.Group();
  group.name = 'Feedback leaves';
  scene.add(group);

  const leaves = new Map();        // leaf key -> leaf
  const placed = new Map();        // leaf key -> canopy spot, kept between refreshes
  const known = new Set();         // keys seen on the last check
  const waiting = new Set();       // new leaves with no place on the tree yet (a bare trunk): they fly in later
  // First in, first out: the leaves pushed off the tree by new ones, oldest first, each waiting on the tree
  // until a new leaf has floated up and joined it (letOldestFall), and only then falling.
  const fallQueue = [];
  let initialised = false;
  let settings = { ...DEFAULTS };
  let model = null;                // { geometry, texture }
  let anchors = [];
  let canopyBox = null;            // the canopy's extent, for the admin's leaf area
  let surface = null;              // the canopy's outside, measured from its foliage (canopy-surface.js)
  let mode = { live: true, year: null };
  let requestId = 0;
  let vipNames = new Set();         // names on the admin's VIP Management list
  const glowMap = glowTexture();
  const sparkleMap = sparkleTexture();
  // ready: resolves once the leaves are first on the tree (or could not be loaded), so the page can show the
  // whole scene at once (scene.js).
  let markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  const now = () => performance.now();

  // ---------- leaf model ----------

  new GLTFLoader().loadAsync(LEAF_MODEL).then(gltf => {
    let mesh = null;
    gltf.scene.traverse(object => { if (!mesh && object.isMesh) mesh = object; });
    if (!mesh) throw new Error('The leaf model has no mesh');
    const texture = mesh.material.map;
    const normalMap = mesh.material.normalMap || flatNormalTexture();
    for (const map of [texture, normalMap]) {
      if (map && renderer) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    model = { geometry: mesh.geometry, texture, normalMap };
    ({ anchors, surface } = canopyAnchors(tree, true, undefined, spotInset()));
    canopyBox = anchors.length ? new T.Box3().setFromPoints(anchors.map(anchor => anchor.position)) : null;
    refresh();
    // A new feedback shows at once: the server tells the page the moment the tree's data changes, and on
    // reconnecting (live-updates.js). The timed check (the admin's Leaf Refresh Interval, 5 seconds by default)
    // is then only a safety net, every LIVE_FALLBACK_MS; without the live connection it runs as set.
    onLiveUpdate('tree', () => { if (mode.live) refresh(); });
    onLiveUpdate('ready', () => { if (mode.live) refresh(); });
    const poll = () => window.setTimeout(() => { if (mode.live) refresh(); poll(); },
      liveConnected() ? Math.max(timing().refresh, LIVE_FALLBACK_MS) : timing().refresh);
    poll();
  }).catch(error => {
    console.warn('Feedback leaves could not be loaded; the tree shows without them.', error);
    markReady();
  });

  // The timings from the admin's 3D Tree Visualization Parameters, within safe limits.
  const within = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  function timing() {
    return {
      refresh: within(settings.leafRefreshMs, POLL_MS, 5000, 120000),
      appear: within(settings.leafAppearMs, APPEAR_MS, 100, 5000),
      // Time at the bottom middle: one setting for both trees, the 2D tree's (treeParameters.leafShowcaseSeconds).
      showcase: within(Number(settings.tree2d?.leafShowcaseSeconds) * 1000, SHOWCASE_MS, 0, 30000),
      float: within(settings.leafFloatMs, FLOAT_MS, 2000, 20000),
      batchMode: settings.leafBatchMode === 'size' ? 'size' : 'groups',
      batchCount: Math.round(within(settings.leafBatchCount, BATCH_SIZE, 1, 10)),
      batch: Math.round(within(settings.leafBatchSize, BATCH_SIZE, 1, 10)),
      fall: within(settings.leafFallMs, FALL_MS, 500, 10000),
    };
  }

  onTree3dSettings(next => {
    const before = JSON.stringify(settings.tree2d);
    const placing = s => [s.leafScale, s.vipLeafScale, s.leafAreaWidth, s.leafAreaHeight, s.leafAreaOffset].join('|');
    const sizeBefore = placing(settings);
    settings = { ...DEFAULTS, ...next, tree2d: { ...DEFAULTS.tree2d, ...(next.tree2d || {}) },
      badgeLeafColors: { ...BADGE_LEAF_COLOURS, ...(next.badgeLeafColors || {}) } };
    group.visible = settings.showFeedbackLeaves !== false;
    for (const leaf of leaves.values()) tintLeaf(leaf);
    // The admin changed the names' (or the VIP names') font, weight, colour or size: every name is written again.
    const nextNameKey = useNameStyle(settings);
    if (nextNameKey !== nameKey) {
      nameKey = nextNameKey;
      for (const leaf of leaves.values()) {
        leaf.nameLabel.material.map.dispose();
        shapeNameLabel(leaf.nameLabel, leaf.visitor?.name || '', leaf.isVip);
      }
    }
    if (!model) return;
    if (placing(settings) !== sizeBefore) {
      // A new leaf size or leaf area: place the leaves again for it, so they fit and do not overlap.
      for (const leaf of leaves.values()) removeLeaf(leaf);
      leaves.clear();
      placed.clear();
      fallQueue.length = 0;
      stageFreeAt = 0;
      batch = null;
      refresh();
    } else if (JSON.stringify(settings.tree2d) !== before) refresh(); // the 2D leaf count changed
  });

  document.addEventListener('esg-tree-year', event => {
    const { year, live } = event.detail || {};
    mode = { live: live !== false, year: live === false ? year : null };
    initialised = !mode.live; // a reviewed year shows its leaves at once, without flights
    known.clear();
    waiting.clear();
    fallQueue.length = 0;
    stageFreeAt = 0;
    batch = null;
    for (const leaf of leaves.values()) removeLeaf(leaf);
    leaves.clear();
    refresh();
  });

  // ---------- data ----------

  // A demonstration of new feedback arriving (?demo=7 in the page address, 1 to 30; in this browser tab only,
  // nothing is submitted or changed): the page opens without the 7 newest feedbacks (made up by pretend
  // visitors, "Demo visitor 1" and on, when there are fewer), and DEMO_DELAY_MS after the scene appears they
  // arrive together as new ones, shown as real new feedback is (in groups of up to 3,
  // then joining the tree). Reload the page to see it again.
  const DEMO_COUNT = (() => {
    const asked = Number(new URLSearchParams(window.location.search).get('demo'));
    return Number.isFinite(asked) && asked > 0 ? Math.min(30, Math.round(asked)) : 0;
  })();
  const DEMO_DELAY_MS = 5000;
  let demoHeld = null;        // the held-back feedbacks (their keys), until they arrive
  let demoArrived = false;
  let demoPretend = [];       // pretend visitors, when there are fewer real feedbacks than the demo shows
  const DEMO_BADGES = ['feedback-completer', 'social-champion', 'governance-guardian', 'climate-champion', 'ocean-guardian'];
  function demoVisitors(real) {
    if (!DEMO_COUNT || !mode.live) return real;
    if (!demoHeld) {
      // Not enough feedback yet (a fresh start): pretend visitors make up the number, in this tab only.
      const missing = Math.max(0, DEMO_COUNT - real.length);
      const at = new Date().toISOString();
      demoPretend = Array.from({ length: missing }, (_, i) => ({
        feedback_id: `demo-${i + 1}`, name: `Demo visitor ${i + 1}`, created_at: at,
        badgeKey: DEMO_BADGES[i % DEMO_BADGES.length], isDemo: true,
      }));
    }
    const visitors = [...real, ...demoPretend];
    if (demoArrived) return visitors;
    const keyOf = visitor => leafKey(visitor, 0);
    if (!demoHeld) {
      demoHeld = new Set(sortOldestFirst(visitors).slice(-DEMO_COUNT).map(keyOf));
      console.info(`3D tree demo: ${demoHeld.size} new feedbacks will arrive ${DEMO_DELAY_MS / 1000} seconds after the scene appears.`);
      const start = window.setInterval(() => {
        if (document.querySelector('.reserve')?.dataset.ready !== 'true') return;
        window.clearInterval(start);
        window.setTimeout(() => { demoArrived = true; refresh(); }, DEMO_DELAY_MS);
      }, 250);
    }
    return visitors.filter(visitor => !demoHeld.has(keyOf(visitor)));
  }

  async function refresh() {
    if (!model) return;
    const id = ++requestId;
    let visitors;
    try {
      const query = mode.live ? '' : `?year=${encodeURIComponent(mode.year)}`;
      const [response, vipResponse] = await Promise.all([
        fetch(`/api/tree${query}`, { cache: 'no-store' }),
        fetch('/api/tree/vip-names', { cache: 'no-store' }).catch(() => null),
      ]);
      const data = await response.json();
      visitors = demoVisitors(Array.isArray(data) ? data : []);
      const vipData = vipResponse?.ok ? await vipResponse.json() : null;
      if (Array.isArray(vipData?.vipNames)) vipNames = new Set(vipData.vipNames.map(normaliseName));
    } catch (error) {
      console.warn('Feedback leaves: could not check for new feedback.', error);
      markReady(); // the scene shows without them
      return;
    }
    if (id !== requestId) return; // a newer check (or a year change) took over
    showVisitors(visitors);
    markReady();
  }

  // VIP Management signals a changed VIP list (same browser): check at once, as the 2D tree does.
  window.addEventListener('tree-vip-refresh', () => refresh());
  window.addEventListener('storage', event => { if (event.key === 'tree-vip-refresh') refresh(); });

  // As the 2D tree: VIP when /api/tree marks the visitor, or the name is on the VIP list.
  const isVipVisitor = visitor => visitor?.isVip === true || vipNames.has(normaliseName(visitor?.name));

  function showVisitors(list) {
    const visitors = sortOldestFirst(list);
    const keys = visitors.map((visitor, index) => leafKey(visitor, index));
    // The same leaves as the 2D tree: none on a bare trunk (stage 0: the leaves on the tree fall off), every
    // leaf of a reviewed year, otherwise the newest "Maximum Visible Leaves".
    const bare = settings.tree2d.treeStage <= 0;
    const max = mode.live ? Math.max(1, Number(settings.tree2d.leafFallThreshold) || 15) : keys.length;
    const newest = new Set(keys.slice(-max));
    const visible = bare ? new Set() : newest;
    const all = new Set(keys);
    fitScale = leavesFit(visible.size);

    // Which leaves fly in: on opening the most recent few, later every leaf not seen before.
    const landing = new Set();
    const opening = !initialised; // the page opening: the leaves are on the tree at once
    if (!initialised) {
      visitors.forEach((visitor, index) => {
        const created = timeOf(visitor.created_at);
        if (created !== null && Date.now() - created >= 0 && Date.now() - created <= RECENT_LANDING_MS) landing.add(keys[index]);
      });
      [...landing].slice(0, -3).forEach(key => landing.delete(key));
      initialised = true;
    } else if (mode.live) {
      keys.forEach(key => { if (!known.has(key)) landing.add(key); });
    }
    known.clear();
    keys.forEach(key => known.add(key));
    // New leaves that had no place on the tree when they came (the first leaves, while the tree was still a
    // bare trunk growing into Stage 1): they fly in now, as new.
    for (const key of waiting) {
      if (!newest.has(key) || !mode.live) waiting.delete(key);
      else landing.add(key);
    }

    // Leaves whose feedback was removed fade away. Leaves pushed off the tree by newer ones fall (below).
    const pushedOff = [];
    for (const [key, leaf] of leaves) {
      if (visible.has(key) || leaf.state === 'falling') continue;
      if (!all.has(key)) { unqueueFall(leaf); removeLeaf(leaf); leaves.delete(key); continue; }
      if (!leaf.fallQueued) pushedOff.push(leaf);
    }

    const arriving = []; // new leaves, shown in groups (startFlights)
    visitors.forEach((visitor, index) => {
      const key = keys[index];
      if (!visible.has(key)) {
        if (landing.has(key) && newest.has(key)) waiting.add(key); // a bare trunk: it flies in once there is a canopy
        return;
      }
      const existing = leaves.get(key);
      if (existing) {
        unqueueFall(existing); // on the tree again (a higher Maximum Visible Leaves): it stays
        existing.visitor = visitor;
        const isVip = isVipVisitor(visitor);
        if (isVip && !existing.isVip && existing.state === 'resting') {
          // Made VIP on the tree: it moves to one end of the canopy (sideSpots), fading in there.
          relocate(existing);
          return;
        }
        if (isVip !== existing.isVip) {
          // No longer VIP (or made VIP while floating in): it stays where it is shown.
          const shown = shownSpot(existing, existing.shown);
          existing.spot = { ...existing.spot, position: shown.position.clone(), quaternion: shown.quaternion.clone(), outward: shown.outward.clone(),
            local: tree.worldToLocal(shown.position.clone()), // and it keeps to the tree from here (followTree)
            around: undefined, reach: undefined, depth: undefined, view: undefined, sideFrom: undefined }; // its glide starts again from here (shownSpot)
          placed.set(key, existing.spot);
        }
        existing.isVip = isVip;
        tintLeaf(existing);
        // A name changed (e.g. made public), or the visitor was made VIP (or no longer is): written again.
        if ((visitor?.name || '') !== existing.nameLabel.userData.name || existing.nameLabel.userData.vip !== isVip) {
          existing.nameLabel.material.map.dispose();
          shapeNameLabel(existing.nameLabel, visitor?.name || '', isVip);
        }
        return;
      }
      const leaf = createLeaf(key, visitor);
      if (!leaf) { // no canopy to sit on yet (the new stage's tree still coming in)
        if (landing.has(key)) waiting.add(key);
        return;
      }
      waiting.delete(key);
      if (landing.has(key)) arriving.push(leaf);
      else if (!opening) leaf.appear = 0; // back on the tree (after a bare trunk, or placed again): fades in
      leaves.set(key, leaf);
    });
    startFlights(arriving);

    // First in, first out, the new leaf first: while new leaves are on their way (in the row at the bottom
    // or floating up), the oldest leaves they push off stay on the tree; each time a new leaf joins the tree
    // the oldest one waiting falls (letOldestFall). With none on the way (a lower Maximum Visible Leaves, a
    // bare trunk) they fall at once.
    const order = new Map(keys.map((key, index) => [key, index]));
    pushedOff.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
    const onTheWay = !bare && ([...leaves.values()].some(leaf => leaf.state === 'landing') || waiting.size > 0);
    for (const leaf of pushedOff) {
      if (!onTheWay) { startFall(leaf); continue; }
      leaf.fallQueued = true;
      fallQueue.push(leaf);
    }
    if (bare) while (fallQueue.length) letOldestFall();
  }

  function unqueueFall(leaf) {
    if (!leaf.fallQueued) return;
    leaf.fallQueued = false;
    const index = fallQueue.indexOf(leaf);
    if (index >= 0) fallQueue.splice(index, 1);
  }
  // A new leaf has joined the tree: the oldest leaf waiting falls.
  function letOldestFall() {
    const leaf = fallQueue.shift();
    if (!leaf) return;
    leaf.fallQueued = false;
    if (leaves.get(leaf.key) === leaf && leaf.state !== 'falling') startFall(leaf);
  }

  // ---------- many leaves ----------

  // The newest Maximum Visible Leaves are on the tree, first in, first out: when one more arrives, the
  // oldest falls and the new one joins (showVisitors). When more leaves are on the tree than fit side by
  // side on the canopy at their size (a high Maximum Visible Leaves such as 100, a young tree, a small leaf
  // area), they are all made just small enough to fit, so they still do not overlap; up to that, they keep
  // the admin's size.
  let fitScale = 1;
  function leavesFit(count) {
    if (!count || !anchors.length) return 1;
    camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const toCamera = new T.Vector3();
    const inArea = anchors.filter(anchor => inLeafArea(anchor.position));
    const usable = (inArea.length > 40 ? inArea : anchors)
      .filter(anchor => anchor.outward.dot(toCamera.subVectors(camera.position, anchor.position).normalize()) > 0.2);
    if (usable.length < 20) return 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const anchor of usable) {
      const x = anchor.position.dot(right), y = anchor.position.dot(up);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const area = (maxX - minX) * (maxY - minY) * 0.7; // the rounded canopy fills about this much of its box
    const room = (BASE_SIZE * Math.max(1, settings.leafScale, settings.vipLeafScale) * 1.25) ** 2; // one leaf, spaced
    return Math.max(0.35, Math.min(1, Math.sqrt(area / room / count)));
  }

  // ---------- leaves ----------

  // The admin's leaf area (2D: Leaf Canopy Width, Height and Top Offset): the middle part of the canopy,
  // as wide and as tall as the given shares of it, moved up (negative offset) or down. All of it by default.
  function inLeafArea(position) {
    const width = within(settings.leafAreaWidth, 100, 30, 100) / 100;
    const height = within(settings.leafAreaHeight, 100, 30, 100) / 100;
    const offset = within(settings.leafAreaOffset, 0, -40, 40) / 100;
    if (!canopyBox || (width >= 1 && height >= 1 && offset === 0)) return true;
    const size = canopyBox.getSize(new T.Vector3());
    const centre = canopyBox.getCenter(new T.Vector3());
    centre.y -= offset * size.y;
    return Math.abs(position.x - centre.x) <= width * size.x / 2 && Math.abs(position.y - centre.y) <= height * size.y / 2;
  }

  // A VIP's leaf joins the tree at one end of the canopy, its left or its right as the viewer sees it (either,
  // at random): the spots far out at that side, 50 to 80 degrees round the trunk from the viewer (so it is
  // at the side yet fully shown, short of the edge where leaves go out of sight), in the middle of the
  // canopy's height, on screen and clear of the title box. As the tree turns it glides with the tree as every
  // leaf does: at the edge of the tree's outline it goes out of sight and comes back on the other side
  // (shownSpot). The other side if one side has no such spots; anywhere on the front if neither has.
  const SIDE_FROM = (60 * Math.PI) / 180, SIDE_TO = (82 * Math.PI) / 180;
  const SIDE_MIDDLE = (SIDE_FROM + SIDE_TO) / 2;
  function sideSpots(area, size, random) {
    if (!canopyBox || !area.length) return null;
    camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const view = Math.atan2(camera.position.x - orbitCentre.x, camera.position.z - orbitCentre.z);
    const height = canopyBox.max.y - canopyBox.min.y;
    const low = canopyBox.min.y + height * 0.25, high = canopyBox.min.y + height * 0.75;
    const out = new T.Vector3();
    const first = random() > 0.5 ? 1 : -1;
    for (const side of [first, -first]) {
      const band = area.filter(anchor => {
        const { position } = anchor;
        const from = Math.abs(turnedTo(Math.atan2(position.x - orbitCentre.x, position.z - orbitCentre.z), view));
        return from >= SIDE_FROM && from <= SIDE_TO && position.y >= low && position.y <= high
          && Math.sign(out.subVectors(position, orbitCentre).dot(right)) === side;
      });
      if (!band.length) continue;
      // The furthest out at that side, as the viewer sees it.
      const across = anchor => out.subVectors(anchor.position, orbitCentre).dot(right) * side;
      band.sort((a, b) => across(b) - across(a));
      const ends = band.slice(0, Math.max(8, Math.round(band.length * 0.2))).filter(anchor => seenOnScreen(anchor.position, size));
      if (ends.length) return ends;
    }
    return null;
  }

  function spotFor(key, isVip = false) {
    if (placed.has(key)) return placed.get(key);
    followTree(); // the canopy's spots where they are now, if the tree has grown
    const random = seededRandom(`${key}|spot`);
    const size = BASE_SIZE * Math.max(1, settings.leafScale, settings.vipLeafScale) * fitScale;
    const toCamera = new T.Vector3();
    // Only spots in the admin's leaf area (if it leaves enough of the canopy). Among those, prefer spots
    // facing the viewer, so the leaves are seen, and then spots on screen and clear of the title box.
    const inArea = anchors.filter(anchor => inLeafArea(anchor.position));
    const area = inArea.length > 40 ? inArea : anchors;
    // The whole front half of the canopy, out to both its sides (FRONT_REACH round the trunk either side of the
    // viewer), so the leaves spread across all of it; the farthest from the leaves already there is chosen below.
    const view = Math.atan2(camera.position.x - orbitCentre.x, camera.position.z - orbitCentre.z);
    const facing = area.filter(anchor => Math.abs(turnedTo(Math.atan2(anchor.position.x - orbitCentre.x, anchor.position.z - orbitCentre.z), view)) <= FRONT_REACH
      && anchor.outward.dot(toCamera.subVectors(camera.position, anchor.position).normalize()) > -0.15);
    const seen = facing.filter(anchor => seenOnScreen(anchor.position, size));
    const sides = isVip ? sideSpots(area, size, random) : null;
    const pool = sides || (seen.length > 40 ? seen : facing.length > 40 ? facing : area);
    if (!pool.length) return null;
    const taken = [...leaves.values()].filter(leaf => leaf.state !== 'falling').map(leaf => shownSpot(leaf, leaf.shown).position);
    // How far apart two spots look to the viewer: their distance across the view, leaving out depth.
    const viewDirection = camera.getWorldDirection(new T.Vector3());
    const offset = new T.Vector3();
    const apartOnScreen = (a, b) => {
      offset.subVectors(a, b);
      return offset.addScaledVector(viewDirection, -offset.dot(viewDirection)).length();
    };
    // The spot farthest from every leaf already there, as the viewer sees them, of SPREAD_TRIES spots at random
    // (not the first one far enough: the canopy's spots are densest in its middle, so that kept the leaves there):
    // the leaves spread out evenly over all of the canopy, out to both its sides.
    let best = null, bestGap = -Infinity;
    for (let attempt = 0; attempt < SPREAD_TRIES; attempt++) {
      const anchor = pool[Math.floor(random() * pool.length)];
      const gap = taken.reduce((nearest, position) => Math.min(nearest, apartOnScreen(position, anchor.position)), Infinity);
      if (gap > bestGap) { best = anchor; bestGap = gap; }
    }
    // Its own angle: the leaf faces out of the canopy and towards the viewer, turned at random.
    const facingDir = best.outward.clone().lerp(toCamera.subVectors(camera.position, best.position).normalize(), 0.5).normalize();
    const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), random() * Math.PI * 2);
    const tilt = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), (random() - 0.5) * 0.5);
    const quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), facingDir).multiply(turn).multiply(tilt);
    const spot = {
      position: best.position.clone(),
      outward: best.outward.clone(), // which way the canopy faces here (for fading round the back)
      quaternion,
      local: best.local.clone(), // in the tree's own terms: it keeps to the tree (followTree), and sways as its leaves
      phase: random() * Math.PI * 2,
      prefersLeft: random() > 0.5, // its side when left and right leaves are mixed
    };
    // A VIP's leaf keeps to its side of the tree as the tree turns (shownSpot): its angle round from the viewer.
    if (sides) spot.sideFrom = turnedTo(Math.atan2(best.position.x - orbitCentre.x, best.position.z - orbitCentre.z), view);
    placed.set(key, spot);
    return spot;
  }

  // ---------- gliding with the turning tree ----------

  // Where a leaf is shown. The leaves stay on the side of the tree facing the viewer, and when the tree turns
  // (the automatic turn, a drag or the arrow keys) they glide with it, smoothly, at the tree's own pace: each
  // moves round the trunk (orbitCentre, tree-view.js) with the tree, keeping to the canopy's surface (the
  // canopy is oval from above, so its distance from the trunk follows the canopy's shape), turning with it.
  // When a leaf has glided GLIDE_REACH to one side of the viewer, it fades away there and comes back, faded
  // in, at the same distance on the other side (wrapping round), and glides on: the front of the tree always
  // has its leaves, all moving with the tree. With the view still, every leaf is exactly at its own spot.
  // A leaf stays fully shown all the way to the side of the canopy as the viewer sees it (90 degrees round from
  // the viewer: the edge of the tree's outline), and goes out of sight only there, quickly, as if round the
  // side of the tree, coming back in the same way at the other side.
  const GLIDE_REACH = (90 * Math.PI) / 180;   // how far to either side of the viewer a leaf glides
  const FRONT_REACH = (80 * Math.PI) / 180;   // a new leaf's spot: up to this far round to either side of the viewer
  const SPREAD_TRIES = 400;                   // spots tried for a new leaf, the farthest from the others taken
  const GLIDE_FADE = (5 * Math.PI) / 180;     // over how much of that, at its very end, it fades out (and in, on the other side)
  const glideTurn = new T.Quaternion();
  const turnedTo = (angle, around) => Math.atan2(Math.sin(angle - around), Math.cos(angle - around)); // -pi to pi
  // How far in from the canopy's outside a leaf keeps (canopy-surface.js): LEAF_INSET of its size; for spots
  // on the canopy, of the size the leaves are now.
  function spotInset() {
    return LEAF_INSET * BASE_SIZE * Math.max(1, Number(settings.leafScale) || 1, Number(settings.vipLeafScale) || 1) * fitScale;
  }
  function leafInset(leaf) {
    return leaf?.scale ? LEAF_INSET * leaf.scale * MODEL_SIZE : spotInset();
  }
  // The canopy's distance from the trunk in a direction round it (its oval from above), for the leaves to keep
  // to its surface, when its outside could not be measured (surface); 1 without a measured canopy.
  function canopyReach(angle) {
    if (!canopyBox) return 1;
    const size = canopyBox.getSize(new T.Vector3());
    const across = Math.max(0.5, size.x / 2), deep = Math.max(0.5, size.z / 2);
    return 1 / Math.hypot(Math.sin(angle) / across, Math.cos(angle) / deep);
  }
  function shownSpot(leaf, out) {
    const spot = leaf.spot;
    // Its angle round the trunk, and the viewer's.
    spot.around ??= Math.atan2(spot.position.x - orbitCentre.x, spot.position.z - orbitCentre.z);
    spot.reach ??= Math.hypot(spot.position.x - orbitCentre.x, spot.position.z - orbitCentre.z);
    const view = Math.atan2(camera.position.x - orbitCentre.x, camera.position.z - orbitCentre.z);
    // How far round from the viewer it is, kept within GLIDE_REACH either side (wrapping round).
    const span = 2 * GLIDE_REACH;
    let fromView = ((turnedTo(spot.around, view) + GLIDE_REACH) % span + span) % span - GLIDE_REACH;
    if (leaf.isVip) {
      // A VIP's leaf stays at the side of the tree, however far the tree turns (no gliding into the middle): at
      // its own angle round from the viewer; one placed elsewhere (made VIP later, or before) goes out to a side.
      if (spot.sideFrom === undefined) {
        const away = Math.abs(fromView);
        spot.sideFrom = Math.sign(fromView || 1) * (away >= SIDE_FROM && away <= SIDE_TO ? away : SIDE_MIDDLE);
      }
      fromView = spot.sideFrom;
    }
    const angle = view + fromView;
    const moved = turnedTo(angle, spot.around); // 0 while at its own spot; a jump of 2 x GLIDE_REACH on wrapping
    if (surface) {
      // On the canopy's outside as measured from its foliage (canopy-surface.js), as far in as on its own spot,
      // and inside the canopy's outline by at least LEAF_INSET of the leaf: where the canopy is narrower or
      // lower (towards its top, at its two long ends) the leaf keeps in among its leaves, never out in the air.
      spot.depth ??= spot.reach / Math.max(1e-3, canopyReachAt(surface, spot.around, spot.position.y));
      onSurface(surface, angle, spot.position.y, spot.depth, leafInset(leaf), out.position);
    } else if (Math.abs(moved) < 1e-6) out.position.copy(spot.position);
    else {
      const reach = spot.reach * canopyReach(angle) / canopyReach(spot.around);
      out.position.set(orbitCentre.x + Math.sin(angle) * reach, spot.position.y, orbitCentre.z + Math.cos(angle) * reach);
    }
    // It keeps facing the viewer as it did on its spot (turned as far as the view has turned since), so it
    // stays readable all the way across, and fades only at the edges of its glide.
    spot.view ??= view;
    glideTurn.setFromAxisAngle(UP, turnedTo(view, spot.view));
    out.quaternion.copy(glideTurn).multiply(spot.quaternion);
    out.outward.copy(spot.outward).applyQuaternion(glideTurn);
    out.glide = leaf.isVip ? 1 : smoothstep(GLIDE_REACH, GLIDE_REACH - GLIDE_FADE, Math.abs(fromView)); // faded at the edges
    return out;
  }

  // Whether a leaf of this size at this point is fully on screen and not under the title box.
  const onScreen = new T.Vector3();
  // Where a leaf of this size at this point is on the canvas: its centre and half its size, in pixels.
  function onCanvas(position, size) {
    camera.updateMatrixWorld();
    onScreen.copy(position).project(camera);
    const width = renderer.domElement.clientWidth || window.innerWidth;
    const height = renderer.domElement.clientHeight || window.innerHeight;
    const depth = position.distanceTo(camera.position);
    const half = (size / 2) / (2 * depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) * height;
    return { x: (onScreen.x + 1) / 2 * width, y: (1 - onScreen.y) / 2 * height, half, width, height, behind: onScreen.z > 1 };
  }

  // The title box on the canvas, with a margin: no leaf sits there, wherever the admin puts the title box
  // (top or bottom, left, centre or right) or however big it is. Null when it is hidden.
  // What the row of new leaves at the bottom of the screen keeps clear of: the title box and the Year Review
  // button (each in canvas pixels, with a margin), when shown.
  function rowObstacles() {
    const areas = [];
    const title = titleArea();
    if (title) areas.push(title);
    const button = document.querySelector('.year-review-toggle');
    const box = button?.getBoundingClientRect();
    if (box && box.width && box.height && getComputedStyle(button).display !== 'none' && getComputedStyle(button).visibility !== 'hidden') {
      const canvasBox = renderer.domElement.getBoundingClientRect();
      const margin = 12;
      areas.push({ left: box.left - canvasBox.left - margin, right: box.right - canvasBox.left + margin,
        top: box.top - canvasBox.top - margin, bottom: box.bottom - canvasBox.top + margin });
    }
    return areas;
  }

  function titleArea() {
    const title = document.querySelector('.masthead');
    const box = title?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    const style = getComputedStyle(title);
    if (style.visibility === 'hidden' || style.display === 'none') return null;
    const canvasBox = renderer.domElement.getBoundingClientRect();
    const margin = 12;
    return {
      left: box.left - canvasBox.left - margin, top: box.top - canvasBox.top - margin,
      right: box.right - canvasBox.left + margin, bottom: box.bottom - canvasBox.top + margin,
    };
  }

  function touchesTitle(spot, area = titleArea()) {
    return Boolean(area) && spot.x + spot.half > area.left && spot.x - spot.half < area.right
      && spot.y + spot.half > area.top && spot.y - spot.half < area.bottom;
  }

  function seenOnScreen(position, size) {
    const spot = onCanvas(position, size);
    if (spot.behind) return false;
    if (spot.x < spot.half || spot.x > spot.width - spot.half || spot.y < spot.half || spot.y > spot.height - spot.half) return false;
    return !touchesTitle(spot);
  }

  // When the title box moves or changes size (the admin's Title Box settings, or the screen size), a
  // resting leaf it now covers moves to a free spot clear of it, fading in there. Checked only when the
  // title box itself changes, so a leaf the viewer turns under the title box by dragging stays put.
  let titleKey = null;
  function keepClearOfTitle() {
    if (!model) return;
    const area = titleArea();
    const key = area ? [area.left, area.top, area.right, area.bottom].map(Math.round).join(',') : 'none';
    if (key === titleKey) return;
    titleKey = key;
    for (const leaf of [...leaves.values()]) {
      if (leaf.state !== 'resting' || leaf.fallQueued) continue;
      if (touchesTitle(onCanvas(leaf.shown.position, leaf.scale * MODEL_SIZE), area)) relocate(leaf);
    }
  }
  function relocate(leaf) {
    const { key, visitor } = leaf;
    removeLeaf(leaf);
    leaves.delete(key);
    placed.delete(key);
    const moved = createLeaf(key, visitor);
    if (!moved) return;
    moved.appear = 0; // fades in at its new spot
    leaves.set(key, moved);
  }
  document.addEventListener('esg-tree-title', () => requestAnimationFrame(keepClearOfTitle));
  window.addEventListener('resize', () => window.setTimeout(keepClearOfTitle, 400));

  function createLeaf(key, visitor) {
    const spot = spotFor(key, isVipVisitor(visitor));
    if (!spot) return null;
    // Drawn on top of the tree's foliage (no depth test), so the canopy never covers a feedback leaf.
    const material = new T.MeshBasicMaterial({
      map: model.texture, alphaTest: 0.02, side: T.DoubleSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    // Glowing look: a leaf of light, vivid colour, glowing veins and a bright rim, with a light sweeping
    // across it now and then (GLOW_FRAGMENT; its shimmer is moved in update). Natural look: its veins shown
    // (VEIN_FRAGMENT).
    material.userData.shimmer = { value: -1 };
    material.onBeforeCompile = shader => {
      shader.uniforms.veinNormal = { value: model.normalMap };
      shader.uniforms.shimmer = material.userData.shimmer;
      shader.fragmentShader = 'uniform sampler2D veinNormal;\nuniform float shimmer;\n'
        + shader.fragmentShader.replace('#include <map_fragment>', leafLook.fragment);
    };
    material.customProgramCacheKey = () => leafLook.cacheKey;
    const mesh = new T.Mesh(model.geometry, material);
    mesh.name = `Feedback leaf ${key}`;
    mesh.renderOrder = 2;
    if (leafLook.aura) mesh.layers.enable(GLOW_LAYER); // glowing look: its light spills round it (bloom, glow-look.js)
    group.add(mesh);
    // The visitor's name, lying on the leaf along its midrib and inside the blade.
    const nameMesh = new T.Mesh(NAME_PLANE, new T.MeshBasicMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, toneMapped: false,
    }));
    nameMesh.rotation.x = -Math.PI / 2; // flat on the leaf: text along the midrib (x), facing out (+y)
    nameMesh.renderOrder = 3;
    shapeNameLabel(nameMesh, visitor?.name || '', isVipVisitor(visitor));
    mesh.add(nameMesh);
    const halo = new T.Sprite(new T.SpriteMaterial({
      map: glowMap, color: NEON, blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0,
    }));
    halo.visible = false;
    group.add(halo);
    // A VIP's star of light at the leaf's tip (shown in update while the leaf is a VIP's).
    const sparkle = new T.Sprite(new T.SpriteMaterial({
      map: sparkleMap, color: 0xfff1cc, blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0,
    }));
    sparkle.visible = false; // kept out of the bloom, so its rays stay sharp
    group.add(sparkle);
    const isVip = isVipVisitor(visitor);
    const leaf = { key, visitor, isVip, spot, mesh, material, nameLabel: nameMesh, halo, sparkle, state: 'resting', scale: currentScale({ isVip }), colour: new T.Color() };
    leaf.shown = { position: new T.Vector3(), quaternion: new T.Quaternion(), outward: new T.Vector3() };
    shownSpot(leaf, leaf.shown);
    tintLeaf(leaf, true);
    placeAtRest(leaf, 0);
    return leaf;
  }

  function removeLeaf(leaf) {
    if (leaf === selectedLeaf) details.close(); // its details card goes with it
    group.remove(leaf.mesh, leaf.halo, leaf.sparkle);
    leaf.material.dispose();
    leaf.nameLabel.material.map.dispose();
    leaf.nameLabel.material.dispose();
    leaf.halo.material.dispose();
    leaf.sparkle.material.dispose();
  }

  // ---------- the name on the leaf (as the 2D tree) ----------

  // vip: a VIP's name, in the VIP names' style.
  function shapeNameLabel(nameMesh, name, vip = false) {
    const label = nameLabel(name || 'Anonymous visitor', vip ? nameStyles.vip : nameStyles.normal, vip);
    nameMesh.material.map = label.texture;
    nameMesh.material.alphaMap = label.scroll ? scrollFadeMap() : null; // a scrolling name's soft ends
    nameMesh.material.needsUpdate = true;
    nameMesh.userData = { name, vip, width: label.width, height: label.height,
      // A scrolling name: each at its own moment of its round (phase, in seconds).
      scroll: label.scroll ? { ...label.scroll, phase: Math.random() * (SCROLL_HOLD + label.scroll.travel) } : null };
    nameMesh.position.set(NAME_CENTRE_X, NAME_LIFT, NAME_CENTRE_Z); // the middle of the leaf
  }

  // The name lies on the leaf and turns with it. So that it always reads properly, it is turned half a
  // turn when it would read upside down (as the 2D names), mirrored back when it is seen on a mirrored
  // (left) leaf or from behind the leaf, and lifted off the side of the leaf that faces the viewer.
  const labelCentre = new T.Vector3(), alongMidrib = new T.Vector3(), textUp = new T.Vector3();
  const leafOrigin = new T.Vector3(), leafNormal = new T.Vector3();
  function placeName(leaf) {
    const label = leaf.nameLabel;
    label.visible = settings.showLeafNames !== false && leaf.material.opacity > 0.02;
    if (!label.visible) return;
    leaf.mesh.updateMatrixWorld();
    const { width, height } = label.userData;
    const m = leaf.mesh.matrixWorld;
    labelCentre.set(label.position.x, 0, label.position.z).applyMatrix4(m);
    const centre = labelCentre.clone().project(camera);
    alongMidrib.set(label.position.x + 0.01, 0, label.position.z).applyMatrix4(m).project(camera).sub(centre);
    textUp.set(label.position.x, 0, label.position.z - 0.01).applyMatrix4(m).project(camera).sub(centre);
    alongMidrib.x *= camera.aspect;
    textUp.x *= camera.aspect;
    // Left to right on screen (angle within -90..90 degrees, as the 2D names); a swaying or floating leaf
    // keeps its name's direction until it is clearly past upright, so the name never flickers over ...
    const lean = Math.abs(Math.atan2(alongMidrib.y, alongMidrib.x));
    let across = lean > Math.PI / 2 ? -1 : 1;
    if (leaf.nameAcross && Math.abs(lean - Math.PI / 2) < NAME_FLIP_MARGIN) across = leaf.nameAcross;
    leaf.nameAcross = across;
    // ... and the right way up, not mirrored.
    const upright = (alongMidrib.x * across) * textUp.y - (alongMidrib.y * across) * textUp.x >= 0 ? 1 : -1;
    label.scale.set(width * across, height * upright, 1);
    // On the side of the leaf the viewer sees.
    leafOrigin.setFromMatrixPosition(m);
    leafNormal.set(0, 1, 0).applyMatrix4(m).sub(leafOrigin);
    const front = leafNormal.dot(labelCentre.sub(camera.position).negate()) >= 0;
    label.position.y = front ? NAME_LIFT : -NAME_LIFT;
    label.material.opacity = leaf.material.opacity;
  }

  // A left leaf is the leaf model mirrored (2D: LeftLeaf.png against RightLeaf.png).
  function sideSign(leaf) {
    if (settings.leafSide === 'left') return -1;
    if (settings.leafSide === 'right') return 1;
    return leaf.spot.prefersLeft ? -1 : 1;
  }

  // VIP leaves have their own scale (2D: vipLeafDisplayScale).
  function currentScale(leaf) {
    const scale = leaf?.isVip ? Number(settings.vipLeafScale) : Number(settings.leafScale);
    return (BASE_SIZE / MODEL_SIZE) * (scale || 1) * fitScale; // smaller only when many leaves must fit
  }

  // A leaf is coloured by its visitor's badge (on by default, the admin's "Colour leaves by their badge"):
  // a light shade of the badge's colour when its feedback comes in, turning to a dark shade of it once it has
  // been on the tree for the admin's leafNewHours ("A leaf stays light for", minutes or hours). With badge
  // colours off, light green then dark green (2D: New / Old leaf pictures). VIP leaves stay gold. tintLeaf
  // runs at every check for new feedback, so a leaf turns dark within one check of its time, fading over a
  // few seconds (update).
  // The badge's colour: the 3D tree's own (3D Tree Visualization Parameters) once the admin has changed it
  // there; otherwise the 2D tree's (Badge Leaf Styling); otherwise the built-in one.
  function badgeColour(visitor) {
    const key = visitor?.badgeKey || 'feedback-completer';
    const own = String(settings.badgeLeafColors?.[key] || '').toLowerCase();
    if (own && own !== BADGE_LEAF_COLOURS[key]) return own;
    return settings.tree2d?.badgeColors?.[key] || own || visitor?.badgeColor || BADGE_LEAF_COLOURS[key] || settings.leafNewColor;
  }
  function tintLeaf(leaf, immediate = false) {
    const created = timeOf(leaf.visitor?.created_at);
    const newForMs = (Number(settings.leafNewHours) || 0) * 3600 * 1000;
    const isNew = created !== null && Date.now() - created <= newForMs;
    const plain = isNew ? settings.leafNewColor : settings.leafOldColor;
    const esg = BADGE_ESG[leaf.visitor?.badgeKey] || 'environmental';
    // In both looks, with "Colour leaves by their badge" on (the default): the admin's colour for the
    // visitor's badge (Ocean Guardian blue, Social Champion amber, ...), light while new, a dark shade later.
    // Off: the glowing look's three ESG colours (green, blue or orange), the natural look's light and dark green.
    const colour = leaf.isVip ? settings.vipLeafColor
      : settings.badgeColours === true ? badgeShade(badgeColour(leaf.visitor), isNew)
        : leafLook.aura ? (isNew ? ESG_GLOW_COLOURS[esg] : badgeShade(ESG_GLOW_COLOURS[esg], false))
          : plain;
    leaf.targetColour = displayColour(colour, isNew || leaf.isVip ? MIN_LIGHTNESS : OLD_MIN_LIGHTNESS);
    if (immediate) leaf.colour.copy(leaf.targetColour);
  }

  function glowAmount(leaf, time) {
    const userCreated = timeOf(leaf.visitor?.user_created_at);
    if (userCreated === null || !mode.live) return 0;
    const age = Date.now() - userCreated;
    if (age < 0 || age > GLOW_MS) return 0;
    const since = leaf.restingSince ?? -Infinity;
    const fadeIn = smoothstep(0, 1, (time - since) / GLOW_FADE_MS);
    const fadeOut = 1 - smoothstep(GLOW_MS - 1500, GLOW_MS, age);
    const pulse = 0.82 + 0.18 * Math.sin((time / 2000) * Math.PI * 2);
    return fadeIn * fadeOut * pulse;
  }

  // ---------- showing at the bottom middle, then floating in (as the 2D landing flight) ----------

  // The leaves that arrive together are split into groups as the admin sets (leafBatchMode): into a number of
  // groups (leafBatchCount, BATCH_SIZE by default: 10 new feedbacks into 2 groups: 5 and 5; into 3: 4, 3 and
  // 3), or into groups of up to a number of leaves (leafBatchSize: 10 in groups of up to 3: 3, 3, 2 and 2);
  // either way as evenly as they go. A group appears together in a row at the bottom of the screen, below the tree,
  // where a new leaf has always shown: the leaves spread evenly across it whatever the screen's size, clear of
  // the title box, all the same size (made smaller when the row is too narrow for them to stand apart),
  // drifting gently with their names level, so the visitors can find and read them, for the admin's time
  // (SHOWCASE_MS, 12 seconds by default). Then they join the tree in no set order, each leaving at its own
  // moment within BATCH_SPREAD_MS: each floats up to its spot like a falling leaf in reverse, swinging gently
  // from side to side with a steady rhythm, rocking like a cradle (the end on the outside of each swing
  // lifts, as a pendulum's), while it rises, shrinks and turns from level to the angle it will rest at; the
  // swings die away as it arrives, and it settles exactly where it then rests, swaying with the tree. Each
  // shows and floats at the depth of its spot, and the row stays at the bottom of the screen even if the
  // view is turned meanwhile. The next group appears once the one before has left (STAGE_CLEAR_MS).
  let stageFreeAt = 0; // when the bottom of the screen is next free for a group
  let batch = null;    // the last group: { appearAt, showcase, members, half }

  // The leaves that arrived together, in groups split as evenly as they go.
  function startFlights(arriving) {
    if (!arriving.length) return;
    const { batchMode, batchCount, batch: perGroup } = timing();
    const groups = batchMode === 'size' ? Math.ceil(arriving.length / perGroup) : Math.min(batchCount, arriving.length);
    let next = 0;
    for (let g = 0; g < groups; g++) {
      const count = Math.floor(arriving.length / groups) + (g < arriving.length % groups ? 1 : 0);
      const { showcase } = timing();
      batch = { appearAt: Math.max(now() + 250, stageFreeAt), showcase, members: [], half: null };
      for (const leaf of arriving.slice(next, next + count)) startFlight(leaf, batch);
      next += count;
    }
  }

  function startFlight(leaf, group) {
    const random = seededRandom(`${leaf.key}|flight`);
    const { appear, float } = timing(); // the admin's timings when this leaf arrives
    batch = group;
    batch.members.push(leaf);
    const slot = batch.members.length - 1;
    stageFreeAt = batch.appearAt + batch.showcase + BATCH_SPREAD_MS + STAGE_CLEAR_MS;
    const appearAt = batch.appearAt + slot * 200;                        // the group's leaves fade in one by one, quickly
    const departAt = batch.appearAt + batch.showcase + random() * BATCH_SPREAD_MS; // and leave in no set order
    // Level means its midrib across the screen, pointing right or left, whichever is nearer its resting angle.
    camera.updateMatrixWorld();
    const midrib = new T.Vector3(1, 0, 0).applyQuaternion(leaf.shown.quaternion);
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    leaf.flight = {
      appearAt, appear, showcase: departAt - appearAt, group: batch,
      levelSign: midrib.dot(right) >= 0 ? 1 : -1,
      duration: float * (1 + random() * 0.17),          // 7.2 to 8.4 seconds by default
      swings: 4 + random() * 1.2,                       // side-to-side swings on the way up
      side: random() > 0.5 ? 1 : -1,                    // which way the first swing goes
      reach: 0.22 + random() * 0.08,                    // how far the swings go, of half the view's width
      rock: 0.24 + random() * 0.1,                      // how far it rocks at the end of a swing (radians)
      flutter: 0.25 + random() * 0.15,                  // how far it tips about its midrib (radians)
      drift: random() * Math.PI * 2,                    // where its gentle drift at the bottom middle starts
    };
    leaf.state = 'landing';
  }

  const restPosition = new T.Vector3(), restPose = new T.Quaternion(), floatPose = new T.Quaternion();
  const axisX = new T.Vector3(), axisZ = new T.Vector3(), basis = new T.Matrix4(), tipping = new T.Quaternion();
  const viewForward = new T.Vector3(), viewRight = new T.Vector3(), viewUp = new T.Vector3();
  const start = new T.Vector3(), restMidrib = new T.Vector3(), level = new T.Vector3(), face = new T.Vector3();
  const restFace = new T.Vector3(), turnSense = new T.Vector3();
  const MIDRIB_AXIS = new T.Vector3(1, 0, 0);

  // The leaf facing the viewer, its midrib along the given direction, tipped about its midrib.
  function facingPose(midrib, tip) {
    axisZ.crossVectors(midrib, face);
    basis.makeBasis(midrib, face, axisZ);
    return floatPose.setFromRotationMatrix(basis).multiply(tipping.setFromAxisAngle(MIDRIB_AXIS, tip));
  }

  function placeFlight(leaf, time, elapsed, dt) {
    const f = leaf.flight;
    // Where it would rest right now, swaying with the tree, so the float ends exactly there (gliding there
    // from its spot before if the tree has just changed stage).
    placeAtRest(leaf, elapsed);
    glideToNewSpot(leaf, dt);
    restPosition.copy(leaf.mesh.position);
    restPose.copy(leaf.mesh.quaternion);

    // The view as it is now, at the depth of the leaf's spot.
    camera.updateMatrixWorld();
    camera.getWorldDirection(viewForward);
    viewRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    viewUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const depth = Math.max(1, start.subVectors(restPosition, camera.position).dot(viewForward));
    const halfHeight = depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    // Its place in its group's row at the bottom of the screen, below the tree: the row spread evenly over the
    // screen's width (from left to right, in half widths), clear of the title box, every leaf of the group the
    // same size on screen (half: its half size, in half heights), made smaller when the row is too narrow for
    // them to stand apart.
    const group = f.group;
    const count = Math.max(1, group.members.length);
    const slot = Math.max(0, group.members.indexOf(leaf));
    const aspect = Math.max(0.3, camera.aspect);
    // (From a normal leaf's size, so a VIP's leaf, larger on the tree, shows the same size as the others here.)
    if (group.half === null) group.half = (currentScale({ isVip: false }) * MODEL_SIZE * SHOWCASE_SIZE / 2) / halfHeight;
    const halfFor = (left, right) => Math.min(group.half, count > 1 ? ((right - left) / count) * aspect * 0.36 : group.half, aspect * 0.8);
    let left = -BATCH_ROW_WIDTH, right = BATCH_ROW_WIDTH;
    let half = halfFor(left, right);
    const rowAt = size => Math.min(-0.35, -1 + size + 0.06); // just above the bottom of the screen
    let rowY = rowAt(half);
    const canvasHeight = renderer.domElement.clientHeight || window.innerHeight;
    const canvasWidth = renderer.domElement.clientWidth || window.innerWidth;
    for (const area of rowObstacles()) {
      const rowTop = ((1 - rowY - half) / 2) * canvasHeight, rowBottom = ((1 - rowY + half) / 2) * canvasHeight;
      if (area.bottom <= rowTop || area.top >= rowBottom) continue;
      // Beside the row (the title box, the Year Review button): the row keeps to the side of the screen away
      // from it, or, with it in the middle, the row goes just above it.
      const areaLeft = (area.left / canvasWidth) * 2 - 1, areaRight = (area.right / canvasWidth) * 2 - 1;
      const margin = 0.03;
      if (areaRight < 0) left = Math.max(left, areaRight + margin);
      else if (areaLeft > 0) right = Math.min(right, areaLeft - margin);
      else rowY = 1 - (2 * (area.top - half * (canvasHeight / 2) - 8)) / canvasHeight;
      half = halfFor(left, right);
      if (areaRight < 0 || areaLeft > 0) rowY = rowAt(half);
    }
    const startHalf = half * halfHeight; // in the world, at this depth
    const slotX = left + (right - left) * (slot + 0.5) / count;
    start.copy(camera.position).addScaledVector(viewForward, depth)
      .addScaledVector(viewUp, rowY * halfHeight).addScaledVector(viewRight, slotX * halfHeight * aspect);
    const showScale = (2 * startHalf) / MODEL_SIZE; // its scale at the size shown in the row
    // Its resting angle as the viewer sees it, level, and the side of it that faces the viewer.
    restMidrib.set(1, 0, 0).applyQuaternion(restPose);
    restMidrib.addScaledVector(viewForward, -restMidrib.dot(viewForward));
    if (restMidrib.lengthSq() < 1e-4) restMidrib.copy(viewRight);
    restMidrib.normalize();
    level.copy(viewRight).multiplyScalar(f.levelSign);
    restFace.set(0, 1, 0).applyQuaternion(restPose);
    face.copy(viewForward).multiplyScalar(restFace.dot(viewForward) > 0 ? 1 : -1); // towards the viewer, as a rule
    const toRest = Math.atan2(turnSense.crossVectors(level, restMidrib).dot(viewForward), level.dot(restMidrib));

    const since = time - f.appearAt;
    if (since < f.showcase) {
      // In its group's row: fading in as it rises a little into place, then drifting gently, name level.
      // The drift calms to nothing before it floats up, so the float starts from exactly here.
      const shown = Math.max(0, since);
      const appear = smoothstep(0, f.appear, shown);
      const settle = Math.max(1, Math.min(1200, f.showcase / 2));
      const idle = smoothstep(0, settle, shown) * (1 - smoothstep(f.showcase - settle, f.showcase, shown));
      const seconds = shown / 1000;
      leaf.mesh.position.copy(start)
        .addScaledVector(viewUp, startHalf * (0.07 * Math.sin(seconds * 1.9 + f.drift) * idle - 0.25 * (1 - appear)))
        .addScaledVector(viewRight, startHalf * 0.05 * Math.sin(seconds * 1.1 + f.drift * 2) * idle);
      axisX.copy(level).applyAxisAngle(viewForward, 0.07 * Math.sin(seconds * 1.5 + f.drift) * idle);
      leaf.mesh.quaternion.copy(facingPose(axisX, 0.16 * Math.sin(seconds * 2.3 + f.drift) * idle));
      leaf.mesh.scale.setScalar(showScale * (0.88 + 0.12 * appear));
      leaf.mesh.scale.x *= sideSign(leaf);
      leaf.material.opacity = since < 0 ? 0 : appear; // waiting its turn: not shown yet
      return;
    }

    const t = Math.min(1, (since - f.showcase) / f.duration);
    const s = flightEase(t);            // the way up: gentle start, long soft arrival
    const swing = Math.PI * f.swings * t; // a steady rhythm, as a falling leaf's
    const calm = (1 - s) ** 1.3;          // the swings die away as it arrives
    const sway = Math.sin(swing) * calm;
    const amplitude = halfHeight * camera.aspect * f.reach;
    leaf.mesh.position.lerpVectors(start, restPosition, s)
      .addScaledVector(viewRight, f.side * amplitude * sway)
      .addScaledVector(viewUp, 0.16 * amplitude * Math.sin(swing) ** 2 * calm); // lifting at each end

    // Facing the viewer, turning from level to its resting angle, rocking with the swing and tipping about
    // its midrib; then settling into exactly its resting pose.
    axisX.copy(level).applyAxisAngle(viewForward, toRest * smoothstep(0.05, 0.7, s) - f.side * f.rock * sway);
    facingPose(axisX, f.flutter * Math.sin(swing * 2) * calm);
    leaf.mesh.quaternion.slerpQuaternions(floatPose, restPose, smoothstep(0.55, 1, s));

    // Its size in the row at the start, back to a normal visitor's leaf size early in the float (SHRINK_SHARE),
    // floating up at that standard size, every leaf alike; a VIP's leaf grows to its own size on the tree (the
    // admin's VIP leaf scale) only as it settles onto its twig.
    const floatScale = currentScale({ isVip: false });
    const size = T.MathUtils.lerp(showScale, floatScale, smoothstep(0, SHRINK_SHARE, t));
    leaf.mesh.scale.setScalar(T.MathUtils.lerp(size, leaf.scale, smoothstep(0.85, 1, t)));
    leaf.mesh.scale.x *= sideSign(leaf);
    // (Fading in here too when the admin sets no time at the bottom middle.)
    leaf.material.opacity = smoothstep(0, f.appear, since) * T.MathUtils.lerp(1, facingAmount(leaf), smoothstep(0.8, 1, s));
    if (t >= 1) {
      leaf.state = 'resting';
      leaf.restingSince = time;
      leaf.flight = null;
      letOldestFall(); // first in, first out: now the oldest leaf waiting falls
    }
  }

  // ---------- resting (swaying with the tree) ----------

  // ---------- kept apart as the viewer sees them ----------

  // Each leaf's spot is clear of the others as the view was when it was placed. Seen from another side (the
  // tree turning), leaves at different depths of the canopy can line up and cover each other. So every frame
  // any two leaves on the tree that overlap on the screen are eased apart, across the view, just far enough
  // to stand clear of each other (SPREAD_GAP), each by at most SPREAD_MAX of its own size so it stays on the
  // canopy (a leaf near the canopy's outline as seen moves along it or inwards, not out into the sky); with
  // nothing in its way a leaf eases back to its own spot. They move smoothly (SPREAD_EASE).
  const SPREAD_GAP = 1;        // two leaves' centres kept at least their two half sizes apart
  const SPREAD_MAX = 2.2;      // the furthest a leaf moves aside from its spot, in leaf sizes
  const SPREAD_EASE = 4;       // how quickly a leaf moves aside (per second)
  const SPREAD_RETURN = 0.35;  // how quickly it eases back to its spot once nothing is in its way (per second)
  const spreadRight = new T.Vector3(), spreadUp = new T.Vector3(), spreadForward = new T.Vector3();
  const spreadAt = new T.Vector3(), spreadPush = new T.Vector3();
  const spreadAngle = key => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h % 360) * Math.PI / 180; };
  function spreadApart(dt) {
    const shown = [];
    for (const leaf of leaves.values()) {
      leaf.spread ??= new T.Vector3();
      leaf.spreadTarget ??= new T.Vector3();
      leaf.spreadTarget.multiplyScalar(Math.max(0, 1 - dt * SPREAD_RETURN)); // back towards its own spot
      if (leaf.state === 'resting' && (leaf.shown.glide ?? 1) > 0.05) shown.push(leaf);
    }
    if (shown.length > 1) {
      camera.updateMatrixWorld();
      spreadRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      spreadUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      camera.getWorldDirection(spreadForward);
      // Each leaf across the view as seen (its offset from the camera over its depth, so near and far leaves
      // compare as they look), with its half size seen the same way.
      // The canopy's outline as seen: an oval inside its extent (canopyBox) across the view.
      let outline = null;
      if (canopyBox) {
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (let corner = 0; corner < 8; corner++) {
          spreadAt.set(corner & 1 ? canopyBox.max.x : canopyBox.min.x, corner & 2 ? canopyBox.max.y : canopyBox.min.y,
            corner & 4 ? canopyBox.max.z : canopyBox.min.z).sub(camera.position);
          const depth = Math.max(0.5, spreadAt.dot(spreadForward));
          const u = spreadAt.dot(spreadRight) / depth, v = spreadAt.dot(spreadUp) / depth;
          minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
        }
        outline = { u: (minU + maxU) / 2, v: (minV + maxV) / 2, ru: Math.max(1e-3, (maxU - minU) / 2 * 0.92), rv: Math.max(1e-3, (maxV - minV) / 2 * 0.92) };
      }
      const seen = shown.map(leaf => {
        spreadAt.copy(leaf.shown.position).add(leaf.spreadTarget).sub(camera.position);
        const depth = Math.max(0.5, spreadAt.dot(spreadForward));
        return { leaf, depth, u: spreadAt.dot(spreadRight) / depth, v: spreadAt.dot(spreadUp) / depth,
          half: (leaf.scale * MODEL_SIZE * 0.5) / depth, du: 0, dv: 0 };
      });
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < seen.length; i++) {
          const a = seen[i];
          for (let j = i + 1; j < seen.length; j++) {
            const b = seen[j];
            let x = (b.u + b.du) - (a.u + a.du), y = (b.v + b.dv) - (a.v + a.dv);
            const need = (a.half + b.half) * SPREAD_GAP;
            const apart = Math.hypot(x, y);
            if (apart >= need) continue;
            if (apart < 1e-6) { const angle = spreadAngle(b.leaf.key); x = Math.cos(angle); y = Math.sin(angle); } // on top of each other
            else { x /= apart; y /= apart; }
            const push = (need - apart) / 2;
            a.du -= x * push; a.dv -= y * push;
            b.du += x * push; b.dv += y * push;
          }
        }
      }
      for (const item of seen) {
        const { leaf, depth, u, v } = item;
        let { du, dv } = item;
        if (!du && !dv) continue;
        if (outline) {
          // Not pushed out past the canopy's outline: the outward part of the push is left out there.
          const out = (x, y) => Math.hypot((x - outline.u) / outline.ru, (y - outline.v) / outline.rv);
          if (out(u + du, v + dv) > Math.max(out(u, v), 0.85)) {
            let nx = (u - outline.u) / (outline.ru * outline.ru), ny = (v - outline.v) / (outline.rv * outline.rv);
            const length = Math.hypot(nx, ny) || 1;
            nx /= length; ny /= length;
            const outward = du * nx + dv * ny;
            if (outward > 0) { du -= outward * nx; dv -= outward * ny; }
          }
        }
        spreadPush.copy(spreadRight).multiplyScalar(du * depth).addScaledVector(spreadUp, dv * depth);
        leaf.spreadTarget.add(spreadPush).clampLength(0, SPREAD_MAX * leaf.scale * MODEL_SIZE);
        if (surface) {
          // Moved aside only within the canopy as it really is (canopy-surface.js), not off it into the air.
          spreadAt.copy(leaf.shown.position).add(leaf.spreadTarget);
          keepOnSurface(surface, spreadAt, leafInset(leaf));
          leaf.spreadTarget.subVectors(spreadAt, leaf.shown.position);
        }
      }
    }
    const ease = 1 - Math.exp(-dt * SPREAD_EASE);
    for (const leaf of leaves.values()) leaf.spread.lerp(leaf.spreadTarget, ease);
  }

  const sway = new T.Quaternion();
  const swayEuler = new T.Euler();
  const vipTurning = new T.Quaternion(), vipTurnAxis = new T.Vector3();
  function placeAtRest(leaf, elapsed) {
    const { local, phase } = leaf.spot;
    const { position, quaternion } = leaf.shown; // its spot as shown now (turned with the view)
    const aside = leaf.spread; // moved aside so it does not cover another leaf (spreadApart)
    const gust = clock.gust.value;
    // The same breeze as the tree's own leaves (matte-tree.js), so the leaf stays on its twig.
    const reach = smoothstep(2, 13, local.y);
    const breeze = Math.sin(elapsed * 1.7 + local.x * 0.84 + local.z * 0.62);
    leaf.mesh.position.set(
      position.x + (aside?.x || 0) + reach * breeze * (0.024 + 0.05 * gust),
      position.y + (aside?.y || 0) + reach * 0.012 * Math.sin(elapsed * 5.2 + local.x * 2.2),
      position.z + (aside?.z || 0),
    );
    const flutter = (0.035 + 0.12 * gust) * Math.sin(elapsed * 2.3 + phase);
    sway.setFromEuler(swayEuler.set(flutter, 0, flutter * 0.6));
    leaf.mesh.quaternion.copy(quaternion).multiply(sway);
    // A VIP's leaf on the tree turns from left to right and back, about the view's upright (VIP_TURN_ANGLE).
    if (leaf.isVip && leaf.state === 'resting' && settings.vipTurn !== false) {
      const settled = smoothstep(0, VIP_TURN_EASE_IN, (now() - (leaf.restingSince ?? now())) / 1000);
      const angle = VIP_TURN_ANGLE * settled * Math.sin((elapsed * 2 * Math.PI) / VIP_TURN_SECONDS + phase);
      vipTurnAxis.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      leaf.mesh.quaternion.premultiply(vipTurning.setFromAxisAngle(vipTurnAxis, angle));
    }
    leaf.mesh.scale.setScalar(leaf.scale);
    leaf.mesh.scale.x *= sideSign(leaf);
  }

  // ---------- falling (as the 2D leaf fall) ----------

  // The oldest leaf, pushed off the tree by a new one (first in, first out), drops like a real leaf, very
  // smoothly: it lets go gently, glides down in one wide curve (out to its side and a little towards the
  // viewer, never turning back, no zigzag), rocking softly and turning slowly as it tips back towards lying
  // flat, and settles on the ground as it fades away. Every movement starts and ends gently, so nothing
  // jerks. It takes the admin's Leaf Fall Duration (4.2 seconds by default; longer is slower and softer).
  function startFall(leaf) {
    const random = seededRandom(`${leaf.key}|fall`);
    const side = leaf.mesh.position.x - tree.position.x >= 0 ? 1 : -1; // drifts out, away from the trunk
    leaf.fall = {
      began: now(),
      duration: timing().fall,       // the admin's Leaf Fall Duration (4.2 seconds by default)
      from: leaf.mesh.position.clone(),
      fromQuaternion: leaf.mesh.quaternion.clone(),
      ground: tree.position.y + 0.15,
      drift: new T.Vector3(side * (1 + random() * 1.4), 0, 0.6 + random() * 1.1),
      flat: new T.Quaternion().setFromAxisAngle(UP, random() * Math.PI * 2), // lying flat, face up
      rock: 0.12 + random() * 0.1,   // how far it rocks (radians), slowly, about once on the way down
      turn: (random() - 0.5) * Math.PI * 0.5, // a slow quarter turn at most
      phase: random() * Math.PI * 2,
    };
    leaf.state = 'falling';
    leaf.halo.visible = false;
    if (leaf === selectedLeaf) details.close(); // a falling leaf's details card closes
  }

  const UP = new T.Vector3(0, 1, 0);
  const fallTurn = new T.Quaternion(), fallRock = new T.Quaternion();
  const FALL_ROCK_AXIS = new T.Vector3(1, 0, 0);
  function placeFall(leaf, time) {
    const f = leaf.fall;
    const t = Math.min(1, (time - f.began) / f.duration);
    // Every movement starts from rest and ends at rest, so the leaf flows down without a jerk: it drifts out
    // first and then mostly down (one smooth curve, never back), gliding fastest in the middle.
    const down = (1 - Math.cos(Math.PI * t)) / 2;
    const out = smoothstep(0, 0.8, t);
    leaf.mesh.position.set(
      f.from.x + f.drift.x * out,
      T.MathUtils.lerp(f.from.y, f.ground, down),
      f.from.z + f.drift.z * out,
    );
    // Tipping back towards lying flat (halfway, so it stays visible), turning slowly and rocking softly.
    leaf.mesh.quaternion.slerpQuaternions(f.fromQuaternion, f.flat, 0.5 * down);
    leaf.mesh.quaternion.multiply(fallTurn.setFromAxisAngle(UP, f.turn * down));
    leaf.mesh.quaternion.multiply(fallRock.setFromAxisAngle(FALL_ROCK_AXIS,
      f.rock * Math.sin(Math.PI * 1.6 * t + f.phase) * Math.sin(Math.PI * t)));
    leaf.material.opacity = 1 - smoothstep(0.72, 1, t);
    return t >= 1;
  }

  // ---------- a leaf's details, on click (as the 2D tree) ----------

  // Clicking (or tapping) a leaf opens its details card beside it (leaf-detail.js), and the leaf grows a
  // little while the card is open. A press that moves is a drag to turn the view, not a click. Only the leaf
  // itself counts, not the transparent square around it, and where leaves overlap, the one drawn on top.
  // Clicking away from the leaves closes the card, and so does turning the view (a drag, the arrow keys or
  // the slow orbit), since the leaf then moves away from the card. The cursor shows a hand over a leaf.
  let selectedLeaf = null;
  const details = createLeafDetail({ onClose: () => { selectedLeaf = null; } });
  const cardView = new T.Vector3();   // the way the camera looked when the card opened
  const currentView = new T.Vector3();
  const CARD_TURN_LIMIT = T.MathUtils.degToRad(3); // a click's tiny wobble stays under this
  const canvas = renderer.domElement;
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  let leafAlpha; // the leaf picture's transparency, read once (null when it cannot be read)

  function readLeafAlpha() {
    if (leafAlpha !== undefined) return leafAlpha;
    leafAlpha = null;
    try {
      const image = model?.texture?.image;
      if (!image) return leafAlpha;
      const size = 256;
      const sample = document.createElement('canvas');
      sample.width = sample.height = size;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, size, size);
      leafAlpha = { size, data: context.getImageData(0, 0, size, size).data };
    } catch (error) {
      console.warn('The leaf picture could not be read for clicks; the whole leaf square counts.', error);
    }
    return leafAlpha;
  }

  function onLeafItself(uv) {
    const alpha = readLeafAlpha();
    if (!alpha || !uv) return true;
    const x = Math.min(alpha.size - 1, Math.max(0, Math.floor(uv.x * alpha.size)));
    const y = Math.min(alpha.size - 1, Math.max(0, Math.floor(uv.y * alpha.size)));
    return alpha.data[(y * alpha.size + x) * 4 + 3] > 80;
  }

  function leafAt(clientX, clientY) {
    if (!group.visible || !leaves.size) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const shown = [...leaves.values()].filter(leaf => leaf.state !== 'falling' && leaf.material.opacity > 0.3);
    const hits = raycaster.intersectObjects(shown.map(leaf => leaf.mesh), false).filter(hit => onLeafItself(hit.uv));
    if (!hits.length) return null;
    hits.sort((a, b) => b.object.renderOrder - a.object.renderOrder); // the leaf drawn on top
    return shown.find(leaf => leaf.mesh === hits[0].object) || null;
  }

  let press = null;
  canvas.addEventListener('pointerdown', event => {
    press = { x: event.clientX, y: event.clientY, at: performance.now(), id: event.pointerId };
    canvas.classList.remove('over-feedback-leaf'); // the grab cursor while dragging
  });
  canvas.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const quick = performance.now() - press.at < 700;
    press = null;
    if (moved > 8 || !quick) return; // a drag that turned the view
    const leaf = leafAt(event.clientX, event.clientY);
    if (!leaf) { details.close(); return; }
    selectedLeaf = leaf;
    camera.getWorldDirection(cardView);
    details.show({ visitor: leaf.visitor, badgeColour: badgeColour(leaf.visitor), x: event.clientX, y: event.clientY });
  });
  let lastHover = 0;
  canvas.addEventListener('pointermove', event => {
    // Starting to drag the view closes the card at once.
    if (press && press.id === event.pointerId && details.isOpen()
      && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) details.close();
    if (event.buttons || event.pointerType === 'touch') return;
    const time = performance.now();
    if (time - lastHover < 90) return;
    lastHover = time;
    const over = leafAt(event.clientX, event.clientY);
    canvas.classList.toggle('over-feedback-leaf', Boolean(over));
  });

  // ---------- every frame ----------

  // A resting leaf shows in full while it is on the viewer's half of the tree (round the trunk, as seen from
  // above: every leaf's spot is, out to both sides of the canopy, FRONT_REACH), and fades only were it round the
  // back. Not by which way the canopy's surface faces there: at the canopy's two ends that faces sideways, which
  // left the leaves there (and a VIP's at the side) half see-through. A VIP's leaf, kept at the side, always shows.
  function facingAmount(leaf) {
    if (leaf.isVip) return 1;
    const p = leaf.shown.position;
    const x = p.x - orbitCentre.x, z = p.z - orbitCentre.z, cx = camera.position.x - orbitCentre.x, cz = camera.position.z - orbitCentre.z;
    const front = (x * cx + z * cz) / Math.max(1e-6, Math.hypot(x, z) * Math.hypot(cx, cz)); // 1 facing the viewer, 0 at the side
    return smoothstep(-0.1, 0.1, front);
  }

  // Nearer leaves are drawn over farther ones: glow, leaf, then its name, leaf by leaf. A leaf floating in
  // is drawn over all the resting ones.
  function orderByDistance() {
    const ordered = [...leaves.values()].sort((a, b) =>
      (a.state === 'landing') - (b.state === 'landing')
      || b.mesh.position.distanceToSquared(camera.position) - a.mesh.position.distanceToSquared(camera.position));
    ordered.forEach((leaf, i) => {
      const base = 10 + i * 5;
      leaf.halo.renderOrder = base;
      leaf.nameLabel.renderOrder = base + 3;
      leaf.mesh.renderOrder = base + 2;
      leaf.sparkle.renderOrder = base + 4; // a VIP's star of light, over its leaf and name
    });
  }

  const haloSize = new T.Vector3();
  const haloVivid = new T.Color();
  const nightLight = new T.Color();
  // The leaves keep to the tree: each spot is kept in the tree's own terms (spot.local), so when the tree
  // grows or shrinks in size (a new stage growing to its own size, tree-growth.js) every leaf moves with its
  // twig. Checked when the tree's place or size changes.
  let treeKey = '';
  function followTree() {
    tree.updateMatrixWorld();
    const key = tree.matrixWorld.elements.map(value => value.toFixed(5)).join(',');
    if (key === treeKey) return;
    treeKey = key;
    // The canopy's free spots and its extent, where they are now.
    for (const anchor of anchors) if (anchor.local) anchor.position.copy(anchor.local).applyMatrix4(tree.matrixWorld);
    if (anchors.length) canopyBox = new T.Box3().setFromPoints(anchors.map(anchor => anchor.position));
    for (const leaf of leaves.values()) {
      if (leaf.state === 'falling' || !leaf.spot.local) continue;
      leaf.spot.position.copy(leaf.spot.local).applyMatrix4(tree.matrixWorld);
      leaf.spot.around = undefined; // its angle and distance round the trunk again (shownSpot)
      leaf.spot.reach = undefined;
      leaf.spot.depth = undefined;
    }
  }

  // A leaf moved to a new spot (a new stage's canopy, moveLeavesTo) glides there from where it was (one
  // floating in: its float goes on to the new spot, placeFlight).
  const LEAF_MOVE_SECONDS = 3;
  const moveQuaternion = new T.Quaternion();
  function glideToNewSpot(leaf, dt) {
    const move = leaf.restMove;
    if (!move) return;
    move.t = Math.min(1, move.t + dt / LEAF_MOVE_SECONDS);
    const k = smoothstep(0, 1, move.t);
    leaf.mesh.position.lerpVectors(move.position, leaf.mesh.position, k);
    moveQuaternion.copy(leaf.mesh.quaternion);
    leaf.mesh.quaternion.slerpQuaternions(move.quaternion, moveQuaternion, k);
    if (move.t >= 1) leaf.restMove = null;
  }

  function update(dt, elapsed) {
    if (!group.visible) return;
    const time = now();
    followTree();
    nightLight.setRGB(1, 1, 1).lerp(NIGHT_LEAF, clock.night?.value || 0);
    // Once the view has turned (by any means) the clicked leaf has moved away, so its card closes.
    if (details.isOpen() && camera.getWorldDirection(currentView).angleTo(cardView) > CARD_TURN_LIMIT) details.close();
    for (const leaf of leaves.values()) if (leaf.state !== 'falling') shownSpot(leaf, leaf.shown);
    spreadApart(dt); // leaves that overlap as the viewer sees them move apart
    for (const [key, leaf] of leaves) {
      leaf.scale += (currentScale(leaf) - leaf.scale) * Math.min(1, dt * 4); // size changes ease in
      leaf.colour.lerp(leaf.targetColour, Math.min(1, dt * 0.9));     // colour changes fade over a few seconds
      if (leaf.state === 'landing') placeFlight(leaf, time, elapsed, dt);
      else if (leaf.state === 'falling') {
        if (placeFall(leaf, time)) { removeLeaf(leaf); leaves.delete(key); continue; }
      } else {
        leaf.restingSince ??= time;
        placeAtRest(leaf, elapsed);
        glideToNewSpot(leaf, dt);
        leaf.material.opacity = facingAmount(leaf) * (leaf.shown.glide ?? 1); // faded at the edges of its glide
      }
      leaf.material.opacity *= within(settings.leafOpacity, 1, 0.1, 1); // the admin's Leaf Opacity (2D: leafOpacity)
      if (leaf.appear !== undefined && leaf.appear < 1) { // moved clear of the title box: fades in at its new spot
        leaf.appear = Math.min(1, leaf.appear + dt / 0.8);
        leaf.material.opacity *= smoothstep(0, 1, leaf.appear);
      }
      // The leaf whose details card is open grows a little, easing in and out.
      leaf.focus = (leaf.focus || 0) + ((leaf === selectedLeaf ? 1 : 0) - (leaf.focus || 0)) * Math.min(1, dt * 6);
      if (leaf.focus > 0.001) leaf.mesh.scale.multiplyScalar(1 + 0.15 * leaf.focus);

      // A new visitor's green glow comes first (as on the 2D tree); otherwise a VIP leaf pulses gold.
      const glow = leaf.state === 'resting' ? glowAmount(leaf, time) : 0;
      const gold = glow <= 0.01 && leaf.isVip && settings.vipGlow !== false && leaf.state !== 'falling'
        ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((time / 2000) * Math.PI * 2)) // 2D vipGoldPulse, 2 s
        : 0;
      const vipBright = leaf.isVip ? within(settings.vipLeafBrightness, 70, 30, 120) / 100 : 1; // the admin's VIP leaf brightness
      leaf.material.color.copy(leaf.colour).lerp(NEON, glow * 0.35)
        .multiplyScalar(!leaf.isVip ? 1 : vipBright * (leafLook.aura ? VIP_GLOWING.leaf * (1 + gold * VIP_GLOWING.pulse) : 1 + gold * VIP_NATURAL.pulse));
      if (!leafLook.aura) leaf.material.color.multiply(nightLight);
      placeName(leaf);
      // A long name scrolling inside the leaf (scrollingNameLabel): its window held at the start, then sliding
      // along at a steady pace, and round again.
      const scroll = leaf.nameLabel.userData.scroll;
      if (scroll && leaf.nameLabel.visible) {
        const round = (time / 1000 + scroll.phase) % (SCROLL_HOLD + scroll.travel);
        leaf.nameLabel.material.map.offset.x = round < SCROLL_HOLD ? 0 : ((round - SCROLL_HOLD) / scroll.travel) * scroll.share;
      }
      // Glowing look: every leaf glows in its own colour (AURA), breathing gently, each at its own pace, with
      // a light sweeping across it now and then. In both looks a new visitor's leaf glows green, and a VIP's
      // pulses gold.
      const sweep = ((time / 1000 + leaf.spot.phase * 2) % SHIMMER_EVERY) / SHIMMER_SWEEP;
      leaf.material.userData.shimmer.value = leafLook.aura && sweep <= 1 ? sweep : -1;
      leaf.halo.visible = leaf.material.opacity > 0.01 && (leafLook.aura || glow > 0.01 || gold > 0);
      if (leaf.halo.visible) {
        const breathe = leafLook.aura ? AURA * (0.8 + 0.2 * Math.sin(time / 1400 + leaf.spot.phase)) : 0;
        if (glow > 0.01) leaf.halo.material.color.copy(NEON);
        else if (gold > 0) leaf.halo.material.color.copy(GOLD_GLOW);
        else { // its own colour, a little brightened in that colour (not whitened)
          const own = leaf.halo.material.color.copy(leaf.colour).multiplyScalar(1 / TINT_BOOST);
          own.lerp(haloVivid.copy(own).multiplyScalar(1 / Math.max(own.r, own.g, own.b, 0.001)), 0.15);
        }
        leaf.halo.position.copy(leaf.mesh.position);
        leaf.halo.scale.copy(haloSize.setScalar(leaf.scale * MODEL_SIZE * (glow > 0.01 ? 2.6 : 2.5)));
        leaf.halo.material.opacity = Math.max(breathe * (leaf.isVip ? vipBright : 1),
          glow > 0.01 ? glow * 0.75 : gold * (leafLook.aura ? VIP_GLOWING.halo : VIP_NATURAL.halo) * vipBright) * leaf.material.opacity;
      }
      // A VIP's star of light at the leaf's tip: twinkling (brightest every SPARKLE_EVERY seconds, each leaf at
      // its own time), turning slowly, with its leaf (shown as the leaf is, and not while it falls).
      // (Unless the admin turns the star off: 3D VIP Leaf Adjustments, tree3dParameters.vipSparkle.)
      leaf.sparkle.visible = leaf.isVip && settings.vipSparkle !== false && leaf.state !== 'falling' && leaf.material.opacity > 0.01;
      if (leaf.sparkle.visible) {
        const beat = (time / 1000 / SPARKLE_EVERY + leaf.spot.phase) % 1;
        const twinkle = 0.55 + 0.45 * Math.pow(Math.max(0, Math.cos(beat * Math.PI * 2)), 6);
        leaf.mesh.updateMatrixWorld();
        leaf.sparkle.position.copy(LEAF_TIP).applyMatrix4(leaf.mesh.matrixWorld);
        leaf.sparkle.scale.setScalar(leaf.scale * MODEL_SIZE * SPARKLE_SIZE * (0.7 + 0.5 * twinkle));
        leaf.sparkle.material.rotation = time / 4000 + leaf.spot.phase;
        leaf.sparkle.material.opacity = Math.min(0.75, twinkle * 0.8) * Math.min(1, vipBright + 0.2) * leaf.material.opacity; // soft
      }
    }
    // No new leaf on its way any more (one was removed meanwhile): the leaves still waiting fall.
    if (fallQueue.length && !waiting.size && ![...leaves.values()].some(leaf => leaf.state === 'landing')) {
      while (fallQueue.length) letOldestFall();
    }
    orderByDistance();
  }

  // The tree has grown (tree-growth.js): new leaves get spots on the canopy as it is now. Leaves already on
  // the tree stay where they are (the canopy has grown out round them).
  function canopyGrew() {
    if (!model) return;
    ({ anchors, surface } = canopyAnchors(tree, true, undefined, spotInset()));
    canopyBox = anchors.length ? new T.Box3().setFromPoints(anchors.map(anchor => anchor.position)) : null;
  }

  // The tree has grown into another stage, in place (scene.js): every leaf moves to the matching place on the
  // new tree's canopy (moveLeavesTo), and then grows and turns with it (followTree).
  function setTree(next) {
    moveLeavesTo(next);
  }

  // Each leaf goes to the same place on the new canopy as it had on the old: its position within the old
  // canopy's extent (high on the left stays high on the left), on the nearest spot of the new canopy's foliage
  // not taken by another leaf, turned as the canopy there faces; a leaf on the tree glides there from where it
  // was (glideToNewSpot), one floating in flies on to its new spot.
  function moveLeavesTo(next) {
    followTree(); // the old tree's leaves and canopy where they are now
    const oldBox = canopyBox ? canopyBox.clone() : null;
    next.updateMatrixWorld(true);
    // The new canopy as it grows to (its growth spurt), not just the foliage it starts with, so the leaves
    // sit on its outside once it has grown, as they did on the tree before.
    const growingTo = next.userData.foliageTarget ?? next.userData.foliageShown ?? 1;
    const measured = model ? canopyAnchors(next, true, growingTo, spotInset()) : { anchors: [], surface: null };
    const fresh = measured.anchors;
    tree = next;
    treeKey = '';
    anchors = fresh;
    surface = measured.surface;
    canopyBox = fresh.length ? new T.Box3().setFromPoints(fresh.map(anchor => anchor.position)) : null;
    // Spots kept for leaves not on the tree now (fallen, or off it on a bare trunk) belonged to the old tree:
    // such a leaf gets a new spot on this one if it comes back.
    for (const key of [...placed.keys()]) {
      const leaf = leaves.get(key);
      if (!leaf || leaf.state === 'falling') placed.delete(key);
    }
    if (!fresh.length) return; // a bare trunk: the leaves fall (showVisitors)
    fitScale = leavesFit([...leaves.values()].filter(leaf => leaf.state !== 'falling').length || 1);
    if (oldBox) moveOnto(next, fresh, oldBox, canopyBox);
    followTree();
    // The first leaves, which came while the tree was a bare trunk: they fly in now.
    if (waiting.size || !oldBox) refresh();
  }

  function moveOnto(next, fresh, oldBox, newBox) {
    const oldCentre = oldBox.getCenter(new T.Vector3()), oldHalf = oldBox.getSize(new T.Vector3()).multiplyScalar(0.5);
    const newCentre = newBox.getCenter(new T.Vector3()), newHalf = newBox.getSize(new T.Vector3()).multiplyScalar(0.5);
    const want = new T.Vector3();
    const taken = new Set();
    for (const leaf of leaves.values()) {
      if (leaf.state === 'falling') continue;
      const spot = leaf.spot;
      for (const axis of ['x', 'y', 'z']) {
        const share = oldHalf[axis] > 1e-3 ? (spot.position[axis] - oldCentre[axis]) / oldHalf[axis] : 0;
        want[axis] = newCentre[axis] + share * newHalf[axis];
      }
      let best = -1, bestScore = Infinity;
      const full = taken.size >= fresh.length; // more leaves than spots: they share
      fresh.forEach((anchor, index) => {
        if (taken.has(index) && !full) return;
        // Near the wanted place, facing much the same way.
        const score = anchor.position.distanceToSquared(want) * (1.6 - 0.6 * anchor.outward.dot(spot.outward));
        if (score < bestScore) { bestScore = score; best = index; }
      });
      if (best < 0) continue;
      taken.add(best);
      const anchor = fresh[best];
      const turn = new T.Quaternion().setFromUnitVectors(spot.outward.clone().normalize(), anchor.outward.clone().normalize());
      const moved = {
        ...spot,
        position: anchor.position.clone(),
        outward: anchor.outward.clone(),
        quaternion: turn.multiply(spot.quaternion.clone()),
        local: next.worldToLocal(anchor.position.clone()),
        around: undefined,
        reach: undefined,
        depth: undefined,
      };
      // It glides from where it is (on the tree), or from where it would have rested (floating in).
      const from = leaf.state === 'resting' ? leaf.mesh : shownSpot(leaf, { position: new T.Vector3(), quaternion: new T.Quaternion(), outward: new T.Vector3() });
      leaf.restMove = { position: from.position.clone(), quaternion: from.quaternion.clone(), t: 0 };
      leaf.spot = moved;
      placed.set(leaf.key, moved);
    }
  }

  return { update, canopyGrew, setTree, ready };
}
