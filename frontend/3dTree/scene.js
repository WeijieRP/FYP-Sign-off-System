import { THREE as T } from './vendor/three-runtime.js';
import { loadEnvironment, addLandscape, horizon, seeded, sunDirection } from './landscape.js';
import { landscapeFar } from './mountains.js';
import { createBirds, createSwimmers } from './wildlife.js';
import { addMatteTree } from './matte-tree.js';
import { addForestHabitat } from './forest-habitat.js';
import { addForestWildlife } from './forest-wildlife.js';
import { setupSoilView } from './forest-floor.js';
import { createAmbience } from './ambience.js';
import { createWeather } from './weather.js';
import { installSkyControls } from './singapore-weather.js';
import { installRiverLevel } from './river-level.js';
import { createFallingLeaves } from './falling-leaves.js';
import { refineSceneMaterials, drawingRatio, createFrameBudget } from './render-quality.js';
import { createTreeView } from './tree-view.js';
import { addFeedbackLeaves } from './feedback-leaves.js';
import { startingStage, stageModelUrl, prepareStageTree, perchSeats, canopyDriftRoutes, normaliseStage } from './tree-stage.js';
import { onTree3dSettings } from './tree3d-settings.js';

// Edit these values for the installation.
const config = {
  gustIntervalSeconds: 29,
  gustDurationSeconds: 6.5,
  pixelBudget: 20000000,    // Native display pixels; no automatic blur in the default mode.
};

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.querySelector('.reserve');
const view = document.querySelector('#view');
const canvas = document.querySelector('#landscape');
const loading = document.querySelector('#loading');
const loadingDetail = document.querySelector('#loading-detail');
const message = document.querySelector('#message');
const windStatus = document.querySelector('#wind-status');
const windDot = document.querySelector('#wind-dot');
const volume = document.querySelector('#volume');
const buttons = Object.fromEntries(['sound','gust','slow-orbit','fullscreen']
  .map(id => [id,document.getElementById(id)]));
document.body.classList.toggle('embed',params.get('embed')==='1');
document.body.classList.toggle('clean',params.get('clean')==='1');

const clock = {time:{value:0}, gust:{value:0}, soil:{value:0},
  night:{value:0},rain:{value:0},lightning:{value:0},waterRise:{value:0},
  dusk:{value:0},clouds:{value:.34},sunRay:{value:sunDirection.clone()},
  moonRay:{value:new T.Vector3(.35,.07,-.935).normalize()}};
const ambient = createAmbience();

function gustStrength(age) {
  return T.MathUtils.smoothstep(age,0,1.10)
    * (1-T.MathUtils.smoothstep(age,2.55,config.gustDurationSeconds));
}

async function start() {
  const lowQuality=params.get('quality')==='low';
  const renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  const frameBudget=createFrameBudget();
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.09;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new T.Scene();
  scene.background = horizon;
  const camera = new T.PerspectiveCamera(34,1,.19,landscapeFar);
  const treeView = createTreeView(camera,canvas,buttons['slow-orbit'],{
    autoOrbit:!reducedMotion && params.get('orbit')!=='off',reducedMotion,
  });
  const sun = new T.DirectionalLight(0xffecd8,2.64);
  sun.position.copy(sunDirection).multiplyScalar(98);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(lowQuality?1024:2048);
  Object.assign(sun.shadow.camera,{left:-49,right:49,top:44,bottom:-44,near:.8,far:188});
  sun.shadow.bias = -.00023;
  sun.shadow.normalBias = .067;
  sun.shadow.radius = 2.5;
  const hemi=new T.HemisphereLight(0xe0ebff,0x9d956c,1.38);
  const fill=new T.DirectionalLight(0xdbeaff,.52);
  fill.position.set(18,12,19);
  const rim=new T.DirectionalLight(0xffe6c7,.58);
  rim.position.set(20,27,-28);
  for (const light of [sun,hemi,fill,rim]) light.layers.enable(1);
  scene.add(sun,sun.target,hemi,fill,rim);

  function updateSize() {
    const w = Math.max(1,view.clientWidth), h = Math.max(1,view.clientHeight);
    const baseRatio=drawingRatio(renderer,w,h,lowQuality,config.pixelBudget);
    renderer.setDrawingBufferSize(w,h,baseRatio*(lowQuality?frameBudget.scale:1));
    treeView.resize(w/h);
  }
  updateSize();
  // The tree's growth stage, the same as the 2D tree's (tree-stage.js).
  const {stage,fixed}=await startingStage();
  const assets = await loadEnvironment((count,total)=>{
    loadingDetail.textContent = `Loading Stage ${stage} and the river assets · ${count}/${total}`;
  },lowQuality,stageModelUrl(stage));
  const shownStage=assets.tree.userData.stageFallback?4:stage;
  const stageLabel=document.getElementById('tree-stage-label');
  if (stageLabel) stageLabel.textContent=`STAGE ${shownStage}`;
  loadingDetail.textContent = 'Lighting the river valley';
  clock.soil.value=assets.layout.soilY-.035;
  clock.swimmers={value:assets.layout.duckRoutes.map(()=>new T.Vector4())};
  const soundDirection=new T.Vector3(), cameraRight=new T.Vector3();
  function soundPan(position) {
    cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
    return T.MathUtils.clamp(soundDirection.subVectors(position,camera.position).normalize().dot(cameraRight),-1,1);
  }
  const water=addLandscape(scene,assets,clock,lowQuality);
  const updateRiverLevel=installRiverLevel(clock.rain,water.setRise);
  const tree=addMatteTree(scene,prepareStageTree(assets.tree,shownStage),clock,shownStage);
  const treeBounds=new T.Box3().setFromObject(tree);
  if (treeBounds.isEmpty()) throw new Error(`The Stage ${shownStage} tree has no renderable geometry.`);
  // The wind drops leaves from this stage's canopy; a bare trunk (stage 0) drops none.
  const driftRoutes=canopyDriftRoutes(tree,assets.leafDrifts,shownStage);
  const leaves=createFallingLeaves(scene,assets.driftLeaves,driftRoutes,seeded(7741),clock.waterRise,(position,time)=>{
    water.splash(position,time);
    if (ambient.enabled) ambient.leafSplash(soundPan(position),camera.position.distanceTo(position));
  });
  const dropLeaves=time=>{ if (driftRoutes.length) leaves.gust(time); };
  // A different stage saved in the admin: reload into it (unless ?stage= fixes the stage).
  if (!fixed) onTree3dSettings(next=>{
    if (next?.tree2d && normaliseStage(next.tree2d.treeStage)!==stage) location.reload();
  });
  // One leaf per feedback on the tree, with the 2D tree's leaf animations (feedback-leaves.js).
  const feedbackLeaves=addFeedbackLeaves({scene,tree,clock,camera,renderer});

  const updateHabitat=addForestHabitat(scene,assets,clock,lowQuality,seeded(60331));
  const updateForestWildlife=addForestWildlife(scene,assets.forestWildlife,assets.layout.habitat,clock,lowQuality);
  const updateSoilView=setupSoilView(assets.soil,reducedMotion);
  updateHabitat(0);
  updateForestWildlife(0);
  const updateWildlife=createSwimmers(scene,assets,clock,lowQuality);
  const seats=perchSeats(tree,[[-4.822,4.776,1.032],[4.414,4.893,.617],[-4.057,7.364,.104],[4.227,7.372,-.568]],shownStage);
  const updateBirds=createBirds(scene,assets.hawk,treeBounds,clock.soil.value,seats,lowQuality);
  updateWildlife(0);
  updateBirds(0);
  let finishSunset;
  const weather=createWeather(scene,renderer,{sun,hemi,fill,rim},assets,clock,water,lowQuality,sunDirection,
    {reducedMotion,onThunder:(...args)=>ambient.thunder(...args),onStormEnd:()=>ambient.cancelThunder(),onSunsetEnd:()=>finishSunset?.()});
  refineSceneMaterials(scene,renderer);
  updateSize();
  weather.frameSky(camera);
  const resize = new ResizeObserver(() => {
    updateSize();
    weather.frameSky(camera);
  });
  resize.observe(view);
  finishSunset=installSkyControls(weather,camera);
  weather.update(0,camera);

  volume.addEventListener('input',()=>ambient.setLevel(Number(volume.value)/100));
  const soundLabel=buttons.sound.querySelector('span');
  buttons.sound.addEventListener('click',async () => {
    buttons.sound.disabled = true;
    if (!ambient.enabled) soundLabel.textContent = 'Loading sound…';
    try {
      ambient.setLevel(Number(volume.value)/100);
      const audible = await ambient.toggle();
      buttons.sound.setAttribute('aria-pressed',String(audible));
      soundLabel.textContent = audible ? 'Sound on' : 'Enable sound';
      volume.disabled=!audible;
      message.textContent = audible ? 'River, wind, birds and weather sounds enabled.' : 'Sound muted.';
    } catch (error) {
      soundLabel.textContent = 'Retry sound';
      message.textContent = 'Sound is unavailable. Check that both audio files are present.';
      console.warn(error);
    } finally {
      buttons.sound.disabled = false;
    }
  });
  let manualGust = -Infinity;
  buttons.gust.addEventListener('click',() => {
    manualGust = clock.time.value;
    dropLeaves(manualGust);
    message.textContent = 'Wind preview started.';
  });
  buttons.fullscreen.disabled = !document.fullscreenEnabled;
  buttons.fullscreen.addEventListener('click',async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      message.textContent = 'Fullscreen is unavailable in this page.';
    }
  });

  window.addEventListener('keydown',event => {
    if (event.key.toLowerCase()==='h' && !event.repeat) document.body.classList.toggle('clean');
  });
  buttons.sound.disabled = buttons.gust.disabled = buttons['slow-orbit'].disabled = false;

  let lastFrame = null, elapsed = 0, label = '', gustCycle=0;
  document.addEventListener('visibilitychange',() => {lastFrame=null;});
  renderer.setAnimationLoop(now => {
    if (document.hidden) return;
    const frameMs=lastFrame===null?16.7:Math.max(0,now-lastFrame);
    const frameSeconds=frameMs/1000;
    const dt=Math.min(.075,frameSeconds);
    lastFrame = now;
    elapsed+=dt;
    if(lowQuality && elapsed>2 && frameBudget.sample(frameMs)) updateSize();
    clock.time.value = elapsed;
    const cycle = elapsed%config.gustIntervalSeconds;
    const currentCycle=Math.floor(elapsed/config.gustIntervalSeconds);
    if (currentCycle>gustCycle) {
      gustCycle=currentCycle;
      dropLeaves(elapsed);
    }
    const scheduled = elapsed >= config.gustIntervalSeconds ? gustStrength(cycle) : 0;
    const gust=Math.max(scheduled,gustStrength(elapsed-manualGust));
    clock.gust.value=Math.max(gust,clock.rain.value*.42);
    const gustActive=gust>.025;
    const next = Math.ceil(config.gustIntervalSeconds-cycle);
    const readout = gustActive ? 'Wind gust' : `Next gust in ${next}s`;
    if (readout!==label) {
      windStatus.textContent = readout;
      windDot.classList.toggle('active',gustActive);
      label = readout;
    }
    treeView.update(dt,frameSeconds);
    weather.update(dt,camera);
    updateRiverLevel(dt);
    leaves.update(elapsed);
    feedbackLeaves.update(dt,elapsed);
    updateHabitat(elapsed);
    updateForestWildlife(elapsed);
    updateWildlife(elapsed);
    const bird = updateBirds(elapsed);
    if (ambient.enabled) {
      ambient.update(soundPan(bird),Math.max(0,camera.position.y-1.2),clock.gust.value,clock.rain.value,clock.night.value);
    }
    renderer.render(scene,camera);
    updateSoilView(dt);
    if (!loading.hidden) {
      loading.hidden = true;
      root.dataset.ready = 'true';
    }
  });
}

start().catch(error => {
  console.error(error);
  loading.classList.add('error');
  loading.querySelector('strong').textContent = '3D view unavailable';
  loadingDetail.textContent = /WebGL context/i.test(error.message)
    ? 'Open the served page in a browser with WebGL 2 enabled to explore the river.'
    : 'Serve the entire extracted folder together so the tree, textures and other assets can load.';
});
