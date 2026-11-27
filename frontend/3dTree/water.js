import { THREE as T } from './vendor/three-runtime.js';
import { landscapeFar } from './mountains.js';

const leafSplashCount=6;

const vertex = /* glsl */`
  varying vec3 riverPoint;
  varying vec2 depthFlow;
  void main() {
    riverPoint=(modelMatrix*vec4(position,1.)).xyz;
    depthFlow=uv;
    gl_Position=projectionMatrix*viewMatrix*vec4(riverPoint,1.);
  }
`;

function fragment(wakeCount,rockCount) {
  return /* glsl */`
    uniform float time,gust,hasReflection,nightAmount,rainAmount,lightningAmount,duskAmount;
    uniform vec3 sun,moon,skyHorizon,rocks[${rockCount}];
    uniform float latestLeafSplash;
    uniform vec3 leafSplashes[${leafSplashCount}];
    uniform vec4 swimmers[${wakeCount}];
    uniform samplerCube reflectionMap,nextReflectionMap;
    uniform float reflectionBlend;
    uniform float waterRise;
    uniform vec3 riverColour;
    uniform float riverOpacity;
    varying vec3 riverPoint;
    varying vec2 depthFlow;

    float hash(vec2 p) {
      p=fract(p*vec2(123.34,456.21));
      p+=dot(p,p+45.32);
      return fract(p.x*p.y);
    }
    float noise21(vec2 p) {
      vec2 f=fract(p), i=floor(p);
      f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                 mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
    }
    float wakes(vec2 p) {
      float wake=0.;
      for(int i=0;i<${wakeCount};i++){
        vec2 d=p-swimmers[i].xy;
        if(max(abs(d.x),abs(d.y))>5.4) continue;
        vec2 direction=swimmers[i].zw;
        float aft=-dot(d,direction);
        float side=abs(dot(d,vec2(-direction.y,direction.x)));
        float arms=exp(-abs(side-(.10+.30*max(aft,0.)))*9.);
        arms*=smoothstep(.03,.43,aft)*(1.-smoothstep(1.45,4.65,aft));
        float bow=exp(-abs(length(d)-.41)*14.)*(1.-smoothstep(-.12,.24,aft));
        wake=max(wake,arms*(.51+.23*cos(aft*7.8-time*4.4))*.64+bow*.31);
      }
      for(int i=0;i<${rockCount};i++){
        vec2 d=p-rocks[i].xy;
        if(dot(d,d)>6.) continue;
        float r=rocks[i].z;
        float ring=exp(-abs(length(d)-r*(.9+.14*sin(time*1.2)))*12.);
        wake=max(wake,ring*.24);
      }
      return wake;
    }
    float leafRipples(vec2 p) {
      if(time-latestLeafSplash>1.55) return 0.;
      float impact=0.;
      for(int i=0;i<${leafSplashCount};i++){
        vec3 entry=leafSplashes[i];
        float age=time-entry.z;
        if(age<0.||age>1.55) continue;
        vec2 delta=p-entry.xy;
        if(max(abs(delta.x),abs(delta.y))>1.2) continue;
        float radius=length(delta);
        float ring=exp(-abs(radius-(.055+age*.65))*37.);
        float echo=exp(-abs(radius-(.026+age*.39))*30.);
        float fade=smoothstep(0.,.085,age)*(1.-smoothstep(.13,1.55,age));
        impact=max(impact,(ring+.37*echo)*fade);
      }
      return impact;
    }
    void main() {
      vec2 p=riverPoint.xz;
      float depth=max(0.,depthFlow.x+waterRise*3.4);
      float t=time*.88;
      vec2 flowDir=vec2(sin(depthFlow.y),cos(depthFlow.y));
      vec2 side=vec2(flowDir.y,-flowDir.x);
      vec2 flow=vec2(dot(p,side),dot(p,flowDir)-t);
      float a=flow.y*.76+flow.x*.38+.50*sin(flow.x*.36+p.y*.13);
      float b=dot(flow,vec2(-.85,1.03))-.41*t;
      float c=dot(flow,vec2(1.71,.80))+.55*sin(flow.y*.37);
      float d=dot(p,vec2(2.6,.90))+.68*time;
      vec2 slope=(.75+.35*gust)*(vec2(.019,.041)*cos(a)
          +vec2(-.026,.021)*cos(b)+vec2(.013,.009)*cos(c)+vec2(.005,.011)*cos(d));
      vec2 cell=floor(p*1.45);
      vec2 drop=fract(p*1.45)-vec2(.32+.34*hash(cell),.32+.34*hash(cell+7.1));
      float impact=fract(time*1.38+hash(cell+19.4));
      float ripple=sin((length(drop)-impact*.57)*48.)*exp(-length(drop)*6.)*(1.-impact);
      slope+=rainAmount*normalize(drop+vec2(.001))*.038*ripple;
      vec3 normal=normalize(vec3(slope.x,1.,slope.y));
      vec3 ray=cameraPosition-riverPoint;
      float range=length(ray);
      vec3 eye=ray/max(range,.001);
      float facing=max(dot(normal,eye),0.);
      float fresnel=pow(1.-facing,4.1);
      vec3 direction=reflect(-eye,normal);
      vec3 reflection=mix(skyHorizon,vec3(.30,.43,.55),smoothstep(-.04,.58,direction.y));
      reflection=mix(reflection,vec3(.021,.047,.078),nightAmount*.91);
      if(hasReflection>.5) {
        vec3 reflected=textureCube(reflectionMap,direction).rgb;
        if(reflectionBlend>0.) {
          reflected=mix(reflected,textureCube(nextReflectionMap,direction).rgb,reflectionBlend);
        }
        reflection=mix(reflection,reflected,.76);
      }
      reflection=mix(reflection,reflection*vec3(1.08,.53,.26),duskAmount*(1.-nightAmount)*.62);
      reflection=mix(reflection,max(reflection*vec3(.79,.90,1.),vec3(.016,.034,.058)),nightAmount);
      float shoal=1.-smoothstep(.7,8.2,depth);
      vec3 tint=mix(riverColour*vec3(.489,.542,.548),vec3(.155,.217,.108),shoal*.78);
      tint=mix(tint,vec3(.052,.080,.085),rainAmount*.65);
      vec3 nightWater=mix(vec3(.012,.028,.048),vec3(.026,.055,.069),shoal);
      nightWater=mix(nightWater,vec3(.014,.029,.048),rainAmount*.40);
      tint=mix(tint,nightWater,nightAmount*.94);
      tint*=.89+.19*noise21(p*.42);
      vec3 colour=mix(tint,reflection,.11+.68*fresnel);
      float glint=pow(max(dot(direction,normalize(mix(sun,moon,nightAmount))),0.),68.);
      colour+=mix(vec3(1.,.86,.62),vec3(.30,.45,.65),nightAmount)*glint*.40*(1.-.76*nightAmount)*(1.-.65*rainAmount);
      float streak=smoothstep(.56,.84,noise21(vec2(flow.x*1.38,flow.y*.31)));
      float crest=smoothstep(.83,1.,cos(a+.21*cos(b)));
      float bank=exp(-abs(depth-.27)*2.5)*(.62+.38*sin(flow.y*2.9));
      float foam=clamp((streak*crest*.15+bank*.23+wakes(p)+leafRipples(p)*.34)*exp(-range*.013),0.,.67);
      colour=mix(colour,mix(vec3(.74,.84,.77),vec3(.16,.24,.33),nightAmount),foam+rainAmount*abs(ripple)*.025);
      colour+=vec3(.19,.28,.43)*lightningAmount*(.25+fresnel*.75+abs(ripple)*.08);
      // Transparency leaves a clear strip across the fish routes.
      float alpha=clamp(riverOpacity-.19+.36*fresnel+.08*(1.-shoal)+foam*.22,.36,.96);
      gl_FragColor=vec4(colour,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
}

export function makeRiver(scene, model, clock, rocks, lowQuality, skyHorizon) {
  const nearby=rocks.filter(([x,y,z,h])=>y<.08 && y+h>-.16).slice(0,10);
  const stones=nearby.map(([x,y,z,h])=>new T.Vector3(x,z,h*.66));
  if (!stones.length) stones.push(new T.Vector3(999,999,.1));
  const makeReflection=()=>new T.WebGLCubeRenderTarget(lowQuality?128:256,{
    generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter
  });
  let reflection=makeReflection(), nextReflection=null, blendAge=null;
  const splashes=Array.from({length:leafSplashCount},()=>new T.Vector3(0,0,-10));
  let nextSplash=0;
  const surface=model.getObjectByProperty('isMesh',true).material;
  const uniforms={
    time:clock.time,gust:clock.gust,swimmers:clock.swimmers,nightAmount:clock.night,rainAmount:clock.rain,
    lightningAmount:clock.lightning,duskAmount:clock.dusk,waterRise:clock.waterRise,
    riverColour:{value:surface.color},riverOpacity:{value:surface.opacity},
    rocks:{value:stones},sun:clock.sunRay,moon:clock.moonRay,skyHorizon:{value:skyHorizon},
    leafSplashes:{value:splashes},latestLeafSplash:{value:-10},
    reflectionMap:{value:reflection.texture},nextReflectionMap:{value:reflection.texture},
    reflectionBlend:{value:0},hasReflection:{value:0},
  };
  const material=new T.ShaderMaterial({
    name:'Mapped river | moving currents',transparent:true,depthWrite:false,
    uniforms,vertexShader:vertex,fragmentShader:fragment(clock.swimmers.value.length,stones.length),
  });
  model.traverse(node=>{
    if (!node.isMesh) return;
    node.material=material;
    node.renderOrder=4;
  });
  scene.add(model);

  return {
    setRise(rise) {
      clock.waterRise.value=rise;
      model.position.y=rise;
    },
    splash(position,time) {
      splashes[nextSplash].set(position.x,position.z,time);
      uniforms.latestLeafSplash.value=time;
      nextSplash=(nextSplash+1)%splashes.length;
    },
    blendReflection(dt) {
      if (blendAge===null) return;
      blendAge+=dt;
      const mix=T.MathUtils.smoothstep(blendAge,0,2.6);
      uniforms.reflectionBlend.value=mix;
      if (mix<1) return;
      [reflection,nextReflection]=[nextReflection,reflection];
      uniforms.reflectionMap.value=reflection.texture;
      uniforms.nextReflectionMap.value=nextReflection.texture;
      uniforms.reflectionBlend.value=0;
      blendAge=null;
    },
    captureReflection(renderer) {
      const ready=uniforms.hasReflection.value>0;
      const target=ready?(nextReflection??=makeReflection()):reflection;
      const camera=new T.CubeCamera(.22,landscapeFar,target);
      camera.position.set(0,1.16,19);
      camera.layers.set(1);
      const shadows=renderer.shadowMap.enabled;
      model.visible=false;
      renderer.shadowMap.enabled=false;
      try {
        camera.update(renderer,scene);
        uniforms.hasReflection.value=1;
        if (ready) {
          uniforms.nextReflectionMap.value=target.texture;
          blendAge=0;
        }
      } finally {
        renderer.shadowMap.enabled=shadows;
        model.visible=true;
      }
    }
  };
}
