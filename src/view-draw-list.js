import * as THREE from 'three';

// One draw can still be spatially culled: its index buffer contains a permanent
// full list for shadow passes, followed by a compact list of visible ranges.
// Only that suffix is uploaded when something crosses the viewport boundary.
export function createViewDrawList(mesh,ranges,indices=null,{faceCulling=false}={}){
  const geometry=mesh.geometry,source=indices||geometry.index?.array||Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i),Index=geometry.attributes.position.count>65535?Uint32Array:Uint16Array;
  const full=new Index(source);
  if(faceCulling){
    const p=geometry.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const range of ranges){
      const groups=new Map();
      for(let i=range.start;i<range.start+range.count;i+=3){
        a.fromBufferAttribute(p,source[i]);b.fromBufferAttribute(p,source[i+1]);c.fromBufferAttribute(p,source[i+2]);
        normal.crossVectors(b.sub(a),c.sub(a)).normalize();const key=`${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)}`;
        if(!groups.has(key))groups.set(key,{ids:[],min:normal.clone(),max:normal.clone()});
        const group=groups.get(key);group.ids.push(source[i],source[i+1],source[i+2]);group.min.min(normal);group.max.max(normal);
      }
      let offset=range.start;range.faces=[];
      for(const group of groups.values()){range.faces.push({start:offset,count:group.ids.length,min:group.min,max:group.max});full.set(group.ids,offset);offset+=group.ids.length;}
    }
  }
  const buffer=new Index(full.length*2);buffer.set(full);buffer.set(full,full.length);
  const attribute=new THREE.BufferAttribute(buffer,1);attribute.setUsage(THREE.DynamicDrawUsage);geometry.setIndex(attribute);geometry.setDrawRange(full.length,full.length);
  const before=mesh.onBeforeShadow,after=mesh.onAfterShadow;let count=full.length,revision=0;
  mesh.onBeforeShadow=function(...args){before.apply(this,args);geometry.setDrawRange(0,full.length);};
  mesh.onAfterShadow=function(...args){geometry.setDrawRange(full.length,count);after.apply(this,args);};
  let selectionTests=0,faceTests=0,directionVersion=0,lastX=NaN,lastY=NaN,lastZ=NaN,lastMode=NaN;
  return {ranges,mesh,get triangles(){return count/3;},get totalTriangles(){return full.length/3;},get revision(){return revision;},get checks(){return {selectionTests,faceTests};},
    update(test,towardCamera=null){
      const materials=mesh.material,multiple=Array.isArray(materials),side=multiple?materials[0]?.side:materials.side,uniformSide=!multiple||materials.every(m=>m.side===side),mode=towardCamera&&uniformSide?(side===THREE.FrontSide?1:side===THREE.BackSide?-1:0):0;
      const x=mode?towardCamera.x*mode:0,y=mode?towardCamera.y*mode:0,z=mode?towardCamera.z*mode:0;
      if(x!==lastX||y!==lastY||z!==lastZ||mode!==lastMode){lastX=x;lastY=y;lastZ=z;lastMode=mode;directionVersion++;}
      let changed=false;for(const range of ranges){selectionTests++;const visible=!!test(range);if(range.inView!==visible){range.inView=visible;changed=true;}
        if(range.faces)for(const face of range.faces){
          let selected=visible;
          if(selected&&mode){
            if(face.directionVersion!==directionVersion){faceTests++;
              // Upper bound over exact normals in this group. Quantization only
              // groups triangles; it never determines whether a face is removed.
              face.facingVisible=(x>=0?face.max.x:face.min.x)*x+(y>=0?face.max.y:face.min.y)*y+(z>=0?face.max.z:face.min.z)*z>=-1e-6;face.directionVersion=directionVersion;
            }
            // Translation/zoom does not change facing in our orthographic view.
            selected=face.facingVisible;
          }
          if(face.inView!==selected){face.inView=selected;changed=true;}
        }
      }
      if(!changed)return false;
      count=0;for(const range of ranges)if(range.inView)for(const part of range.faces||[range])if(part.inView){buffer.set(full.subarray(part.start,part.start+part.count),full.length+count);count+=part.count;}
      if(count){attribute.addUpdateRange(full.length,count);attribute.needsUpdate=true;}
      // A zero draw range still enters Three's program/uniform/VAO setup.
      // Hide empty color batches outright; shadow refresh temporarily restores
      // these casters and the complete index prefix for its own light frustum.
      mesh.userData.colorCulled=count===0;mesh.visible=count!==0;
      geometry.setDrawRange(full.length,count);revision++;return true;
    }
  };
}

// Partition triangles once at island creation. All attributes/vertices remain
// untouched, so baking, picking and fade ranges retain their exact coordinates.
export function spatialDrawList(mesh,cellSize=5.2){
  const g=mesh.geometry,p=g.attributes.position,index=g.index?.array,buckets=new Map();
  const length=index?.length??p.count;
  for(let i=0;i<length;i+=3){
    const a=index?index[i]:i,b=index?index[i+1]:i+1,c=index?index[i+2]:i+2,x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3,key=`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(a,b,c);
  }
  const ranges=[],indices=[],point=new THREE.Vector3();
  for(const ids of buckets.values()){
    const bounds=new THREE.Box3();for(const id of ids)bounds.expandByPoint(point.fromBufferAttribute(p,id));
    ranges.push({start:indices.length,count:ids.length,bounds});indices.push(...ids);
  }
  return createViewDrawList(mesh,ranges,indices,{faceCulling:true});
}

export function createIslandView(root,{staticLists=[],overlayLists=[],npcs=[],props=[],dynamicLists=[]}){
  const sphere=new THREE.Sphere(),box=new THREE.Box3(),bounds=new Map(),all=[...npcs.map(n=>n.object),...props];
  for(const object of new Set(all)){
    object.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(object.matrixWorld).invert();box.makeEmpty();
    object.traverse(mesh=>{if(!mesh.isMesh||mesh.material.visible===false)return;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));box.union(b);});
    bounds.set(object,{local:box.isEmpty()?new THREE.Sphere(new THREE.Vector3(0,1,0),1.5):box.getBoundingSphere(new THREE.Sphere()),world:new THREE.Sphere(),version:-1});
  }
  let lastVersion=-1,lastStaticVersion=-1,changes=0,staticTests=0,overlayTests=0,dynamicTests=0,selectionReady=false,rootX=NaN,rootY=NaN,rootZ=NaN;const entered=new Set();
  function updateStatic(frustum,regions=null){let changed=false;for(const list of staticLists)changed=list.update(r=>{
    staticTests++;if(r.bounds.isEmpty()||r.fading?.())return false;box.copy(r.bounds).translate(root.position);
    if(regions){for(const region of regions)if(region.intersectsBox(box))return true;return false;}
    return frustum.intersectsBox(box);
  },frustum.planes[4].normal)||changed;return changed;}
  return {entered,updateStatic,update(frustum,version,selectStatic=true,dirty=null){
    let changed=false,membershipChanged=!selectionReady;entered.clear();
    const rootMoved=rootX!==root.position.x||rootY!==root.position.y||rootZ!==root.position.z;rootX=root.position.x;rootY=root.position.y;rootZ=root.position.z;
    if(rootMoved)lastStaticVersion=-1;
    // The normal camera pass checks every rig. A later animation pass in the
    // same view only needs the changed sources; invalidation always checks all.
    const visitAll=dirty===null||rootMoved||version!==lastVersion||!selectionReady;
    if(selectStatic&&(rootMoved||version!==lastStaticVersion)){lastStaticVersion=version;changed=updateStatic(frustum)||changed;}
    if(rootMoved||version!==lastVersion){
      lastVersion=version;
      for(const list of overlayLists)changed=list.update(r=>{overlayTests++;return frustum.intersectsBox(box.copy(r.bounds).translate(root.position));})||changed;
    }
    // Moving rigs use a small precomputed local sphere; no recursive bounding
    // box traversal, matrices or animation work for an offscreen actor.
    for(const object of visitAll?bounds.keys():dirty){
      const b=bounds.get(object);if(!b)continue;
      const p=object.position,s=object.scale,q=object.quaternion,x=p.x+root.position.x,y=p.y+root.position.y,z=p.z+root.position.z;
      const moved=b.x!==x||b.y!==y||b.z!==z||b.sx!==s.x||b.sy!==s.y||b.sz!==s.z||b.qx!==q.x||b.qy!==q.y||b.qz!==q.z||b.qw!==q.w;
      if(moved){
        b.x=x;b.y=y;b.z=z;b.sx=s.x;b.sy=s.y;b.sz=s.z;b.qx=q.x;b.qy=q.y;b.qz=q.z;b.qw=q.w;
        sphere.copy(b.local);sphere.center.multiply(s).applyQuaternion(q);sphere.radius*=Math.max(s.x,s.y,s.z);
        b.world.copy(sphere);b.world.center.x+=x;b.world.center.y+=y;b.world.center.z+=z;b.world.radius+=.25;
      }
      if(!moved&&b.version===version&&b.visible===object.visible)continue;
      b.version=version;b.visible=object.visible;dynamicTests++;
      const visible=object.visible&&frustum.intersectsSphere(b.world);
      if(object.userData.inView!==visible){object.userData.inView=visible;membershipChanged=true;changed=true;if(visible)entered.add(object);}
    }
    if(membershipChanged){for(const list of dynamicLists)changed=list.update(r=>r.object.userData.inView!==false&&r.object.visible)||changed;selectionReady=true;}
    if(changed)changes++;return changed;
  },invalidate(){lastVersion=lastStaticVersion=-1;selectionReady=false;},get checks(){return {staticTests,overlayTests,dynamicTests,selectionTests:dynamicLists.reduce((n,l)=>n+l.checks.selectionTests,0),faceTests:staticLists.reduce((n,l)=>n+l.checks.faceTests,0)};},get changes(){return changes;},get selectedTriangles(){return [...staticLists,...overlayLists,...dynamicLists].reduce((n,l)=>n+l.triangles,0);},get totalTriangles(){return [...staticLists,...overlayLists,...dynamicLists].reduce((n,l)=>n+l.totalTriangles,0);},get visibleNPCs(){return npcs.filter(n=>n.object.userData.inView).length;}};
}
