import { createAmbientWalk } from './ambient-walk.js';

// Planning and movement share the same swept clearance, including both endpoints.
export function clearSegment(from,to,blocked,canTraverse=()=>true) {
  if(!canTraverse(from,to))return false;
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.05));
  for(let i=0;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
    if(blocked(x,z)||blocked(x+.035,z)||blocked(x-.035,z)||blocked(x,z+.035)||blocked(x,z-.035))return false;
  }
  return true;
}
// Grid A* plus line-of-sight smoothing keeps click-to-walk routes clear of furniture.
export function findPath(from, to, blocked, bounds = {minX:-12,maxX:12,minZ:-8.2,maxZ:8.2},canTraverse=()=>true,ladders=[],cache=null,retryAnchors=false) {
  const clear=(x,z)=>!blocked(x,z)&&!blocked(x+.035,z)&&!blocked(x-.035,z)&&!blocked(x,z+.035)&&!blocked(x,z-.035);
  const visible=(a,b)=>clearSegment(a,b,blocked,canTraverse);
  if(!clear(from.x,from.z)||!clear(to.x,to.z))return [];
  if(!blocked(to.x,to.z)&&visible(from,to))return [{...to}];
  const step = .4;
  const cols = Math.round((bounds.maxX-bounds.minX)/step)+1;
  const rows = Math.round((bounds.maxZ-bounds.minZ)/step)+1;
  const points=cache?(cache.points??=new Array(cols*rows)):null;
  const point = n => points?(points[n]??=({x:bounds.minX+(n%cols)*step,z:bounds.minZ+Math.floor(n/cols)*step})):({x:bounds.minX+(n%cols)*step,z:bounds.minZ+Math.floor(n/cols)*step});
  const node = p => Math.max(0,Math.min(rows-1,Math.round((p.z-bounds.minZ)/step)))*cols+Math.max(0,Math.min(cols-1,Math.round((p.x-bounds.minX)/step)));
  const free=cache?(cache.free??=new Int8Array(cols*rows)):new Int8Array(cols*rows),edges=cache?(cache.edges??=new Int8Array(cols*rows*9)):null;
  const isFree = n => {if(n<0||n>=cols*rows)return false;if(!free[n]){const p=point(n);free[n]=clear(p.x,p.z)?1:-1;}return free[n]>0;};
  const connected=(current,next,dx,dz)=>{if(!edges)return visible(point(current),point(next));const key=current*9+(dz+1)*3+dx+1;if(!edges[key])edges[key]=visible(point(current),point(next))?1:-1;return edges[key]>0;};
  function nearest(p,arriving=false) {
    const joins=q=>arriving?visible(q,p):visible(p,q);
    const origin=node(p);
    if(isFree(origin)&&joins(point(origin))) return origin;
    let best=null,dist=Infinity;
    for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
      const ix=origin%cols+dx,iz=Math.floor(origin/cols)+dz;
      if(ix<0||ix>=cols||iz<0||iz>=rows)continue;
      const n=iz*cols+ix,q=point(n),d=Math.hypot(p.x-q.x,p.z-q.z);
      if(isFree(n)&&d<dist&&joins(q)){dist=d;best=n;}
    }
    return best;
  }
  const start=nearest(from),goal=nearest(to,true);
  if(start===null||goal===null)return [];
  // A point beside a tree/corner may see two grid components. The closest
  // sample can be a dead pocket, even though another visible sample connects.
  // Only retry failed searches with multiple swept endpoint connections.
  function anchors(p,nearestNode,arriving=false){
    if(!retryAnchors)return [nearestNode];
    const origin=node(p),nodes=[];
    for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
      const ix=origin%cols+dx,iz=Math.floor(origin/cols)+dz;
      if(ix<0||ix>=cols||iz<0||iz>=rows)continue;
      const n=iz*cols+ix;
      if(isFree(n)&&(arriving?visible(point(n),p):visible(p,point(n))))nodes.push(n);
    }
    return nodes;
  }
  const starts=anchors(from,start),goals=new Set(anchors(to,goal,true));
  // Explicit off-mesh links preserve both landings; smoothing cannot replace a climb with a slope.
  const links=new Map(),parentLinks=new Map();
  for(const ladder of ladders){
    if(!clear(ladder.bottom.x,ladder.bottom.z)||!clear(ladder.top.x,ladder.top.z))continue;
    const a=nearest(ladder.bottom),b=nearest(ladder.top);if(a===null||b===null||a===b)continue;
    for(const [source,destination,entry,exit,fromTop]of [[a,b,ladder.bottom,ladder.top,false],[b,a,ladder.top,ladder.bottom,true]]){
      if(!links.has(source))links.set(source,[]);
      links.get(source).push({destination,entry,exit,id:ladder.id,fromTop,cost:Math.hypot(point(source).x-entry.x,point(source).z-entry.z)+Math.hypot(entry.x-exit.x,entry.y-exit.y,entry.z-exit.z)+Math.hypot(point(destination).x-exit.x,point(destination).z-exit.z)});
    }
  }
  const end=retryAnchors?to:point(goal),heuristic=n=>Math.hypot(point(n).x-end.x,point(n).z-end.z);
  // A binary heap avoids scanning a growing open set on large islands.
  const heap=[],closed=new Uint8Array(cols*rows),cost=new Float64Array(cols*rows).fill(Infinity),parents=new Int32Array(cols*rows).fill(-1);
  function push(n,f){let i=heap.length;heap.push({n,f});while(i>0){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p;}heap[i]={n,f};}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(last.f<=heap[c].f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first.n;}
  for(const n of starts){cost[n]=retryAnchors?Math.hypot(point(n).x-from.x,point(n).z-from.z):0;push(n,cost[n]+heuristic(n));}
  let reached=null;
  while(heap.length){
    const current=pop();if(closed[current])continue;
    if(goals.has(current)){reached=current;break;}
    closed[current]=1;
    const x=current%cols,z=Math.floor(current/cols);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;
      const nx=x+dx,nz=z+dz,next=nz*cols+nx;
      if(nx<0||nx>=cols||nz<0||nz>=rows||closed[next]||!isFree(next))continue;
      // These are character-centre samples, not solid grid tiles. Requiring
      // both orthogonal neighbours to be free rejects safe diagonal gaps.
      // The swept segment below checks the real obstacle/terrain clearance,
      // including corners, for diagonal and straight edges alike.
      if(!connected(current,next,dx,dz))continue;
      const nextCost=cost[current]+Math.hypot(dx,dz)*step;
      if(nextCost<cost[next]){cost[next]=nextCost;parents[next]=current;parentLinks.delete(next);push(next,nextCost+heuristic(next));}
    }
    for(const link of links.get(current)||[]){
      const next=link.destination,nextCost=cost[current]+link.cost;
      if(!closed[next]&&nextCost<cost[next]){cost[next]=nextCost;parents[next]=current;parentLinks.set(next,link);push(next,nextCost+heuristic(next));}
    }
  }
  if(reached===null)return retryAnchors?[]:findPath(from,to,blocked,bounds,canTraverse,ladders,cache,true);
  const raw=[];let n=reached;
  while(parents[n]!==-1){const link=parentLinks.get(n);raw.unshift(point(n));if(link)raw.unshift({...link.entry},{...link.exit,ladder:link.id,fromTop:link.fromTop});n=parents[n];}
  raw.unshift(point(n));
  const result=[];let anchor={...from},i=0;
  while(i<raw.length){
    if(raw[i].ladder){result.push(raw[i]);anchor=raw[i++];continue;}
    let end=i;while(end+1<raw.length&&!raw[end+1].ladder)end++;
    while(i<=end){let far=i;while(far+1<=end&&visible(anchor,raw[far+1]))far++;if(!visible(anchor,raw[far]))return [];if(Math.hypot(anchor.x-raw[far].x,anchor.z-raw[far].z)>1e-7)result.push({...raw[far]});anchor=raw[far];i=far+1;}
  }
  if(!visible(anchor,to))return [];
  if(Math.hypot(anchor.x-to.x,anchor.z-to.z)>1e-7)result.push({...to});
  return result;
}

// Runtime collision geometry is fixed for an island. Reuse grid clearance and
// directed adjacent-edge checks across clicks; endpoints and smoothing still
// receive exact checks. Keep only one planner per active island in the world.
export function createNavigator(blocked,bounds,canTraverse=()=>true,ladders=[]){
  const clear=(a,b)=>clearSegment(a,b,blocked,canTraverse);
  let cache={},walk=createAmbientWalk(clear);
  return {findPath(from,to){
    const path=findPath(from,to,blocked,bounds,canTraverse,ladders,cache);let previous=from;
    for(const point of path){if(!point.ladder)walk.acceptVerified(previous,point);previous=point;}
    return path;
  },advance(from,point,distance){if(point.ladder)return null;return walk.advance(from,point,distance);},invalidate(){cache={};walk=createAmbientWalk(clear);},get movement(){return walk.stats;}};
}
