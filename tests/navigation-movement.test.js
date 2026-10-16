import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigator,clearSegment,findPath} from '../src/navigation.js';
import {canWalkSegment} from '../src/terrain.js';

test('automatic routes follow a safe diagonal bend even when orthogonal grid samples are blocked',()=>{
  const start={x:-1.6,z:-1.6},bend={x:0,z:0},goal={x:1.6,z:-1.6};
  function distance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
  const blocked=(x,z)=>Math.min(distance(x,z,start,bend),distance(x,z,bend,goal))>.15;
  assert.ok(clearSegment(start,bend,blocked));assert.ok(clearSegment(bend,goal,blocked));assert.equal(clearSegment(start,goal,blocked),false);
  const nav=createNavigator(blocked,{minX:-2,maxX:2,minZ:-2,maxZ:2}),path=nav.findPath(start,goal);
  assert.ok(path.length>=2,'the diagonal route must be found rather than rejected as unreachable');
  let position={...start},diagonalSteps=0;
  for(const point of path){let next;do{next=nav.advance(position,point,.075);assert.ok(next);assert.ok(clearSegment(position,next,blocked));if(Math.abs(next.x-position.x)>1e-5&&Math.abs(next.z-position.z)>1e-5)diagonalSteps++;position=next;}while(!next.done);}
  assert.ok(diagonalSteps>20);assert.deepEqual({x:position.x,z:position.z},goal);
});

test('diagonal expansion still rejects touching obstacle corners',()=>{
  const bounds={minX:-1,maxX:1,minZ:-1,maxZ:1},start={x:-.8,z:-.8},goal={x:.8,z:.8};
  const touching=(x,z)=>x<0&&z>-.04||z<0&&x>-.04;
  assert.equal(clearSegment(start,goal,touching),false);
  assert.deepEqual(findPath(start,goal,touching,bounds),[],'a zero-width corner is not a passage');
});

test('a nearest grid sample trapped behind a corner does not strand the actual reachable position',()=>{
  const dead={x:0,z:0},start={x:.16,z:.16},mouth={x:.4,z:0},goal={x:1.6,z:0};
  function distance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
  const segments=[[dead,start],[start,mouth],[mouth,goal]],blocked=(x,z)=>Math.min(...segments.map(([a,b])=>distance(x,z,a,b)))>.065,bounds={minX:-.8,maxX:2,minZ:-.8,maxZ:.8};
  assert.ok(clearSegment(start,dead,blocked));assert.ok(clearSegment(start,mouth,blocked));assert.equal(clearSegment(dead,mouth,blocked),false);assert.equal(clearSegment(start,goal,blocked),false);
  for(const [from,to]of [[start,goal],[goal,start]]){
    const nav=createNavigator(blocked,bounds),path=nav.findPath(from,to);assert.ok(path.length,'both starting and arriving beside the corner remain reachable');
    let position={...from};for(const point of path){assert.ok(clearSegment(position,point,blocked));let next;do{next=nav.advance(position,point,.11);assert.ok(next);position=next;}while(!next.done);}
    assert.deepEqual({x:position.x,z:position.z},to);
  }
});

test('planned movement reuses exact certified corridors with zero repeated collision checks',()=>{
  let checks=0;const blocked=(x,z)=>{checks++;return Math.abs(x)<1.28&&Math.abs(z)<2.28;},nav=createNavigator(blocked,{minX:-5,maxX:5,minZ:-5,maxZ:5});
  let position={x:-3,z:0};const goal={x:3,z:0},path=nav.findPath(position,goal);assert.ok(path.length>1);const planningChecks=checks;checks=0;let steps=0;
  for(const point of path){let next;do{next=nav.advance(position,point,.07);assert.ok(next);position=next;steps++;}while(!next.done);}
  assert.equal(checks,0,'movement does not sweep the already checked corridor again');
  assert.ok(planningChecks>1000);assert.ok(steps>100);assert.deepEqual({x:position.x,z:position.z},goal);
  for(const point of path)assert.ok(clearSegment(point,point,blocked),'all retained endpoints remain legal');
});

test('deviation, edited endpoint, invalidation and ladder exits cannot bypass obstacles or cliffs',()=>{
  const bounds={minX:-5,maxX:5,minZ:-5,maxZ:5},blocked=(x,z)=>Math.abs(x)<1.28&&Math.abs(z)<2.28,nav=createNavigator(blocked,bounds),start={x:-3,z:0};
  const path=nav.findPath(start,{x:3,z:0});assert.equal(nav.advance({x:0,z:0},path[0],.1),null,'teleported into a wall is rejected');
  const direct=nav.findPath({x:-3,z:3},{x:3,z:3});direct[0].z=0;assert.equal(nav.advance({x:-3,z:3},direct[0],.1),null,'mutated destination gets swept');
  const cliff={width:20,depth:20,workshops:[],lakes:[],terraces:[{x:0,z:0,r:2,ramp:.05,height:3}]};
  const groundNav=createNavigator(()=>false,bounds,(a,b)=>canWalkSegment(cliff,a,b));
  assert.equal(groundNav.advance({x:3,z:0},{x:0,z:0},.1),null);
  assert.equal(groundNav.advance({x:3,z:0},{x:0,z:0,ladder:'vertical'},.1),null,'ladder points are handled by the climb animation');
  let wall=false;const changing=createNavigator(()=>wall,bounds),point=changing.findPath({x:-2,z:3},{x:2,z:3})[0];wall=true;changing.invalidate();
  assert.equal(changing.advance({x:-2,z:3},point,.1),null,'invalidation also clears old movement certificates');
});
