import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cacheOffset,createStaticFrameCache} from '../src/static-frame-cache.js';

test('orthographic cached color and depth align for arbitrary ground translation and heights',()=>{
  const guard=1.18,camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,400);
  camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const cached=camera.clone();cached.left*=guard;cached.right*=guard;cached.top*=guard;cached.bottom*=guard;cached.updateProjectionMatrix();cached.updateMatrixWorld();
  camera.position.add(new THREE.Vector3(.7,0,-.5));camera.updateMatrixWorld();
  const shift=cacheOffset(camera,cached,guard);
  for(const point of [new THREE.Vector3(),new THREE.Vector3(2,5,-3),new THREE.Vector3(-4,-1,6)]){
    const p=point.clone().project(camera),old=point.clone().project(cached);
    assert.ok(Math.abs(p.x/guard+shift.x-old.x)<1e-10);
    assert.ok(Math.abs(p.y/guard+shift.y-old.y)<1e-10);
    assert.ok(Math.abs((old.z+1)*.5+shift.z-(p.z+1)*.5)<1e-10,'cached depth must still occlude moving characters correctly');
  }
});

function fixture(unsupported=false){
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,400),object=new THREE.Mesh(new THREE.BoxGeometry(),unsupported?new THREE.ShaderMaterial():new THREE.MeshBasicMaterial());
  camera.layers.enable(1);camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();object.layers.set(1);scene.add(object);
  const trace=[];let target=null,width=1500,height=1050,mask=false,fail=false,shader;
  const renderer={autoClear:true,state:{buffers:{depth:{setMask(value){mask=value;trace.push('mask');}}}},
    getDrawingBufferSize(out){return out.set(width,height);},setRenderTarget(value){target=value;},
    clearDepth(){assert.equal(mask,true,'depth clear needs write mask even after transparent frame');trace.push('clear');},
    render(mesh){trace.push('copy');assert.equal(this.autoClear,false);if(!unsupported){assert.doesNotMatch(mesh.material.fragmentShader,/gl_FragDepth|texture2D\(depth/);assert.equal(mesh.material.depthWrite,false);}else assert.match(mesh.material.fragmentShader,/gl_FragDepth/);}
  };
  const cache=createStaticFrameCache(renderer,scene,camera,(view,output,background=true)=>{
    renderer.setRenderTarget(output);
    if(!shader&&!unsupported){shader={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader,uniforms:{}};object.material.onBeforeCompile(shader,renderer);}
    trace.push(background?'capture':'live');
    if(!unsupported){assert.equal(shader.uniforms.islandDepthActive.value,!background);assert.equal(shader.uniforms.islandDepth.value===output?.depthTexture,false,'no capture feedback');}
    if(!background){assert.equal(view.layers.mask,2);if(fail)throw Error('live failure');mask=false;}
  },()=>{});cache.prepare(scene);
  return {cache,camera,trace,renderer,get shader(){return shader;},get target(){return target;},resize(w,h){width=w;height=h;},fail(){fail=true;}};
}

test('reuse copies color only, clears actor depth safely and preserves cache while the camera follows',()=>{
  const f=fixture();f.cache.render(null,true);assert.deepEqual(f.trace,['capture','copy','mask','clear','live']);
  f.trace.length=0;f.camera.position.add(new THREE.Vector3(.1,0,.1));f.camera.updateMatrixWorld();f.cache.render(null,true);
  assert.deepEqual(f.trace,['copy','mask','clear','live']);assert.equal(f.cache.stats.captures,1);assert.equal(f.cache.stats.hits,1);
  assert.equal(f.cache.stats.depthCopyPixels,0);assert.equal(f.cache.stats.colorPixels,2*1500*1050);assert.equal(f.shader.uniforms.islandDepthActive.value,false);
  assert.equal(f.camera.layers.mask,3);assert.equal(f.renderer.autoClear,true);f.cache.dispose();
});

test('FXAA-sized output, local shadow repaint, resize/release and direct orbit/travel rendering restore depth state',()=>{
  const f=fixture(),output=new THREE.WebGLRenderTarget(1500,1050);f.cache.render(output,true);
  const oldTexture=f.shader.uniforms.islandDepth.value;assert.notEqual(oldTexture,output.depthTexture);
  f.cache.invalidateRegions([new THREE.Box3(new THREE.Vector3(-.5,-.2,-.5),new THREE.Vector3(.5,.5,.5))]);f.cache.render(output,true);assert.ok(f.cache.stats.patches>0);assert.equal(f.cache.stats.captures,1);
  f.resize(900,600);output.setSize(900,600);f.cache.render(output,true);assert.equal(f.cache.stats.captures,2);assert.equal(f.cache.stats.buffers,1);
  f.cache.render(output,false);assert.equal(f.shader.uniforms.islandDepthActive.value,false);assert.equal(f.cache.stats.active,false);
  f.cache.render(output,true);assert.equal(f.cache.stats.captures,3);f.cache.release();assert.equal(f.cache.stats.buffers,0);f.cache.dispose();output.dispose();
});

test('a failed overlay restores camera/clear/sampler state; unsupported dynamic shaders retain full-depth copying',()=>{
  const f=fixture();f.fail();assert.throws(()=>f.cache.render(null,true),/live failure/);
  assert.equal(f.camera.layers.mask,3);assert.equal(f.renderer.autoClear,true);assert.equal(f.shader.uniforms.islandDepthActive.value,false);f.cache.dispose();
  const legacy=fixture(true);legacy.cache.render(null,true);assert.deepEqual(legacy.trace,['capture','copy','live']);
  assert.equal(legacy.cache.stats.sparseDepth,false);assert.equal(legacy.cache.stats.depthCopyPixels,1500*1050);legacy.cache.dispose();
});
