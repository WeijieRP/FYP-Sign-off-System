// Owner: Role 2, Wei Jie.
// Pictures of the 3D tree for the 2D tree's Natural and Digital styles (checklist item 12).
// The 3D page opened with ?capture2d=1 (and ?stage=0 to 4, ?look=natural or glow, ?growth=1) shows the tree
// still, from the standard front view, in clear weather (scene.js). captureTreePicture() then draws one frame
// at CAPTURE_WIDTH x CAPTURE_HEIGHT and returns:
//   - scene:  the frame as a JPEG (the tree in its river valley; the glowing look with its bloom), the 2D tree's
//             picture for that stage and style;
//   - canopy: a PNG the same size, opaque where the tree's own foliage is seen and clear elsewhere, which the 2D
//             tree uses to place the visitors' leaves on the canopy (as stage4leaves.png for the painted tree);
//   - meta:   the size, the canopy's box and the foot of the trunk, in the picture's pixels.
// The canopy is found by drawing the same still frame twice, with and without the tree's foliage (the meshes
// whose material cuts out leaf shapes, alphaTest > 0, as tree-stage.js tells foliage from wood): where the two
// differ, foliage is seen. Small gaps between the leaves are then closed, and anything below the foot of the
// trunk (the canopy's reflection in the river) is left out.
import { THREE as T } from './vendor/three-runtime.js';

// A wide panorama (32:9, about the ESG Centre wall's 7:2): its middle 16:9 is framed as the 3D tree's standard
// picture, and the sides show more of the valley, so the 2D tree fills a wide screen without cutting the tree
// (frontend/tree/tree.js layoutTreePictures shows the middle on a 16:9 screen).
export const CAPTURE_WIDTH = 3840;
export const CAPTURE_HEIGHT = 1080;
export const CAPTURE_FRAMING_ASPECT = 16 / 9; // the tree is framed as for a 16:9 picture, then the view widened
export const CAPTURE_ZOOM = 0.8;  // of the standard view: the full-grown tree with room round it (tree-view.js)
const DIFFERENCE = 18;       // how much a pixel must change (sum of red, green, blue, 0 to 765) to count as foliage
const CLOSE_GAPS_PX = 6;     // gaps between leaves up to about twice this wide are filled
const KEEP_FROM = 0.42;      // after the gaps are closed (blurred), how much cover a pixel needs to stay canopy

const isFoliage = object => object.isMesh && [object.material].flat().some(material => material?.alphaTest > 0);

function readPixels(canvas, width, height) {
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d', { willReadFrequently: true });
  context.drawImage(canvas, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

// The canopy mask from the two frames: foliage where they differ, gaps closed, nothing below `floorY`.
function canopyMask(withFoliage, withoutFoliage, width, height, floorY) {
  const raw = document.createElement('canvas');
  raw.width = width;
  raw.height = height;
  const rawContext = raw.getContext('2d', { willReadFrequently: true });
  const rawImage = rawContext.createImageData(width, height);
  for (let i = 0, p = 0; i < withFoliage.length; i += 4, p++) {
    const y = Math.floor(p / width);
    const change = Math.abs(withFoliage[i] - withoutFoliage[i]) + Math.abs(withFoliage[i + 1] - withoutFoliage[i + 1])
      + Math.abs(withFoliage[i + 2] - withoutFoliage[i + 2]);
    const on = y < floorY && change > DIFFERENCE;
    rawImage.data[i] = rawImage.data[i + 1] = rawImage.data[i + 2] = 255;
    rawImage.data[i + 3] = on ? 255 : 0;
  }
  rawContext.putImageData(rawImage, 0, 0);

  // Closing the gaps: blurred, then kept where enough of the neighbourhood is foliage.
  const soft = document.createElement('canvas');
  soft.width = width;
  soft.height = height;
  const softContext = soft.getContext('2d', { willReadFrequently: true });
  softContext.filter = `blur(${CLOSE_GAPS_PX}px)`;
  softContext.drawImage(raw, 0, 0);
  const blurred = softContext.getImageData(0, 0, width, height);
  const keep = Math.round(255 * KEEP_FROM);
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let i = 3, p = 0; i < blurred.data.length; i += 4, p++) {
    const x = p % width, y = Math.floor(p / width);
    const on = y < floorY && blurred.data[i] >= keep;
    blurred.data[i - 3] = blurred.data[i - 2] = blurred.data[i - 1] = 255;
    blurred.data[i] = on ? 255 : 0;
    if (!on) continue;
    count++;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  softContext.filter = 'none';
  softContext.putImageData(blurred, 0, 0);
  const box = count ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null;
  return { canvas: soft, box, coverage: count / (width * height) };
}

// The tree's foot (the middle of its base) and top, in the picture's pixels.
function treeOnScreen(tree, camera, width, height) {
  const bounds = new T.Box3().setFromObject(tree);
  const centre = bounds.getCenter(new T.Vector3());
  const toPixels = point => {
    const ndc = point.clone().project(camera);
    return { x: Math.round((ndc.x + 1) / 2 * width), y: Math.round((1 - ndc.y) / 2 * height) };
  };
  return { foot: toPixels(new T.Vector3(centre.x, bounds.min.y, centre.z)), top: toPixels(new T.Vector3(centre.x, bounds.max.y, centre.z)) };
}

// drawFrame(withBloom) draws the still scene onto the renderer's canvas (scene.js: the weather, the glowing
// look and the render). Returns { scene, canopy, meta } as described above.
export function captureTreePicture({ renderer, camera, tree, drawFrame, stage, look }) {
  const width = CAPTURE_WIDTH, height = CAPTURE_HEIGHT;
  const canvas = renderer.domElement;

  drawFrame(true);
  const scene = canvas.toDataURL('image/jpeg', 0.9); // read straight after drawing, before the browser clears it

  tree.updateMatrixWorld(true);
  const { foot, top } = treeOnScreen(tree, camera, width, height);
  drawFrame(false);
  const withFoliage = readPixels(canvas, width, height);
  const foliage = [];
  tree.traverse(object => { if (isFoliage(object) && object.visible) foliage.push(object); });
  foliage.forEach(object => { object.visible = false; });
  drawFrame(false);
  const withoutFoliage = readPixels(canvas, width, height);
  foliage.forEach(object => { object.visible = true; });

  const floorY = Math.min(height, Math.max(0, foot.y));
  const mask = canopyMask(withFoliage, withoutFoliage, width, height, floorY);
  return {
    scene,
    canopy: mask.canvas.toDataURL('image/png'),
    meta: { stage, look, width, height, canopy: mask.box, coverage: Number(mask.coverage.toFixed(4)), treeFoot: foot, treeTop: top },
  };
}
