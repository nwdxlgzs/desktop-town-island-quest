import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { exposedBoxGeometry } from './box-surfaces.js';

// Distinct silhouettes, one indexed coloured mesh per creature. No skeleton,
// textures or per-part draws; feet rest at local y=0, forward is always +z.
export function createWildlife(species,cube,surface=exposedBoxGeometry){
  const pieces=[],boxes=[],matrix=new THREE.Matrix4(),color=new THREE.Color(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1);
  function box(x,y,z,w,h,d,tint,tilt=0){
    matrix.compose(position.set(x,y,z),rotation.setFromAxisAngle(axis,tilt),scale.set(w,h,d));
    boxes.push({geometry:cube,position:position.clone(),scale:scale.clone(),rotation:{x:0,y:0,z:tilt},material:{transparent:false},matrix:matrix.clone(),tint});
  }
  const eye='#263c40',cream='#fff0d5',flying=['小鸟','鹦鹉','萤火虫','蝙蝠','维修无人机'].includes(species);
  const eyes=(x,y,z)=>{for(const side of [-1,1])box(side*x,y,z,.065,.075,.035,eye);};
  const legs=(x,z,tint)=>{for(const side of [-1,1])for(const end of [-1,1])box(side*x,.12,end*z,.14,.24,.17,tint);};
  if(species==='企鹅'){
    const dark='#344c60',belly='#f4f5dd',orange='#e4b35d';
    box(0,.55,0,.57,.86,.48,dark);box(0,.64,.247,.4,.64,.055,belly);
    box(0,1.06,.02,.48,.42,.44,dark);box(0,1.01,.251,.35,.23,.045,belly);
    eyes(.115,1.12,.286);box(0,.985,.34,.17,.095,.16,orange);
    for(const side of [-1,1]){box(side*.36,.64,-.015,.13,.56,.26,dark,side*.2);box(side*.165,.06,.12,.23,.12,.38,orange);}
    box(0,.29,-.29,.24,.18,.2,dark);
  }else if(/兔/.test(species)){
    const tint=species==='雪兔'?'#f3f6ed':species==='云兔'?'#d9edf0':'#e5cfb1',inner=species==='雪兔'?'#b9c6c6':'#e2aaa4';
    box(0,.39,-.08,.53,.5,.64,tint);box(0,.68,.27,.43,.43,.39,tint);
    for(const side of [-1,1]){box(side*.13,1.12,.25,.14,.55,.17,tint);box(side*.13,1.13,.343,.07,.39,.02,inner);box(side*.21,.11,-.22,.24,.22,.34,tint);box(side*.16,.08,.29,.15,.16,.27,cream);}
    eyes(.115,.74,.478);box(0,.62,.49,.09,.07,.055,'#b88786');box(0,.46,-.45,.24,.24,.22,cream);
  }else if(/狐/.test(species)){
    const tint=species==='沙狐'?'#d8bd88':'#cf8a53',dark='#845d42';
    box(0,.43,-.04,.43,.41,.74,tint);box(0,.7,.37,.4,.38,.37,tint);
    legs(.17,.25,dark);box(0,.62,.59,.29,.16,.25,cream);box(0,.65,.73,.11,.08,.06,eye);eyes(.12,.77,.57);
    for(const side of [-1,1]){box(side*.14,.97,.35,.2,.2,.2,tint);box(side*.14,1.1,.35,.11,.1,.13,tint);box(side*.14,.98,.458,.09,.1,.02,'#edc6a9');}
    box(0,.38,-.63,.33,.3,.57,tint);box(0,.43,-.94,.3,.25,.21,cream);
  }else if(species==='绵羊'){
    legs(.24,.29,'#686652');box(0,.56,-.05,.7,.63,.84,'#eee8cd');box(0,.85,-.06,.57,.16,.65,'#fff8df');
    box(0,.62,.49,.34,.34,.35,'#7d7a63');box(0,.82,.42,.39,.13,.3,'#fff8df');eyes(.105,.65,.68);
    for(const side of [-1,1])box(side*.25,.72,.46,.2,.12,.16,'#aaa48b');box(0,.61,-.54,.23,.2,.2,'#fff8df');
  }else if(species==='猴子'){
    const tint='#ad815c',face='#e5c69a';
    box(0,.55,0,.43,.55,.4,tint);box(0,.99,.04,.43,.43,.39,tint);box(0,.96,.25,.32,.3,.05,face);eyes(.105,1.02,.286);
    for(const side of [-1,1]){box(side*.28,1.0,.04,.16,.2,.15,face);box(side*.3,.5,.03,.13,.5,.15,tint);box(side*.16,.15,.01,.16,.3,.2,tint);box(side*.16,.06,.13,.19,.12,.29,face);}
    box(0,.43,-.42,.12,.12,.48,tint);box(0,.63,-.63,.12,.45,.12,tint);box(0,.83,-.54,.12,.12,.25,tint);
  }else if(/蟹/.test(species)){
    const tint=species==='岩蟹'?'#a18b79':'#d98760',claw=species==='岩蟹'?'#c7b49a':'#e5a97a';
    box(0,.3,0,.68,.33,.48,tint);box(0,.5,-.03,.5,.09,.36,claw);
    for(const side of [-1,1]){for(const z of [-.25,0,.25]){box(side*.45,.15,z,.3,.1,.1,tint);box(side*.59,.085,z+.035,.1,.17,.13,tint);}
      box(side*.17,.57,.17,.075,.23,.08,tint);box(side*.17,.68,.19,.11,.1,.09,eye);
      box(side*.46,.34,.36,.28,.12,.26,tint);box(side*.56,.46,.51,.24,.24,.23,claw);box(side*.56,.59,.57,.08,.12,.12,tint);}
  }else if(/蜥蜴/.test(species)){
    const tint=species==='火蜥蜴'?'#b7604a':'#689579',accent=species==='火蜥蜴'?'#edb95b':'#a7be77';
    box(0,.25,-.03,.39,.27,.73,tint);box(0,.3,.47,.34,.25,.42,tint);eyes(.11,.39,.692);
    for(const side of [-1,1])for(const z of [-.27,.24]){box(side*.28,.14,z,.28,.1,.15,tint);box(side*.39,.05,z+.055,.18,.1,.2,accent);}
    box(0,.21,-.62,.22,.18,.48,tint);box(0,.17,-.98,.12,.12,.3,tint);for(const z of [-.18,.04,.26])box(0,.405,z,.12,.065,.09,accent);
  }else if(species==='海龟'){
    const shell='#648f77',skin='#a4b583';
    box(0,.28,0,.74,.35,.86,shell);box(0,.48,-.02,.57,.16,.63,'#82a78a');box(0,.14,0,.69,.12,.8,'#d5ca91');
    box(0,.24,.45,.22,.18,.24,skin);box(0,.24,.64,.31,.23,.35,skin);eyes(.095,.3,.825);
    for(const side of [-1,1])for(const z of [-.28,.28])box(side*.45,.07,z,.32,.14,.25,skin);box(0,.16,-.51,.13,.1,.23,skin);
  }else if(species==='巡逻机器人'){
    const shell='#9aadc1',joint='#4e6575';
    box(0,.69,0,.52,.5,.4,shell);box(0,1.05,0,.55,.32,.43,'#bdceda');box(0,1.06,.229,.44,.17,.04,'#69c9c5');eyes(.13,1.08,.26);
    for(const side of [-1,1]){box(side*.36,.64,0,.14,.48,.18,joint);box(side*.16,.25,0,.17,.38,.21,joint);box(side*.16,.07,.1,.24,.14,.34,shell);}
    box(0,.69,.218,.2,.13,.035,'#e8bf6a');box(0,1.3,0,.055,.2,.055,joint);box(0,1.41,0,.12,.07,.12,'#6cdbbc');
  }else if(species==='维修无人机'){
    box(0,.55,0,.46,.25,.44,'#b7c7d3');box(0,.54,.25,.23,.14,.08,'#65b9bd');eyes(.065,.56,.301);
    for(const x of [-.41,.41])for(const z of [-.36,.36]){box(x/2,.64,z/2,.5,.06,.12,'#667f95');box(x,.71,z,.24,.08,.24,'#7c96a9');box(x,.77,z,.42,.035,.09,'#b3d7d8');}
    for(const x of [-.22,.22])box(x,.32,0,.07,.25,.53,'#667f95');
  }else if(species==='蝙蝠'){
    const tint='#776783';box(0,.48,0,.24,.4,.24,tint);box(0,.73,.04,.27,.23,.24,tint);eyes(.075,.75,.18);
    for(const side of [-1,1]){box(side*.09,.89,.02,.09,.16,.11,tint);box(side*.27,.57,-.04,.34,.08,.56,'#9985aa');box(side*.53,.57,-.11,.2,.075,.42,tint);box(side*.71,.57,-.18,.18,.06,.28,'#9985aa');box(side*.85,.57,-.245,.11,.05,.15,tint);}
  }else if(species==='萤火虫'){
    box(0,.4,-.12,.25,.25,.32,'#ead16c');box(0,.48,.12,.2,.2,.22,'#657c59');eyes(.055,.51,.247);
    for(const side of [-1,1]){box(side*.24,.51,-.01,.32,.045,.25,'#d3e8c1',side*.13);box(side*.07,.68,.15,.035,.22,.035,'#657c59');}
  }else{
    const parrot=species==='鹦鹉',tint=parrot?'#58a790':'#8baec6';
    box(0,.42,0,.3,.34,.42,tint);box(0,.68,.19,.3,.27,.3,tint);box(0,.69,.41,.16,.1,.17,'#dbaf58');eyes(.085,.73,.352);
    for(const side of [-1,1]){box(side*.32,.46,-.02,.43,.07,.3,parrot?'#7db66a':'#c0d2d9',side*.13);box(side*.09,.18,.06,.055,.16,.07,'#b59361');}
    box(0,.4,parrot?-.39:-.34,.2,.11,parrot?.48:.29,parrot?'#cc9a66':'#6e91ad');if(parrot)box(0,.86,.16,.1,.13,.14,'#dac36a');
  }
  for(const source of boxes){
    const g=surface(source,boxes).applyMatrix4(source.matrix),colors=new Float32Array(g.attributes.position.count*3);color.set(source.tint);
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(g);
  }
  const object=new THREE.Group(),geometry=mergeGeometries(pieces),material=new THREE.MeshLambertMaterial({vertexColors:true});material.userData.owned=true;
  pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;object.add(mesh);
  object.userData.flying=flying;object.userData.species=species;return object;
}
