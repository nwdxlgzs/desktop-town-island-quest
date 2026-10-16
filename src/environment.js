import * as THREE from 'three';

const fallback={id:'noon',name:'晴朗午后',sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:false};
export function createEnvironment({scene,sun,ambient,fill,renderer,ocean,cube}){
  const material=new THREE.MeshBasicMaterial({color:'#b7d4e5',transparent:true,opacity:.48,depthWrite:false}),geometry=cube.clone(),rain=new THREE.InstancedMesh(geometry,material,96),dummy=new THREE.Object3D();rain.frustumCulled=false;rain.visible=false;scene.add(rain);
  const fullIndex=geometry.index.array.slice(),selectedIndex=new THREE.BufferAttribute(new Uint16Array(36),1);selectedIndex.setUsage(THREE.DynamicDrawUsage);geometry.setIndex(selectedIndex);geometry.clearGroups();let facing=-1;
  function setView(x,y,z){
    // All drops share the same fixed lean. Classify in that local frame so
    // opposite inspection angles keep the correct sides, including the top.
    const c=Math.cos(-.12),s=Math.sin(-.12),direction=[c*x+s*y,-s*x+c*y,z];let key=0,count=0;
    for(let axis=0;axis<3;axis++){const v=direction[axis],mask=v>1e-8?1:v<-1e-8?2:3;key|=mask<<(axis*2);}
    if(key===facing)return;facing=key;
    for(let face=0;face<6;face++)if((key>>((face>>1)*2))&(face%2?2:1)){selectedIndex.array.set(fullIndex.subarray(face*6,face*6+6),count);count+=6;}
    selectedIndex.needsUpdate=true;geometry.setDrawRange(0,count);
  }
  setView(18,25,30);
  const rainTime={value:0},rainFocus={value:new THREE.Vector3()};
  material.onBeforeCompile=shader=>{
    shader.uniforms.rainTime=rainTime;shader.uniforms.rainFocus=rainFocus;
    shader.vertexShader='uniform float rainTime;uniform vec3 rainFocus;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec4 drop=instanceMatrix*vec4(transformed,1.0);
      // Local box height must not wrap: only the drop's origin crosses the loop.
      drop.y=drop.y-instanceMatrix[3].y+mod(instanceMatrix[3].y-rainTime*5.0,12.0)+2.0;
      mvPosition=modelViewMatrix*vec4(drop.xyz+rainFocus,1.0);gl_Position=projectionMatrix*mvPosition;`);
  };
  material.customProgramCacheKey=()=> 'rain-origin-motion-v1';
  for(let i=0;i<96;i++){
    dummy.position.set(-14+(i*7.13)%28,(i*.73)%12,-13+(i*3.71)%26);dummy.scale.set(.035,.4+(i%3)*.08,.035);dummy.rotation.z=-.12;dummy.updateMatrix();rain.setMatrixAt(i,dummy.matrix);
  }
  rain.layers.set(1);
  let current=fallback,from=fallback,to=fallback,mix=1,dirty=true;
  const lightPosition=[...fallback.sun];
  const colorA=new THREE.Color(),colorB=new THREE.Color(),sky=new THREE.Color(),sea=new THREE.Color(),sunTint=new THREE.Color();
  const value=k=>Number(from[k])+(Number(to[k])-Number(from[k]))*mix;
  function tint(key,out){return out.copy(colorA.set(from[key])).lerp(colorB.set(to[key]),mix);}
  function set(profile,immediate=false){from=current;to=profile||fallback;mix=immediate?1:0;dirty=true;if(immediate)current=to;}
  function update(dt,time,focus,profile){
    if(dirty||mix<1){mix=Math.min(1,mix+dt/2.4);if(mix===1)current=to;
      tint('sky',sky);scene.background.copy(sky);scene.fog.color.copy(sky);ocean.setTint(tint('sea',sea));sun.color.copy(tint('sunColor',sunTint));sun.intensity=value('sunIntensity');ambient.intensity=value('ambient');fill.intensity=value('fill');renderer.toneMappingExposure=value('exposure');
      for(let i=0;i<3;i++)lightPosition[i]=from.sun[i]+(to.sun[i]-from.sun[i])*mix;dirty=false;
    }
    rain.visible=to.rain&&profile.particles>0;
    if(rain.visible){rain.count=profile.particles;rainTime.value=time;rainFocus.value.copy(focus);}
  }
  return {set,update,setView,get particleUploads(){return rain.instanceMatrix.version;},get transitioning(){return dirty||mix<1;},get moving(){return dirty||mix<1||rain.visible;},get profile(){return to;},get sunPosition(){return lightPosition;},dispose(){rain.dispose();geometry.dispose();material.dispose();scene.remove(rain);}};
}
