import { THREE as T } from './vendor/three-runtime.js';

function createViewer(canvas,model) {
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
  renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();
  const camera=new T.OrthographicCamera(-3,3,1.45,-1.45,.1,25);
  camera.position.set(3.0,2.7,7.2);
  camera.lookAt(0,-.05,0);
  const key=new T.DirectionalLight(0xffefd3,2.35);
  key.position.set(2,4,6);
  scene.add(model,key,new T.HemisphereLight(0xf9eadb,0xb09d8c,1.05));
  let lastWidth=0,lastHeight=0;
  return phase=>{
    const width=Math.max(1,canvas.clientWidth), height=Math.max(1,canvas.clientHeight);
    if (width!==lastWidth || height!==lastHeight) {
      lastWidth=width;
      lastHeight=height;
      renderer.setSize(width,height,false);
      const halfWidth=Math.max(2.72,1.43*width/height);
      camera.left=-halfWidth;
      camera.right=halfWidth;
      camera.top=halfWidth*height/width;
      camera.bottom=-camera.top;
      camera.updateProjectionMatrix();
    }
    model.rotation.y=.18*Math.sin(phase*.44);
    renderer.render(scene,camera);
  };
}

export function setupSoilView(model,reducedMotion) {
  const button=document.querySelector('#soil-life'), panel=document.querySelector('#soil-panel');
  const close=document.querySelector('#close-soil'), canvas=document.querySelector('#soil-view');
  let draw, phase=0, unavailable=false;
  function setOpen(open) {
    panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
    if (open) {
      close.focus();
      if (!draw && !unavailable) {
        try { draw=createViewer(canvas,model); }
        catch {
          unavailable=true;
          canvas.hidden=true;
          document.querySelector('#soil-unavailable').hidden=false;
        }
      }
    } else button.focus();
  }
  button.disabled=false;
  button.addEventListener('click',()=>setOpen(panel.hidden));
  close.addEventListener('click',()=>setOpen(false));
  panel.addEventListener('keydown',event=>{
    if (event.key==='Escape') setOpen(false);
  });
  return dt=>{
    if (!draw || panel.hidden || document.body.classList.contains('clean')) return;
    if (!reducedMotion) phase+=dt;
    draw(phase);
  };
}
