import * as THREE from 'three';

// Cull fully buried faces only inside one opaque rigid part. Partial overlaps
// and different articulated parts stay intact for every pose and view angle.
export function exposedBoxGeometry(mesh,peers){
  const geometry=mesh.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index;
  // These models use unsegmented unit cubes. Leave other geometry intact;
  // its six-index face grouping and scale-only bounds need not match ours.
  const supported=m=>m.geometry.type==='BoxGeometry'&&['width','height','depth','widthSegments','heightSegments','depthSegments'].every(k=>m.geometry.parameters[k]===1)&&m.scale.x>0&&m.scale.y>0&&m.scale.z>0;
  if(!supported(mesh)||mesh.rotation.x||mesh.rotation.y||mesh.rotation.z||!index)return geometry;
  const bounds=[];
  for(const other of peers){
    if(other===mesh||!supported(other)||other.rotation.x||other.rotation.y||other.rotation.z||other.material.transparent)continue;
    bounds.push(new THREE.Box3().setFromCenterAndSize(other.position,other.scale));
  }
  if(!bounds.length)return geometry;
  const point=new THREE.Vector3(),outward=new THREE.Vector3(),kept=[],epsilon=.00001;
  for(let i=0;i<index.count;i+=6){
    const covered=bounds.some(box=>{
      for(let j=0;j<6;j++){
        const id=index.getX(i+j);point.fromBufferAttribute(p,id).multiply(mesh.scale).add(mesh.position);
        outward.fromBufferAttribute(n,id).multiplyScalar(epsilon);point.add(outward);
        if(!box.containsPoint(point))return false;
      }
      return true;
    });
    if(!covered)for(let j=0;j<6;j++)kept.push(index.getX(i+j));
  }
  if(kept.length===index.count)return geometry;
  const ids=[...new Set(kept)],remap=new Map(ids.map((id,i)=>[id,i]));
  for(const [name,attribute]of Object.entries(geometry.attributes)){
    const array=new attribute.array.constructor(ids.length*attribute.itemSize);
    ids.forEach((id,i)=>array.set(attribute.array.subarray(id*attribute.itemSize,(id+1)*attribute.itemSize),i*attribute.itemSize));
    geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
  }
  geometry.setIndex(kept.map(id=>remap.get(id)));geometry.clearGroups();return geometry;
}
