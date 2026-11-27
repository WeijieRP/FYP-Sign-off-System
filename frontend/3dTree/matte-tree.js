import { THREE as T } from './vendor/three-runtime.js';

function leafWind(material,clock) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.leafTime=clock.time;
    shader.uniforms.leafGust=clock.gust;
    shader.vertexShader='uniform float leafTime,leafGust;\n'
      +shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        float reach=smoothstep(2.,13.,position.y);
        float breeze=sin(leafTime*1.7+position.x*.84+position.z*.62);
        transformed.x+=reach*breeze*(.024+.05*leafGust);
        transformed.y+=reach*.012*sin(leafTime*5.2+position.x*2.2);
      `);
  };
}

// The tree in the light of the time of day, as the river and the forest are (its materials take no lighting
// of their own, so without this it stays in daylight at night): cool moonlight at night, warmer at dusk, a
// little duller in rain. clock.treeShade (1 by default) sets how much; the glowing look (glow-look.js) lights
// the tree itself and sets it to 0. Applied last, over the growing foliage's colours (tree-growth.js).
function timeOfDay(material,clock) {
  const before=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    before?.call(material,shader,renderer);
    Object.assign(shader.uniforms,{treeNight:clock.night,treeDusk:clock.dusk,treeRain:clock.rain,treeShade:clock.treeShade});
    shader.fragmentShader='uniform float treeNight,treeDusk,treeRain,treeShade;\n'
      +shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 treeLight=mix(vec3(1.),vec3(.28,.33,.45),treeNight);
        treeLight*=mix(vec3(1.),vec3(1.,.78,.62),treeDusk*(1.-treeNight)*.45);
        treeLight*=1.-.18*treeRain*(1.-treeNight);
        outgoingLight*=mix(vec3(1.),treeLight,treeShade);
        #include <opaque_fragment>`);
  };
}

export function addMatteTree(scene,tree,clock,stage=4) {
  clock.treeShade??={value:1};
  tree.name=stage>=4?'Ketapang | fully grown Stage 4':`Ketapang | growing, Stage ${stage}`;
  tree.position.y=clock.soil.value;
  const materials=new Map();
  function matte(source) {
    if (materials.has(source)) return materials.get(source);
    const material=new T.MeshBasicMaterial({
      name:source.name,color:source.color,map:source.map,alphaMap:source.alphaMap,
      alphaTest:source.alphaTest,side:source.side,vertexColors:source.vertexColors,
      opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite,
      toneMapped:false,
    });
    if (source.alphaTest>0) leafWind(material,clock);
    timeOfDay(material,clock);
    materials.set(source,material);
    return material;
  }
  tree.traverse(object=>{
    if (!object.isMesh) return;
    object.layers.disable(1);
    object.castShadow=false;
    object.receiveShadow=false;
    object.material=Array.isArray(object.material)?object.material.map(matte):matte(object.material);
  });
  scene.add(tree);
  return tree;
}

