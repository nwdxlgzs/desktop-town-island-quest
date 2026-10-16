import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {warmHiddenShaders} from '../src/shader-warmup.js';
import {createAntialias} from '../src/antialias.js';

test('prewarms hidden live-layer geometry without revealing or reparenting the real scene',async()=>{
  const scene=new THREE.Scene(),group=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshLambertMaterial();group.visible=false;scene.add(group);
  const tree=new THREE.Mesh(geometry,material);tree.layers.set(1);tree.receiveShadow=true;group.add(tree);
  const opaque=new THREE.Mesh(geometry,material);group.add(opaque);
  const visible=new THREE.Mesh(geometry,material);visible.layers.set(1);scene.add(visible);
  let probes,complete;const pending=new Promise(resolve=>complete=resolve);
  const work=warmHiddenShaders(scene,root=>{probes=root;assert.equal(root.children.length,1);const mesh=root.children[0];assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(mesh.receiveShadow,true);assert.equal(mesh.layers.mask,tree.layers.mask);return pending;});
  assert.equal(tree.parent,group);assert.equal(tree.visible,true);assert.equal(group.visible,false);assert.equal(scene.children.length,2);
  complete();await work;assert.equal(probes.children.length,0);assert.equal(tree.parent,group);geometry.dispose();material.dispose();
});

test('empty scenes skip compilation and failed prewarming releases only detached probes',async()=>{
  let calls=0;await warmHiddenShaders(new THREE.Scene(),()=>calls++);assert.equal(calls,0);
  const scene=new THREE.Scene(),line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());line.visible=false;line.layers.set(1);scene.add(line);let probes;
  await assert.rejects(warmHiddenShaders(scene,root=>{probes=root;throw new Error('compile failed');}),/compile failed/);
  assert.equal(probes.children.length,0);assert.equal(line.parent,scene);assert.equal(line.visible,false);line.geometry.dispose();line.material.dispose();
});

test('shader prewarm matches the actor output variant and restores the target before asynchronous completion',async()=>{
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(),root=new THREE.Group(),previous={name:'previous'};let output=previous,compiling,complete;
  const pending=new Promise(resolve=>complete=resolve);
  const renderer={toneMappingExposure:1,getRenderTarget:()=>output,setRenderTarget:value=>output=value,compileAsync(object,view,environment){assert.equal(object,root);assert.equal(view,camera);assert.equal(environment,scene);compiling=output;return pending;}};
  const aa=createAntialias(renderer,scene,camera);
  const direct=aa.compile(root);assert.equal(compiling,null);assert.equal(output,previous);complete();await direct;
  aa.configure(true,100,80,1.2);await aa.compile(root);assert.equal(compiling.width,120);assert.equal(compiling.height,96);assert.equal(output,previous);
  renderer.compileAsync=()=>{throw new Error('link failed');};assert.throws(()=>aa.compile(root),/link failed/);assert.equal(output,previous);aa.dispose();
});
