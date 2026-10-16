import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createViewDrawList } from './view-draw-list.js';

// All workshop text shares one small texture and one draw call. Original planes
// remain as CPU raycast proxies; fading changes only their atlas vertex range.
export function createSignAtlas(count){
  const canvas=document.createElement('canvas'),cols=2,slotWidth=512,slotHeight=128,rows=Math.max(1,Math.ceil(count/cols));
  canvas.width=cols*slotWidth;canvas.height=rows*slotHeight;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas),entries=[];
  texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const proxy=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  function sign(text,bg,fg,w){
    const index=entries.length,x=(index%cols)*slotWidth,y=Math.floor(index/cols)*slotHeight;
    ctx.fillStyle=bg;ctx.fillRect(x,y,slotWidth,slotHeight);ctx.fillStyle=fg;ctx.font='bold 56px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x+slotWidth/2,y+slotHeight/2,slotWidth-40);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),proxy),uv=mesh.geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+1+uv.getX(i)*(slotWidth-2))/canvas.width,1-(y+1+(1-uv.getY(i))*(slotHeight-2))/canvas.height);
    mesh.userData.sign=true;entries.push({mesh,group:null});return mesh;
  }
  function build(root,occluders){
    const pieces=[],ranges=[];let offset=0,indexOffset=0;
    for(const e of entries){
      e.group=occluders.find(o=>o.group===e.mesh.parent)||null;e.mesh.updateMatrix();const g=e.mesh.geometry.clone().applyMatrix4(e.mesh.matrix);
      e.start=offset;e.count=g.attributes.position.count;offset+=e.count;pieces.push(g);
      g.computeBoundingBox();const count=g.index?.count??e.count;ranges.push({start:indexOffset,count,bounds:g.boundingBox.clone()});indexOffset+=count;
    }
    if(!pieces.length)return {setOpacity(){}};
    const geometry=mergeGeometries(pieces),opacity=new THREE.BufferAttribute(new Float32Array(offset).fill(1),1);pieces.forEach(g=>g.dispose());
    opacity.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('signOpacity',opacity);texture.needsUpdate=true;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float signOpacity;\nvarying float vSignOpacity;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSignOpacity = signOpacity;');
      shader.fragmentShader='varying float vSignOpacity;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vSignOpacity;');
    };
    material.customProgramCacheKey=()=> 'workshop-sign-atlas-v1';const mesh=new THREE.Mesh(geometry,material);mesh.layers.set(1);root.add(mesh);
    return {viewList:createViewDrawList(mesh,ranges),setOpacity(o,value){for(const e of entries){if(e.group!==o||e.opacity===value)continue;e.opacity=value;opacity.array.fill(value,e.start,e.start+e.count);opacity.addUpdateRange(e.start,e.count);opacity.needsUpdate=true;}}};
  }
  return {sign,build};
}
