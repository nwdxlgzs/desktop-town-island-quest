import {blockedAt} from './level-layout.js';
import {clearSegment} from './navigation.js';
import {canWalkSegment,walkingHeightAt,playerRadius,maxStepHeight,extraStepHeight} from './terrain.js';

// Shortcuts only join places already connected by ordinary walking/ladders.
// Reuse local reachability proofs; do not plan again on every airborne frame.
export function createPlayerTraversal(layout,findPath){
  const blocked=(x,z)=>blockedAt(layout,x,z,playerRadius),normal=(a,b)=>canWalkSegment(layout,a,b),walk=(a,b)=>clearSegment(a,b,blocked,normal),permissions=[];
  let searches=0;
  function reachable(from,to){
    for(const p of permissions){
      if(Math.hypot(from.x-p.from.x,from.z-p.from.z)>1.3||Math.hypot(to.x-p.to.x,to.z-p.to.z)>1.3)continue;
      if(p.ok&&walk(from,p.from)&&walk(p.to,to))return true;
      if(!p.ok&&Math.hypot(from.x-p.from.x,from.z-p.from.z)<1e-6&&Math.hypot(to.x-p.to.x,to.z-p.to.z)<.1)return false;
    }
    searches++;const ok=findPath(from,to).length>0;permissions.unshift({from:{...from},to:{...to},ok});if(permissions.length>24)permissions.pop();return ok;
  }
  function canMove(from,to,jumpOrigin=null){
    if(walk(from,to))return true;
    const limits={up:jumpOrigin?extraStepHeight:maxStepHeight,down:extraStepHeight};
    if(!clearSegment(from,to,blocked,(a,b)=>canWalkSegment(layout,a,b,limits)))return false;
    // One jump cannot chain several extra-height risers into a cliff climb.
    if(jumpOrigin&&Math.abs(walkingHeightAt(layout,to.x,to.z)-walkingHeightAt(layout,jumpOrigin.x,jumpOrigin.z))>extraStepHeight+1e-5)return false;
    return reachable(jumpOrigin||from,to);
  }
  return {canMove,advance(from,to,jumpOrigin=null){
    if(canMove(from,to,jumpOrigin))return {...to};
    // Slide along free axes; a zero-length slide is never successful movement.
    let point={...from};
    const x={x:to.x,z:point.z};if(Math.abs(x.x-point.x)>1e-7&&canMove(point,x,jumpOrigin))point=x;
    const z={x:point.x,z:to.z};if(Math.abs(z.z-point.z)>1e-7&&canMove(point,z,jumpOrigin))point=z;
    if(Math.hypot(point.x-from.x,point.z-from.z)>1e-7)return point;
    // Slow frames can request a stride longer than the space left at a corner.
    // Stop at the last safe position, rather than discarding the entire stride.
    const distance=Math.hypot(to.x-from.x,to.z-from.z);if(distance<.001)return null;
    const at=t=>({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t});
    let low=Math.min(1,.001/distance),high=1;if(!canMove(from,at(low),jumpOrigin))return null;
    for(let i=0;i<8;i++){const mid=(low+high)/2;if(canMove(from,at(mid),jumpOrigin))low=mid;else high=mid;}
    return at(low);
  },get searches(){return searches;}};
}
