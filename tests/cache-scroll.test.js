import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {exposedCacheRects,wrapCacheRect} from '../src/cache-scroll.js';
import {createStaticFrameCache} from '../src/static-frame-cache.js';

test('exposed strips are disjoint; wrapped patches cover exactly the logical rectangle in every direction',()=>{
  const w=17,h=13;
  for(const [dx,dy]of [[3,2],[-3,2],[3,-2],[-3,-2],[0,2],[3,0]]){
    const pixels=new Set();
    for(const r of exposedCacheRects(w,h,dx,dy))for(let y=r.y;y<r.top;y++)for(let x=r.x;x<r.right;x++){
      const key=y*w+x;assert.ok(!pixels.has(key),'diagonal corner must not be drawn twice');pixels.add(key);
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.equal(pixels.has(y*w+x),x+dx<0||x+dx>=w||y+dy<0||y+dy>=h);
    for(const origin of [new THREE.Vector2(),new THREE.Vector2(15,11)]){
      const physical=new Set();
      for(const r of exposedCacheRects(w,h,dx,dy))for(const part of wrapCacheRect(r,w,h,origin))for(let y=part.y;y<part.top;y++)for(let x=part.x;x<part.right;x++){
        assert.ok(x>=0&&x<w&&y>=0&&y<h);assert.ok(pixels.has((y-part.shiftY)*w+x-part.shiftX));
        assert.ok(!physical.has(y*w+x));physical.add(y*w+x);
      }
      assert.equal(physical.size,pixels.size);
    }
  }
  const parts=wrapCacheRect({x:0,y:0,right:w,top:h},w,h,new THREE.Vector2(15,11));
  assert.equal(parts.length,4);assert.equal(parts.reduce((n,r)=>n+(r.right-r.x)*(r.top-r.y),0),w*h);
});

// Software projection/analytic ray intersections, not a WebGL/FPS benchmark.
// Store the world hit and depth at every written capture texel, then compare
// independent main-camera rays after scrolling, seam wrapping and local edits.
function fixture(width=160,height=112){
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,400);camera.position.set(18,25,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const floor=new THREE.Plane(new THREE.Vector3(0,1,0),-.13),box=new THREE.Box3(new THREE.Vector3(-3,.13,-2),new THREE.Vector3(3,4,2));
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  let storage=null,target=null,boxEnabled=true,copy=null,failPatch=false,selections=0;const draws=[];
  function hit(view,x,y,out){
    ray.origin.set(x,y,-1).unproject(view);ray.direction.copy(view.getWorldDirection(direction));ray.intersectPlane(floor,out);
    if(boxEnabled&&ray.intersectBox(box,a)&&a.distanceToSquared(ray.origin)<out.distanceToSquared(ray.origin))out.copy(a);
    return out;
  }
  const renderer={autoClear:true,state:{buffers:{depth:{setMask(){}}}},getDrawingBufferSize(out){return out.set(width,height);},setRenderTarget(){},clearDepth(){},
    render(mesh){copy={shift:mesh.material.uniforms.shift.value.clone(),guard:1/mesh.material.uniforms.scale.value};}
  };
  const cache=createStaticFrameCache(renderer,new THREE.Scene(),camera,(view,output,background=true)=>{
    if(!background||!output)return;
    target=output;
    if(failPatch&&target.scissorTest)throw Error('patch failure');
    if(!storage||storage.length!==target.width*target.height*4)storage=new Float64Array(target.width*target.height*4);
    const r=target.scissorTest?{x:target.scissor.x,y:target.scissor.y,right:target.scissor.x+target.scissor.z,top:target.scissor.y+target.scissor.w}:{x:0,y:0,right:target.width,top:target.height};draws.push({pixels:(r.right-r.x)*(r.top-r.y),partial:target.scissorTest});
    for(let y=r.y;y<r.top;y++)for(let x=r.x;x<r.right;x++){
      hit(view,(x+.5)/target.width*2-1,(y+.5)/target.height*2-1,b);const i=(y*target.width+x)*4;
      storage[i]=b.x;storage[i+1]=b.y;storage[i+2]=b.z;storage[i+3]=(b.project(view).z+1)*.5;
    }
  },()=>{selections++;});
  function check(){
    assert.equal(target.texture.wrapS,THREE.RepeatWrapping);assert.equal(target.depthTexture.wrapT,THREE.RepeatWrapping);
    const tw=target.width,th=target.height,{shift,guard}=copy;
    for(const u of [.03,.17,.33,.5,.67,.83,.97])for(const v of [.04,.25,.5,.75,.96]){
      const sampleX=Math.floor(((u-.5)/guard+.5+shift.x*.5)*tw),sampleY=Math.floor(((v-.5)/guard+.5+shift.y*.5)*th),x=((sampleX%tw)+tw)%tw,y=((sampleY%th)+th)%th,i=(y*tw+x)*4;
      const nx=((sampleX+.5)/tw-.5-shift.x*.5)*guard*2,ny=((sampleY+.5)/th-.5-shift.y*.5)*guard*2;
      const expected=hit(camera,nx,ny,b),actual=new THREE.Vector3(storage[i],storage[i+1],storage[i+2]);
      assert.ok(actual.distanceTo(expected)<1e-9,`stale/wrong texel at ${x},${y}: ${actual.toArray()} != ${expected.toArray()}`);
      const expectedDepth=(expected.clone().project(camera).z+1)*.5;
      assert.ok(Math.abs(storage[i+3]+shift.z-expectedDepth)<1e-12,'retained and newly drawn depths must share the same origin');
    }
  }
  return {camera,cache,draws,box,check,renderer,get selections(){return selections;},get target(){return target;},setBox(value){boxEnabled=value;cache.invalidateRegions([box]);},fail(value){failPatch=value;}};
}

test('continuous diagonal motion, reversals and texture seams retain exact color/depth without full recaptures',()=>{
  for(const ratio of [1.2,1.5]){
    const f=fixture(Math.floor(131*ratio),Math.floor(91*ratio)),right=new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld,1),forward=f.camera.getWorldDirection(new THREE.Vector3());
    f.cache.render(null,true);f.check();
    for(const [x,y]of [[1,.6],[-1,-.45],[-.7,.7],[.7,-.85]])for(let i=0;i<18;i++){
      const before=f.selections;f.camera.position.addScaledVector(right,x*.8).addScaledVector(up,y*.8).addScaledVector(forward,.07);f.camera.updateMatrixWorld();f.cache.render(null,true);f.check();
      assert.equal(f.selections,before+1,'all strips and physical seams share one index selection/upload per frame');
    }
    assert.equal(f.cache.stats.captures,1,'walking must never periodically repaint the entire island');assert.ok(f.cache.stats.scrolls>50);
    assert.equal(f.cache.stats.buffers,1,'rolling must not allocate a second full-resolution attachment');
    const full=f.target.width*f.target.height;assert.ok(f.draws.slice(1).every(d=>d.partial&&d.pixels<full*.1),'each refill only draws a narrow strip');
    assert.equal(f.cache.stats.depthCopyPixels,0);f.cache.dispose();
  }
});

test('local scenery changes erase and restore both color/depth across wrapped seams; projection changes still recapture',()=>{
  const f=fixture(),right=new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld,1);
  f.cache.render(null,true);f.camera.position.addScaledVector(right,1.1).addScaledVector(up,.8);f.camera.updateMatrixWorld();f.cache.render(null,true);f.check();
  f.setBox(false);f.cache.render(null,true);f.check();f.setBox(true);f.cache.render(null,true);f.check();assert.equal(f.cache.stats.captures,1);
  f.camera.zoom=1.2;f.camera.updateProjectionMatrix();f.cache.render(null,true);f.check();assert.equal(f.cache.stats.captures,2);
  f.cache.render(null,false);f.cache.render(null,true);f.check();assert.equal(f.cache.stats.captures,3);f.cache.dispose();
});

test('partial capture exceptions restore scissor state and force a complete repair next frame',()=>{
  const f=fixture();f.cache.render(null,true);f.setBox(false);f.fail(true);assert.throws(()=>f.cache.render(null,true),/patch failure/);
  assert.equal(f.target.scissorTest,false);assert.equal(f.renderer.autoClear,true);f.fail(false);f.cache.render(null,true);f.check();assert.equal(f.cache.stats.captures,2);f.cache.dispose();
});
