// Scenery and terrain are immutable during an island visit. A resident/animal
// follows the exact straight segment already swept when it chose its goal;
// walking another few centimetres need not sweep the same corridor again.
// Teleports, changed goals/radii and deviations require a fresh validation.
export function createAmbientWalk(clear){
  const routes=new WeakMap();let validations=0,steps=0;
  function acceptVerified(from,goal,radius=.28){
    const dx=goal.x-from.x,dz=goal.z-from.z,length=Math.hypot(dx,dz);
    routes.set(goal,{x:from.x,z:from.z,gx:goal.x,gz:goal.z,dx:length?dx/length:0,dz:length?dz/length:0,length,radius});
  }
  function prepare(from,goal,radius=.28){
    validations++;if(!clear(from,goal,radius)){routes.delete(goal);return false;}
    acceptVerified(from,goal,radius);return true;
  }
  // Only the navigator may adopt a segment already swept by its path planner.
  // Subsequent deviations/edited endpoints retain the normal revalidation.
  return {prepare,acceptVerified,advance(from,goal,distance,radius=.28){
    let route=routes.get(goal),progress=route?(from.x-route.x)*route.dx+(from.z-route.z)*route.dz:0;
    if(!route||route.gx!==goal.x||route.gz!==goal.z||route.radius!==radius||progress<-.00001||progress>route.length+.00001||Math.hypot(from.x-route.x-route.dx*progress,from.z-route.z-route.dz*progress)>.00001){
      if(!prepare(from,goal,radius))return null;route=routes.get(goal);progress=0;
    }
    const next=Math.min(route.length,Math.max(0,progress)+Math.max(0,distance));steps++;
    return next>=route.length-1e-6?{x:goal.x,z:goal.z,done:true}:{x:route.x+route.dx*next,z:route.z+route.dz*next,done:false};
  },get stats(){return {validations,steps};}};
}
