import * as THREE from 'three';

// Fading scenery and the avatar outline start hidden. Waiting for their first
// visible frame to link programs puts the shader stall directly into walking.
// Detached probes share the real materials/geometry without revealing objects,
// changing their layers, uploading poses or drawing extra pixels.
export function warmHiddenShaders(scene,compile){
  const probes=new THREE.Group();
  function visit(object,hidden=false){
    hidden=hidden||!object.visible;
    if(hidden&&(object.layers.mask&2)&&(object.isMesh||object.isLine||object.isPoints)&&[object.material].flat().some(m=>m?.visible))probes.add(object.clone(false));
    for(const child of object.children)visit(child,hidden);
  }
  visit(scene);
  if(!probes.children.length)return Promise.resolve();
  try{return Promise.resolve(compile(probes)).finally(()=>probes.clear());}
  catch(error){probes.clear();return Promise.reject(error);}
}
