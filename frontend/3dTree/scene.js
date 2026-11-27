import { THREE as T } from './vendor/three-runtime.js';
import { loadEnvironment, addLandscape, horizon, seeded, sunDirection } from './landscape.js';
import { landscapeFar } from './mountains.js';
import { createBirds, createSwimmers } from './wildlife.js';
import { addMatteTree } from './matte-tree.js';
import { addForestHabitat } from './forest-habitat.js';
import { addForestWildlife } from './forest-wildlife.js';
import { setupSoilView } from './forest-floor.js';
import { createAmbience, mixFromSettings } from './ambience.js';
import { createWeather } from './weather.js';
import { installSkyControls } from './singapore-weather.js';
import { installRiverLevel } from './river-level.js';
import { createFallingLeaves } from './falling-leaves.js';
import { refineSceneMaterials, drawingRatio, createFrameBudget } from './render-quality.js';
import { createTreeView, TURN_SECONDS, TURN_SECONDS_MIN } from './tree-view.js';
import { installViewSettings } from './view-settings.js';
import { addFeedbackLeaves } from './feedback-leaves.js';
import { startingStage, stageModelUrl, prepareStageTree, perchSeats, canopyDriftRoutes, normaliseStage, loadStageTree, removeTree } from './tree-stage.js';
import { growTree, matchingScale, previewGrowth } from './tree-growth.js';
import { onTree3dSettings } from './tree3d-settings.js';
import { addGlowLook, startingLook } from './glow-look.js';
import { applyScreenShape } from './screen-shape.js';
import { captureTreePicture, CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_ZOOM, CAPTURE_FRAMING_ASPECT } from './capture-2d.js';

// Edit these values for the installation.
const config = {
  gustIntervalSeconds: 29,
  gustDurationSeconds: 6.5,
  pixelBudget: 20000000,    // Native display pixels; no automatic blur in the default mode.
};
const REVEAL_WAIT_MS = 20000; // the longest the scene waits for its last parts before it shows (start)

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
// Pictures for the 2D tree's Natural and Digital styles (capture-2d.js, the admin's 2D Tree Display): the tree
// still, from the standard front view, in clear weather, without the visitors' leaves, birds or falling leaves.
const capture2d=params.get('capture2d')==='1';
document.body.classList.toggle('capture-2d',capture2d);

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
  // The admin's view editor (?viewEditor=1, in the admin's 3D View & Zoom card): zooming on, no automatic turn.
  const viewEditor=params.get('viewEditor')==='1';
  document.body.classList.toggle('view-editor',viewEditor);
  const treeView = createTreeView(camera,canvas,buttons['slow-orbit'],{
    autoOrbit:!viewEditor && !capture2d && !reducedMotion && params.get('orbit')!=='off',reducedMotion,editor:viewEditor,
  });
  if (!capture2d) installViewSettings(treeView,{editor:viewEditor}); // the admin's chosen view (view-settings.js)
  // The admin's turning speed and direction (3D Scene Controls), shown on the turn button too.
  const turnLabel=buttons['slow-orbit'].querySelector('span');
  onTree3dSettings(next=>{
    const seconds=Math.min(TURN_SECONDS,Math.max(TURN_SECONDS_MIN,Number(next?.orbitSeconds)||TURN_SECONDS));
    treeView.setOrbit({seconds,direction:next?.orbitDirection});
    const time=seconds%3600===0?`${seconds/3600}h`:seconds%60===0?`${seconds/60} min`:`${seconds}s`;
    if (turnLabel) turnLabel.textContent=`${time} turn`;
    buttons['slow-orbit'].title=`Turn the tree automatically: one full turn every ${time.replace('h',' h').replace(/s$/,' s')}, to the ${next?.orbitDirection==='left'?'left':'right'}`;
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
    if (capture2d) { // always the picture's own size, whatever the window
      renderer.setDrawingBufferSize(CAPTURE_WIDTH,CAPTURE_HEIGHT,1);
      treeView.resize(CAPTURE_FRAMING_ASPECT); // the tree framed as for 16:9 ...
      camera.aspect=CAPTURE_WIDTH/CAPTURE_HEIGHT; // ... then the view widened: the same height, more at the sides
      camera.updateProjectionMatrix();
      return;
    }
    const w = Math.max(1,view.clientWidth), h = Math.max(1,view.clientHeight);
    // The title card, Year Review and the credit grow and shrink with the screen, as on the 2D tree: against the
    // design screen (1917 x 1007), so the ESG Centre's 7 m x 2 m wall or a small screen keeps them in proportion (scene.css).
    document.documentElement.style.setProperty('--screen-scale',Math.min(4,Math.max(.3,Math.min(w/1917,h/1007))).toFixed(4));
    const baseRatio=drawingRatio(renderer,w,h,lowQuality,config.pixelBudget);
    renderer.setDrawingBufferSize(w,h,baseRatio*(lowQuality?frameBudget.scale:1));
    treeView.resize(w/h);
  }
  updateSize();
  // The tree's growth stage, the same as the 2D tree's (tree-stage.js).
  // ... and the look: glowing or the daylight river valley (the admin's "Glowing look", glow-look.js).
  const [{stage,fixed,growth:startingGrowth},look]=await Promise.all([startingStage(),startingLook()]);
  const assets = await loadEnvironment((count,total)=>{
    loadingDetail.textContent = `Loading Stage ${stage} and the river assets · ${count}/${total}`;
  },lowQuality,stageModelUrl(stage));
  let shownStage=assets.tree.userData.stageFallback?4:stage;
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
  let tree=addMatteTree(scene,await prepareStageTree(assets.tree,shownStage),clock,shownStage);
  const treeBounds=new T.Box3().setFromObject(tree);
  if (treeBounds.isEmpty()) throw new Error(`The Stage ${shownStage} tree has no renderable geometry.`);
  // In the admin's Auto growth stage the tree grows a little with every leaf: its foliage fills in from the
  // middle of the canopy outwards until the next stage (tree-growth.js). Before anything uses the foliage.
  // (?stage=3&growFrom=2 shows stage 3 as just grown from stage 2.)
  let latestGrowth=startingGrowth;
  let growth=growTree(tree,shownStage,startingGrowth,previewGrowth(shownStage));
  // The wind drops leaves from this stage's canopy; a bare trunk (stage 0) drops none.
  let driftRoutes=canopyDriftRoutes(tree,assets.leafDrifts,shownStage);
  const leaves=createFallingLeaves(scene,assets.driftLeaves,driftRoutes,seeded(7741),clock.waterRise,(position,time)=>{
    water.splash(position,time);
    if (ambient.enabled) ambient.leafSplash(soundPan(position),camera.position.distanceTo(position));
  });
  const dropLeaves=time=>{ if (driftRoutes.length) leaves.gust(time); };
  // One leaf per feedback on the tree, with the 2D tree's leaf animations (feedback-leaves.js).
  const feedbackLeaves=addFeedbackLeaves({scene,tree,clock,camera,renderer,glow:look.glow});

  const updateHabitat=addForestHabitat(scene,assets,clock,lowQuality,seeded(60331));
  const updateForestWildlife=addForestWildlife(scene,assets.forestWildlife,assets.layout.habitat,clock,lowQuality);
  const updateSoilView=setupSoilView(assets.soil,reducedMotion);
  updateHabitat(0);
  updateForestWildlife(0);
  const updateWildlife=createSwimmers(scene,assets,clock,lowQuality);
  const perches=[[-4.822,4.776,1.032],[4.414,4.893,.617],[-4.057,7.364,.104],[4.227,7.372,-.568]];
  let updateBirds=createBirds(scene,assets.hawk,treeBounds,clock.soil.value,perchSeats(tree,perches,shownStage),lowQuality);
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
  if (capture2d) { // a clear day (the glowing look holds its own night)
    weather.setSky(0,camera,{seconds:.01});
    weather.setRain(0,.34,false);
  } else {
    finishSunset=installSkyControls(weather,camera);
  }
  weather.update(0,camera);
  // The glowing tree at night (glow-look.js), when the admin's "Glowing look" is on.
  const glowLook=look.glow?addGlowLook({scene,renderer,tree,clock,lights:{sun,hemi,fill,rim}}):null;
  glowLook?.update(tree);
  // The admin's screen shape (3D Scene Controls > Screen size): Auto, or the page drawn in a set shape (screen-shape.js).
  onTree3dSettings(next=>applyScreenShape(next?.screenSize));
  // The admin's Trunk glow: the light streams on the wood on or off, and how thick and bright (glow-look.js).
  onTree3dSettings(next=>glowLook?.setTrunkGlow({on:next?.trunkGlow!==false,strength:Number(next?.trunkGlowStrength??100)/100}));

  // The tree growing into another stage in place, without reloading the page (tree-stage.js, tree-growth.js).
  // The new stage's model loads in the background while the tree stays on show. Then it takes the tree's
  // place at the tree's size and with the foliage the tree had, and grows to its own size with a growth spurt
  // of fresh foliage. The visitors' leaves move to the same places on its canopy and grow with it (leaves that
  // came while the tree was a bare trunk fly in now, feedback-leaves.js); once it has grown, the birds' perches, the
  // wind's falling leaves and the spots for new leaves come from the new tree. Several changes in a row are
  // taken in turn; a model that cannot be loaded is tried again after a minute.
  let wantedStage=shownStage, changingStage=false, settleNewTree=false, stageFailedAt=0;
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  async function changeStage(next) {
    wantedStage=next;
    if (changingStage || Date.now()-stageFailedAt<60000) return;
    changingStage=true;
    try {
      while (wantedStage!==shownStage) {
        const target=wantedStage;
        const loaded=await loadStageTree(target);
        await nextFrame(); // the work is spread over frames, so the scene keeps moving
        const grown=addMatteTree(scene,await prepareStageTree(loaded,target,nextFrame),clock,target);
        grown.visible=false; // not shown until it is ready to take the tree's place
        refineSceneMaterials(grown,renderer);
        await nextFrame();
        const nextGrowth=growTree(grown,target,latestGrowth,{justReached:target>shownStage,startScale:matchingScale(tree,grown)});
        glowLook?.addTree(grown);
        await renderer.compileAsync(grown,camera,scene);
        removeTree(tree);
        grown.visible=true;
        [tree,growth,shownStage]=[grown,nextGrowth,target];
        if (stageLabel) stageLabel.textContent=`STAGE ${shownStage}`;
        feedbackLeaves.setTree(tree);
        settleNewTree=true;
      }
    } catch (error) {
      stageFailedAt=Date.now();
      console.warn(`The Stage ${wantedStage} tree could not be loaded; the tree stays at Stage ${shownStage} for now.`,error);
    } finally {
      changingStage=false;
    }
  }
  // Once the new stage's tree has grown: the birds perch on its branches and the wind drops its leaves.
  function settleIntoNewTree() {
    driftRoutes=canopyDriftRoutes(tree,assets.leafDrifts,shownStage);
    leaves.setRoutes(driftRoutes);
    updateBirds.remove();
    updateBirds=createBirds(scene,assets.hawk,new T.Box3().setFromObject(tree),clock.soil.value,perchSeats(tree,perches,shownStage),lowQuality);
  }
  // A different stage (in Auto as the leaves come in, or saved in the admin): the tree grows into it, in place
  // (unless ?stage= fixes it). The same stage grown further (Auto, a new leaf): it grows on, slowly. A
  // different look saved in the admin: the page reloads into it (unless ?look= fixes it).
  onTree3dSettings(next=>{
    if (!fixed && next?.tree2d) {
      latestGrowth=next.tree2d.growth;
      const nextStage=normaliseStage(next.tree2d.treeStage);
      if (nextStage!==shownStage || changingStage) changeStage(nextStage);
      else growth.grow(latestGrowth);
    }
    if (!look.fixed && next && (next.glowLook!==false)!==look.glow) location.reload();
  });

  volume.addEventListener('input',()=>ambient.setLevel(Number(volume.value)/100));
  // The gentle background music with the river and birds (background-music.js): the admin's "Background music"
  // and its volume (3D Scene Controls > Sound).
  onTree3dSettings(next=>{
    ambient.setMusic(next?.musicEnabled!==false,Math.max(0,Math.min(100,Number(next?.musicVolume??45)))/100,next?.musicStyle,next?.musicTrack??'');
    ambient.setMix(mixFromSettings(next||{})); // the admin's ambient sounds, each on or off at its own volume
  });
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
      if (error?.name === 'SoundBlocked') { // the browser waits for a first touch (tree3d-settings.js starts it then)
        soundLabel.textContent = 'Tap to start sound';
        message.textContent = 'Tap the screen to start the sound: the browser plays sound only after a first touch.';
      } else {
        soundLabel.textContent = 'Retry sound';
        message.textContent = 'Sound is unavailable. Check that both audio files are present.';
        console.warn(error);
      }
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

  // The whole scene appears at once (scene.css hides the tree, the title box, Year Review and the panels until
  // root's data-ready): once the shaders are compiled (no stutter as it appears), the admin's settings are
  // applied (the title box's own text), the visitors' leaves are on the tree and the fonts are loaded. It keeps
  // rendering behind the loading card meanwhile; after REVEAL_WAIT_MS it shows whatever is ready.
  let readyToReveal=false;
  loadingDetail.textContent='Placing the visitors\' leaves';
  const settingsApplied=new Promise(resolve=>{
    const stop=onTree3dSettings(()=>{ resolve(); queueMicrotask(()=>stop?.()); });
  });
  Promise.race([
    Promise.all([renderer.compileAsync(scene,camera),settingsApplied,feedbackLeaves.ready,document.fonts?.ready]),
    new Promise(resolve=>setTimeout(resolve,REVEAL_WAIT_MS)),
  ]).catch(error=>console.warn('Part of the scene was not ready; showing it anyway.',error))
    .finally(()=>{ readyToReveal=true; });

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
      if (!capture2d) dropLeaves(elapsed);
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
    glowLook?.update(tree);
    updateRiverLevel(dt);
    leaves.update(elapsed);
    if (growth.update(dt)) {
      feedbackLeaves.canopyGrew(); // new spots for leaves on the grown canopy
      if (settleNewTree) { settleNewTree=false; settleIntoNewTree(); }
    }
    feedbackLeaves.update(dt,elapsed);
    updateHabitat(elapsed);
    updateForestWildlife(elapsed);
    updateWildlife(elapsed);
    const bird = updateBirds(elapsed);
    if (ambient.enabled) {
      ambient.update(soundPan(bird),Math.max(0,camera.position.y-1.2),clock.gust.value,clock.rain.value,clock.night.value);
    }
    renderer.render(scene,camera);
    glowLook?.afterRender(camera); // the glowing look: the glow round its lit leaves and light (bloom)
    updateSoilView(dt);
    if (!loading.hidden && readyToReveal) {
      loading.hidden = true;
      root.dataset.ready = 'true';
      if (capture2d) captureReady();
    }
  });

  // ?capture2d=1: once the scene is ready, the page that opened it (the admin's capture, or
  // scripts/tree/capture-2d-from-3d.js) calls window.tree2dCapture() for the picture (capture-2d.js).
  function captureReady() {
    window.tree2dCapture=async () => {
      renderer.setAnimationLoop(null); // the scene stands still from here
      const visitorsLeaves=scene.getObjectByName('Feedback leaves');
      if (visitorsLeaves) visitorsLeaves.visible=false;
      updateBirds.remove();
      updateSize();
      // A little further out than the standard view, from the front, the same for every stage: the whole tree
      // with room round it for the 2D tree's title box and new leaves (capture-2d.js CAPTURE_ZOOM).
      treeView.setView({...treeView.standardAngle(),zoom:CAPTURE_ZOOM},{smooth:false});
      weather.frameSky(camera);
      const drawFrame=withBloom=>{
        weather.update(0,camera);
        glowLook?.update(tree);
        renderer.setRenderTarget(null);
        renderer.render(scene,camera);
        if (withBloom) glowLook?.afterRender(camera);
      };
      return captureTreePicture({renderer,camera,tree,drawFrame,stage:shownStage,look:look.glow?'glow':'natural'});
    };
    window.tree2dCaptureReady=true;
    window.parent?.postMessage({type:'tree2d-capture-ready',stage:shownStage,look:look.glow?'glow':'natural'},location.origin);
  }
}

start().catch(error => {
  console.error(error);
  loading.classList.add('error');
  loading.querySelector('strong').textContent = '3D view unavailable';
  loadingDetail.textContent = /WebGL context/i.test(error.message)
    ? 'Open the served page in a browser with WebGL 2 enabled to explore the river.'
    : 'Serve the entire extracted folder together so the tree, textures and other assets can load.';
});
