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

export function addMatteTree(scene,tree,clock,stage=4) {
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

