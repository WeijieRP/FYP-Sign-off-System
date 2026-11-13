import { THREE as T } from './vendor/three-runtime.js';
import { seeded } from './landscape.js';
import { normalWaterHeight } from './river-level.js';

const TAU = Math.PI * 2;
const up = new T.Vector3(0,1,0);
const lerp = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;
const heading = dir => Math.atan2(dir.x,dir.z);
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));

function route(points) {
  const path = new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal');
  path.arcLengthDivisions = 190;
  path.updateArcLengths();
  return path;
}

function tailMotion(fish, time, phase) {
  fish.traverse(node => {
    if (!node.isMesh) return;
    const material = node.material.clone();
    node.material=material;
    material.onBeforeCompile=shader=>{
      shader.uniforms.swimTime=time;
      shader.uniforms.swimPhase={value:phase};
      shader.vertexShader='uniform float swimTime,swimPhase;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        float tail=pow(smoothstep(-.16,.33,position.z),1.75);
        transformed.x+=tail*.091*sin(swimTime*8.1-position.z*10.+swimPhase);
      `);
    };
    material.customProgramCacheKey=()=> 'barramundi-tail';
  });
}

export function createSwimmers(scene, assets, clock, lowQuality) {
  const rng=seeded(32807);
  const fish=assets.layout.fishRoutes.slice(0,lowQuality?5:8).map((points,i)=>{
    const model=assets.fish.clone(true);
    const object=new T.Group();
    const s=1.32+.51*rng();
    model.scale.setScalar(s);
    model.position.y=-.138*s;
    object.add(model);
    scene.add(object);
    object.name='Swimming barramundi '+(i+1);
    const path=route(points);
    tailMotion(model,clock.time,i*.77);
    return {object,path,pace:(1.13+.49*rng())/path.getLength(), phase:i*.37, depth:.19+.26*rng()};
  });

  const ducks=assets.layout.duckRoutes.map((points,i)=>{
    const object=new T.Group();
    const model=assets.duck.clone(true);
    model.rotation.y=-Math.PI/2;
    model.scale.setScalar(1.62-.18*i);
    model.position.y=-.171*model.scale.x;
    object.add(model);
    object.name='Swimming mallard '+(i+1);
    scene.add(object);
    const path=route(points);
    return {object,path,pace:(1.13-.12*i)/path.getLength(),phase:[.54,.24,.75][i]};
  });

  const tangent=new T.Vector3();
  return time=>{
    const waterLevel=normalWaterHeight+clock.waterRise.value;
    for (const {object,path,pace,phase,depth} of fish) {
      const u=(time*pace+phase)%1;
      path.getPointAt(u,object.position);
      path.getTangentAt(u,tangent);
      object.position.y=waterLevel-depth-.044*Math.sin(time*2.4+phase*13);
      object.rotation.set(.067*Math.cos(time*2.4+phase*13),heading(tangent),.10*Math.sin(time*7+phase*16),'YXZ');
    }
    ducks.forEach(({object,path,pace,phase},i)=>{
      const u=(time*pace+phase)%1;
      path.getPointAt(u,object.position);
      path.getTangentAt(u,tangent);
      object.position.y=waterLevel+.032+.026*Math.sin(time*2.4+i*2);
      object.rotation.set(.027*Math.sin(time*3.9+i),heading(tangent),.062*Math.sin(time*2.7+i*3),'YXZ');
      clock.swimmers.value[i].set(object.position.x,object.position.z,tangent.x,tangent.z);
    });
  };
}

function softEnds(t) {
  const edge=.072;
  if (t<edge) return t*t/(2*edge*(1-edge));
  if (t>1-edge) return 1-(1-t)**2/(2*edge*(1-edge));
  return (t-edge*.5)/(1-edge);
}

function flightPath(seat, exit, direction, rng, canopyTop, flyover) {
  const through=(dist,lift)=>seat.clone().addScaledVector(exit,dist).add(new T.Vector3(0,lift,0));
  const points=[seat.clone(),through(2.2,.18),through(7.2,2.18)];
  const angle=Math.atan2(exit.z,exit.x), phase=rng()*TAU;
  const initial=canopyTop+3.4+rng()*3.4;
  for (let step=0;step<=10;step++) {
    const t=step/10;
    const a=angle+direction*(.27+t*(TAU-.54));
    const r=21.2+6.8*Math.sin(t*Math.PI)+3.1*Math.sin(a*2+phase);
    const height=initial+2.1*Math.sin(a*1.73+phase)+2.9*Math.sin(t*Math.PI);
    if (flyover && step>=4 && step<=6) {
      const radius=[9,1.3,8.5][step-4];
      points.push(new T.Vector3(radius*Math.cos(a),canopyTop+1.85+step*.084,radius*Math.sin(a)));
    } else {
      points.push(new T.Vector3(r*Math.cos(a),height,r*Math.sin(a)));
    }
  }
  points.push(through(9.8,3.6),through(3.7,.53),through(1.25,.12),seat.clone());
  const curve=new T.CatmullRomCurve3(points,false,'centripetal');
  curve.arcLengthDivisions=380;
  const duration=curve.getLength()/(6.9+rng()*1.4);
  let passTime=null;
  if (flyover) {
    const check=new T.Vector3();
    let closest=Infinity;
    for (let i=10;i<95;i++) {
      curve.getPointAt(softEnds(i/100),check);
      const radius=Math.hypot(check.x,check.z);
      if (check.y>canopyTop+.7 && radius<closest) {
        closest=radius;
        passTime=i/100*duration;
      }
    }
  }
  return {curve,duration,passTime,rest:5+rng()*6,
    takeoff:heading(curve.getTangentAt(0)),arrival:heading(curve.getTangentAt(1))};
}

const xAxis=new T.Vector3(1,0,0), zAxis=new T.Vector3(0,0,1);
const roll=new T.Quaternion(), yaw=new T.Quaternion(), spread=new T.Quaternion();
const closed=new T.Quaternion();

function mountHawk(source, scale) {
  const object=new T.Group();
  const bird=source.clone(true);
  const pose=new T.Group();
  const yawCorrection=new T.Group();
  const wings=[];
  for (const [key,side] of [['WingRight',1],['WingLeft',-1]]) {
    const feathers=bird.getObjectByName(key);
    if (!feathers) throw new Error('Bird GLB is missing '+key);
    const shoulder=new T.Vector3(.004,.244,side*.057);
    const pivot=new T.Group();
    pivot.position.copy(shoulder);
    bird.add(pivot);
    pivot.add(feathers);
    feathers.position.sub(shoulder);
    wings.push({pivot,side});
  }
  bird.position.set(-.022,-.006,0);
  pose.add(bird);
  yawCorrection.rotation.y=-Math.PI/2;
  yawCorrection.add(pose);
  object.add(yawCorrection);
  object.scale.setScalar(scale);
  return {object,pose,wings};
}

function poseHawk(hawk, open, flap, rest) {
  // Re-pose the actual feather meshes from the glTF. +X points toward the bill.
  hawk.pose.rotation.z=-.78*open+.019*Math.sin(rest*2.1)*(1-open);
  for (const {pivot,side} of hawk.wings) {
    roll.setFromAxisAngle(xAxis,-side*(1.36+flap));
    yaw.setFromAxisAngle(up,side*.70);
    spread.setFromAxisAngle(zAxis,.78);
    spread.multiply(yaw).multiply(roll);
    pivot.quaternion.copy(closed).slerp(spread,open);
    pivot.scale.set(1+.57*open,1+.41*open,1);
  }
}

export function createBirds(scene, source, bounds, soil, seats, lowQuality) {
  const rng=seeded(38407);
  const birds=seats.slice(0,lowQuality?3:4).map(([x,y,z],i)=>{
    const hawk=mountHawk(source,1.45+.29*rng());
    hawk.object.name='River hawk '+(i+1);
    hawk.object.traverse(node=>{
      if (!node.isMesh) return;
      node.castShadow=false;
      node.layers.disable(1);
    });
    const seat=new T.Vector3(x,y+soil+.013,z);
    const exit=new T.Vector3(Math.sign(x)*(.31+.22*rng()),0, z>=0?1:-1).normalize();
    const sign=i%2?1:-1;
    const a=flightPath(seat,exit,sign,rng,bounds.max.y,i===0||i===2);
    const b=flightPath(seat,exit,-sign,rng,bounds.max.y,i===1);
    const offset=a.passTime!==null?Math.max(0,a.passTime-(i===0?4.7:12.8))
      :i===1?a.duration+1.1:a.duration*(.3+.34*rng());
    scene.add(hawk.object);
    return {...hawk, seat, routes:[a,b], span:a.duration+a.rest+b.duration+b.rest,
            first:a.duration+a.rest, offset, phase:rng()*TAU};
  });
  const dir=new T.Vector3(), nextDir=new T.Vector3();
  return time=>{
    for (const hawk of birds) {
      const cycle=(time+hawk.offset)%hawk.span;
      const index=cycle<hawk.first?0:1;
      const path=hawk.routes[index];
      const age=cycle-(index?hawk.first:0);
      const perched=age>=path.duration;
      let open,flap,rest=0;
      if (perched) {
        rest=age-path.duration;
        const next=hawk.routes[1-index].takeoff;
        const turn=smooth(rest,path.rest*.50,path.rest-.24)*angleDelta(path.arrival,next);
        hawk.object.position.copy(hawk.seat);
        hawk.object.rotation.set(0,path.arrival+turn,0,'YXZ');
        open=.18*smooth(rest,path.rest-.3,path.rest);
        flap=0;
      } else {
        const t=age/path.duration, progress=softEnds(t);
        path.curve.getPointAt(progress,hawk.object.position);
        path.curve.getTangentAt(progress,dir);
        path.curve.getTangentAt(Math.min(1,progress+.013),nextDir);
        const yaw=heading(dir);
        open=.18+.82*smooth(t,0,.041)*(1-smooth(t,.965,1));
        const glide=smooth(Math.sin(time*.78+hawk.phase),-.10,.71)*open;
        flap=(.09+.55*Math.sin(time*12.6+hawk.phase))*(1-glide)+.07*glide;
        const turn=T.MathUtils.clamp(angleDelta(yaw,heading(nextDir))*1.65,-.36,.36);
        hawk.object.rotation.set(-Math.asin(T.MathUtils.clamp(dir.y,-1,1))*open,yaw,turn*open,'YXZ');
      }
      hawk.object.userData.behaviour=perched?'perched':'flying';
      poseHawk(hawk,open,flap,rest);
    }
    return birds[Math.floor(time/12)%birds.length].object.position;
  };
}
