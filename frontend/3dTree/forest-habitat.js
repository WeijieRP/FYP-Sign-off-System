import { THREE as T } from './vendor/three-runtime.js';

export function addForestHabitat(scene,assets,clock,lowQuality,random) {
  const habitat=assets.habitat;
  const stream=habitat.getObjectByName('Forest creek and cascade');
  const surface=stream.material;
  stream.material=new T.ShaderMaterial({
    name:'Forest creek water',
    transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{time:clock.time,night:clock.night,rain:clock.rain,dusk:clock.dusk,
      waterColour:{value:surface.color},waterOpacity:{value:surface.opacity}},
    vertexShader:`
      varying vec2 flow;
      void main(){
        flow=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:`
      uniform float time,night,rain,dusk,waterOpacity;
      uniform vec3 waterColour;
      varying vec2 flow;
      void main(){
        float across=min(flow.x,1.-flow.x);
        float current=flow.y-time*(.26+.12*rain);
        float bands=sin(current*101.+4.*sin(flow.x*8.+flow.y*18.));
        float ripple=sin(current*54.-flow.x*23.);
        float white=smoothstep(.68,.96,bands*.65+ripple*.35);
        float fall=(flow.y-.63)*8.;
        float rapids=.33+.42*exp(-fall*fall)+.25*flow.y;
        vec3 water=mix(waterColour,waterColour+vec3(.22,.22,.23),.40+.35*ripple);
        vec3 foam=mix(vec3(.68,.78,.71),vec3(.20,.26,.32),night);
        vec3 colour=mix(water,foam,white*rapids);
        colour*=mix(vec3(1.),vec3(1.,.68,.48),dusk*(1.-night)*.48);
        colour*=mix(1.,.43,night);
        float edge=smoothstep(0.,.12,across);
        float ends=smoothstep(0.,.05,flow.y)*(1.-smoothstep(.95,1.,flow.y));
        gl_FragColor=vec4(colour,(waterOpacity-.12+.22*white)*edge*ends);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  stream.renderOrder=5;

  const droplet=assets.weather.getObjectByName('Creek spray droplet');
  droplet.material.depthWrite=false;
  const spray=new T.InstancedMesh(droplet.geometry,droplet.material,lowQuality?8:18);
  spray.name='Creek spray';
  spray.frustumCulled=false;
  spray.renderOrder=6;
  habitat.add(spray);
  const sections=assets.layout.habitat.stream;
  const crest=sections[Math.floor(sections.length*.70)][1];
  const phases=Array.from({length:spray.count},()=>[random(),random(),random()]);
  const pose=new T.Object3D();
  scene.add(habitat);
  return time=>{
    phases.forEach(([phase,side,height],i)=>{
      const t=(time*.92+phase)%1;
      pose.position.set(crest[0]+(side-.5)*.85,crest[1]+.07+Math.sin(t*Math.PI)*(.16+.44*height),
        crest[2]+t*.77);
      pose.scale.setScalar(.45+height*.92);
      pose.updateMatrix();
      spray.setMatrixAt(i,pose.matrix);
    });
    spray.instanceMatrix.needsUpdate=true;
  };
}
