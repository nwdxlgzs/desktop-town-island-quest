import * as THREE from 'three';
import { elevationAt,terrainTileSize } from './terrain.js';
import { onLand } from './shoreline.js';

// Index the actual paving/floor rectangles once while building the island.
// Moving footprints query one small bin, rather than raycasting the whole town.
export function createGroundReceivers(){
  const bins=new Map(),size=terrainTileSize,key=(x,z)=>(x+32768)*65536+z+32768;
  return {add(x,z,w,d,y){
    const rect={left:x-w/2,right:x+w/2,bottom:z-d/2,top:z+d/2,y};
    for(let ix=Math.floor(rect.left/size);ix<=Math.floor(rect.right/size);ix++)for(let iz=Math.floor(rect.bottom/size);iz<=Math.floor(rect.top/size);iz++){
      const id=key(ix,iz);if(!bins.has(id))bins.set(id,[]);bins.get(id).push(rect);
    }
  },heightAt(x,z,base){
    let height=base;for(const r of bins.get(key(Math.floor(x/size),Math.floor(z/size)))||[])if(x>=r.left&&x<=r.right&&z>=r.bottom&&z<=r.top)height=Math.max(height,r.y);
    return height;
  }};
}

// A small CPU bake at island creation. Spatial bins hold projected caster
// bounds; shading becomes one vertex attribute, with no texture or extra draw.
export function bakeIslandShadows(root,layout,casters){
  const sun=layout.level.environment?.sun||[-12,28,16],direction=new THREE.Vector3(...sun).normalize(),bins=new Map(),binSize=4,cache=new Map();
  const strength={value:0},receivers=[];
  for(const box of casters){
    const distance=Math.max(0,(box.max.y+2)/Math.max(.12,direction.y));
    const dx=-direction.x*distance,dz=-direction.z*distance;
    const minX=Math.floor((box.min.x+Math.min(0,dx))/binSize),maxX=Math.floor((box.max.x+Math.max(0,dx))/binSize),minZ=Math.floor((box.min.z+Math.min(0,dz))/binSize),maxZ=Math.floor((box.max.z+Math.max(0,dz))/binSize);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(box);}
  }
  const ray=new THREE.Ray(new THREE.Vector3(),direction),hit=new THREE.Vector3();let samples=0;
  function shade(x,y,z,nx,ny,nz){
    const key=`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)},${nx},${ny},${nz}`;
    if(cache.has(key))return cache.get(key);
    samples++;ray.origin.set(x+nx*.06,y+ny*.06+.025,z+nz*.06);
    let value=1;
    for(const box of bins.get(`${Math.floor(x/binSize)},${Math.floor(z/binSize)}`)||[]){if(ray.intersectBox(box,hit)&&hit.distanceToSquared(ray.origin)>.015){value=0;break;}}
    if(value){
      const horizontal=Math.hypot(direction.x,direction.z),step=terrainTileSize/Math.max(.2,horizontal);
      // Terrain self-shadows, bounded by the maximum generated mountain height.
      for(let t=step;t*direction.y<12&&t<Math.hypot(layout.width,layout.depth);t+=step){
        const px=x+direction.x*t,pz=z+direction.z*t;
        if(!onLand(layout,px,pz))continue;
        if(elevationAt(layout,px,pz)+.075>y+direction.y*t+.08){value=0;break;}
      }
    }
    cache.set(key,value);return value;
  }
  root.traverse(mesh=>{
    if(!mesh.userData.terrain&&!mesh.userData.groundSurface)return;
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,values=new Float32Array(p.count);
    for(let i=0;i<p.count;i++)values[i]=shade(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i));
    mesh.geometry.setAttribute('bakedShade',new THREE.BufferAttribute(values,1));mesh.material.defines={...mesh.material.defines,BAKED_VOXEL_SHADOW:1};mesh.material.userData.bakedShadowStrength=strength;mesh.material.needsUpdate=true;receivers.push(mesh);
  });
  return {setEnabled(value){strength.value=value?1:0;},samples,receivers:receivers.length};
}

// Prepainted contact shadows keep moving feet grounded in the baked/cache
// modes, without rerendering the entire scene into a shadow map.
export function createContactShadows(scene){
  const data=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);data[i]=data[i+1]=data[i+2]=37;data[i+3]=Math.round(Math.max(0,1-r)**1.5*90);}
  const texture=new THREE.DataTexture(data,32,32);texture.needsUpdate=true;texture.magFilter=texture.minFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),mesh=new THREE.InstancedMesh(geometry,material,16),dummy=new THREE.Object3D();
  mesh.frustumCulled=false;mesh.visible=false;mesh.matrixAutoUpdate=false;mesh.layers.set(1);scene.add(mesh);
  material.userData.contactFootprint=true;
  const slots=Array.from({length:16},()=>({object:null,x:NaN,z:NaN,ground:0,cellX:NaN,cellZ:NaN,platform:false}));
  let previousIsland=null,offsetX=NaN,offsetZ=NaN,updates=0,groundSamples=0;
  return {update(island,player,enabled){
    mesh.visible=enabled;if(!enabled)return;
    const changedIsland=previousIsland!==island||offsetX!==island.root.position.x||offsetZ!==island.root.position.z;
    previousIsland=island;offsetX=island.root.position.x;offsetZ=island.root.position.z;
    let count=0,changed=false;
    function add(o){
      if(count===16||!o.visible||o.userData.inView===false)return;
      const i=count++,state=slots[i],p=o.position,horizontal=changedIsland||state.object!==o||state.x!==p.x||state.z!==p.z;
      // Fixed footprint: breathing, jumping, turning and limb animation cause
      // no ground queries, matrix changes or instance uploads.
      if(!horizontal)return;
      if(horizontal){
        const localX=o===player?p.x-offsetX:p.x,localZ=o===player?p.z-offsetZ:p.z,platform=island.layout.workshops.some(w=>Math.abs(localX-w.position[0])<2.85&&Math.abs(localZ-w.position[1])<2.85);
        const cellX=Math.floor((localX+island.layout.width/2)/terrainTileSize),cellZ=Math.floor((localZ+island.layout.depth/2)/terrainTileSize);
        // Real voxel terrain is constant across a cell. Still detect workshop
        // edges within that cell, where the raised floor changes the height.
        if(changedIsland||state.object!==o||!island.layout.terrain||!island.layout.terrainReady||state.cellX!==cellX||state.cellZ!==cellZ||state.platform!==platform){state.ground=elevationAt(island.layout,localX,localZ);groundSamples++;}
        state.cellX=cellX;state.cellZ=cellZ;state.platform=platform;
      }
      const localX=o===player?p.x-offsetX:p.x,localZ=o===player?p.z-offsetZ:p.z;
      // Paving is at +.13, above the former +.09 footprint. Sampling only the
      // voxel buried the entire shadow when a character stopped on a road.
      const receiver=island.groundReceivers?.heightAt(localX,localZ,state.ground+.075)??state.ground+(state.platform?.272:.075);
      dummy.position.set(p.x+(o===player?0:offsetX),receiver+.015,p.z+(o===player?0:offsetZ));dummy.scale.setScalar(o.userData.contactSize??1.1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.instanceMatrix.addUpdateRange(i*16,16);changed=true;
      state.object=o;state.x=p.x;state.z=p.z;
    }
    add(player);for(const n of island.npcs)add(n.object);for(const a of island.wildlife)add(a.object);mesh.count=count;
    if(changed){mesh.instanceMatrix.needsUpdate=true;updates++;}
  },get stats(){return {updates,groundSamples};},dispose(){scene.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();texture.dispose();}};
}
