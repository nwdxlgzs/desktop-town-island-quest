const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');

// One fixed small island, 1.2 seconds of active movement. Sampling shows CPU
// stacks/work counts, not a claim about FPS on the classroom's hardware.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:720,height:500}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2000));});
    await page.route('**/__frame-cost.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100%;height:100%;display:block}</style><div id="world-container" style="width:720px;height:500px"></div>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__frame-cost.html');
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js');
      const environment={id:'rain',name:'细雨',sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:true};
      const layout={seed:7,width:22,depth:22,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},shoreX:10,dock:{x:9,z:-5},boat:{x:12,z:-5},spawn:{x:0,z:0},level:{id:'cost-fixture',environment,map:{npcLimit:8},npc:{radius:2.6,speed:.65}},workshops:[],roads:[],ladders:[],terraces:[],mountains:[],villages:[],camps:[{x:-5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0},{x:5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0}],npcSpawns:{'camp-0':{x:-3,z:-3},'camp-1':{x:3,z:-3}},reefs:[],trees:[{x:1.2,z:2,scale:1.5}],obstacles:[],exploration:[{id:'shard',type:'shard',name:'星图碎片',x:4,z:4}],wildlife:[{id:'rabbit',type:'animal',species:'兔子',name:'兔子',x:-2,z:3,phase:.1},{id:'bird',type:'animal',species:'小鸟',name:'小鸟',x:2,z:3,phase:.4}]};
      window.costLayout=layout;window.paused=false;window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},onTravelState(){},qualitySettings:{resolution:'1.5',antialias:'off',maxFps:30,adaptive:false,shadowQuality:'baked-contact',waves:true,weather:true,npcMovement:true}});world.toggleOverview();
    });
    await page.waitForTimeout(250);await page.locator('canvas').focus();
    const client=await page.context().newCDPSession(page);await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:500});
    const before=await page.evaluate(()=>world.getDebugSnapshot());await client.send('Profiler.start');await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1200);await page.keyboard.up('ArrowDown');const {profile}=await client.send('Profiler.stop');await client.send('Profiler.disable');
    const after=await page.evaluate(()=>{paused=true;return world.getDebugSnapshot();});
    const nodes=new Map(profile.nodes.map(n=>[n.id,n])),cost=new Map();
    for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),f=n.callFrame,key=(f.functionName||'(anonymous)')+' '+f.url.replace(/^http:\/\/[^/]+/,'')+':'+(f.lineNumber+1);cost.set(key,(cost.get(key)||0)+profile.timeDeltas[i]);}
    const report={frames:after.renderCount-before.renderCount,quality:after.quality,drawCalls:after.drawCalls,triangles:after.triangles,npcSteps:after.npcSimSteps-before.npcSimSteps,animalSteps:after.animalSimSteps-before.animalSimSteps,propUploads:after.propUpdates-before.propUpdates,contacts:after.contactShadows,weatherUploads:after.weatherUploads-before.weatherUploads,cameraUpdates:after.cameraUpdates-before.cameraUpdates,terrainOcclusionSamples:after.terrainOcclusionSamples-before.terrainOcclusionSamples,shadowRefreshes:after.shadowRefreshes-before.shadowRefreshes,captures:after.staticCache.captures-before.staticCache.captures,cacheHits:after.staticCache.hits-before.staticCache.hits,cpuSamplesMs:[...cost].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,us])=>({name,ms:Math.round(us/100)/10})),errors};
    report.shadowModes=await page.evaluate(async()=>{
      async function pixels(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const settings=world.getQuality().settings,combined=await pixels(world.capture()),withContacts=world.getDebugSnapshot();
      world.setQuality({...settings,shadowQuality:'baked'});const baked=await pixels(world.capture()),onlyBaked=world.getDebugSnapshot();
      world.setQuality({...settings,shadowQuality:'off'});const off=await pixels(world.capture());let contactPixels=0,bakedPixels=0;
      for(let i=0;i<off.length;i+=4){if(baked[i]+baked[i+1]+baked[i+2]-combined[i]-combined[i+1]-combined[i+2]>5)contactPixels++;if(off[i]+off[i+1]+off[i+2]-baked[i]-baked[i+1]-baked[i+2]>20)bakedPixels++;}
      world.setQuality(settings);world.capture();return {extraContactDraws:withContacts.drawCalls-onlyBaked.drawCalls,contactPixels,bakedPixels,shadowRefreshes:world.getDebugSnapshot().shadowRefreshes};
    });
    assert.equal(report.quality.npcMovement,true);assert.ok(report.npcSteps>0&&report.animalSteps>0);assert.equal(report.shadowRefreshes,0);assert.equal(report.weatherUploads,0);assert.equal(report.cameraUpdates,0);assert.equal(report.terrainOcclusionSamples,0);assert.deepEqual(errors,[]);
    assert.equal(report.shadowModes.extraContactDraws,1);assert.ok(report.shadowModes.contactPixels>15);assert.ok(report.shadowModes.bakedPixels>200);assert.equal(report.shadowModes.shadowRefreshes,0);
    await fs.mkdir('test-results',{recursive:true});const suffix=process.env.PASS||'after';await page.screenshot({path:'test-results/frame-cost-'+suffix+'.png'});await page.evaluate(()=>world.dispose());
    // Reuse the two small fixed layouts, with the normal reduced-motion voyage
    // duration. Verify the new player shader and baked contacts across travel.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js'),{harbourBerth}=await import('/src/voyage.js');window.paused=false;
      costLayout.shoreline.points=costLayout.shoreline.radii.map((r,i)=>{const a=i/costLayout.shoreline.radii.length*Math.PI*2;return {x:Math.cos(a)*r*costLayout.width/2,z:Math.sin(a)*r*costLayout.depth/2};});
      costLayout.boat=harbourBerth(costLayout);
      world=createWorld(document.querySelector('#world-container'),{layout:costLayout,isPaused:()=>paused,qualitySettings:{shadowQuality:'baked-contact'},onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},onTravelState(){}});
      const next=structuredClone(costLayout);next.level.id='arrival-fixture';next.level.environment={...next.level.environment,id:'morning',rain:false,sun:[-20,24,10]};next.spawn={...next.dock};
      if(!world.travelTo(next,()=>window.arrived=true))throw Error('Voyage did not start');
    });
    await page.waitForFunction(()=>window.arrived,{},{timeout:5000});
    report.voyage=await page.evaluate(()=>{const s=world.getDebugSnapshot();const result={islands:s.islandCount,shadow:s.quality.shadowQuality,bakedSamples:s.bakedSamples,weather:s.environment.id,shadowRefreshes:s.shadowRefreshes,contacts:s.contactShadows,position:s.position};world.dispose();return result;});
    assert.equal(report.voyage.islands,1);assert.equal(report.voyage.shadow,'baked-contact');assert.ok(report.voyage.bakedSamples>0);assert.equal(report.voyage.weather,'morning');assert.equal(report.voyage.shadowRefreshes,0);assert.deepEqual(errors,[]);
    await fs.writeFile('test-results/frame-cost-'+suffix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
