import * as THREE from 'three';

// Color visibility and shadow visibility are different. Offscreen geometry
// may still cast a shadow into the view; restore it only for shadow refreshes.
export function revealCulledCasters(root){
  const hidden=[];
  root.traverse(o=>{if(o.userData.colorCulled&&!o.visible&&o.castShadow){hidden.push(o);o.visible=true;}});
  return ()=>{for(const o of hidden)o.visible=false;};
}

// Moving figures use fixed contact footprints in static shadow modes. Never
// bake their starting pose (or the departing boat) into the island's map.
export function configureShadowCasters(root,fixed){
  root.traverse(o=>{if(o.userData.dynamicShadow||o.userData.residentBatch||o.userData.movingPropBatch)o.castShadow=!fixed;});
}

// Refresh with both layers before a static color capture, so residents still
// cast shadows. Use the public render entry point (it owns Three's render
// state), with just one color pixel instead of another full-size scene pass.
export function createShadowRefresh(renderer,scene,camera){
  let updates=0,target=null;const ranges=new Map();
  // ShadowMap uses each caster's original material. Only the unused one-pixel
  // color pass uses this clipped shader, avoiding another lighting/filtering
  // program and material switch for every island batch.
  const setupMaterial=new THREE.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(2.,2.,2.,1.);}',fragmentShader:'void main(){discard;}',depthTest:false,depthWrite:false,colorWrite:false,toneMapped:false});
  // This callback runs only for the color pass, after all real shadow passes.
  // Clipping in the shader still submitted every vertex; an empty draw range
  // avoids that vertex work. Shared cube/index ranges are restored in finally.
  setupMaterial.onBeforeRender=(_renderer,_scene,_camera,geometry)=>{
    if(!ranges.has(geometry))ranges.set(geometry,{...geometry.drawRange});
    geometry.setDrawRange(0,0);
  };
  return {refresh(){
    if(!renderer.shadowMap.enabled||!renderer.shadowMap.needsUpdate)return false;
    target??=new THREE.WebGLRenderTarget(1,1,{stencilBuffer:false,depthBuffer:false});
    const mask=camera.layers.mask,saved=renderer.getRenderTarget(),override=scene.overrideMaterial;camera.layers.enable(0);camera.layers.enable(1);
    const restore=revealCulledCasters(scene);
    try{scene.overrideMaterial=setupMaterial;renderer.setRenderTarget(target);renderer.render(scene,camera);updates++;}
    finally{restore();for(const [geometry,range]of ranges)geometry.setDrawRange(range.start,range.count);ranges.clear();scene.overrideMaterial=override;camera.layers.mask=mask;renderer.setRenderTarget(saved);}
    return true;
  },get updates(){return updates;},dispose(){target?.dispose();target=null;setupMaterial.dispose();}};
}
