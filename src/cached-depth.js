import * as THREE from 'three';

// Keep the static depth in its capture texture. Only moving/fading fragments
// need to read it; copying and rewriting it across the whole canvas is costly
// on integrated GPUs, especially at 150% resolution.
export function createCachedDepth(){
  // A disabled sampler must not reference the capture attachment: WebGL rejects
  // framebuffer feedback even when a uniform branch never samples the texture.
  const empty=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);empty.needsUpdate=true;
  const active={value:false},depth={value:empty},mapping={value:new THREE.Vector4()},grid={value:new THREE.Vector4()},shift={value:new THREE.Vector3()},prepared=new WeakSet();
  let compatible=true;
  function prepare(root){root.traverse(object=>{
    if(!(object.layers.mask&2))return;
    for(const material of [object.material].flat()){
      if(!material||!material.visible||!material.depthTest)continue;
      // Custom fragment/depth conventions retain the original full-depth copy.
      if(material.isShaderMaterial||material.depthFunc!==THREE.LessEqualDepth){compatible=false;continue;}
      if(prepared.has(material))continue;prepared.add(material);
      const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        compile.call(this,shader,renderer);
        Object.assign(shader.uniforms,{islandDepthActive:active,islandDepth:depth,islandDepthMapping:mapping,islandDepthGrid:grid,islandDepthShift:shift});
        shader.fragmentShader='uniform bool islandDepthActive;uniform sampler2D islandDepth;uniform vec4 islandDepthMapping,islandDepthGrid;uniform vec3 islandDepthShift;\n'+shader.fragmentShader;
        // Polygon offset (contact footprints) also affects the old hardware
        // test. Preserve its slope/units before comparing with cached D24.
        const offset=material.polygonOffset?`islandFragmentZ += ${Number(material.polygonOffsetFactor).toFixed(8)} * max(abs(dFdx(gl_FragCoord.z)),abs(dFdy(gl_FragCoord.z))) + ${Number(material.polygonOffsetUnits).toFixed(8)} * (1.0 / 16777215.0);`:'';
        // A near-coplanar footprint must compare at the requested position,
        // not at the neighbouring cached texel's centre as the camera moves.
        // The plane's exact depth gradient reconstructs that subpixel offset;
        // walls/steps keep their depth test, with no broad depth tolerance.
        const reconstruct=material.userData.contactFootprint?`vec2 islandDelta=(fract(islandUV*islandDepthGrid.xy)-.5)*islandDepthGrid.zw;
            islandStaticZ += dot(vec2(dFdx(gl_FragCoord.z),dFdy(gl_FragCoord.z)),islandDelta);`:'';
        shader.fragmentShader=shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,`void main() {
          if(islandDepthActive){
            vec2 islandUV=gl_FragCoord.xy*islandDepthMapping.xy+islandDepthMapping.zw+islandDepthShift.xy*.5;
            float islandStaticZ=clamp(texture2D(islandDepth,islandUV).r+islandDepthShift.z,0.,1.);
            ${reconstruct}
            float islandFragmentZ=gl_FragCoord.z;${offset}
            if(islandFragmentZ > islandStaticZ + (1.0 / 16777215.0)) discard;
          }`);
      };
      material.customProgramCacheKey=()=>`${key}|island-sparse-depth-v2|${material.depthFunc}|${material.polygonOffset?`${material.polygonOffsetFactor},${material.polygonOffsetUnits}`:'0'}|${material.userData.contactFootprint?1:0}`;material.needsUpdate=true;
    }
  });}
  return {prepare,get compatible(){return compatible;},
    begin(texture,width,height,guard,offset){depth.value=texture;mapping.value.set(1/(width*guard),1/(height*guard),.5-.5/guard,.5-.5/guard);const w=texture.image.width||width*guard,h=texture.image.height||height*guard;grid.value.set(w,h,width*guard/w,height*guard/h);shift.value.copy(offset);active.value=true;},
    end(){active.value=false;depth.value=empty;},
    dispose(){this.end();empty.dispose();}
  };
}
