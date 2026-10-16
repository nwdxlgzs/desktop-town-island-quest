import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { revealCulledCasters } from './shadow-refresh.js';

// Display-encoded RGBA8 replaces the composer's two HDR ping-pong buffers and
// separate output pass. Flat pixels take five samples, edges take four more.
const fragment=`uniform sampler2D image;uniform vec2 texel;varying vec2 vUv;
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  vec3 m=texture2D(image,vUv).rgb;
  vec3 n=texture2D(image,vUv+vec2(0.,texel.y)).rgb,s=texture2D(image,vUv-vec2(0.,texel.y)).rgb;
  vec3 e=texture2D(image,vUv+vec2(texel.x,0.)).rgb,w=texture2D(image,vUv-vec2(texel.x,0.)).rgb;
  float lm=luma(m),ln=luma(n),ls=luma(s),le=luma(e),lw=luma(w),lo=min(lm,min(min(ln,ls),min(le,lw))),hi=max(lm,max(max(ln,ls),max(le,lw)));
  if(hi-lo<max(.035,hi*.1)){gl_FragColor=vec4(m,1.);return;}
  vec2 dir=vec2(-(ln-ls),le-lw);float reduce=max((ln+ls+le+lw)*.03125,.0078125);
  dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-4.),vec2(4.))*texel;
  vec3 a=.5*(texture2D(image,vUv-dir/6.).rgb+texture2D(image,vUv+dir/6.).rgb);
  vec3 b=a*.5+.25*(texture2D(image,vUv-dir*.5).rgb+texture2D(image,vUv+dir*.5).rgb);
  float lb=luma(b);gl_FragColor=vec4(lb<lo||lb>hi?a:b,1.);
}`;
export function createAntialias(renderer,scene,camera){
  let target=null,quad=null;const exposure={value:renderer.toneMappingExposure},clear=new THREE.Color();
  // Offscreen surfaces contain final display colors. Convert before storing to
  // 8-bit, so bright Lambert lighting is never clipped in a linear LDR buffer.
  function prepare(root){root.traverse(o=>{for(const material of [o.material].flat()){
    if(!material||material.userData.displayOutput||material.isShaderMaterial)continue;
    material.userData.displayOutput=true;const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,r){
      compile.call(this,shader,r);shader.uniforms.toneMappingExposure=exposure;if(!r.getRenderTarget())return;
      if(shader.fragmentShader.includes('#include <tonemapping_fragment>')&&material.toneMapped){
        shader.fragmentShader='#include <tonemapping_pars_fragment>\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);');shader.uniforms.toneMappingExposure=exposure;
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor = sRGBTransferOETF(gl_FragColor);');
    };material.customProgramCacheKey=()=>`${key}|display-rgba8-v1`;material.needsUpdate=true;
  }});}
  function renderWorld(view=camera,output=null,background=true){
    exposure.value=renderer.toneMappingExposure;const saved=scene.background;
    if(!background)scene.background=null;
    else if(output&&saved?.isColor)scene.background=clear.copy(saved).convertLinearToSRGB();
    const restore=renderer.shadowMap.enabled&&renderer.shadowMap.needsUpdate?revealCulledCasters(scene):null;
    renderer.setRenderTarget(output);try{renderer.render(scene,view);}finally{restore?.();scene.background=saved;}
  }
  function dispose(){target?.dispose();quad?.material.dispose();quad?.dispose();target=quad=null;}
  return {prepare,renderWorld,compile(root){
    // Match the actual actor output variant (direct or FXAA) during compilation.
    // compileAsync starts synchronously; restore the target before yielding.
    const previous=renderer.getRenderTarget();
    try{renderer.setRenderTarget(target);return renderer.compileAsync(root,camera,scene);}
    finally{renderer.setRenderTarget(previous);}
  },
    configure(enabled,w,h,ratio){
      const width=Math.max(1,Math.floor(w*ratio)),height=Math.max(1,Math.floor(h*ratio));
      if(!enabled){dispose();return;}
      if(!target){target=new THREE.WebGLRenderTarget(width,height,{type:THREE.UnsignedByteType,stencilBuffer:false});quad=new FullScreenQuad(new THREE.ShaderMaterial({uniforms:{image:{value:target.texture},texel:{value:new THREE.Vector2()}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false}));}
      target.setSize(width,height);quad.material.uniforms.texel.value.set(1/width,1/height);
    },
    get active(){return !!target;},get buffers(){return target?1:0;},
    render(draw=output=>renderWorld(camera,output)){
      if(!target){draw(null);return;}
      draw(target);const autoClear=renderer.autoClear;renderer.autoClear=false;
      try{renderer.setRenderTarget(null);quad.render(renderer);}finally{renderer.autoClear=autoClear;}
    },dispose
  };
}
