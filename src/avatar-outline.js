import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createAvatarOutline(player,installPose){
  const pieces=player.userData.parts.map((mesh,i)=>{
    const geometry=new THREE.EdgesGeometry(mesh.geometry,25);geometry.setAttribute('playerPart',new THREE.Float32BufferAttribute(new Array(geometry.attributes.position.count).fill(i),1));return geometry;
  }),geometry=mergeGeometries(pieces),material=new THREE.LineBasicMaterial({color:'#d2ff83',transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false});
  pieces.forEach(g=>g.dispose());material.onBeforeCompile=installPose;material.customProgramCacheKey=()=> 'player-outline-palette-v1';
  // Share the body's six pose uniforms. Limbs and topmost edges stay aligned
  // without six line draws, extra matrix updates or per-frame vertex uploads.
  const line=new THREE.LineSegments(geometry,material);line.renderOrder=10000;line.visible=false;line.frustumCulled=false;line.layers.set(1);player.add(line);
  let visible=false;
  return {get visible(){return visible;},set(value){visible=value;line.visible=value;},dispose(){player.remove(line);geometry.dispose();material.dispose();}};
}
