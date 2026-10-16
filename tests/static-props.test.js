import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchProps} from '../src/render-batches.js';
import {spatialDrawList} from '../src/view-draw-list.js';
import {createShadowRefresh,revealCulledCasters} from '../src/shadow-refresh.js';

test('static decorations use baked vertices/normals with no pose texture, and rare edits stay correct',()=>{
  const root=new THREE.Group(),object=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial({color:'#9ab378'}));
  object.position.set(4,2,-3);object.rotation.set(.2,.4,0);object.scale.set(1,2,.6);root.add(object);root.updateMatrixWorld(true);
  const batch=batchProps([object],root,{cached:true}),mesh=batch.viewList.mesh,g=mesh.geometry;
  assert.equal(batch.palette,null);assert.equal(g.attributes.batchPart,undefined);assert.equal(mesh.customDepthMaterial,undefined);
  const expected=object.geometry.clone().applyMatrix4(object.matrix);
  for(const key of ['position','normal'])for(let i=0;i<g.attributes[key].array.length;i++)assert.ok(Math.abs(g.attributes[key].array[i]-expected.attributes[key].array[i])<1e-6);
  const before=g.attributes.position.version,normalBefore=g.attributes.normal.version;
  object.material.color.set('#e8d78a');batch.update([object]);assert.equal(g.attributes.position.version,before);assert.equal(g.attributes.normal.version,normalBefore);
  object.visible=false;batch.update([object]);assert.ok(g.attributes.position.array.every(value=>value===0),'hidden props collapse even in the full shadow prefix');assert.equal(batch.viewList.ranges[0].bounds.isEmpty(),true);
  object.visible=true;batch.update([object]);assert.deepEqual(g.attributes.position.array,expected.attributes.position.array);
  object.position.x+=2;batch.update([object]);const moved=object.geometry.clone().applyMatrix4(object.matrix);
  assert.deepEqual(g.attributes.position.array,moved.attributes.position.array);assert.equal(g.attributes.normal.version,normalBefore,'translation reuses precomputed normals');
  expected.dispose();moved.dispose();batch.dispose();
});

test('empty color batches leave the render list but offscreen casters return for shadow refresh only',()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial());mesh.castShadow=true;scene.add(mesh);
  const list=spatialDrawList(mesh),camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);list.update(()=>false);assert.equal(mesh.visible,false);assert.equal(mesh.userData.colorCulled,true);
  let shadowTriangles=0,target=null;
  const renderer={shadowMap:{enabled:true,needsUpdate:true},getRenderTarget(){return target;},setRenderTarget(value){target=value;},render(){
    assert.equal(mesh.visible,true,'shadow caster restored before the renderer builds its lists');
    mesh.onBeforeShadow();shadowTriangles=mesh.geometry.drawRange.count/3;mesh.onAfterShadow();
  }};
  const refresh=createShadowRefresh(renderer,scene,camera);refresh.refresh();assert.equal(shadowTriangles,12);assert.equal(mesh.visible,false);assert.equal(mesh.geometry.drawRange.count,0);
  const restore=revealCulledCasters(scene);assert.equal(mesh.visible,true);restore();assert.equal(mesh.visible,false);
  list.update(()=>true);assert.equal(mesh.visible,true);assert.equal(mesh.userData.colorCulled,false);refresh.dispose();
});
