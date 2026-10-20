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
  return {canMove(from,to,jumpOrigin=null){
    if(walk(from,to))return true;
    const limits={up:jumpOrigin?extraStepHeight:maxStepHeight,down:extraStepHeight};
    if(!clearSegment(from,to,blocked,(a,b)=>canWalkSegment(layout,a,b,limits)))return false;
    // One jump cannot chain several extra-height risers into a cliff climb.
    if(jumpOrigin&&Math.abs(walkingHeightAt(layout,to.x,to.z)-walkingHeightAt(layout,jumpOrigin.x,jumpOrigin.z))>extraStepHeight+1e-5)return false;
    return reachable(jumpOrigin||from,to);
  },get searches(){return searches;}};
}
