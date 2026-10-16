const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One browser and one generated six-workshop sample, reused for travel.
// No stress loop, CPU throttling or machine-specific FPS requirement.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,seed:314159,sound:false,music:false,quality:{version:2,adaptive:false,maxFps:60,npcMovement:true,resolution:'1'}})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world);await page.keyboard.press('Escape');
    await page.evaluate(async()=>{
      const q=window.__quest,{createLayout}=await import('/src/level-layout.js'),l=createLayout(q.levels.find(l=>l.workshops.length===6),314159);
      window.__visibilityIsland=l;q.world.loadLevel(l);q.refresh(l);
    });
    await page.locator('#fullscreen').click();await page.waitForTimeout(200);
    const canvas=page.locator('#world-container canvas'),box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,snapshot=()=>page.evaluate(()=>window.__quest.world.getDebugSnapshot());
    await page.mouse.move(cx,cy);await page.mouse.wheel(0,-1600);await page.waitForTimeout(150);await canvas.focus();await page.keyboard.down('ArrowDown');
    const closeup=await page.evaluate(async()=>{
      const w=window.__quest.world,end=performance.now()+700,frames=[],work=[];let previous=-1;
      while(performance.now()<end){await new Promise(requestAnimationFrame);const s=w.getDebugSnapshot();if(s.renderCount===previous)continue;previous=s.renderCount;frames.push(s.frameMs);work.push(s.workMs);}
      const s=w.getDebugSnapshot();return {zoom:s.zoom,triangles:s.triangles,drawCalls:s.drawCalls,view:s.view,frames:frames.length,frameMin:Math.min(...frames),frameMax:Math.max(...frames),cpuSubmitMs:work.reduce((n,x)=>n+x,0)/work.length};
    });await page.keyboard.up('ArrowDown');
    assert.equal(closeup.zoom,2);assert.ok(closeup.view.selectedTriangles<closeup.view.totalTriangles*.6,JSON.stringify(closeup));assert.ok(closeup.view.visibleNPCs<6);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/visibility-closeup.png'});
    // Pan beyond the nearer shore: neither invisible actors nor their poses
    // should consume simulation steps or uploads while the camera is away.
    const initial=await snapshot(),panX=Math.sign(initial.cameraFocus.x||1)*initial.layout.width/2,panZ=Math.sign(initial.cameraFocus.z||1)*initial.layout.depth/2;
    await page.mouse.move(cx,cy);await page.mouse.down({button:'middle'});await page.mouse.move(cx-panX/.035,cy-panZ/.045);await page.mouse.up({button:'middle'});
    await page.waitForTimeout(700);const before=await snapshot();await page.waitForTimeout(600);const after=await snapshot();
    assert.equal(before.view.visibleNPCs,0,JSON.stringify(before.view));assert.equal(after.npcSimSteps,before.npcSimSteps);assert.equal(after.animalSimSteps,before.animalSimSteps);assert.equal(after.propUpdates,before.propUpdates);assert.deepEqual(after.npcs,before.npcs);assert.deepEqual(after.wildlife,before.wildlife);
    await page.locator('#reset-camera').click();await page.mouse.move(cx,cy);await page.mouse.wheel(0,-1600);await page.waitForTimeout(250);const returned=await snapshot();assert.ok(returned.view.visibleNPCs>0);assert.ok(returned.view.selectedTriangles>before.view.selectedTriangles);
    await page.locator('#overview-camera').click();await page.waitForTimeout(250);const overview=await snapshot();assert.ok(overview.view.selectedTriangles>closeup.view.selectedTriangles);
    // Shadow passes must use the full caster list and restore the main-camera
    // draw list afterwards, even when only a fraction of the island is visible.
    await page.locator('#reset-camera').click();await page.mouse.move(cx,cy);await page.mouse.wheel(0,-1600);await page.locator('#quality-settings').click();
    const shadows=await page.evaluate(async()=>{
      const w=window.__quest.world,settings={adaptive:false,resolution:'1',maxFps:60,npcMovement:false};
      async function pixels(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      w.setQuality({...settings,shadowQuality:'off'});const off=await pixels(w.capture()),result={};
      for(const mode of ['cached','high']){w.setQuality({...settings,shadowQuality:mode});const p=await pixels(w.capture());let darkened=0;for(let i=0;i<off.length;i+=4)if(off[i]+off[i+1]+off[i+2]-p[i]-p[i+1]-p[i+2]>18)darkened++;result[mode]=darkened;const culled=w.getDebugSnapshot().view;if(culled.selectedTriangles>=culled.totalTriangles)throw Error('shadow pass did not restore the culled draw list');}
      w.setQuality({...settings,antialias:'fxaa'});w.capture();result.fxaa=w.getDebugSnapshot().antialias;w.setQuality({preset:'low',adaptive:false});return result;
    });assert.ok(shadows.cached>100&&shadows.high>100,JSON.stringify(shadows));assert.equal(shadows.fxaa,true);await page.keyboard.press('Escape');
    // Hidden logical parents must preserve E and island-offset transforms.
    await page.evaluate(()=>{const q=window.__quest,l=structuredClone(window.__visibilityIsland);l.spawn={...l.npcSpawns[l.workshops[0].id]};q.world.loadLevel(l);});await page.waitForTimeout(200);await canvas.focus();await page.keyboard.press('e');await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().npcs.some(n=>n.arm>1),{},{timeout:2000});
    await page.evaluate(()=>{const q=window.__quest;q.world.travelTo(window.__visibilityIsland,()=>q.refresh(window.__visibilityIsland));});
    await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().travelPhase==='sailing',{},{timeout:5000});const sailing=await snapshot();assert.equal(sailing.islandCount,2);assert.ok(sailing.view.selectedTriangles>0);await page.screenshot({path:'test-results/visibility-voyage.png'});
    await page.waitForFunction(()=>!window.__quest.world.isTraveling(),{},{timeout:16000});await page.waitForTimeout(200);const arrived=await snapshot();assert.equal(arrived.islandCount,1);assert.ok(arrived.view.selectedTriangles>0);assert.ok(Math.hypot(arrived.position.x-arrived.layout.dock.x,arrived.position.z-arrived.layout.dock.z)<.1);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({closeup,offscreen:{npcSteps:after.npcSimSteps-before.npcSimSteps,animalSteps:after.animalSimSteps-before.animalSimSteps,propUploads:after.propUpdates-before.propUpdates},returnedVisibleNPCs:returned.view.visibleNPCs,overviewTriangles:overview.view.selectedTriangles,shadows,greeting:true,travel:'arrived with culled scenery intact',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
