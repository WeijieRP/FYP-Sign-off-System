import { THREE as T, GLTFLoader, MeshoptDecoder } from './vendor/three-runtime.js';
import { makeRiver } from './water.js';

export const horizon = new T.Color(0x9eacb0);
export const sunDirection = new T.Vector3(.55,.71,.44).normalize();

const models = './assets/models/';

export function seeded(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// The growth stage's tree (tree-stage.js), or the built-in Stage 4 tree when that one cannot be loaded.
async function loadTree(loader,url,builtIn) {
  if (!url) return loader.loadAsync(builtIn);
  try {
    return await loader.loadAsync(url);
  } catch (error) {
    console.warn(`The tree model ${url} could not be loaded; showing the built-in Stage 4 tree.`,error);
    const asset=await loader.loadAsync(builtIn);
    asset.scene.userData.stageFallback=true;
    return asset;
  }
}

export async function loadEnvironment(report,lowQuality,treeUrl) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  const detail=lowQuality?'-low':'';
  const files = {
    tree:'ketapang-stage-4', terrain:'river-terrain', water:'river-water',
    forest:'forest-tree', forestFar:'forest-tree-distant', grass:'river-grass',
    fern:'river-ferns', rock:'river-rock', hawk:'river-hawk', fish:'barramundi', duck:'mallard',
    mountains:'river-mountains'+detail, habitat:'forest-habitat'+detail,
    blossoms:'forest-blossoms', forestWildlife:'forest-wildlife', soil:'forest-soil',
    driftLeaves:'ketapang-drift-leaves', skyDome:'river-sky', weather:'river-weather',
  };
  const total=Object.keys(files).length;
  const parts = await Promise.all([
    ...Object.entries(files).map(async ([name, slug]) => {
      const asset = name==='tree'
        ? await loadTree(loader,treeUrl,models+slug+'.glb')
        : await loader.loadAsync(models+slug+'.glb');
      // Restore the exported display labels and reflection layers.
      asset.scene.traverse(node=>{
        if (node.userData.displayName) node.name=node.userData.displayName;
        if (node.userData.reflected) node.layers.enable(1);
      });
      if (name==='terrain') {
        const materials=asset.parser.json.materials;
        const loam=materials.findIndex(material=>material.name==='Island loam, banks and riverbed');
        const gravel=materials.findIndex(material=>material.name==='Riverbank gravel');
        [asset.scene.userData.loam,asset.scene.userData.gravel]=await Promise.all([
          asset.parser.getDependency('material',loam),asset.parser.getDependency('material',gravel),
        ]);
      }
      report(++done,total);
      return [name,asset.scene];
    }),
    fetch('./assets/layout.json').then(res => {
      if (!res.ok) throw new Error('Missing river layout');
      return res.json();
    }).then(value => ['layout',value]),
    fetch('./assets/leaf-drifts.json').then(response => {
      if (!response.ok) throw new Error('Missing leaf drift routes');
      return response.json();
    }).then(value => ['leafDrifts',value]),
  ]);
  return Object.fromEntries(parts);
}

function plantsInWind(material, clock, plantHeight, large) {
  material.onBeforeCompile = shader => {
    shader.uniforms.breezeTime=clock.time;
    shader.uniforms.breezeGust=clock.gust;
    shader.vertexShader='uniform float breezeTime,breezeGust;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 instanceOrigin=instanceMatrix[3].xz;
        float flex=pow(clamp(position.y/${plantHeight.toFixed(4)},0.,1.),1.85);
        float ripple=sin(breezeTime*1.7+dot(instanceOrigin,vec2(.122,.23)));
        float wind=(.04*ripple+breezeGust*(.08+.06*ripple))*flex;
        transformed.x+=wind*${large?'1.35':'1.0'};
        transformed.z+=(cos(breezeTime*1.32+instanceOrigin.x*.26)*.026+.064*breezeGust)*flex;
      #endif
    `);
  };
  material.customProgramCacheKey=()=>`bank-wind-${plantHeight.toFixed(4)}-${large}`;
}

function placePlant(proxy, row, sourceHeight, width) {
  const [x,y,z,height,rotation]=row;
  const scale=height/sourceHeight;
  const spread=width*(.9+.13*Math.sin(x*1.63+z*.31));
  proxy.position.set(x,y,z);
  proxy.rotation.y=rotation;
  proxy.scale.set(scale*spread,scale,scale*spread);
  proxy.updateMatrix();
}

function colouredLeaves(material) {
  const prepare=material.onBeforeCompile.bind(material);
  const program=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    prepare(shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      float leafLight=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=vec3(clamp(.24+2.65*leafLight,.24,1.34));
      #include <color_fragment>
    `);
  };
  material.customProgramCacheKey=()=>program+'|seasonal-ketapang';
}

function dampSurface(material, part, stone) {
  const prepare=material.onBeforeCompile.bind(material);
  const program=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    prepare(shader,renderer);
    shader.vertexShader='varying vec3 dampPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      dampPoint=(position-vec3(0.,${part.base.y.toFixed(5)},0.))/${part.height.toFixed(5)};
    `);
    shader.fragmentShader='varying vec3 dampPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float grain=.50+.22*sin(dampPoint.x*67.+dampPoint.y*23.)*sin(dampPoint.z*54.-dampPoint.y*31.)
        +.18*cos(dot(dampPoint,vec3(29.,43.,57.)))+.10*sin(dot(dampPoint,vec3(87.,71.,92.)));
      float moisture=${stone?'smoothstep(.18,.77,dampPoint.y)':'1.-smoothstep(.14,.36,dampPoint.y)'};
      float moss=moisture*smoothstep(.39,.71,grain);
      float lichen=smoothstep(.73,.86,grain)*(1.-moss);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.11,.174,.054)*(.75+.35*grain),moss*.72);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.31,.24),lichen*.46);
    `);
  };
  material.customProgramCacheKey=()=>program+'|damp-'+stone+'-'+part.height+'-'+part.base.y;
}

function plants(scene, source, placements, clock, options={}) {
  const {wind=false,reflect=true,far=false,tile=0,castShadow=false,width=1,
    label='',foliage=null,leafColours=null,damp=''}=options;
  source.updateMatrixWorld(true);
  const choices=[];
  for (const root of source.children) {
    const bounds=new T.Box3().setFromObject(root);
    const centre=bounds.getCenter(new T.Vector3());
    if (bounds.isEmpty()) continue;
    const meshes=[];
    root.traverse(child => {
      if (child.isMesh) meshes.push(child);
    });
    choices.push({height:bounds.max.y-bounds.min.y,base:new T.Vector3(centre.x,bounds.min.y,centre.z),meshes});
  }
  const proxy=new T.Object3D(), matrix=new T.Matrix4(), corrected=new T.Matrix4();
  const colour=new T.Color();
  choices.forEach((part,variant) => {
    const rows=placements.filter((_,i)=>i%choices.length===variant);
    if (!rows.length) return;
    const tiles=new Map();
    for (const row of rows) {
      const key=tile?`${Math.floor(row[0]/tile)},${Math.floor(row[2]/tile)}`:'all';
      if (!tiles.has(key)) tiles.set(key,[]);
      tiles.get(key).push(row);
    }
    for (const child of part.meshes) {
      const mat=child.material.clone();
      const leafy=mat.alphaTest>0;
      if (wind && (mat.alphaTest || !far)) plantsInWind(mat,clock,part.height,far);
      if (leafy && leafColours) colouredLeaves(mat);
      if (!leafy && damp) dampSurface(mat,part,damp==='stone');
      if (mat.map) mat.map.anisotropy=2;
      corrected.makeTranslation(-part.base.x,-part.base.y,-part.base.z).multiply(child.matrixWorld);
      for (const tileRows of tiles.values()) {
        const batch=new T.InstancedMesh(child.geometry,mat,tileRows.length);
        batch.name=(label||child.name)+' instances';
        tileRows.forEach((row,i) => {
          placePlant(proxy,row,part.height,width);
          batch.setMatrixAt(i,matrix.multiplyMatrices(proxy.matrix,corrected));
          const shade=row[5]*(far?.95:1);
          colour.setRGB(shade,shade*(.99+.04*Math.sin(i)),shade*.96);
          if (leafy) {
            if (leafColours?.[row[6]]) colour.copy(leafColours[row[6]]).multiplyScalar(shade);
            else if (foliage) colour.multiply(foliage);
          }
          batch.setColorAt(i,colour);
        });
        batch.computeBoundingSphere();
        batch.castShadow=castShadow;
        batch.receiveShadow=!far;
        if (reflect) batch.layers.enable(1);
        scene.add(batch);
      }
    }
  });
}

function blossoms(scene,source,model,rows,grove,lowQuality) {
  if (!rows.length) return;
  const bounds=new T.Box3().setFromObject(source);
  const base=bounds.getCenter(new T.Vector3()).setY(bounds.min.y);
  const height=bounds.max.y-bounds.min.y;
  const crowns=[];
  source.traverse(node=>{if (node.isMesh && node.material.alphaTest>0) crowns.push(node);});
  if (!crowns.length) return;

  const random=seeded(grove.seed);
  const bunches=lowQuality?10:18, flowers=5;
  const bloom=model.getObjectByName(grove.name+' blossom');
  const batch=new T.InstancedMesh(bloom.geometry,bloom.material,rows.length*bunches*flowers);
  batch.name=grove.name+' flower bunches';
  batch.layers.enable(1);
  const tree=new T.Object3D(), flower=new T.Object3D(), centre=new T.Vector3();
  const outward=new T.Vector3(), shade=new T.Color();
  let index=0;
  for (const row of rows) {
    placePlant(tree,row,height,grove.width);
    for (let i=0;i<bunches;i++) {
      const crown=crowns[Math.floor(random()*crowns.length)], points=crown.geometry.attributes.position;
      for (let attempt=0;attempt<24;attempt++) {
        centre.fromBufferAttribute(points,Math.floor(random()*points.count)).applyMatrix4(crown.matrixWorld);
        if (centre.y>base.y+height*.60) break;
      }
      centre.sub(base).applyMatrix4(tree.matrix);
      outward.set(centre.x-row[0],.6,centre.z-row[2]).normalize();
      centre.addScaledVector(outward,.18);
      for (let j=0;j<flowers;j++) {
        flower.position.copy(centre);
        flower.position.x+=(random()-.5)*.62;
        flower.position.y+=random()*.32;
        flower.position.z+=(random()-.5)*.62;
        flower.rotation.set((random()-.5)*1.3,random()*Math.PI*2,(random()-.5)*1.3);
        flower.scale.setScalar(grove.size*(.78+random()*.55));
        flower.updateMatrix();
        batch.setMatrixAt(index,flower.matrix);
        batch.setColorAt(index,shade.setScalar(.78+random()*.22));
        index++;
      }
    }
  }
  batch.computeBoundingSphere();
  scene.add(batch);
}

export function addLandscape(scene, assets, clock, lowQuality) {
  const {layout,terrain}=assets;
  const {loam,gravel}=terrain.userData;
  const {map:soilMap,normalMap:soilNormal}=loam;
  const {map:gravelMap,normalMap:gravelNormal}=gravel;

  terrain.traverse(child=>{
    if (!child.isMesh) return;
    child.receiveShadow=true;
    child.layers.enable(1);
    const scale=child.material.name===gravel.name?1/1.42:1;
    child.material.customProgramCacheKey=()=> 'river-terrain-'+scale;
    child.material.onBeforeCompile=shader=>{
      shader.uniforms.bankLoam={value:soilMap};
      shader.uniforms.bankLoamNormal={value:soilNormal};
      shader.uniforms.bankGravel={value:gravelMap};
      shader.uniforms.bankNormal={value:gravelNormal};
      shader.uniforms.groundUvScale={value:scale};
      shader.vertexShader='varying float bankHeight;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        bankHeight=(modelMatrix*vec4(position,1.)).y;
      `);
      shader.fragmentShader='uniform sampler2D bankLoam,bankLoamNormal,bankGravel,bankNormal;\n'
        +'uniform float groundUvScale;\nvarying float bankHeight;\n'+shader.fragmentShader
        .replace('#include <map_fragment>',`
          #ifdef USE_MAP
            vec2 groundUv=vMapUv*groundUvScale;
            vec3 loam=texture2D(bankLoam,groundUv).rgb;
            vec3 pebbles=texture2D(bankGravel,groundUv*1.42).rgb;
            float fineGrain=mix(.47,.89,smoothstep(.04,.48,dot(loam,vec3(.27,.62,.11))));
            vec3 forestDetail=fineGrain*vec3(.83,1.03,.82);
            vec3 soil=mix(loam*1.17,forestDetail,smoothstep(1.13,3.6,bankHeight));
            diffuseColor.rgb*=mix(pebbles*.99,soil,smoothstep(.03,1.03,bankHeight));
          #endif
        `)
        .replace('#include <normal_fragment_maps>',`
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec2 groundNormalUv=vNormalMapUv*groundUvScale;
            vec3 bump=mix(texture2D(bankNormal,groundNormalUv*1.42).xyz,
                          texture2D(bankLoamNormal,groundNormalUv).xyz,smoothstep(.03,1.03,bankHeight));
            bump=bump*2.-1.;
            bump.xy*=normalScale;
            normal=normalize(tbn*bump);
          #else
            #include <normal_fragment_maps>
          #endif
        `);
    };
  });
  scene.add(terrain);
  scene.add(assets.mountains);

  const near=layout.forest.filter(row=>Math.hypot(row[0],row[2])<98);
  const mid=layout.forest.filter(row=>Math.hypot(row[0],row[2])>=98);
  const far=layout.forestFar.filter((_,i)=>lowQuality?i%3===0:i%3!==1);
  const bank={wind:true,far:true,tile:64,damp:'bark'};
  const leafColours={
    'red-ketapang':new T.Color(0xc94943),
    'copper-ketapang':new T.Color(0xdf893d),
  };
  const seasonal=row=>Object.hasOwn(leafColours,row[6]);
  const green=near.filter(row=>!row[6]);
  plants(scene,assets.forest,lowQuality?green.filter((_,i)=>i%2===0):green,clock,{...bank,label:'Green riverbank trees'});
  plants(scene,assets.forest,near.filter(seasonal),clock,{...bank,label:'Red and copper Ketapang',leafColours});
  for (const grove of [
    {species:'yellow-flame',name:'Yellow Flame',foliage:[1.06,1.00,.78],width:1.14,size:.22,seed:23019},
    {species:'trumpet-tree',name:'Trumpet Tree',foliage:[.88,.96,.87],width:.91,size:.26,seed:57147},
  ]) {
    const trees=near.filter(row=>row[6]===grove.species);
    plants(scene,assets.forest,trees,clock,{...bank,width:grove.width,label:grove.name+' grove',
      foliage:new T.Color().setRGB(...grove.foliage)});
    blossoms(scene,assets.forest,assets.blossoms,trees,grove,lowQuality);
  }
  const distant=[...mid,...far];
  const distantBank={reflect:false,far:true,tile:88};
  plants(scene,assets.forestFar,distant.filter(row=>!seasonal(row)),clock,{...distantBank,label:'Distant green trees'});
  plants(scene,assets.forestFar,distant.filter(seasonal),clock,{...distantBank,label:'Distant red and copper trees',leafColours});
  const shrubs=layout.shrubs??[];
  plants(scene,assets.forestFar,lowQuality?shrubs.filter((_,i)=>i%2===0):shrubs,clock,
    {...bank,width:1.86,label:'Riverbank shrubs',foliage:new T.Color().setRGB(.82,1.02,.83)});
  assets.grass.traverse(node=>{
    if (!node.isMesh) return;
    node.material.color.setRGB(.61,1.07,.53);
    node.material.alphaTest=.27;
  });
  plants(scene,assets.grass,lowQuality?layout.grass.filter((_,i)=>i%2===0):layout.grass,clock,{wind:true,reflect:false,tile:25,width:1.62});
  plants(scene,assets.fern,layout.ferns,clock,{wind:true,reflect:false,tile:25});
  plants(scene,assets.rock,layout.rocks,clock,{tile:30,castShadow:true});
  const habitat=layout.habitat;
  const detail=rows=>lowQuality?rows.filter((_,i)=>i%2===0):rows;
  plants(scene,assets.forest,detail(habitat.understory),clock,
    {...bank,width:.86,label:'Forest understory trees',foliage:new T.Color().setRGB(.86,.96,.86)});
  plants(scene,assets.forestFar,detail(habitat.shrubs),clock,
    {...bank,width:1.79,label:'Woody understory shrubs',foliage:new T.Color().setRGB(.82,.99,.89)});
  plants(scene,assets.fern,detail(habitat.ferns),clock,
    {wind:true,reflect:false,tile:28,label:'Forest-floor ferns'});
  plants(scene,assets.rock,detail(habitat.stones),clock,
    {tile:28,damp:'stone',label:'Moss and lichen covered stones'});
  return makeRiver(scene,assets.water,clock,layout.rocks,lowQuality,horizon);
}
