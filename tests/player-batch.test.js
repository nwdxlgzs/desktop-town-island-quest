import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPerson} from '../src/scene-assets.js';
import {batchPlayer} from '../src/player-batch.js';
import {createAvatarOutline} from '../src/avatar-outline.js';

test('one player draw preserves limb poses, outline layers and shadow poses without vertex uploads',()=>{
  const actor=createPerson(new THREE.BoxGeometry(),color=>new THREE.MeshLambertMaterial({color}),'#5a95bd'),parts=actor.userData.parts;
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(parts[0].geometry));edge.layers.set(1);parts[0].add(edge);
  const batch=batchPlayer(actor),g=batch.mesh.geometry,positions=g.attributes.position.array.slice(),version=g.attributes.position.version;
  actor.userData.armR.rotation.set(.4,0,2);actor.userData.left.rotation.x=-.6;actor.position.set(4,2,3);batch.update();actor.updateMatrixWorld(true);
  const shader={uniforms:{},vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>'};batch.mesh.material.onBeforeCompile(shader);
  const matrices=shader.uniforms.playerPose.value,local=new THREE.Vector3(),expected=new THREE.Vector3();let start=0;
  for(const [i,part]of parts.entries()){
    for(let j=0;j<part.geometry.attributes.position.count;j++){
      local.fromBufferAttribute(g.attributes.position,start+j).applyMatrix4(matrices[i]).applyMatrix4(actor.matrixWorld);
      expected.fromBufferAttribute(part.geometry.attributes.position,j).applyMatrix4(part.matrixWorld);assert.ok(local.distanceTo(expected)<1e-6);
    }start+=part.geometry.attributes.position.count;
    assert.equal(part.layers.mask,4);
  }
  assert.equal(edge.layers.mask,2);assert.deepEqual(g.attributes.position.array,positions);assert.equal(g.attributes.position.version,version);
  const old=batch.updates;batch.update();assert.equal(batch.updates,old);
  const depthShader={uniforms:{},vertexShader:'#include <begin_vertex>'};batch.mesh.customDepthMaterial.onBeforeCompile(depthShader);assert.equal(depthShader.uniforms.playerPose.value,matrices);
  assert.match(depthShader.vertexShader,/playerPose\[int\(playerPart\)\]/);batch.dispose();
});

test('topmost outline shares body poses in one immutable line draw',()=>{
  const actor=createPerson(new THREE.BoxGeometry(),color=>new THREE.MeshLambertMaterial({color}),'#5a95bd'),batch=batchPlayer(actor),outline=createAvatarOutline(actor,batch.installPose),line=actor.children.find(o=>o.isLineSegments);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>'};line.material.onBeforeCompile(shader);const poses=shader.uniforms.playerPose.value;
  actor.userData.armR.rotation.z=2.2;actor.userData.left.rotation.x=.5;batch.update();actor.updateMatrixWorld(true);
  assert.equal(line.material.depthTest,false);assert.equal(line.renderOrder,10000);assert.equal(line.layers.mask,2);
  assert.equal(actor.children.filter(o=>o.isLineSegments).length,1);assert.equal(line.visible,false);outline.set(true);assert.equal(line.visible,true);
  const p=line.geometry.attributes.position,part=line.geometry.attributes.playerPart,expected=new THREE.Vector3(),actual=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    const id=part.getX(i);actual.fromBufferAttribute(p,i).applyMatrix4(poses[id]).applyMatrix4(actor.matrixWorld);
    expected.fromBufferAttribute(p,i).applyMatrix4(actor.userData.parts[id].matrixWorld);assert.ok(actual.distanceTo(expected)<1e-6);
  }
  const version=p.version;actor.userData.armR.rotation.z=.8;batch.update();assert.equal(p.version,version);outline.set(false);assert.equal(line.visible,false);
  outline.dispose();assert.equal(actor.children.includes(line),false);batch.dispose();
});
