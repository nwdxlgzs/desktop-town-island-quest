import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCachedDepth} from '../src/cached-depth.js';
import {cacheOffset} from '../src/static-frame-cache.js';
import {createPerson} from '../src/scene-assets.js';
import {batchPlayer} from '../src/player-batch.js';
import {createAvatarOutline} from '../src/avatar-outline.js';
import {installVoxelLighting} from '../src/voxel-lighting.js';
import {createAntialias} from '../src/antialias.js';

function compile(material,kind='basic',renderer={}){
  const shader={vertexShader:THREE.ShaderLib[kind].vertexShader,fragmentShader:THREE.ShaderLib[kind].fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,renderer);return shader;
}
function dynamic(material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.layers.set(1);return mesh;}

test('cached occlusion composes with player pose, lighting and display hooks while topmost outline and shadow depth stay independent',()=>{
  const root=new THREE.Scene(),cube=new THREE.BoxGeometry(),player=createPerson(cube,color=>new THREE.MeshLambertMaterial({color}),'#6699bb','#447799');root.add(player);
  player.traverse(o=>o.layers.set(1));const batch=batchPlayer(player),outline=createAvatarOutline(player,batch.installPose);
  const renderer={toneMappingExposure:1,shadowMap:{enabled:true},getRenderTarget:()=>({})},aa=createAntialias(renderer,root,new THREE.Camera()),cache=createCachedDepth();
  installVoxelLighting(root);aa.prepare(root);cache.prepare(root);cache.prepare(root);
  const body=batch.mesh,shader=compile(body.material,'lambert',renderer);
  assert.match(shader.vertexShader,/playerPart/);assert.match(shader.vertexShader,/vVoxelSun/);
  assert.match(shader.fragmentShader,/sRGBTransferOETF/);assert.match(shader.fragmentShader,/getShadowMask/);
  assert.equal(shader.fragmentShader.match(/uniform bool islandDepthActive/g).length,1);
  assert.ok(shader.fragmentShader.indexOf('if(islandDepthActive)')<shader.fragmentShader.indexOf('#include <alphatest_fragment>'),'reject hidden fragments before texture/lighting work');
  const edges=player.children.find(o=>o.isLineSegments),edgeShader=compile(edges.material,'basic',renderer);
  assert.match(edgeShader.vertexShader,/playerPart/);assert.doesNotMatch(edgeShader.fragmentShader,/islandDepth/,'fluorescent silhouette must remain visible through terrain');
  const shadow=compile(body.customDepthMaterial,'depth');assert.doesNotMatch(shadow.fragmentShader,/islandDepth/);
  const texture=new THREE.DepthTexture(1770,1239),shift=new THREE.Vector3(.05,-.03,.002);
  cache.begin(texture,1500,1050,1.18,shift);assert.equal(shader.uniforms.islandDepthActive.value,true);assert.equal(shader.uniforms.islandDepth.value,texture);
  cache.end();assert.equal(shader.uniforms.islandDepthActive.value,false);assert.notEqual(shader.uniforms.islandDepth.value,texture,'capture attachment must never remain bound to its own draw');
  cache.dispose();outline.dispose();batch.dispose();aa.dispose();cube.dispose();
});

test('fragment coordinates match independent static projection, front/behind tests and translated camera at multiple resolutions',()=>{
  const cache=createCachedDepth(),material=new THREE.MeshBasicMaterial(),root=dynamic(material);cache.prepare(root);const shader=compile(material),guard=1.18;
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,400);camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const cached=camera.clone();cached.left*=guard;cached.right*=guard;cached.top*=guard;cached.bottom*=guard;cached.updateProjectionMatrix();cached.updateMatrixWorld();
  camera.position.add(new THREE.Vector3(.7,0,-.5));camera.updateMatrixWorld();const offset=cacheOffset(camera,cached,guard);
  const direction=camera.getWorldDirection(new THREE.Vector3()),point=new THREE.Vector3(2,5,-3),current=point.clone().project(camera),source=point.clone().project(cached);
  for(const [w,h]of [[1000,700],[1500,1050],[1901,1379]]){
    cache.begin(new THREE.DepthTexture(),w,h,guard,offset);const m=shader.uniforms.islandDepthMapping.value,s=shader.uniforms.islandDepthShift.value;
    const x=(current.x*.5+.5)*w*m.x+m.z+s.x*.5,y=(current.y*.5+.5)*h*m.y+m.w+s.y*.5;
    assert.ok(Math.abs(x-(source.x*.5+.5))<1e-12);assert.ok(Math.abs(y-(source.y*.5+.5))<1e-12);
    const staticDepth=(source.z+1)*.5+s.z;
    for(const distance of [-.5,0,.5]){
      const actor=point.clone().addScaledVector(direction,distance).project(camera),fragmentDepth=(actor.z+1)*.5;
      assert.equal(fragmentDepth>staticDepth+1/16777215,distance>0,'only the character behind the static surface is rejected');
    }
  }
  cache.dispose();
});

test('transparent signs and offset footprints keep alpha and depth behavior; unknown depth conventions request fallback',()=>{
  const root=new THREE.Group(),sign=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}),foot=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  foot.userData.contactFootprint=true;
  root.add(dynamic(sign),dynamic(foot));const cache=createCachedDepth();cache.prepare(root);assert.equal(cache.compatible,true);
  assert.match(compile(sign).fragmentShader,/#include <alphamap_fragment>/);assert.match(compile(foot).fragmentShader,/dFdx\(gl_FragCoord.z\)/);
  assert.match(compile(foot).fragmentShader,/fract\(islandUV\*islandDepthGrid.xy\)/);assert.doesNotMatch(compile(sign).fragmentShader,/islandDelta/,'ordinary characters and signs retain the strict static depth test');
  assert.notEqual(sign.customProgramCacheKey(),foot.customProgramCacheKey(),'different offsets cannot share compiled fragment code');
  assert.equal(foot.depthWrite,false);root.add(dynamic(new THREE.ShaderMaterial()));cache.prepare(root);assert.equal(cache.compatible,false);
  cache.dispose();
  for(const depthFunc of [THREE.LessDepth,THREE.GreaterDepth]){const second=createCachedDepth();second.prepare(dynamic(new THREE.MeshBasicMaterial({depthFunc})));assert.equal(second.compatible,false);second.dispose();}
});

test('footprint subpixel depth reconstruction matches the ground plane while moving and stopped at 100/120/150%',()=>{
  const cache=createCachedDepth(),material=new THREE.MeshBasicMaterial();material.userData.contactFootprint=true;cache.prepare(dynamic(material));const shader=compile(material),guard=1.18;
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,1200);camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const cached=camera.clone();cached.left*=guard;cached.right*=guard;cached.top*=guard;cached.bottom*=guard;cached.updateProjectionMatrix();cached.updateMatrixWorld();
  function planeDepth(view,x,y,height){const origin=new THREE.Vector3(x*2-1,y*2-1,0).unproject(view),direction=view.getWorldDirection(new THREE.Vector3());origin.addScaledVector(direction,(height-origin.y)/direction.y);return (origin.project(view).z+1)*.5;}
  for(const ratio of [1,1.2,1.5])for(const shift of [0,.017,.83]){
    camera.position.set(18+shift,25,30-shift*.7);camera.updateMatrixWorld();const offset=cacheOffset(camera,cached,guard),w=Math.floor(1001*ratio),h=Math.floor(701*ratio),tw=Math.ceil(w*guard),th=Math.ceil(h*guard);
    cache.begin(new THREE.DepthTexture(tw,th),w,h,guard,offset);const mapping=shader.uniforms.islandDepthMapping.value,grid=shader.uniforms.islandDepthGrid.value;
    for(const px of [100.5,w/2+.123,w-103.5])for(const py of [100.5,h/2+.271,h-105.5]){
      const u=px*mapping.x+mapping.z+offset.x*.5,v=py*mapping.y+mapping.w+offset.y*.5;
      const sampled=planeDepth(cached,(Math.floor(u*tw)+.5)/tw,(Math.floor(v*th)+.5)/th,.13)+offset.z;
      const expected=planeDepth(camera,px/w,py/h,.13),dx=planeDepth(camera,(px+1)/w,py/h,.145)-planeDepth(camera,px/w,py/h,.145),dy=planeDepth(camera,px/w,(py+1)/h,.145)-planeDepth(camera,px/w,py/h,.145);
      const corrected=sampled+dx*((u*tw%1)-.5)*grid.z+dy*((v*th%1)-.5)*grid.w;
      assert.ok(Math.abs(corrected-expected)<1e-12,'cached texel centre is reconstructed to the true ground depth');
      assert.ok(planeDepth(camera,px/w,py/h,.145)<corrected,'the footprint stays in front of the receiver');
      assert.ok(planeDepth(camera,px/w,py/h,0)>corrected,'a footprint underneath still fails the depth test');
    }
  }
  cache.dispose();
});
