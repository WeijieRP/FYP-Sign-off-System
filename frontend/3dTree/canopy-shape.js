// The 3D tree's canopy shaped so it looks right from every side as the view turns round the tree
// (tree-stage.js prepareStageTree runs it on every stage's model as it loads). In the Ketapang models the
// leaves crowd at the branch tips at the canopy's two ends (its left and right seen from the front), so
// seen from the side, looking across those ends, the tree is a wall of leaves with no branches to see; and
// the canopy's front and back (its outline seen from the side, where the visitors' feedback leaves sit)
// have about a third as many leaves for their size, so a feedback leaf there seems to float beside the
// tree. So:
//   - thinned: some of the leaves in the middle of the canopy from front to back (THIN_MIDDLE: what the view
//     looks straight through from the side, out to the canopy's ends) and inside it (THIN_INSIDE), so the
//     trunk and branches show through from the side; the outside of the crown's top keeps all its leaves,
//     so its outline stays full;
//   - trimmed: the canopy's underside, the leaves hanging lowest (below TRIM_FROM of its half height under
//     its middle, all but a few by TRIM_TO), and higher under the canopy's two long ends (TRIM_ENDS_FROM to
//     TRIM_ENDS_TO: seen from the side, the nearer end is closest to the viewer, so it shows lowest), so from
//     the side the crown ends tidily above the trunk's lower part instead of hanging down towards the ground;
//   - filled: the outside of the canopy's front and back gets more leaves (up to FILL_SIDES copies of each
//     leaf there, each moved a little across and out from the canopy and turned its own way), so the
//     canopy is full round its outline from the side, both its sides, fuller from the front, and the
//     feedback leaves sit among leaves.
// Every leaf (a sprig, one connected piece of the foliage: tree-growth.js sprigsOf) is kept, dropped or
// copied whole, chosen by a fixed pattern, so the tree looks the same every time it loads.
import { THREE as T } from './vendor/three-runtime.js';
import { sprigsOf } from './tree-growth.js';

const THIN_MIDDLE = 0.55;       // the share of leaves dropped in the canopy's middle from front to back
const THIN_INSIDE = 0.5;        // the share dropped deep inside the canopy (less towards its outside)
const TRIM_FROM = -0.35;        // the underside trimmed from this far below the canopy's middle (of its half height)
const TRIM_TO = -0.65;          // to this far, where TRIM_BOTTOM of the leaves are gone
const TRIM_BOTTOM = 0.9; 
const TRIM_ENDS_FROM = -0.1; // the canopy's two long ends (seen from the side, the nearest part of the canopy, so it shows lowest)
const TRIM_ENDS_TO = -0.4;  // have their undersides trimmed higher: from this far below the middle to this far       // the share of the lowest leaves dropped
const FILL_SIDES = 2.2;         // copies of each leaf on the outside of the canopy's front and back
const FILL_ACROSS = [0.25, 0.8]; // how far across the canopy's surface a copy moves, in metres
const FILL_OUT = 0.4;           // and how far out from it at most

const smoothStep = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
// A fixed random number from 0 to 1 for each leaf and purpose.
function chance(n) {
  const x = Math.sin(n * 91.7 + 47.3) * 24634.6345;
  return x - Math.floor(x);
}

const isFoliage = object => object.isMesh && [object.material].flat().some(material => material?.alphaTest > 0);
const point = new T.Vector3();

// pause: awaited between the foliage's meshes, so the work is spread over frames (tree-stage.js).
export async function shapeCanopy(tree, pause = async () => {}) {
  tree.updateMatrixWorld(true);
  const toTree = new T.Matrix4().copy(tree.matrixWorld).invert();
  const meshes = [];
  const seen = new Set();
  tree.traverse(object => {
    if (!isFoliage(object) || !object.geometry?.attributes.position) return;
    if (seen.has(object.geometry)) object.geometry = object.geometry.clone(); // its own leaves to shape
    seen.add(object.geometry);
    meshes.push(object);
  });
  if (!meshes.length) return tree;

  // Every leaf's middle, in the tree (to place it in the canopy).
  const box = new T.Box3();
  const parts = [];
  for (const mesh of meshes) {
    await pause();
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const { sprig, sprigs } = sprigsOf(geometry);
    const sums = new Float64Array(sprigs * 4);
    for (let i = 0; i < position.count; i++) {
      const s = sprig[i] * 4;
      sums[s] += position.getX(i); sums[s + 1] += position.getY(i); sums[s + 2] += position.getZ(i); sums[s + 3]++;
    }
    const toTreeFromMesh = new T.Matrix4().multiplyMatrices(toTree, mesh.matrixWorld);
    const middles = new Float32Array(sprigs * 3);
    for (let s = 0; s < sprigs; s++) {
      const n = sums[s * 4 + 3] || 1;
      point.set(sums[s * 4] / n, sums[s * 4 + 1] / n, sums[s * 4 + 2] / n).applyMatrix4(toTreeFromMesh);
      point.toArray(middles, s * 3);
      box.expandByPoint(point);
    }
    parts.push({ mesh, sprig, sprigs, middles, toTreeFromMesh });
  }
  const centre = box.getCenter(new T.Vector3());
  const reach = box.getSize(new T.Vector3()).multiplyScalar(0.5).max(new T.Vector3(0.1, 0.1, 0.1));

  // Which leaves stay, and the copies made (each a turn and move of a leaf, in the tree).
  const outward = new T.Vector3(), across = new T.Vector3(), around = new T.Vector3(), shift = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  const turn = new T.Quaternion(), tilt = new T.Quaternion();
  let leafNumber = 0;
  for (const part of parts) {
    part.keep = new Uint8Array(part.sprigs);
    part.copies = [];
    for (let s = 0; s < part.sprigs; s++, leafNumber++) {
      const x = (part.middles[s * 3] - centre.x) / reach.x;
      const y = (part.middles[s * 3 + 1] - centre.y) / reach.y;
      const z = (part.middles[s * 3 + 2] - centre.z) / reach.z;
      const out = Math.hypot(x, y, z);                       // 0 the canopy's middle, 1 its outside
      const inMiddle = 1 - smoothStep(0.3, 0.65, Math.abs(z));  // 1 in its middle from front to back
      const crown = smoothStep(0.45, 0.75, y) * smoothStep(0.75, 0.9, out); // the outside of the crown's top
      const thinned = 1 - (1 - THIN_MIDDLE * inMiddle) * (1 - THIN_INSIDE * (1 - smoothStep(0.55, 0.8, out)));
      const ends = smoothStep(0.5, 0.8, Math.abs(x)); // 1 at the canopy's two long ends (left and right from the front)
      const trimmed = TRIM_BOTTOM * Math.max(smoothStep(TRIM_FROM, TRIM_TO, y), ends * smoothStep(TRIM_ENDS_FROM, TRIM_ENDS_TO, y)); // the low-hanging underside
      part.keep[s] = chance(leafNumber * 3 + 1) >= Math.max(thinned * (1 - crown), trimmed) ? 1 : 0;

      const wanted = FILL_SIDES * smoothStep(0.35, 0.7, Math.abs(z)) * smoothStep(0.58, 0.82, out) * (1 - smoothStep(-0.3, -0.5, y));
      const copies = Math.floor(wanted) + (chance(leafNumber * 3 + 2) < wanted % 1 ? 1 : 0);
      if (!copies) continue;
      const middle = new T.Vector3().fromArray(part.middles, s * 3);
      outward.set(x / reach.x, y / reach.y, z / reach.z).normalize();
      across.crossVectors(outward, up);
      if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
      across.normalize();
      around.crossVectors(outward, across).normalize();
      for (let c = 0; c < copies; c++) {
        const seed = leafNumber * 17 + c * 5;
        const angle = chance(seed) * Math.PI * 2;
        const distance = FILL_ACROSS[0] + (FILL_ACROSS[1] - FILL_ACROSS[0]) * chance(seed + 1);
        shift.copy(across).multiplyScalar(Math.cos(angle) * distance)
          .addScaledVector(around, Math.sin(angle) * distance)
          .addScaledVector(outward, chance(seed + 2) * FILL_OUT);
        turn.setFromAxisAngle(up, chance(seed + 3) * Math.PI * 2);
        tilt.setFromAxisAngle(across, (chance(seed + 4) - 0.5) * 0.7);
        // In the tree: turned round the leaf's middle, then moved; then as the mesh's own numbers.
        const inTree = new T.Matrix4().makeTranslation(middle.x + shift.x, middle.y + shift.y, middle.z + shift.z)
          .multiply(new T.Matrix4().makeRotationFromQuaternion(turn.clone().multiply(tilt)))
          .multiply(new T.Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z));
        const inMesh = part.toTreeFromMesh.clone().invert().multiply(inTree).multiply(part.toTreeFromMesh);
        part.copies.push({ sprig: s, matrix: inMesh, normalMatrix: new T.Matrix3().getNormalMatrix(inMesh) });
      }
    }
  }

  for (const part of parts) {
    await pause();
    rebuildFoliage(part);
  }
  return tree;
}

// The mesh's foliage again with only the leaves kept, and the copies added after them.
function rebuildFoliage({ mesh, sprig, sprigs, keep, copies }) {
  const geometry = mesh.geometry;
  const count = geometry.attributes.position.count;
  const index = geometry.index?.array ?? null;
  const corners = index ? index.length : count;

  // The new vertices: the kept leaves' (in their order), then the copies'.
  const newOf = new Int32Array(count).fill(-1);
  let total = 0, cornerTotal = 0;
  for (let i = 0; i < count; i++) if (keep[sprig[i]]) newOf[i] = total++;
  for (let t = 0; t < corners; t += 3) if (keep[sprig[index ? index[t] : t]]) cornerTotal += 3;
  if (total === count && !copies.length) return;

  // The vertices and the triangles of each leaf that is copied, and each vertex's place in its leaf.
  const copied = new Uint8Array(sprigs);
  copies.forEach(copy => { copied[copy.sprig] = 1; });
  const vertexStart = new Int32Array(sprigs + 1);
  for (let i = 0; i < count; i++) if (copied[sprig[i]]) vertexStart[sprig[i] + 1]++;
  for (let s = 0; s < sprigs; s++) vertexStart[s + 1] += vertexStart[s];
  const vertices = new Int32Array(vertexStart[sprigs]);
  const placeInLeaf = new Int32Array(count);
  const filledVertices = vertexStart.slice(0, sprigs);
  for (let i = 0; i < count; i++) {
    const s = sprig[i];
    if (!copied[s]) continue;
    placeInLeaf[i] = filledVertices[s] - vertexStart[s];
    vertices[filledVertices[s]++] = i;
  }
  const triangleStart = new Int32Array(sprigs + 1);
  for (let t = 0; t < corners; t += 3) { const s = sprig[index ? index[t] : t]; if (copied[s]) triangleStart[s + 1]++; }
  for (let s = 0; s < sprigs; s++) triangleStart[s + 1] += triangleStart[s];
  const triangles = new Int32Array(triangleStart[sprigs]);
  const filledTriangles = triangleStart.slice(0, sprigs);
  for (let t = 0; t < corners; t += 3) { const s = sprig[index ? index[t] : t]; if (copied[s]) triangles[filledTriangles[s]++] = t; }
  const copyStart = [];
  for (const copy of copies) {
    copyStart.push(total);
    total += vertexStart[copy.sprig + 1] - vertexStart[copy.sprig];
    cornerTotal += (triangleStart[copy.sprig + 1] - triangleStart[copy.sprig]) * 3;
  }

  // Every attribute, in arrays of its own kind (packed ones stay packed), its numbers copied as they are.
  const attributes = {};
  const copiers = Object.entries(geometry.attributes).map(([name, attribute]) => {
    const size = attribute.itemSize;
    const target = new T.BufferAttribute(new attribute.array.constructor(total * size), size, attribute.normalized);
    attributes[name] = target;
    const source = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : size;
    const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
    const into = target.array;
    for (let i = 0; i < count; i++) { // the kept leaves'
      const to = newOf[i];
      if (to < 0) continue;
      for (let c = 0; c < size; c++) into[to * size + c] = source[i * stride + offset + c];
    }
    return (from, to) => {
      for (let c = 0; c < size; c++) into[to * size + c] = source[from * stride + offset + c];
    };
  });
  const direction = new T.Vector3();
  copies.forEach((copy, k) => {
    const { matrix, normalMatrix } = copy;
    for (let v = vertexStart[copy.sprig], to = copyStart[k]; v < vertexStart[copy.sprig + 1]; v++, to++) {
      const from = vertices[v];
      for (const copyOne of copiers) copyOne(from, to);
      point.fromBufferAttribute(attributes.position, to).applyMatrix4(matrix);
      attributes.position.setXYZ(to, point.x, point.y, point.z);
      if (attributes.normal) {
        direction.fromBufferAttribute(attributes.normal, to).applyMatrix3(normalMatrix).normalize();
        attributes.normal.setXYZ(to, direction.x, direction.y, direction.z);
      }
      if (attributes.tangent) {
        direction.set(attributes.tangent.getX(to), attributes.tangent.getY(to), attributes.tangent.getZ(to)).transformDirection(matrix);
        attributes.tangent.setXYZ(to, direction.x, direction.y, direction.z);
      }
    }
  });

  // The triangles: each kept leaf's with its new vertices, then each copy's.
  const newIndex = total > 65535 ? new Uint32Array(cornerTotal) : new Uint16Array(cornerTotal);
  let at = 0;
  for (let t = 0; t < corners; t += 3) {
    const a = index ? index[t] : t;
    if (!keep[sprig[a]]) continue;
    newIndex[at++] = newOf[a]; newIndex[at++] = newOf[index ? index[t + 1] : t + 1]; newIndex[at++] = newOf[index ? index[t + 2] : t + 2];
  }
  copies.forEach((copy, k) => {
    const start = copyStart[k];
    for (let n = triangleStart[copy.sprig]; n < triangleStart[copy.sprig + 1]; n++) {
      const t = triangles[n];
      for (let c = 0; c < 3; c++) newIndex[at++] = start + placeInLeaf[index ? index[t + c] : t + c];
    }
  });

  const shaped = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(attributes)) shaped.setAttribute(name, attribute);
  shaped.setIndex(new T.BufferAttribute(newIndex, 1));
  shaped.computeBoundingBox();
  shaped.computeBoundingSphere();
  shaped.name = geometry.name;
  shaped.userData = { ...geometry.userData };
  geometry.dispose();
  mesh.geometry = shaped;
}
