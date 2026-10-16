const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:720,height:500}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2500));});
    await page.route('**/__orbit.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><div id="world-container" style="width:640px;height:460px"></div>'}));
    await page.goto('http://127.0.0.1:5174/__orbit.html');
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js');
      const layout={seed:7,width:18,depth:18,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},shoreX:8,dock:{x:7,z:-4},boat:{x:10,z:-4},spawn:{x:0,z:0},level:{id:'orbit-fixture',map:{npcLimit:0},npc:{radius:2}},workshops:[],roads:[],ladders:[],mountains:[],villages:[],camps:[],reefs:[{x:-10,z:0,r:1,height:1.2}],exploration:[{id:'lamp',type:'beacon',name:'星灯',x:4,z:-3}],trees:[{x:1.2,z:2,scale:1.8}],obstacles:[],terraces:[]};
      window.paused=false;window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},qualitySettings:{waves:true,npcMovement:true,weather:true,adaptive:false}});
      window.contextmenus=0;document.querySelector('canvas').addEventListener('contextmenu',()=>contextmenus++);
    });
    page.setDefaultTimeout(5000);const snap=()=>page.evaluate(()=>world.getDebugSnapshot());
    await page.waitForFunction(()=>world.getDebugSnapshot().faded===1);const main=await snap();await fs.mkdir('test-results',{recursive:true});
    await page.mouse.move(20,220);await page.mouse.down({button:'right'});await page.mouse.move(340,220,{steps:5});
    await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return s.orbit.active&&s.faded===0&&!s.outline;});
    const reverse=await snap();assert.ok(Math.abs(reverse.orbit.yaw+Math.PI)<1e-6);assert.equal(reverse.staticCache.active,false);assert.ok(reverse.cameraPosition.x<0&&reverse.cameraPosition.z<0);
    await page.screenshot({path:'test-results/orbit-reverse.png'});await page.mouse.move(660,220,{steps:5});await page.waitForTimeout(80);const full=await snap();assert.ok(Math.abs(full.orbit.yaw+Math.PI*2)<1e-6);
    await page.mouse.up({button:'right'});await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return !s.orbit.active&&s.staticCache.active&&s.faded===1&&s.outline;});
    const restored=await snap();assert.deepEqual(restored.cameraPosition,main.cameraPosition);assert.equal(restored.routeRemaining,main.routeRemaining);assert.equal(await page.evaluate(()=>contextmenus),0);assert.ok(restored.staticCache.captures-full.staticCache.captures<=2);
    await page.screenshot({path:'test-results/orbit-restored.png'});
    // A partial turn must return over rendered frames, never snap. A new drag
    // during that return starts at the current angle without an orientation jump.
    await page.mouse.move(100,220);await page.mouse.down({button:'right'});await page.mouse.move(260,220,{steps:3});
    await page.evaluate(()=>document.querySelector('canvas').addEventListener('pointerup',()=>window.release=world.getDebugSnapshot(),{once:true}));
    await page.mouse.up({button:'right'});const release=await page.evaluate(()=>window.release);
    assert.equal(release.orbit.dragging,false);assert.equal(release.orbit.returning,true);assert.ok(Math.abs(release.orbit.yaw+Math.PI/2)<1e-6);assert.equal(release.staticCache.active,false);
    await page.waitForTimeout(90);const middle=await snap();assert.ok(Math.abs(middle.orbit.yaw)>0&&Math.abs(middle.orbit.yaw)<Math.abs(release.orbit.yaw));
    await page.evaluate(()=>document.querySelector('canvas').addEventListener('pointerdown',()=>window.regrabYaw=world.getDebugSnapshot().orbit.yaw,{once:true,capture:true}));
    await page.mouse.down({button:'right'});const regrab=await snap();assert.equal(regrab.orbit.dragging,true);assert.equal(regrab.orbit.returning,false);assert.equal(regrab.orbit.yaw,await page.evaluate(()=>window.regrabYaw));
    await page.mouse.move(300,220);await page.mouse.up({button:'right'});
    await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return !s.orbit.active&&s.staticCache.active&&s.faded===1&&s.outline;});
    assert.deepEqual((await snap()).cameraPosition,main.cameraPosition);
    const smoothReturn={releaseYaw:release.orbit.yaw,intermediateYaw:middle.orbit.yaw,regrabYaw:regrab.orbit.yaw,restoredYaw:(await snap()).orbit.yaw};
    // Lost capture, tab blur, pause and view reset must never leave inspection stuck.
    for(const action of ['capture','blur','pause','reset']){
      await page.mouse.move(120,220);await page.mouse.down({button:'right'});await page.mouse.move(260,220);
      await page.evaluate(action=>{if(action==='capture'){const canvas=document.querySelector('canvas');canvas.releasePointerCapture(1);}if(action==='blur')window.dispatchEvent(new Event('blur'));if(action==='pause')paused=true;if(action==='reset')world.resetView();},action);
      if(action==='capture')await page.mouse.move(262,220);
      await page.waitForFunction(()=>!world.getDebugSnapshot().orbit.active);await page.mouse.up({button:'right'});await page.evaluate(()=>paused=false);
    }
    const decoration=await page.evaluate(async()=>{
      paused=true;world.capture();const a=world.getDebugSnapshot();world.syncExploration({shards:[],restored:['orbit-fixture'],sail:'cream'});world.capture();const b=world.getDebugSnapshot();world.capture();const c=world.getDebugSnapshot();
      async function rgba(url){const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;}
      const cached=await rgba(world.capture()),direct=await rgba(world.capture({cache:false}));let different=0;for(let i=0;i<cached.length;i+=4)if(Math.abs(cached[i]-direct[i])+Math.abs(cached[i+1]-direct[i+1])+Math.abs(cached[i+2]-direct[i+2])>45)different++;
      return {batches:b.propBatches,recaptures:b.staticCache.captures-a.staticCache.captures,repeatedCaptures:c.staticCache.captures-b.staticCache.captures,differentFraction:different/(cached.length/4)};
    });assert.ok(decoration.batches.cachedTriangles>0);assert.equal(decoration.batches.movingTriangles,0);assert.equal(decoration.recaptures,1);assert.equal(decoration.repeatedCaptures,0);assert.ok(decoration.differentFraction<.025);
    const result={reverseYaw:reverse.orbit.yaw,fullYaw:full.orbit.yaw,smoothReturn,restored:restored.orbit,cacheDuringInspection:reverse.staticCache.active,restoredCamera:restored.cameraPosition,automaticOcclusionRestored:restored.faded===1&&restored.outline,decoration};
    await page.evaluate(()=>{window.voyageLayout=world.getDebugSnapshot().layout;world.dispose();});await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js'),{harbourBerth}=await import('/src/voyage.js');paused=false;
      const layout=structuredClone(voyageLayout);layout.shoreline.points=layout.shoreline.radii.map((r,i)=>{const a=i/layout.shoreline.radii.length*Math.PI*2;return{x:Math.cos(a)*r*layout.width/2,z:Math.sin(a)*r*layout.depth/2};});layout.boat=harbourBerth(layout);
      world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},onTravelState(){}});
      const next=structuredClone(layout);next.level.id='arrival-fixture';if(!world.travelTo(next,()=>window.arrived=true))throw Error('Voyage did not start');
    });
    await page.waitForFunction(()=>window.arrived&&world.getDebugSnapshot().staticCache.active);
    result.voyage=await page.evaluate(()=>{const s=world.getDebugSnapshot();world.dispose();return {islands:s.islandCount,cachedTriangles:s.propBatches.cachedTriangles,bakedSamples:s.bakedSamples,orbit:s.orbit};});
    assert.equal(result.voyage.islands,1);assert.ok(result.voyage.cachedTriangles>0&&result.voyage.bakedSamples>0);assert.equal(result.voyage.orbit.active,false);
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/orbit.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
