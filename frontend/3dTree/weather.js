import { THREE as T } from './vendor/three-runtime.js';
import { createStorm } from './storm.js';

const skyFadeSeconds = 16;
const sunsetSeconds = 42;

const skyVertex = /* glsl */`
  varying vec3 skyRay;
  void main() {
    skyRay=position;
    vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
    gl_Position=clip.xyww;
  }
`;
const skyFragment = /* glsl */`
  uniform sampler2D skyPhoto;
  uniform float nightAmount,rainAmount,time,lightningAmount,duskAmount,cloudAmount,dawnAmount;
  uniform vec3 sunDirection,dawnDirection,moonDirection;
  varying vec3 skyRay;
  float hash21(vec2 p) {
    p=fract(p*vec2(123.34,456.21));
    p+=dot(p,p+45.32);
    return fract(p.x*p.y);
  }
  void main() {
    vec3 ray=normalize(skyRay);
    vec2 turn=mat2(.8253356,-.5646425,.5646425,.8253356)*ray.xz;
    vec2 uv=vec2(atan(turn.y,turn.x)*.159154943+.5,asin(clamp(ray.y,-1.,1.))*.318309886+.5);
    vec3 lowCloud=texture2D(skyPhoto,vec2(fract(uv.x-time*.00195),uv.y)).rgb;
    vec3 highCloud=texture2D(skyPhoto,vec2(fract(uv.x+.16-time*.00067),uv.y*.92+.045)).rgb;
    const vec3 luma=vec3(.2126,.7152,.0722);
    float lower=smoothstep(.23-.15*cloudAmount,.70-.13*cloudAmount,dot(lowCloud,luma));
    float higher=smoothstep(.32-.08*cloudAmount,.75-.09*cloudAmount,dot(highCloud,luma));
    float cloud=1.-(1.-lower*.85)*(1.-higher*.51);
    float height=pow(max(0.,ray.y),.52);
    vec3 daylight=mix(vec3(.19,.43,.70),vec3(.025,.13,.43),height);
    daylight=mix(daylight,vec3(.90,.94,.98),cloud*.68);
    float west=max(dot(ray,sunDirection),0.);
    float east=max(dot(ray,dawnDirection),0.);
    float sunGlow=mix(pow(west,90.),pow(east,90.),dawnAmount);
    daylight+=vec3(.55,.40,.21)*sunGlow;

    vec3 horizon=mix(vec3(.47,.15,.072),vec3(.46,.21,.14),dawnAmount);
    vec3 sunset=mix(horizon,vec3(.072,.061,.18),height);
    sunset+=vec3(.84,.31,.08)*mix(pow(west,27.),pow(east,27.),dawnAmount);
    sunset=mix(sunset,vec3(.51,.23,.19),cloud*.48);
    float sunDisk=mix(smoothstep(.99973,.99982,west),smoothstep(.99973,.99982,east),dawnAmount)
      *smoothstep(-.13,-.06,sunDirection.y);
    sunset+=vec3(3.2,1.42,.34)*sunDisk*(1.-cloud*.55);
    daylight=mix(daylight,sunset,duskAmount);
    vec3 wetSky=mix(vec3(.055,.081,.115),vec3(.27,.32,.37),cloud);
    wetSky=mix(wetSky,vec3(.19,.24,.29),(1.-height)*.25);
    vec3 evening=mix(vec3(.022,.039,.071),vec3(.005,.011,.029),height);
    vec2 starsUV=uv*vec2(1800.,900.);
    float starSeed=hash21(floor(starsUV));
    float star=step(.9986,starSeed)*pow(max(0.,1.-length(fract(starsUV)-.5)*2.2),5.);
    star*=smoothstep(.005,.24,ray.y)*(.78+.22*sin(time*.8+starSeed*180.));
    evening+=vec3(.61,.73,.95)*star*(1.-.80*cloud);
    float facing=max(dot(ray,moonDirection),0.);
    vec3 moonlitCloud=vec3(.046,.073,.117)+vec3(.068,.088,.105)*pow(facing,10.);
    evening=mix(evening,moonlitCloud,cloud*.76);
    float moon=smoothstep(.99962,.99986,facing);
    evening+=vec3(.51,.64,.85)*moon+vec3(.07,.11,.18)*pow(facing,190.);
    vec3 colour=mix(daylight,evening,nightAmount);
    wetSky=mix(wetSky,vec3(.017,.028,.048)+cloud*vec3(.033,.050,.073),nightAmount);
    colour=mix(colour,wetSky,rainAmount*.76);
    colour+=vec3(.39,.49,.70)*lightningAmount*(.4+.6*cloud);
    gl_FragColor=vec4(colour,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const rainVertex = /* glsl */`
  uniform float time;
  uniform float dropOpacity;
  uniform vec3 rainOrigin;
  varying float rainFade;
  void main() {
    vec3 origin=instanceMatrix[3].xyz;
    float dropSpeed=13.+fract(sin(dot(origin.xz,vec2(12.9898,78.233)))*43758.5453)*11.;
    vec3 point=position;
    point.y*=.75+dropSpeed*.03;
    point.x-=point.y*.13;
    point.xz+=origin.xz;
    point.y+=mod(origin.y-time*dropSpeed,48.);
    point+=rainOrigin;
    vec4 viewPoint=viewMatrix*vec4(point,1.);
    rainFade=dropOpacity*(1.-smoothstep(22.,108.,-viewPoint.z));
    gl_Position=projectionMatrix*viewPoint;
  }
`;
const rainFragment = /* glsl */`
  uniform float rainAmount,lightningAmount;
  uniform vec3 dropColour;
  varying float rainFade;
  void main() {
    gl_FragColor=vec4(dropColour+lightningAmount*.45,rainFade*rainAmount);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeRain(scene,model,clock,lowQuality) {
  const count=lowQuality?550:1800;
  let seed=59317;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
  const {geometry,material:surface}=model.getObjectByName('Rain drop');
  const origin={value:new T.Vector3()};
  const material=new T.ShaderMaterial({
    name:'3D falling rain',transparent:true,depthWrite:false,
    uniforms:{time:clock.time,rainAmount:clock.rain,rainOrigin:origin,lightningAmount:clock.lightning,
      dropColour:{value:surface.color},dropOpacity:{value:surface.opacity}},
    vertexShader:rainVertex,fragmentShader:rainFragment,
  });
  const rain=new T.InstancedMesh(geometry,material,count);
  const matrix=new T.Matrix4();
  for(let i=0;i<count;i++) {
    matrix.makeTranslation((random()-.5)*100,random()*48,(random()-.5)*100);
    rain.setMatrixAt(i,matrix);
  }
  rain.instanceMatrix.needsUpdate=true;
  rain.name='Weather rain';
  rain.frustumCulled=false;
  rain.renderOrder=6;
  rain.visible=false;
  scene.add(rain);
  return {rain,origin};
}

function blendColour(out,daylight,moonlight,rainlight,night,rain) {
  const day=1-night-rain;
  out.setRGB(daylight.r*day+moonlight.r*night+rainlight.r*rain,
    daylight.g*day+moonlight.g*night+rainlight.g*rain,
    daylight.b*day+moonlight.b*night+rainlight.b*rain);
}

export function createWeather(scene,renderer,lights,assets,clock,water,lowQuality,sunDirection,options={}) {
  let phase=0, targetPhase=0, targetDawn=0, transition=null;
  let rainTarget=0, cloudTarget=.34, thundering=false;
  let reflected=null, reflectionAge=0;
  const dawn={value:0};
  const settingSun={value:sunDirection.clone()}, risingSun={value:sunDirection.clone()};
  const sunsetRay=new T.Vector3(), sunriseRay=new T.Vector3();
  const nextSunsetRay=new T.Vector3(), nextSunriseRay=new T.Vector3(), nextMoonRay=new T.Vector3();
  const forward=new T.Vector3(), right=new T.Vector3();
  let sunsetHeight=.055, nextSunsetHeight=.055, framed=false;

  function frameSky(camera) {
    camera.getWorldDirection(forward);
    const pitch=Math.asin(forward.y);
    const halfFov=T.MathUtils.degToRad(camera.fov*.5);
    forward.setY(0).normalize();
    right.set(-forward.z,0,forward.x);
    const offset=Math.min(.56,Math.tan(halfFov)*camera.aspect*.67);
    nextSunsetRay.copy(forward).addScaledVector(right,-offset).normalize();
    nextSunriseRay.copy(forward).addScaledVector(right,offset*.55).normalize();
    nextSunsetHeight=T.MathUtils.clamp(Math.sin(pitch+halfFov*.67),.026,.072);
    nextMoonRay.copy(forward).addScaledVector(right,offset*.96).normalize()
      .setY(T.MathUtils.clamp(Math.sin(pitch+halfFov*.81),.035,.25)).normalize();
    if (!framed) {
      sunsetRay.copy(nextSunsetRay);
      sunriseRay.copy(nextSunriseRay);
      clock.moonRay.value.copy(nextMoonRay);
      sunsetHeight=nextSunsetHeight;
      framed=true;
    }
  }

  function fadeSky(value,dawnSide,seconds,finish=null) {
    targetPhase=value;
    targetDawn=dawnSide;
    // Both sun positions coincide in high daylight and are hidden in full night.
    if (phase<=.08 || phase>=1.95) dawn.value=dawnSide;
    if (seconds===0) {
      phase=value;
      dawn.value=dawnSide;
      transition=null;
      renderer.shadowMap.needsUpdate=true;
      return;
    }
    transition={from:phase,fromDawn:dawn.value,age:0,seconds,finish};
  }

  function advanceSky(dt) {
    if (!transition) return;
    transition.age+=dt;
    const progress=T.MathUtils.smoothstep(transition.age,0,transition.seconds);
    phase=T.MathUtils.lerp(transition.from,targetPhase,progress);
    dawn.value=T.MathUtils.lerp(transition.fromDawn,targetDawn,progress);
    if (transition.age<transition.seconds) return;
    const { finish }=transition;
    transition=null;
    renderer.shadowMap.needsUpdate=true;
    finish?.();
  }

  function updateReflection(dt,twilight,night,rain) {
    water.blendReflection(dt);
    reflectionAge+=dt;
    const difference=reflected ? Math.max(
      Math.abs(twilight-reflected.twilight),Math.abs(night-reflected.night),
      Math.abs(rain-reflected.rain),Math.abs(clock.clouds.value-reflected.clouds),
      twilight*Math.abs(dawn.value-reflected.dawn),
    ) : 1;
    const threshold=transition ? .39 : .075;
    if (!reflected || (reflectionAge>=6 && difference>=threshold)) {
      water.captureReflection(renderer);
      reflected={twilight,night,rain,clouds:clock.clouds.value,dawn:dawn.value};
      reflectionAge=0;
    }
  }
  const rainfall=makeRain(scene,assets.weather,clock,lowQuality);
  const storm=createStorm(scene,assets.weather,clock,options.onThunder,options);
  const dome=assets.skyDome.getObjectByName('Panoramic sky dome');
  const panorama=dome.material.map;
  const environment=panorama.clone();
  environment.mapping=T.EquirectangularReflectionMapping;
  environment.needsUpdate=true;
  const sky=dome.clone();
  sky.material=new T.ShaderMaterial({
    name:'Weather panorama',side:T.BackSide,depthTest:false,depthWrite:false,
    uniforms:{skyPhoto:{value:panorama},time:clock.time,nightAmount:clock.night,
      rainAmount:clock.rain,lightningAmount:clock.lightning,duskAmount:clock.dusk,cloudAmount:clock.clouds,
      sunDirection:settingSun,dawnDirection:risingSun,dawnAmount:dawn,moonDirection:clock.moonRay},
    vertexShader:skyVertex,fragmentShader:skyFragment,
  });
  sky.name='Weather sky';
  sky.frustumCulled=false;
  sky.renderOrder=-1000;
  sky.layers.enable(1);
  scene.add(sky);
  scene.background=null;
  scene.environment=environment;

  const colours={
    sun:[0xffecd8,0xb3c9ed,0xc2d2df].map(c=>new T.Color(c)),
    sky:[0xdcecff,0x90a9c8,0x9caebc].map(c=>new T.Color(c)),
    ground:[0x96926b,0x566859,0x596a61].map(c=>new T.Color(c)),
    fill:[0xdbeaff,0x8d9fae,0x9ab1c4].map(c=>new T.Color(c)),
    rim:[0xffe6c7,0x99b2d8,0xb4c6d3].map(c=>new T.Color(c)),
  };
  const duskTint=new T.Color(0xffad70);
  const surfaces=new Map();
  scene.traverse(node=>{
    if(!node.isMesh) return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]) {
      if(mat.isMeshStandardMaterial) surfaces.set(mat,mat.roughness);
    }
  });

  return {
    frameSky,
    setSky(value,camera,{seconds=skyFadeSeconds,align=true,rising}={}) {
      if (align) frameSky(camera);
      let dawnSide=targetDawn;
      if (rising!==undefined) dawnSide=Number(rising);
      else if (value===0 && phase>=1.95) dawnSide=1;
      else if (value===2 && phase<=.08) dawnSide=0;
      if (!transition?.finish && Math.abs(value-targetPhase)<.0001 && dawnSide===targetDawn) return;
      fadeSky(value,dawnSide,seconds);
    },
    setRain(amount,clouds,thunder) {
      rainTarget=amount;
      cloudTarget=clouds;
      if (thundering!==thunder) {
        thundering=thunder;
        storm.setEnabled(thunder);
        if (!thunder) options.onStormEnd?.();
      }
    },
    playSunset(camera) {
      frameSky(camera);
      const play=()=>fadeSky(2,0,sunsetSeconds,options.onSunsetEnd);
      if (phase>.035) fadeSky(0,phase>=1.95?1:dawn.value,skyFadeSeconds,play);
      else play();
    },
    update(dt,camera) {
      advanceSky(dt);
      const ease=1-Math.exp(-dt*3.7);
      const framingEase=1-Math.exp(-dt*.90);
      sunsetRay.lerp(nextSunsetRay,framingEase).normalize();
      sunriseRay.lerp(nextSunriseRay,framingEase).normalize();
      clock.moonRay.value.lerp(nextMoonRay,framingEase).normalize();
      sunsetHeight=T.MathUtils.lerp(sunsetHeight,nextSunsetHeight,framingEase);
      const night=clock.night.value=T.MathUtils.smoothstep(phase,1,1.95);
      const dusk=clock.dusk.value=T.MathUtils.smoothstep(phase,.16,.98);
      const rain=clock.rain.value=T.MathUtils.lerp(clock.rain.value,rainTarget,ease);
      clock.clouds.value=T.MathUtils.lerp(clock.clouds.value,cloudTarget,ease);
      const wet=rain*(1-night);
      const day=1-night-wet;
      const altitude=phase<=1
        ? T.MathUtils.lerp(sunDirection.y,sunsetHeight,T.MathUtils.smoothstep(phase,0,1))
        : T.MathUtils.lerp(sunsetHeight,-.16,T.MathUtils.smoothstep(phase,1,1.56));
      const horizonBlend=T.MathUtils.smoothstep(phase,.08,.72);
      const horizontalLength=Math.sqrt(1-altitude*altitude);
      settingSun.value.copy(sunDirection).lerp(sunsetRay,horizonBlend)
        .setY(0).normalize().multiplyScalar(horizontalLength).setY(altitude);
      risingSun.value.copy(sunDirection).lerp(sunriseRay,horizonBlend)
        .setY(0).normalize().multiplyScalar(horizontalLength).setY(altitude);
      clock.sunRay.value.copy(settingSun.value).lerp(risingSun.value,dawn.value).normalize();
      lights.sun.position.copy(clock.sunRay.value).lerp(clock.moonRay.value,night).multiplyScalar(98);
      storm.update(dt,camera);
      lights.sun.intensity=(2.64*day+.32*night+.67*wet)*(1-.45*dusk*(1-night));
      lights.hemi.intensity=1.25*day+.60*night+.80*wet;
      lights.fill.intensity=.35*day+.19*night+.14*wet;
      lights.rim.intensity=.40*day+.27*night+.15*wet;
      blendColour(lights.sun.color,...colours.sun,night,wet);
      blendColour(lights.hemi.color,...colours.sky,night,wet);
      blendColour(lights.hemi.groundColor,...colours.ground,night,wet);
      blendColour(lights.fill.color,...colours.fill,night,wet);
      blendColour(lights.rim.color,...colours.rim,night,wet);
      lights.sun.color.lerp(duskTint,dusk*(1-night)*(1-rain)*.75);
      renderer.toneMappingExposure=1.05*day+1.08*night+1.01*wet;
      scene.environmentIntensity=.25*day+.12*night+.16*wet;
      for(const [material,roughness] of surfaces) {
        material.roughness=T.MathUtils.lerp(roughness,Math.max(.22,roughness*.58),rain);
      }
      rainfall.rain.visible=rain>.008;
      rainfall.origin.value.set(camera.position.x,Math.max(0,camera.position.y-19),camera.position.z);
      updateReflection(dt,dusk*(1-night),night,rain);
    },
  };
}
