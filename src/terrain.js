import { onLand } from './shoreline.js';

export const terrainTileSize=1.3;
export const terrainTopOffset=.075;
// Includes normal walking arm/leg swing and the backpack in any facing direction.
export const playerRadius=.57;
export const maxStepHeight=.6;
export const extraStepHeight=maxStepHeight+terrainTileSize/2;
export const footRadius=.28;
export const riverX=(layout,z)=>layout.river.x+Math.sin(z*.19+layout.river.phase)*layout.river.amplitude;
export function waterAt(layout,x,z,margin=0){
  if(layout.river&&Math.abs(x-riverX(layout,z))<layout.river.width/2+margin)return true;
  return (layout.lakes||[]).some(l=>((x-l.x)/(l.w/2+margin))**2+((z-l.z)/(l.d/2+margin))**2<1);
}
function bankDistance(layout,x,z){
  let distance=layout.river?Math.abs(x-riverX(layout,z))-layout.river.width/2:Infinity;
  for(const l of layout.lakes||[])distance=Math.min(distance,(Math.hypot((x-l.x)/(l.w/2),(z-l.z)/(l.d/2))-1)*Math.min(l.w,l.d)/2);
  return Math.max(0,distance);
}
const smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
const heightCaches=new WeakMap();
const cellCaches=new WeakMap();

export function terrainCellAt(layout,x,z){
  const size=terrainTileSize,ix=Math.floor((x+layout.width/2)/size),iz=Math.floor((z+layout.depth/2)/size);
  const cx=-layout.width/2+(ix+.5)*size,cz=-layout.depth/2+(iz+.5)*size;
  if(ix<0||iz<0||cx>layout.width/2||cz>layout.depth/2)return null;
  let cache;if(layout.terrainReady){cache=cellCaches.get(layout);if(!cache){cache=new Map();cellCaches.set(layout,cache);}if(cache.has(ix*65536+iz))return cache.get(ix*65536+iz);}
  const exists=onLand(layout,cx,cz),wet=exists&&waterAt(layout,cx,cz),elevation=exists?(wet?0:elevationAt(layout,cx,cz)):0;
  const cell=exists?{x:cx,z:cz,ix,iz,wet,elevation,top:elevation+(wet?-terrainTopOffset:terrainTopOffset)}:null;
  cache?.set(ix*65536+iz,cell);return cell;
}

// Feet need supporting floor; the wider body only collides with higher rock.
// Lower neighbours are open space, not walls around a descending stair corner.
export function terrainFootprintBlocked(layout,x,z,radius,allowWater=false){
  const center=terrainCellAt(layout,x,z);if(!center)return true;
  if(radius<=terrainTileSize/2){
    if(center.clearNeighborhood===undefined)center.clearNeighborhood=[-1,0,1].every(dx=>[-1,0,1].every(dz=>{
      const cell=terrainCellAt(layout,center.x+dx*terrainTileSize,center.z+dz*terrainTileSize);
      return cell&&!cell.wet&&cell.elevation-center.elevation<=extraStepHeight+1e-5;
    }));
    if(center.clearNeighborhood)return false;
  }
  let waterAllowed;
  const support=Math.min(radius,footRadius),size=terrainTileSize,half=size/2,minX=Math.floor((x-radius+layout.width/2)/size),maxX=Math.floor((x+radius+layout.width/2)/size),minZ=Math.floor((z-radius+layout.depth/2)/size),maxZ=Math.floor((z+radius+layout.depth/2)/size);
  for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){
    const cx=-layout.width/2+(ix+.5)*size,cz=-layout.depth/2+(iz+.5)*size,dx=Math.max(0,Math.abs(x-cx)-half),dz=Math.max(0,Math.abs(z-cz)-half);
    if(dx*dx+dz*dz>radius*radius+1e-10)continue;
    const cell=terrainCellAt(layout,cx,cz);
    const underFoot=dx*dx+dz*dz<=support*support+1e-10;
    if(!cell){if(underFoot)return true;continue;}
    if(cell.elevation-center.elevation>extraStepHeight+1e-5)return true;
    if(cell.wet&&underFoot){waterAllowed??=typeof allowWater==='function'?allowWater(layout,x,z,support):allowWater;if(!waterAllowed)return true;}
  }
  return false;
}

// The same voxel surface drives rendering, foot placement and traversability.
export function elevationAt(layout,x,z){
  let cellKey;
  if(layout.terrain){
    const ix=Math.floor((x+layout.width/2)/terrainTileSize),iz=Math.floor((z+layout.depth/2)/terrainTileSize);cellKey=ix*65536+iz;
    x=-layout.width/2+terrainTileSize/2+ix*terrainTileSize;
    z=-layout.depth/2+terrainTileSize/2+iz*terrainTileSize;
  }
  let cache,key;
  if(layout.terrainReady){
    cache=heightCaches.get(layout);if(!cache){cache=new Map();heightCaches.set(layout,cache);}
    key=cellKey??`${x.toFixed(4)},${z.toFixed(4)}`;if(cache.has(key))return cache.get(key);
  }
  if(waterAt(layout,x,z))return 0;
  let height=0;
  if(layout.terrain){
    const t=layout.terrain,angle=Math.atan2(z/layout.depth,x/layout.width),index=((angle/(Math.PI*2)+1)%1)*t.coastLayers.length;
    const i=Math.floor(index),f=smooth(index-i),layers=t.coastLayers[i]+(t.coastLayers[(i+1)%t.coastLayers.length]-t.coastLayers[i])*f;
    const outward=Math.min(1,Math.hypot(x/(layout.width/2),z/(layout.depth/2))/.72);
    height=(t.baseLayers*(1-outward)+layers*outward)*t.layerHeight;
    const dock=layout.dock||{x:layout.width/2,z:0};
    height*=smooth(Math.hypot(x-dock.x,z-dock.z)/12);
    height*=Math.min(1,bankDistance(layout,x,z)/(height/.24+2));
  }
  for(const t of layout.terraces||[]){
    const distance=Math.hypot(x-t.x,z-t.z),ramp=t.ramp??3;
    height=Math.max(height,t.height*smooth((t.r+ramp-distance)/ramp));
  }
  for(const w of layout.workshops||[]){
    if(!Number.isFinite(w.elevation))continue;
    const distance=Math.hypot(x-w.position[0],z-w.position[1]);
    if(distance<7){const p=smooth((7-distance)/2.6);height+=(w.elevation-height)*p;}
  }
  for(const p of layout.foundations||[]){
    const outside=Math.max(0,Math.abs(x-p.x)-p.w/2,Math.abs(z-p.z)-p.d/2);
    if(outside<p.ramp)height=Math.max(height,p.height*smooth(1-outside/p.ramp));
  }
  const result=layout.terrain?Math.round(height/.5)*.5:height;
  if(cache)cache.set(key,result);
  return result;
}
export function supportMountain(layout,mountain){
  // Cover every voxel under the whole base, rather than sampling its centre.
  const pad={x:mountain.x,z:mountain.z,w:mountain.w+terrainTileSize*2,d:mountain.d+terrainTileSize*2,ramp:2.6,height:0};
  for(let x=pad.x-pad.w/2;x<=pad.x+pad.w/2+.01;x+=terrainTileSize/2)
    for(let z=pad.z-pad.d/2;z<=pad.z+pad.d/2+.01;z+=terrainTileSize/2)pad.height=Math.max(pad.height,elevationAt(layout,x,z));
  mountain.baseHeight=pad.height;
  (layout.foundations||= []).push(pad);
}
export function supportScenery(layout){
  layout.foundations||=[];
  const supports=layout.mountains.map((object,i)=>({object,key:'baseHeight',pad:layout.foundations[i]}));
  function add(object,key,x,z,w,d){
    const pad={x,z,w:w+terrainTileSize,d:d+terrainTileSize,ramp:2.6,height:0};
    for(let px=x-pad.w/2;px<=x+pad.w/2+.01;px+=terrainTileSize/2)for(let pz=z-pad.d/2;pz<=z+pad.d/2+.01;pz+=terrainTileSize/2)pad.height=Math.max(pad.height,elevationAt(layout,px,pz));
    layout.foundations.push(pad);supports.push({object,key,pad});
  }
  for(const v of layout.villages)for(const h of v.houses)add(h,'baseHeight',h.x,h.z,h.w,h.d);
  for(const c of layout.camps){add(c,'tentHeight',c.x-1,c.z-.6,2,1.9);add(c,'fireHeight',c.x+1.2,c.z+.7,1.6,1.6);add(c,'benchHeight',c.x+.5,c.z+1.7,1.7,.35);}
  // Connected pads share a level so a neighbour's ramp cannot emerge through a
  // building. Level just the footprints; gardens and paths retain their steps.
  for(let pass=0;pass<supports.length;pass++){
    let changed=false;
    for(let i=0;i<supports.length;i++)for(let j=i+1;j<supports.length;j++){
      const a=supports[i].pad,b=supports[j].pad;
      if(Math.abs(a.x-b.x)<(a.w+b.w)/2+Math.max(a.ramp,b.ramp)&&Math.abs(a.z-b.z)<(a.d+b.d)/2+Math.max(a.ramp,b.ramp)&&a.height!==b.height){a.height=b.height=Math.max(a.height,b.height);changed=true;}
    }
    if(!changed)break;
  }
  for(const {object,key,pad} of supports)object[key]=pad.height;
}
export function canWalkSegment(layout,from,to,{up=maxStepHeight,down=maxStepHeight}={}){
  const allowed=(a,b)=>b-a<=up+1e-5&&a-b<=down+1e-5;
  if(layout.terrain){
    // Visit every crossed voxel, including a tiny diagonal corner that a fixed
    // sampling interval could skip. Continuous legacy fixtures use sampling below.
    const times=[0,1];
    for(const [axis,extent]of [['x',layout.width],['z',layout.depth]]){
      const delta=to[axis]-from[axis];if(Math.abs(delta)<1e-12)continue;
      const low=Math.min(from[axis],to[axis]),high=Math.max(from[axis],to[axis]);
      for(let i=Math.floor((low+extent/2)/terrainTileSize)+1; i*terrainTileSize-extent/2<high;i++)times.push((i*terrainTileSize-extent/2-from[axis])/delta);
    }
    times.sort((a,b)=>a-b);let last=walkingHeightAt(layout,from.x,from.z);
    for(let i=1;i<times.length;i++){
      if(times[i]-times[i-1]<1e-10)continue;
      const t=(times[i]+times[i-1])/2,h=walkingHeightAt(layout,from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);
      if(!allowed(last,h))return false;last=h;
    }
    return allowed(last,walkingHeightAt(layout,to.x,to.z));
  }
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.15));
  let last=walkingHeightAt(layout,from.x,from.z);
  for(let i=1;i<=n;i++){
    const h=walkingHeightAt(layout,from.x+(to.x-from.x)*i/n,from.z+(to.z-from.z)*i/n);
    if(!allowed(last,h))return false;
    last=h;
  }
  return true;
}

export function ladderAt(layout,x,z,radius=.8){
  let nearest=null,distance=radius;
  const height=walkingHeightAt(layout,x,z);
  for(const ladder of layout.ladders||[]){
    for(const [fromTop,p]of [[false,ladder.bottom],[true,ladder.top]])
      if(Math.abs(height-p.y)<.7&&Math.hypot(x-p.x,z-p.z)<distance){distance=Math.hypot(x-p.x,z-p.z);nearest={ladder,fromTop};}
  }
  return nearest;
}
// Walking never creates a ramp through a cliff. Ladder links use a separate climb action.
export function walkingHeightAt(layout,x,z){
  return elevationAt(layout,x,z);
}
