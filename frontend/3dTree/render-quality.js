import { THREE as T } from './vendor/three-runtime.js';

// Use smooth texture filtering on the existing GLB surfaces, including leaf masks.
export function refineSceneMaterials(scene,renderer) {
  const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const multisampled=renderer.getContext().getContextAttributes().antialias;
  const seenMaterials=new Set(), seenTextures=new Set();
  scene.traverse(node=>{
    if(!node.isMesh) return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]) {
      if(seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      // Smooth the silhouette of individual leaves with MSAA coverage.
      // Alpha hashing is deliberately avoided because it introduces visible grain.
      if(material.alphaTest>0) material.alphaToCoverage=multisampled;
      for(const texture of Object.values(material)) {
        if(!texture?.isTexture || texture.isRenderTargetTexture || seenTextures.has(texture)) continue;
        seenTextures.add(texture);
        texture.magFilter=T.LinearFilter;
        texture.minFilter=T.LinearMipmapLinearFilter;
        texture.generateMipmaps=true;
        texture.anisotropy=anisotropy;
        texture.needsUpdate=true;
      }
      material.needsUpdate=true;
    }
  });
}

export function drawingRatio(renderer,width,height,lowQuality,pixelBudget) {
  const maximum=renderer.getContext().getParameter(renderer.getContext().MAX_VIEWPORT_DIMS);
  const textureLimit=renderer.capabilities.maxTextureSize;
  return Math.min(window.devicePixelRatio||1,lowQuality?1:2,
    Math.sqrt((lowQuality?1700000:pixelBudget)/(width*height)),
    maximum[0]/width,maximum[1]/height,textureLimit/Math.max(width,height));
}

export function createFrameBudget() {
  let scale=1, time=0, frames=0, steady=0;
  return {
    get scale(){ return scale; },
    sample(ms) {
      time+=Math.min(ms,150);
      frames++;
      if(time<1200) return false;
      const average=time/frames;
      time=0;
      frames=0;
      if(average>24 && scale>.56) {
        scale=Math.max(.56,scale*.84);
        steady=0;
        return true;
      }
      steady=average<18.4?steady+1:0;
      if(steady>=3 && scale<1) {
        scale=Math.min(1,scale*1.09);
        steady=0;
        return true;
      }
      return false;
    },
  };
}
