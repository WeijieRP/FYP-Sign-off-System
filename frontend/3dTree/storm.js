import { THREE as T } from './vendor/three-runtime.js';

// Lightning is a branching tube mesh at a world-space location. Its lights
// illuminate the actual terrain, leaves and bark; there is no full-screen flash.
export function createStorm(scene,models,clock,onThunder,{reducedMotion=false}={}) {
  const group=new T.Group();
  group.name='Storm | branching 3D lightning';
  group.visible=false;
  group.layers.enable(1);
  scene.add(group);
  const bolts=models.children[0].children.filter(node=>node.name.startsWith('Lightning '));
  const cores=new Set(), halos=new Set();
  for (const bolt of bolts) {
    bolt.position.set(0,0,0);
    bolt.visible=false;
    bolt.traverse(part=>{
      if (!part.isMesh) return;
      const materials=part.name.startsWith('Core')?cores:halos;
      materials.add(part.material);
      part.material.transparent=true;
      part.material.depthWrite=false;
      part.material.blending=T.AdditiveBlending;
      part.material.toneMapped=false;
      part.renderOrder=5;
    });
    group.add(bolt);
  }
  const flash=new T.DirectionalLight(0xc7dbff,0);
  flash.name='Lightning illumination';
  flash.layers.enable(1);
  const bounce=new T.HemisphereLight(0xbbd8ff,0x637f89,0);
  bounce.name='Lightning sky bounce';
  bounce.layers.enable(1);
  scene.add(flash,flash.target,bounce);
  let enabled=false, countdown=Infinity, age=Infinity, strength=0;
  let seed=210847, strikes=0;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
  const away=new T.Vector3(), right=new T.Vector3();
  let activeBolt;

  function strike(camera) {
    if (activeBolt) activeBolt.visible=false;
    activeBolt=bolts[strikes%bolts.length];
    strikes++;
    strength=.62+random()*.38;
    away.copy(camera.position).setY(0).normalize().negate();
    right.set(-away.z,0,away.x);
    const side=(random()<.5?-1:1)*(24+random()*25);
    const anchor=away.multiplyScalar(52+random()*18).addScaledVector(right,side);
    activeBolt.position.set(anchor.x,7.4,anchor.z);
    activeBolt.rotation.y=Math.atan2(away.x,away.z);
    activeBolt.visible=true;
    flash.position.set(anchor.x,32,anchor.z);
    flash.target.position.set(0,4.5,0);
    age=0;
    const delay=1.65+random()*2.1;
    onThunder?.(delay,strength,T.MathUtils.clamp(side/70,-.7,.7));
    countdown=13+random()*13;
  }

  return {
    get strikes(){return strikes;},
    setEnabled(value) {
      if(enabled===value) return;
      enabled=value;
      countdown=value?4.5:Infinity;
      if(!value) {
        age=Infinity;
        clock.lightning.value=0;
        group.visible=false;
        flash.intensity=bounce.intensity=0;
      }
    },
    update(dt,camera) {
      if(enabled && clock.rain.value>.35) {
        countdown-=dt;
        if(countdown<=0) strike(camera);
      }
      age+=dt;
      // One initial pulse, followed by a softer return pulse and a short glow.
      const first=Math.exp(-age*24);
      const second=age>.22?Math.exp(-(age-.22)*24)*.56:0;
      const tail=age>.29?Math.exp(-(age-.29)*7)*.12:0;
      const pulse=enabled&&age<1.05&&!reducedMotion
        ?Math.min(1,first+second+tail)*strength*clock.rain.value:0;
      clock.lightning.value=pulse;
      group.visible=pulse>.025;
      for (const material of cores) material.opacity=Math.min(1,pulse*2.2);
      for (const material of halos) material.opacity=pulse*.22;
      flash.intensity=pulse*5.6;
      bounce.intensity=pulse*.85;
    },
  };
}
