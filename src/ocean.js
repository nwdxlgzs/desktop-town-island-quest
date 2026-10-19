import * as THREE from 'three';

// Voxel crests move on the GPU; no per-frame instance buffer uploads.
export function createOcean(){
  const material=new THREE.MeshBasicMaterial({color:'#c1d9d6'}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.28;
  // Draw opaque land first: early depth rejection avoids shading the ocean
  // again underneath a close-up island that covers most of the viewport.
  mesh.renderOrder=1;
  const waveMaterial=new THREE.MeshBasicMaterial({color:'#e5f1e8'}),waveGeometry=new THREE.BoxGeometry(1,1,1),waves=new THREE.InstancedMesh(waveGeometry,waveMaterial,216),dummy=new THREE.Object3D();
  // Keep only the top and two camera-facing sides, including during inspection.
  // A quadrant change updates 18 indices, never all instances or voxel vertices.
  const fullIndex=waveGeometry.index.array.slice(),visibleIndex=new THREE.BufferAttribute(new Uint16Array(18),1);visibleIndex.setUsage(THREE.DynamicDrawUsage);waveGeometry.setIndex(visibleIndex);let quadrant=-1;
  function setView(x,z){const next=(x<0?1:0)|(z<0?2:0);if(next===quadrant)return;quadrant=next;const ix=x<0?6:0,iz=z<0?30:24;visibleIndex.array.set(fullIndex.subarray(ix,ix+6),0);visibleIndex.array.set(fullIndex.subarray(12,18),6);visibleIndex.array.set(fullIndex.subarray(iz,iz+6),12);visibleIndex.needsUpdate=true;}
  setView(18,30);
  const uniforms={time:{value:0},focus:{value:new THREE.Vector2()},grid:{value:new THREE.Vector4(0,0,9,0)}};
  const seaBounds=new THREE.Box2(),point=new THREE.Vector3(),seaPoint=new THREE.Vector2(),direction=new THREE.Vector3();let compact=false;
  function setCamera(camera){
    camera.getWorldDirection(direction);if(Math.abs(direction.y)<.001)return;
    seaBounds.makeEmpty();
    for(const x of [-1,1])for(const y of [-1,1]){
      point.set(x,y,0).unproject(camera);point.addScaledVector(direction,(-.23-point.y)/direction.y);seaBounds.expandByPoint(seaPoint.set(point.x,point.z));
    }seaBounds.expandByScalar(1);compact=true;
  }
  waveMaterial.onBeforeCompile=shader=>{
    shader.uniforms.waveTime=uniforms.time;shader.uniforms.waveFocus=uniforms.focus;shader.uniforms.waveGrid=uniforms.grid;
    shader.vertexShader='uniform float waveTime;\nuniform vec2 waveFocus;uniform vec4 waveGrid;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec4 crest;vec2 origin;
      if(waveGrid.w>0.5){
        // Only the cells intersecting the current sea view are instanced.
        // Stable world lattice + origin drift: no instance repacks or wrap seams.
        float id=float(gl_InstanceID),part=mod(id,3.0),cell=floor(id/3.0);
        float column=waveGrid.x+mod(cell,waveGrid.z),row=waveGrid.y+floor(cell/waveGrid.z);
        origin=vec2(-65.0+column*16.0+mod(row,2.0)*5.0+part*0.65,-58.0+row*17.0+mod(part,2.0)*0.2);
        crest=vec4(transformed*vec3(0.7,0.035,0.18)+vec3(origin.x,-0.23,origin.y),1.0);
        crest.xz+=waveTime*vec2(0.45,1.2);
      }else{
      crest = instanceMatrix * vec4(transformed, 1.0);
      // Wrap the instance origin, never its individual vertices. A vertex-wise
      // modulo stretches triangles across the ocean for one boundary frame.
      origin = instanceMatrix[3].xz;
      vec2 wrapped = mod(origin + waveTime * vec2(0.45, 1.2) - waveFocus + vec2(72.0, 68.0), vec2(144.0, 136.0)) - vec2(72.0, 68.0) + waveFocus;
      crest.xz += wrapped - origin;
      }
      crest.y += floor(sin(waveTime * 1.4 + origin.x * 0.2) * 2.0) * 0.008;
      vec4 mvPosition = modelViewMatrix * crest;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  waveMaterial.customProgramCacheKey=()=> 'travelling-voxel-crests-v3';
  for(let i=0;i<72;i++)for(let j=0;j<3;j++){
    dummy.position.set(-65+(i%9)*16+(Math.floor(i/9)%2)*5+j*.65,-.23,-58+Math.floor(i/9)*17+(j%2)*.2);
    dummy.scale.set(.7,.035,.18);dummy.updateMatrix();waves.setMatrixAt(i*3+j,dummy.matrix);
  }
  waves.frustumCulled=false;waves.visible=false;let time=0;
  function update(t,x=0,z=0,enabled=false){waves.visible=enabled;if(!enabled)return;time=t;uniforms.time.value=t;uniforms.focus.value.set(x,z);
    if(compact){
      const minCol=Math.floor((seaBounds.min.x+65-t*.45-6.4)/16),maxCol=Math.floor((seaBounds.max.x+65-t*.45)/16),minRow=Math.floor((seaBounds.min.y+58-t*1.2-.2)/17),maxRow=Math.floor((seaBounds.max.y+58-t*1.2)/17);
      const columns=Math.min(9,maxCol-minCol+1),rows=Math.min(8,maxRow-minRow+1);
      uniforms.grid.value.set(minCol+Math.floor((maxCol-minCol+1-columns)/2),minRow+Math.floor((maxRow-minRow+1-rows)/2),columns,1);waves.count=columns*rows*3;
    }
  }
  return {mesh,waves,update,setView,setCamera,get instances(){return waves.visible?waves.count:0;},get time(){return time;},setTint(color){material.color.set(color);},dispose(){mesh.geometry.dispose();material.dispose();waveGeometry.dispose();waveMaterial.dispose();waves.dispose();}};
}
