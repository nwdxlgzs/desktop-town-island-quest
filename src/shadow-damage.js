import * as THREE from 'three';

// A moving caster can affect receivers anywhere from its own height down to
// the bottom of the island. Keep both the old and new projected volumes, so
// refreshing a small color patch also erases the previous shadow on cliffs.
export function shadowFootprint(bounds,sun,minY=-1.2,out=new THREE.Box3()){
  if(sun.y<=.05||bounds.isEmpty())return null;
  const dy=Math.max(0,bounds.max.y-minY),dx=-sun.x/sun.y*dy,dz=-sun.z/sun.y*dy;
  out.copy(bounds);out.min.y=Math.min(minY,bounds.min.y);
  out.min.x+=Math.min(0,dx);out.max.x+=Math.max(0,dx);out.min.z+=Math.min(0,dz);out.max.z+=Math.max(0,dz);
  return out.expandByScalar(.15);
}

export function createShadowDamage(){
  const states=new Map(),world=new THREE.Box3(),inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  function state(o){
    let s=states.get(o);if(s)return s;
    const local=new THREE.Box3();
    if(o.userData.parts)local.set(new THREE.Vector3(-1.2,-.12,-1.1),new THREE.Vector3(1.2,2.35,1.1));
    else{
      o.updateWorldMatrix(true,true);inverse.copy(o.matrixWorld).invert();
      o.traverse(m=>{if(!m.isMesh||m.material.visible===false)return;m.geometry.computeBoundingBox();world.copy(m.geometry.boundingBox).applyMatrix4(matrix.multiplyMatrices(inverse,m.matrixWorld));local.union(world);});
    }
    s={local,matrix:new THREE.Matrix4(),visible:false,ready:false,parts:[]};states.set(o,s);return s;
  }
  return {regions(sources,sun,padding=.15){
    const regions=[];
    for(const o of sources){
      const s=state(o);if(!s.ready)return null;
      const parts=o.userData.parts||[];if(s.visible===o.visible&&s.matrix.equals(o.matrixWorld)&&parts.every((p,i)=>s.parts[i]?.equals(p.matrixWorld)))continue;
      // All casters are redrawn into the sun map, including small motions that
      // did not themselves trigger it. Cover their old and current footprints.
      if(s.visible) {const old=shadowFootprint(world.copy(s.local).applyMatrix4(s.matrix),sun);if(!old)return null;old.expandByScalar(Math.max(0,padding-.15));regions.push(old);}
      if(o.visible){const next=shadowFootprint(world.copy(s.local).applyMatrix4(o.matrixWorld),sun);if(!next)return null;next.expandByScalar(Math.max(0,padding-.15));regions.push(next);}
    }
    return regions;
  },commit(sources){for(const o of sources){const s=state(o);s.matrix.copy(o.matrixWorld);s.visible=o.visible;s.ready=true;for(const [i,p]of (o.userData.parts||[]).entries())(s.parts[i]??=new THREE.Matrix4()).copy(p.matrixWorld);}},reset(){states.clear();}};
}

// Pixel rectangles include a filter margin, are clipped to the cache, and are
// merged before rendering. Disjoint actors need not repaint the space between.
export function shadowDamageRects(boxes,camera,width,height,padding=4){
  const point=new THREE.Vector3(),rects=[];
  for(const box of boxes){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      point.set(x,y,z).project(camera);const px=(point.x*.5+.5)*width,py=(point.y*.5+.5)*height;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);
    }
    const x=Math.max(0,Math.floor(minX-padding)),y=Math.max(0,Math.floor(minY-padding)),right=Math.min(width,Math.ceil(maxX+padding)),top=Math.min(height,Math.ceil(maxY+padding));
    if(right<=x||top<=y)continue;
    let rect={x,y,right,top};
    for(let i=0;i<rects.length;){const other=rects[i];if(rect.x<=other.right&&rect.right>=other.x&&rect.y<=other.top&&rect.top>=other.y){rect={x:Math.min(rect.x,other.x),y:Math.min(rect.y,other.y),right:Math.max(rect.right,other.right),top:Math.max(rect.top,other.top)};rects.splice(i,1);i=0;}else i++;}
    rects.push(rect);
  }
  return rects;
}
