import * as THREE from 'three';

// Only genuinely constant-colour/normal triangles may interpolate an already
// display-encoded colour. Curved faces and triangles spanning two pose parts
// retain the original per-fragment path. Flat interpolation of the flag also
// keeps a shared vertex from accidentally enabling it on a curved triangle.
export function prepareFlatVoxelDisplay(object){
  let g=object.geometry;const m=object.material;
  if(!object.isMesh||!(object.layers.mask&2)||Array.isArray(m)||!g?.attributes.normal||m.map||m.alphaMap||m.emissiveMap||m.lightMap||m.aoMap||m.envMap||m.emissive?.getHex()||m.premultipliedAlpha||!m.toneMapped)return false;
  if(g.getAttribute('voxelDisplayFlat'))return true;
  // Unit cubes are shared with future island builders and mixed-geometry
  // batches. Keep this rendering attribute off those shared source assets.
  if(g.type!=='BufferGeometry')g=object.geometry=g.clone();
  const {normal,color,batchPart,playerPart,bakedShade}=g.attributes,index=g.index?.array,count=index?.length??normal.count,flat=new Float32Array(normal.count).fill(1);
  function same(attribute,a,b,c){if(!attribute)return true;const size=attribute.itemSize,array=attribute.array;for(let k=0;k<size;k++)if(array[a*size+k]!==array[b*size+k]||array[a*size+k]!==array[c*size+k])return false;return true;}
  for(let i=0;i<count;i+=3){const a=index?index[i]:i,b=index?index[i+1]:i+1,c=index?index[i+2]:i+2;if(!same(normal,a,b,c)||m.vertexColors&&!same(color,a,b,c)||!same(batchPart,a,b,c)||!same(playerPart,a,b,c)||!same(bakedShade,a,b,c))flat[a]=flat[b]=flat[c]=0;}
  g.setAttribute('voxelDisplayFlat',new THREE.BufferAttribute(flat,1));
  return true;
}

export function installFlatVoxelDisplay(shader,reuse){
  shader.uniforms.voxelDisplayReuse=reuse;
  shader.vertexShader=`uniform vec3 diffuse;
uniform bool voxelDisplayReuse;
attribute float voxelDisplayFlat;flat varying float vVoxelDisplayFlat;
varying vec3 vVoxelDisplayLit,vVoxelDisplayShade;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
`+shader.vertexShader;
  const end=shader.vertexShader.lastIndexOf('}');
  shader.vertexShader=shader.vertexShader.slice(0,end)+`
    vVoxelDisplayFlat=voxelDisplayReuse?voxelDisplayFlat:0.0;
    vVoxelDisplayLit=vec3(0.0);vVoxelDisplayShade=vec3(0.0);
    if(vVoxelDisplayFlat>0.5){
      vec3 voxelBase=diffuse;
      #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
        voxelBase*=vColor.rgb;
      #endif
      vVoxelDisplayLit=sRGBTransferOETF(vec4(ACESFilmicToneMapping(voxelBase*(vVoxelSun+vVoxelIndirect)),1.0)).rgb;
      vVoxelDisplayShade=sRGBTransferOETF(vec4(ACESFilmicToneMapping(voxelBase*vVoxelIndirect),1.0)).rgb;
    }
  `+shader.vertexShader.slice(end);
  shader.fragmentShader='flat varying float vVoxelDisplayFlat;varying vec3 vVoxelDisplayLit,vVoxelDisplayShade;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('vec3 voxelDirect = vVoxelSun;','bool voxelDisplayEncoded=false;\nvec3 voxelDirect = vVoxelSun;');
  const output='vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
  shader.fragmentShader=shader.fragmentShader.replace(output,output+`
    if(vVoxelDisplayFlat>0.5 && (voxelShadow==0.0 || voxelShadow==1.0)){
      outgoingLight=voxelShadow==1.0?vVoxelDisplayLit:vVoxelDisplayShade;
      voxelDisplayEncoded=true;
    }`);
  for(const chunk of ['tonemapping_fragment','colorspace_fragment'])shader.fragmentShader=shader.fragmentShader.replace(`#include <${chunk}>`,`if(!voxelDisplayEncoded){\n#include <${chunk}>\n}`);
}
