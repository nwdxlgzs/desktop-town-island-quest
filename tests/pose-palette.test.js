import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPosePalette} from '../src/pose-palette.js';

function compile(palette,cap,shadow=false){const material=new THREE.MeshLambertMaterial();palette.install(material);const m=shadow?palette.depth:material,shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader};m.onBeforeCompile(shader,{capabilities:{maxVertexUniforms:cap}});material.dispose();return shader;}
test('small poses use exact shared uniform rows in both colour and shadow programs and retain room for lights',()=>{
  const palette=createPosePalette(24),matrix=new THREE.Matrix4().compose(new THREE.Vector3(2,3,4),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.3,.4)),new THREE.Vector3(1,2,.7));
  palette.set(23,matrix,true,.3);palette.flush();const colour=compile(palette,256),shadow=compile(palette,256,true),data=colour.uniforms.batchPoseRows.value;
  assert.equal(palette.transport,'uniforms');assert.equal(data,palette.texture.image.data);assert.equal(shadow.uniforms.batchPoseRows.value,data);assert.equal(colour.uniforms.batchPose,undefined);assert.doesNotMatch(colour.vertexShader,/texelFetch/);assert.match(colour.vertexShader,/batchPoseRows\[144\]/);
  const p=new THREE.Vector4(.3,.5,.7,1),actual=new THREE.Vector3(),expected=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(matrix),o=23*24;
  actual.set(data[o]*p.x+data[o+1]*p.y+data[o+2]*p.z+data[o+3],data[o+4]*p.x+data[o+5]*p.y+data[o+6]*p.z+data[o+7],data[o+8]*p.x+data[o+9]*p.y+data[o+10]*p.z+data[o+11]);assert.ok(actual.distanceTo(expected)<1e-6);
  matrix.elements[12]=10;palette.set(23,matrix,false,-1,false);palette.flush();assert.equal(data[o+3],10);assert.equal(data[o+15],0);assert.equal(data[o+19],-1);palette.dispose();
});
test('larger palettes or missing uniform capacity retain bounded texture programs rather than exceeding device limits',()=>{
  for(const [count,cap]of [[27,256],[24,128],[100,4096],[24,undefined]]){const palette=createPosePalette(count),shader=compile(palette,cap);assert.equal(palette.transport,'texture');assert.equal(shader.uniforms.batchPose.value,palette.texture);assert.match(shader.vertexShader,/texelFetch/);assert.equal(shader.uniforms.batchPoseRows,undefined);palette.dispose();}
});
