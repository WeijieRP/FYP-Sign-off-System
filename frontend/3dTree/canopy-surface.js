// The outside of the 3D tree's canopy, measured from the tree's own foliage, so the visitors' leaves keep to
// it (feedback-leaves.js). The canopy is not an oval: it is wide and patchy, narrower towards its top, and its
// two long ends do not reach as high as its middle. So for each direction round the trunk (TURNS of them) and
// each height (every LAYER metres), how far out the foliage reaches there, and in each direction how high and
// how low the canopy goes. A leaf then sits a little inside that (at least `inset` metres in from the outside,
// the top and the bottom), so all of it has the tree's leaves behind it from wherever it is seen, also while it
// glides round with the turning tree and when it is moved aside from another leaf.
// Measured in the tree's own terms, round the upright through the point the view turns round, so it keeps to
// the tree as the tree grows in size (tree-growth.js).
import { THREE as T } from './vendor/three-runtime.js';

const TURNS = 48;     // directions round the trunk, 7.5 degrees apart
const LAYER = 0.5;    // heights, this many of the tree's own metres apart
const OUTER = 0.85;   // the canopy's outside in a direction and height: this share of its foliage there is nearer the trunk
const ENOUGH = 3;     // foliage points a direction and height needs to count as canopy (a stray twig does not)
const FULL_TURN = Math.PI * 2;

const fromTree = new T.Matrix4();
const point = new T.Vector3();
const axisNow = new T.Vector3();

// points: the foliage (world positions, as feedback-leaves.js samples it); around: the point the view turns
// round (world). Null when there is too little foliage to measure (a bare trunk).
export function measureSurface(tree, points, around) {
  if (!points.length) return null;
  tree.updateMatrixWorld(true);
  const toTree = tree.matrixWorld.clone().invert();
  const axis = around.clone().applyMatrix4(toTree);
  const local = points.map(p => p.clone().applyMatrix4(toTree));
  let low = Infinity, high = -Infinity;
  for (const p of local) { low = Math.min(low, p.y); high = Math.max(high, p.y); }
  const layers = Math.max(1, Math.round((high - low) / LAYER) + 1);
  const cells = Array.from({ length: TURNS * layers }, () => []);
  for (const p of local) {
    const turn = wrap(Math.round(Math.atan2(p.x - axis.x, p.z - axis.z) / FULL_TURN * TURNS));
    const layer = Math.min(layers - 1, Math.max(0, Math.round((p.y - low) / LAYER)));
    cells[turn * layers + layer].push(Math.hypot(p.x - axis.x, p.z - axis.z));
  }
  // How far out the foliage reaches in each direction and height (NaN: no canopy there).
  const measured = new Float32Array(TURNS * layers).fill(NaN);
  cells.forEach((reaches, i) => {
    if (reaches.length < ENOUGH) return;
    reaches.sort((a, b) => a - b);
    measured[i] = reaches[Math.min(reaches.length - 1, Math.floor(reaches.length * OUTER))];
  });
  // Smoothed a little with the directions and heights beside it, so a leaf gliding round moves smoothly.
  const reach = new Float32Array(TURNS * layers).fill(NaN);
  for (let t = 0; t < TURNS; t++) for (let h = 0; h < layers; h++) {
    const own = measured[t * layers + h];
    if (Number.isNaN(own)) continue;
    let sum = own * 2, weight = 2;
    for (const [dt, dh] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (h + dh < 0 || h + dh >= layers) continue;
      const near = measured[wrap(t + dt) * layers + h + dh];
      if (!Number.isNaN(near)) { sum += near; weight++; }
    }
    reach[t * layers + h] = sum / weight;
  }
  // In each direction: the canopy's top and bottom, and every height between them given a reach (a gap
  // between two heights filled from them; above and below, the nearest).
  const top = new Float32Array(TURNS).fill(NaN), bottom = new Float32Array(TURNS).fill(NaN);
  let directions = 0;
  for (let t = 0; t < TURNS; t++) {
    const column = reach.subarray(t * layers, (t + 1) * layers);
    const valid = [];
    column.forEach((value, h) => { if (!Number.isNaN(value)) valid.push(h); });
    if (!valid.length) continue;
    directions++;
    bottom[t] = valid[0]; top[t] = valid[valid.length - 1];
    for (let h = 0; h < layers; h++) {
      if (!Number.isNaN(column[h])) continue;
      const below = valid.filter(v => v < h).pop(), above = valid.find(v => v > h);
      if (below === undefined) column[h] = column[above];
      else if (above === undefined) column[h] = column[below];
      else column[h] = column[below] + (column[above] - column[below]) * (h - below) / (above - below);
    }
  }
  if (directions < TURNS / 4) return null; // too little foliage to tell its shape
  // A direction with no canopy at all takes its nearest neighbours' (round the trunk).
  for (let t = 0; t < TURNS; t++) {
    if (!Number.isNaN(top[t])) continue;
    for (let k = 1; k < TURNS; k++) {
      const from = [wrap(t - k), wrap(t + k)].find(n => !Number.isNaN(top[n]));
      if (from === undefined) continue;
      top[t] = top[from]; bottom[t] = bottom[from];
      reach.copyWithin(t * layers, from * layers, (from + 1) * layers);
      break;
    }
  }
  return { tree, axis, low, layers, reach, top, bottom };
}

function wrap(turn) {
  return ((turn % TURNS) + TURNS) % TURNS;
}

// The direction (in the tree's own terms, as a turn number with its fraction) and height, from the world.
function inTree(surface, angle, y) {
  const { tree, axis } = surface;
  fromTree.copy(tree.matrixWorld).invert();
  axisNow.copy(axis).applyMatrix4(tree.matrixWorld);
  point.set(axisNow.x + Math.sin(angle), y, axisNow.z + Math.cos(angle)).applyMatrix4(fromTree);
  const turn = Math.atan2(point.x - axis.x, point.z - axis.z) / FULL_TURN * TURNS;
  return { turn: ((turn % TURNS) + TURNS) % TURNS, y: point.y, scale: tree.matrixWorld.getMaxScaleOnAxis() || 1 };
}

// Blended between the two nearest directions.
function acrossTurns(values, turn, read) {
  const t0 = Math.floor(turn) % TURNS, t1 = (t0 + 1) % TURNS, k = turn - Math.floor(turn);
  return read(values, t0) * (1 - k) + read(values, t1) * k;
}

function reachInTree(surface, turn, y) {
  const { reach, layers, low } = surface;
  const layer = Math.min(layers - 1, Math.max(0, (y - low) / LAYER));
  const h0 = Math.floor(layer), h1 = Math.min(layers - 1, h0 + 1), k = layer - h0;
  return acrossTurns(reach, turn, (values, t) => values[t * layers + h0] * (1 - k) + values[t * layers + h1] * k);
}

// How far out from the upright the canopy reaches (world metres) towards `angle` (world, as atan2(x, z)
// round the upright) at height y (world).
export function canopyReachAt(surface, angle, y) {
  const at = inTree(surface, angle, y);
  return reachInTree(surface, at.turn, at.y) * at.scale;
}

// Where a leaf keeps to the canopy (world, into `out`): towards `angle` round the upright, at about height y,
// `depth` of the way out to the canopy's outside (1 on it), and at least `inset` metres in from its outside,
// its top and its bottom there.
export function onSurface(surface, angle, y, depth, inset, out) {
  const at = inTree(surface, angle, y);
  const { low } = surface;
  const insetInTree = inset / at.scale;
  const top = low + acrossTurns(surface.top, at.turn, (values, t) => values[t]) * LAYER + LAYER / 2;
  const bottom = low + acrossTurns(surface.bottom, at.turn, (values, t) => values[t]) * LAYER - LAYER / 2;
  const height = bottom + insetInTree <= top - insetInTree
    ? Math.min(top - insetInTree, Math.max(bottom + insetInTree, at.y))
    : (top + bottom) / 2;
  const reach = reachInTree(surface, at.turn, height);
  const across = Math.max(0.25 * reach, Math.min(Math.max(0, depth) * reach, reach - insetInTree));
  const direction = at.turn / TURNS * FULL_TURN;
  const { axis, tree } = surface;
  return out.set(axis.x + Math.sin(direction) * across, height, axis.z + Math.cos(direction) * across)
    .applyMatrix4(tree.matrixWorld);
}

// A point moved onto the canopy as onSurface keeps a leaf (no further out than it is, nor than `inset` in
// from the outside, top and bottom): into `out`.
export function keepOnSurface(surface, position, inset, out = position) {
  axisNow.copy(surface.axis).applyMatrix4(surface.tree.matrixWorld);
  const angle = Math.atan2(position.x - axisNow.x, position.z - axisNow.z);
  const reach = Math.hypot(position.x - axisNow.x, position.z - axisNow.z);
  const depth = reach / Math.max(1e-3, canopyReachAt(surface, angle, position.y));
  return onSurface(surface, angle, position.y, depth, inset, out);
}
