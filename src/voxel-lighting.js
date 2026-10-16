// Flat voxel faces have a constant normal. Evaluate their Lambert lighting at
// vertices, rather than repeating both lights and hemisphere math per pixel.
// Keep Three's shadow projection/filtering for the optional real-time tiers.
import * as THREE from 'three';
import { prepareFlatVoxelDisplay,installFlatVoxelDisplay } from './voxel-display.js';

export function installVoxelLighting(root){
  root.traverse(object=>{
    for(const material of [object.material].flat()){
      if(!material?.isMeshLambertMaterial||material.userData.vertexLighting)return;
      material.userData.vertexLighting=true;
      const flatDisplay=prepareFlatVoxelDisplay(object);
      const displayReuse={value:true};
      if(flatDisplay){
        const before=material.onBeforeRender,size=new THREE.Vector2();
        material.onBeforeRender=function(renderer,scene,camera,...args){
          before.call(this,renderer,scene,camera,...args);
          // Very small distant faces have fewer pixels than vertices. Retain
          // the original fragment path there instead of paying two vertex
          // conversions. Orthographic pixel density is shared by the batch.
          renderer.getDrawingBufferSize(size);
          displayReuse.value=camera.isOrthographicCamera&&size.y*Math.abs(camera.projectionMatrix.elements[5])*.5>=28;
        };
      }
      const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        compile.call(this,shader,renderer);
        if(material.userData.bakedShadowStrength)shader.uniforms.bakedShadowStrength=material.userData.bakedShadowStrength;
        shader.vertexShader='varying vec3 vVoxelSun;\nvarying vec3 vVoxelIndirect;\n'+shader.vertexShader;
        shader.vertexShader='#ifdef BAKED_VOXEL_SHADOW\nattribute float bakedShade;\nuniform float bakedShadowStrength;\n#endif\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n#include <lights_pars_begin>');
        shader.vertexShader=shader.vertexShader.replace('#include <normal_vertex>',`#include <normal_vertex>
          vec3 voxelNormal = normalize(transformedNormal);
          vVoxelSun = vec3(0.0); vVoxelIndirect = ambientLightColor * RECIPROCAL_PI;
          #if NUM_DIR_LIGHTS > 0
            vVoxelSun = directionalLights[0].color * max(dot(voxelNormal, directionalLights[0].direction), 0.0) * RECIPROCAL_PI;
          #endif
          #if NUM_DIR_LIGHTS > 1
            vVoxelIndirect += directionalLights[1].color * max(dot(voxelNormal, directionalLights[1].direction), 0.0) * RECIPROCAL_PI;
          #endif
          #if NUM_HEMI_LIGHTS > 0
            vVoxelIndirect += getHemisphereLightIrradiance(hemisphereLights[0], voxelNormal) * RECIPROCAL_PI;
          #endif`);
        shader.vertexShader=shader.vertexShader.replace('#include <fog_vertex>',`#include <fog_vertex>
          #ifdef BAKED_VOXEL_SHADOW
            vVoxelSun *= mix(1.0, bakedShade, bakedShadowStrength);
            vVoxelIndirect *= mix(1.0, 0.8 + bakedShade * 0.2, bakedShadowStrength);
          #endif`);
        shader.fragmentShader='varying vec3 vVoxelSun;\nvarying vec3 vVoxelIndirect;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
        for(const chunk of ['normal_fragment_begin','normal_fragment_maps','lights_lambert_fragment','lights_fragment_maps','lights_fragment_end'])shader.fragmentShader=shader.fragmentShader.replace(`#include <${chunk}>`,'');
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`vec3 voxelDirect = vVoxelSun;
          // Sun-facing light is exactly zero on the other voxel faces. Skip
          // the PCF texture taps there; multiplying any shadow by zero had
          // the same result, including on moving rigs and transparent trees.
          float voxelShadow=1.0;
          if(any(greaterThan(voxelDirect,vec3(0.0)))) voxelShadow=getShadowMask();
          voxelDirect *= voxelShadow;
          reflectedLight.directDiffuse = diffuseColor.rgb * voxelDirect;
          reflectedLight.indirectDiffuse = diffuseColor.rgb * vVoxelIndirect;`);
        // Direct output and the RGBA8 FXAA target both store display colors.
        if(flatDisplay&&renderer.shadowMap.enabled&&renderer.toneMapping===THREE.ACESFilmicToneMapping&&renderer.outputColorSpace===THREE.SRGBColorSpace){
          installFlatVoxelDisplay(shader,displayReuse);
        }else if(!renderer.shadowMap.enabled){
          shader.vertexShader='uniform vec3 diffuse;\nvarying vec3 vVoxelOutput;\n#include <tonemapping_pars_fragment>\n#include <colorspace_pars_fragment>\n'+shader.vertexShader;
          const end=shader.vertexShader.lastIndexOf('}');
          shader.vertexShader=shader.vertexShader.slice(0,end)+`
            vec3 voxelBase = diffuse;
            #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
              voxelBase *= vColor.rgb;
            #endif
            vVoxelOutput = sRGBTransferOETF(vec4(ACESFilmicToneMapping(voxelBase * (vVoxelSun + vVoxelIndirect)), 1.0)).rgb;
          `+shader.vertexShader.slice(end);
          shader.fragmentShader='varying vec3 vVoxelOutput;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;','vec3 outgoingLight = vVoxelOutput;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','').replace('#include <colorspace_fragment>','');
        }
      };
      material.customProgramCacheKey=()=>`${key}|voxel-vertex-light-v4|${flatDisplay?1:0}`;
      material.needsUpdate=true;
    }
  });
}
