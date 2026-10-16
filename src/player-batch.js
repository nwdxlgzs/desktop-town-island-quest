import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { syncLocalMatrix } from './live-transforms.js';

// Six posed parts share one draw. Upload six small local matrices instead of
// transforming/uploading every vertex; source rigs still drive the outline.
export function batchPlayer(player){
  const parts=player.userData.parts,pieces=[],matrices=parts.map(()=>new THREE.Matrix4());
  for(const [i,part]of parts.entries()){
    const g=part.geometry.clone();g.setAttribute('playerPart',new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i),1));pieces.push(g);
    part.layers.set(2); // Children (outline edges) retain their own render layer.
  }
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  const time={value:0},breath={value:0};
  function pose(shader){
    shader.uniforms.playerPose={value:matrices};
    shader.uniforms.playerTime=time;shader.uniforms.playerBreath=breath;
    shader.vertexShader=`attribute float playerPart;uniform mat4 playerPose[${parts.length}];uniform float playerTime,playerBreath;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=mat3(playerPose[int(playerPart)])*objectNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=(playerPose[int(playerPart)]*vec4(transformed,1.0)).xyz;\ntransformed.y+=sin(playerTime*1.2)*playerBreath;');
  }
  const material=parts[0].material.clone();material.onBeforeCompile=pose;material.customProgramCacheKey=()=> 'player-part-palette-v2';
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});depth.onBeforeCompile=pose;depth.customProgramCacheKey=()=> 'player-part-palette-depth-v2';
  const mesh=new THREE.Mesh(geometry,material);mesh.customDepthMaterial=depth;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.layers.set(1);mesh.userData.dynamicShadow=true;player.add(mesh);
  let updates=0;
  function update(){
    let changed=false;
    for(let i=0;i<parts.length;i++){
      const parent=parts[i].parent;if(parent===player)continue;
      syncLocalMatrix(parent);if(matrices[i].equals(parent.matrix))continue;matrices[i].copy(parent.matrix);changed=true;
    }
    if(changed)updates++;
  }
  update();return {mesh,update,installPose:pose,setTime(value,enabled){time.value=value;breath.value=enabled?.012:0;},get updates(){return updates;},dispose(){depth.dispose();}};
}
