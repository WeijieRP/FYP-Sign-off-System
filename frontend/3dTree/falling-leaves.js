import { THREE as T } from './vendor/three-runtime.js';
import { normalWaterHeight } from './river-level.js';

function curve(points) {
  const path=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)),false,'centripetal');
  path.arcLengthDivisions=180;
  path.updateArcLengths();
  return path;
}
export function createFallingLeaves(scene,model,data,random,waterRise,onWaterEntry) {
  const group=new T.Group();
  group.name='Ketapang leaves | canopy, island and river';
  scene.add(group);
  const routes=data.map(route=>({
    start:new T.Vector3(...route.start),land:new T.Vector3(...route.land),
    lift:curve(route.lift),current:curve(route.current),entry:new T.Vector3(...route.current[0]),
  }));
  const prototypes=['OrangeLeaf1','DryLeaf1','Leaf1','YellowLeaf1'].map(name=>model.getObjectByName(name));
  const pool=Array.from({length:10},(_,i)=>{
    const mesh=prototypes[i%prototypes.length].clone();
    mesh.position.set(0,0,0);
    mesh.material=mesh.material.clone();
    mesh.material.transparent=true;
    mesh.material.depthWrite=false;
    mesh.visible=false;
    mesh.renderOrder=5;
    group.add(mesh);
    return {mesh,state:'inactive',at:0,duration:0,route:null,spin:0};
  });
  let nextRoute=0,lastGust=-Infinity;
  function change(leaf,state,time,duration=0) {
    Object.assign(leaf,{state,at:time,duration});
    leaf.mesh.visible=state!=='inactive';
    leaf.mesh.userData.motion=state;
  }
  function enterWater(leaf,time) {
    leaf.mesh.position.copy(leaf.route.entry);
    leaf.mesh.position.y+=waterRise.value;
    const flowSpeed=.87+.13*random();
    change(leaf,'floating',time,leaf.route.current.getLength()/flowSpeed);
    onWaterEntry?.(leaf.mesh.position,time);
  }
  return {
    gust(time) {
      if (time-lastGust<2.6) return;
      lastGust=time;
      let lifted=0;
      for (const leaf of pool) {
        if (leaf.state==='grounded'&&time-leaf.at>1.4&&lifted<3) {
          change(leaf,'blowing',time,Math.max(4.5,leaf.route.lift.getLength()/1.9)+random());
          lifted++;
        }
      }
      const count=random()<.56?2:1;
      for (let i=0;i<count;i++) {
        const leaf=pool.find(leaf=>leaf.state==='inactive');
        if (!leaf) break;
        const routeIndex=nextRoute++;
        leaf.route=routes[routeIndex%routes.length];
        const flooded=leaf.route.land.y<normalWaterHeight+waterRise.value;
        leaf.direct=routeIndex%4===0 || flooded;
        leaf.spin=random()*Math.PI*2;
        leaf.mesh.material.opacity=1;
        leaf.mesh.scale.setScalar(.84+random()*.31);
        leaf.mesh.position.copy(leaf.route.start);
        change(leaf,'falling',time,5.5+random()*1.6);
      }
    },
    update(time) {
      const rise=waterRise.value;
      for (const leaf of pool) {
        if (leaf.state==='inactive'||leaf.state==='grounded') continue;
        const {mesh,route,spin}=leaf;
        const age=time-leaf.at, t=Math.min(1,age/leaf.duration);
        const flutter=Math.sin(Math.PI*t);
        if (leaf.state==='falling') {
          // Flows down smoothly: lets go gently, glides and settles softly, in one slow, wide sway (no
          // zigzag), rocking a little and turning slowly.
          const landing=leaf.direct?route.entry:route.land;
          const glide=(1-Math.cos(Math.PI*t))/2;
          mesh.position.lerpVectors(route.start,landing,T.MathUtils.smoothstep(t,0,1));
          mesh.position.y=T.MathUtils.lerp(route.start.y,landing.y+(leaf.direct?rise:0),glide);
          mesh.position.x+=Math.sin(spin)*.34*flutter;
          mesh.position.z+=Math.cos(spin)*.2*flutter;
          mesh.rotation.set(.32*Math.sin(Math.PI*1.4*t+spin)*flutter,spin+glide*Math.PI*.6,.24*Math.cos(Math.PI*1.2*t)*flutter);
          if (t===1) {
            if (leaf.direct) enterWater(leaf,time);
            else change(leaf,'grounded',time);
          }
        } else if (leaf.state==='blowing') {
          const liftProgress=T.MathUtils.smootherstep(t,0,1);
          route.lift.getPointAt(liftProgress,mesh.position);
          mesh.position.y+=rise*liftProgress;
          mesh.rotation.set(.87*Math.sin(age*4+spin)*flutter,spin+t*Math.PI*2,.71*flutter);
          if (t===1) enterWater(leaf,time);
        } else {
          route.current.getPointAt(t,mesh.position);
          mesh.position.y+=rise+.015*Math.sin(age*2.4+spin);
          mesh.rotation.set(.07*Math.sin(age*1.8),spin+age*.15,.08*Math.sin(age*1.5+spin));
          mesh.material.opacity=1-T.MathUtils.smoothstep(t,.84,1);
          if (t===1) change(leaf,'inactive',time);
        }
      }
    },
  };
}
