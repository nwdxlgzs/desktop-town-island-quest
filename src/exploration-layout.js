import { randomSource } from './random.js';
import { blockedAt } from './level-layout.js';
import { clearSegment } from './navigation.js';
import { canWalkSegment } from './terrain.js';

// Every side activity branches from a verified teaching route. It never gates sailing.
export function placeExploration(layout){
  const random=randomSource(layout.seed^0xBB67AE85),safe=(a,b)=>clearSegment(a,b,(x,z)=>blockedAt(layout,x,z,.36),(a,b)=>canWalkSegment(layout,a,b));
  const anchors=[layout.spawn,...layout.roads.flatMap(r=>[r.a,r.b])],spots=[];
  for(let tries=0;tries<180&&spots.length<8;tries++){
    const a=anchors[Math.floor(random()*anchors.length)],angle=random()*Math.PI*2,r=1+random()*2.5;
    const p={x:a.x+Math.cos(angle)*r,z:a.z+Math.sin(angle)*r};
    if(spots.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<2)||layout.workshops.some(w=>Math.hypot(w.approach[0]-p.x,w.approach[1]-p.z)<1.2)||Math.hypot(p.x-layout.dock.x,p.z-layout.dock.z)<2||!safe(a,p))continue;
    spots.push(p);
  }
  // A tiny map can reuse a safe road anchor rather than lose its treasure objective.
  while(spots.length<4)spots.push({...layout.spawn,x:layout.spawn.x+(spots.length%2)*.15});
  layout.exploration=spots.slice(0,3).map((p,i)=>({...p,id:`${layout.level.id}:shard-${i}`,type:'shard',name:`星图碎片 ${i+1}`}));
  layout.exploration.push({...spots[3],id:`${layout.level.id}:beacon`,type:'beacon',name:'古老星灯'});
  const fauna=layout.level.biome?.fauna||['兔子','小鸟'];
  layout.wildlife=spots.slice(4,8).map((p,i)=>({...p,id:`${layout.level.id}:animal-${i}`,type:'animal',species:fauna[i%fauna.length],name:fauna[i%fauna.length],phase:random()*6}));
}
