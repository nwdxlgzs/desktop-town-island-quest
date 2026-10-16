import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {spatialDrawList,createIslandView} from '../src/view-draw-list.js';
import {batchResidents,batchProps} from '../src/render-batches.js';
import {createPerson} from '../src/scene-assets.js';

function viewAt(x=0){
  const camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,100);
  camera.position.set(x,15,0);camera.up.set(0,0,-1);camera.lookAt(x,0,0);camera.updateMatrixWorld();
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
}

test('spatial selection keeps crossing triangles, skips remote geometry and preserves full shadow casters',()=>{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([
    -1,0,0, 1,0,0, 0,0,1,
    -1,0,0, 8,0,0, 8,0,1, // centroid is outside, but this triangle reaches into view
    20,0,0, 21,0,0, 20,0,1
  ],3));
  const mesh=new THREE.Mesh(geometry),positions=geometry.attributes.position.array.slice(),list=spatialDrawList(mesh,1),frustum=viewAt();
  list.update(r=>frustum.intersectsBox(r.bounds));
  assert.equal(list.triangles,2);assert.equal(list.totalTriangles,3);
  assert.deepEqual(geometry.attributes.position.array,positions);
  const visibleRange={...geometry.drawRange},version=geometry.index.version;
  assert.equal(list.update(r=>frustum.intersectsBox(r.bounds)),false);
  assert.equal(geometry.index.version,version,'unchanged selection causes no GPU upload');
  mesh.onBeforeShadow();assert.deepEqual(geometry.drawRange,{start:0,count:9});
  assert.deepEqual([...geometry.index.array.slice(0,9)],[0,1,2,3,4,5,6,7,8]);
  mesh.onAfterShadow();assert.deepEqual(geometry.drawRange,visibleRange);
  list.update(()=>false);assert.equal(geometry.drawRange.count,0);
  list.update(()=>true);assert.equal(list.triangles,3);
});

test('island visibility handles translated islands and moving, rotated, scaled props without rescanning static chunks',()=>{
  const root=new THREE.Group(),prop=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial());
  root.position.x=90;root.add(prop);root.updateMatrixWorld(true);
  const props=batchProps([prop],root),staticMesh=new THREE.Mesh(new THREE.BoxGeometry()),staticList=spatialDrawList(staticMesh),view=createIslandView(root,{props:[prop],staticLists:[staticList],dynamicLists:[props.viewList]});
  view.update(viewAt(90),1);assert.equal(prop.userData.inView,true);assert.ok(view.selectedTriangles>0);
  const revision=staticList.revision;
  prop.position.x=20;view.update(viewAt(90),1);
  assert.equal(prop.userData.inView,false);assert.equal(props.viewList.triangles,0);assert.equal(staticList.revision,revision);
  prop.position.x=4;prop.scale.setScalar(4);prop.rotation.y=Math.PI/4;view.update(viewAt(90),1);
  assert.equal(prop.userData.inView,true,'scaled rotated prop overlaps the edge of the viewport');
  root.position.x=140;view.invalidate();view.update(viewAt(90),1);assert.equal(view.selectedTriangles,0);
  view.update(viewAt(140),2);assert.ok(view.selectedTriangles>0);
  props.dispose();
});

test('offscreen rigs skip matrix traversal and buffer uploads, then resume with their latest pose',()=>{
  const root=new THREE.Group(),cube=new THREE.BoxGeometry(),actor=createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true),prop=new THREE.Mesh(cube,new THREE.MeshLambertMaterial());
  root.add(actor,prop);root.updateMatrixWorld(true);
  const residents=batchResidents([{object:actor}],root),props=batchProps([prop],root),position=residents.viewList.mesh.geometry.attributes.position,old=position.array.slice(),version=position.version,propUpdates=props.updates;
  const logic=new THREE.Group();logic.visible=false;logic.userData.logicOnly=true;root.add(logic);logic.attach(actor);logic.attach(prop);
  let traversals=0;const originalActor=actor.updateWorldMatrix,originalProp=prop.updateWorldMatrix;
  actor.updateWorldMatrix=function(...args){traversals++;return originalActor.apply(this,args);};
  prop.updateWorldMatrix=function(...args){traversals++;return originalProp.apply(this,args);};
  const actorPropagation=actor.updateMatrixWorld,propPropagation=prop.updateMatrixWorld;
  actor.updateMatrixWorld=function(...args){traversals++;return actorPropagation.apply(this,args);};
  prop.updateMatrixWorld=function(...args){traversals++;return propPropagation.apply(this,args);};
  actor.position.x=2;actor.userData.armR.rotation.z=2;prop.position.x=3;
  residents.update(()=>false);props.update(()=>false);
  assert.equal(traversals,0);assert.equal(position.version,version);assert.equal(props.updates,propUpdates);assert.deepEqual(position.array,old);
  residents.update(()=>true);props.update(()=>true);
  assert.ok(traversals>0);assert.equal(position.version,version);assert.ok(props.updates>propUpdates);assert.equal(residents.palette.texture.image.data[3],2,'latest offscreen translation resumes through the affine pose row');
  const hit=new THREE.Mesh(cube,new THREE.MeshBasicMaterial({visible:false}));actor.add(hit);actor.updateWorldMatrix(true,true);
  assert.ok(new THREE.Raycaster(new THREE.Vector3(2,0,3),new THREE.Vector3(0,0,-1)).intersectObject(hit).length,'CPU hit volumes still work under the hidden logical parent');
  props.dispose();
});

test('unchanged view reuses actor bounds; static changes do not dirty visible rigs',()=>{
  const root=new THREE.Group(),prop=new THREE.Mesh(new THREE.BoxGeometry()),view=createIslandView(root,{props:[prop]});root.add(prop);
  const frustum=viewAt();view.update(frustum,1);assert.equal(view.entered.has(prop),true);const first=view.checks;
  for(let i=0;i<30;i++)view.update(frustum,1);
  assert.deepEqual(view.checks,first);assert.equal(view.entered.size,0);
  view.update(frustum,2);assert.equal(view.entered.size,0);assert.equal(view.checks.dynamicTests,first.dynamicTests+1);
  prop.position.x=20;view.update(frustum,2);assert.equal(prop.userData.inView,false);
  prop.position.x=0;view.update(frustum,2);assert.equal(view.entered.has(prop),true);
  prop.visible=false;view.update(frustum,2);assert.equal(prop.userData.inView,false);
});

test('cached frames cull overlays and actors without rescanning or uploading opaque island indices',()=>{
  const root=new THREE.Group(),opaque=new THREE.Mesh(new THREE.BoxGeometry()),sign=new THREE.Mesh(new THREE.BoxGeometry()),staticList=spatialDrawList(opaque),overlay=spatialDrawList(sign),view=createIslandView(root,{staticLists:[staticList],overlayLists:[overlay]});
  view.updateStatic(viewAt());view.update(viewAt(),1,false);const before=view.checks,version=opaque.geometry.index.version;
  for(let i=1;i<=30;i++)view.update(viewAt(i*.2),i+1,false);
  assert.equal(view.checks.staticTests,before.staticTests);assert.equal(opaque.geometry.index.version,version,'cache reuse does not oscillate opaque index uploads');
  assert.ok(view.checks.overlayTests>before.overlayTests);assert.equal(overlay.triangles,0,'signs still leave the live viewport');
  view.updateStatic(viewAt(6));assert.equal(staticList.triangles,0,'recapture culls opaque scenery for its own view');
  view.update(viewAt(),40);assert.ok(staticList.triangles>0,'direct-render callers retain normal culling');
});

test('a refill selects the union of disjoint strips once without adding the space between them',()=>{
  const root=new THREE.Group(),geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([
    -13,0,0,-11,0,0,-12,0,1, -1,0,0,1,0,0,0,0,1, 11,0,0,13,0,0,12,0,1
  ],3)),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),list=spatialDrawList(mesh,1),view=createIslandView(root,{staticLists:[list]});
  view.updateStatic(viewAt(),[viewAt(-12),viewAt(12)]);
  assert.equal(list.triangles,2);assert.equal(view.checks.staticTests,list.ranges.length,'one selection visit per spatial range, even for several strips');
  const version=mesh.geometry.index.version;view.updateStatic(viewAt(),[viewAt(-12),viewAt(12)]);assert.equal(mesh.geometry.index.version,version);
  mesh.onBeforeShadow();assert.equal(mesh.geometry.drawRange.count,9);mesh.onAfterShadow();assert.equal(mesh.geometry.drawRange.count,6);
});

test('static voxel faces are removed before submission for each view but the complete shadow list is preserved',()=>{
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshLambertMaterial()),list=spatialDrawList(mesh),view=createIslandView(root,{staticLists:[list]});
  for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide])for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    mesh.material.side=side;const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(Math.cos(angle)*8,10,Math.sin(angle)*8);camera.lookAt(0,0,0);camera.updateMatrixWorld();const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    view.updateStatic(f);assert.ok(list.triangles>0);assert.ok(side===THREE.DoubleSide?list.triangles===12:list.triangles<=10,'back-facing voxel faces are absent from the live suffix');
    const range={...mesh.geometry.drawRange};mesh.onBeforeShadow();assert.deepEqual(mesh.geometry.drawRange,{start:0,count:36});mesh.onAfterShadow();assert.deepEqual(mesh.geometry.drawRange,range);
    const version=mesh.geometry.index.version,checks=view.checks.faceTests;view.updateStatic(f);assert.equal(mesh.geometry.index.version,version);assert.equal(view.checks.faceTests,checks,'unchanged orthographic direction reuses face classification');
  }
  mesh.material=[new THREE.MeshLambertMaterial({side:THREE.FrontSide}),new THREE.MeshLambertMaterial({side:THREE.BackSide})];
  view.updateStatic(viewAt());assert.equal(list.triangles,12,'mixed face modes retain both directions conservatively');
});

test('unchanged membership never rescans dynamic draw ranges, even for animated poses and camera translation',()=>{
  const root=new THREE.Group(),object=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial());root.add(object);const batch=batchProps([object],root),view=createIslandView(root,{props:[object],dynamicLists:[batch.viewList]});
  const f=viewAt();view.update(f,1,false);const count=batch.viewList.checks.selectionTests;
  for(let i=0;i<20;i++){object.rotation.y+=.02;view.update(viewAt(i*.001),i+2,false);}
  assert.equal(batch.viewList.checks.selectionTests,count);object.position.x=30;view.update(f,25,false);assert.equal(batch.viewList.triangles,0);assert.equal(batch.viewList.checks.selectionTests,count+1);batch.dispose();
});

test('animation visibility checks visit only dirty sources but camera, parent and fade invalidation check all',()=>{
  const root=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()),b=a.clone();root.add(a,b);
  const batch=batchProps([a,b],root),view=createIslandView(root,{props:[a,b],dynamicLists:[batch.viewList]}),f=viewAt();view.update(f,1,false);
  let unrelatedReads=0,bx=b.position.x;Object.defineProperty(b.position,'x',{get(){unrelatedReads++;return bx;},set(value){bx=value;},configurable:true});
  a.position.x=30;view.update(f,1,false,new Set([a]));assert.equal(a.userData.inView,false);assert.equal(b.userData.inView,true);assert.equal(unrelatedReads,0,'an unrelated rig is not visited after animation');assert.equal(batch.viewList.triangles,12);
  b.visible=false;view.update(f,1,false,new Set([b]));assert.equal(batch.viewList.triangles,0);b.visible=true;view.update(f,1,false,new Set([b]));assert.equal(view.entered.has(b),true);
  a.position.x=0;unrelatedReads=0;view.invalidate();view.update(f,1,false,[]);assert.ok(unrelatedReads>0,'fade invalidation cannot leave stale visibility');assert.equal(batch.viewList.triangles,24);
  view.update(viewAt(30),2,false,[]);assert.equal(batch.viewList.triangles,0,'camera change checks sources beyond the dirty set');
  root.position.x=30;view.update(viewAt(30),2,false,[]);assert.equal(batch.viewList.triangles,24,'island translation also checks every source');batch.dispose();
});
