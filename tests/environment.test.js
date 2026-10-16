import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEnvironment} from '../src/environment.js';

test('rain follows time and focus using uniforms with no per-drop matrix uploads',()=>{
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),ambient=new THREE.HemisphereLight(),fill=new THREE.DirectionalLight();scene.background=new THREE.Color();scene.fog=new THREE.Fog();
  const cube=new THREE.BoxGeometry(),source=Array.from(cube.index.array),env=createEnvironment({scene,sun,ambient,fill,renderer:{},ocean:{setTint(){}},cube}),rain=scene.children.at(-1),focus=new THREE.Vector3(1,2,3),profile={particles:64};
  env.set({sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:true},true);
  const version=rain.instanceMatrix.version,data=rain.instanceMatrix.array.slice();
  const normals=rain.geometry.attributes.normal;
  for(const [x,z]of [[18,30],[-18,30],[-18,-30],[18,-30]]){
    env.setView(x,25,z);assert.equal(rain.geometry.drawRange.count,18);
    const c=Math.cos(-.12),s=Math.sin(-.12),direction=new THREE.Vector3(c*x+s*25,-s*x+c*25,z);
    for(const id of rain.geometry.index.array.slice(0,18))assert.ok(new THREE.Vector3().fromBufferAttribute(normals,id).dot(direction)>0);
    const indexVersion=rain.geometry.index.version;env.setView(x*2,50,z*2);assert.equal(rain.geometry.index.version,indexVersion);
  }
  assert.deepEqual(Array.from(cube.index.array),source,'shared cube geometry remains complete');
  for(let i=0;i<30;i++){focus.x+=.1;env.update(1/30,i/30,focus,profile);}
  assert.equal(rain.visible,true);assert.equal(rain.count,64);assert.equal(rain.instanceMatrix.version,version);assert.deepEqual(rain.instanceMatrix.array,data);
  const shader={uniforms:{},vertexShader:'#include <project_vertex>'};rain.material.onBeforeCompile(shader);assert.equal(shader.uniforms.rainTime.value,29/30);assert.deepEqual(shader.uniforms.rainFocus.value,focus);
  env.update(.1,1,focus,{particles:0});assert.equal(rain.visible,false);assert.equal(shader.uniforms.rainTime.value,29/30);env.dispose();cube.dispose();
});
