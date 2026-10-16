// The frame hugs the cliff. The actor stays outside it until its feet clear the upper ledge.
export function ladderFrame(ladder){
  const a=ladder.bottom,b=ladder.top,length=Math.hypot(b.x-a.x,b.z-a.z);
  const direction={x:(b.x-a.x)/length,z:(b.z-a.z)/length},face=ladder.face||{x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  return {direction,face,rail:{x:face.x-direction.x*.13,z:face.z-direction.z*.13},actor:{x:face.x-direction.x*.62,z:face.z-direction.z*.62}};
}
export function createLadderClimb(ladder,fromTop=false){
  const frame=ladderFrame(ladder),a={...ladder.bottom},b={...ladder.top};
  const points=[a,{...frame.actor,y:a.y},{...frame.actor,y:b.y},b];
  if(fromTop)points.reverse();
  const durations=points.slice(1).map((p,i)=>Math.max(.05,Math.hypot(p.x-points[i].x,p.y-points[i].y,p.z-points[i].z)/(i===1?1.9:2.2)));
  return {ladder,fromTop,points,durations,time:0,duration:durations.reduce((a,b)=>a+b,0)};
}
export function tickLadderClimb(climb,dt){
  climb.time=Math.min(climb.duration,climb.time+dt);
  if(climb.time>=climb.duration)return {...climb.points[3],vertical:false,done:true};
  let time=climb.time,index=0;
  while(index<2&&time>climb.durations[index])time-=climb.durations[index++];
  const a=climb.points[index],b=climb.points[index+1],t=Math.min(1,time/climb.durations[index]);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,vertical:index===1,done:climb.time>=climb.duration};
}
