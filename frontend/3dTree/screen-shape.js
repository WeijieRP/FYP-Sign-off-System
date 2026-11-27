// Owner: Role 2, Wei Jie.
// The admin's screen shape for the 3D tree (3D Scene Controls > Screen size, tree3dParameters.screenSize; the server
// checks it: backend/features/parameters/screenSize.js), as the 2D tree's (frontend/tree/tree.js applyScreenShape).
// Auto: the scene fills the window, as it always has. A preset (e.g. the ESG Centre's 7 m x 2 m LED wall) or a
// custom width and height: the whole page (.reserve: the scene, its title card, panels and buttons) is drawn in
// that shape, as large as the window allows, centred, black round it, for a display fed a picture of another shape
// (as an LED wall's controller often is). The scene then frames the tree for that shape itself (scene.js updateSize
// watches the view's size). Not in the capture mode for the 2D tree's pictures (?capture2d=1), which has its own size.

let shape = null;
const capturing = new URLSearchParams(location.search).get('capture2d') === '1';

function layout() {
  const root = document.querySelector('.reserve');
  if (!root) return;
  const width = Number(shape?.width), height = Number(shape?.height);
  const fixed = !capturing && Boolean(shape) && shape.preset !== 'auto' && width > 0 && height > 0;
  document.body.classList.toggle('fixed-shape', fixed);
  if (!fixed) {
    ['left', 'top', 'right', 'bottom', 'width', 'height'].forEach(property => root.style.removeProperty(property));
    return;
  }
  const windowWidth = window.innerWidth || 1, windowHeight = window.innerHeight || 1;
  const ratio = width / height;
  let stageWidth = windowWidth, stageHeight = windowWidth / ratio;
  if (stageHeight > windowHeight) { stageHeight = windowHeight; stageWidth = windowHeight * ratio; }
  Object.assign(root.style, {
    left: `${Math.round((windowWidth - stageWidth) / 2)}px`,
    top: `${Math.round((windowHeight - stageHeight) / 2)}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${Math.round(stageWidth)}px`,
    height: `${Math.round(stageHeight)}px`,
  });
}

// next: the admin's tree3dParameters.screenSize ({ preset, width, height }) or nothing (Auto).
export function applyScreenShape(next) {
  const key = JSON.stringify(next || null);
  if (key === JSON.stringify(shape)) return;
  shape = next || null;
  layout();
}

window.addEventListener('resize', layout);
