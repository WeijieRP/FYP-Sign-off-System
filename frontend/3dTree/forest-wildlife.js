import { THREE as T } from './vendor/three-runtime.js';

function track(rows) {
  const path=new T.CatmullRomCurve3(rows.map(row=>new T.Vector3(...row)),true,'centripetal');
  path.arcLengthDivisions=90;
  path.updateArcLengths();
  return path;
}

export function addForestWildlife(scene,models,habitat,clock,lowQuality) {
  const group=new T.Group();
  group.name='Forest wildlife';
  scene.add(group);
  function spawn(name) {
    const animal=models.getObjectByName(name).clone(true);
    animal.position.set(0,0,0);
    group.add(animal);
    return animal;
  }
  const squirrel=spawn('Plantain squirrel');
  const monitor=spawn('Malayan water monitor');
  const frog=spawn('Riverbank frog');
  const squirrelTail=squirrel.getObjectByName('Tail pivot');
  const monitorTail=monitor.getObjectByName('Tail pivot');
  const squirrelPath=track(habitat.wildlife.squirrel), monitorPath=track(habitat.wildlife.monitor);
  const frogPath=track(habitat.wildlife.frog);
  const variants=['Amber','Sand','Ochre'];
  const butterflies=habitat.wildlife.butterflies.slice(0,lowQuality?4:6).map((centre,i)=>{
    const animal=spawn('Forest butterfly '+variants[i%variants.length]);
    const left=animal.getObjectByName('Left wing pivot'), right=animal.getObjectByName('Right wing pivot');
    return {animal,left,right,centre,offset:i*2.3};
  });
  const beetles=habitat.logs.slice(0,lowQuality?1:3).map(([x,y,z],i)=>({
    animal:spawn('Forest-floor beetle'),x,y:y+.15,z,phase:i*1.5,
  }));
  const tangent=new T.Vector3();
  function move(animal,path,u,lift) {
    path.getPointAt(u,animal.position);
    path.getTangentAt(u,tangent);
    animal.position.y+=lift;
    animal.rotation.y=Math.atan2(tangent.x,tangent.z);
  }
  return time=>{
    move(squirrel,squirrelPath,(time/29+.11)%1,.075*Math.abs(Math.sin(time*8.5)));
    squirrelTail.rotation.x=.18*Math.sin(time*5.5);
    move(monitor,monitorPath,(time/64+.07)%1,.012*Math.sin(time*4.2));
    monitorTail.rotation.y=.21*Math.sin(time*3.4);
    const jump=(time%5)/5;
    const hop=T.MathUtils.smoothstep(jump,.16,.42);
    move(frog,frogPath,((Math.floor(time/5)+hop)/5)%1,.26*Math.sin(hop*Math.PI));
    for (const {animal,left,right,centre,offset} of butterflies) {
      const phase=time*.85+offset;
      animal.visible=clock.night.value<.70 && clock.rain.value<.86;
      animal.position.set(centre[0]+Math.sin(phase)*1.25,centre[1]+1.05+.35*Math.sin(phase*1.6),
        centre[2]+Math.cos(phase)*.85);
      animal.rotation.y=Math.atan2(Math.cos(phase)*1.25,-Math.sin(phase)*.85);
      const flap=.89*Math.sin(time*16+offset);
      left.rotation.z=-flap;
      right.rotation.z=flap;
    }
    for (const {animal,x,y,z,phase} of beetles) {
      const p=time*.38+phase;
      animal.position.set(x+.31*Math.cos(p),y,z+.09*Math.sin(p));
      animal.rotation.y=Math.atan2(-Math.sin(p),.29*Math.cos(p));
    }
  };
}
