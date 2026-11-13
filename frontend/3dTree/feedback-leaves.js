// Feedback leaves on the 3D ESG Tree: one RainTree leaf (assets/Tree/3dTreeLeaves) per feedback of the
// year, with the same behaviour as the 2D tree's leaves (frontend/tree/tree.js):
//   - each leaf has its own spot on the outer canopy, chosen at random but kept between refreshes,
//     never overlapping another leaf, and its own random angle;
//   - left and right leaves, as the 2D tree's LeftLeaf / RightLeaf pictures: the RainTree leaf as it is
//     is a right leaf, mirrored it is a left leaf (mixed at random, or one side, from the admin);
//   - a new feedback's leaf flies in from the bottom middle of the screen in a smooth zigzag, starting
//     at twice its size and shrinking to its place on the tree;
//   - a new visitor's leaf glows green for the first minute;
//   - past the most leaves allowed on the tree, the oldest leaf falls;
//   - Year Review's "View Tree" shows that year's leaves, "Live" the current ones.
// Colours (light green new, dark green older), left or right leaves, size, how long a leaf counts as new
// and the most leaves come from the admin's 3D Leaf
// Adjustments (tree3d-settings.js). New feedback is checked every 5 seconds from /api/tree.

import { THREE as T, GLTFLoader } from './vendor/three-runtime.js';
import { onTree3dSettings } from './tree3d-settings.js';

const LEAF_MODEL = '/assets/Tree/3dTreeLeaves/RainTree_Leaf_Final12.glb';
const MODEL_SIZE = 0.1;          // the leaf model is 10 cm across
const BASE_SIZE = 1.15;          // metres across at scale 1, so a leaf reads from across the room
const POLL_MS = 5000;            // as the 2D tree's live refresh
const RECENT_LANDING_MS = 2 * 60 * 1000; // on opening, leaves this recent fly in (2D: recentLandingWindowMs)
const GLOW_MS = 60 * 1000;       // a new visitor's leaf glows for a minute (2D: leafGlowDurationMs)
const GLOW_FADE_MS = 900;
const FALL_MS = 4200;            // 2D: leafFallDuration
const TINT_BOOST = 2.3;          // the leaf picture is mid grey: this brings the chosen colour back to strength
const NEON = new T.Color(0x39ff14);

const DEFAULTS = { showFeedbackLeaves: true, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e', leafSide: 'both', leafNewHours: 24, leafScale: 1, maxLeaves: 15 };

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
  return [...visitors].sort((a, b) => (timeOf(a.created_at) ?? Infinity) - (timeOf(b.created_at) ?? Infinity));
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
    if (n.length() < 0.7 || n.y < -0.55) continue;
    const outward = new T.Vector3(n.x / radii.x, n.y / radii.y, n.z / radii.z).normalize();
    anchors.push({ position: p.clone().addScaledVector(outward, 0.3), outward });
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
  const glowMap = glowTexture();
  const now = () => performance.now();

  // ---------- leaf model ----------

  new GLTFLoader().loadAsync(LEAF_MODEL).then(gltf => {
    let mesh = null;
    gltf.scene.traverse(object => { if (!mesh && object.isMesh) mesh = object; });
    if (!mesh) throw new Error('The leaf model has no mesh');
    const texture = mesh.material.map;
    if (texture && renderer) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    model = { geometry: mesh.geometry, texture };
    anchors = canopyAnchors(tree).anchors;
    refresh();
    window.setInterval(() => { if (mode.live) refresh(); }, POLL_MS);
  }).catch(error => console.warn('Feedback leaves could not be loaded; the tree shows without them.', error));

  onTree3dSettings(next => {
    const changedMax = next.maxLeaves !== settings.maxLeaves;
    settings = { ...DEFAULTS, ...next };
    group.visible = settings.showFeedbackLeaves !== false;
    for (const leaf of leaves.values()) tintLeaf(leaf);
    if (changedMax && model) refresh();
  });

  document.addEventListener('esg-tree-year', event => {
    const { year, live } = event.detail || {};
    mode = { live: live !== false, year: live === false ? year : null };
    initialised = !mode.live; // a reviewed year shows its leaves at once, without flights
    known.clear();
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
      const response = await fetch(`/api/tree${query}`, { cache: 'no-store' });
      const data = await response.json();
      visitors = Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('Feedback leaves: could not check for new feedback.', error);
      return;
    }
    if (id !== requestId) return; // a newer check (or a year change) took over
    showVisitors(visitors);
  }

  function showVisitors(list) {
    const visitors = sortOldestFirst(list);
    const keys = visitors.map((visitor, index) => leafKey(visitor, index));
    const max = Math.max(1, Number(settings.maxLeaves) || 15);
    const visible = new Set(keys.slice(-max));
    const all = new Set(keys);

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
      if (existing) { existing.visitor = visitor; tintLeaf(existing); return; }
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
    const size = BASE_SIZE * Math.max(1, settings.leafScale);
    const toCamera = new T.Vector3();
    // Prefer spots facing the viewer, so the leaves are seen; any spot if too few face this way.
    const facing = anchors.filter(anchor => anchor.outward.dot(toCamera.subVectors(camera.position, anchor.position).normalize()) > 0.2);
    const pool = facing.length > 40 ? facing : anchors;
    if (!pool.length) return null;
    const taken = [...leaves.values()].filter(leaf => leaf.state !== 'falling').map(leaf => leaf.spot.position);
    let best = null, bestGap = -Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const anchor = pool[Math.floor(random() * pool.length)];
      const gap = taken.reduce((nearest, position) => Math.min(nearest, position.distanceTo(anchor.position)), Infinity);
      if (gap > bestGap) { best = anchor; bestGap = gap; }
      if (gap >= size * 1.15) break; // no overlap with any other leaf
    }
    // Its own angle: the leaf faces out of the canopy and towards the viewer, turned at random.
    const facingDir = best.outward.clone().lerp(toCamera.subVectors(camera.position, best.position).normalize(), 0.5).normalize();
    const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), random() * Math.PI * 2);
    const tilt = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), (random() - 0.5) * 0.5);
    const quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), facingDir).multiply(turn).multiply(tilt);
    const spot = {
      position: best.position.clone(),
      quaternion,
      local: tree.worldToLocal(best.position.clone()), // for the same wind sway as the tree's leaves
      phase: random() * Math.PI * 2,
      prefersLeft: random() > 0.5, // its side when left and right leaves are mixed
    };
    placed.set(key, spot);
    return spot;
  }

  function createLeaf(key, visitor) {
    const spot = spotFor(key);
    if (!spot) return null;
    const material = new T.MeshBasicMaterial({
      map: model.texture, alphaTest: 0.5, side: T.DoubleSide, transparent: true, toneMapped: false,
    });
    const mesh = new T.Mesh(model.geometry, material);
    mesh.name = `Feedback leaf ${key}`;
    mesh.renderOrder = 2;
    group.add(mesh);
    const halo = new T.Sprite(new T.SpriteMaterial({
      map: glowMap, color: NEON, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
    }));
    halo.visible = false;
    group.add(halo);
    const leaf = { key, visitor, spot, mesh, material, halo, state: 'resting', scale: currentScale(), colour: new T.Color() };
    tintLeaf(leaf, true);
    placeAtRest(leaf, 0);
    return leaf;
  }

  function removeLeaf(leaf) {
    group.remove(leaf.mesh, leaf.halo);
    leaf.material.dispose();
    leaf.halo.material.dispose();
  }

  // A left leaf is the leaf model mirrored (2D: LeftLeaf.png against RightLeaf.png).
  function sideSign(leaf) {
    if (settings.leafSide === 'left') return -1;
    if (settings.leafSide === 'right') return 1;
    return leaf.spot.prefersLeft ? -1 : 1;
  }

  function currentScale() {
    return (BASE_SIZE / MODEL_SIZE) * (Number(settings.leafScale) || 1);
  }

  // New leaves in the new colour, older ones in the older colour (2D: New / Old leaf pictures).
  function tintLeaf(leaf, immediate = false) {
    const created = timeOf(leaf.visitor?.created_at);
    const newForMs = (Number(settings.leafNewHours) || 0) * 3600 * 1000;
    const isNew = created !== null && Date.now() - created <= newForMs;
    leaf.targetColour = new T.Color(isNew ? settings.leafNewColor : settings.leafOldColor).multiplyScalar(TINT_BOOST);
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

  // ---------- flying in (as the 2D landing flight) ----------

  function startFlight(leaf, order) {
    const random = seededRandom(`${leaf.key}|flight`);
    const end = leaf.spot.position;
    const distance = camera.position.distanceTo(end) * 0.5;
    // From the bottom middle of the screen, about halfway between the viewer and the tree.
    const ray = new T.Vector3(0, -0.72, 0.5).unproject(camera).sub(camera.position).normalize();
    const start = camera.position.clone().addScaledVector(ray, distance);
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const viewWidth = 2 * distance * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    leaf.flight = {
      start, right,
      duration: 5600 + random() * 900,
      delay: Math.min(order * 70 + random() * 120, 640),
      began: now(),
      wind: random() > 0.5 ? 1 : -1,
      swings: 2.2 + random() * 1.3,
      amplitude: viewWidth * 0.16 * (0.75 + random() * 0.5),
      bank: 0.2 + random() * 0.2,
      yaw: 0.4 + random() * 0.45,
      startQuaternion: new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), ray.clone().negate())
        .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), random() * Math.PI * 2)),
    };
    leaf.state = 'landing';
  }

  function placeFlight(leaf, time) {
    const f = leaf.flight;
    const t = Math.min(1, Math.max(0, (time - f.began - f.delay) / f.duration));
    const s = flightEase(t);
    const envelope = (1 - s) ** 1.1;
    const weave = f.wind * f.amplitude * Math.sin(Math.PI * f.swings * s) * envelope;
    leaf.mesh.position.lerpVectors(f.start, leaf.spot.position, s).addScaledVector(f.right, weave);
    // Twice the size at the start, shrinking smoothly to its size on the tree.
    leaf.mesh.scale.setScalar(leaf.scale * (1 + (1 - smoothstep(0, 1, s))));
    leaf.mesh.scale.x *= sideSign(leaf);
    // Turning from facing the viewer to its own angle, leaning into each swing and calming down.
    const flutter = new T.Quaternion().setFromEuler(new T.Euler(
      f.bank * Math.cos(Math.PI * f.swings * s) * envelope,
      0,
      f.yaw * Math.sin(Math.PI * f.swings * s) * envelope,
    ));
    leaf.mesh.quaternion.slerpQuaternions(f.startQuaternion, leaf.spot.quaternion, smoothstep(0, 1, s)).multiply(flutter);
    leaf.material.opacity = smoothstep(0, 0.05, t);
    if (t >= 1) {
      leaf.state = 'resting';
      leaf.restingSince = time;
      leaf.flight = null;
      leaf.material.opacity = 1;
    }
  }

  // ---------- resting (swaying with the tree) ----------

  const sway = new T.Quaternion();
  const swayEuler = new T.Euler();
  function placeAtRest(leaf, elapsed) {
    const { local, position, quaternion, phase } = leaf.spot;
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

  const haloSize = new T.Vector3();
  function update(dt, elapsed) {
    if (!group.visible) return;
    const time = now();
    const targetScale = currentScale();
    for (const [key, leaf] of leaves) {
      leaf.scale += (targetScale - leaf.scale) * Math.min(1, dt * 4); // size changes ease in
      leaf.colour.lerp(leaf.targetColour, Math.min(1, dt * 3));       // colour changes too
      if (leaf.state === 'landing') placeFlight(leaf, time);
      else if (leaf.state === 'falling') {
        if (placeFall(leaf, time)) { removeLeaf(leaf); leaves.delete(key); continue; }
      } else {
        leaf.restingSince ??= time;
        placeAtRest(leaf, elapsed);
      }

      const glow = leaf.state === 'resting' ? glowAmount(leaf, time) : 0;
      leaf.material.color.copy(leaf.colour).lerp(NEON, glow * 0.35);
      leaf.halo.visible = glow > 0.01;
      if (leaf.halo.visible) {
        leaf.halo.position.copy(leaf.mesh.position);
        leaf.halo.scale.copy(haloSize.setScalar(leaf.scale * MODEL_SIZE * 2.4));
        leaf.halo.material.opacity = glow * 0.75;
      }
    }
  }

  return { update };
}
