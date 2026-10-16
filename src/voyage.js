import { onLand, distanceToShore } from './shoreline.js';

export const boatHeight=-.2;
export const hullRadius=1.6;
const clearance=hullRadius+1;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const length=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const shoreBounds=new WeakMap();
const reefCache=new WeakMap();
export function harbourBerth(layout){
  const point={x:layout.shoreX+3.4,z:layout.dock.z};
  while(onLand(layout,point.x,point.z)||distanceToShore(layout,point.x,point.z)<clearance+.35)point.x+=.4;
  return point;
}

// Reefs from the other island may land in a harbour or inside its terrain when
// the two random maps are placed together. Reserve both boat berths consistently
// in the route planner and the rendered sailing scene.
export function voyageReefs(source,destination,offset){
  let cache=reefCache.get(source);if(!cache){cache=new Map();reefCache.set(source,cache);}
  const previous=cache.get(destination);if(previous?.offset===offset)return previous;
  const start=source.boat,end=destination?{x:offset+destination.boat.x,z:destination.boat.z}:start;
  const usable=(r,dx,other,otherOffset)=>{
    const x=r.x+dx,z=r.z,margin=r.r+hullRadius+1.5;
    return Math.hypot(x-start.x,z-start.z)>margin&&Math.hypot(x-end.x,z-end.z)>margin&&(!other||!onLand(other,x-otherOffset,z,-r.r));
  };
  const result={offset,source:(source.reefs||[]).filter(r=>usable(r,0,destination,offset)),destination:destination?(destination.reefs||[]).filter(r=>usable(r,offset,source,0)):[]};
  cache.set(destination,result);return result;
}

export function voyageClear(point,source,destination,offset,padding=0) {
  const reefs=voyageReefs(source,destination,offset);
  const clear=(layout,x,z,rocks)=>{
    if(!shoreBounds.has(layout)){const points=layout.shoreline.points;shoreBounds.set(layout,{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),segments:points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;return {x:a.x,z:a.z,dx,dz,lengthSq:dx*dx+dz*dz,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};})});}
    const b=shoreBounds.get(layout),margin=clearance+padding;
    if(rocks.some(r=>(x-r.x)**2+(z-r.z)**2<(r.r+hullRadius+.35+padding)**2))return false;
    if(x<b.minX-margin||x>b.maxX+margin||z<b.minZ-margin||z>b.maxZ+margin)return true;
    if(onLand(layout,x,z))return false;
    // Most shore segments are far away: bounding checks avoid 96 square roots
    // per sample during visibility routing.
    return !b.segments.some(s=>{if(x<s.minX-margin||x>s.maxX+margin||z<s.minZ-margin||z>s.maxZ+margin)return false;const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.lengthSq));return (x-s.x-s.dx*t)**2+(z-s.z-s.dz*t)**2<=margin*margin;});
  };
  return clear(source,point.x,point.z,reefs.source) && (!destination||clear(destination,point.x-offset,point.z,reefs.destination));
}
function roundRoute(points,radius) {
  const parts=[];let start=points[0];
  for(let i=1;i<points.length-1;i++){
    const corner=points[i],distance=Math.min(radius,length(points[i-1],corner)*.35,length(corner,points[i+1])*.35);
    const enter=mix(corner,points[i-1],distance/length(corner,points[i-1])),leave=mix(corner,points[i+1],distance/length(corner,points[i+1]));
    parts.push({start,end:enter});parts.push({start:enter,control:corner,end:leave});start=leave;
  }
  parts.push({start,end:points.at(-1)});
  const samples=[points[0]];
  for(const part of parts){const distance=length(part.start,part.end)+(part.control?length(part.start,part.control)+length(part.control,part.end):0),count=Math.max(1,Math.ceil(distance/.12));
    for(let i=1;i<=count;i++){const t=i/count;samples.push(part.control?mix(mix(part.start,part.control,t),mix(part.control,part.end,t),t):mix(part.start,part.end,t));}
  }
  let distance=0;const cumulative=[0];for(let i=1;i<samples.length;i++){distance+=length(samples[i-1],samples[i]);cumulative.push(distance);}
  return {samples,cumulative,length:distance};
}

export function createVoyage(source,destination) {
  const offset=destination?source.width/2+destination.width/2+10:0;
  const reefs=voyageReefs(source,destination,offset);
  const start={...source.boat},end=destination?{x:offset+destination.boat.x,z:destination.boat.z}:{...source.boat};
  if(!destination){
    // A small loop off the home dock for the graduation send-off, including reef clearance.
    for(const size of [7,5,3]){const points=[start,{x:start.x+size,z:-size*.6},{x:start.x+size*1.5,z:0},{x:start.x+size,z:size*.6},end],route=roundRoute(points,size*.7);if(route.samples.every(p=>voyageClear(p,source,null,0)))return {...route,offset,start,end};}
    throw new Error('Unable to find a clear graduation sailing loop');
  }
  // Visibility routing around inflated coast samples chooses the shorter north/south passage.
  // Extra space around these nodes permits continuous rounded turns without touching land.
  const nodes=[start,end];
  for(const [island,dx] of [[source,0],[destination,offset]]){
    const r=Math.max(...island.shoreline.radii);
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2;nodes.push({x:dx+Math.cos(a)*(island.width*r/2+5),z:Math.sin(a)*(island.depth*r/2+5)});}
    for(const reef of island===source?reefs.source:reefs.destination){
      const x=reef.x+dx,z=reef.z;
      if(x<start.x-8||x>end.x+8||Math.abs(z)>Math.max(source.depth,destination.depth)/2+10)continue;
      for(let i=0;i<10;i++){const angle=i/10*Math.PI*2,radius=reef.r+hullRadius+1.7;nodes.push({x:x+Math.cos(angle)*radius,z:z+Math.sin(angle)*radius});}
    }
  }
  const visible=(a,b)=>{const steps=Math.max(1,Math.ceil(length(a,b)/.3));for(let i=0;i<=steps;i++){const p=mix(a,b,i/steps),padding=Math.min(.4,Math.min(length(p,start),length(p,end))*.3);if(!voyageClear(p,source,destination,offset,padding))return false;}return true;};
  const costs=new Float64Array(nodes.length).fill(Infinity),parents=new Int16Array(nodes.length).fill(-1),closed=new Set(),edges=new Map();costs[0]=0;
  while(closed.size<nodes.length){
    let best=-1;for(let i=0;i<nodes.length;i++)if(!closed.has(i)&&(best<0||costs[i]<costs[best]))best=i;
    if(best<0||!Number.isFinite(costs[best]))break;if(best===1)break;closed.add(best);
    for(let j=0;j<nodes.length;j++){if(closed.has(j)||j===best)continue;const next=costs[best]+length(nodes[best],nodes[j]);if(next>=costs[j])continue;const key=`${Math.min(best,j)},${Math.max(best,j)}`;if(!edges.has(key))edges.set(key,visible(nodes[best],nodes[j]));if(edges.get(key)){costs[j]=next;parents[j]=best;}}
  }
  if(parents[1]>=0){
    const points=[];for(let i=1;i>=0;i=parents[i])points.unshift(nodes[i]);
    for(const radius of [6,4,2,.8,0]){const route=roundRoute(points,radius);if(route.samples.every(p=>voyageClear(p,source,destination,offset)))return {...route,offset,start,end};}
  }
  // A sparse visibility graph can miss a passage around a dense random reef
  // cluster. Retry with a bounded water grid; all segments still use hull checks.
  const points=waterGridRoute(start,end,source,destination,offset,visible);
  if(points)for(const radius of [4,2,.8,0]){const route=roundRoute(points,radius);if(route.samples.every(p=>voyageClear(p,source,destination,offset)))return {...route,offset,start,end};}
  throw new Error('Unable to find an ocean route with clearance for the boat hull');
}
function waterGridRoute(start,end,source,destination,offset,visible){
  const step=3,minX=-source.width/2-24,maxX=offset+destination.width/2+24,minZ=-Math.max(source.depth,destination.depth)/2-24,maxZ=-minZ,cols=Math.ceil((maxX-minX)/step)+1,rows=Math.ceil((maxZ-minZ)/step)+1;
  const point=n=>({x:minX+n%cols*step,z:minZ+Math.floor(n/cols)*step}),free=new Int8Array(cols*rows),isFree=n=>{if(!free[n])free[n]=voyageClear(point(n),source,destination,offset,.4)?1:-1;return free[n]>0;};
  function anchor(p){let best=-1,distance=Infinity;for(let n=0;n<free.length;n++){const q=point(n),d=(q.x-p.x)**2+(q.z-p.z)**2;if(d<distance&&d<100&&isFree(n)&&visible(p,q)){best=n;distance=d;}}return best;}
  const a=anchor(start),b=anchor(end);if(a<0||b<0)return null;
  const queue=[a],parents=new Int32Array(free.length).fill(-1);parents[a]=a;
  for(let i=0;i<queue.length&&parents[b]<0;i++){
    const n=queue[i],x=n%cols,z=Math.floor(n/cols);
    for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
      const nx=x+dx,nz=z+dz,q=nz*cols+nx;if(nx<0||nz<0||nx>=cols||nz>=rows||parents[q]>=0||!isFree(q)||!visible(point(n),point(q)))continue;
      parents[q]=n;queue.push(q);
    }
  }
  if(parents[b]<0)return null;const raw=[end];for(let n=b;n!==a;n=parents[n])raw.unshift(point(n));raw.unshift(start,point(a));
  const smoothed=[start];for(let i=1;i<raw.length;){let far=i;while(far+1<raw.length&&visible(smoothed.at(-1),raw[far+1]))far++;smoothed.push(raw[far]);i=far+1;}return smoothed;
}
export function sampleVoyage(route,progress) {
  const distance=Math.max(0,Math.min(1,progress))*route.length;
  let low=0,high=route.cumulative.length-1;
  while(low+1<high){const mid=(low+high)>>1;if(route.cumulative[mid]<distance)low=mid;else high=mid;}
  const a=route.samples[low],b=route.samples[high],t=(distance-route.cumulative[low])/(route.cumulative[high]-route.cumulative[low]||1);
  return {...mix(a,b,t),heading:Math.atan2(b.x-a.x,b.z-a.z)};
}
