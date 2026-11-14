// Feedback leaves on the 3D ESG Tree: one RainTree leaf (assets/Tree/3dTreeLeaves) per feedback of the
// year, with the same behaviour as the 2D tree's leaves (frontend/tree/tree.js):
//   - each leaf has its own spot on the outer canopy, chosen at random but kept between refreshes,
//     never overlapping another leaf, and its own random angle;
//   - left and right leaves, as the 2D tree's LeftLeaf / RightLeaf pictures: the RainTree leaf as it is
//     is a right leaf, mirrored it is a left leaf (mixed at random, or one side, from the admin);
//   - a new feedback's leaf appears at the bottom middle of the screen at twice its size and stays there for
//     12 seconds (SHOWCASE_MS), drifting gently with its name level; then it slowly floats up to its place
//     on the tree like a falling leaf in reverse: swinging gently from side to side and rocking like a
//     cradle, the swings dying away as it shrinks and settles onto its twig. Several new leaves take turns;
//   - leaves are placed where the viewer sees them: on screen, and not under the title box;
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
//   - when the view turns round the tree (dragging, the arrow keys or the slow 24h orbit), every leaf stays
//     where it is on the tree, at its own angle, without turning or moving; a leaf the view leaves round the
//     back of the tree fades away rather than showing through it, and comes back when the view returns;
//   - every leaf stays easy to see on the canopy: it is never darker than a set lightness;
//   - the leaf's veins show: the leaf model's own vein relief (its normal map) shades the leaf as if lit from
//     the upper left, and the faint vein lines of its picture are strengthened, so they read at a distance;
//   - a VIP's leaf (a name on the admin's VIP Management list, as /api/tree marks it, or a name from
//     /api/tree/vip-names) is gold, with the 2D tree's gold pulse, at its own VIP scale.
// Colours (light green new, dark green older), left or right leaves, size and how long a leaf counts as
// new come from the admin's 3D Leaf
// Adjustments (tree3d-settings.js). New feedback is checked every 5 seconds from /api/tree.

import { THREE as T, GLTFLoader } from './vendor/three-runtime.js';
import { onTree3dSettings } from './tree3d-settings.js';

const LEAF_MODEL = '/assets/Tree/3dTreeLeaves/RainTree_Leaf_Final12.glb';
const MODEL_SIZE = 0.1;          // the leaf model is 10 cm across
const BASE_SIZE = 1.8;           // metres across at scale 1, so a leaf and the name on it read from across the room
const POLL_MS = 5000;            // as the 2D tree's live refresh
const RECENT_LANDING_MS = 2 * 60 * 1000; // on opening, leaves this recent fly in (2D: recentLandingWindowMs)
const GLOW_MS = 60 * 1000;       // a new visitor's leaf glows for a minute (2D: leafGlowDurationMs)
const GLOW_FADE_MS = 900;
const FALL_MS = 4200;            // 2D: leafFallDuration
const FLOAT_MS = 7200;           // a new leaf floats up for 7.2 to 8.4 seconds (slower than the 2D flight)
const NAME_FLIP_MARGIN = 0.44;   // a name turns over only when its leaf is 25 degrees past upright (no flicker)
const SHOWCASE_MS = 12000;       // a new leaf shows at the bottom middle of the screen this long before floating up
const APPEAR_MS = 900;           // how long it takes to fade in there
const STAGE_CLEAR_MS = 3000;     // the next new leaf appears there this long after the one before starts floating up
const TINT_BOOST = 2.3;          // the leaf picture is mid grey: this brings the chosen colour back to strength
const NEON = new T.Color(0x39ff14);
const MIN_LIGHTNESS = 0.38;      // a leaf colour is shown at least this light (HSL), so it stands out on the canopy
// Veins. The leaf picture is an almost even grey (its veins only ~5% lighter), while its normal map has
// clear vein relief. The leaf is unlit like the tree, so the relief is turned into shading here.
const VEIN_LINES = 6.0;          // how much the picture's own light vein lines are strengthened
const VEIN_RELIEF = 1.6;        // how strongly the vein relief shades the leaf (0 = flat)
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
// tree), with a little margin. Every name uses the same font size, so the same line height.
const NAME_LINE_HEIGHT = 0.012;  // 12% of the leaf
const NAME_CENTRE_X = -0.0034;
const NAME_CENTRE_Z = -0.0011;
const NAME_BOXES = [            // lines -> widest box inside the blade, centred on its middle
  { lines: 1, width: 0.054 },
  { lines: 2, width: 0.054 },
  { lines: 3, width: 0.045 },
];
const NAME_FONT_PX = 64;          // canvas pixels per font size
const NAME_LIFT = 0.0006;        // how far the name sits off the leaf surface, towards the viewer
const GOLD_GLOW = new T.Color(0xffd23f); // the 2D VIP leaf's gold glow (vipGoldPulse in tree.css)

const DEFAULTS = { showFeedbackLeaves: true, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e', leafSide: 'both', leafNewHours: 24, leafScale: 1, showLeafNames: true,
  tree2d: { leafFallThreshold: 15, treeStage: 4 },
  vipLeafColor: '#d4af37', vipLeafScale: 1, vipGlow: true };

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

// A leaf colour as shown: the chosen green or gold, lifted to at least MIN_LIGHTNESS so a dark green
// leaf still stands out against the tree's own dark foliage.
function displayColour(hex) {
  const colour = new T.Color(hex);
  const hsl = {};
  colour.getHSL(hsl, T.SRGBColorSpace);
  colour.setHSL(hsl.h, hsl.s, Math.max(hsl.l, MIN_LIGHTNESS), T.SRGBColorSpace);
  return colour.multiplyScalar(TINT_BOOST);
}

// Fits a name inside the leaf as the 2D tree does (fitLeafName): whole words, as few lines as fit (up to
// three), and when even three do not fit, the last line shortened with "…".
const NAME_FONT = `700 ${NAME_FONT_PX}px Inter, "Segoe UI", Arial, sans-serif`;
const measureContext = document.createElement('canvas').getContext('2d');
function fitName(name) {
  measureContext.font = NAME_FONT;
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) words.push('Anonymous');
  const pxPerUnit = NAME_FONT_PX / (NAME_LINE_HEIGHT / 1.1); // canvas px per leaf unit
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
  return { lines: lines.slice(0, box.lines).map(text => shorten(text, box.width)), box, pxPerUnit };
}

// The name drawn for the leaf: white bold with a dark edge, readable on any leaf colour (2D: white bold
// with a text shadow), on a canvas the size of its box in the blade.
function nameLabel(name) {
  const { lines, box, pxPerUnit } = fitName(name);
  const height = lines.length * NAME_LINE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(box.width * pxPerUnit);
  canvas.height = Math.ceil(height * pxPerUnit);
  const context = canvas.getContext('2d');
  context.font = NAME_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = NAME_FONT_PX * 0.16;
  context.strokeStyle = 'rgba(8, 28, 14, 0.85)';
  context.fillStyle = '#ffffff';
  const linePx = canvas.height / lines.length;
  lines.forEach((line, i) => {
    context.strokeText(line, canvas.width / 2, linePx * (i + 0.5));
    context.fillText(line, canvas.width / 2, linePx * (i + 0.5));
  });
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, width: box.width, height };
}

const NAME_PLANE = new T.PlaneGeometry(1, 1);

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// ---------- where leaves can sit: the outer canopy of the tree ----------

function canopyAnchors(tree) {
  tree.updateMatrixWorld(true);
  const points = [];
  const point = new T.Vector3();
  tree.traverse(object => {
    if (!object.isMesh) return;
    if (![object.material].flat().some(material => material?.alphaTest > 0)) return; // leaves only
    const positions = object.geometry.attributes.position;
    const step = Math.max(1, Math.floor(positions.count / 3000));
    for (let i = 0; i < positions.count; i += step) {
      points.push(point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).clone());
    }
  });
  if (!points.length) return { anchors: [], centre: new T.Vector3() };

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
    anchors.push({ position: p.clone().addScaledVector(outward, 0.45), outward });
  }
  return { anchors, centre };
}

export function addFeedbackLeaves({ scene, tree, clock, camera, renderer }) {
  const group = new T.Group();
  group.name = 'Feedback leaves';
  scene.add(group);

  const leaves = new Map();        // leaf key -> leaf
  const placed = new Map();        // leaf key -> canopy spot, kept between refreshes
  const known = new Set();         // keys seen on the last check
  let initialised = false;
  let settings = { ...DEFAULTS };
  let model = null;                // { geometry, texture }
  let anchors = [];
  let mode = { live: true, year: null };
  let requestId = 0;
  let vipNames = new Set();         // names on the admin's VIP Management list
  const glowMap = glowTexture();
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
    anchors = canopyAnchors(tree).anchors;
    refresh();
    window.setInterval(() => { if (mode.live) refresh(); }, POLL_MS);
  }).catch(error => console.warn('Feedback leaves could not be loaded; the tree shows without them.', error));

  onTree3dSettings(next => {
    const before = JSON.stringify(settings.tree2d);
    const sizeBefore = [settings.leafScale, settings.vipLeafScale].join('|');
    settings = { ...DEFAULTS, ...next, tree2d: { ...DEFAULTS.tree2d, ...(next.tree2d || {}) } };
    group.visible = settings.showFeedbackLeaves !== false;
    for (const leaf of leaves.values()) tintLeaf(leaf);
    if (!model) return;
    if ([settings.leafScale, settings.vipLeafScale].join('|') !== sizeBefore) {
      // A new leaf size: space the leaves out again for it, so bigger leaves do not overlap.
      for (const leaf of leaves.values()) removeLeaf(leaf);
      leaves.clear();
      placed.clear();
      stageFreeAt = 0;
      refresh();
    } else if (JSON.stringify(settings.tree2d) !== before) refresh(); // the 2D leaf count changed
  });

  document.addEventListener('esg-tree-year', event => {
    const { year, live } = event.detail || {};
    mode = { live: live !== false, year: live === false ? year : null };
    initialised = !mode.live; // a reviewed year shows its leaves at once, without flights
    known.clear();
    stageFreeAt = 0;
    for (const leaf of leaves.values()) removeLeaf(leaf);
    leaves.clear();
    refresh();
  });

  // ---------- data ----------

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
      visitors = Array.isArray(data) ? data : [];
      const vipData = vipResponse?.ok ? await vipResponse.json() : null;
      if (Array.isArray(vipData?.vipNames)) vipNames = new Set(vipData.vipNames.map(normaliseName));
    } catch (error) {
      console.warn('Feedback leaves: could not check for new feedback.', error);
      return;
    }
    if (id !== requestId) return; // a newer check (or a year change) took over
    showVisitors(visitors);
  }

  // VIP Management signals a changed VIP list (same browser): check at once, as the 2D tree does.
  window.addEventListener('tree-vip-refresh', () => refresh());
  window.addEventListener('storage', event => { if (event.key === 'tree-vip-refresh') refresh(); });

  // As the 2D tree: VIP when /api/tree marks the visitor, or the name is on the VIP list.
  const isVipVisitor = visitor => visitor?.isVip === true || vipNames.has(normaliseName(visitor?.name));

  function showVisitors(list) {
    const visitors = sortOldestFirst(list);
    const keys = visitors.map((visitor, index) => leafKey(visitor, index));
    // The same leaves as the 2D tree: none on a bare trunk (stage 0), every leaf of a reviewed year,
    // otherwise the newest "Maximum Visible Leaves".
    const bare = settings.tree2d.treeStage <= 0;
    const max = mode.live ? Math.max(1, Number(settings.tree2d.leafFallThreshold) || 15) : keys.length;
    const visible = new Set(bare ? [] : keys.slice(-max));
    const all = new Set(bare ? [] : keys);

    // Which leaves fly in: on opening the most recent few, later every leaf not seen before.
    const landing = new Set();
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

    // Leaves pushed off the tree by newer ones fall; leaves whose feedback was removed fade away.
    for (const [key, leaf] of leaves) {
      if (visible.has(key) || leaf.state === 'falling') continue;
      if (all.has(key)) startFall(leaf);
      else { removeLeaf(leaf); leaves.delete(key); }
    }

    let order = 0;
    visitors.forEach((visitor, index) => {
      const key = keys[index];
      if (!visible.has(key)) return;
      const existing = leaves.get(key);
      if (existing) {
        existing.visitor = visitor;
        const isVip = isVipVisitor(visitor);
        if (isVip !== existing.isVip) {
          // Made VIP (or no longer VIP): it now stays fixed (or turns with the view) from where it is shown.
          const shown = shownSpot(existing, existing.shown);
          existing.spot = { ...existing.spot, position: shown.position.clone(), quaternion: shown.quaternion.clone(), outward: shown.outward.clone() };
          placed.set(key, existing.spot);
        }
        existing.isVip = isVip;
        tintLeaf(existing);
        if ((visitor?.name || '') !== existing.nameLabel.userData.name) { // a name changed (e.g. made public)
          existing.nameLabel.material.map.dispose();
          shapeNameLabel(existing.nameLabel, visitor?.name || '');
        }
        return;
      }
      const leaf = createLeaf(key, visitor);
      if (!leaf) return;
      if (landing.has(key)) startFlight(leaf, order++);
      leaves.set(key, leaf);
    });
  }

  // ---------- leaves ----------

  function spotFor(key) {
    if (placed.has(key)) return placed.get(key);
    const random = seededRandom(`${key}|spot`);
    const size = BASE_SIZE * Math.max(1, settings.leafScale, settings.vipLeafScale);
    const toCamera = new T.Vector3();
    // Prefer spots facing the viewer, so the leaves are seen; any spot if too few face this way. Among
    // those, prefer spots on screen and clear of the title box.
    const facing = anchors.filter(anchor => anchor.outward.dot(toCamera.subVectors(camera.position, anchor.position).normalize()) > 0.2);
    const seen = facing.filter(anchor => seenOnScreen(anchor.position, size));
    const pool = seen.length > 40 ? seen : facing.length > 40 ? facing : anchors;
    if (!pool.length) return null;
    const taken = [...leaves.values()].filter(leaf => leaf.state !== 'falling').map(leaf => shownSpot(leaf, leaf.shown).position);
    // How far apart two spots look to the viewer: their distance across the view, leaving out depth.
    const viewDirection = camera.getWorldDirection(new T.Vector3());
    const offset = new T.Vector3();
    const apartOnScreen = (a, b) => {
      offset.subVectors(a, b);
      return offset.addScaledVector(viewDirection, -offset.dot(viewDirection)).length();
    };
    let best = null, bestGap = -Infinity;
    for (let attempt = 0; attempt < 120; attempt++) {
      const anchor = pool[Math.floor(random() * pool.length)];
      const gap = taken.reduce((nearest, position) => Math.min(nearest, apartOnScreen(position, anchor.position)), Infinity);
      if (gap > bestGap) { best = anchor; bestGap = gap; }
      if (gap >= size * 1.25) break; // no overlap with any other leaf, as the viewer sees them
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
      local: tree.worldToLocal(best.position.clone()), // for the same wind sway as the tree's leaves
      phase: random() * Math.PI * 2,
      prefersLeft: random() > 0.5, // its side when left and right leaves are mixed
    };
    placed.set(key, spot);
    return spot;
  }

  // ---------- staying put on the tree ----------

  // Where a leaf is shown: exactly its spot on the tree, at its own angle. Every leaf stays there when the
  // view is turned round the tree; it does not turn or move with the view (a leaf round the back of the
  // tree fades away, facingAmount).
  function shownSpot(leaf, out) {
    out.position.copy(leaf.spot.position);
    out.quaternion.copy(leaf.spot.quaternion);
    out.outward.copy(leaf.spot.outward);
    return out;
  }

  // Whether a leaf of this size at this point is fully on screen and not under the title box.
  const onScreen = new T.Vector3();
  function seenOnScreen(position, size) {
    camera.updateMatrixWorld();
    onScreen.copy(position).project(camera);
    if (onScreen.z > 1) return false;
    const width = renderer.domElement.clientWidth || window.innerWidth;
    const height = renderer.domElement.clientHeight || window.innerHeight;
    const depth = position.distanceTo(camera.position);
    const halfPx = (size / 2) / (2 * depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) * height;
    const x = (onScreen.x + 1) / 2 * width, y = (1 - onScreen.y) / 2 * height;
    if (x < halfPx || x > width - halfPx || y < halfPx || y > height - halfPx) return false;
    const title = document.querySelector('.masthead');
    const box = title?.getBoundingClientRect();
    if (!box || !box.width || getComputedStyle(title).visibility === 'hidden') return true;
    const canvasBox = renderer.domElement.getBoundingClientRect();
    const left = box.left - canvasBox.left, top = box.top - canvasBox.top;
    return x + halfPx < left || x - halfPx > left + box.width || y + halfPx < top || y - halfPx > top + box.height;
  }

  function createLeaf(key, visitor) {
    const spot = spotFor(key);
    if (!spot) return null;
    // Drawn on top of the tree's foliage (no depth test), so the canopy never covers a feedback leaf.
    const material = new T.MeshBasicMaterial({
      map: model.texture, alphaTest: 0.02, side: T.DoubleSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    // The veins: relief from the leaf's normal map and its strengthened vein lines (VEIN_FRAGMENT).
    material.onBeforeCompile = shader => {
      shader.uniforms.veinNormal = { value: model.normalMap };
      shader.fragmentShader = 'uniform sampler2D veinNormal;\n'
        + shader.fragmentShader.replace('#include <map_fragment>', VEIN_FRAGMENT);
    };
    material.customProgramCacheKey = () => 'feedback-leaf-veins';
    const mesh = new T.Mesh(model.geometry, material);
    mesh.name = `Feedback leaf ${key}`;
    mesh.renderOrder = 2;
    group.add(mesh);
    // The visitor's name, lying on the leaf along its midrib and inside the blade.
    const nameMesh = new T.Mesh(NAME_PLANE, new T.MeshBasicMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, toneMapped: false,
    }));
    nameMesh.rotation.x = -Math.PI / 2; // flat on the leaf: text along the midrib (x), facing out (+y)
    nameMesh.renderOrder = 3;
    shapeNameLabel(nameMesh, visitor?.name || '');
    mesh.add(nameMesh);
    const halo = new T.Sprite(new T.SpriteMaterial({
      map: glowMap, color: NEON, blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0,
    }));
    halo.visible = false;
    group.add(halo);
    const isVip = isVipVisitor(visitor);
    const leaf = { key, visitor, isVip, spot, mesh, material, nameLabel: nameMesh, halo, state: 'resting', scale: currentScale({ isVip }), colour: new T.Color() };
    leaf.shown = { position: new T.Vector3(), quaternion: new T.Quaternion(), outward: new T.Vector3() };
    shownSpot(leaf, leaf.shown);
    tintLeaf(leaf, true);
    placeAtRest(leaf, 0);
    return leaf;
  }

  function removeLeaf(leaf) {
    group.remove(leaf.mesh, leaf.halo);
    leaf.material.dispose();
    leaf.nameLabel.material.map.dispose();
    leaf.nameLabel.material.dispose();
    leaf.halo.material.dispose();
  }

  // ---------- the name on the leaf (as the 2D tree) ----------

  function shapeNameLabel(nameMesh, name) {
    const label = nameLabel(name || 'Anonymous visitor');
    nameMesh.material.map = label.texture;
    nameMesh.material.needsUpdate = true;
    nameMesh.userData = { name, width: label.width, height: label.height };
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
    return (BASE_SIZE / MODEL_SIZE) * (scale || 1);
  }

  // New leaves in the new colour, older ones in the older colour (2D: New / Old leaf pictures).
  function tintLeaf(leaf, immediate = false) {
    const created = timeOf(leaf.visitor?.created_at);
    const newForMs = (Number(settings.leafNewHours) || 0) * 3600 * 1000;
    const isNew = created !== null && Date.now() - created <= newForMs;
    const colour = leaf.isVip ? settings.vipLeafColor : (isNew ? settings.leafNewColor : settings.leafOldColor);
    leaf.targetColour = displayColour(colour);
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

  // A new leaf appears at the bottom middle of the screen at twice its size and stays there for
  // SHOWCASE_MS (12 seconds), drifting gently in place with its name level, so the visitor can find it and
  // read it. Then it floats up to its spot like a falling leaf in reverse: it swings gently from side to
  // side with a steady rhythm, rocking like a cradle (the end on the outside of each swing lifts, as a
  // pendulum's), while it rises, shrinks and turns from level to the angle it will rest at. The swings die
  // away as it arrives, and it settles exactly where it then rests, swaying with the tree. It shows and
  // floats at the depth of its spot, so it moves across the screen as the 2D leaf does, and it stays at the
  // bottom middle of the screen even if the view is turned meanwhile. Several new leaves take turns there:
  // each appears once the one before has started floating up and cleared the spot.
  let stageFreeAt = 0; // when the bottom middle is next free for a new leaf

  function startFlight(leaf, order) {
    const random = seededRandom(`${leaf.key}|flight`);
    const appearAt = Math.max(now() + order * 250, stageFreeAt);
    stageFreeAt = appearAt + SHOWCASE_MS + STAGE_CLEAR_MS;
    // Level means its midrib across the screen, pointing right or left, whichever is nearer its resting angle.
    camera.updateMatrixWorld();
    const midrib = new T.Vector3(1, 0, 0).applyQuaternion(leaf.shown.quaternion);
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    leaf.flight = {
      appearAt,
      levelSign: midrib.dot(right) >= 0 ? 1 : -1,
      duration: FLOAT_MS + random() * 1200,
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

  function placeFlight(leaf, time, elapsed) {
    const f = leaf.flight;
    // Where it would rest right now, swaying with the tree, so the float ends exactly there.
    placeAtRest(leaf, elapsed);
    restPosition.copy(leaf.mesh.position);
    restPose.copy(leaf.mesh.quaternion);

    // The view as it is now: the bottom middle of the screen at the depth of the leaf's spot, with the
    // twice-size leaf fully on screen.
    camera.updateMatrixWorld();
    camera.getWorldDirection(viewForward);
    viewRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    viewUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const depth = Math.max(1, start.subVectors(restPosition, camera.position).dot(viewForward));
    const halfHeight = depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const startHalf = leaf.scale * MODEL_SIZE; // half of twice its size
    const startY = Math.min(-0.35, -1 + startHalf / halfHeight + 0.05);
    start.copy(camera.position).addScaledVector(viewForward, depth).addScaledVector(viewUp, startY * halfHeight);
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
    if (since < SHOWCASE_MS) {
      // At the bottom middle: fading in as it rises a little into place, then drifting gently, name level.
      // The drift calms to nothing before it floats up, so the float starts from exactly here.
      const shown = Math.max(0, since);
      const appear = smoothstep(0, APPEAR_MS, shown);
      const idle = smoothstep(0, 1200, shown) * (1 - smoothstep(SHOWCASE_MS - 1200, SHOWCASE_MS, shown));
      const seconds = shown / 1000;
      leaf.mesh.position.copy(start)
        .addScaledVector(viewUp, startHalf * (0.07 * Math.sin(seconds * 1.9 + f.drift) * idle - 0.25 * (1 - appear)))
        .addScaledVector(viewRight, startHalf * 0.05 * Math.sin(seconds * 1.1 + f.drift * 2) * idle);
      axisX.copy(level).applyAxisAngle(viewForward, 0.07 * Math.sin(seconds * 1.5 + f.drift) * idle);
      leaf.mesh.quaternion.copy(facingPose(axisX, 0.16 * Math.sin(seconds * 2.3 + f.drift) * idle));
      leaf.mesh.scale.setScalar(leaf.scale * 2 * (0.88 + 0.12 * appear));
      leaf.mesh.scale.x *= sideSign(leaf);
      leaf.material.opacity = since < 0 ? 0 : appear; // waiting its turn: not shown yet
      return;
    }

    const t = Math.min(1, (since - SHOWCASE_MS) / f.duration);
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

    // Twice its size at the start, shrinking smoothly to its size on the tree.
    leaf.mesh.scale.setScalar(leaf.scale * (1 + (1 - s) ** 1.4));
    leaf.mesh.scale.x *= sideSign(leaf);
    leaf.material.opacity = T.MathUtils.lerp(1, facingAmount(leaf), smoothstep(0.8, 1, s));
    if (t >= 1) {
      leaf.state = 'resting';
      leaf.restingSince = time;
      leaf.flight = null;
    }
  }

  // ---------- resting (swaying with the tree) ----------

  const sway = new T.Quaternion();
  const swayEuler = new T.Euler();
  function placeAtRest(leaf, elapsed) {
    const { local, phase } = leaf.spot;
    const { position, quaternion } = leaf.shown; // its spot as shown now (turned with the view)
    const gust = clock.gust.value;
    // The same breeze as the tree's own leaves (matte-tree.js), so the leaf stays on its twig.
    const reach = smoothstep(2, 13, local.y);
    const breeze = Math.sin(elapsed * 1.7 + local.x * 0.84 + local.z * 0.62);
    leaf.mesh.position.set(
      position.x + reach * breeze * (0.024 + 0.05 * gust),
      position.y + reach * 0.012 * Math.sin(elapsed * 5.2 + local.x * 2.2),
      position.z,
    );
    const flutter = (0.035 + 0.12 * gust) * Math.sin(elapsed * 2.3 + phase);
    sway.setFromEuler(swayEuler.set(flutter, 0, flutter * 0.6));
    leaf.mesh.quaternion.copy(quaternion).multiply(sway);
    leaf.mesh.scale.setScalar(leaf.scale);
    leaf.mesh.scale.x *= sideSign(leaf);
  }

  // ---------- falling (as the 2D leaf fall) ----------

  function startFall(leaf) {
    const random = seededRandom(`${leaf.key}|fall`);
    leaf.fall = {
      began: now(),
      from: leaf.mesh.position.clone(),
      fromQuaternion: leaf.mesh.quaternion.clone(),
      ground: tree.position.y + 0.15,
      drift: new T.Vector3((random() - 0.5) * 3, 0, (random() - 0.5) * 3 + 1.2),
      axis: new T.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
      spin: (1.2 + random() * 1.6) * Math.PI,
      sway: 0.6 + random() * 0.6,
    };
    leaf.state = 'falling';
    leaf.halo.visible = false;
  }

  function placeFall(leaf, time) {
    const f = leaf.fall;
    const t = Math.min(1, (time - f.began) / FALL_MS);
    const drop = t ** 1.6;
    leaf.mesh.position.set(
      f.from.x + f.drift.x * t + Math.sin(t * Math.PI * 3) * f.sway * (1 - t),
      T.MathUtils.lerp(f.from.y, f.ground, drop),
      f.from.z + f.drift.z * t,
    );
    leaf.mesh.quaternion.copy(f.fromQuaternion).multiply(new T.Quaternion().setFromAxisAngle(f.axis, f.spin * t));
    leaf.material.opacity = 1 - smoothstep(0.7, 1, t);
    return t >= 1;
  }

  // ---------- every frame ----------

  // A resting leaf shows while its spot is on the viewer's side of the canopy; a VIP leaf that the view
  // leaves round the back of the tree fades away instead of showing through it.
  const towardsCamera = new T.Vector3();
  function facingAmount(leaf) {
    towardsCamera.subVectors(camera.position, leaf.shown.position).normalize();
    return smoothstep(-0.2, 0.15, leaf.shown.outward.dot(towardsCamera));
  }

  // Nearer leaves are drawn over farther ones: glow, leaf, then its name, leaf by leaf. A leaf floating in
  // is drawn over all the resting ones.
  function orderByDistance() {
    const ordered = [...leaves.values()].sort((a, b) =>
      (a.state === 'landing') - (b.state === 'landing')
      || b.mesh.position.distanceToSquared(camera.position) - a.mesh.position.distanceToSquared(camera.position));
    ordered.forEach((leaf, i) => {
      const base = 10 + i * 4;
      leaf.halo.renderOrder = base;
      leaf.nameLabel.renderOrder = base + 3;
      leaf.mesh.renderOrder = base + 2;
    });
  }

  const haloSize = new T.Vector3();
  function update(dt, elapsed) {
    if (!group.visible) return;
    const time = now();
    for (const [key, leaf] of leaves) {
      if (leaf.state !== 'falling') shownSpot(leaf, leaf.shown);
      leaf.scale += (currentScale(leaf) - leaf.scale) * Math.min(1, dt * 4); // size changes ease in
      leaf.colour.lerp(leaf.targetColour, Math.min(1, dt * 3));       // colour changes too
      if (leaf.state === 'landing') placeFlight(leaf, time, elapsed);
      else if (leaf.state === 'falling') {
        if (placeFall(leaf, time)) { removeLeaf(leaf); leaves.delete(key); continue; }
      } else {
        leaf.restingSince ??= time;
        placeAtRest(leaf, elapsed);
        leaf.material.opacity = facingAmount(leaf);
      }

      // A new visitor's green glow comes first (as on the 2D tree); otherwise a VIP leaf pulses gold.
      const glow = leaf.state === 'resting' ? glowAmount(leaf, time) : 0;
      const gold = glow <= 0.01 && leaf.isVip && settings.vipGlow !== false && leaf.state !== 'falling'
        ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((time / 2000) * Math.PI * 2)) // 2D vipGoldPulse, 2 s
        : 0;
      leaf.material.color.copy(leaf.colour).lerp(NEON, glow * 0.35).multiplyScalar(1 + gold * 0.18);
      placeName(leaf);
      leaf.halo.visible = glow > 0.01 || gold > 0;
      if (leaf.halo.visible) {
        leaf.halo.material.color.copy(glow > 0.01 ? NEON : GOLD_GLOW);
        leaf.halo.position.copy(leaf.mesh.position);
        leaf.halo.scale.copy(haloSize.setScalar(leaf.scale * MODEL_SIZE * (gold ? 2.1 : 2.4)));
        leaf.halo.material.opacity = (glow > 0.01 ? glow * 0.75 : gold * 0.7) * leaf.material.opacity;
      }
    }
    orderByDistance();
  }

  return { update };
}
