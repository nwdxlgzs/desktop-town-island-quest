import * as THREE from 'three';

// Keep the original ground triangles, independent of the renderer's changing
// draw ranges/cache strips. Attributes are immutable and shared, with no GPU draw.
export function createGroundPicker(root,surfaces){
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes=[];
  for(const surface of surfaces){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',surface.geometry.attributes.position);
    if(surface.geometry.index)geometry.setIndex(surface.geometry.index);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);surface.updateMatrix();mesh.matrixAutoUpdate=false;mesh.matrixWorld.copy(surface.matrix);meshes.push(mesh);
  }
  const caster=new THREE.Raycaster(),inverse=new THREE.Matrix4(),hits=[];
  return {pick(ray){
    root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();caster.ray.copy(ray).applyMatrix4(inverse);hits.length=0;
    const hit=caster.intersectObjects(meshes,false,hits)[0];if(!hit)return null;
    const point=hit.point.clone().applyMatrix4(root.matrixWorld);
    return {point,distance:ray.origin.distanceTo(point),walkable:hit.face.normal.y>.5};
  },dispose(){for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}};
}
