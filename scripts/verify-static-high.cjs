const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One fixed 22x22 scene, short movement and one reduced-motion voyage.
// Check actual map size/filter, visible shadows and refresh counts, not FPS.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:720,height:520},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__static-high.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100%;height:100%;display:block}</style><div id="world-container" style="width:720px;height:520px"></div>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__static-high.html');
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js'),{harbourBerth}=await import('/src/voyage.js');
      const environment={id:'noon',name:'晴朗午后',sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:false};
      const radii=Array(32).fill(1),layout={seed:7,width:22,depth:22,shoreline:{radii,points:radii.map((r,i)=>({x:Math.cos(i/32*Math.PI*2)*r*11,z:Math.sin(i/32*Math.PI*2)*r*11}))},bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},shoreX:10,dock:{x:9,z:-5},spawn:{x:0,z:0},level:{id:'static-high-fixture',environment,map:{npcLimit:8},npc:{radius:2.6,speed:.65}},workshops:[],roads:[],ladders:[],terraces:[],mountains:[],villages:[],camps:[{x:-5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0}],npcSpawns:{'camp-0':{x:-3,z:-3}},reefs:[],trees:[{x:2,z:2,scale:1.5}],obstacles:[],exploration:[],wildlife:[{id:'rabbit',type:'animal',species:'兔子',name:'兔子',x:-2,z:3,phase:.1}]};
      layout.boat=harbourBerth(layout);window.fixture=layout;window.paused=true;
      window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},onTravelState(){}});world.toggleOverview();
    });
    await page.waitForFunction(()=>world.getDebugSnapshot().shadowBakes>0);
    const initial=await page.evaluate(()=>world.getDebugSnapshot());
    assert.equal(initial.quality.shadowQuality,'baked-high');assert.deepEqual(initial.shadowMap,{size:1024,soft:true,fixed:true});assert.equal(initial.quality.contactShadows,true);assert.equal(initial.bakedSamples,0,'the CPU vertex bake is not also applied');
    const pixels=await page.evaluate(async()=>{
      async function rgba(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const settings=world.getQuality().settings,withShadow=await rgba(world.capture());
      world.setQuality({...settings,shadowQuality:'off'});const off=await rgba(world.capture());
      world.setQuality(settings);world.capture();let darker=0;
      for(let i=0;i<off.length;i+=4)if(off[i]+off[i+1]+off[i+2]-withShadow[i]-withShadow[i+1]-withShadow[i+2]>20)darker++;
      return darker;
    });assert.ok(pixels>200,'1024 projection must actually darken scene pixels');
    const before=await page.evaluate(()=>{paused=false;return world.getDebugSnapshot();});
    await page.locator('canvas').focus();await page.keyboard.down('ArrowDown');await page.keyboard.press('Space');await page.waitForTimeout(850);await page.keyboard.up('ArrowDown');
    const moving=await page.evaluate(()=>{paused=true;return world.getDebugSnapshot();});
    assert.ok(moving.npcSimSteps>before.npcSimSteps&&moving.animalSimSteps>before.animalSimSteps);assert.ok(moving.contactShadows.updates>before.contactShadows.updates);assert.equal(moving.shadowBakes,before.shadowBakes,'walking, jumping and roaming do not rebake projections');assert.equal(moving.staticCache.patches,before.staticCache.patches);
    await page.evaluate(()=>{paused=false;});await page.mouse.move(300,250);await page.mouse.down({button:'right'});await page.mouse.move(530,250,{steps:4});await page.waitForTimeout(200);await page.mouse.up({button:'right'});await page.waitForTimeout(550);
    assert.equal(await page.evaluate(()=>world.getDebugSnapshot().shadowBakes),moving.shadowBakes,'orbiting and returning preserve the baked projection');
    await page.evaluate(()=>{world.setQuality({...world.getQuality().settings,shadowQuality:'high'});});
    const dynamic=await page.evaluate(()=>world.getDebugSnapshot().shadowBakes);await page.keyboard.down('ArrowRight');await page.waitForTimeout(700);await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(()=>world.getDebugSnapshot().shadowBakes)>dynamic,'the existing dynamic tier still follows movement');
    await page.evaluate(()=>{world.setQuality({...world.getQuality().settings,shadowQuality:'baked-high'});world.capture();});
    const fixedAgain=await page.evaluate(()=>world.getDebugSnapshot().shadowBakes);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>world.getDebugSnapshot().shadowBakes),fixedAgain);
    await page.evaluate(()=>{
      const next=structuredClone(fixture);next.level.id='static-high-arrival';next.level.environment={...next.level.environment,id:'morning',sun:[-20,24,10]};next.spawn={...next.dock};
      if(!world.travelTo(next,()=>window.arrived=true))throw Error('Voyage did not start');
    });await page.waitForFunction(()=>window.arrived,{},{timeout:5000});await page.waitForTimeout(2800);
    const arrival=await page.evaluate(()=>world.getDebugSnapshot());assert.equal(arrival.islandCount,1);assert.equal(arrival.environment.id,'morning');assert.deepEqual(arrival.shadowMap,{size:1024,soft:true,fixed:true});assert.ok(arrival.shadowBakes>fixedAgain);
    await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>world.getDebugSnapshot().shadowBakes),arrival.shadowBakes,'arrival light settles to a fixed projection');
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/static-high-shadows.png'});await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);
    console.log(JSON.stringify({shadowMap:initial.shadowMap,shadowPixels:pixels,movementRebakes:moving.shadowBakes-before.shadowBakes,contactUpdates:moving.contactShadows.updates-before.contactShadows.updates,orbitRebakes:0,dynamicSwitch:true,arrivalRebakes:arrival.shadowBakes-fixedAgain,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
