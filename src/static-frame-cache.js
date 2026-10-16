import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { shadowDamageRects } from './shadow-damage.js';
import { createCachedDepth } from './cached-depth.js';
import { exposedCacheRects,wrapCacheRect } from './cache-scroll.js';

// Orthographic camera translation shifts every static pixel by the same amount.
// Keep a small guard border and its depth, then redraw just moving objects.
// Scroll the same attachment on an integer texel grid, repainting only incoming
// strips. Zoom, light and travel still need a new capture.
export function cacheOffset(camera,cached,guard,out=new THREE.Vector3()){
  const a=camera.projectionMatrix.elements,av=camera.matrixWorldInverse.elements,b=cached.projectionMatrix.elements,bv=cached.matrixWorldInverse.elements;
  // Projection of the origin for orthographic cameras, without transient
  // vectors in this per-frame path (view offsets use the translation terms).
  return out.set(b[0]*bv[12]+b[12]-(a[0]*av[12]+a[12])/guard,b[5]*bv[13]+b[13]-(a[5]*av[13]+a[13])/guard,(a[10]*av[14]+a[14]-b[10]*bv[14]-b[14])*.5);
}
export function createStaticFrameCache(renderer,scene,camera,renderWorld,onCapture){
  const guard=1.18,cached=camera.clone(),patchView=camera.clone(),size=new THREE.Vector2(),origin=new THREE.Vector2(),offset=new THREE.Vector3(),sampleOffset=new THREE.Vector3(),projection=new THREE.Matrix4();
  let target=null,valid=false,captures=0,hits=0,lastUsed=false,patches=0,patchPixels=0,fullPixels=0,colorPixels=0,depthCopyPixels=0,pending=[],scrolls=0,scrollPixels=0,lastUpdatePixels=0,maxUpdatePixels=0;
  const cachedDepth=createCachedDepth(),uniforms={image:{value:null},depth:{value:null},shift:{value:sampleOffset},scale:{value:1/guard}};
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader:`uniform sampler2D image;uniform vec3 shift;uniform float scale;varying vec2 vUv;
void main(){vec2 uv=(vUv-.5)*scale+.5+shift.xy*.5;gl_FragColor=texture2D(image,uv);}`,depthTest:false,depthWrite:false,toneMapped:false}),quad=new FullScreenQuad(material);
  const fallback=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader:`uniform sampler2D image,depth;uniform vec3 shift;uniform float scale;varying vec2 vUv;
void main(){vec2 uv=(vUv-.5)*scale+.5+shift.xy*.5;gl_FragColor=texture2D(image,uv);gl_FragDepth=clamp(texture2D(depth,uv).r+shift.z,0.,1.);}`,depthTest:true,depthFunc:THREE.AlwaysDepth,depthWrite:true,toneMapped:false});
  function release(){cachedDepth.end();target?.dispose();target=null;uniforms.image.value=uniforms.depth.value=null;valid=false;pending=[];origin.set(0,0);}
  function capture(width,height){
    valid=false;origin.set(0,0);pending=[];
    cached.copy(camera);projection.copy(camera.projectionMatrix);cached.left*=guard;cached.right*=guard;cached.top*=guard;cached.bottom*=guard;cached.updateProjectionMatrix();cached.updateMatrixWorld();cached.layers.set(0);
    onCapture(cached);renderWorld(cached,target);valid=true;captures++;fullPixels+=width*height;lastUpdatePixels+=width*height;
  }
  function repaint(rects,width,height){
    // Reuse color AND depth in place; no framebuffer readback, depth copy,
    // second full-size texture or sampling from the current render attachment.
    try{
      // Select the union once, before any draw consumes its index buffer.
      // Updating that same GPU buffer between wrapped/scissored draws can
      // force the driver to wait for the previous draw to finish.
      onCapture(cached,rects,width,height);
      target.scissorTest=true;
      for(const rect of rects)for(const r of wrapCacheRect(rect,width,height,origin)){
        patchView.copy(cached);
        patchView.projectionMatrix.elements[12]+=2*r.shiftX/width;patchView.projectionMatrix.elements[13]+=2*r.shiftY/height;
        patchView.projectionMatrixInverse.copy(patchView.projectionMatrix).invert();
        target.scissor.set(r.x,r.y,r.right-r.x,r.top-r.y);
        renderWorld(patchView,target);patches++;const pixels=(r.right-r.x)*(r.top-r.y);patchPixels+=pixels;lastUpdatePixels+=pixels;
      }
    }catch(error){valid=false;throw error;}
    finally{target.scissorTest=false;target.scissor.set(0,0,width,height);}
  }
  return {prepare:cachedDepth.prepare,invalidate(){valid=false;pending=[];},invalidateRegions(boxes){if(valid)pending.push(...boxes);},
    render(output,enabled){
      lastUsed=false;lastUpdatePixels=0;cachedDepth.end();
      if(!enabled){valid=false;camera.layers.set(0);camera.layers.enable(1);renderWorld(camera,output);return;}
      renderer.getDrawingBufferSize(size);const width=Math.ceil(size.x*guard),height=Math.ceil(size.y*guard);
      if(!target||target.width!==width||target.height!==height){release();target=new THREE.WebGLRenderTarget(width,height,{type:THREE.UnsignedByteType,stencilBuffer:false,depthTexture:new THREE.DepthTexture(width,height,THREE.UnsignedIntType)});for(const texture of [target.texture,target.depthTexture])texture.wrapS=texture.wrapT=THREE.RepeatWrapping;material.uniforms.image.value=target.texture;material.uniforms.depth.value=target.depthTexture;}
      cacheOffset(camera,cached,guard,offset);
      const dx=Math.round(offset.x*width*.5),dy=Math.round(offset.y*height*.5);
      // Keep the depth origin fixed during translation so retained and new
      // texels use one Z range. Teleports/projection changes need a new capture.
      if(!valid||!projection.equals(camera.projectionMatrix)||1-Math.abs(camera.quaternion.dot(cached.quaternion))>1e-8||Math.abs(dx)>=width||Math.abs(dy)>=height||Math.abs(offset.z)>.2)capture(width,height);
      else{
        let rects=[];
        // Start inside the guard border, before an incoming strip is visible.
        // Normal walking refills a few percent instead of the whole island.
        if(Math.abs(dx)>Math.max(1,(width-width/guard)*.25-2)||Math.abs(dy)>Math.max(1,(height-height/guard)*.25-2)){
          const e=cached.matrixWorld.elements,sx=2*dx/(width*cached.projectionMatrix.elements[0]),sy=2*dy/(height*cached.projectionMatrix.elements[5]);
          cached.position.x+=e[0]*sx+e[4]*sy;cached.position.y+=e[1]*sx+e[5]*sy;cached.position.z+=e[2]*sx+e[6]*sy;cached.updateMatrixWorld();
          origin.set(((origin.x+dx)%width+width)%width,((origin.y+dy)%height+height)%height);
          rects=exposedCacheRects(width,height,dx,dy);scrolls++;scrollPixels+=Math.abs(dx)*height+Math.abs(dy)*(width-Math.abs(dx));
        }
        const damage=pending.length?shadowDamageRects(pending,cached,width,height):[];pending=[];
        const area=damage.reduce((n,r)=>n+(r.right-r.x)*(r.top-r.y),0);
        if(area>width*height*.65||damage.length>8)capture(width,height);
        else if(rects.length||damage.length)repaint([...rects,...damage],width,height);
        hits++;
      }
      maxUpdatePixels=Math.max(maxUpdatePixels,lastUpdatePixels);
      cacheOffset(camera,cached,guard,offset);sampleOffset.copy(offset);sampleOffset.x+=2*origin.x/width;sampleOffset.y+=2*origin.y/height;
      const autoClear=renderer.autoClear,mask=camera.layers.mask;
      // Copy color only, clear the transient actor depth, then test static
      // occlusion at actor fragments. Keep hardware depth between live objects.
      renderer.autoClear=false;
      try{
        renderer.setRenderTarget(output);const sparse=cachedDepth.compatible,w=output?.width||size.x,h=output?.height||size.y;
        quad.material=sparse?material:fallback;quad.render(renderer);colorPixels+=w*h;
        if(sparse){renderer.state.buffers.depth.setMask(true);renderer.clearDepth();cachedDepth.begin(target.depthTexture,w,h,guard,sampleOffset);}
        else depthCopyPixels+=w*h;
        camera.layers.set(1);renderWorld(camera,output,false);
      }
      finally{cachedDepth.end();renderer.autoClear=autoClear;camera.layers.mask=mask;}
      lastUsed=true;
    },get stats(){return {captures,hits,patches,patchPixels,fullPixels,colorPixels,depthCopyPixels,scrolls,scrollPixels,lastUpdatePixels,maxUpdatePixels,sparseDepth:cachedDepth.compatible,active:lastUsed,buffers:target?1:0};},release,dispose(){release();cachedDepth.dispose();quad.dispose();material.dispose();fallback.dispose();}
  };
}
