import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bakeIslandShadows,createContactShadows,createGroundReceivers} from '../src/baked-shadows.js';

test('baked shade follows raised receivers, changes with sun direction and costs no extra mesh',()=>{
  const layout={width:14,depth:14,shoreline:{radii:new Array(16).fill(1)},mountains:[],workshops:[],level:{environment:{sun:[0,20,0]}}},root=new THREE.Group(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,.075,0,3,.075,0,0,4,0,-2,.075,0],3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0],3));const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial());mesh.userData.groundSurface=true;root.add(mesh);
  const box=new THREE.Box3(new THREE.Vector3(-1,.5,-1),new THREE.Vector3(1,3,1)),bake=bakeIslandShadows(root,layout,[box]);
  assert.deepEqual([...geometry.attributes.bakedShade.array],[0,1,1,1]);assert.equal(root.children.length,1);assert.equal(bake.samples,4);
  bake.setEnabled(true);assert.equal(mesh.material.userData.bakedShadowStrength.value,1);bake.setEnabled(false);assert.equal(mesh.material.userData.bakedShadowStrength.value,0);
  layout.level.environment.sun=[20,20,0];bakeIslandShadows(root,layout,[box]);assert.equal(geometry.attributes.bakedShade.getX(3),0);
});

test('contact shadows update only changed slots and reuse ground while jumping',()=>{
  const scene=new THREE.Scene(),player=new THREE.Group(),npc=new THREE.Group(),layout={width:14,depth:14,shoreline:{radii:new Array(16).fill(1)},mountains:[],workshops:[],level:{}},root=new THREE.Group(),island={layout,root,npcs:[{object:npc}],wildlife:[]};npc.position.x=3;player.position.y=npc.position.y=.25;
  const contacts=createContactShadows(scene),mesh=scene.children.at(-1);contacts.update(island,player,true);const first={...contacts.stats},version=mesh.instanceMatrix.version;
  for(let i=0;i<30;i++)contacts.update(island,player,true);assert.deepEqual(contacts.stats,first);assert.equal(mesh.instanceMatrix.version,version);
  const before=mesh.instanceMatrix.array.slice(16,32);player.position.y+=.6;contacts.update(island,player,true);assert.equal(contacts.stats.groundSamples,first.groundSamples);assert.deepEqual(mesh.instanceMatrix.array.slice(16,32),before);
  assert.equal(mesh.instanceMatrix.version,version,'jumping does not upload or resize the fixed foot shadow');
  npc.position.x=4;contacts.update(island,player,true);assert.equal(contacts.stats.groundSamples,first.groundSamples+1);assert.equal(mesh.instanceMatrix.array[28],4);
  npc.userData.inView=false;contacts.update(island,player,true);assert.equal(mesh.count,1);
  npc.userData.inView=true;root.position.x=50;contacts.update(island,player,true);assert.equal(mesh.count,2);assert.equal(mesh.instanceMatrix.array[28],54);
  contacts.update(island,player,false);assert.equal(mesh.visible,false);contacts.dispose();assert.equal(scene.children.length,0);
});

test('fixed shadows reuse voxel floor height but notice workshop edges within a voxel',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),player=new THREE.Group(),layout={width:14,depth:14,shoreline:{radii:Array(16).fill(1)},terrainReady:true,terrain:{baseLayers:0,coastLayers:Array(16).fill(0),layerHeight:.5},dock:{x:7,z:0},workshops:[{position:[0,0]}]},island={layout,root,npcs:[],wildlife:[]},contacts=createContactShadows(scene);
  player.position.set(3.1,.25,0);contacts.update(island,player,true);const samples=contacts.stats.groundSamples;
  player.position.x=3;contacts.update(island,player,true);assert.equal(contacts.stats.groundSamples,samples);
  player.position.x=2.8;contacts.update(island,player,true);assert.equal(contacts.stats.groundSamples,samples+1,'raised floor starts inside the same voxel');
  assert.ok(Math.abs(scene.children.at(-1).instanceMatrix.array[13]-.287)<1e-6);contacts.dispose();
});

test('footprints stay above actual paving and floor tiles, including edges within the same terrain voxel and idle frames',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),player=new THREE.Group(),groundReceivers=createGroundReceivers();
  groundReceivers.add(.5,0,.4,2,.13);groundReceivers.add(2,0,1,2,.24);groundReceivers.add(2.2,0,.3,.3,.272);
  const layout={width:14,depth:14,terrainReady:true,terrain:{baseLayers:0,coastLayers:Array(16).fill(0),layerHeight:.5},dock:{x:7,z:0},workshops:[]},island={layout,root,groundReceivers,npcs:[],wildlife:[]},contacts=createContactShadows(scene),mesh=scene.children.at(-1);
  const height=()=>mesh.instanceMatrix.array[13];
  for(const [x,surface]of [[.1,.075],[.4,.13],[.8,.075],[1.7,.24],[2.2,.272],[2.7,.075]]){
    player.position.x=x;contacts.update(island,player,true);assert.ok(Math.abs(height()-(surface+.015))<1e-6,`x=${x}: the shadow must lie above the visible surface`);
    const version=mesh.instanceMatrix.version;for(let i=0;i<12;i++)contacts.update(island,player,true);assert.equal(mesh.instanceMatrix.version,version,'idle retains the visible shadow without uploading again');
  }
  assert.equal(groundReceivers.heightAt(.4,0,4.075),4.075,'higher terrain wins over a lower overlay');
  contacts.dispose();
});
