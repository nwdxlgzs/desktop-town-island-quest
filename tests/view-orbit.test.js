import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewOrbit} from '../src/view-orbit.js';
import {createOcean} from '../src/ocean.js';
import * as THREE from 'three';

test('inspection supports multiple full turns and restores the exact main yaw',()=>{
  const orbit=createViewOrbit();assert.equal(orbit.active,false);orbit.start(1,100);
  orbit.move(1,820,720);assert.equal(orbit.yaw,-Math.PI*2);orbit.move(1,-1340,720);assert.equal(orbit.yaw,Math.PI*4);
  orbit.end(1);assert.equal(orbit.active,false);assert.equal(orbit.yaw,0);
});

test('close-up waves use only visible lattice cells, keep density through a full turn and never upload matrices',()=>{
  const ocean=createOcean(),camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100),version=ocean.waves.instanceMatrix.version;
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
    camera.position.set(18*Math.cos(angle)+30*Math.sin(angle),25,30*Math.cos(angle)-18*Math.sin(angle));camera.lookAt(0,0,0);camera.updateMatrixWorld();ocean.setCamera(camera);ocean.setView(camera.position.x,camera.position.z);
    ocean.update(10,0,0,true);assert.ok(ocean.instances>0&&ocean.instances<=60);assert.equal(ocean.instances%3,0);assert.equal(ocean.waves.instanceMatrix.version,version);
    const shader={uniforms:{},vertexShader:'#include <project_vertex>'};ocean.waves.material.onBeforeCompile(shader);const grid=shader.uniforms.waveGrid.value;
    assert.equal(grid.w,1);assert.match(shader.vertexShader,/float\(gl_InstanceID\)/);
    const previous=grid.clone();ocean.update(10.01,0,0,true);assert.equal(ocean.waves.instanceMatrix.version,version);assert.ok(grid.clone().sub(previous).length()<2);
  }ocean.update(11,0,0,false);assert.equal(ocean.instances,0);ocean.dispose();
});
test('another pointer cannot hijack or cancel the inspection; cancel without a pointer resets it',()=>{
  const orbit=createViewOrbit();orbit.start(2,20);assert.equal(orbit.start(3,30),false);assert.equal(orbit.move(3,90,600),false);assert.equal(orbit.end(3),false);assert.equal(orbit.active,true);
  orbit.move(2,120,600);const yaw=orbit.yaw;orbit.end();assert.equal(orbit.dragging,false);assert.equal(orbit.returning,true);assert.ok(Math.abs(orbit.yaw-yaw)<1e-9);assert.equal(orbit.move(2,40,600),false);
  orbit.tick(.1);assert.ok(Math.abs(orbit.yaw)>0&&Math.abs(orbit.yaw)<Math.abs(yaw));orbit.tick(1);assert.equal(orbit.active,false);assert.equal(orbit.yaw,0);
});

test('return uses the shortest arc with frame-rate independent easing, and a new drag continues without a snap',()=>{
  const a=createViewOrbit(),b=createViewOrbit();
  for(const o of [a,b]){o.start(1,0);o.move(1,700,800);o.end();assert.ok(Math.abs(o.yaw-Math.PI/4)<1e-9);}
  for(let i=0;i<6;i++)a.tick(.02);b.tick(.12);assert.ok(Math.abs(a.yaw-b.yaw)<1e-9);
  const yaw=a.yaw;a.start(2,100);assert.equal(a.returning,false);assert.equal(a.yaw,yaw);a.move(2,120,800);assert.ok(Math.abs(a.yaw-(yaw-Math.PI/20))<1e-9);
  a.end(undefined,true);assert.equal(a.yaw,0);assert.equal(a.active,false);assert.equal(a.tick(.1),false);
});
test('all inspection quadrants retain top and facing wave sides, with no extra vertices or per-frame index upload',()=>{
  const ocean=createOcean(),g=ocean.waves.geometry,normal=g.attributes.normal,indices=g.index;const count=g.attributes.position.count;
  for(const [x,z]of [[18,30],[-18,30],[-18,-30],[18,-30],[18,30]]){
    ocean.setView(x,z);assert.equal(indices.count,18);assert.equal(g.attributes.position.count,count);
    for(const id of indices.array){const nx=normal.getX(id),ny=normal.getY(id),nz=normal.getZ(id);assert.ok(ny===1||nx*x>0||nz*z>0);}
    const version=indices.version;ocean.setView(x*2,z*2);assert.equal(indices.version,version);
  }ocean.dispose();
});
