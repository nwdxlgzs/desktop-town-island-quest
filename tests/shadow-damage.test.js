import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shadowFootprint,shadowDamageRects,createShadowDamage} from '../src/shadow-damage.js';

test('damage covers directional shadows down to low receivers, old poses and visibility changes',()=>{
  const sun=new THREE.Vector3(-4,12,5),box=new THREE.Box3(new THREE.Vector3(-.3,4,-.3),new THREE.Vector3(.3,5.4,.3)),footprint=shadowFootprint(box,sun);
  for(const y of [-1.2,0,3,4])for(const point of [box.min.clone(),box.max.clone()]){const t=Math.max(0,(point.y-y)/sun.y);assert.ok(footprint.containsPoint(point.addScaledVector(sun,-t)));}
  const object=new THREE.Mesh(new THREE.BoxGeometry(.6,1.4,.6),new THREE.MeshLambertMaterial()),damage=createShadowDamage();object.position.y=4.7;object.updateMatrixWorld(true);assert.equal(damage.regions([object],sun),null);damage.commit([object]);assert.deepEqual(damage.regions([object],sun),[]);
  object.position.x=3;object.updateMatrixWorld(true);const moved=damage.regions([object],sun);assert.equal(moved.length,2);assert.ok(moved[0].min.x<0&&moved[1].max.x>3);
  damage.commit([object]);object.visible=false;assert.equal(damage.regions([object],sun).length,1,'removal erases the old shadow');damage.commit([object]);object.visible=true;assert.equal(damage.regions([object],sun).length,1);
  damage.reset();assert.equal(damage.regions([object],sun),null);object.geometry.dispose();object.material.dispose();
});

test('unchanged actor roots still invalidate shadows when a greeting or climbing limb changes',()=>{
  const actor=new THREE.Group(),arm=new THREE.Group(),sun=new THREE.Vector3(-4,12,5),damage=createShadowDamage();actor.add(arm);actor.userData.parts=[arm];actor.updateMatrixWorld(true);damage.commit([actor]);assert.deepEqual(damage.regions([actor],sun),[]);
  arm.rotation.z=2;actor.updateMatrixWorld(true);assert.equal(damage.regions([actor],sun).length,2);damage.commit([actor]);assert.deepEqual(damage.regions([actor],sun),[]);
  arm.rotation.x=-1.5;actor.updateMatrixWorld(true);assert.equal(damage.regions([actor],sun).length,2);
});

test('pixel damage merges overlaps, keeps separate actors separate and rejects offscreen boxes',()=>{
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.position.set(0,20,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const box=(x,z)=>new THREE.Box3(new THREE.Vector3(x,0,z),new THREE.Vector3(x+1,2,z+1));
  const rects=shadowDamageRects([box(-5,-5),box(-4.5,-5),box(5,5),box(40,40)],camera,1000,1000);assert.equal(rects.length,2);
  assert.ok(rects.reduce((n,r)=>n+(r.right-r.x)*(r.top-r.y),0)<15000,'small changed objects do not repaint the space between them');
  for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.right<=1000&&r.top<=1000);assert.ok(r.x<r.right&&r.y<r.top);}
});
