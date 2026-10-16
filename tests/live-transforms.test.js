import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLiveTransforms} from '../src/live-transforms.js';
import {createPerson} from '../src/scene-assets.js';
import {batchPlayer} from '../src/player-batch.js';
import {createAvatarOutline} from '../src/avatar-outline.js';

test('unchanged live rigs compose no matrices; limb, root, scale and parent edits propagate exactly',()=>{
  const scene=new THREE.Group(),rig=new THREE.Group(),pivot=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry());
  scene.add(rig);rig.add(pivot);pivot.add(mesh);pivot.position.set(0,1,0);mesh.position.set(.2,.5,0);
  scene.updateMatrixWorld(true);const transforms=createLiveTransforms();transforms.update(rig);const before=transforms.stats;
  for(let i=0;i<60;i++)assert.equal(transforms.update(rig),false);
  assert.deepEqual(transforms.stats,before,'idle scene causes no compositions/propagations');
  for(const edit of [()=>pivot.rotation.x=.6,()=>rig.position.set(3,2,1),()=>rig.scale.set(1,2,1),()=>{scene.position.x=80;scene.updateMatrixWorld();}]){
    edit();transforms.update(rig);
    const expected=new THREE.Matrix4().compose(scene.position,scene.quaternion,scene.scale).multiply(new THREE.Matrix4().compose(rig.position,rig.quaternion,rig.scale)).multiply(new THREE.Matrix4().compose(pivot.position,pivot.quaternion,pivot.scale)).multiply(new THREE.Matrix4().compose(mesh.position,mesh.quaternion,mesh.scale));
    for(let i=0;i<16;i++)assert.ok(Math.abs(mesh.matrixWorld.elements[i]-expected.elements[i])<1e-10);
  }
});

test('player idle breathing shares GPU uniforms with outline and leaves transforms and vertex buffers unchanged',()=>{
  const player=createPerson(new THREE.BoxGeometry(),c=>new THREE.MeshLambertMaterial({color:c}),'#5a95bd'),batch=batchPlayer(player),outline=createAvatarOutline(player,batch.installPose),transforms=createLiveTransforms();
  transforms.update(player);const geometry=batch.mesh.geometry,p=geometry.attributes.position,version=p.version,before=transforms.stats,updates=batch.updates;
  const body={uniforms:{},vertexShader:'#include <begin_vertex>'},edges={uniforms:{},vertexShader:'#include <begin_vertex>'};
  batch.mesh.material.onBeforeCompile(body);player.children.find(o=>o.isLineSegments).material.onBeforeCompile(edges);
  for(let i=0;i<60;i++){batch.setTime(i/30,true);batch.update();transforms.update(player);}
  assert.deepEqual(transforms.stats,before);assert.equal(batch.updates,updates);assert.equal(p.version,version);
  assert.equal(body.uniforms.playerTime,edges.uniforms.playerTime);assert.equal(body.uniforms.playerBreath,edges.uniforms.playerBreath);
  assert.equal(body.uniforms.playerBreath.value,.012);assert.match(body.vertexShader,/sin\(playerTime/);
  batch.setTime(2,false);assert.equal(body.uniforms.playerBreath.value,0);outline.dispose();batch.dispose();
});
