// The glowing look of the 3D ESG Tree, as in the ESG Centre's glowing-tree concept: the river valley at
// night, with the tree lit from within.
//   - the scene is held at night (after the weather's own update every frame, so live weather, rain and the
//     admin's sky settings never brighten it), in a cool moonlight;
//   - everything glows in the three ESG colours, green (Environmental), blue (Social) and orange
//     (Governance):
//   - streams of green, blue and orange light run along all the wood, up the trunk, out along every branch
//     and along the roots, with pulses of light travelling out along them, each a bright line in a soft
//     halo of its colour (BARK_GLOW); the admin turns them on or off and sets how thick and bright they are
//     (3D Scene Controls > Look: "Trunk glow", tree3dParameters.trunkGlow, trunkGlowStrength; setTrunkGlow);
//   - the tree's own leaves glow, each leaf in its own vivid colour, green, blue or orange, lit from within
//     with a bright edge and glowing veins, and now and then one twinkles;
//   - rings of light lie on the ground round the base of the tree, a pulse of light spreading out across them;
//   - their light spills round them in a soft glow (a bloom, createBloom).
// The feedback leaves glow green, blue or orange by their visitor's badge, a VIP's gold with a star of light at
// its tip (feedback-leaves.js). The admin turns the look on or off in
// 3D Tree Settings ("Glowing look", tree3dParameters.glowLook, on by default); ?look=natural or ?look=glow in
// the page address fixes one (to try it out).
import { THREE as T } from './vendor/three-runtime.js';
import { sprigsOf } from './tree-growth.js';

const BARK_DIM = 0.4;            // how much of the bark's own colour shows under its light streams
const STREAM_WIDTH = 0.032;      // how wide a stream of light is, as a share of the way round the wood (at 100%)
const STREAM_HALO = 3.2;         // its soft halo, this many times as wide
// Softer than at first, so the tree is not glaring: every stream at STREAM_LEVEL of its first brightness. Out
// towards the canopy's ends, all round the tree, the branches split into hundreds of thin twigs, each with its
// streams, whose soft halos together glowed as a bright haze: from OUTER_FADE[0] metres out from the trunk to
// OUTER_FADE[1], each stream keeps its line of light (OUTER_LINES of it) but its halo fades to OUTER_HALOS, so
// every side of the tree still shows its light streams, without the haze.
const STREAM_LEVEL = 0.75;
const OUTER_FADE = [3.5, 9];
const OUTER_LINES = 0.7;
const OUTER_HALOS = 0.3;
const LEAF_LEVEL = 0.7;          // the tree's own glowing leaves, as a share of their first brightness
const TRUNK_GLOW_FADE = 0.8;     // seconds the streams take to fade in or out when turned on or off

// Whether to show the glowing look: from the page address if it names one (fixed), otherwise the admin's
// setting; the glowing look if the settings cannot be read.
export async function startingLook() {
  const fromAddress = new URLSearchParams(location.search).get('look');
  if (fromAddress === 'natural' || fromAddress === 'glow') return { glow: fromAddress === 'glow', fixed: true };
  try {
    const response = await fetch('/api/parameters', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && data.success) return { glow: data.parameters?.tree3dParameters?.glowLook !== false, fixed: false };
  } catch (error) {
    console.warn('The 3D look setting could not be read; showing the glowing look.', error);
  }
  return { glow: true, fixed: false };
}

const GLOW_COMMON = /* glsl */`
uniform float glowTime;
uniform float trunkGlowOn;
uniform float trunkGlowStrength;
uniform vec3 glowCentre;
varying vec3 vGlowPos;
float glowHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
`;

// A stream of light: a thin line at a place round the wood (x, the texture's u, which goes round each trunk,
// branch and root: 0 to 1 is once round), smooth at any distance (at least about a pixel wide, from fwidth);
// on wood too thin or far to show it (px large), it fades out rather than fill the wood.
// Its halo: a soft glow of the line's colour, fading out to either side of it (STREAM_HALO times as wide).
const BARK_COMMON = /* glsl */`
varying vec2 vGlowUv;
float glowStream( float x, float centre, float px, float wide ) {
  float off = abs( fract( x - centre + .5 ) - .5 );
  float width = max( wide, px * .9 );
  return ( 1. - smoothstep( width, width + px * 1.5, off ) ) * smoothstep( .3, .12, px );
}
float glowHalo( float x, float centre, float px, float wide ) {
  // (No wider than at 125%, so the three halos never run together and wash the wood out.)
  float off = abs( fract( x - centre + .5 ) - .5 ) / max( min( wide, ${(STREAM_WIDTH * 1.25).toFixed(3)} ) * ${STREAM_HALO.toFixed(1)}, px * 2. );
  return exp( -off * off * 2.2 ) * smoothstep( .3, .12, px );
}
`;

// Streams of light running along all the wood, in the three ESG colours: an orange, a blue and a green line
// at their own places round every trunk, branch and root (the model's texture u goes round each of them and
// its v along it, so lines at fixed u follow each one, whichever way it grows), winding gently, with pulses
// travelling along them, out from the trunk ("along": up the trunk and out from it).
const BARK_GLOW = /* glsl */`
  vec3 fromTrunk = vGlowPos - glowCentre;
  float along = max( fromTrunk.y, 0. ) + length( fromTrunk.xz ) * .8;
  float around = vGlowUv.x + .03 * sin( vGlowUv.y * 2.3 );
  float px = fwidth( around );
  float wide = ${STREAM_WIDTH.toFixed(3)} * trunkGlowStrength;   // thicker (and brighter) with the admin's strength
  float bright = .8 + .2 * trunkGlowStrength;
  float orangeLine = glowStream( around, .08, px, wide ), orangeHalo = glowHalo( around, .08, px, wide );
  float blueLine = glowStream( around, .42, px, wide ), blueHalo = glowHalo( around, .42, px, wide );
  float greenLine = glowStream( around, .75, px, wide ), greenHalo = glowHalo( around, .75, px, wide );
  float orangePulse = pow( fract( along * .085 - glowTime * .2 ), 5. );
  float bluePulse = pow( fract( along * .07 - glowTime * .27 + .5 ), 5. );
  float greenPulse = pow( fract( along * .078 - glowTime * .23 + .25 ), 5. );
  float outer = smoothstep( ${OUTER_FADE[0].toFixed(1)}, ${OUTER_FADE[1].toFixed(1)}, length( fromTrunk.xz ) ); // 1 out on the twigs
  float lineLevel = ${STREAM_LEVEL.toFixed(2)} * mix( 1., ${OUTER_LINES.toFixed(2)}, outer );
  float haloLevel = ${STREAM_LEVEL.toFixed(2)} * mix( 1., ${OUTER_HALOS.toFixed(2)}, outer );
  vec3 streams = vec3( 1., .5, .1 ) * ( orangeLine * ( .5 + 2.4 * orangePulse ) * lineLevel + orangeHalo * ( .28 + .7 * orangePulse ) * haloLevel )
    + vec3( .2, .6, 1. ) * ( blueLine * ( .45 + 2.2 * bluePulse ) * lineLevel + blueHalo * ( .26 + .65 * bluePulse ) * haloLevel )
    + vec3( .25, 1., .35 ) * ( greenLine * ( .45 + 2.2 * greenPulse ) * lineLevel + greenHalo * ( .26 + .65 * greenPulse ) * haloLevel );
  // Off (the admin's Trunk glow), the bark shows as it is, in the moonlight.
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ${BARK_DIM.toFixed(2)} + streams * 1.5 * bright, trunkGlowOn );
`;

// The tree's own leaves, glowing: each leaf in its own vivid colour, green, blue or orange (LEAF_SHARES of
// the leaves green and blue, the rest orange), chosen by the leaf's own random number (leafPick, pickLeaves),
// lit from within: glowing through, brighter towards its edge, its veins glowing, and now and then one
// twinkles. The bloom (createBloom) spreads their light round them.
const LEAF_SHARES = [0.45, 0.3];
const LEAF_GLOW = /* glsl */`
#ifdef USE_MAP
  vec3 hue = vLeafPick < ${LEAF_SHARES[0].toFixed(2)} ? vec3( .08, 1., .16 )
    : vLeafPick < ${(LEAF_SHARES[0] + LEAF_SHARES[1]).toFixed(2)} ? vec3( .04, .36, 1. ) : vec3( 1., .42, .04 );
  const vec3 leafLuma = vec3( .3, .59, .11 );
  float shade = dot( diffuseColor.rgb, leafLuma );
  float edge = 1. - texture2D( map, vMapUv, 2. ).a;
  float veinPoint = dot( texture2D( map, vMapUv, -.5 ).rgb, leafLuma );
  float veinAround = dot( texture2D( map, vMapUv, 2.5 ).rgb, leafLuma );
  float vein = smoothstep( .03, .14, ( veinPoint - veinAround ) / max( veinAround, .05 ) );
  float twinkle = step( .965, fract( vLeafPick * 173.1 ) ) * pow( max( 0., sin( glowTime * 1.7 + vLeafPick * 60. ) ), 24. );
  diffuseColor.rgb = ( hue * ( .18 + .75 * shade + .9 * edge ) + mix( hue, vec3( 1. ), .4 ) * ( .45 * vein + 1.5 * twinkle ) )
    * ${LEAF_LEVEL.toFixed(2)}; // softer than at first (LEAF_LEVEL)
#endif
`;

// Every leaf's own random number from 0 to 1 (leafPick, the same at all of a leaf's corners: a leaf is one
// connected piece of the foliage, tree-growth.js sprigsOf), for its colour and its twinkle.
function pickLeaves(geometry) {
  if (!geometry?.attributes.position || geometry.attributes.leafPick) return;
  const { sprig, sprigs } = sprigsOf(geometry);
  const random = new Float32Array(sprigs);
  for (let s = 0; s < sprigs; s++) {
    const x = Math.sin((s + 1) * 12.9898 + 78.233) * 43758.5453;
    random[s] = x - Math.floor(x);
  }
  const pick = new Float32Array(sprig.length);
  for (let i = 0; i < sprig.length; i++) pick[i] = random[sprig[i]];
  geometry.setAttribute('leafPick', new T.BufferAttribute(pick, 1));
}

function glowMaterial(material, uniforms, done) {
  if (!material || done.has(material)) return;
  done.add(material);
  const leaf = material.alphaTest > 0;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer); // the leaves' wind (matte-tree.js)
    Object.assign(shader.uniforms, uniforms);
    // Where on the tree, as at its full size (glowUnscale), so its colours hold still while it grows; and a
    // leaf's own random number (leafPick, pickLeaves).
    shader.vertexShader = `uniform vec3 glowCentre;\nuniform float glowUnscale;\nvarying vec3 vGlowPos;\n${leaf ? 'attribute float leafPick;\nvarying float vLeafPick;\n' : 'varying vec2 vGlowUv;\n'}`
      + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n'
        + '  vGlowPos = glowCentre + ( ( modelMatrix * vec4( transformed, 1. ) ).xyz - glowCentre ) * glowUnscale;'
        + (leaf ? '\n  vLeafPick = leafPick;' : '\n  vGlowUv = uv;'));
    shader.fragmentShader = GLOW_COMMON + (leaf ? 'varying float vLeafPick;\n' : BARK_COMMON) + shader.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>\n${leaf ? LEAF_GLOW : BARK_GLOW}`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|glow-${leaf ? 'leaf' : 'bark-streams'}`;
  material.needsUpdate = true;
}

// Rings of light on the ground round the tree, with a pulse spreading out across them.
function platform(clock, centre, radius) {
  const material = new T.ShaderMaterial({
    name: 'Glowing rings round the tree',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { glowTime: clock.time },
    vertexShader: /* glsl */`
      varying vec2 ringUv;
      void main() { ringUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1. ); }`,
    fragmentShader: /* glsl */`
      uniform float glowTime;
      varying vec2 ringUv;
      float ring( float r, float at, float width ) { return exp( -pow( ( r - at ) / width, 2. ) ); }
      void main() {
        vec2 p = ringUv * 2. - 1.;
        float r = length( p );
        float a = atan( p.y, p.x ) / 6.2832 + .5;
        float dashes = step( .55, fract( a * 36. + glowTime * .04 ) ) * ring( r, .86, .007 );
        float pulse = ring( r, fract( glowTime * .16 ) * .98, .025 ) * ( 1. - r );
        // The three ESG colours: a blue ring, an orange ring and an outer green ring with its dashes.
        vec3 blue = vec3( .25, .65, 1. ), orange = vec3( 1., .52, .14 ), green = vec3( .3, 1., .4 );
        vec3 light = blue * ( 1.3 * ring( r, .64, .01 ) + .9 * pulse )
          + orange * ( 1.2 * ring( r, .78, .008 ) + .35 * ring( r, .5, .006 ) )
          + green * ( .95 * ring( r, .97, .009 ) + .8 * dashes )
          + vec3( .18, .42, .85 ) * .16 * smoothstep( 1., .25, r );
        gl_FragColor = vec4( light * smoothstep( 1., .985, r ), 1. );
      }`,
  });
  const mesh = new T.Mesh(new T.CircleGeometry(radius, 160), material);
  mesh.name = 'Glowing rings round the tree';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centre.x, centre.y + 0.06, centre.z);
  mesh.renderOrder = 1;
  return mesh;
}

// The glow round everything that lights itself (a bloom, as the light of the glowing-tree concept spills round
// its leaves): the things on GLOW_LAYER (the tree's leaves and light streams, the rings, and the feedback
// leaves, feedback-leaves.js) are drawn again, small (BLOOM_SCALE of the screen), on black; what is brighter
// than BLOOM_THRESHOLD is blurred (two rounds, the second wider) and added onto the frame.
export const GLOW_LAYER = 4;
const BLOOM_SCALE = 1 / 3;
const BLOOM_THRESHOLD = 0.24;
const BLOOM_STRENGTH = 0.55;     // (0.7 at first: the glow round the lit things a little softer)
function createBloom(renderer) {
  const target = () => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
  const glowing = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType });
  const blurA = target(), blurB = target();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new T.Scene();
  quadScene.add(quad);
  const vertexShader = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0., 1. ); }';
  const blur = new T.ShaderMaterial({
    uniforms: { source: { value: null }, step: { value: new T.Vector2() }, threshold: { value: 0 } },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform sampler2D source;
      uniform vec2 step;
      uniform float threshold;
      varying vec2 vUv;
      vec3 sampleAt( vec2 uv ) { return max( texture2D( source, uv ).rgb - threshold, 0. ); }
      void main() {
        vec3 sum = sampleAt( vUv ) * .2270;
        sum += ( sampleAt( vUv + step * 1.3846 ) + sampleAt( vUv - step * 1.3846 ) ) * .3162;
        sum += ( sampleAt( vUv + step * 3.2308 ) + sampleAt( vUv - step * 3.2308 ) ) * .0703;
        gl_FragColor = vec4( sum, 1. );
      }`,
    depthTest: false, depthWrite: false,
  });
  const add = new T.ShaderMaterial({
    uniforms: { glow: { value: null }, strength: { value: BLOOM_STRENGTH } },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform sampler2D glow;
      uniform float strength;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4( pow( texture2D( glow, vUv ).rgb * strength, vec3( 1. / 2.2 ) ), 1. ); }`,
    blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
  });
  const size = new T.Vector2(), clearColour = new T.Color();
  const pass = (material, source, destination, x, y, threshold = 0) => {
    material.uniforms.source.value = source.texture;
    material.uniforms.step.value.set(x / source.width, y / source.height);
    material.uniforms.threshold.value = threshold;
    quad.material = material;
    renderer.setRenderTarget(destination);
    renderer.render(quadScene, camera);
  };
  return (scene, sceneCamera) => {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, Math.round(size.x * BLOOM_SCALE)), height = Math.max(1, Math.round(size.y * BLOOM_SCALE));
    if (glowing.width !== width || glowing.height !== height) [glowing, blurA, blurB].forEach(t => t.setSize(width, height));
    // The glowing things only, on black.
    const layers = sceneCamera.layers.mask, background = scene.background, autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColour);
    sceneCamera.layers.set(GLOW_LAYER);
    scene.background = null;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(glowing);
    renderer.clear();
    renderer.render(scene, sceneCamera);
    sceneCamera.layers.mask = layers;
    scene.background = background;
    renderer.setClearColor(clearColour, clearAlpha);
    // Blurred: the bright parts, then wider.
    pass(blur, glowing, blurA, 1, 0, BLOOM_THRESHOLD);
    pass(blur, blurA, blurB, 0, 1);
    pass(blur, blurB, blurA, 2.2, 0);
    pass(blur, blurA, blurB, 0, 2.2);
    // Added onto the frame on screen.
    add.uniforms.glow.value = blurB.texture;
    quad.material = add;
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.render(quadScene, camera);
    renderer.autoClear = autoClear;
  };
}

// addTree(tree): the next stage's tree, made to glow before it is shown (scene.js); update(tree) takes the
// tree shown now; afterRender(camera), after each frame is drawn, adds the glow round the lit things (bloom).
export function addGlowLook({ scene, renderer, tree, clock, lights }) {
  tree.updateMatrixWorld(true);
  const base = new T.Vector3().setFromMatrixPosition(tree.matrixWorld);
  const uniforms = { glowTime: clock.time, glowCentre: { value: base }, glowUnscale: { value: 1 },
    trunkGlowOn: { value: 1 }, trunkGlowStrength: { value: 1 } };
  let trunkGlowWanted = 1, lastUpdate = performance.now();
  const done = new Set();
  const addTree = next => next.traverse(object => {
    if (!object.isMesh) return;
    object.layers.enable(GLOW_LAYER); // its leaves and light streams glow (bloom)
    if ([object.material].flat().some(material => material?.alphaTest > 0)) pickLeaves(object.geometry);
    for (const material of [object.material].flat()) {
      glowMaterial(material, uniforms, done);
    }
  });
  addTree(tree);

  const wood = new T.Box3().setFromObject(tree);
  const reach = Math.max(4.5, Math.min(9, Math.max(wood.max.x - wood.min.x, wood.max.z - wood.min.z) * 0.32));
  const rings = platform(clock, base, reach);
  rings.layers.enable(GLOW_LAYER);
  scene.add(rings);
  const bloom = createBloom(renderer);

  return {
    addTree,
    afterRender: camera => bloom(scene, camera),
    // The admin's Trunk glow: on or off (fading over TRUNK_GLOW_FADE) and its strength (0.5 to 2: thinner and
    // dimmer to thicker and brighter streams).
    setTrunkGlow({ on = true, strength = 1 } = {}) {
      trunkGlowWanted = on ? 1 : 0;
      uniforms.trunkGlowStrength.value = Math.max(0.5, Math.min(2, Number(strength) || 1));
    },
    // After the weather's update: night, in cool moonlight, whatever the weather or the time of day.
    update(shown = tree) {
      uniforms.glowUnscale.value = 1 / Math.max(0.05, shown.scale.x); // a tree growing into its next stage
      const time = performance.now(), step = Math.min(0.1, (time - lastUpdate) / 1000);
      lastUpdate = time;
      const on = uniforms.trunkGlowOn;
      on.value += Math.sign(trunkGlowWanted - on.value) * Math.min(Math.abs(trunkGlowWanted - on.value), step / TRUNK_GLOW_FADE);
      if (clock.treeShade) clock.treeShade.value = 0; // the tree lights itself (matte-tree.js timeOfDay)
      clock.night.value = 1;
      clock.dusk.value = 0;
      lights.sun.intensity = 0.28;
      lights.sun.color.set(0x8fb2ff);
      lights.hemi.intensity = 0.5;
      lights.hemi.color.set(0x2c4378);
      lights.hemi.groundColor.set(0x0a1020);
      lights.fill.intensity = 0.2;
      lights.fill.color.set(0x6fa6ff);
      lights.rim.intensity = 0.35;
      lights.rim.color.set(0xffc27a);
      renderer.toneMappingExposure = 1;
    },
  };
}
