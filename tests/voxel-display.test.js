import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareFlatVoxelDisplay} from '../src/voxel-display.js';
import {installVoxelLighting} from '../src/voxel-lighting.js';
import {createPerson} from '../src/scene-assets.js';
import {batchPlayer} from '../src/player-batch.js';
import {batchResidents} from '../src/render-batches.js';
import {createAntialias} from '../src/antialias.js';
import {createCachedDepth} from '../src/cached-depth.js';

function compile(material,renderer){const shader={vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,renderer);return shader;}
const renderer=()=>({capabilities:{maxVertexUniforms:256},toneMapping:THREE.ACESFilmicToneMapping,outputColorSpace:THREE.SRGBColorSpace,toneMappingExposure:1.02,shadowMap:{enabled:true},getRenderTarget:()=>null});
function eligibility(mesh){const g=mesh.geometry,index=g.index.array,flags=g.attributes.voxelDisplayFlat,start=g.drawRange.start,end=Math.min(index.length,start+g.drawRange.count);let accepted=0,total=(end-start)/3;for(let i=start;i<end;i+=3)if(flags.getX(index[i+2])>.5)accepted++;return {accepted,total};}

test('real moving player and four residents reuse constant face output without changing geometry, poses or full shadow filtering',()=>{
  const scene=new THREE.Scene(),cube=new THREE.BoxGeometry(),material=color=>new THREE.MeshLambertMaterial({color}),player=createPerson(cube,material,'#5a95bd');scene.add(player);
  const playerBatch=batchPlayer(player),npcs=Array.from({length:4},()=>({object:createPerson(cube,material,'#75a591',undefined,true)}));for(const n of npcs)scene.add(n.object);const residents=batchResidents(npcs,scene);
  const original=playerBatch.mesh.geometry.attributes.position.array.slice(),r=renderer();installVoxelLighting(scene);
  const playerFaces=eligibility(playerBatch.mesh),residentFaces=eligibility(residents.viewList.mesh);
  assert.equal(playerFaces.accepted,playerFaces.total);assert.equal(residentFaces.accepted,residentFaces.total);
  for(const mesh of [playerBatch.mesh,residents.viewList.mesh]){
    const shader=compile(mesh.material,r);assert.match(shader.vertexShader,/ACESFilmicToneMapping/);assert.match(shader.vertexShader,/flat varying float vVoxelDisplayFlat/);
    assert.match(shader.fragmentShader,/voxelShadow==0\.0 \|\| voxelShadow==1\.0/,'soft shadow edges retain the original full fragment conversion');assert.match(shader.fragmentShader,/getShadowMask\(\)/);
    assert.match(shader.fragmentShader,/if\(!voxelDisplayEncoded\)\{\n#include <colorspace_fragment>/);assert.match(shader.fragmentShader,/#include <fog_fragment>/);
    assert.doesNotMatch(shader.vertexShader,/texelFetch/,'these small NPC batches fit the minimum uniform budget');
  }
  player.userData.armR.rotation.z=2.2;player.userData.left.rotation.x=.5;playerBatch.update();npcs[0].object.position.x=2;residents.update([npcs[0].object]);
  assert.deepEqual(playerBatch.mesh.geometry.attributes.position.array,original);assert.equal(r.shadowMap.enabled,true);
  playerBatch.dispose();residents.dispose();cube.dispose();
});

test('curved or colour-varying triangles and triangles crossing pose parts use the original fragment conversion',()=>{
  const material=new THREE.MeshLambertMaterial({vertexColors:true}),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0,2,0,0,2,1,0],3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,.1,1,0,.2,1,0,.3,1],3));g.setAttribute('color',new THREE.Float32BufferAttribute(Array(6).fill([.5,.6,.7]).flat(),3));g.setIndex([0,1,2,3,4,5]);const mesh=new THREE.Mesh(g,material);mesh.layers.set(1);
  assert.equal(prepareFlatVoxelDisplay(mesh),true);assert.deepEqual([...g.attributes.voxelDisplayFlat.array],[1,1,1,0,0,0]);
  g.deleteAttribute('voxelDisplayFlat');g.attributes.color.setX(2,.9);prepareFlatVoxelDisplay(mesh);assert.ok(g.attributes.voxelDisplayFlat.array.every(value=>value===0));
  g.deleteAttribute('voxelDisplayFlat');g.attributes.color.setX(2,.5);g.setAttribute('batchPart',new THREE.Float32BufferAttribute([0,0,1,0,0,0],1));prepareFlatVoxelDisplay(mesh);assert.equal(g.attributes.voxelDisplayFlat.getX(2),0);
  g.dispose();material.dispose();
});

test('textured/emissive materials and static terrain do not enter the fast colour path',()=>{
  const g=new THREE.BoxGeometry();for(const options of [{map:new THREE.Texture()},{emissive:'#112233'},{toneMapped:false},{aoMap:new THREE.Texture()}]){const m=new THREE.MeshLambertMaterial(options),mesh=new THREE.Mesh(g,m);mesh.layers.set(1);assert.equal(prepareFlatVoxelDisplay(mesh),false);m.map?.dispose();m.aoMap?.dispose();m.dispose();}
  const terrain=new THREE.Mesh(g,new THREE.MeshLambertMaterial());assert.equal(prepareFlatVoxelDisplay(terrain),false);g.dispose();terrain.material.dispose();
});

test('shared source cubes remain unchanged so later islands and mixed model batches keep compatible attributes',()=>{
  const cube=new THREE.BoxGeometry(),mesh=new THREE.Mesh(cube,new THREE.MeshLambertMaterial());mesh.layers.set(1);prepareFlatVoxelDisplay(mesh);
  assert.equal(cube.getAttribute('voxelDisplayFlat'),undefined);assert.notEqual(mesh.geometry,cube);assert.equal(mesh.geometry.getAttribute('voxelDisplayFlat').count,cube.attributes.position.count);
  const geometry=mesh.geometry;prepareFlatVoxelDisplay(mesh);assert.equal(mesh.geometry,geometry,'already prepared geometry is reused');geometry.dispose();cube.dispose();mesh.material.dispose();
});

test('display fast path composes with FXAA output conversion and cached depth without changing alpha, fog or outline depth',()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial({transparent:true,opacity:.28}));mesh.layers.set(1);scene.add(mesh);
  const r=renderer();r.getRenderTarget=()=>({});installVoxelLighting(scene);const aa=createAntialias(r,scene,new THREE.Camera());aa.prepare(scene);const depth=createCachedDepth();depth.prepare(scene);
  const shader=compile(mesh.material,r);assert.match(shader.fragmentShader,/islandDepthActive/);assert.match(shader.fragmentShader,/if\(!voxelDisplayEncoded\)\{\ngl_FragColor\.rgb = ACESFilmicToneMapping/);
  assert.match(shader.fragmentShader,/if\(!voxelDisplayEncoded\)\{\ngl_FragColor = sRGBTransferOETF/);assert.match(shader.fragmentShader,/#include <opaque_fragment>/);assert.match(shader.fragmentShader,/#include <fog_fragment>/);
  assert.equal(mesh.material.opacity,.28);assert.equal(mesh.material.depthTest,true);depth.dispose();aa.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('distant and sailing-scale views keep the original fragment path instead of overpaying for tiny faces',()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial());mesh.layers.set(1);scene.add(mesh);installVoxelLighting(scene);
  const r=renderer();r.getDrawingBufferSize=out=>out.set(1200,840);const shader=compile(mesh.material,r),camera=new THREE.OrthographicCamera(-15,15,11,-11,.1,100);
  mesh.material.onBeforeRender(r,scene,camera,mesh.geometry,mesh);assert.equal(shader.uniforms.voxelDisplayReuse.value,true);
  camera.top=45;camera.bottom=-45;camera.updateProjectionMatrix();mesh.material.onBeforeRender(r,scene,camera,mesh.geometry,mesh);assert.equal(shader.uniforms.voxelDisplayReuse.value,false);
  camera.top=5;camera.bottom=-5;camera.updateProjectionMatrix();mesh.material.onBeforeRender(r,scene,camera,mesh.geometry,mesh);assert.equal(shader.uniforms.voxelDisplayReuse.value,true);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('constant-face vertex display colours match fragment colour conversion at shadow endpoints across lighting and exposure',()=>{
  // Independent CPU reference of Three's ACES + sRGB transfer. A face is
  // eligible only if its vertex pigment, normal and pose part are constant.
  const input=new THREE.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.02840,.13383,.83777),output=new THREE.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602);
  function display(linear,exposure){const v=linear.clone().multiplyScalar(exposure/.6).applyMatrix3(input);for(const k of ['x','y','z']){const x=v[k];v[k]=(x*(x+.0245786)-.000090537)/(x*(.983729*x+.432951)+.238081);}v.applyMatrix3(output);for(const k of ['x','y','z']){const x=THREE.MathUtils.clamp(v[k],0,1);v[k]=x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055;}return v;}
  const color=new THREE.Vector3(.13,.34,.67),sun=new THREE.Vector3(.7,.63,.49),indirect=new THREE.Vector3(.28,.36,.41);
  for(const exposure of [.7,1.02,1.4])for(const shadow of [0,1])for(const weights of [[.2,.3,.5],[.01,.98,.01],[.6,.1,.3]]){
    const light=sun.clone().multiplyScalar(shadow).add(indirect),vertex=display(color.clone().multiply(light),exposure),interpolated=vertex.clone().multiplyScalar(weights[0]).addScaledVector(vertex,weights[1]).addScaledVector(vertex,weights[2]);
    const interpolatedLinear=color.clone().multiply(light).multiplyScalar(weights[0]).addScaledVector(color.clone().multiply(light),weights[1]).addScaledVector(color.clone().multiply(light),weights[2]),fragment=display(interpolatedLinear,exposure);
    assert.ok(interpolated.distanceTo(fragment)<1e-12);
  }
});
