import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exposedBoxGeometry } from '../src/box-surfaces.js';
import { createPerson } from '../src/scene-assets.js';

const box=(x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());m.position.set(x,y,z);m.scale.set(w,h,d);return m;};
test('only wholly buried opaque faces disappear; exposed, coincident and partial faces remain',()=>{
  const a=box(0,0,0,1,1,1),b=box(0,.7,0,2,1,2);
  const g=exposedBoxGeometry(a,[a,b]);assert.equal(g.index.count,30);assert.equal(g.attributes.position.count,20);
  b.position.y=0;const full=exposedBoxGeometry(a,[a,b]);assert.equal(full.index.count,12,'top and bottom equal planes stay exposed');
  b.scale.set(1,1,1);assert.equal(exposedBoxGeometry(a,[a,b]).index.count,36,'coincident faces are not both deleted');
  b.position.set(.6,.7,0);assert.equal(exposedBoxGeometry(a,[a,b]).index.count,36,'partial coverage stays intact');
  b.material.transparent=true;b.scale.set(2,2,2);assert.equal(exposedBoxGeometry(a,[a,b]).index.count,36);
});
test('character geometry shrinks before pose upload without changing moving-part boundaries',()=>{
  const cube=new THREE.BoxGeometry(),mat=()=>new THREE.MeshLambertMaterial(),pruned=createPerson(cube,mat,'#abc'),full=createPerson(cube,mat,'#abc',undefined,false,m=>m.geometry.clone());
  const count=actor=>actor.userData.parts.reduce((n,m)=>n+m.geometry.index.count,0);
  assert.ok(count(pruned)<count(full));assert.equal(pruned.userData.parts.length,full.userData.parts.length);
});
