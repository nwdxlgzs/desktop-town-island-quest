import * as THREE from 'three';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {cacheOffset,createStaticFrameCache} from '../src/static-frame-cache.js';

// One fixed camera trajectory. Counts exact capture/scissor area, not GPU time
// or device FPS; no renderer, random maps, pressure loop or real-time waiting.
const width=2304,height=1296,guard=1.18,camera=new THREE.OrthographicCamera(-18,18,10.125,-10.125,.1,400);
camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const legacy=camera.clone(),legacyProjection=new THREE.Matrix4(),offset=new THREE.Vector3();let legacyValid=false,legacyCaptures=0,legacyPixels=0,legacyPeak=0,selections=0,peak=0,peakPatches=0;
const renderer={autoClear:true,state:{buffers:{depth:{setMask(){}}}},getDrawingBufferSize(out){return out.set(width,height);},setRenderTarget(){},clearDepth(){},render(){}};
const cache=createStaticFrameCache(renderer,new THREE.Scene(),camera,()=>{},()=>{selections++;});
const tw=Math.ceil(width*guard),th=Math.ceil(height*guard),full=tw*th;
const initial=camera.position.clone(),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
function step(index){
  cacheOffset(camera,legacy,guard,offset);let pixels=0;
  if(!legacyValid||!legacyProjection.equals(camera.projectionMatrix)||Math.abs(offset.x)>1-1/guard-4/Math.min(tw,th)||Math.abs(offset.y)>1-1/guard-4/Math.min(tw,th)){
    legacy.copy(camera);legacyProjection.copy(camera.projectionMatrix);legacy.left*=guard;legacy.right*=guard;legacy.top*=guard;legacy.bottom*=guard;legacy.updateProjectionMatrix();legacy.updateMatrixWorld();legacyValid=true;legacyCaptures++;pixels=full;legacyPixels+=pixels;
  }
  const before=cache.stats;cache.render(null,true);const after=cache.stats;
  if(index){legacyPeak=Math.max(legacyPeak,pixels);peak=Math.max(peak,after.lastUpdatePixels);peakPatches=Math.max(peakPatches,after.patches-before.patches);}
}
step(0);
for(let frame=1;frame<=90;frame++){
  camera.position.copy(initial).addScaledVector(right,frame*.14).addScaledVector(up,frame*.075);camera.updateMatrixWorld();step(frame);
}
const stats=cache.stats;
assert.equal(stats.captures,1);assert.ok(legacyCaptures>3);assert.ok(peak<full*.1);assert.ok(stats.fullPixels+stats.patchPixels<legacyPixels*.5);assert.equal(stats.buffers,1);assert.equal(selections,1+stats.scrolls);
const result={note:'Exact submitted static repaint area for one fixed 90-frame translation, no GPU/FPS measurement.',drawingBuffer:{width,height},capture:{width:tw,height:th},legacy:{captures:legacyCaptures,totalStaticPixels:legacyPixels,movementPeakPixels:legacyPeak},rolling:{...stats,selections,movementPeakPixels:peak,movementPeakFraction:peak/full,maxPatchesPerMovementFrame:peakPatches,totalStaticPixels:stats.fullPixels+stats.patchPixels},movementPeakAreaReduction:1-peak/legacyPeak};
await mkdir('test-results',{recursive:true});await writeFile('test-results/cache-scroll-work.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));cache.dispose();
