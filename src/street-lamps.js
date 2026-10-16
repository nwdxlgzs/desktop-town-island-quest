import { elevationAt,waterAt } from './terrain.js';
import { onLand } from './shoreline.js';

// Sample the finished road network once. Lamps sit on either verge, outside
// the paving and every route corridor, then join the static scenery batch.
export function streetLamps(layout){
  const roads=(layout.roads||[]).map(r=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z;return {...r,dx,dz,length:Math.hypot(dx,dz)};}).filter(r=>r.length>.001).sort((a,b)=>b.length-a.length);
  const lamps=[],seen=new Set();
  function roadDistanceSquared(p,r){
    const t=Math.max(0,Math.min(1,((p.x-r.a.x)*r.dx+(p.z-r.a.z)*r.dz)/(r.length*r.length)));
    return (p.x-r.a.x-t*r.dx)**2+(p.z-r.a.z-t*r.dz)**2;
  }
  function clear(p){
    if(!onLand(layout,p.x,p.z,.8)||waterAt(layout,p.x,p.z,.45))return false;
    if(roads.some(r=>roadDistanceSquared(p,r)<1.45**2)||lamps.some(l=>(l.x-p.x)**2+(l.z-p.z)**2<7.5**2))return false;
    if([layout.spawn,layout.dock].some(q=>q&&Math.hypot(p.x-q.x,p.z-q.z)<3))return false;
    if((layout.workshops||[]).some(w=>Math.abs(p.x-w.position[0])<3.8&&Math.abs(p.z-w.position[1])<4.3))return false;
    if((layout.obstacles||[]).some(o=>Math.abs(p.x-o.x)<o.w/2+.65&&Math.abs(p.z-o.z)<o.d/2+.65))return false;
    if((layout.trees||[]).some(t=>Math.hypot(p.x-t.x,p.z-t.z)<1.15*t.scale+.5))return false;
    if((layout.ladders||[]).some(l=>[l.bottom,l.top].some(q=>Math.hypot(p.x-q.x,p.z-q.z)<2)))return false;
    const y=elevationAt(layout,p.x,p.z);
    // All four foot corners share one voxel top: no hovering over a step.
    return [-.2,.2].every(dx=>[-.2,.2].every(dz=>onLand(layout,p.x+dx,p.z+dz,.4)&&!waterAt(layout,p.x+dx,p.z+dz,.1)&&Math.abs(elevationAt(layout,p.x+dx,p.z+dz)-y)<.01));
  }
  for(const r of roads){
    const steps=Math.max(1,Math.ceil(r.length/4));
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,anchor={x:r.a.x+r.dx*t,z:r.a.z+r.dz*t},key=`${Math.round(anchor.x*2)},${Math.round(anchor.z*2)}`;
      if(seen.has(key))continue;seen.add(key);
      const side=(lamps.length+(layout.seed||0))%2?1:-1;
      for(const sign of [side,-side]){
        const p={x:anchor.x-r.dz/r.length*1.7*sign,z:anchor.z+r.dx/r.length*1.7*sign};
        if(!clear(p))continue;
        lamps.push({...p,y:elevationAt(layout,p.x,p.z)+.08});break;
      }
      if(lamps.length===12)return lamps;
    }
  }
  return lamps;
}
