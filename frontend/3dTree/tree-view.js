import { THREE as T, OrbitControls } from './vendor/three-runtime.js';

const centre = new T.Vector3(.14, 6.95, 0);
export const orbitCentre = centre.clone(); // the point the view turns around (feedback-leaves.js turns with it)
const front = new T.Vector3(.115, .171, 1).normalize();
// The automatic turn: one full turn every TURN_SECONDS by default (24 hours), or as the admin sets it
// (3D Scene Controls: tree3dParameters.orbitSeconds, 30 seconds to 24 hours, and orbitDirection; setOrbit).
export const TURN_SECONDS = 24 * 60 * 60;
export const TURN_SECONDS_MIN = 30;
export const ZOOM_MIN = 0.5;   // furthest out: twice as far as the standard framing
export const ZOOM_MAX = 2.5;   // closest in
const VIEW_MOVE_SECONDS = 1.6; // a newly chosen view is reached this smoothly
// The standard framing, with the tree as the main focus: the canopy fills a laptop screen from side to side,
// and on the 3.5:1 wall (7 m x 2 m) the tree fills the height with the river and hills either side (zoom 1).
// The admin can choose another view for the screens (view-settings.js: a saved snapshot of a zoom, an angle
// round the tree and a height); moving the view (dragging round the tree with a mouse or a touch, the arrow
// keys) and zooming (the mouse wheel, a pinch, the + and - keys) work only in the admin's view editor (the page
// with ?viewEditor=1, the preview in the admin's 3D View & Zoom card), so viewers always see the chosen view.
const frameHeight = 14.2;    // metres of the scene seen top to bottom (the trunk's roots to the canopy top)
const frameWidth = 27;       // metres always seen side to side, so a narrower screen still shows the canopy

export function createTreeView(camera, canvas, orbitButton, { autoOrbit, reducedMotion, editor = false }) {
  const controls = new OrbitControls(camera);
  controls.target.copy(centre);
  controls.enablePan = false;
  controls.enableZoom = editor; // the wheel and a pinch zoom only in the admin's view editor
  // Dragging round the tree (a mouse or a touch) and the arrow keys also only in the admin's view editor (Owner:
  // Role 2, Wei Jie): the 3D screens keep the admin's chosen view, turning by itself, and nobody at a screen can
  // move it. A click on a leaf still opens its details.
  controls.zoomSpeed = 0.6;
  controls.enableDamping = !reducedMotion;
  controls.minPolarAngle = T.MathUtils.degToRad(60);
  controls.maxPolarAngle = T.MathUtils.degToRad(85);
  controls.rotateSpeed = .54;
  // OrbitControls turns autoRotateSpeed / 60 of a turn a second: 60 / seconds is one turn in that many seconds.
  // A positive speed moves the view to its left round the tree, so the tree seems to turn to the right.
  const turnSpeed = (seconds, direction) => (direction === 'left' ? -1 : 1) * 60
    / Math.min(TURN_SECONDS, Math.max(TURN_SECONDS_MIN, Number(seconds) || TURN_SECONDS));
  controls.autoRotateSpeed = turnSpeed(TURN_SECONDS, 'right');

  const offset = new T.Vector3();
  const focus = controls.target;
  let viewDistance = 0; // the standard framing's distance (zoom 1) for this screen's shape
  let zoom = 1;         // the view's zoom: the camera is viewDistance / zoom from the tree
  let move = null;      // moving to a newly chosen view: { from, to, t }
  let pending = null;   // a view chosen before the screen's first framing, put in place then
  const spherical = new T.Spherical();
  const clampZoom = value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value) || 1));
  const minPolar = T.MathUtils.degToRad(60), maxPolar = T.MathUtils.degToRad(85);
  let dragging = false;
  let resumeDelay = 0;

  function pauseOrbit() {
    resumeDelay = 4;
    controls.autoRotate = false;
  }

  controls.enableRotate = editor;
  const keyMoves = new Map(editor ? [
    ['ArrowLeft', () => controls.rotateLeft(-.065)],
    ['ArrowRight', () => controls.rotateLeft(.065)],
    ['ArrowUp', () => controls.rotateUp(.065)],
    ['ArrowDown', () => controls.rotateUp(-.065)],
    ['+', () => zoomBy(1.15)], ['=', () => zoomBy(1.15)], ['-', () => zoomBy(1 / 1.15)],
  ] : []);
  canvas.addEventListener('keydown', event => {
    const move = keyMoves.get(event.key);
    if (!move || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    pauseOrbit();
    move();
  });

  controls.addEventListener('start', () => {
    dragging = true;
    pauseOrbit();
  });
  controls.addEventListener('end', () => {
    dragging = false;
    pauseOrbit();
  });
  controls.connect(canvas);
  controls.cursorStyle = editor ? 'grab' : 'auto'; // a hand to drag with only where the view can be moved

  function showOrbitState() {
    orbitButton.setAttribute('aria-pressed', String(autoOrbit));
  }
  orbitButton.addEventListener('click', () => {
    autoOrbit = !autoOrbit;
    controls.autoRotate = false;
    showOrbitState();
  });
  showOrbitState();

  // The view now: its zoom, its angle round the tree (azimuth, radians) and its height (polar, from straight
  // up: 60 to 85 degrees).
  function getView() {
    spherical.setFromVector3(offset.subVectors(camera.position, focus));
    return { zoom: viewDistance > 0 ? clampZoom(viewDistance / spherical.radius) : zoom, azimuth: spherical.theta, polar: spherical.phi };
  }
  // Goes to a view (any of zoom, azimuth, polar; the rest stay), smoothly unless told not to.
  function setView(view, { smooth = true } = {}) {
    const now = getView();
    const to = {
      zoom: view.zoom === undefined ? now.zoom : clampZoom(view.zoom),
      azimuth: Number.isFinite(Number(view.azimuth)) ? Number(view.azimuth) : now.azimuth,
      polar: Number.isFinite(Number(view.polar)) ? Math.min(maxPolar, Math.max(minPolar, Number(view.polar))) : now.polar,
    };
    // The short way round to the new angle.
    to.azimuth = now.azimuth + Math.atan2(Math.sin(to.azimuth - now.azimuth), Math.cos(to.azimuth - now.azimuth));
    zoom = to.zoom;
    if (viewDistance === 0) { pending = to; return; }
    if (!smooth || reducedMotion) { move = null; place(to); return; }
    move = { from: now, to, t: 0 };
  }
  function place({ zoom: z, azimuth, polar }) {
    if (viewDistance === 0) return;
    if (!editor) controls.minDistance = controls.maxDistance = viewDistance / clampZoom(z);
    spherical.set(viewDistance / clampZoom(z), polar, azimuth);
    camera.position.copy(focus).add(offset.setFromSpherical(spherical));
    controls.update(0);
    camera.updateMatrixWorld();
  }
  function zoomBy(factor) {
    // From the zoom being moved to, so quick presses add up.
    setView({ zoom: (move ? move.to.zoom : getView().zoom) * factor });
  }
  // The standard view's angle: from the front, as the page opens.
  function standardAngle() {
    spherical.setFromVector3(front);
    return { azimuth: spherical.theta, polar: spherical.phi };
  }

  return {
    getView,
    setView,
    zoomBy,
    standardAngle,
    resize(aspect) {
      if (viewDistance > 0 && camera.aspect === aspect) return;
      camera.aspect = aspect;
      camera.fov = aspect < 1.12 ? 45 : 34;
      camera.updateProjectionMatrix();

      // Close enough to see frameHeight top to bottom, but never so close that frameWidth is cut off.
      const firstFraming = viewDistance === 0;
      const halfFovTan = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      viewDistance = Math.max(frameHeight / (2 * halfFovTan), frameWidth / (2 * halfFovTan * aspect));
      // In the editor the wheel zooms between ZOOM_MIN and ZOOM_MAX; elsewhere the distance is the view's.
      controls.minDistance = viewDistance / (editor ? ZOOM_MAX : zoom);
      controls.maxDistance = viewDistance / (editor ? ZOOM_MIN : zoom);
      if (firstFraming) offset.copy(front);
      else offset.subVectors(camera.position, focus).normalize(); // keep the current orbit angle
      focus.copy(centre);
      camera.position.copy(focus).addScaledVector(offset, viewDistance / zoom);
      if (pending) { const view = pending; pending = null; place(view); return; }
      controls.update(0);
      camera.updateMatrixWorld();
    },
    update(dt, elapsedSeconds) {
      if (move) { // moving smoothly to a newly chosen view
        move.t = Math.min(1, move.t + dt / VIEW_MOVE_SECONDS);
        const k = move.t * move.t * (3 - 2 * move.t);
        const lerp = key => move.from[key] + (move.to[key] - move.from[key]) * k;
        place({ zoom: lerp('zoom'), azimuth: lerp('azimuth'), polar: lerp('polar') });
        if (move.t >= 1) move = null;
        return;
      }
      if (editor && viewDistance > 0) zoom = getView().zoom; // the wheel or a pinch changed it
      const orbitStep = Math.max(0, elapsedSeconds - resumeDelay);
      resumeDelay = Math.max(0, resumeDelay - elapsedSeconds);
      controls.dampingFactor = -Math.expm1(-dt * 9);
      controls.autoRotate = autoOrbit && !dragging && orbitStep > 0;
      controls.update(orbitStep);
    },
    // The admin's turning speed (one full turn every `seconds`) and direction ('right' or 'left').
    setOrbit({ seconds, direction }) {
      controls.autoRotateSpeed = turnSpeed(seconds, direction);
    },
  };
}
