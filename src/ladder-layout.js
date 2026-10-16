import { terrainTileSize,elevationAt,waterAt } from './terrain.js';
import { blockedAt,onLand } from './level-layout.js';

export function placeLadders(layout){
  layout.ladders=[];
  const size=terrainTileSize,candidates=[];
  for(let ix=1;ix<Math.floor(layout.width/size)-1;ix++)for(let iz=1;iz<Math.floor(layout.depth/size)-1;iz++){
    const a={x:-layout.width/2+size*(ix+.5),z:-layout.depth/2+size*(iz+.5)};
    if(blockedAt(layout,a.x,a.z,.55)||waterAt(layout,a.x,a.z,.7))continue;
    a.y=elevationAt(layout,a.x,a.z);
    for(const [dx,dz] of [[1,0],[0,1]]){
      const b={x:a.x+dx*size,z:a.z+dz*size};b.y=elevationAt(layout,b.x,b.z);
      const height=Math.abs(a.y-b.y);if(height<1||height>8||blockedAt(layout,b.x,b.z,.55)||waterAt(layout,b.x,b.z,.7))continue;
      const bottom=a.y<b.y?a:b,top=a.y<b.y?b:a;
      // A longer landing reaches the flat centre of both voxels, not a cliff edge.
      const direction={x:(top.x-bottom.x)/size,z:(top.z-bottom.z)/size},foot={x:bottom.x-direction.x*.35,z:bottom.z-direction.z*.35,y:bottom.y},head={x:top.x+direction.x*.35,z:top.z+direction.z*.35,y:top.y};
      if(!onLand(layout,foot.x,foot.z,.9)||!onLand(layout,head.x,head.z,.9))continue;
      if(blockedAt(layout,foot.x,foot.z,.5)||blockedAt(layout,head.x,head.z,.5))continue;
      if(elevationAt(layout,foot.x,foot.z)!==foot.y||elevationAt(layout,head.x,head.z)!==head.y)continue;
      const face={x:(bottom.x+top.x)/2,z:(bottom.z+top.z)/2},side={x:direction.z,z:-direction.x};
      let supported=true;
      for(const offset of [-.55,0,.55])for(const [depth,expected]of [[-.7,bottom.y],[.4,top.y]]){
        const x=face.x+side.x*offset+direction.x*depth,z=face.z+side.z*offset+direction.z*depth;
        if(elevationAt(layout,x,z)!==expected||blockedAt(layout,x,z,.3)||waterAt(layout,x,z,.3))supported=false;
      }
      if(supported)candidates.push({bottom:foot,top:head,face,width:1.3,height});
    }
  }
  // One access per raised area, with a bounded total independent of island size.
  candidates.sort((a,b)=>b.height-a.height);
  for(const c of candidates){
    if(layout.ladders.length>=5)break;
    if(layout.ladders.some(l=>Math.hypot(l.top.x-c.top.x,l.top.z-c.top.z)<6))continue;
    layout.ladders.push({...c,id:`ladder-${layout.ladders.length}`});
  }
}
