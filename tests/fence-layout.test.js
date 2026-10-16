import test from 'node:test';
import assert from 'node:assert/strict';
import { coastalFences } from '../src/fence-layout.js';
import { blockedAt } from '../src/level-layout.js';
import { elevationAt } from '../src/terrain.js';

test('coastal rails follow level voxel tops, leave the dock open and occupy no walkable route',()=>{
  const layout={seed:7,width:26,depth:24,shoreline:{radii:Array(96).fill(1)},dock:{x:11,z:0},spawn:{x:0,z:0},workshops:[],roads:[],ladders:[],obstacles:[],terraces:[]};
  const fences=coastalFences(layout);assert.ok(fences.length>0);assert.ok(fences.length<=4);
  assert.deepEqual(coastalFences(layout),fences,'same map keeps the same fence placement');
  for(const f of fences)for(let i=0;i<=20;i++){
    const x=f.x+(f.axis==='x'?f.length*i/20:0),z=f.z+(f.axis==='z'?f.length*i/20:0);
    assert.equal(elevationAt(layout,x,z),f.y,'posts and rails sit on one level');
    assert.equal(blockedAt(layout,x,z),true,'existing shore clearance protects every rail');
    assert.ok(Math.hypot(x-layout.dock.x,z-layout.dock.z)>4,'boarding stays clear');
  }
  assert.equal(layout.obstacles.length,0,'decoration does not change navigation');
});
