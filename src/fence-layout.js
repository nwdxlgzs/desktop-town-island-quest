import { onLand } from './shoreline.js';
import { elevationAt, terrainTileSize, waterAt } from './terrain.js';
import { nearRoad } from './level-layout.js';

// Short level runs on the existing voxel coast. All rail samples are inside
// the player's shore clearance: decoration never takes away a walkable route.
// The result is baked into static scenery, with no fence objects to animate.
export function coastalFences(layout){
  const size=terrainTileSize,half=size/2,cells=new Map(),edges=new Map();
  const nx=Math.ceil(layout.width/size),nz=Math.ceil(layout.depth/size);
  for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
    const x=-layout.width/2+half+ix*size,z=-layout.depth/2+half+iz*size;
    if(x>layout.width/2||z>layout.depth/2||!onLand(layout,x,z)||waterAt(layout,x,z))continue;
    cells.set(`${ix},${iz}`,{ix,iz,x,z,y:elevationAt(layout,x,z)});
  }
  function clear(x,z){
    return !onLand(layout,x,z,.39)&&onLand(layout,x,z,-.25)&&!waterAt(layout,x,z,.2)
      &&!nearRoad(layout,{x,z},2)&&Math.hypot(x-layout.dock.x,z-layout.dock.z)>4
      &&Math.hypot(x-layout.spawn.x,z-layout.spawn.z)>2.5
      &&!layout.workshops.some(w=>Math.abs(x-w.position[0])<3.5&&Math.abs(z-w.position[1])<3.8)
      &&!(layout.ladders||[]).some(l=>[l.bottom,l.top].some(q=>Math.hypot(x-q.x,z-q.z)<2));
  }
  for(const c of cells.values())for(const [dx,dz]of [[0,-1],[0,1],[-1,0],[1,0]]){
    if(cells.has(`${c.ix+dx},${c.iz+dz}`))continue;
    const axis=dz?'x':'z',x=c.x+dx*(half-.12),z=c.z+dz*(half-.12);
    if(![-half+.12,0,half-.12].every(t=>clear(x+(dz?t:0),z+(dx?t:0))))continue;
    const line=dz?c.iz:c.ix,index=dz?c.ix:c.iz,key=`${axis},${line},${dx+dz},${c.y}`;
    if(!edges.has(key))edges.set(key,[]);edges.get(key).push({index,x,z,y:c.y,axis});
  }
  const runs=[];
  for(const list of edges.values()){
    list.sort((a,b)=>a.index-b.index);let run=[];
    function finish(){
      if(run.length){
        const a=run[0],length=(run.length*size)-.24;
        runs.push({x:a.x-(a.axis==='x'?half-.12:0),z:a.z-(a.axis==='z'?half-.12:0),y:a.y,length,axis:a.axis,
          score:((Math.imul(a.index+13,73856093)^Math.imul(Math.round((a.x+a.z)*10),19349663)^(layout.seed||0))>>>0)});
      }
      run=[];
    }
    for(const c of list){if(run.length&&(c.index!==run.at(-1).index+1||run.length===4))finish();run.push(c);}finish();
  }
  return runs.sort((a,b)=>b.length-a.length||a.score-b.score).slice(0,Math.min(10,4+layout.workshops.length));
}
