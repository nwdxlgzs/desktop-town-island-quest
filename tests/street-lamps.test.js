import test from 'node:test';
import assert from 'node:assert/strict';
import { streetLamps } from '../src/street-lamps.js';
import { elevationAt,waterAt } from '../src/terrain.js';

const fixture=()=>({seed:7,width:40,depth:40,shoreline:{radii:Array(32).fill(1)},workshops:[],obstacles:[],trees:[],ladders:[],terraces:[],spawn:{x:-16,z:0},dock:{x:18,z:0},roads:[{a:{x:-14,z:0},b:{x:14,z:0}}]});
function distance(p,r){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,t=Math.max(0,Math.min(1,((p.x-r.a.x)*dx+(p.z-r.a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-r.a.x-t*dx,p.z-r.a.z-t*dz);}
test('lamps follow road verges even without workshops, with spacing and no centre obstruction',()=>{
  const layout=fixture(),lamps=streetLamps(layout);assert.ok(lamps.length>=3);assert.ok(lamps.some(l=>l.z>0)&&lamps.some(l=>l.z<0));
  for(const [i,l] of lamps.entries()){
    assert.ok(Math.abs(distance(l,layout.roads[0])-1.7)<1e-6);assert.equal(l.y,.08);
    for(const other of lamps.slice(i+1))assert.ok(Math.hypot(l.x-other.x,l.z-other.z)>=7.5);
  }
  assert.deepEqual(streetLamps({...layout,roads:[...layout.roads,...layout.roads]}),lamps,'duplicate paving routes do not duplicate lamps');
  assert.deepEqual(streetLamps({...layout,roads:[],workshops:[{position:[0,0]}]}),[],'workshops never create a lamp on their own');
  assert.equal(layout.obstacles.length,0,'placement only returns data');
});
test('bends and intersecting routes leave every road corridor clear',()=>{
  const layout=fixture();layout.roads.push({a:{x:0,z:-14},b:{x:0,z:14}},{a:{x:-10,z:-10},b:{x:10,z:10}});
  const lamps=streetLamps(layout);assert.ok(lamps.length>0);
  for(const l of lamps)for(const road of layout.roads)assert.ok(distance(l,road)>=1.45,'lamp stays outside each crossing route');
});
test('lamps avoid water, furniture, trees, workshop entrances, ladders and uneven footings',()=>{
  const layout=fixture();layout.river={x:-8,width:3,phase:0,amplitude:0};layout.workshops=[{position:[7,0]}];
  layout.obstacles=[{x:-3,z:-1.7,w:3,d:1}];layout.trees=[{x:0,z:1.7,scale:1.3}];layout.ladders=[{bottom:{x:2,z:0},top:{x:2,z:2}}];layout.terraces=[{x:-1,z:-1.7,r:.3,ramp:1,height:3}];
  const lamps=streetLamps(layout);assert.ok(lamps.length>0);
  for(const l of lamps){
    assert.equal(waterAt(layout,l.x,l.z,.45),false);assert.ok(Math.hypot(l.x,l.z-1.7)>=1.15*1.3+.5);
    assert.ok(Math.abs(l.x-7)>=3.8||Math.abs(l.z)>=4.3);
    assert.ok(Math.abs(l.x+3)>=2.15||Math.abs(l.z+1.7)>=1.15);
    for(const q of [layout.ladders[0].bottom,layout.ladders[0].top])assert.ok(Math.hypot(l.x-q.x,l.z-q.z)>=2);
    for(const dx of [-.2,.2])for(const dz of [-.2,.2])assert.ok(Math.abs(elevationAt(layout,l.x+dx,l.z+dz)-(l.y-.08))<.01);
  }
});
