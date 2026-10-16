import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createViewDrawList,spatialDrawList } from './view-draw-list.js';
import { createPosePalette } from './pose-palette.js';
import { createLiveTransforms } from './live-transforms.js';

// Translation changes positions, but leaves every surface normal untouched.
function sameLinearTransform(a,b){
  if(!a)return false;
  const x=a.elements,y=b.elements;
  return x[0]===y[0]&&x[1]===y[1]&&x[2]===y[2]&&x[4]===y[4]&&x[5]===y[5]&&x[6]===y[6]&&x[8]===y[8]&&x[9]===y[9]&&x[10]===y[10];
}

// A rigid prop needs one colored surface instead of one draw per cube.
const rigidPaint=new WeakMap();
export function mergeRigidGroup(group,excluded=[],editable=[]){
  const pieces=[],edits=new Map();let offset=0;
  for(const mesh of [...group.children]){
    if(!mesh.isMesh||mesh.material.visible===false||mesh.material.map||excluded.includes(mesh))continue;
    mesh.updateMatrix();const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix),col=mesh.material.color,colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=col.r;colors[i+1]=col.g;colors[i+2]=col.b;}
    if(editable.includes(mesh))edits.set(mesh,{start:offset,count:geometry.attributes.position.count,color:col.clone()});offset+=geometry.attributes.position.count;
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(geometry);group.remove(mesh);
  }
  if(!pieces.length)return;
  const geometry=mergeGeometries(pieces),mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));pieces.forEach(p=>p.dispose());mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  if(edits.size){rigidPaint.set(mesh,edits);geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);}return mesh;
}

// Rare paint changes (such as choosing a sail) do not need a separate material
// and draw every frame. Retain only the editable source's color range.
export function paintRigidPart(merged,source){
  const part=rigidPaint.get(merged)?.get(source),color=source.material.color;if(!part||part.color.equals(color))return false;
  const attribute=merged.geometry.attributes.color;
  for(let i=part.start;i<part.start+part.count;i++)attribute.setXYZ(i,color.r,color.g,color.b);
  attribute.addUpdateRange(part.start*3,part.count*3);attribute.needsUpdate=true;part.color.copy(color);return true;
}

// Keep opaque scenery in one draw. Only the few objects fading around the player
// use separate transparent meshes; the batch clips their original vertices.
export function batchOccluders(occluders,root){
  const pieces=[],entries=[],ranges=[];
  let offset=0,indexOffset=0;
  for(const o of occluders)for(const mesh of o.group.children){
    if(!mesh.isMesh||mesh.material.map||mesh.userData.sign)continue;
    const count=mesh.geometry.attributes.position.count;
    pieces.push(mesh.geometry);entries.push({o,mesh,start:offset,count});offset+=count;
    mesh.geometry.computeBoundingBox();const indices=mesh.geometry.index?.count??count;
    ranges.push({start:indexOffset,count:indices,bounds:mesh.geometry.boundingBox.clone(),fading:()=>!!o.batchEntry?.fading});indexOffset+=indices;
    mesh.visible=false;mesh.castShadow=false;
    // Fading surfaces animate above the opaque cached island. Their opacity
    // no longer forces a new high-resolution landscape image every frame.
    mesh.layers.set(1);
    o.group.visible=false;
  }
  if(!pieces.length)return {setFading(){},dispose(){}};
  const geometry=mergeGeometries(pieces),visibility=new THREE.BufferAttribute(new Float32Array(offset).fill(1),1);
  visibility.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('surfaceVisible',visibility);
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float surfaceVisible;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nif(surfaceVisible < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
  };
  material.customProgramCacheKey=()=> 'opaque-scenery-v1';
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  const viewList=createViewDrawList(mesh,ranges,null,{faceCulling:true});
  for(const e of entries)e.o.batchEntry=e;
  return {viewList,
    setFading(o,fading){
      const e=o.batchEntry;if(!e||e.fading===fading)return false;
      e.fading=fading;e.mesh.visible=fading;o.group.visible=fading;
      visibility.array.fill(fading?0:1,e.start,e.start+e.count);
      visibility.addUpdateRange(e.start,e.count);visibility.needsUpdate=true;
      return true;
    }
  };
}

// NPC rigs drive interaction and culling; their six poses share one GPU batch.
export function batchResidents(npcs,root){
  const actors=[],byObject=new Map(),pieces=[],ranges=[];let offset=0,indexOffset=0,checks=0,part=0;
  for(const n of npcs){
    const actor={object:n.object,entries:[],start:offset,count:0,phase:n.phase??actors.length,breathing:null},range={object:n.object,start:indexOffset,count:0};actors.push(actor);ranges.push(range);
    byObject.set(n.object,actor);
    for(const mesh of n.object.userData.parts){
    const count=mesh.geometry.attributes.position.count;
    const geometry=mesh.geometry.clone();geometry.setAttribute('batchPart',new THREE.Float32BufferAttribute(new Array(count).fill(part),1));
    actor.entries.push({mesh,part:part++,matrix:null});pieces.push(geometry);offset+=count;actor.count+=count;mesh.visible=false;
    const indices=mesh.geometry.index?.count??count;range.count+=indices;indexOffset+=indices;
    }
  }
  if(!pieces.length)return {update(){}};
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  const palette=createPosePalette(part),material=new THREE.MeshLambertMaterial({vertexColors:true});palette.install(material);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.customDepthMaterial=palette.depth;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.residentBatch=true;mesh.layers.set(1);root.add(mesh);
  const viewList=createViewDrawList(mesh,ranges);
  const matrix=new THREE.Matrix4(),rootInverse=new THREE.Matrix4(),transforms=createLiveTransforms(),selectedActors=[];
  function update(selected=()=>true){
    if(typeof selected!=='function'&&(selected.size===0||selected.length===0))return false;
    const predicate=typeof selected==='function';
    if(!predicate){selectedActors.length=0;for(const object of selected){const actor=byObject.get(object);if(actor)selectedActors.push(actor);}if(!selectedActors.length)return false;}
    root.updateWorldMatrix(true,false);rootInverse.copy(root.matrixWorld).invert();
    for(const actor of predicate?actors:selectedActors){
      if(predicate&&!selected(actor.object))continue;
      checks++;
      const breathing=actor.object.userData.idleBreath===true;
      const breathChanged=actor.breathing!==breathing;actor.breathing=breathing;
      transforms.update(actor.object);
      for(const e of actor.entries){
      matrix.multiplyMatrices(rootInverse,e.mesh.matrixWorld);
      if(e.matrix?.equals(matrix)&&!breathChanged)continue;
      const rotated=!sameLinearTransform(e.matrix,matrix);
      palette.set(e.part,matrix,true,breathing?actor.phase*.15:-1,rotated);
      if(!e.matrix)e.matrix=new THREE.Matrix4();e.matrix.copy(matrix);
      }
    }
    return palette.flush();
  }
  update();return {update,viewList,palette,setTime:palette.setTime,get checks(){return checks;},dispose(){palette.dispose();}};
}

export function freezeStaticMeshes(root){
  root.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});
}

// Reefs, lamps, collectibles and creatures used to each issue separate draws.
// Their source objects remain interaction/animation rigs. Geometry stays fixed;
// changed transforms use one small palette upload, paint changes retain ranges.
export function batchProps(objects,root,{cached=false}={}){
  const sources=[...new Set(objects)],rigs=[],byObject=new Map(),pieces=[],ranges=[];let offset=0,indexOffset=0,updates=0,checks=0;
  for(const object of sources){
    const range={object,start:indexOffset,count:0,...(cached?{bounds:new THREE.Box3()}: {})},rig={object,entries:[],range};rigs.push(rig);ranges.push(range);
    byObject.set(object,rig);
    object.traverse(mesh=>{
    if(!mesh.isMesh||mesh.material.visible===false||mesh.material.map)return;
    const source=mesh.geometry.clone(),count=source.attributes.position.count;
    // Preserve shared face vertices; expanding boxes/cylinders into individual
    // triangles inflated both actor transforms and GPU uploads on every tick.
    if(!source.index)source.setIndex(Array.from({length:count},(_,i)=>i));
    if(!source.attributes.color)source.setAttribute('color',new THREE.BufferAttribute(new Float32Array(count*3).fill(1),3));
    // No UVs are sampled. Drop them so boxes and cylinders share one layout.
    source.deleteAttribute('uv');pieces.push(source);
    const part=pieces.length-1;if(!cached)source.setAttribute('batchPart',new THREE.Float32BufferAttribute(new Array(count).fill(part),1));
    if(cached)source.computeBoundingBox();
    rig.entries.push({object,mesh,source,part,start:offset,count,matrix:new THREE.Matrix4(),color:new THREE.Color(-1,-1,-1),visible:null,bounds:cached?new THREE.Box3():null});offset+=count;range.count+=source.index.count;indexOffset+=source.index.count;
    mesh.layers.disable(0);mesh.layers.enable(2);
  });
  }
  if(!pieces.length)return {update(){},get updates(){return 0;}};
  const geometry=mergeGeometries(pieces),color=geometry.attributes.color,palette=cached?null:createPosePalette(pieces.length),material=new THREE.MeshLambertMaterial({vertexColors:true});palette?.install(material);color.setUsage(THREE.DynamicDrawUsage);
  const positions=geometry.attributes.position,normals=geometry.attributes.normal,point=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  if(cached){positions.setUsage(THREE.DynamicDrawUsage);normals.setUsage(THREE.DynamicDrawUsage);}
  const mesh=new THREE.Mesh(geometry,material);if(palette)mesh.customDepthMaterial=palette.depth;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.movingPropBatch=!cached;mesh.layers.set(cached?0:1);root.add(mesh);
  const viewList=createViewDrawList(mesh,ranges);
  const matrix=new THREE.Matrix4(),rootInverse=new THREE.Matrix4(),transforms=createLiveTransforms(),selectedRigs=[];
  function update(selected=()=>true){
    if(typeof selected!=='function'&&(selected.size===0||selected.length===0))return false;
    const predicate=typeof selected==='function';
    if(!predicate){selectedRigs.length=0;for(const object of selected){const rig=byObject.get(object);if(rig)selectedRigs.push(rig);}if(!selectedRigs.length)return false;}
    root.updateWorldMatrix(true,false);
    rootInverse.copy(root.matrixWorld).invert();let any=false,paintedAny=false,positionsChanged=false,normalsChanged=false;
    for(const rig of predicate?rigs:selectedRigs){
      if(predicate&&!selected(rig.object))continue;
      checks++;
      transforms.update(rig.object);
      let boundsChanged=false;
      for(const e of rig.entries){
      let visible=true;for(let o=e.mesh;o&&o!==root;o=o.parent)if(!o.visible&&!o.userData.logicOnly){visible=false;break;}
      matrix.multiplyMatrices(rootInverse,e.mesh.matrixWorld);const tint=e.mesh.material.color;
      const moved=!matrix.equals(e.matrix)||e.visible!==visible,painted=!tint.equals(e.color);
      if(!moved&&!painted)continue;
      any=true;
      if(moved){
        const rotated=e.visible===null||!sameLinearTransform(e.matrix,matrix);
        if(palette)palette.set(e.part,matrix,visible,-1,rotated);
        if(cached){
          // Static props need no vertex texture fetches or pose table. Bake
          // their island-local positions/normals once; rare visibility/paint
          // edits still retain exact ranges and invalidate the island cache.
          const source=e.source.attributes;
          for(let i=0;i<e.count;i++){
            if(visible)point.fromBufferAttribute(source.position,i).applyMatrix4(matrix);else point.set(0,0,0);
            positions.setXYZ(e.start+i,point.x,point.y,point.z);
          }
          positions.addUpdateRange(e.start*3,e.count*3);positionsChanged=true;
          if(rotated){
            normalMatrix.getNormalMatrix(matrix);
            for(let i=0;i<e.count;i++){point.fromBufferAttribute(source.normal,i).applyMatrix3(normalMatrix).normalize();normals.setXYZ(e.start+i,point.x,point.y,point.z);}
            normals.addUpdateRange(e.start*3,e.count*3);normalsChanged=true;
          }
          boundsChanged=true;if(visible)e.bounds.copy(e.source.boundingBox).applyMatrix4(matrix);else e.bounds.makeEmpty();
        }
        e.matrix.copy(matrix);e.visible=visible;
      }
      if(painted){paintedAny=true;const src=e.source.attributes.color.array;for(let i=0,j=e.start*3;i<e.count*3;i+=3,j+=3){color.array[j]=src[i]*tint.r;color.array[j+1]=src[i+1]*tint.g;color.array[j+2]=src[i+2]*tint.b;}color.addUpdateRange(e.start*3,e.count*3);e.color.copy(tint);}
      }
      if(boundsChanged){rig.range.bounds.makeEmpty();for(const e of rig.entries)rig.range.bounds.union(e.bounds);}
    }
    palette?.flush();if(any)updates++;if(paintedAny)color.needsUpdate=true;
    if(positionsChanged)positions.needsUpdate=true;if(normalsChanged)normals.needsUpdate=true;
    return any;
  }
  update();return {update,viewList,sources,palette,get checks(){return checks;},get updates(){return updates;},dispose(){pieces.forEach(g=>g.dispose());palette?.dispose();}};
}

// Immutable decorations enter the island cache. Their colors/visibility are
// edited rarely; expose a revision so world rendering invalidates exactly then.
export function batchIslandProps(dynamic,stationary,root){
  const moving=batchProps(dynamic,root),baked=batchProps(stationary,root,{cached:true}),parts=[moving,baked];
  return {sources:[...new Set([...dynamic,...stationary])],dynamicSources:[...dynamic],viewList:moving.viewList,staticViewList:baked.viewList,
    update(selected=()=>true){let changed=false;for(const part of parts)changed=part.update(selected)||changed;return changed;},
    get staticRevision(){return baked.updates;},get updates(){return moving.updates+baked.updates;},get checks(){return (moving.checks||0)+(baked.checks||0);},
    get stats(){return {movingTriangles:moving.viewList?.triangles||0,cachedTriangles:baked.viewList?.triangles||0,poseBytes:(moving.palette?.bytes||0)+(baked.palette?.bytes||0),poseUploads:(moving.palette?.uploads||0)+(baked.palette?.uploads||0)};},
    dispose(){for(const part of parts)part.dispose?.();}
  };
}

// Pretransform static cube vertices once. Unlike a whole-island InstancedMesh,
// this colored surface can submit just the visible spatial index ranges.
export function batchStaticBoxes(list,cube){
  const pieces=[],matrix=new THREE.Matrix4(),dummy=new THREE.Object3D(),tint=new THREE.Color();
  for(const [color,x,y,z,w,h,d,rotation=0]of list){
    dummy.position.set(x,y,z);dummy.rotation.y=rotation;dummy.scale.set(w,h,d);dummy.updateMatrix();matrix.copy(dummy.matrix);
    const geometry=cube.clone().applyMatrix4(matrix),colors=new Float32Array(geometry.attributes.position.count*3);tint.set(color);
    for(let i=0;i<colors.length;i+=3){colors[i]=tint.r;colors[i+1]=tint.g;colors[i+2]=tint.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');pieces.push(geometry);
  }
  if(!pieces.length)return null;
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  const material=new THREE.MeshLambertMaterial({vertexColors:true});material.userData.owned=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;const viewList=spatialDrawList(mesh);return {mesh,viewList};
}
