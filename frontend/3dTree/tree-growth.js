// The 3D tree growing a little with every leaf. In the admin's Auto growth stage the server reports how far
// the tree has grown from this stage's leaf number towards the next (treeStageAuto.progress, 0 to 1;
// backend/features/parameters/treeStage.js). The tree's own foliage follows it, and nothing it has grown is
// ever taken away (none of its leaves, and none of the visitors' feedback leaves):
//   - with every new leaf more foliage grows in, slowly (over GROW_SECONDS), at the edge of the canopy so
//     far: the canopy spreads out from its middle with a ragged edge, as a real growing tree, each new sprig
//     unfolding from nothing. New growth is a fresh lime green (as young leaves) at the leaf's own
//     brightness, a little lighter, so it never glows at night, fading to the canopy's own colour over
//     FRESH_SECONDS, so every leaf's growth shows, however small;
//   - at the next stage's number the tree grows into that stage's bigger tree in place, without reloading
//     the page (scene.js loads the new model in the background while the tree is shown). The new tree takes
//     its place at the size the tree was and with as much foliage as it had (the share of its sprigs the
//     stage before had at its fullest), then grows: up to its own full size, and with a growth spurt
//     (STAGE_SPURT of the rest of its canopy growing in, fresh green), over GROW_IN_SECONDS. From there it
//     grows on with every leaf until its canopy is full at the next stage;
//   - at stage 4's number (the admin's "Stage 4 (Full Canopy) min leaves") the tree is fully grown (on
//     reaching stage 4 its last sprigs grow in) and stays so.
// In Manual, or with ?stage= in the page address, the stage's tree shows full, as before; ?stage=2&growth=0.5
// shows stage 2 half grown, and ?stage=3&growFrom=2 shows stage 3 just reached, with its growth spurt (to try
// them out). The feedback leaves (feedback-leaves.js) and the leaves the wind drops (tree-stage.js) only use
// the foliage that has grown in (isGrown).
import { THREE as T } from './vendor/three-runtime.js';

const GROW_SECONDS = 9;        // how long the tree takes to grow in each new leaf's share of foliage
const GROW_IN_SECONDS = 12;    // how long a new stage's growth (size and spurt) takes
const PREVIEW_DELAY = 1.5;     // ?growFrom=: seconds the tree shows before it grows
const STAGE_SPURT = 0.3;       // on reaching a stage, this share of the rest of its canopy grows in at once
const FRESH_SECONDS = 20;      // new growth fades from fresh green to the canopy's colour over this long
const FRESH_REACH = 0.05;      // the youngest foliage this share deep shows fresh too (one leaf grows little)
const UNFOLD = 0.03;           // the share of the foliage unfolding at once, at the growing edge
const RAGGED = 0.2;            // how ragged the growing edge is (0: a smooth oval)
// The leaf sprigs in each stage's model (counted from Ketapang_Stage_0 to 4.glb): a new stage shows the share
// of its foliage the stage before had at its fullest (stage 2 about 38%, stage 3 75%), so none is lost.
const STAGE_SPRIGS = [0, 10134, 26577, 35570, 40253];
const FIRST_SPRIGS = 0.04;     // stage 1 starts with a few sprigs

const clampStage = stage => Math.max(0, Math.min(4, Math.round(Number(stage) || 0)));

// The share of this stage's foliage the tree had at the end of the stage before.
function carriedShare(stage) {
  const s = clampStage(stage);
  return s <= 1 ? FIRST_SPRIGS : Math.min(1, STAGE_SPRIGS[s - 1] / STAGE_SPRIGS[s]);
}

// The share of a stage's foliage shown at this progress through the stage (null: the full tree, as Manual):
// what it carried over plus its growth spurt at 0, growing on to all of it just before the next stage.
export function foliageShare(stage, progress) {
  const value = Number(progress);
  if (progress === null || progress === undefined || !Number.isFinite(value)) return 1;
  if (clampStage(stage) >= 4) return 1;
  const carried = carriedShare(stage);
  const start = carried + (1 - carried) * STAGE_SPURT;
  return start + (1 - start) * Math.max(0, Math.min(1, value));
}

// The height and width of each stage's tree in the scene, in metres (measured from Ketapang_Stage_0 to 4.glb
// as tree-stage.js sizes them), for ?growFrom=.
const STAGE_SIZES = [[8.43, 9.37], [9.11, 12.23], [9.95, 21.67], [10.39, 23.37], [13.23, 23.49]];

// ?growFrom= with ?stage= in the page address (to try it): growTree's options for the stage shown having just
// grown from that one, as it does in place when the leaves reach it; otherwise none.
export function previewGrowth(stage) {
  const fromAddress = new URLSearchParams(location.search).get('growFrom');
  if (fromAddress === null || !/^[0-4]$/.test(fromAddress) || Number(fromAddress) >= stage) return {};
  const [[h0, w0], [h1, w1]] = [STAGE_SIZES[Number(fromAddress)], STAGE_SIZES[clampStage(stage)]];
  return { justReached: true, startScale: Math.max(0.55, Math.sqrt((h0 / h1) * (w0 / w1))), delay: PREVIEW_DELAY };
}

// How big the new stage's tree starts, so it takes the old tree's place at the old tree's size (in height
// and width) and then grows to its own: below 1 for a bigger tree.
export function matchingScale(oldTree, newTree) {
  const before = new T.Box3().setFromObject(oldTree);
  const after = new T.Box3().setFromObject(newTree);
  if (before.isEmpty() || after.isEmpty()) return 1;
  const base = newTree.position.y;
  const height = (before.max.y - base) / Math.max(0.1, after.max.y - base);
  const width = (before.max.x - before.min.x) / Math.max(0.1, after.max.x - after.min.x);
  const scale = Math.sqrt(Math.max(0.01, height) * Math.max(0.01, width));
  return Math.max(0.55, Math.min(1.6, scale));
}

// Whether this vertex of the tree's foliage has fully grown in, with this share of the foliage shown.
export function isGrown(geometry, index, shown = 1) {
  const order = geometry.attributes.growOrder;
  return !order || order.getX(index) <= shown * (1 + UNFOLD) - UNFOLD;
}

const isFoliage = object => object.isMesh && [object.material].flat().some(material => material?.alphaTest > 0);

// The sprigs of a mesh: each connected piece of its triangles (one sprig of leaves), as a sprig number
// for every vertex (also used to shape the canopy, canopy-shape.js).
export function sprigsOf(geometry) {
  const count = geometry.attributes.position.count;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const index = geometry.index?.array;
  const corners = index ? index.length : count;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = find(index ? index[t] : t);
    const b = find(index ? index[t + 1] : t + 1);
    parent[b] = a;
    const c = find(index ? index[t + 2] : t + 2);
    parent[c] = a;
  }
  const sprigOfRoot = new Int32Array(count).fill(-1);
  const sprig = new Int32Array(count);
  let sprigs = 0;
  for (let i = 0; i < count; i++) {
    const root = find(i);
    if (sprigOfRoot[root] < 0) sprigOfRoot[root] = sprigs++;
    sprig[i] = sprigOfRoot[root];
  }
  return { sprig, sprigs };
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Gives every sprig of the foliage its place in the growing order (growOrder, 0 first to 1 last): from the
// middle of the canopy outwards, the canopy's own shape, with a ragged edge; and its centre (growCentre),
// where it unfolds from.
function orderFoliage(tree) {
  tree.updateMatrixWorld(true);
  const toTree = new T.Matrix4().copy(tree.matrixWorld).invert();
  const toTreeOf = object => new T.Matrix4().multiplyMatrices(toTree, object.matrixWorld);
  const point = new T.Vector3();

  // The trunk's middle at the ground, which the canopy grows out round.
  let trunkX = 0, trunkZ = 0, trunkPoints = 0;
  tree.traverse(object => {
    if (!object.isMesh || isFoliage(object)) return;
    const position = object.geometry.attributes.position;
    const matrix = toTreeOf(object);
    const step = Math.max(1, Math.floor(position.count / 20000));
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      if (point.y > 1.5) continue;
      trunkX += point.x; trunkZ += point.z; trunkPoints++;
    }
  });
  if (trunkPoints) { trunkX /= trunkPoints; trunkZ /= trunkPoints; }

  const meshes = [];
  const seen = new Set();
  tree.traverse(object => {
    if (!isFoliage(object)) return;
    if (seen.has(object.geometry)) object.geometry = object.geometry.clone(); // its own growing order
    seen.add(object.geometry);
    meshes.push(object);
  });

  // Every sprig's centre, in its mesh (to unfold from) and in the tree (for its place in the order).
  const all = [];
  const box = new T.Box3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const { sprig, sprigs } = sprigsOf(geometry);
    const sums = new Float64Array(sprigs * 4);
    for (let i = 0; i < position.count; i++) {
      const s = sprig[i] * 4;
      sums[s] += position.getX(i); sums[s + 1] += position.getY(i); sums[s + 2] += position.getZ(i); sums[s + 3]++;
    }
    const matrix = toTreeOf(mesh);
    const centres = new Float32Array(sprigs * 3);
    const inTree = [];
    for (let s = 0; s < sprigs; s++) {
      const n = sums[s * 4 + 3] || 1;
      centres[s * 3] = sums[s * 4] / n; centres[s * 3 + 1] = sums[s * 4 + 1] / n; centres[s * 3 + 2] = sums[s * 4 + 2] / n;
      point.set(centres[s * 3], centres[s * 3 + 1], centres[s * 3 + 2]).applyMatrix4(matrix);
      box.expandByPoint(point);
      inTree.push(point.clone());
    }
    const entry = { mesh, sprig, sprigs, centres, order: new Float32Array(sprigs) };
    inTree.forEach((at, s) => all.push({ entry, s, at }));
  }
  if (!all.length) return meshes;

  // How far out each sprig is, as a share of the canopy's reach that way (an oval of the canopy's shape).
  const reachX = Math.max(1e-3, trunkX - box.min.x, box.max.x - trunkX);
  const reachZ = Math.max(1e-3, trunkZ - box.min.z, box.max.z - trunkZ);
  const middleY = box.min.y + (box.max.y - box.min.y) * 0.45;
  const reachY = Math.max(1e-3, middleY - box.min.y, box.max.y - middleY);
  all.forEach((item, i) => {
    const { x, y, z } = item.at;
    item.score = Math.hypot((x - trunkX) / reachX, (y - middleY) / reachY, (z - trunkZ) / reachZ)
      + RAGGED * (hash(i + 0.5) - 0.5);
  });
  all.sort((a, b) => a.score - b.score);
  all.forEach((item, rank) => { item.entry.order[item.s] = (rank + 0.5) / all.length; });

  const entries = new Set(all.map(item => item.entry));
  for (const { mesh, sprig, centres, order } of entries) {
    const count = sprig.length;
    const growOrder = new Float32Array(count);
    const growCentre = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const s = sprig[i];
      growOrder[i] = order[s];
      growCentre[i * 3] = centres[s * 3]; growCentre[i * 3 + 1] = centres[s * 3 + 1]; growCentre[i * 3 + 2] = centres[s * 3 + 2];
    }
    mesh.geometry.setAttribute('growOrder', new T.BufferAttribute(growOrder, 1));
    mesh.geometry.setAttribute('growCentre', new T.BufferAttribute(growCentre, 3));
  }
  return meshes;
}

// The foliage's material: sprigs past the share shown are folded away to nothing, the ones at the growing
// edge part unfolded, and new growth (from freshFrom on, and the youngest foliage just before it) is a fresh
// light green while freshness lasts (on top of the leaves' wind, matte-tree.js; the glowing look adds its
// own colours, and the fresh green goes over them).
function growingMaterial(material, uniforms, done) {
  if (!material || done.has(material)) return;
  done.add(material);
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute float growOrder;\nattribute vec3 growCentre;\nuniform float foliageShown;\nvarying float vGrowOrder;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float unfold = clamp( ( foliageShown * ${(1 + UNFOLD).toFixed(3)} - growOrder ) / ${UNFOLD.toFixed(3)}, 0., 1. );
        transformed = growCentre + ( transformed - growCentre ) * unfold * unfold * ( 3. - 2. * unfold );
        vGrowOrder = growOrder;`);
    shader.fragmentShader = 'uniform float freshFrom, freshness;\nvarying float vGrowOrder;\n'
      + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        {
          float fresh = freshness * smoothstep( freshFrom - ${FRESH_REACH.toFixed(3)}, freshFrom, vGrowOrder );
          // Lime green at the leaf's own brightness (a little lighter), so it never glows in the dark.
          float light = dot( diffuseColor.rgb, vec3( .3, .59, .11 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( .98, 1.14, .3 ) * light * 1.35, fresh * .85 );
        }`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|growing-foliage`;
  material.needsUpdate = true;
}

const ease = k => k * k * (3 - 2 * k);

// Readies the tree to grow (after addMatteTree, before anything looks at its foliage) and shows it grown
// this far now. Options, for a tree that has just taken the place of the stage before (scene.js):
//   justReached - it shows the foliage the tree had, then has its growth spurt;
//   startScale  - it starts at this size (matchingScale) and grows to its own (or shrinks, a step down);
//   delay       - seconds before it starts growing.
// grow(progress) grows it on to a new progress through the stage (null: full) over GROW_SECONDS; update(dt)
// runs it and returns true when it has just finished growing (in size and foliage).
export function growTree(tree, stage, progress, { justReached = false, startScale = 1, delay = 0 } = {}) {
  const target = foliageShare(stage, progress);
  const start = justReached ? Math.min(target, carriedShare(stage)) : target;
  const uniforms = {
    foliageShown: { value: start },
    freshFrom: { value: start },   // new growth starts here in the growing order
    freshness: { value: 0 },       // how fresh green the new growth still is (1 to 0)
  };
  tree.userData.foliageShown = start;
  tree.userData.foliageTarget = target; // where the foliage is growing to (for the wind's falling leaves)
  tree.scale.setScalar(startScale);
  // Stage 4 is the fully grown tree: it shows full, so its foliage has nothing to grow (unless just reached).
  if (clampStage(stage) < 4 || justReached) {
    const done = new Set();
    orderFoliage(tree).forEach(mesh => [mesh.material].flat().forEach(material => growingMaterial(material, uniforms, done)));
  }

  const waiting = -delay / GROW_IN_SECONDS;  // below 0: waiting to start
  let from = start, to = target;
  let seconds = justReached ? GROW_IN_SECONDS : GROW_SECONDS;
  let t = justReached ? waiting : 1;         // the foliage's growth, 0 to 1
  let sized = startScale !== 1 ? waiting : 1; // the size's growth, 0 to 1
  let fade = justReached ? 1 : 0;
  return {
    grow(nextProgress) {
      const next = foliageShare(stage, nextProgress);
      if (Math.abs(next - to) < 1e-4) return;
      tree.userData.foliageTarget = next;
      const shown = uniforms.foliageShown.value;
      if (next > shown) {
        if (fade < 0.05) uniforms.freshFrom.value = shown; // still fresh: the new growth joins it
        fade = 1;
      }
      from = shown;
      to = next;
      seconds = GROW_SECONDS;
      t = Math.min(t, 0);
    },
    update(dt) {
      const busy = t < 1 || sized < 1;
      if (t < 1) {
        t = Math.min(1, t + dt / seconds);
        uniforms.foliageShown.value = from + (to - from) * ease(Math.max(0, t));
        tree.userData.foliageShown = uniforms.foliageShown.value;
      } else if (fade > 0) {
        fade = Math.max(0, fade - dt / FRESH_SECONDS);
      }
      if (sized < 1) {
        sized = Math.min(1, sized + dt / GROW_IN_SECONDS);
        tree.scale.setScalar(startScale + (1 - startScale) * ease(Math.max(0, sized)));
      }
      uniforms.freshness.value = t < 0 ? 0 : ease(fade);
      return busy && t >= 1 && sized >= 1;
    },
  };
}
