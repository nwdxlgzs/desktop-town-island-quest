import { stations, tasks } from './curriculum.js';
import { findPath,clearSegment,terrainNavigationGrid,createNavigator } from './navigation.js';
import { placeLadders } from './ladder-layout.js';
import { createShoreline, onLand, distanceToShore } from './shoreline.js';
export { onLand } from './shoreline.js';

import { randomSource } from './random.js';
export { randomSource } from './random.js';
import { elevationAt, waterAt, riverX, canWalkSegment, supportMountain,supportScenery,terrainFootprintBlocked,playerRadius } from './terrain.js';
import { placeExploration } from './exploration-layout.js';
import { harbourBerth } from './voyage.js';
import { streetLamps } from './street-lamps.js';
import { workshopArchitecture,workshopApplication,chooseWorkshopDesign } from './workshop-designs.js';
import { coastalFences } from './fence-layout.js';
import { mountainObstacles } from './mountain-shape.js';
export { waterAt, riverX } from './terrain.js';

function distanceToSegment(p, a, b) {
  const dx = b.x-a.x, dz = b.z-a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(p.x-a.x-t*dx, p.z-a.z-t*dz);
}
export function workshopObstacles(station) {
  const [x,z] = station.position;
  const dimensions = {mouse:[-.6,3.38,1.13,-.7],text:[-.65,3.23,1.58,-.55],keyboard:[-.6,3.48,1.38,-.6],shortcuts:[-.6,3.58,1.58,-.65],screenshot:[-.8,2.93,1.18,-.6],delivery:[-.6,3.23,1.33,-.6]};
  const [dx,w,d,dz] = dimensions[station.theme];
  const objects = [
    ...workshopArchitecture(station).obstacles.map(o=>({...o,x:x+o.x,z:z+o.z})),
    {x:x+dx,z:z+dz,w,d,type:'counter'},
    {x:x+2.35,z:z-1.65,w:.51,d:.51,type:'plant'},
    {x:x+2.3,z:z+2.3,w:.26,d:.26,type:'lamp'}
  ];
  const furniture = {
    mouse:[[-1.65,1.42,1,.9],[1.8,1.75,.7,.7]],
    text:[[-1.5,1.7,.92,.92],[.12,.85,.5,.5]],
    keyboard:[[-1.8,1.55,.8,.85]],
    shortcuts:[[-1.1,1.52,.7,.7],[-.3,1.52,.7,.7]],
    screenshot:[[-1.25,1.4,1.28,.76],[.8,-.95,.2,.2]],
    delivery:[[-1.5,1.35,.75,.68],[1.3,1.6,1.45,.8]]
  };
  furniture[station.theme].forEach(([dx,dz,w,d])=>objects.push({x:x+dx,z:z+dz,w,d,type:'furniture'}));
  return objects;
}
export const nearRoad = (layout,p,distance=1) => layout.roads.some(r=>distanceToSegment(p,r.a,r.b)<distance);
const obstacleIndices=new WeakMap();
function nearbyObstacles(layout,x,z) {
  if(!obstacleIndices.has(layout)) {
    const grid=new Map();
    for(const o of layout.obstacles)for(let ix=Math.floor((o.x-o.w/2-1)/4);ix<=Math.floor((o.x+o.w/2+1)/4);ix++)for(let iz=Math.floor((o.z-o.d/2-1)/4);iz<=Math.floor((o.z+o.d/2+1)/4);iz++) {const key=`${ix},${iz}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(o);}
    obstacleIndices.set(layout,grid);
  }
  return obstacleIndices.get(layout).get(`${Math.floor(x/4)},${Math.floor(z/4)}`)||[];
}
const bridgeClearance=(layout,x,z,radius)=>nearRoad(layout,{x,z},Math.max(.2,.95-radius));
export function blockedAt(layout, x, z, radius=.28) {
  if(layout.terrain&&layout.terrainReady){
    if(terrainFootprintBlocked(layout,x,z,radius,bridgeClearance))return true;
  }else{
    if(!onLand(layout,x,z,radius+.12))return true;
    if(waterAt(layout,x,z,radius) && !nearRoad(layout,{x,z},Math.max(.2,.95-radius)))return true;
  }
  return nearbyObstacles(layout,x,z).some(o=>{
    const dx=Math.max(0,Math.abs(x-o.x)-o.w/2),dz=Math.max(0,Math.abs(z-o.z)-o.d/2);
    return dx*dx+dz*dz<radius*radius||radius===0&&Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2;
  });
}
class LayoutPlacementError extends Error {}
export function createLayout(level,seed) {
  // Crowded maps grow before retrying; adding missions never leaves an impossible layout.
  for(let attempt=0;attempt<10;attempt++){
    try{return generateLayout(level,(seed+Math.imul(attempt,0x9E3779B9))>>>0,1.1*(1+attempt*.1));}
    catch(error){if(!(error instanceof LayoutPlacementError)||attempt===9)throw error;}
  }
}
function generateLayout(level, seed,scale) {
  let hash=seed>>>0;
  for(const letter of level.id)hash=Math.imul(hash^letter.charCodeAt(0),16777619);
  const random=randomSource(hash),integer=r=>r[0]+Math.floor(random()*(r[1]-r[0]+1));
  const requestedCount=integer(level.map.workshopCount);
  const configuredWidth=integer(level.map.width),configuredDepth=integer(level.map.depth);
  const spacing=level.map.density==='scattered'?330:level.map.density==='clustered'?210:260;
  const minimumArea=Math.max(1,requestedCount)*spacing;
  const width=Math.ceil(Math.max(configuredWidth,Math.ceil(Math.sqrt(minimumArea*configuredWidth/configuredDepth)))*scale);
  const depth=Math.ceil(Math.max(configuredDepth,Math.ceil(minimumArea/(width/scale)))*scale);
  const bundles=level.workshops.map(w=>({...w,tasks:[...w.tasks]})),count=bundles.length;
  const shapes=level.map.shapes,shoreline=createShoreline(width,depth,shapes[Math.floor(random()*shapes.length)],random),shoreX=shoreline.points[0].x;
  const layout={level,width,depth,shoreline,shoreX,workshops:[],spawn:null,dock:{x:shoreX-1.3,z:0},boat:{x:shoreX+3.4,z:0},
    bounds:{minX:-width/2+.5,maxX:width/2-.5,minZ:-depth/2+.5,maxZ:depth/2-.5},
    seed:hash,roads:[],trees:[],mountains:[],lakes:[],villages:[],camps:[],forests:[],reefs:[],terraces:[],obstacles:[],terrain:{baseLayers:integer(level.map.baseLayers||[1,5]),layerHeight:.75,coastLayers:Array.from({length:12},()=>integer(level.map.baseLayers||[1,5]))},
    river:level.map.features.river?{x:(random()-.5)*width*.13,width:2.6+random()*.9,amplitude:1.4+random(),phase:random()*6}:null};
  layout.boat=harbourBerth(layout);
  const used=new Map();
  for(const bundle of bundles){
    const number=(used.get(bundle.id)||0)+1;used.set(bundle.id,number);
    const theme=stations.find(s=>s.id===bundle.theme);
    let p=null;
    for(let tries=0;tries<3000;tries++){
      const x=(random()*2-1)*(width/2-4.5),z=(random()*2-1)*(depth/2-5);
      if(![-3.5,3.5].every(dx=>[-3.4,4.2].every(dz=>onLand(layout,x+dx,z+dz,.45))))continue;
      if(Math.abs(x-(layout.dock.x-1))<3.9&&Math.abs(z-layout.dock.z)<4.2)continue;
      if(layout.river && [-3,0,3].some(dz=>Math.abs(x-riverX(layout,z+dz))<5.5))continue;
      const gap=level.map.density==='scattered'?13:level.map.density==='mixed'?10.2:8.7;
      if(layout.workshops.some(w=>Math.abs(w.position[0]-x)<gap&&Math.abs(w.position[1]-z)<gap+.5))continue;
      p={x,z};break;
    }
    if(!p)throw new LayoutPlacementError(`Map too small for ${count} workshops in ${level.id}`);
    const application=workshopApplication(bundle.tasks.map(id=>tasks[id]?.kind||''));
    const s={...theme,...bundle,application,design:chooseWorkshopDesign(application,layout.workshops,random),id:`${bundle.id}-${number}`,name:bundle.name+(bundles.filter(b=>b.id===bundle.id).length>1?` · ${number}号工坊`:''),position:[p.x,p.z],approach:[p.x,p.z+3.3]};
    layout.workshops.push(s);layout.obstacles.push(...workshopObstacles(s));
  }
  layout.spawn=count===1?{x:layout.workshops[0].approach[0],z:layout.workshops[0].approach[1]+.65}:{x:layout.dock.x-1,z:layout.dock.z};
  // Establish a road network before adding terrain: all water crossings become bridges.
  const roadLayout={...layout,obstacles:[...layout.obstacles],river:null,lakes:[]};
  const baseBlocked=(x,z)=>blockedAt(roadLayout,x,z,.38);
  const initialRoad=[layout.dock,...findPath(layout.dock,layout.spawn,baseBlocked,layout.bounds)];
  for(let i=1;i<initialRoad.length;i++)if(Math.hypot(initialRoad[i].x-initialRoad[i-1].x,initialRoad[i].z-initialRoad[i-1].z)>1e-6)layout.roads.push({a:initialRoad[i-1],b:initialRoad[i]});
  const connected=[layout.dock,layout.spawn];
  if(layout.river){
    const west={x:Math.min(...shoreline.points.filter(p=>Math.abs(p.z)<1).map(p=>p.x))+2,z:0},points=[layout.dock,...findPath(layout.dock,west,baseBlocked,layout.bounds)];
    for(let i=1;i<points.length;i++)layout.roads.push({a:points[i-1],b:points[i]});
    connected.push(...points);
  }
  for(const s of layout.workshops){
    const goal={x:s.approach[0],z:s.approach[1]};
    const start=connected.reduce((a,b)=>Math.hypot(a.x-goal.x,a.z-goal.z)<Math.hypot(b.x-goal.x,b.z-goal.z)?a:b);
    const points=[start,...findPath(start,goal,baseBlocked,layout.bounds)];
    if(points.length<2)throw new LayoutPlacementError(`Unreachable workshop in ${level.id}`);
    for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z)>1e-6)layout.roads.push({a:points[i-1],b:points[i]});
    connected.push(goal,...points);
  }
  if(count>1)layout.roads.push({a:layout.dock,b:layout.spawn});
  const occupied=[];
  function available(x,z,w,d){
    if(![-w/2,w/2].every(dx=>[-d/2,d/2].every(dz=>onLand(layout,x+dx,z+dz,.8))))return false;
    if([layout.spawn,layout.dock].some(p=>Math.abs(x-p.x)<w/2+2&&Math.abs(z-p.z)<d/2+2))return false;
    if(layout.workshops.some(s=>Math.abs(x-s.position[0])<w/2+3.9&&Math.abs(z-s.position[1])<d/2+4.1))return false;
    if(nearRoad(layout,{x,z},Math.max(w,d)/2+1.4))return false;
    if(layout.river && Math.abs(x-riverX(layout,z))<w/2+layout.river.width/2+2)return false;
    return !occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+1.2&&Math.abs(z-o.z)<(d+o.d)/2+1.2);
  }
  function place(w,d){for(let i=0;i<2000;i++){const x=(random()*2-1)*(width/2-2),z=(random()*2-1)*(depth/2-2);if(available(x,z,w,d)){const p={x,z,w,d};occupied.push(p);return p;}}return null;}
  // Larger features go first; dimensions shrink if a crowded random map needs it.
  for(const [key,range] of Object.entries(level.map.features)){
    if(key==='river')continue;
    const n=integer(range);
    for(let i=0;i<n;i++){
      let p=null;
      for(const scale of [1,.8,.65]){const size=key==='villages'?9:key==='camps'?5.5:key==='mountains'?7:6;p=place(size*scale,(key==='mountains'?size*.8:size)*scale);if(p)break;}
      if(!p)throw new LayoutPlacementError(`Map too crowded for ${key} in ${level.id}`);
      if(key==='mountains'){p.height=3.5+random()*3;layout.mountains.push(p);layout.obstacles.push(...mountainObstacles(p,level.biome?.id));}
      if(key==='lakes')layout.lakes.push(p);
      if(key==='villages'){
        p.houses=[{x:p.x-p.w*.24,z:p.z-p.d*.2,w:2.6,d:2.6,color:'#e4bd88'},{x:p.x+p.w*.24,z:p.z+p.d*.2,w:2.6,d:2.6,color:'#d6bfa4'}];
        layout.villages.push(p);layout.obstacles.push(...p.houses.map(h=>({...h,type:'house'})));
      }
      if(key==='camps'){layout.camps.push(p);layout.obstacles.push({x:p.x-1,z:p.z-.6,w:2,d:1.8,type:'tent'},{x:p.x+1.2,z:p.z+.7,w:.65,d:.65,type:'fire'});}
    }
  }
  // Building terraces have shallow approaches; natural cliffs stay off teaching roads.
  for(const s of layout.workshops){
    const [x,z]=s.position,base=elevationAt(layout,x,z);
    s.elevation=Math.round((base+(random()<.5?0:.5+random()))/.5)*.5;
  }
  for(let i=0;i<2;i++)for(let tries=0;tries<80;tries++){
    const terrace={x:(random()*2-1)*(width/2-6),z:(random()*2-1)*(depth/2-6),r:2.5+random()*3,ramp:.18,height:4+random()*3,cliff:true};
    if(!onLand(layout,terrace.x,terrace.z,terrace.r+1)||nearRoad(layout,terrace,terrace.r+3)||layout.workshops.some(s=>Math.hypot(s.position[0]-terrace.x,s.position[1]-terrace.z)<terrace.r+8)||waterAt(layout,terrace.x,terrace.z,terrace.r+1))continue;
    layout.terraces.push(terrace);break;
  }
  for(let i=0;i<(count===1?0:3);i++){const p=place(2,2);if(p)layout.forests.push({...p,radius:4+random()*3});}
  const treeCount=integer(level.map.trees);
  for(let i=0;i<treeCount*100&&layout.trees.length<treeCount;i++){
    const forest=layout.forests.length&&random()<.75?layout.forests[Math.floor(random()*layout.forests.length)]:null;
    const t=forest?{x:forest.x+(random()*2-1)*forest.radius,z:forest.z+(random()*2-1)*forest.radius}:{x:(random()*2-1)*(width/2-1),z:(random()*2-1)*(depth/2-1)};
    t.scale=.85+random()*.65;t.pine=random()<.35;
    if([layout.spawn,layout.dock].some(p=>Math.hypot(t.x-p.x,t.z-p.z)<2))continue;
    if(!onLand(layout,t.x,t.z,1.4)||waterAt(layout,t.x,t.z,1)||nearRoad(layout,t,1.7))continue;
    if(layout.workshops.some(s=>Math.abs(t.x-s.position[0])<3.8&&Math.abs(t.z-s.position[1])<4.1))continue;
    if(layout.obstacles.some(o=>Math.abs(t.x-o.x)<o.w/2+1.1&&Math.abs(t.z-o.z)<o.d/2+1.1)||layout.trees.some(o=>Math.hypot(t.x-o.x,t.z-o.z)<1.6))continue;
    layout.trees.push(t);layout.obstacles.push({x:t.x,z:t.z,w:.5*t.scale,d:.5*t.scale,type:'tree'});
  }
  for(let i=0;i<Math.max(8,Math.round((width+depth)/8));i++){
    const angle=random()*Math.PI*2,radius=Math.max(width,depth)/2+12+random()*18;
    const reef={x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,r:.35+random()*.9,height:.18+random()*.45};
    if(onLand(layout,reef.x,reef.z,-.6)||distanceToShore(layout,reef.x,reef.z)<10||Math.hypot(reef.x-layout.boat.x,reef.z-layout.boat.z)<10)continue;
    layout.reefs.push(reef);
  }
  layout.mountains.forEach(m=>supportMountain(layout,m));
  supportScenery(layout);
  layout.terrainReady=true;
  placeLadders(layout);
  // Re-route teaching paths over the finished terrain, including legal steps and ramps.
  const finalRoads=[],navigationGrid=terrainNavigationGrid(layout);
  for(const goal of [layout.dock,...layout.workshops.map(w=>({x:w.approach[0],z:w.approach[1]}))]){
    if(Math.hypot(goal.x-layout.spawn.x,goal.z-layout.spawn.z)<.01)continue;
    const path=findPath(layout.spawn,goal,(x,z)=>blockedAt(layout,x,z,playerRadius),layout.bounds,(a,b)=>canWalkSegment(layout,a,b),layout.ladders,null,navigationGrid);
    if(!path.length||Math.hypot(path.at(-1).x-goal.x,path.at(-1).z-goal.z)>.15)throw new LayoutPlacementError(`No safe elevation route in ${level.id}`);
    const points=[layout.spawn,...path];for(let i=1;i<points.length;i++)if(!points[i].ladder)finalRoads.push({a:points[i-1],b:points[i]});
  }
  layout.roads=layout.roads.filter(r=>canWalkSegment(layout,r.a,r.b));
  layout.roads.push(...finalRoads);
  layout.fences=coastalFences(layout);
  layout.obstacles.push(...layout.fences.map(f=>({x:f.x+(f.axis==='x'?f.length/2:0),z:f.z+(f.axis==='z'?f.length/2:0),w:f.axis==='x'?f.length+.16:.16,d:f.axis==='z'?f.length+.16:.16,type:'fence'})));
  layout.lamps=streetLamps(layout);
  layout.obstacles.push(...layout.lamps.map(l=>({x:l.x,z:l.z,w:.35,d:.35,type:'street-lamp'})));
  obstacleIndices.delete(layout);
  // Verify the final geometry, after roads/bridges, fences and lamps settle.
  // Decorative ladders must never let a player descend into a disconnected pocket.
  const blocked=(x,z)=>blockedAt(layout,x,z,playerRadius),traverse=(a,b)=>canWalkSegment(layout,a,b);
  const access=createNavigator(blocked,layout.bounds,traverse,layout.ladders,navigationGrid);
  layout.ladders=layout.ladders.filter(l=>[l.bottom,l.top].every(p=>access.findPath(p,layout.dock).length));
  const finalAccess=createNavigator(blocked,layout.bounds,traverse,layout.ladders,navigationGrid);
  for(const p of [layout.spawn,...layout.workshops.map(w=>({x:w.approach[0],z:w.approach[1]})),...layout.ladders.flatMap(l=>[l.bottom,l.top])]){
    if(!finalAccess.findPath(p,layout.dock).length)throw new LayoutPlacementError(`No safe return route in ${level.id}`);
  }
  // Spawn residents from the verified connected road network, never an isolated cliff.
  layout.npcSpawns={};
  const preferences=[...layout.workshops.map(w=>({key:w.id,x:w.position[0]+1.75,z:w.position[1]-.8})),...layout.villages.map((v,i)=>({key:`village-${i}`,x:v.x,z:v.z})),...layout.camps.map((c,i)=>({key:`camp-${i}`,x:c.x+1.1,z:c.z-.7}))];
  for(const p of preferences){
    const anchors=finalRoads.map(r=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,t=Math.max(0,Math.min(1,((p.x-r.a.x)*dx+(p.z-r.a.z)*dz)/(dx*dx+dz*dz||1)));return {x:r.a.x+dx*t,z:r.a.z+dz*t};}).concat(layout.spawn).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
    const anchor=anchors.slice(0,5).find(a=>clearSegment(a,p,(x,z)=>blockedAt(layout,x,z,.34),(a,b)=>canWalkSegment(layout,a,b)));
    layout.npcSpawns[p.key]=anchor?{x:p.x,z:p.z}:{...anchors[0]};
  }
  placeExploration(layout);
  return layout;
}
