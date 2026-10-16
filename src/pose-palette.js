import * as THREE from 'three';

// One small upload per changed batch, rather than rewriting every posed vertex.
// Six texels: three affine rows, three exact inverse-transpose normal columns.
// Flags fit in the unused normal w components. No projective matrix row needed.
// A texture avoids the vertex-uniform limit of small integrated GPUs.
export function createPosePalette(count){
  const data=new Float32Array(Math.max(1,count)*24),texture=new THREE.DataTexture(data,6,Math.max(1,count),THREE.RGBAFormat,THREE.FloatType);
  texture.needsUpdate=true;const normal=new THREE.Matrix3(),time={value:0},amplitude={value:0};let dirty=false,uploads=0,transport=null;
  function compile(shader,depthOnly=false,renderer){
    // Small rigs fit comfortably in WebGL2's uniform budget. Reading their
    // six pose rows from uniforms avoids six dependent vertex-texture fetches
    // per vertex. Large batches keep the texture path and the same exact data.
    const rows=Math.max(1,count)*6,uniforms=rows<=Math.min(384,(renderer?.capabilities?.maxVertexUniforms??0)-96);
    transport=uniforms?'uniforms':'texture';
    const header=`attribute float batchPart;uniform float batchTime,batchBreath;\n`+(uniforms?`uniform vec4 batchPoseRows[${rows}];
vec4 poseTexel(int column){return batchPoseRows[int(batchPart)*6+column];}
`:`uniform highp sampler2D batchPose;
vec4 poseTexel(int column){return texelFetch(batchPose,ivec2(column,int(batchPart)),0);}
`);
    if(uniforms)shader.uniforms.batchPoseRows={value:data};else shader.uniforms.batchPose={value:texture};
    shader.uniforms.batchTime=time;shader.uniforms.batchBreath=amplitude;
    shader.vertexShader=header+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('void main() {',`void main() {\nvec4 poseN0=poseTexel(3),poseN1=poseTexel(4);${depthOnly?'':'vec4 poseN2=poseTexel(5);'}`);
    if(!depthOnly)shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=mat3(poseN0.xyz,poseN1.xyz,poseN2.xyz)*objectNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 posePosition=vec4(transformed,1.0);
      transformed=vec3(dot(poseTexel(0),posePosition),dot(poseTexel(1),posePosition),dot(poseTexel(2),posePosition));
      if(poseN1.w>=0.)transformed.y+=sin(batchTime*1.2+poseN1.w)*batchBreath;`);
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nif(poseN0.w<0.5)gl_Position=vec4(2.,2.,2.,1.);');
  }
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});depth.onBeforeCompile=(shader,renderer)=>compile(shader,true,renderer);depth.customProgramCacheKey=()=> `batch-pose-depth-v3|${count}`;
  return {texture,depth,
    install(material){material.onBeforeCompile=(shader,renderer)=>compile(shader,false,renderer);material.customProgramCacheKey=()=> `batch-pose-v3|${count}`;},
    set(index,matrix,visible=true,breathing=-1,linearChanged=true){
      const offset=index*24,e=matrix.elements;
      data[offset]=e[0];data[offset+1]=e[4];data[offset+2]=e[8];data[offset+3]=e[12];
      data[offset+4]=e[1];data[offset+5]=e[5];data[offset+6]=e[9];data[offset+7]=e[13];
      data[offset+8]=e[2];data[offset+9]=e[6];data[offset+10]=e[10];data[offset+11]=e[14];
      if(linearChanged){normal.getNormalMatrix(matrix);for(let col=0;col<3;col++)for(let row=0;row<3;row++)data[offset+12+col*4+row]=normal.elements[col*3+row];}
      data[offset+15]=visible?1:0;data[offset+19]=breathing;dirty=true;
    },
    flush(){if(!dirty)return false;dirty=false;texture.needsUpdate=true;uploads++;return true;},
    setTime(value,enabled){time.value=value;amplitude.value=enabled?.012:0;},
    get uploads(){return uploads;},get bytes(){return data.byteLength;},
    get transport(){return transport;},
    dispose(){texture.dispose();depth.dispose();}
  };
}
