import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmbientWalk} from '../src/ambient-walk.js';
import {clearSegment} from '../src/navigation.js';
import {canWalkSegment} from '../src/terrain.js';

test('autonomous steps reuse a swept corridor, retain exact endpoints and avoid collision work between goals',()=>{
  let checks=0;const blocked=(x,z)=>{checks++;return Math.abs(x)<1&&Math.abs(z)<1;},clear=(a,b)=>clearSegment(a,b,blocked),walk=createAmbientWalk(clear),from={x:-2,z:1.5},goal={x:2,z:1.5};
  assert.ok(walk.prepare(from,goal));const validationChecks=checks;let p={...from};for(let i=0;i<100;i++){const next=walk.advance(p,goal,.05);assert.ok(next);assert.ok(clear(p,next));p=next;if(next.done)break;}
  assert.equal(p.x,goal.x);assert.equal(p.z,goal.z);assert.equal(walk.stats.validations,1);assert.ok(walk.stats.steps>70);
  checks=0;let q={...from};while(q.x<goal.x)q=walk.advance(q,goal,.05);assert.equal(checks,0,'all movement steps avoid repeating the same collision sweep');assert.ok(validationChecks>300);
});

test('deviations, edited goals and changed radius revalidate, and an obstructed corridor still fails',()=>{
  const radii=[],walk=createAmbientWalk((a,b,r)=>{radii.push(r);return clearSegment(a,b,(x,z)=>Math.abs(x)<1+r&&Math.abs(z)<1+r);}),goal={x:3,z:2};
  assert.ok(walk.prepare({x:-3,z:2},goal));assert.ok(walk.advance({x:-3,z:2},goal,.1));assert.equal(radii.length,1);
  assert.equal(walk.advance({x:-3,z:0},goal,.1),null,'teleport cannot reuse a previously safe corridor');
  assert.ok(walk.advance({x:-3,z:2},goal,.1,.32));assert.equal(radii.at(-1),.32);
  goal.z=-2;assert.equal(walk.advance({x:-3,z:2},goal,.1,.32),null,'changed goal cannot bypass the obstacle');
});

test('certification cannot walk across a cliff; a ladder exit validates a new segment',()=>{
  const layout={width:20,depth:20,terraces:[{x:0,z:0,r:2,ramp:.05,height:3}],workshops:[],lakes:[]},walk=createAmbientWalk((a,b)=>clearSegment(a,b,()=>false,(a,b)=>canWalkSegment(layout,a,b)));
  assert.equal(walk.prepare({x:3,z:0},{x:0,z:0}),false);assert.equal(walk.advance({x:3,z:0},{x:0,z:0},.1),null);
  const goal={x:0,z:0};assert.ok(walk.prepare({x:1,z:0},goal));assert.ok(walk.advance({x:1,z:0},goal,.1),'a resident that climbed onto the plateau can move on it');
});
