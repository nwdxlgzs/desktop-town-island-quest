import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildTerrainMesh} from '../src/terrain-mesh.js';
import {createGroundPicker} from '../src/ground-picker.js';
import {spatialDrawList} from '../src/view-draw-list.js';
import {terrainCellAt,terrainTopOffset,playerRadius,elevationAt,canWalkSegment} from '../src/terrain.js';
import {blockedAt,onLand} from '../src/level-layout.js';
import {createPerson} from '../src/scene-assets.js';
import {mountainParts,mountainObstacles} from '../src/mountain-shape.js';

const palette={water:'#70b4bf',ground:'#b5d3a2',groundAlt:'#a5c591',sand:'#dfd0a9',rock:['#9da98f','#b0b599','#c6ba99','#d2c29e']};
function island(extra={}){return {width:13,depth:13,terrain:{baseLayers:0,layerHeight:.75,coastLayers:Array(12).fill(0)},terrainReady:true,shoreline:{radii:Array(96).fill(.9)},workshops:[],terraces:[],obstacles:[],roads:[],lakes:[],...extra};}
function fixture(layout){const root=new THREE.Group(),mesh=buildTerrainMesh(layout,palette);root.add(mesh);const picker=createGroundPicker(root,[mesh]);return {root,mesh,picker,dispose(){picker.dispose();mesh.geometry.dispose();mesh.material.dispose();}};}
const toward=(point,direction=new THREE.Vector3(.6,1,.8))=>new THREE.Ray(point.clone().addScaledVector(direction,20),direction.clone().negate().normalize());
const close=(a,b)=>assert.ok(a.distanceTo(b)<1e-5,`${a.toArray()} != ${b.toArray()}`);

test('actual high ground is picked even when flat-plane height iteration stays on the lower floor',()=>{
  const layout=island({terraces:[{x:0,z:0,r:1.2,ramp:.01,height:4}]}),f=fixture(layout);
  try{
    const expected=new THREE.Vector3(.2,4+terrainTopOffset,.2),ray=toward(expected),point=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.25);
    ray.intersectPlane(plane,point);for(let i=0;i<4;i++){plane.constant=-.25-elevationAt(layout,point.x,point.z);ray.intersectPlane(plane,point);}
    assert.ok(point.distanceTo(expected)>4,'reproduces the old flat-floor destination');
    const hit=f.picker.pick(ray);assert.equal(hit.walkable,true);close(hit.point,expected);
    const list=spatialDrawList(f.mesh);list.update(()=>false);assert.equal(f.mesh.geometry.drawRange.count,0);
    close(f.picker.pick(ray).point,expected,'cache strip/color culling must not change picking');
    f.root.position.set(23,2,-17);close(f.picker.pick(toward(expected.clone().add(f.root.position))).point,expected.clone().add(f.root.position));
  }finally{f.dispose();}
});

test('vertical cliff faces are distinct from walkable tops and sea clicks have no imaginary destination',()=>{
  const f=fixture(island({terraces:[{x:0,z:0,r:1.2,ramp:.01,height:4}]}));
  try{
    const face=f.picker.pick(new THREE.Ray(new THREE.Vector3(5,2,0),new THREE.Vector3(-1,0,0)));
    assert.equal(face.walkable,false);assert.ok(Math.abs(face.point.x-1.3)<1e-5);assert.equal(face.point.y,2);
    assert.equal(f.picker.pick(new THREE.Ray(new THREE.Vector3(12,10,12),new THREE.Vector3(0,-1,0))),null);
  }finally{f.dispose();}
});

test('the highest actual paving triangle is picked, with no extra rendered object',()=>{
  const f=fixture(island()),patch=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());patch.geometry.rotateX(-Math.PI/2);patch.geometry.translate(0,.13,0);f.root.add(patch);
  const picker=createGroundPicker(f.root,[f.mesh,patch]);
  try{const hit=picker.pick(new THREE.Ray(new THREE.Vector3(0,10,0),new THREE.Vector3(0,-1,0)));assert.ok(Math.abs(hit.point.y-.13)<1e-5);assert.equal(f.root.children.length,2,'picking meshes never enter the rendering scene');}
  finally{picker.dispose();f.dispose();patch.geometry.dispose();patch.material.dispose();}
});

test('rendered coast tiles replace the old inland air wall, while unsupported tiles remain blocked',()=>{
  const layout=island(),point={x:4.6,z:3.3};
  assert.equal(onLand(layout,point.x,point.z,playerRadius+.12),false,'the old analytic shore rejects this visible safe floor');
  assert.ok(terrainCellAt(layout,point.x,point.z));assert.equal(blockedAt(layout,point.x,point.z,playerRadius),false);
  assert.equal(terrainCellAt(layout,5.3,1.5),null);assert.equal(blockedAt(layout,5.3,1.5,playerRadius),true);
  assert.equal(blockedAt(layout,5.1,3.4,playerRadius),true,'the whole body must stay supported at a real tile edge');
});

test('body clearance stops cliff penetration and diagonal clipping; ordinary half-steps stay usable',()=>{
  const tall=island({terraces:[{x:0,z:0,r:1.2,ramp:.01,height:4}]}),from={x:1.9,z:0},tooClose={x:1.6,z:0};
  assert.equal(canWalkSegment(tall,from,tooClose),true,'centre height alone would allow shoulders through the cliff');
  assert.equal(blockedAt(tall,from.x,from.z,playerRadius),false);assert.equal(blockedAt(tall,tooClose.x,tooClose.z,playerRadius),true);
  assert.equal(blockedAt(tall,1.6,1.6,playerRadius),true,'body intersects the high voxel corner');assert.equal(blockedAt(tall,1.8,1.8,playerRadius),false);
  const short=island({terraces:[{x:0,z:0,r:1.2,ramp:.01,height:.5}]});assert.equal(blockedAt(short,1.6,0,playerRadius),false);assert.equal(canWalkSegment(short,from,{x:.8,z:0}),true);
  const box=island({obstacles:[{x:0,z:0,w:2,d:2}]});assert.equal(blockedAt(box,1.45,1.45,playerRadius),false,'round body clearance has no invisible square corner');assert.equal(blockedAt(box,1.2,1.2,playerRadius),true);
});

test('collision radius encloses the standing and walking player rather than only the feet',()=>{
  const cube=new THREE.BoxGeometry(),materials=[],person=createPerson(cube,color=>{const material=new THREE.MeshBasicMaterial({color});materials.push(material);return material;},'#75a591');person.updateMatrixWorld(true);
  const point=new THREE.Vector3();let widest=0;
  for(const angle of [-.38,0,.38]){person.userData.armL.rotation.x=person.userData.right.rotation.x=angle;person.userData.armR.rotation.x=person.userData.left.rotation.x=-angle;person.updateMatrixWorld(true);person.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);widest=Math.max(widest,Math.hypot(point.x,point.z));}});}
  person.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
  cube.dispose();materials.forEach(m=>m.dispose());assert.ok(widest>.47);assert.ok(playerRadius>=widest,`${playerRadius} must cover model radius ${widest}`);
});

test('mountain collision covers the rendered base and protruding cave rocks without filling empty corners',()=>{
  const mountain={x:0,z:0,w:4,d:3,height:4},parts=mountainParts(mountain,'cave'),obstacles=mountainObstacles(mountain,'cave'),layout=island({obstacles});
  for(const p of parts)for(const x of [p.x-p.w/2+.001,p.x+p.w/2-.001])for(const z of [p.z-p.d/2+.001,p.z+p.d/2-.001])assert.equal(blockedAt(layout,x,z,0),true,'all actual rock footprints are solid');
  assert.equal(blockedAt(island({obstacles:[{...mountain}]}),0,2.25,playerRadius),false,'the old base-only box misses the cave frontage');
  assert.equal(blockedAt(layout,0,2.25,playerRadius),true);assert.equal(blockedAt(layout,1.6,2.25,playerRadius),false,'empty space beside the cave stays usable');
});
