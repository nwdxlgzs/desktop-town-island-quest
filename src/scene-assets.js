import * as THREE from 'three';
import { stations } from './curriculum.js';
import { randomSource, onLand, waterAt, nearRoad, riverX } from './level-layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { workshopArea } from './interactions.js';
import { elevationAt,terrainTileSize } from './terrain.js';
import { createWildlife } from './wildlife.js';
import { buildTerrainMesh } from './terrain-mesh.js';
import { ladderFrame } from './ladder-motion.js';
import { batchOccluders,batchResidents,batchIslandProps,batchStaticBoxes,freezeStaticMeshes,mergeRigidGroup } from './render-batches.js';
import { spatialDrawList,createIslandView } from './view-draw-list.js';
import { installVoxelLighting } from './voxel-lighting.js';
import { bakeIslandShadows,createGroundReceivers } from './baked-shadows.js';
import { createSignAtlas } from './sign-atlas.js';
import { coastalFences } from './fence-layout.js';
import { exposedBoxGeometry } from './box-surfaces.js';
import { streetLamps } from './street-lamps.js';
import { workshopArchitecture } from './workshop-designs.js';
import { createGroundPicker } from './ground-picker.js';
import { mountainParts } from './mountain-shape.js';

export function createPerson(cube, material, color, hat='#e9a958', npc=false, surface=exposedBoxGeometry) {
  const g=new THREE.Group();
  function box(x,y,z,w,h,d,color,parent=g){const mesh=new THREE.Mesh(cube,material(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box(0,.78,0,.55,.65,.38,color);
  const head=new THREE.Group();head.position.y=1.3;g.add(head);
  box(0,0,0,.48,.48,.44,'#f1caa7',head);box(0,.28,-.02,.55,.16,.49,hat,head);box(0,.4,-.04,.42,.1,.4,hat,head);box(0,.24,.24,.53,.07,.12,hat,head);
  box(-.11,.04,.226,.055,.08,.025,'#343e40',head);box(.11,.04,.226,.055,.08,.025,'#343e40',head);box(0,-.09,.23,.08,.025,.02,'#c18467',head);
  function leg(x){const pivot=new THREE.Group();pivot.position.set(x,.55,0);g.add(pivot);box(0,-.25,0,.21,.5,.23,'#3b5360',pivot);box(0,-.49,.07,.24,.13,.39,'#f4eee2',pivot);return pivot;}
  function arm(x){const pivot=new THREE.Group();pivot.position.set(x,1.02,0);g.add(pivot);box(0,-.23,0,.18,.51,.22,color,pivot);box(0,-.53,.01,.16,.16,.19,'#f1caa7',pivot);return pivot;}
  const left=leg(-.16),right=leg(.16),armL=arm(-.38),armR=arm(.38);
  if(!npc){box(0,.86,-.27,.39,.43,.23,'#d69745');box(0,.92,-.4,.23,.08,.03,'#eebe69');}
  const skin=new THREE.MeshLambertMaterial({vertexColors:true});skin.userData.owned=true;
  const renderParts=[];
  for(const parent of [g,head,left,right,armL,armR]){
    const parts=[];
    const peers=parent.children.filter(mesh=>mesh.isMesh);
    for(const mesh of [...parent.children])if(mesh.isMesh){
      mesh.updateMatrix();const geometry=surface(mesh,peers).applyMatrix4(mesh.matrix),col=mesh.material.color,colors=new Float32Array(geometry.attributes.position.count*3);
      for(let i=0;i<colors.length;i+=3){colors[i]=col.r;colors[i+1]=col.g;colors[i+2]=col.b;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);parent.remove(mesh);
    }
    if(parts.length){const mesh=new THREE.Mesh(mergeGeometries(parts),skin);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);renderParts.push(mesh);parts.forEach(part=>part.dispose());}
  }
  g.userData={left,right,armL,armR,head,parts:renderParts};return g;
}

export function buildIsland(layout, cube, material) {
  const root=new THREE.Group(),batches=new Map(),animated=[],npcs=[],beacons=[],hitTargets=[],occluders=[],reefObjects=[],discoveries=[],wildlife=[];
  const signs=createSignAtlas(layout.workshops.length*2);
  const biome=layout.level.biome,p=biome?.palette||{ground:'#b5d3a2',groundAlt:'#a5c591',sand:'#dfd0a9',rock:['#9da98f','#b0b599','#c6ba99','#d2c29e'],leaf:['#7ead70','#91bb7d','#6f9e64','#a4c991'],water:'#70b4bf',accent:'#f5d17c',trunk:'#ae8660'};
  let occlusionGroup=null,buildElevation=0;const shadowCasters=[];
  // Raycasting works on invisible materials; click volumes never need a GPU draw.
  const hitMaterial=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  const surfacePositions=[],surfaceColors=[],surfaceTint=new THREE.Color(),groundReceivers=createGroundReceivers();
  function groundPatch(x,z,w,d,color,raised=false){
    const size=terrainTileSize,ox=-layout.width/2,oz=-layout.depth/2;
    for(let ix=Math.floor((x-w/2-ox)/size);ix<=Math.floor((x+w/2-ox)/size);ix++)for(let iz=Math.floor((z-d/2-oz)/size);iz<=Math.floor((z+d/2-oz)/size);iz++){
      const x0=Math.max(x-w/2,ox+ix*size),x1=Math.min(x+w/2,ox+(ix+1)*size),z0=Math.max(z-d/2,oz+iz*size),z1=Math.min(z+d/2,oz+(iz+1)*size);
      if(x1-x0<.001||z1-z0<.001||!onLand(layout,(x0+x1)/2,(z0+z1)/2,.1))continue;
      const y=.13+elevationAt(layout,(x0+x1)/2,(z0+z1)/2);surfaceTint.set(color);
      groundReceivers.add((x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,y);
      for(const [px,pz] of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){surfacePositions.push(px,y,pz);surfaceColors.push(surfaceTint.r,surfaceTint.g,surfaceTint.b);}
      if(raised){const side=surfaceTint.clone().multiplyScalar(.88),low=y-.045;
        for(const [a,b]of [[[x0,z0],[x0,z1]],[[x0,z1],[x1,z1]],[[x1,z1],[x1,z0]],[[x1,z0],[x0,z0]]])for(const [px,py,pz]of [[a[0],low,a[1]],[a[0],y,a[1]],[b[0],y,b[1]],[a[0],low,a[1]],[b[0],y,b[1]],[b[0],low,b[1]]]){surfacePositions.push(px,py,pz);surfaceColors.push(side.r,side.g,side.b);}
      }
    }
  }
  function occlude(build){
    const group=new THREE.Group();root.add(group);const previous=occlusionGroup;occlusionGroup=group;build();occlusionGroup=previous;
    const pieces=[],textured=[];
    for(const mesh of [...group.children]){
      if(!mesh.isMesh)continue;
      if(mesh.userData.sign)continue;
      if(mesh.material.map){mesh.material.transparent=true;mesh.material.userData.owned=true;textured.push(mesh.material);continue;}
      mesh.updateMatrix();const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix),color=mesh.material.color;
      const colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(geometry);group.remove(mesh);
    }
    const own=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true});own.userData.owned=true;
    if(pieces.length){const geometry=mergeGeometries(pieces),mesh=new THREE.Mesh(geometry,own);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);pieces.forEach(g=>g.dispose());}
    else own.dispose();
    occluders.push({group,materials:[...(pieces.length?[own]:[]),...textured],opacity:1,target:1});
  }
  function box(x,y,z,w,h,d,color,parent=null,rotation=0){
    y+=buildElevation;
    if(occlusionGroup&&w*h*d>.08)shadowCasters.push(new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2)));
    if(parent||occlusionGroup){const mesh=new THREE.Mesh(cube,material(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;(parent||occlusionGroup).add(mesh);return mesh;}
    if(!batches.has(color))batches.set(color,[]);batches.get(color).push([x,y,z,w,h,d,rotation]);
  }
  const person=(color,hat,npc)=>createPerson(cube,material,color,hat,npc);
  function cylinder(x,y,z,r,h,color,parent=root,segments=16){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material(color));mesh.position.set(x,y+buildElevation,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function plant(x,z,scale=1){box(x,.26,z,.6*scale,.5,.6*scale,'#e7b58a');box(x,.55,z,.72*scale,.12,.72*scale,'#f4cc9e');box(x,.56,z,.49*scale,.1,.49*scale,'#5d4c40');box(x,.9*scale,z,.18,.8*scale,.18,'#4e8c59');box(x-.21*scale,1.04*scale,z,.38*scale,.29*scale,.35*scale,'#72ad67');box(x+.2*scale,1.35*scale,z,.36*scale,.37*scale,.4*scale,'#8ec576');}
  function tree(x,z,sz=1){occlude(()=>{box(x,.8*sz,z,.38*sz,1.8*sz,.38*sz,'#ae8660');box(x,1.9*sz,z,1.6*sz,1.2*sz,1.5*sz,'#7ead70');box(x-.42*sz,2.1*sz,z-.3*sz,1.05*sz,1.1*sz,1.1*sz,'#91bb7d');box(x+.4*sz,1.84*sz,z+.24*sz,1.1*sz,.9*sz,1.2*sz,'#6f9e64');box(x-.1*sz,2.65*sz,z-.1*sz,1.0*sz,.7*sz,1.0*sz,'#a4c991');});}
  function fence({x,z,y,length,axis}){
    buildElevation=y;const steps=Math.ceil(length/1.3);
    for(let i=0;i<=steps;i++)box(x+(axis==='x'?i*length/steps:0),.63,z+(axis==='z'?i*length/steps:0),.16,1.1,.16,'#f3e4bf');
    for(const height of [.48,.88])box(x+(axis==='x'?length/2:0),height,z+(axis==='z'?length/2:0),axis==='x'?length:.14,.13,axis==='z'?length:.14,height>.5?'#f3e4bf':'#e7d4a6');
  }
  function monitor(x,z,col='#2f484b'){box(x,1.6,z,.16,.7,.16,col);box(x,1.28,z,.6,.07,.4,col);box(x,1.95,z,.98,.7,.13,col);box(x,1.96,z+.076,.84,.53,.022,'#b8e7d4');box(x-.2,2.03,z+.093,.31,.06,.018,'#4d9e8b');box(x-.05,1.91,z+.093,.6,.04,.018,'#6fbaa1');box(x,1.39,z+.45,.85,.06,.32,'#e8e9dd');for(let i=0;i<5;i++)box(x-.3+i*.14,1.43,z+.45,.09,.035,.23,'#b8c2b7');}
  function counter(x,z,w,d,col){occlude(()=>{box(x,.55,z,w,1.1,d,col);box(x,1.12,z,w+.13,.14,d+.13,'#fdf3db');box(x,.22,z,w+.07,.16,d+.04,'#596d60');});}
  const sign=(text,bg,fg='#ffffff',w=3.8)=>signs.sign(text,bg,fg,w);
  const {width:w,depth:d}=layout,rand=randomSource(layout.seed+19);
  root.add(buildTerrainMesh(layout,p));
  const fences=layout.fences||coastalFences(layout);fences.forEach(fence);buildElevation=0;
  const lamps=layout.lamps||streetLamps(layout),night=['night','predawn'].includes(layout.level.environment?.id);
  for(const l of lamps){
    buildElevation=l.y;
    box(l.x,1.35,l.z,.14,2.7,.14,'#708574');
    box(l.x,.14,l.z,.35,.26,.35,'#80917c');
    box(l.x,2.62,l.z,.64,.17,.64,night?'#ffe8a5':'#e9dfb6');
    box(l.x,2.8,l.z,.9,.13,.9,'#718e6c');
    box(l.x,2.89,l.z,.66,.06,.66,'#96aa83');
    shadowCasters.push(new THREE.Box3(new THREE.Vector3(l.x-.45,l.y+2.5,l.z-.45),new THREE.Vector3(l.x+.45,l.y+2.93,l.z+.45)));
  }
  buildElevation=0;
  // Quantized, deduplicated paving prevents coplanar intersections from flickering.
  const paving=new Map(),paveSize=.55;
  for(const r of layout.roads){
    const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,length=Math.hypot(dx,dz),steps=Math.max(1,Math.ceil(length/.35));
    for(let i=0;i<=steps;i++)for(const offset of [-.6,0,.6]){
      const x=r.a.x+dx*i/steps+(length?-dz/length*offset:0),z=r.a.z+dz*i/steps+(length?dx/length*offset:0),ix=Math.round(x/paveSize),iz=Math.round(z/paveSize);paving.set(`${ix},${iz}`,{x:ix*paveSize,z:iz*paveSize});
    }
  }
  for(const {x,z} of paving.values()){
    if(!onLand(layout,x,z,.15))continue;
    if(layout.workshops.some(w=>Math.abs(x-w.position[0])<2.9&&Math.abs(z-w.position[1])<2.9))continue;
    if((layout.ladders||[]).some(l=>Math.hypot(x-(l.bottom.x+l.top.x)/2,z-(l.bottom.z+l.top.z)/2)<1.5))continue;
    const wet=waterAt(layout,x,z);
    const alternate=(Math.round(x/paveSize)+Math.round(z/paveSize))%3===0;
    groundPatch(x,z,paveSize-.035,paveSize-.035,wet?'#d4af7d':alternate?'#e5d6b4':'#f0e3c7',true);
  }
  for(const l of layout.ladders||[])occlude(()=>{
    buildElevation=0;const a=l.bottom,b=l.top,{direction,rail}=ladderFrame(l),side={x:direction.z,z:-direction.x};
    for(const offset of [-.46,.46]){
      box(rail.x+side.x*offset,(a.y+b.y)/2+.45,rail.z+side.z*offset,.13,b.y-a.y+.75,.13,'#a48260');
    }
    const steps=Math.max(4,Math.ceil((b.y-a.y)/.42));for(let i=0;i<=steps;i++){const rung=box(rail.x,a.y+(b.y-a.y)*i/steps+.2,rail.z,.95,.1,.13,'#e8c894');rung.rotation.y=Math.atan2(-side.z,side.x);}
    for(const q of [a,b]){box(q.x,q.y+.12,q.z,.7,.06,.7,'#efdc9c');}
  });
  for(const l of layout.ladders||[])for(const q of [l.bottom,l.top]){const hit=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,1.1),hitMaterial);hit.position.set(q.x,q.y+.6,q.z);hit.userData.ladder=l.id;root.add(hit);hitTargets.push(hit);}
  // The dock is reachable on land; boarding happens only at its inner edge.
  box(layout.shoreX+.05,.02,layout.dock.z,3,.25,1.6,'#b99669');
  for(let i=0;i<8;i++)box(layout.shoreX-1.3+i*.4,.17,layout.dock.z,.32,.06,1.5,'#e4c698');
  for(const z of [layout.dock.z-.8,layout.dock.z+.8])box(layout.shoreX+1.1,.36,z,.13,.8,.13,'#967b58');
  for(const s of layout.workshops) { const index=stations.findIndex(station=>station.id===s.theme);
    const [x,z]=s.position, back=z-2.45;
    buildElevation=elevationAt(layout,x,z);
    const g=new THREE.Group();g.userData.station=s.id;root.add(g);
    box(x,.1,z,5.7,.14,5.7,s.pale);box(x,.2,z,5.4,.08,5.4,index===0?'#bdddc7':index===1?'#f0dfb1':index===2?'#efd0b9':index===3?'#d9cfe8':index===4?'#c6deeb':'#d1debd');
    groundReceivers.add(x,z,5.7,5.7,buildElevation+.17);groundReceivers.add(x,z,5.4,5.4,buildElevation+.24);
    for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++){if((ix+iz)%2===0){box(x+ix,.263,z+iz,.95,.018,.95,s.pale);groundReceivers.add(x+ix,z+iz,.95,.95,buildElevation+.272);}}
    occlude(()=>{
      const architecture=workshopArchitecture(s);
      for(const p of architecture.parts)box(x+p.x,p.y,z+p.z,p.w,p.h,p.d,p.color);
      const anchor=architecture.sign,plate=sign(s.name,s.color,'#ffffff',anchor.width);
      plate.position.set(x+anchor.x,anchor.y+buildElevation,z+anchor.z);(occlusionGroup||root).add(plate);
    });
    const badge=sign(String(layout.workshops.indexOf(s)+1).padStart(2,'0'),s.color,'#ffffff',.8);badge.position.set(x-2.22,1.03+buildElevation,z+2.85);(occlusionGroup||root).add(badge);
    const doneLamp=cylinder(x+2.3,1.12,z+2.3,.13,.32,'#f4df96');beacons.push({object:doneLamp,workshop:s.id});box(x+2.3,.53,z+2.3,.15,.9,.15,'#6a7d67');
    plant(x+2.35,back+.8,.7);
    const npc=person(index===0?'#75a591':index===1?'#d7ba62':index===2?'#db9170':index===3?'#a593bc':index===4?'#7da4bb':'#9aaf7d', index===2?'#fff2db':s.color,true);const home=layout.npcSpawns[s.id];npc.position.set(home.x,.25+elevationAt(layout,home.x,home.z),home.z);npc.rotation.y=-.25;root.add(npc);npcs.push({object:npc,workshop:s.id,home:{...home},timer:1+index*.2,route:[],phase:npcs.length,random:randomSource(layout.seed+91+npcs.length*127)});
    const npcHit=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.4,1.4),hitMaterial);npcHit.position.y=.9;npcHit.userData.station=s.id;npc.add(npcHit);hitTargets.push(npcHit);
    // Large click target covers the complete workshop.
    const area=workshopArea(s),hit=new THREE.Mesh(new THREE.BoxGeometry(area.w,3.8,area.d),hitMaterial);hit.position.set(area.x,1.6+buildElevation,area.z);hit.userData.station=s.id;g.add(hit);hitTargets.push(hit);
    if(index===0){
      counter(x-.6,z-.7,3.25,1.0,'#699d85');box(x-.6,1.3,z-.7,3.5,.25,.8,'#536e64');for(let i=0;i<6;i++)box(x-2+i*.55,1.44,z-.7,.18,.07,.75,'#91afa0');
      for(let i=0;i<3;i++){box(x-1.6+i,1.64,z-.7,.55,.38,.5,i%2?'#dca975':'#e6bb84');box(x-1.6+i,1.85,z-.7,.12,.045,.54,'#f8deaf');box(x-1.6+i,1.67,z-.435,.22,.13,.012,'#9bd1ad');}
      box(x-1.65,.54,z+1.42,.95,.5,.85,'#d7ad74');box(x-1.65,.8,z+1.42,1,.05,.9,'#f1cf95');box(x-1.65,.58,z+1.85,.37,.17,.02,'#fff3cf');
      for(let j=0;j<2;j++)box(x+1.8,.3+j*.42,z+1.75,.67,.4,.67,'#d4aa71');
    }else if(index===1){
      counter(x-.65,z-.55,3.1,1.45,'#d3b56a');box(x-1.12,1.23,z-.5,.95,.04,.6,'#faf8e8');box(x-.96,1.26,z-.46,.5,.018,.03,'#d7bc7a');box(x+.16,1.28,z-.5,.5,.09,.7,'#dfc071');
      box(x-1.8,1.59,back+.22,.85,1.05,.13,'#e3b977');for(let i=0;i<3;i++)box(x-1.95+(i%2)*.35,1.65-Math.floor(i/2)*.38,back+.3,.27,.28,.025,i===1?'#dc8d79':'#fbefad');
      cylinder(x+.12,1.4,z+.85,.25,.45,'#f6ede1');for(let i=0;i<4;i++)box(x-.02+i*.1,1.83,z+.85,.055,.55,.055,['#e18a70','#6fae94','#b1a0c3','#e5b45b'][i]);
      box(x-1.5,.55,z+1.7,.85,.68,.85,'#b39660');box(x-1.5,.92,z+1.7,.92,.12,.92,'#e7ca85');
    }else if(index===2){
      counter(x-.6,z-.6,3.35,1.25,'#d69576');box(x-1.4,1.22,z-.57,.92,.05,.85,'#404f4b');cylinder(x-1.4,1.37,z-.57,.33,.28,'#8faaa1');cylinder(x-1.4,1.52,z-.57,.35,.05,'#bcc8b9');box(x-1.4,1.56,z-.57,.12,.08,.12,'#4b6661');
      for(let i=0;i<3;i++){const steam=box(x-1.5+i*.14,1.9+i*.2,z-.57,.09,.18,.09,'#f4f2e7',new THREE.Group());root.add(steam.parent);animated.push({object:steam,type:'steam',base:steam.position.y,seed:i});}
      box(x+.4,1.3,z-.5,.85,.12,.65,'#dab271');box(x+.4,1.46,z-.5,.55,.2,.45,'#9fb773');box(x+.4,1.61,z-.5,.63,.12,.5,'#f2d18b');
      box(x-1.8,.8,z+1.55,.7,.24,.7,'#cb9e69');box(x-1.8,1.42,z+1.78,.72,1.0,.12,'#d4ac7c');box(x-2.02,.45,z+1.4,.1,.8,.1,'#b8895d');box(x-1.58,.45,z+1.7,.1,.8,.1,'#b8895d');
    }else if(index===3){
      counter(x-.6,z-.65,3.45,1.45,'#a195b9');monitor(x-1.2,z-.88,'#514e67');
      box(x+.1,1.5,z-.45,.6,.6,.5,'#cdc3df');box(x+.1,1.66,z-.17,.25,.12,.02,'#b4ead8');for(let i=0;i<3;i++)box(x+.1,1.43-i*.09,z-.17,.35,.035,.02,'#8d7ea1');
      for(let i=0;i<2;i++){box(x-1.1+i*.8,.55,z+1.52,.63,.68,.63,'#7f7894');box(x-1.1+i*.8,.97,z+1.52,.7,.15,.7,'#c8b8db');}
      box(x-1.9,1.9,back+.2,.58,.58,.08,'#f8edce');box(x-1.9,1.9,back+.26,.42,.12,.01,'#b79ecd');
    }else if(index===4){
      counter(x-.8,z-.6,2.8,1.05,'#7aabc2');box(x-1.1,1.5,z-.5,.63,.5,.48,'#475c68');box(x-1.1,1.54,z-.17,.38,.27,.29,'#344951');box(x-1.1,1.54,z+.0,.24,.21,.1,'#b3dce2');box(x-.9,1.8,z-.5,.14,.1,.26,'#e9c18a');
      box(x+.8,1.16,z-.95,.12,1.9,.12,'#536b77');box(x+.8,2.15,z-.95,.85,.15,.5,'#f4edd3');box(x+.8,2.13,z-.65,.63,.12,.04,'#fff6cf');
      box(x-1.3,1.8,back+.2,1.0,.85,.12,'#f5e8cd');box(x-1.3,1.8,back+.27,.77,.62,.02,'#c3dbe5');box(x-1.4,1.7,back+.29,.5,.17,.01,'#84ac8e');box(x-1.18,2.0,back+.29,.16,.16,.01,'#f1cd75');
      box(x-1.25,.5,z+1.4,1.2,.65,.72,'#75a2b7');box(x-1.25,.86,z+1.4,1.28,.12,.76,'#e7dac1');
    }else{
      counter(x-.6,z-.6,3.1,1.2,'#9bb176');monitor(x-1.15,z-.85,'#536449');box(x+.02,1.33,z-.42,.7,.26,.52,'#dab67d');box(x+.02,1.48,z-.42,.12,.035,.55,'#f4ddb0');
      box(x-1.5,.64,z+1.35,.65,1,.6,'#92a476');box(x-1.5,1.18,z+1.35,.75,.16,.68,'#c6d2ab');box(x-1.5,.92,z+1.67,.4,.09,.02,'#485f40');
      box(x+1.3,.35,z+1.6,1.45,.15,.7,'#b89a69');box(x+1.3,.68,z+1.6,.8,.53,.65,'#dfbf87');for(let i=0;i<2;i++)cylinder(x+.85+i*.9,.22,z+1.6,.2,.15,'#5e6e55');
    }
  }
  buildElevation=0;
  for(const mountain of layout.mountains)occlude(()=>{
    buildElevation=mountain.baseHeight??elevationAt(layout,mountain.x,mountain.z);
    for(const part of mountainParts(mountain,biome?.id,p))box(part.x,part.y,part.z,part.w,part.h,part.d,part.color);
  });
  function resident(x,z,color,activity,key){const safe=layout.npcSpawns[key];x=safe.x;z=safe.z;const object=person(color,'#dec39b',true);object.position.set(x,.25+elevationAt(layout,x,z),z);root.add(object);npcs.push({object,home:{x,z},activity,timer:1+npcs.length*.17,route:[],phase:npcs.length,random:randomSource(layout.seed+991+npcs.length*71)});}
  for(const village of layout.villages){
    for(const h of village.houses)occlude(()=>{buildElevation=h.baseHeight??elevationAt(layout,h.x,h.z);box(h.x,1.06,h.z,h.w,2.12,h.d,h.color);box(h.x,2.25,h.z,h.w+.35,.35,h.d+.35,'#b47b64');box(h.x,2.6,h.z,h.w*.72,.4,h.d+.15,'#c99072');box(h.x,2.88,h.z,h.w*.4,.2,h.d,'#d3a080');box(h.x,1,h.z+h.d/2+.02,.55,1.4,.05,'#8b9c84');box(h.x-.8,1.3,h.z+h.d/2+.04,.52,.6,.05,'#b6dee0');});
    if(npcs.length<(layout.level.map.npcLimit||8))resident(village.x,village.z,'#d2a878','garden',`village-${layout.villages.indexOf(village)}`);
    // Small stepped plots follow each underlying voxel; no square village carpet.
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){
      const x=village.x-village.w*.36+i*.45,z=village.z+village.d*.32+(j-1.5)*.36;
      if(!onLand(layout,x,z,.4)||waterAt(layout,x,z,.2))continue;
      groundPatch(x,z,.36,.3,'#a58e66');buildElevation=elevationAt(layout,x,z);box(x,.24,z,.18,.22,.18,'#83a866');
    }
  }
  for(const camp of layout.camps){
    buildElevation=camp.tentHeight??elevationAt(layout,camp.x-1,camp.z-.6);
    occlude(()=>{box(camp.x-1,.7,camp.z-.6,2,1.4,1.8,'#e8b878');box(camp.x-1,1.48,camp.z-.6,1.4,.3,1.85,'#efd098');box(camp.x-1,1.72,camp.z-.6,.7,.2,1.8,'#f5d7a5');box(camp.x-1,.56,camp.z+.32,.65,.95,.04,'#947553');});
    buildElevation=camp.fireHeight??elevationAt(layout,camp.x+1.2,camp.z+.7);
    const flame=box(camp.x+1.2,.45,camp.z+.7,.36,.6,.36,'#e8ab5c',root);animated.push({object:flame,type:'fire',base:flame.position.y,seed:rand()*4});
    for(const [dx,dz] of [[.75,.6],[1.65,.6],[1.2,.25],[1.2,1.2]])box(camp.x+dx,.21,camp.z+dz,.3,.28,.3,'#9d9f8c');
    buildElevation=camp.benchHeight??elevationAt(layout,camp.x+.5,camp.z+1.7);box(camp.x+.5,.25,camp.z+1.7,1.7,.35,.35,'#a38a68');if(npcs.length<(layout.level.map.npcLimit||8))resident(camp.x+1.1,camp.z-.7,'#af97b7','camp',`camp-${layout.camps.indexOf(camp)}`);
  }
  for(const reef of layout.reefs||[]){
    buildElevation=0;
    const rock= new THREE.Group();rock.position.set(reef.x,-.35,reef.z);root.add(rock);
    reefObjects.push({object:rock,...reef});
    box(0,reef.height*.35,0,reef.r*1.7,reef.height,reef.r*1.35,'#879c91',rock);
    box(-reef.r*.3,reef.height*.72,reef.r*.12,reef.r*.85,reef.height*.55,reef.r*.7,'#a5b29d',rock);
    mergeRigidGroup(rock);
  }
  layout.trees.forEach(t=>{
    buildElevation=elevationAt(layout,t.x,t.z);
    occlude(()=>{
      const {x,z,scale:s}=t,flora=biome?.flora||'broadleaf';
      function rooted(px,pz,w,d,h,color){
        let low=Infinity,high=-Infinity;
        for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2]){const y=elevationAt(layout,px+dx,pz+dz);low=Math.min(low,y);high=Math.max(high,y);}
        const base=buildElevation;buildElevation=0;const top=Math.max(base+h,high+.3);box(px,(low+top)/2,pz,w,top-low+.06,d,color);buildElevation=base;
      }
      if(flora==='cactus'){
        rooted(x,z,.5*s,.5*s,2.6*s,p.leaf[0]);box(x-.6*s,1.2*s,z,.8*s,.3*s,.3*s,p.leaf[1]);box(x-.9*s,1.6*s,z,.3*s,1.1*s,.3*s,p.leaf[1]);box(x+.5*s,1.8*s,z,.7*s,.3*s,.3*s,p.leaf[2]);box(x,2.7*s,z,.3*s,.2*s,.3*s,p.accent);
      }else if(flora==='crystal'||flora==='basalt'){
        for(let i=0;i<3;i++){const px=x+(i-1)*.5*s,pz=z+(i%2)*.3,h=(1.2+i*.6)*s;buildElevation=elevationAt(layout,px,pz);rooted(px,pz,.48*s,.5*s,h,flora==='crystal'?p.leaf[i]:p.rock[i]);box(px,h+.08,pz,.22*s,.25*s,.24*s,p.accent);}
      }else if(flora==='antenna'){
        rooted(x,z,.8,.8,.6,p.rock[1]);box(x,1.7*s,z,.22,2.8*s,.22,p.trunk);box(x,2.5*s,z,1.6,.13,.2,p.accent);box(x,2.2*s,z,.2,.13,1.6,p.leaf[1]);box(x,3.15*s,z,.4,.3,.4,p.accent);
      }else if(flora==='palm'){
        rooted(x,z,.35*s,.35*s,3*s,p.trunk);for(let i=0;i<4;i++){const a=i*Math.PI/2;box(x+Math.cos(a)*.65*s,2.9*s,z+Math.sin(a)*.65*s,Math.abs(Math.cos(a))>.5?1.6*s:.45*s,.23,Math.abs(Math.sin(a))>.5?1.6*s:.45*s,p.leaf[i]);}box(x+.2,2.7*s,z+.1,.35,.35,.35,'#bc9667');
      }else if(flora==='pine'){
        rooted(x,z,.36*s,.36*s,1.6*s,p.trunk);for(let i=0;i<4;i++){const size=(1.8-i*.36)*s;box(x,(1.3+i*.48)*s,z,size,.65*s,size,p.leaf[i]);}
      }else{
        rooted(x,z,.38*s,.38*s,2.1*s,p.trunk);box(x,2*s,z,1.9*s,1.0*s,1.6*s,p.leaf[0]);box(x-.48*s,2.2*s,z-.3*s,1.2*s,.9*s,1.2*s,p.leaf[1]);box(x+.5*s,2*s,z+.3*s,1.2*s,.9*s,1.2*s,p.leaf[2]);box(x,2.7*s,z,1.2*s,.7*s,1.1*s,p.leaf[3]);
        if(flora==='jungle'){box(x-.7*s,1.3*s,z,.08,1.6*s,.08,p.leaf[1]);box(x+.6*s,1.6*s,z+.4,.08,1.7*s,.08,p.leaf[2]);}
        if(flora==='cloud'){box(x,1.1*s,z,.8,.12,.8,p.accent);box(x,1.4*s,z,.15,1.5,.15,'#e0d2a8');}
      }
      if(['plains','hills'].includes(biome?.id)&&layout.trees.indexOf(t)===0){box(x,3.6*s,z,2.8*s,.13,.15,p.sand);box(x,3.6*s,z,.13,2.8*s,.15,p.sand);}
    });
    if(biome?.id==='cherry'&&animated.filter(a=>a.type==='petal').length<8){const petal=box(t.x+.7,2.4*t.scale,t.z+.4,.14,.035,.13,p.leaf[1],root);animated.push({object:petal,type:'petal',base:petal.position.y,x:t.x+.7,seed:rand()*6});}
  });
  buildElevation=0;
  // Decoration stays in the existing static batch and never enters obstacles.
  // Keep it away from routes, controls, ladder landings and workshop worktops.
  const decoration=[];
  for(let i=0;i<Math.min(220,w*d/13);i++){
    const x=(rand()*2-1)*(w/2-.8),z=(rand()*2-1)*(d/2-.8);
    if(!onLand(layout,x,z,1)||waterAt(layout,x,z,.5)||nearRoad(layout,{x,z},1.35)||layout.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.7&&Math.abs(z-o.z)<o.d/2+.7)||layout.workshops.some(s=>Math.abs(x-s.position[0])<3.8&&Math.abs(z-s.position[1])<4.1)||(layout.ladders||[]).some(l=>[l.top,l.bottom].some(p=>Math.hypot(x-p.x,z-p.z)<1.5)))continue;
    const y=elevationAt(layout,x,z),arid=['cactus','basalt'].includes(biome?.flora),snow=biome?.id==='snow';
    if(i%3===0){
      const s=.7+rand()*.35,leaf=arid?p.trunk:p.leaf?.[0]||'#7ead70',light=snow?'#e6eddf':p.leaf?.[1]||'#9abb83';
      box(x,y+.2*s,z,.85*s,.3*s,.65*s,leaf);box(x-.18*s,y+.34*s,z-.08*s,.42*s,.25*s,.43*s,light);box(x+.28*s,y+.27*s,z+.12*s,.4*s,.22*s,.42*s,p.leaf?.[2]||leaf);
      if(!arid&&!snow){box(x+.13*s,y+.43*s,z+.08*s,.09,.09,.09,p.accent);box(x-.3*s,y+.41*s,z-.12*s,.08,.08,.08,p.accent);}
      decoration.push({x,z,type:'bush',collision:false});
    }else if(i%7===0){box(x,y+.18,z,.65,.32,.5,p.rock[1]);box(x+.16,y+.36,z-.08,.32,.15,.3,p.rock[2]);decoration.push({x,z,type:'pebble',collision:false});}
    else{box(x,y+.18,z,.08,.24,.08,p.leaf?.[2]||'#719b62');box(x,y+.32,z,.22,.12,.22,p.accent);box(x+.12,y+.15,z,.17,.06,.08,p.leaf?.[1]||'#91bb7d');decoration.push({x,z,type:'flower',collision:false});}
  }
  root.userData.decoration=decoration;
  for(const item of [...(layout.exploration||[]),...(layout.wildlife||[])]){
    buildElevation=0;
    const object=item.type==='animal'?createWildlife(item.species,cube):new THREE.Group(),y=elevationAt(layout,item.x,item.z)+(item.type==='animal'?.08+(object.userData.flying?.65:0):.2);
    object.position.set(item.x,y,item.z);root.add(object);let lamp;
    if(item.type==='shard'){
      const shard=box(0,.75,0,.35,.65,.35,p.accent,object);shard.rotation.z=.35;box(0,.75,0,.62,.12,.12,'#fff3c5',object);
    }else if(item.type==='beacon'){
      box(0,.1,0,1,.2,1,p.rock[1],object);box(0,.8,0,.28,1.5,.28,p.rock[3],object);box(0,1.65,0,1.1,.15,1.1,p.accent,object);lamp=box(0,2,0,.5,.6,.5,'#a0adb3',object);box(0,2.4,0,.8,.13,.8,p.accent,object);
    }
    const hit=new THREE.Mesh(new THREE.BoxGeometry(1.3,item.type==='beacon'?2.7:1.8,1.3),hitMaterial);hit.position.y=.85;hit.userData.discovery=item.id;object.add(hit);hitTargets.push(hit);
    const entry={...item,object,lamp,base:y,home:{x:item.x,z:item.z}};
    discoveries.push(entry);if(item.type==='animal')wildlife.push(entry);
  }
  const list=[...batches].flatMap(([color,items])=>items.map(item=>[color,...item])),staticBoxes=batchStaticBoxes(list,cube),staticLists=[];
  if(staticBoxes){root.add(staticBoxes.mesh);staticLists.push(staticBoxes.viewList);}
  if(surfacePositions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surfacePositions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(surfaceColors,3));geometry.computeVertexNormals();const paving=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));paving.receiveShadow=true;paving.userData.groundSurface=true;root.add(paving);}
  root.updateMatrixWorld(true);occluders.forEach(o=>o.sphere=new THREE.Box3().setFromObject(o.group).getBoundingSphere(new THREE.Sphere()));
  const signBatch=signs.build(root,occluders),sceneryBatch=batchOccluders(occluders,root),residentBatch=batchResidents(npcs,root);
  const dynamicProps=new Set([...discoveries.filter(d=>d.type==='animal'||d.type==='shard').map(d=>d.object),...animated.map(a=>a.object)]);
  const allProps=new Set([...reefObjects.map(r=>r.object),...discoveries.map(d=>d.object),...beacons.map(b=>b.object),...animated.map(a=>a.object),...root.children.filter(o=>o.isMesh&&!o.isInstancedMesh&&o.geometry.type==='CylinderGeometry')]);
  const propsBatch=batchIslandProps([...dynamicProps],[...allProps].filter(o=>!dynamicProps.has(o)),root);
  if(propsBatch.staticViewList)staticLists.push(propsBatch.staticViewList);
  const groundSurfaces=root.children.filter(mesh=>mesh.userData.terrain||mesh.userData.groundSurface),groundPicker=createGroundPicker(root,groundSurfaces);
  for(const mesh of groundSurfaces)staticLists.push(spatialDrawList(mesh));
  if(sceneryBatch.viewList)staticLists.push(sceneryBatch.viewList);
  const view=createIslandView(root,{staticLists,overlayLists:[signBatch.viewList].filter(Boolean),npcs,props:propsBatch.dynamicSources||[],dynamicLists:[residentBatch.viewList,propsBatch.viewList].filter(Boolean)});
  // The renderer can skip the complete rig subtree. Direct hit-target rays and
  // explicit animation updates still work; no per-frame traversal of the rigs.
  const logic=new THREE.Group();logic.visible=false;logic.userData.logicOnly=true;root.add(logic);
  for(const object of new Set([...npcs.map(n=>n.object),...(propsBatch.sources||[]),...root.children.filter(o=>o.isGroup&&o.userData.station),...hitTargets.filter(o=>o.parent===root)]))logic.attach(object);
  // Bake lazily: opening an island with shadows off does no shadow sampling.
  let baked=null;const bakedShadows={setEnabled(enabled){if(enabled&&!baked)baked=bakeIslandShadows(root,layout,shadowCasters);baked?.setEnabled(enabled);},get samples(){return baked?.samples||0;}};
  installVoxelLighting(root);
  freezeStaticMeshes(root);animated.forEach(a=>a.object.matrixAutoUpdate=true);discoveries.forEach(d=>d.object.matrixAutoUpdate=true);
  npcs.forEach(n=>n.object.traverse(o=>{if(o.isGroup)o.matrixAutoUpdate=true;}));
  return {root,layout,fences,lamps,npcs,animated,beacons,hitTargets,groundPicker,occluders,reefObjects,discoveries,groundReceivers,dynamicDiscoveries:discoveries.filter(d=>d.type==='animal'||d.type==='shard'),wildlife,sceneryBatch,residentBatch,signBatch,propsBatch,bakedShadows,view};
}
