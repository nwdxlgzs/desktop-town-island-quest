// A latched pose budget: idle breathing and boat bobbing do not invalidate a
// large sun map. A meaningful change stays pending until actually rendered,
// including the final pose after movement stops between budgeted refreshes.
export function createShadowMotion(){
  const snapshots=new Map();let pending=true;
  const partNames=['left','right','armL','armR'];
  function snapshot(o){
    let s=snapshots.get(o);if(!s){s={};snapshots.set(o,s);}
    const p=o.position,q=o.quaternion;
    s.x=p.x;s.y=p.y;s.z=p.z;s.qx=q.x;s.qy=q.y;s.qz=q.z;s.qw=q.w;s.sx=o.scale.x;s.sy=o.scale.y;s.sz=o.scale.z;s.visible=o.visible;
    for(const name of partNames){const r=o.userData[name]?.rotation;if(r){s[name+'x']=r.x;s[name+'z']=r.z;}}
  }
  function differs(o){
    const s=snapshots.get(o);if(!s)return true;
    const p=o.position,q=o.quaternion;
    if((p.x-s.x)**2+(p.z-s.z)**2>.0016||Math.abs(p.y-s.y)>.08||1-Math.abs(q.x*s.qx+q.y*s.qy+q.z*s.qz+q.w*s.qw)>.0003)return true;
    if(Math.abs(o.scale.x-s.sx)>.05||Math.abs(o.scale.y-s.sy)>.05||Math.abs(o.scale.z-s.sz)>.05)return true;
    for(const name of partNames){const r=o.userData[name]?.rotation;if(r&&(Math.abs(r.x-s[name+'x'])>.06||Math.abs(r.z-s[name+'z'])>.06))return true;}
    return false;
  }
  return {sample(sources){if(!pending)for(const o of sources)if(snapshots.get(o)?.visible!==o.visible||o.visible&&o.userData.inView!==false&&differs(o)){pending=true;break;}return pending;},
    commit(sources){for(const o of sources)snapshot(o);pending=false;},reset(){snapshots.clear();pending=true;},get pending(){return pending;}};
}
