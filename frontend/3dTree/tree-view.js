import { THREE as T, OrbitControls } from './vendor/three-runtime.js';

const centre = new T.Vector3(.14, 6.95, 0);
const front = new T.Vector3(.115, .171, 1).normalize();
const secondsPerTurn = 24 * 60 * 60;
// A wall-shaped screen (the 7 m x 2 m display is 3.5:1) brings the camera closer and aims a little
// lower, so the tree fills the height as the main focus while the river and hills fill the sides.
const wallDistance = 33;     // camera distance on a 3.5:1 wall (38.5 on an ordinary screen)
const wallAimDrop = .9;      // how far below the usual aim point the wall view looks, in metres
function wallShare(aspect) { return T.MathUtils.smoothstep(aspect, 1.9, 3.2); }

export function createTreeView(camera, canvas, orbitButton, { autoOrbit, reducedMotion }) {
  const controls = new OrbitControls(camera);
  controls.target.copy(centre);
  controls.enablePan = false;
  controls.zoomToCursor = false;
  controls.enableDamping = !reducedMotion;
  controls.minPolarAngle = T.MathUtils.degToRad(60);
  controls.maxPolarAngle = T.MathUtils.degToRad(85);
  controls.rotateSpeed = .54;
  controls.zoomSpeed = .85;
  controls.autoRotateSpeed = 60 / secondsPerTurn;

  const offset = new T.Vector3();
  const focus = controls.target;
  let wideDistance = 0;
  let zoomTarget = null;
  let dragging = false;
  let resumeDelay = 0;

  function pauseOrbit() {
    resumeDelay = 4;
    controls.autoRotate = false;
  }

  function zoomBy(logScale) {
    const distance = zoomTarget ?? controls.getDistance();
    zoomTarget = T.MathUtils.clamp(distance * Math.exp(logScale), controls.minDistance, controls.maxDistance);
  }

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = T.MathUtils.clamp(event.deltaY * unit, -220, 220);
    pauseOrbit();
    zoomBy(delta * .00155);
  }, {capture:true, passive:false});

  const keyMoves = new Map([
    ['ArrowLeft', () => controls.rotateLeft(-.065)],
    ['ArrowRight', () => controls.rotateLeft(.065)],
    ['ArrowUp', () => controls.rotateUp(.065)],
    ['ArrowDown', () => controls.rotateUp(-.065)],
    ['+', () => zoomBy(-.15)],
    ['=', () => zoomBy(-.15)],
    ['-', () => zoomBy(.15)],
  ]);
  canvas.addEventListener('keydown', event => {
    const move = keyMoves.get(event.key);
    if (!move || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    pauseOrbit();
    move();
  });

  controls.addEventListener('start', () => {
    dragging = true;
    zoomTarget = null;
    pauseOrbit();
  });
  controls.addEventListener('end', () => {
    dragging = false;
    pauseOrbit();
  });
  controls.connect(canvas);
  controls.cursorStyle = 'grab';

  function showOrbitState() {
    orbitButton.setAttribute('aria-pressed', String(autoOrbit));
  }
  orbitButton.addEventListener('click', () => {
    autoOrbit = !autoOrbit;
    controls.autoRotate = false;
    showOrbitState();
  });
  showOrbitState();

  return {
    resize(aspect) {
      if (wideDistance > 0 && camera.aspect === aspect) return;
      camera.aspect = aspect;
      camera.fov = aspect < 1.12 ? 45 : 34;
      camera.updateProjectionMatrix();

      const previousDistance = wideDistance;
      const halfFov = T.MathUtils.degToRad(camera.fov / 2);
      const wall = wallShare(aspect);
      wideDistance = Math.max(T.MathUtils.lerp(38.5, wallDistance, wall), 13.6 / (Math.tan(halfFov) * aspect) + 6);
      controls.maxDistance = wideDistance;
      controls.minDistance = wideDistance * .53;
      let distance = wideDistance;
      if (previousDistance > 0) {
        const scale = wideDistance / previousDistance;
        distance = controls.getDistance() * scale;
        offset.subVectors(camera.position, focus).normalize();
        if (zoomTarget !== null) zoomTarget *= scale;
      } else {
        offset.copy(front);
      }
      focus.set(centre.x, centre.y - (wallAimDrop * wall), centre.z);
      camera.position.copy(focus).addScaledVector(offset, distance);
      controls.update(0);
      camera.updateMatrixWorld();
    },
    update(dt, elapsedSeconds) {
      if (zoomTarget !== null) {
        const distance = controls.getDistance();
        const blend = reducedMotion ? 1 : -Math.expm1(-dt * 12);
        const next = T.MathUtils.lerp(distance, zoomTarget, blend);
        const done = Math.abs(next - zoomTarget) < .01;
        offset.subVectors(camera.position, focus).multiplyScalar((done ? zoomTarget : next) / distance);
        camera.position.copy(focus).add(offset);
        if (done) zoomTarget = null;
      }
      const orbitStep = Math.max(0, elapsedSeconds - resumeDelay);
      resumeDelay = Math.max(0, resumeDelay - elapsedSeconds);
      controls.dampingFactor = -Math.expm1(-dt * 9);
      controls.autoRotate = autoOrbit && !dragging && orbitStep > 0;
      controls.update(orbitStep);
    },
  };
}
