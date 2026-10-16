// Architecture, ground collisions and label anchors share the same small recipe.
// Recipes are built once per workshop; they add no animation or per-frame work.
export const workshopDesigns = {
  market:'条纹集市', tent:'旅人帐篷', cabin:'木屋', boathouse:'船屋',
  greenhouse:'玻璃花房', observatory:'观测亭', library:'图书屋', studio:'工作室',
  caravan:'旅行书车', pagoda:'风铃廊亭', ruins:'遗迹拱门', windmill:'风车工坊',
  signal:'信号驿站', arcade:'霓虹机房', mushroom:'蘑菇小铺', origami:'折纸工棚'
};

const softwareStyles = {
  paint:['studio','greenhouse','origami','mushroom'],
  pdf:['library','caravan','cabin','ruins'],
  browser:['observatory','signal','arcade','boathouse','caravan'],
  document:['library','studio','caravan','pagoda'],
  sheet:['windmill','signal','studio','greenhouse'],
  presentation:['origami','observatory','arcade','pagoda'],
  files:['cabin','caravan','arcade','market'],
  mail:['caravan','signal','boathouse','pagoda'],
  calendar:['pagoda','windmill','mushroom','library'],
  settings:['arcade','signal','windmill','studio']
};
const outdoorStyles=['market','tent','cabin','boathouse','greenhouse','observatory','pagoda','ruins','windmill','mushroom','origami'];

export function workshopApplication(kinds){
  for(const kind of kinds){
    const family=kind.split('-')[0];
    if(softwareStyles[family])return family;
  }
}

export function chooseWorkshopDesign(application,nearby,random){
  const pool=softwareStyles[application]||outdoorStyles;
  const unused=pool.filter(style=>!nearby.some(workshop=>workshop.design===style));
  const choices=unused.length?unused:pool;
  return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
}

const architectureCache=new WeakMap();
export function workshopArchitecture(workshop){
  if(architectureCache.has(workshop))return architectureCache.get(workshop);
  const style=Object.hasOwn(workshopDesigns,workshop.design)?workshop.design:'market';
  const color=workshop.color||'#729b8b',pale=workshop.pale||'#e6e9cb',wood='#c5996e',cream='#f4e5c7';
  const parts=[],obstacles=[];
  function box(x,y,z,w,h,d,color,solid=false){
    parts.push({x,y,z,w,h,d,color});
    if(solid)obstacles.push({x,z,w,d,type:'wall'});
  }
  function post(x,z,height,col=cream,width=.2){box(x,.25+height/2,z,width,height,width,col,true);}
  function backWall(col=color){box(0,.69,-2.45,5.65,1.2,.17,col,true);box(0,1.31,-2.45,5.8,.1,.25,pale);}
  function sideRail(){box(-2.7,.44,0,.17,.74,5,color,true);box(-2.7,.85,0,.24,.1,5.15,pale);}
  if(['market','tent','cabin','boathouse','greenhouse','observatory','library','studio'].includes(style)){
    backWall();sideRail();
  }
  if(style==='market'){
    post(-2.5,-2.45,2.55);post(2.5,-2.45,2.55);
    for(let i=0;i<8;i++)box(-2.45+i*.7,2.76,-1.97,.7,.24,.9,i%2?pale:color);
  }else if(style==='tent'){
    for(let i=0;i<4;i++)box(0,2.05+i*.3,-1.95,5.6-i*1.2,.34,1.7,['#d3a174','#e4b889','#f2cd9a','#ffe0ac'][i]);
    post(-2.6,-1.55,1.95,'#8a735b',.1);post(2.6,-1.55,1.95,'#8a735b',.1);
  }else if(style==='cabin'||style==='boathouse'){
    for(let i=0;i<4;i++)box(0,1.65+i*.27,-2.45,5.65,.18,.26,wood);
    for(let i=0;i<3;i++)box(0,2.65+i*.27,-2.2,6.1-i*1.25,.32,1.5,style==='boathouse'?'#709caa':'#b77c63');
    if(style==='boathouse'){post(-2.3,-2.15,2.2,'#e4d4a9',.13);box(-2.3,2.35,-2.13,.5,.14,.18,'#e4d4a9');}
  }else if(style==='greenhouse'){
    box(0,2,-2.45,5.6,1.4,.15,'#b4d8c4');
    for(let i=0;i<5;i++)box(-2.4+i*1.2,2,-2.35,.07,1.6,.08,'#f2efd6');
    box(0,2.85,-2.05,5.9,.2,1.4,'#a5c2ab');post(-2.6,-1.65,2.55,'#f2efd6',.08);post(2.6,-1.65,2.55,'#f2efd6',.08);
  }else if(style==='observatory'){
    box(0,2.7,-2.15,5.8,.25,1.7,'#879db9');box(0,3.01,-2.15,3.8,.36,1.5,'#a9bace');box(0,3.32,-2.15,2,.3,1.2,'#cad6df');
    box(1.5,2.2,-2.15,.25,.4,.8,'#56728a');box(1.5,2.42,-1.95,.5,.2,1,'#7295ae');
  }else if(style==='library'){
    box(0,2.15,-2.45,5.6,1.4,.2,'#b89d78');for(let i=0;i<11;i++)box(-2.35+i*.45,2.1,-2.25,.3,.75,.22,['#8ca69a','#cfb372','#ba9297'][i%3]);
    box(0,2.75,-2.05,5.9,.2,1.5,'#7f9a86');
  }else if(style==='studio'){
    box(0,2.05,-2.45,5.6,1.4,.2,'#bfd1d6');box(0,2.88,-2.05,6,.23,1.6,'#658998');
    for(let i=0;i<3;i++)box(-1.8+i*1.8,2.05,-2.32,1.3,.85,.05,['#f0cc84','#9ac6b2','#c5b3d8'][i]);
  }else if(style==='caravan'){
    // A raised bookmobile: wheels, open serving hatch and a one-sided awning.
    box(-.25,1.52,-2.3,4.95,1.92,1.45,'#b6c8ab',true);box(-.25,2.57,-2.3,5.2,.2,1.65,cream);
    for(const x of [-1.9,1.4]){box(x,.53,-1.57,.6,.65,.23,'#4b5e5b');box(x,.53,-1.43,.29,.3,.06,'#c5be97');}
    box(-.25,1.9,-1.555,3.65,.91,.07,'#526964');
    for(let i=0;i<7;i++)box(-1.72+i*.49,1.88,-1.49,.3,.58,.1,['#d9b574','#b1c7c9','#cf9a83'][i%3]);
    for(let i=0;i<6;i++)box(-2.2+i*.78,2.74,-1.62,.78,.16,1.25,i%2?pale:color);
    box(2.57,.69,-2.3,.58,.16,.18,'#7c8875');
  }else if(style==='pagoda'){
    // Open pavilion with two tiers of overhanging, lifted eaves.
    for(const x of [-2.42,2.42])post(x,-2.3,2.55,'#b77f6b',.22);
    box(0,2.7,-2.15,5.8,.22,1.9,'#789a91');box(0,2.98,-2.15,4.5,.34,1.5,'#8cb2a0');box(0,3.23,-2.15,2.9,.2,1.1,'#abc5a5');
    for(const x of [-2.77,2.77]){box(x,2.9,-2.15,.4,.22,1.9,'#789a91');box(x,2.17,-1.82,.12,.55,.12,wood);box(x,1.85,-1.82,.37,.43,.37,'#f0ca83');}
  }else if(style==='ruins'){
    // A broken stone portal, with an uneven crown and moss on its shoulders.
    for(const x of [-2.35,2.35]){
      box(x,1.35,-2.35,.8,2.2,.95,'#aeb4a2',true);box(x,2.5,-2.35,1.22,.25,1.05,'#c8c9b4');
      box(x*.72,2.82,-2.35,1.3,.38,1,'#b9beaa');box(x,2.7,-2.28,.7,.14,.8,'#91ad79');
    }
    box(0,3.12,-2.35,2.5,.4,.95,'#d1ccb4');box(-.65,3.48,-2.35,.7,.32,.8,'#b5bca7');
    box(2.7,.47,-1.46,.65,.38,.7,'#c4c6b0',true);
  }else if(style==='windmill'){
    // Asymmetric mill tower; the four voxel sails are deliberately static.
    box(-2.1,1.55,-2.42,1.08,2.6,1.12,'#e2c79b',true);box(-2.1,2.98,-2.42,1.42,.3,1.4,'#a47c69');box(-2.1,3.22,-2.42,.85,.25,.95,'#bd9580');
    box(-2.1,2.5,-1.79,.22,2.1,.12,cream);box(-2.1,2.5,-1.78,2.1,.22,.12,cream);box(-2.1,2.5,-1.68,.38,.38,.17,'#947b5f');
    post(2.48,-2.4,2.4,wood);box(.67,2.64,-2.13,3.85,.22,1.7,'#87a391');box(1.1,2.87,-2.13,2.9,.24,1.5,'#aec0a0');
    box(.45,1.24,-2.48,3.6,.17,.3,wood);
  }else if(style==='signal'){
    // A low console under two staggered antenna masts and a stepped gantry.
    for(const [x,height] of [[-2.5,3.28],[2.5,2.7]]){
      post(x,-2.43,height,'#718d98',.23);box(x,height+.2,-2.43,.52,.16,.52,'#d3e5d5');box(x,height+.43,-2.43,.12,.45,.12,'#829eaa');
    }
    box(0,2.64,-2.35,4.85,.18,.55,'#718d98');box(.4,2.85,-2.35,2.5,.25,.8,'#a2bec0');
    box(0,1.85,-2.43,3.8,.85,.27,'#425b67');for(let i=0;i<4;i++)box(-1.4+i*.94,1.88,-2.27,.58,.38,.06,i%2?'#e0cf92':'#a6deca');
  }else if(style==='arcade'){
    // A thick neon portal and an offset server cabinet, rather than a roof.
    for(const x of [-2.55,2.55]){post(x,-2.38,2.75,'#59647f',.45);box(x,1.9,-2.13,.13,2.15,.055,'#a4dace');}
    box(0,3.08,-2.38,5.55,.4,.8,'#59647f');box(0,3.3,-2.38,3.8,.17,.65,'#8094b3');box(0,3.05,-1.96,4.7,.1,.04,'#c7a9df');
    box(-2.03,1.05,-2.36,.54,1.6,.65,'#79809a',true);for(let i=0;i<3;i++)box(-2.03,.7+i*.36,-2.02,.32,.12,.025,'#a6deca');
  }else if(style==='mushroom'){
    // A broad terraced cap on a central stalk, open on both sides.
    box(-.45,1.38,-2.45,.9,2.25,.9,'#ead7b4',true);box(-.45,2.63,-2.2,5.7,.28,1.85,'#ba877e');box(-.45,2.96,-2.2,4.55,.38,1.6,'#d79e8c');box(-.45,3.25,-2.2,2.95,.25,1.3,'#e4b39b');
    for(const [x,y]of [[-1.75,3.2],[.5,3.43],[1.18,3.2]])box(x,y,-1.95,.48,.09,.45,'#f8e2bd');
    box(2.35,.63,-2.25,.75,.75,.8,'#a4ba83',true);box(2.35,1.08,-2.25,.88,.13,.9,'#d2d5aa');
  }else if(style==='origami'){
    // Folded sawtooth canopy: alternating heights give it a different skyline.
    for(const [x,height]of [[-2.55,2.55],[2.55,2.2]])post(x,-2.35,height,'#998976',.15);
    for(let i=0;i<7;i++){
      const x=-2.4+i*.8,y=2.63+(i%2)*.34;
      box(x,y,-2.15,.82,.18,1.9,i%2?cream:color);box(x,y+.105,-1.24,.82,.05,.1,pale);
      if(i<6)box(x+.4,2.8,-2.15,.07,.4,1.9,pale);
    }
    box(-2.1,1.15,-2.45,1.05,1.7,.22,'#baa585',true);box(-2.1,1.56,-2.3,.78,.8,.04,pale);
  }

  // Keep the complete face above every roof/tower. Checking just the centre
  // lets high eaves slice through the bottom line of text in the main view.
  const roofTop=Math.max(...parts.map(p=>p.y+p.h/2)),width=3.8;
  const sign={x:0,y:Math.max(3,roofTop)+.68,z:-1.05,width};
  const bottom=sign.y-width/8;
  for(const x of [-2.04,2.04])box(x,(bottom+.25)/2,sign.z-.11,.1,bottom-.25,.1,cream,true);
  box(0,bottom-.06,sign.z-.035,4.12,.1,.17,cream);
  const architecture={style,parts,obstacles,sign,marker:{x:sign.x,y:sign.y+width/8,z:sign.z,halfWidth:width/2},roofTop};
  architectureCache.set(workshop,architecture);return architecture;
}
