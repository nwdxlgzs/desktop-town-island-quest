import test from 'node:test';
import assert from 'node:assert/strict';
import {levels,configureJourney,journeyForSeed} from '../src/curriculum.js';
import {createLayout,blockedAt,onLand} from '../src/level-layout.js';
import {findPath,clearSegment,createNavigator,terrainNavigationGrid} from '../src/navigation.js';
import {elevationAt,walkingHeightAt,canWalkSegment,maxStepHeight,playerRadius} from '../src/terrain.js';
import {createLadderClimb,tickLadderClimb,ladderFrame} from '../src/ladder-motion.js';

test('three changed-generator samples have reachable workshops, layered shores and legal routes',()=>{
  const route=configureJourney(17);
  for(const index of [0,3,7]){
    const l=createLayout(route[index],17);assert.ok(l.workshops.length<=6);assert.equal(l.shoreline.shape,'freeform');
    const edgeHeights=l.shoreline.points.map(p=>elevationAt(l,p.x*.96,p.z*.96));assert.ok(Math.max(...edgeHeights)>=1);
    assert.ok(l.wildlife.length<=4);assert.equal(l.exploration.filter(d=>d.type==='shard').length,3);
    assert.ok(findPath(l.spawn,l.dock,(x,z)=>blockedAt(l,x,z,playerRadius),l.bounds,(a,b)=>canWalkSegment(l,a,b),l.ladders).length,'dock remains reachable with full body clearance after fences and lamps');
    for(const f of l.fences)assert.equal(blockedAt(l,f.x+(f.axis==='x'?f.length/2:0),f.z+(f.axis==='z'?f.length/2:0),0),true,'rendered rails have physical collision');
    for(const m of l.mountains)for(let x=m.x-m.w/2;x<m.x+m.w/2;x+=.5)for(let z=m.z-m.d/2;z<m.z+m.d/2;z+=.5)assert.equal(elevationAt(l,x,z),m.baseHeight,'mountain base matches terrain across its full footprint');
    const supports=[...l.villages.flatMap(v=>v.houses.map(h=>({...h,height:h.baseHeight}))),...l.camps.flatMap(c=>[{x:c.x-1,z:c.z-.6,w:2,d:1.9,height:c.tentHeight},{x:c.x+1.2,z:c.z+.7,w:1.6,d:1.6,height:c.fireHeight},{x:c.x+.5,z:c.z+1.7,w:1.7,d:.35,height:c.benchHeight}])];
    for(const p of supports)for(let x=p.x-p.w/2;x<=p.x+p.w/2;x+=.5)for(let z=p.z-p.d/2;z<=p.z+p.d/2;z+=.5)assert.equal(elevationAt(l,x,z),p.height,'scenery footprint fits the actual terrain');
    for(const w of l.workshops){
      const goal={x:w.approach[0],z:w.approach[1]},path=findPath(l.spawn,goal,(x,z)=>blockedAt(l,x,z,playerRadius),l.bounds,(a,b)=>canWalkSegment(l,a,b),l.ladders);
      assert.ok(path.length);assert.ok(Math.hypot(path.at(-1).x-goal.x,path.at(-1).z-goal.z)<.15);
      let last=l.spawn;for(const p of path){assert.ok(p.ladder||canWalkSegment(l,last,p));last=p;}
      assert.ok(onLand(l,...w.position));
    }
    for(const home of Object.values(l.npcSpawns)){
      assert.equal(blockedAt(l,home.x,home.z),false);
      assert.ok(findPath(l.spawn,home,(x,z)=>blockedAt(l,x,z),l.bounds,(a,b)=>canWalkSegment(l,a,b),l.ladders).length,'resident spawn connects to teaching routes');
    }
  }
});

test('vertical ladder links retain their landings without making cliffs walkable',()=>{
  const l={width:20,depth:20,workshops:[],lakes:[],terraces:[{x:0,z:0,r:2,ramp:.05,height:3}],ladders:[]};
  const low={x:3,z:0,y:0},high={x:1,z:0,y:3};
  const ladder={id:'test-ladder',bottom:low,top:high,width:1.3,height:3};l.ladders.push(ladder);
  assert.equal(canWalkSegment(l,low,high),false);assert.equal(canWalkSegment(l,high,low),false);
  assert.equal(walkingHeightAt(l,2,0),elevationAt(l,2,0));
  assert.equal(canWalkSegment(l,{x:3,z:1},{x:1,z:1}),false);
  const bounds={minX:-5,maxX:5,minZ:-5,maxZ:5},traverse=(a,b)=>canWalkSegment(l,a,b),walk=(a,b,links=[])=>findPath(a,b,()=>false,bounds,traverse,links);
  assert.deepEqual(walk(low,high),[]);
  for(const [a,b,descending]of [[low,high,false],[high,low,true]]){
    const path=walk(a,b,l.ladders),link=path.find(p=>p.ladder);assert.ok(link);assert.equal(link.fromTop,descending);assert.equal(link.x,b.x);assert.equal(link.z,b.z);
    const climb=createLadderClimb(ladder,descending),frame=ladderFrame(ladder);let vertical=0;
    for(let t=0;t<climb.duration+.02;t+=.02){const p=tickLadderClimb(climb,.02);if(p.vertical){vertical++;assert.equal(p.x,frame.actor.x);assert.equal(p.z,frame.actor.z);assert.ok(p.x>2.4,'body stays outside the cliff');}if(p.done){assert.equal(p.x,b.x);assert.equal(p.z,b.z);assert.equal(p.y,b.y);break;}}
    assert.ok(vertical>20);
  }
  assert.equal(walk(low,high,[{...ladder,bottom:{x:0,z:0,y:0}}]).length,0,'invalid lower landing cannot connect through cliff');
});

test('reported seed 3763093038 island 3 connects the two-mountain ledge and both ladder directions',()=>{
  const seed=3763093038,level=journeyForSeed(seed)[2],layout=createLayout(level,seed);assert.equal(level.name,'山林探索岛');assert.equal(layout.mountains.length,2);
  const blocked=(x,z)=>blockedAt(layout,x,z,playerRadius),traverse=(a,b)=>canWalkSegment(layout,a,b),ledge={x:4.25,z:12.25};
  const nav=createNavigator(blocked,layout.bounds,traverse,layout.ladders,terrainNavigationGrid(layout));
  for(const [from,to]of [[layout.spawn,ledge],[ledge,layout.spawn],[layout.spawn,layout.ladders[0].bottom],[layout.ladders[0].bottom,layout.spawn]]){
    const path=nav.findPath(from,to);assert.ok(path.length);assert.ok(path.some(p=>p.ladder),'the route uses real cliff ladders');let previous=from;
    for(const p of path){if(p.ladder){const l=layout.ladders.find(l=>l.id===p.ladder);assert.ok(l);const entry=p.fromTop?l.top:l.bottom,exit=p.fromTop?l.bottom:l.top;assert.ok(Math.hypot(previous.x-entry.x,previous.z-entry.z)<1e-6);assert.ok(Math.hypot(p.x-exit.x,p.z-exit.z)<1e-6);}else assert.ok(clearSegment(previous,p,blocked,traverse),'every walk segment retains full body clearance');previous=p;}
    assert.ok(Math.hypot(path.at(-1).x-to.x,path.at(-1).z-to.z)<1e-6);
  }
});

test('exact corner waypoints remain traversable at runtime and unreachable endpoints fail explicitly',()=>{
  const bounds={minX:-5,maxX:5,minZ:-5,maxZ:5},blocked=(x,z)=>Math.abs(x)<1.28&&Math.abs(z)<2.28;
  const start={x:-3,z:0},goal={x:3,z:0},path=findPath(start,goal,blocked,bounds);assert.ok(path.length>1);assert.deepEqual(path.at(-1),goal);
  let p={...start};for(const q of path){while(Math.hypot(q.x-p.x,q.z-p.z)>1e-8){const d=Math.hypot(q.x-p.x,q.z-p.z),step=Math.min(d,.225),next={x:p.x+(q.x-p.x)/d*step,z:p.z+(q.z-p.z)/d*step};assert.ok(clearSegment(p,next,blocked));p=step>=d-1e-6?{...q}:next;}}
  assert.deepEqual(findPath(start,goal,(x,z)=>Math.abs(x)<.5,bounds),[]);
  assert.deepEqual(findPath({x:0,z:0},goal,blocked,bounds),[]);
  assert.deepEqual(findPath(start,{x:0,z:0},blocked,bounds),[]);
});
test('half-unit stairs are walkable while a cliff higher than a person blocks both directions',()=>{
  const l={width:40,depth:30,workshops:[],lakes:[],terraces:[{x:0,z:0,r:2,ramp:.05,height:3}]};
  assert.ok(elevationAt(l,0,0)>2);assert.equal(canWalkSegment(l,{x:3,z:0},{x:0,z:0}),false);assert.equal(canWalkSegment(l,{x:0,z:0},{x:3,z:0}),false);
  l.terraces[0].height=.5;assert.ok(canWalkSegment(l,{x:3,z:0},{x:0,z:0}));assert.equal(maxStepHeight,.6);
  l.terraces[0].height=3;
  const path=findPath({x:-4,z:0},{x:4,z:0},()=>false,{minX:-5,maxX:5,minZ:-5,maxZ:5},(a,b)=>canWalkSegment(l,a,b));
  assert.ok(path.some(p=>Math.abs(p.z)>2));let previous={x:-4,z:0};for(const p of path){assert.ok(canWalkSegment(l,previous,p));previous=p;}
});

test('cached navigator reuses safe edges without sharing mutable waypoints or skipping exact endpoints',()=>{
  let checks=0;const blocked=(x,z)=>{checks++;return Math.abs(x)<1.28&&Math.abs(z)<2.28;},bounds={minX:-5,maxX:5,minZ:-5,maxZ:5},start={x:-3,z:0},goal={x:3,z:0},nav=createNavigator(blocked,bounds);
  const a=nav.findPath(start,goal),first=checks;assert.ok(a.length>1);checks=0;const b=nav.findPath(start,goal),repeat=checks;assert.deepEqual(a,b);assert.ok(repeat<first*.6,`${first} first checks, ${repeat} repeated checks`);
  a[0].x=900;assert.deepEqual(nav.findPath(start,goal),b,'callers cannot mutate cached node coordinates');
  assert.deepEqual(nav.findPath(start,{x:0,z:0}),[],'obstructed endpoint remains rejected');nav.invalidate();checks=0;assert.deepEqual(nav.findPath(start,goal),b);assert.ok(checks>repeat*1.5);
});
