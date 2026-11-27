// The tree's growth stage on the 3D ESG Tree, as on the 2D tree: 0 (bare trunk) to 4 (full canopy). It is
// the same setting as the 2D tree's (treeParameters.treeStage, set in the admin's Tree Growth Stage, by
// hand or from the leaf count), so both trees always show the same stage. Each stage is its own Ketapang
// model in /assets/Tree/3dTreeLeaves (Ketapang_Stage_0.glb to Ketapang_Stage_4.glb); stage 4 is the full
// tree the scene was built around. scene.js loads the stage's model; when the stage changes (in Auto as the
// leaves come in, or saved in the admin) it loads the new stage's model in the background (loadStageTree)
// and the tree grows into it in place, without reloading the page, within about 5 seconds. In Auto the tree
// also grows a little with every leaf between the stages (tree-growth.js).
import { THREE as T, GLTFLoader, MeshoptDecoder } from './vendor/three-runtime.js';
import { isGrown } from './tree-growth.js';
import { shapeCanopy } from './canopy-shape.js';

export const FULL_STAGE = 4;
export const STAGE_NAMES = ['Bare Trunk', 'Early Growth', 'Young Canopy', 'Mature Canopy', 'Full Canopy'];

// Stages 0 to 3 were exported much smaller than the full stage 4 tree. At this scale they grow towards
// it: stage 3's canopy is as wide as stage 4's, and the tree is taller at every stage (about 8.6, 9.3,
// 10.2 and 10.4 metres, then 13.3 at stage 4).
const YOUNG_STAGE_SCALE = 6.2;

export const normaliseStage = value => Math.max(0, Math.min(FULL_STAGE, Math.round(Number(value) || 0)));
export const stageModelUrl = stage => `/assets/Tree/3dTreeLeaves/Ketapang_Stage_${normaliseStage(stage)}.glb`;

// How far the tree has grown through its stage (0 to 1) in the admin's Auto growth stage, as the server
// reports it (backend/features/parameters/treeStage.js); null in Manual, where the stage's tree shows full.
export function growthProgress(treeParameters) {
  const progress = Number(treeParameters?.treeStageAuto?.progress);
  return treeParameters?.treeStageMode === 'auto' && treeParameters?.treeStageAuto && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : null;
}

// The stage to show: ?stage=0 to 4 in the page address fixes one (to try a stage out; with ?growth=0 to 1
// part grown); otherwise the saved stage, the same as the 2D tree's, and in Auto how far it has grown
// through it. If the settings cannot be read, the full tree.
export async function startingStage() {
  const address = new URLSearchParams(location.search);
  const fromAddress = address.get('stage');
  if (fromAddress !== null && /^[0-4]$/.test(fromAddress)) {
    const growth = address.get('growth');
    const progress = growth !== null && growth.trim() !== '' && Number.isFinite(Number(growth)) ? Number(growth) : null;
    return { stage: Number(fromAddress), fixed: true, growth: progress };
  }
  try {
    const response = await fetch('/api/parameters', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && data.success) {
      const tree = data.parameters?.treeParameters;
      return { stage: normaliseStage(tree?.treeStage), fixed: false, growth: growthProgress(tree) };
    }
  } catch (error) {
    console.warn('The tree growth stage could not be read; showing the full tree.', error);
  }
  return { stage: FULL_STAGE, fixed: false, growth: null };
}

// Loads another stage's model while the page runs (the tree growing into its next stage, scene.js), with its
// exported names and reflection layers, as loadEnvironment does for the first one (landscape.js).
let decodingInWorkers = false;
export async function loadStageTree(stage) {
  // Unpacks the model off the page's main thread, so the scene keeps moving while it loads.
  if (!decodingInWorkers) {
    try { MeshoptDecoder.useWorkers(2); } catch (error) { console.warn('The model is unpacked on the page instead.', error); }
    decodingInWorkers = true;
  }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const asset = await loader.loadAsync(stageModelUrl(stage));
  asset.scene.traverse(node => {
    if (node.userData.displayName) node.name = node.userData.displayName;
    if (node.userData.reflected) node.layers.enable(1);
  });
  return asset.scene;
}

// Takes a tree out of the scene and frees its geometry, materials and pictures (the stage before, once the
// tree has grown into the next).
export function removeTree(tree) {
  tree.removeFromParent();
  const textures = new Set();
  tree.traverse(object => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of [object.material].flat()) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach(texture => texture.dispose());
}

// Readies a stage's model for the scene. A young stage is scaled up to the scene's size in the geometry
// itself, so the wind in its leaves and the feedback leaves work in metres as on stage 4, and its own patch
// of soil is left out (the island has its own ground, as under the stage 4 tree). Every stage's trunk is
// then made round (roundTrunk) and its canopy shaped to look right from every side (canopy-shape.js).
// pause: awaited between the steps (scene.js passes the next frame while the scene runs, so the work is
// spread over frames and the scene keeps moving).
export async function prepareStageTree(tree, stage, pause = async () => {}) {
  if (stage < FULL_STAGE) {
    const scaled = new Set();
    const soil = [];
    tree.traverse(object => {
      if (object !== tree) object.position.multiplyScalar(YOUNG_STAGE_SCALE);
      if (!object.isMesh) return;
      const materials = [object.material].flat();
      if (/loam and sand/i.test(object.name) || materials.some(material => /soil/i.test(material?.name || ''))) {
        soil.push(object);
        return;
      }
      if (scaled.has(object.geometry)) return;
      scaled.add(object.geometry);
      object.geometry.scale(YOUNG_STAGE_SCALE, YOUNG_STAGE_SCALE, YOUNG_STAGE_SCALE);
    });
    soil.forEach(object => object.removeFromParent());
  }
  await pause();
  roundTrunk(tree);
  await shapeCanopy(tree, pause);
  return tree;
}

// The Ketapang models' trunks are oval: the stage 4 trunk is about 2 m thick seen from the side but only
// about 1.3 m seen from the front or back (the view's front looks along the z axis, tree-view.js), and the
// young stages' trunks a little so. roundTrunk makes the trunk as thick from the front and back as from the
// side, so it looks the same from every side as the view turns round it. It measures the trunk in bands up
// its height (measureTrunk), then widens the trunk's thinner side to its thicker side's width. The whole
// tree is reshaped together (wood and leaves), so every branch stays joined to the trunk; the widening
// fades out by TRUNK_REACH trunk radii from the trunk's middle, so the branches and the canopy keep their
// shape. Only the trunk is widened: from above the buttress roots (TRUNK_FROM to TRUNK_FULL of the tree's
// height, the roots stay as modelled) to where the trunk ends in the crown (TRUNK_FADE to TRUNK_TO).
const TRUNK_FROM = 0.06, TRUNK_FULL = 0.12, TRUNK_FADE = 0.62, TRUNK_TO = 0.78;
const TRUNK_REACH = 2.6;
const TRUNK_BANDS = 22;
const MAX_WIDENING = 1.7; // at most this many times as thick, so the reshaping never folds the wood over
const smoothStep = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];

// The trunk's middle and its half-widths across (x, from the front) and front to back (z, from the side),
// in bands up its height, from the wood's points (the bark, or all the wood if no material is named bark).
// The points of a branch leaving the trunk are left out of each band, as are bands too thin to measure.
function measureTrunk(points, top) {
  const bands = [];
  const low = TRUNK_FROM * top, high = TRUNK_TO * top, step = (high - low) / TRUNK_BANDS;
  for (let band = 0; band <= TRUNK_BANDS; band++) {
    const y = low + band * step;
    const xs = [], zs = [];
    for (let i = 0; i < points.length; i += 3) {
      if (Math.abs(points[i + 1] - y) <= step) { xs.push(points[i]); zs.push(points[i + 2]); }
    }
    if (xs.length < 16) continue;
    const middleX = median(xs), middleZ = median(zs);
    const radii = xs.map((x, i) => Math.hypot(x - middleX, zs[i] - middleZ));
    const reach = median(radii) * 1.8;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, kept = 0;
    xs.forEach((x, i) => {
      if (radii[i] > reach) return;
      kept++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
    });
    if (kept < 12 || maxX - minX < 1e-3 || maxZ - minZ < 1e-3) continue;
    bands.push({ y, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, across: (maxX - minX) / 2, deep: (maxZ - minZ) / 2 });
  }
  // Each band evened out with its neighbours, so the trunk's new outline runs smoothly up it.
  return bands.map((band, i) => {
    const near = bands.slice(Math.max(0, i - 1), i + 2);
    const mean = key => near.reduce((sum, each) => sum + each[key], 0) / near.length;
    return { y: band.y, x: mean('x'), z: mean('z'), across: median(near.map(each => each.across)), deep: median(near.map(each => each.deep)) };
  });
}

function trunkAt(bands, y) {
  if (y <= bands[0].y) return bands[0];
  for (let i = 1; i < bands.length; i++) {
    if (y > bands[i].y) continue;
    const below = bands[i - 1], above = bands[i], t = (y - below.y) / (above.y - below.y);
    const mix = key => below[key] + (above[key] - below[key]) * t;
    return { x: mix('x'), z: mix('z'), across: mix('across'), deep: mix('deep') };
  }
  return bands[bands.length - 1];
}

export function roundTrunk(tree) {
  tree.updateMatrixWorld(true);
  const toTree = new T.Matrix4().copy(tree.matrixWorld).invert();
  const meshes = [];
  tree.traverse(object => { if (object.isMesh && object.geometry?.attributes.position) meshes.push(object); });
  const isWood = mesh => [mesh.material].flat().every(material => !(material?.alphaTest > 0));
  const wood = meshes.filter(isWood);
  const bark = wood.filter(mesh => [mesh.material].flat().some(material => /bark/i.test(material?.name || '')));
  const point = new T.Vector3();
  const points = [];
  let top = -Infinity;
  for (const mesh of bark.length ? bark : wood) {
    const toTreeFromMesh = new T.Matrix4().multiplyMatrices(toTree, mesh.matrixWorld);
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(toTreeFromMesh);
      points.push(point.x, point.y, point.z);
      top = Math.max(top, point.y);
    }
  }
  if (!points.length || !(top > 0)) return tree;
  const bands = measureTrunk(points, top);
  if (bands.length < 3) return tree;

  // The space the trunk's widening reaches, to pass over the rest of the tree (most of its leaves) quickly.
  const low = TRUNK_FROM * top, high = TRUNK_TO * top;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const band of bands) {
    const reach = TRUNK_REACH * Math.max(band.across, band.deep);
    minX = Math.min(minX, band.x - reach); maxX = Math.max(maxX, band.x + reach);
    minZ = Math.min(minZ, band.z - reach); maxZ = Math.max(maxZ, band.z + reach);
  }

  const reshaped = new Set();
  const normal = new T.Vector3();
  for (const mesh of meshes) {
    if (reshaped.has(mesh.geometry)) continue;
    reshaped.add(mesh.geometry);
    const toTreeFromMesh = new T.Matrix4().multiplyMatrices(toTree, mesh.matrixWorld);
    const e = toTreeFromMesh.elements;
    const toMesh = toTreeFromMesh.clone().invert();
    const normalToTree = new T.Matrix3().getNormalMatrix(toTreeFromMesh);
    const normalToMesh = new T.Matrix3().getNormalMatrix(toMesh);
    const geometry = mesh.geometry;
    let position = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    let changed = false;
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
      const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
      if (y <= low || y >= high) continue;
      const x = e[0] * px + e[4] * py + e[8] * pz + e[12];
      if (x <= minX || x >= maxX) continue;
      const z = e[2] * px + e[6] * py + e[10] * pz + e[14];
      if (z <= minZ || z >= maxZ) continue;
      point.set(x, y, z);
      const height = smoothStep(TRUNK_FROM * top, TRUNK_FULL * top, point.y) * (1 - smoothStep(TRUNK_FADE * top, TRUNK_TO * top, point.y));
      if (height <= 0) continue;
      const trunk = trunkAt(bands, point.y);
      const fromX = point.x - trunk.x, fromZ = point.z - trunk.z;
      const out = Math.hypot(fromX / trunk.across, fromZ / trunk.deep); // 1 at the trunk's surface
      if (out >= TRUNK_REACH) continue;
      const share = height * (1 - smoothStep(1, TRUNK_REACH, out));
      const widenX = 1 + (Math.min(MAX_WIDENING, Math.max(1, trunk.deep / trunk.across)) - 1) * share;
      const widenZ = 1 + (Math.min(MAX_WIDENING, Math.max(1, trunk.across / trunk.deep)) - 1) * share;
      if (widenX === 1 && widenZ === 1) continue;
      if (!(position.array instanceof Float32Array) || position.isInterleavedBufferAttribute) {
        // a packed (quantised) model: unpacked into plain numbers before its shape is changed
        const unpacked = new Float32Array(position.count * 3);
        for (let j = 0; j < position.count; j++) {
          unpacked[j * 3] = position.getX(j); unpacked[j * 3 + 1] = position.getY(j); unpacked[j * 3 + 2] = position.getZ(j);
        }
        position = new T.BufferAttribute(unpacked, 3);
        geometry.setAttribute('position', position);
      }
      point.set(trunk.x + fromX * widenX, point.y, trunk.z + fromZ * widenZ).applyMatrix4(toMesh);
      position.setXYZ(i, point.x, point.y, point.z);
      if (normals) { // the surface turned to match its new shape
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalToTree);
        normal.set(normal.x / widenX, normal.y, normal.z / widenZ).applyMatrix3(normalToMesh).normalize();
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      changed = true;
    }
    if (!changed) continue;
    position.needsUpdate = true;
    if (normals) normals.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return tree;
}

// Points sampled from the tree's wood (bark and branches) or its leaves (those it is growing to,
// tree-growth.js), in the tree's own coordinates (relative to the soil, as the birds' perches) or in the
// world (as the falling leaves' routes).
function treePoints(tree, leaves, inWorld, wanted = 20000) {
  tree.updateMatrixWorld(true);
  const toTree = new T.Matrix4().copy(tree.matrixWorld).invert();
  const shown = tree.userData.foliageTarget ?? tree.userData.foliageShown ?? 1;
  const points = [];
  tree.traverse(object => {
    if (!object.isMesh) return;
    const isLeaves = [object.material].flat().some(material => material?.alphaTest > 0);
    if (isLeaves !== leaves) return;
    const position = object.geometry.attributes.position;
    const normal = object.geometry.attributes.normal;
    const matrix = inWorld ? object.matrixWorld : new T.Matrix4().multiplyMatrices(toTree, object.matrixWorld);
    const step = Math.max(1, Math.floor(position.count / wanted));
    for (let i = 0; i < position.count; i += step) {
      if (leaves && !isGrown(object.geometry, i, shown)) continue;
      if (!leaves && normal && normal.getY(i) < 0.6) continue; // the top of a branch, where a bird can sit
      points.push(new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
    }
  });
  return points;
}

function nearest(points, target, accept = () => true) {
  let best = null, bestDistance = Infinity;
  for (const point of points) {
    if (!accept(point)) continue;
    const distance = point.distanceToSquared(target);
    if (distance < bestDistance) { best = point; bestDistance = distance; }
  }
  return best;
}

// The birds' perches on this stage's branches: each of stage 4's perches moved to the nearest top of a
// branch of this tree, above head height and below the crown (tree coordinates, as createBirds takes them).
export function perchSeats(tree, seats, stage) {
  if (stage >= FULL_STAGE) return seats;
  const wood = treePoints(tree, false, false);
  if (!wood.length) return seats;
  const top = Math.max(...wood.map(point => point.y));
  const target = new T.Vector3();
  return seats.map(([x, y, z]) => {
    const seat = nearest(wood, target.set(x, y, z), point => point.y > 2.5 && point.y < top * 0.92);
    return seat ? [seat.x, seat.y, seat.z] : [x, y, z];
  });
}

// The wind's falling leaves from this stage's canopy: each route (leaf-drifts.json, made for stage 4)
// starts at the nearest leaf of this tree instead. A bare trunk (stage 0) has no leaves to drop.
export function canopyDriftRoutes(tree, routes, stage) {
  if (stage >= FULL_STAGE) return routes;
  if (stage <= 0) return [];
  const leaves = treePoints(tree, true, true, 12000);
  if (!leaves.length) return [];
  const target = new T.Vector3();
  return routes.map(route => {
    const start = nearest(leaves, target.set(...route.start));
    return start ? { ...route, start: [start.x, start.y, start.z] } : route;
  });
}
