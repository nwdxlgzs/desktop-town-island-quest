// Temporary horizontal inspection, independent of the normal follow/pan view.
export function createViewOrbit(){
  let pointer=null,startX=0,startYaw=0,yaw=0,returnYaw=0,returnTime=0,duration=0;
  return {get active(){return pointer!==null||duration>0;},get dragging(){return pointer!==null;},get returning(){return duration>0;},get yaw(){return yaw;},get pointer(){return pointer;},
    start(id,x){if(pointer!==null)return false;pointer=id;startX=x;startYaw=yaw;duration=0;return true;},
    move(id,x,width){if(id!==pointer||pointer===null)return false;yaw=startYaw-(x-startX)*Math.PI*2/Math.max(240,width);return true;},
    end(id=pointer,immediate=false){
      if(id!==pointer||pointer===null&&!immediate)return false;
      const changed=pointer!==null||duration>0;pointer=null;
      // Choose the nearest equivalent angle: multiple turns never cause a long
      // spin back, and the orientation remains continuous at pointer release.
      yaw=immediate?0:Math.atan2(Math.sin(yaw),Math.cos(yaw));returnYaw=yaw;returnTime=0;
      duration=immediate||Math.abs(yaw)<1e-6?0:.3+.18*Math.abs(yaw)/Math.PI;
      if(!duration)yaw=0;return changed;
    },
    tick(dt){if(!duration)return false;returnTime=Math.min(duration,returnTime+Math.max(0,dt));const t=returnTime/duration,ease=t*t*(3-2*t);yaw=returnYaw*(1-ease);if(t===1){yaw=0;duration=0;}return true;}
  };
}
