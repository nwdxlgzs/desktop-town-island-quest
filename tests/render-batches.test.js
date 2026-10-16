import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchOccluders,batchResidents,batchProps,batchIslandProps,mergeRigidGroup,paintRigidPart} from '../src/render-batches.js';
import {createPerson} from '../src/scene-assets.js';

// Decode the GPU's pose table independently and compare with source geometry.
function posed(batch){
  const g=batch.viewList.mesh.geometry.clone(),data=batch.palette.texture.image.data,ids=g.attributes.batchPart,p=g.attributes.position,n=g.attributes.normal,m=new THREE.Matrix4(),normal=new THREE.Matrix3(),v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){const offset=ids.getX(i)*24;m.set(data[offset],data[offset+1],data[offset+2],data[offset+3],data[offset+4],data[offset+5],data[offset+6],data[offset+7],data[offset+8],data[offset+9],data[offset+10],data[offset+11],0,0,0,1);v.fromBufferAttribute(p,i).applyMatrix4(m);p.setXYZ(i,v.x,v.y,v.z);for(let c=0;c<3;c++)for(let r=0;r<3;r++)normal.elements[c*3+r]=data[offset+12+c*4+r];v.fromBufferAttribute(n,i).applyMatrix3(normal).normalize();n.setXYZ(i,v.x,v.y,v.z);}
  return g;
}

test('rigid boat shares one surface, retains its hit volume and repaints only the sail',()=>{
  const boat=new THREE.Group(),cube=new THREE.BoxGeometry(),hull=new THREE.Mesh(cube,new THREE.MeshLambertMaterial({color:'#bca580'})),sail=new THREE.Mesh(cube,new THREE.MeshLambertMaterial({color:'#fff7df'}));
  hull.position.y=.2;hull.scale.set(1.2,.35,2.8);sail.position.set(.4,1.55,-.5);sail.scale.set(.85,1.1,.05);sail.rotation.y=.2;
  const hit=new THREE.Mesh(new THREE.BoxGeometry(2.3,3,3.8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=1;boat.add(hull,sail,hit);
  const originals=[hull,sail].map(part=>{part.updateMatrix();return part.geometry.clone().applyMatrix4(part.matrix);}),surface=mergeRigidGroup(boat,[],[sail]),g=surface.geometry;
  assert.deepEqual(boat.children,[hit,surface]);assert.equal(surface.castShadow,true);assert.equal(surface.receiveShadow,true);
  let offset=0;for(const original of originals){for(const name of ['position','normal'])for(let i=0;i<original.attributes[name].count;i++)assert.ok(new THREE.Vector3().fromBufferAttribute(g.attributes[name],offset+i).distanceTo(new THREE.Vector3().fromBufferAttribute(original.attributes[name],i))<1e-6,`${name} matches the separate source meshes`);offset+=original.attributes.position.count;original.dispose();}
  boat.position.set(3,0,-2);boat.rotation.y=.6;boat.updateMatrixWorld(true);const center=hit.getWorldPosition(new THREE.Vector3()),ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(hit).length>0,'the separate invisible hit volume still follows the boat');
  const p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,pv=p.version,nv=n.version,cv=c.version,before=c.array.slice(),count=hull.geometry.attributes.position.count;c.clearUpdateRanges();
  sail.material=new THREE.MeshLambertMaterial({color:'#eeadc8'});assert.equal(paintRigidPart(surface,sail),true);
  assert.equal(c.version,cv+1);assert.equal(p.version,pv);assert.equal(n.version,nv);assert.deepEqual(c.array.slice(0,count*3),before.slice(0,count*3));
  assert.deepEqual(c.updateRanges,[{start:count*3,count:sail.geometry.attributes.position.count*3}]);
  const expectedColor=new THREE.Vector3(sail.material.color.r,sail.material.color.g,sail.material.color.b);for(let i=count;i<c.count;i++)assert.ok(new THREE.Vector3().fromBufferAttribute(c,i).distanceTo(expectedColor)<1e-7);
  c.clearUpdateRanges();assert.equal(paintRigidPart(surface,sail),false);assert.equal(paintRigidPart(surface,hull),false);assert.equal(c.version,cv+1);assert.deepEqual(c.updateRanges,[]);
  g.dispose();surface.material.dispose();cube.dispose();hit.geometry.dispose();
});

test('dirty updates skip unrelated batch roots before matrix work',()=>{
  const root=new THREE.Group(),creature=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()),lamp=creature.clone(),unrelated=new THREE.Group();root.add(creature,lamp);
  const props=batchIslandProps([creature],[lamp],root),cube=new THREE.BoxGeometry(),actor=createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true);root.add(actor);const residents=batchResidents([{object:actor}],root);
  let rootUpdates=0;const original=root.updateWorldMatrix;root.updateWorldMatrix=function(...args){rootUpdates++;return original.apply(this,args);};
  const revision=props.staticRevision,checks=props.checks,residentChecks=residents.checks;
  assert.equal(props.update([unrelated]),false);assert.equal(residents.update(new Set([creature,unrelated])),false);assert.equal(rootUpdates,0);assert.equal(props.checks,checks);assert.equal(residents.checks,residentChecks);
  creature.position.x=2;assert.equal(props.update(new Set([creature])),true);assert.equal(rootUpdates,1);assert.equal(props.staticRevision,revision);
  lamp.visible=false;assert.equal(props.update([lamp]),true);assert.equal(rootUpdates,2);assert.equal(props.staticRevision,revision+1);assert.equal(props.staticViewList.ranges[0].bounds.isEmpty(),true);
  lamp.visible=true;lamp.position.z=3;props.update([lamp]);assert.equal(rootUpdates,3);assert.equal(props.staticRevision,revision+2);assert.equal(props.staticViewList.ranges[0].bounds.isEmpty(),false);
  actor.userData.armR.rotation.z=2;assert.equal(residents.update([actor]),true);assert.equal(rootUpdates,4);assert.equal(residents.checks,residentChecks+1);
  props.dispose();residents.dispose();
});

test('opaque batch switches just the fading object and restores it without duplication',()=>{
  const root=new THREE.Group(),occluders=[];
  for(let i=0;i<2;i++){
    const group=new THREE.Group(),geometry=new THREE.BoxGeometry();geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(geometry.attributes.position.count*3).fill(1),3));
    group.add(new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,transparent:true})));root.add(group);occluders.push({group});
  }
  const batch=batchOccluders(occluders,root),attribute=root.children.at(-1).geometry.attributes.surfaceVisible;
  assert.ok(occluders.every(o=>!o.group.children[0].visible));batch.setFading(occluders[0],true);
  assert.equal(occluders[0].group.children[0].visible,true);assert.equal(attribute.getX(0),0);assert.equal(attribute.getX(attribute.count-1),1);
  assert.equal(occluders[0].group.children[0].layers.mask,2,'only the fading surface uses the dynamic layer');
  assert.equal(batch.setFading(occluders[0],true),false,'opacity-only changes do not invalidate the opaque cache');
  batch.setFading(occluders[0],false);assert.equal(attribute.getX(0),1);assert.equal(occluders[0].group.children[0].visible,false);
});

test('props batch updates only changed buffers and preserves visibility, paint and island offsets',()=>{
  const root=new THREE.Group(),group=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial({color:'#ff0000'})),b=new THREE.Mesh(new THREE.CylinderGeometry(),new THREE.MeshLambertMaterial({color:'#00ff00'}));
  group.add(a,b);root.add(group);root.updateMatrixWorld(true);const batch=batchProps([group],root),geometry=root.children.at(-1).geometry,p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color;
  assert.ok(p.array.every(Number.isFinite));const pv=p.version,cv=c.version,nv=n.version,old=posed(batch).attributes.position.array.slice();assert.equal(batch.update(),false);assert.equal(p.version,pv);
  group.position.x=3;assert.equal(batch.update(),true);assert.equal(c.version,cv);assert.equal(p.version,pv);assert.equal(n.version,nv,'translation does not upload geometry');assert.ok(Math.abs(posed(batch).attributes.position.array[0]-old[0]-3)<1e-5);
  group.rotation.y=.4;group.scale.set(1,2,.7);batch.update();assert.equal(n.version,nv,'rotation and nonuniform scale only upload poses');
  const expected=a.geometry.clone().applyMatrix4(a.matrixWorld),actual=new THREE.Vector3().fromBufferAttribute(posed(batch).attributes.normal,0).normalize(),reference=new THREE.Vector3().fromBufferAttribute(expected.attributes.normal,0);assert.ok(actual.distanceTo(reference)<1e-6);expected.dispose();
  const paintPositionVersion=p.version;a.material.color.set('#0000ff');batch.update();assert.equal(p.version,paintPositionVersion);assert.ok(c.getZ(0)>.9);
  root.position.x=90;root.updateMatrixWorld(true);const offsetPosition=p.array.slice();assert.equal(batch.update(),false);assert.deepEqual(p.array,offsetPosition);
  group.visible=false;batch.update();assert.equal(batch.palette.texture.image.data[15],0);group.visible=true;batch.update();assert.equal(batch.palette.texture.image.data[15],1);batch.dispose();
});

test('resident batch follows a moving posed rig while invisible hit volumes remain clickable',()=>{
  const root=new THREE.Group(),cube=new THREE.BoxGeometry(),actor=createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true);
  root.add(actor);root.updateMatrixWorld(true);const batch=batchResidents([{object:actor}],root),mesh=root.children.at(-1),before=posed(batch).attributes.position.array.slice(),pv=mesh.geometry.attributes.position.version;
  actor.position.x=3;actor.userData.armR.rotation.z=2.3;batch.update();const after=posed(batch).attributes.position.array;
  assert.ok(after.every(Number.isFinite));assert.ok(Math.abs(after[0]-before[0]-3)<1e-5);assert.ok(after.some((v,i)=>i%3===1&&Math.abs(v-before[i])>.1),'arm pose follows the source rig');assert.equal(mesh.geometry.attributes.position.version,pv,'posed movement never uploads vertices');
  const hit=new THREE.Mesh(cube,new THREE.MeshBasicMaterial({visible:false}));hit.position.x=3;actor.add(hit);root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(6,.17,3),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(hit).length>=1);
});

test('explicit dirty sources visit only the changed rig and empty ticks scan nothing',()=>{
  const root=new THREE.Group(),objects=Array.from({length:4},()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()));
  root.add(...objects);root.updateMatrixWorld(true);const props=batchProps(objects,root),g=root.children.at(-1).geometry,initial=props.checks;
  const empty=new Set();for(let i=0;i<30;i++)assert.equal(props.update(empty),false);
  assert.equal(props.checks,initial,'unchanged scenery incurs no rig traversal');
  objects[2].position.x=4;assert.equal(props.update(new Set([objects[2]])),true);assert.equal(props.checks-initial,1);
  assert.ok(posed(props).attributes.position.getX(objects[0].geometry.attributes.position.count*2)>3);
  const cube=new THREE.BoxGeometry(),people=[0,1].map(()=>createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true));
  root.add(...people);root.updateMatrixWorld(true);const residents=batchResidents(people.map(object=>({object})),root),before=residents.checks;
  for(let i=0;i<30;i++)residents.update(empty);assert.equal(residents.checks,before);
  people[1].userData.armR.rotation.z=2;residents.update(new Set([people[1],objects[0]]));assert.equal(residents.checks-before,1,'unrelated prop sources do not visit residents');
  props.dispose();
});

test('indexed props preserve triangle topology, source culling and full shadow ranges',()=>{
  const root=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()),b=new THREE.Mesh(new THREE.CylinderGeometry(.3,.4,1,8).toNonIndexed(),new THREE.MeshLambertMaterial());
  b.position.x=4;root.add(a,b);root.updateMatrixWorld(true);
  const expected=[a,b].flatMap(m=>{const g=m.geometry.clone().applyMatrix4(m.matrixWorld),p=g.attributes.position,ids=g.index?.array??Array.from({length:p.count},(_,i)=>i),points=Array.from(ids,i=>[p.getX(i),p.getY(i),p.getZ(i)]);g.dispose();return points;});
  const batch=batchProps([a,b],root),mesh=batch.viewList.mesh,g=mesh.geometry;
  assert.equal(g.attributes.position.count,a.geometry.attributes.position.count+b.geometry.attributes.position.count);
  const fullCount=expected.length,read=(start,count)=>{const p=posed(batch).attributes.position;return Array.from(g.index.array.slice(start,start+count),i=>[p.getX(i),p.getY(i),p.getZ(i)]);};
  assert.deepEqual(read(0,fullCount),expected,'all triangles retain winding and positions across mixed input formats');
  batch.viewList.update(r=>r.object===b);assert.equal(g.drawRange.count,b.geometry.attributes.position.count);assert.deepEqual(read(g.drawRange.start,g.drawRange.count),expected.slice(a.geometry.index.count));
  const range={...g.drawRange};mesh.onBeforeShadow();assert.deepEqual(g.drawRange,{start:0,count:fullCount});mesh.onAfterShadow();assert.deepEqual(g.drawRange,range);
  batch.viewList.update(()=>false);assert.equal(g.drawRange.count,0);batch.viewList.update(()=>true);assert.equal(g.drawRange.count,fullCount);batch.dispose();
});

test('resident translations, limb rotation and greetings update poses without any vertex or normal uploads',()=>{
  const root=new THREE.Group(),cube=new THREE.BoxGeometry(),actor=createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true);root.add(actor);root.updateMatrixWorld(true);
  const batch=batchResidents([{object:actor}],root),n=batch.viewList.mesh.geometry.attributes.normal,version=n.version,before=n.array.slice();n.clearUpdateRanges();
  actor.position.set(2,1,3);batch.update();assert.equal(n.version,version);assert.deepEqual(n.array,before);assert.equal(n.updateRanges.length,0);
  const uploads=batch.palette.uploads;actor.userData.armR.rotation.z=1.2;batch.update();assert.equal(n.version,version);assert.equal(n.updateRanges.length,0);assert.equal(batch.palette.uploads,uploads+1);
  let offset=0;const actual=posed(batch);for(const part of actor.userData.parts){const expected=part.geometry.clone().applyMatrix4(part.matrixWorld);for(let i=0;i<expected.attributes.position.count;i++){assert.ok(new THREE.Vector3().fromBufferAttribute(actual.attributes.position,offset+i).distanceTo(new THREE.Vector3().fromBufferAttribute(expected.attributes.position,i))<1e-6);assert.ok(new THREE.Vector3().fromBufferAttribute(actual.attributes.normal,offset+i).distanceTo(new THREE.Vector3().fromBufferAttribute(expected.attributes.normal,i))<1e-6);}offset+=expected.attributes.position.count;expected.dispose();}
});

test('resident breathing advances on the GPU without geometry uploads and can stop for walking or reduced activity',()=>{
  const root=new THREE.Group(),cube=new THREE.BoxGeometry(),actor=createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),'#aabbcc',undefined,true);root.add(actor);root.updateMatrixWorld(true);
  const batch=batchResidents([{object:actor,phase:2}],root),g=batch.viewList.mesh.geometry;actor.userData.idleBreath=true;batch.update([actor]);
  const versions=Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,a.version])),before=g.attributes.position.array.slice();
  for(let i=0;i<60;i++)batch.setTime(i/60,true);
  for(const [key,a]of Object.entries(g.attributes))assert.equal(a.version,versions[key],`${key} does not upload for breathing`);
  assert.deepEqual(g.attributes.position.array,before);assert.ok(Math.abs(batch.palette.texture.image.data[19]-.3)<1e-6);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>'};batch.viewList.mesh.material.onBeforeCompile(shader);assert.equal(shader.uniforms.batchBreath.value,.012);assert.match(shader.vertexShader,/sin\(batchTime/);
  const depth={uniforms:{},vertexShader:'#include <begin_vertex>'};batch.viewList.mesh.customDepthMaterial.onBeforeCompile(depth);assert.equal(depth.uniforms.batchPose.value,shader.uniforms.batchPose.value);
  batch.setTime(1,false);assert.equal(shader.uniforms.batchBreath.value,0);actor.userData.idleBreath=false;batch.update([actor]);assert.equal(batch.palette.texture.image.data[19],-1);
});

test('cached decorations retain conservative transformed bounds and invalidate only when their own state changes',()=>{
  const root=new THREE.Group(),creature=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()),lamp=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial());
  lamp.position.set(4,2,-3);root.add(creature,lamp);root.updateMatrixWorld(true);const batch=batchIslandProps([creature],[lamp],root),fixed=batch.staticViewList;
  assert.equal(fixed.mesh.layers.mask,1);assert.equal(batch.viewList.mesh.layers.mask,2);assert.equal(fixed.mesh.castShadow,true);assert.equal(fixed.mesh.userData.movingPropBatch,false);
  const expected=new THREE.Box3().setFromObject(lamp);assert.ok(fixed.ranges[0].bounds.equals(expected));const revision=batch.staticRevision;
  for(let i=0;i<6;i++){creature.position.x+=.1;batch.update([creature]);}assert.equal(batch.staticRevision,revision,'animal movement never invalidates cached decorations');
  lamp.material.color.set('#f9d46a');batch.update([lamp]);assert.equal(batch.staticRevision,revision+1);batch.update([lamp]);assert.equal(batch.staticRevision,revision+1);
  lamp.visible=false;batch.update([lamp]);assert.equal(fixed.ranges[0].bounds.isEmpty(),true);lamp.visible=true;batch.update([lamp]);assert.ok(fixed.ranges[0].bounds.equals(expected));
  root.position.x=100;root.updateMatrixWorld(true);const old=batch.staticRevision;batch.update();assert.equal(batch.staticRevision,old,'moving an entire island preserves local cached poses');batch.dispose();
  const empty=batchIslandProps([],[],root);assert.equal(empty.staticRevision,0);assert.equal(empty.update([]),false);empty.dispose();
});
