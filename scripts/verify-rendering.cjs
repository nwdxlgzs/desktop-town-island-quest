const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One browser, one six-workshop island and one village/camp sample. No stress loop.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,seed:314159,completed:[],sound:false,quality:{resolution:'.75',adaptive:false,shadows:false}})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world,{},{timeout:10000});await page.keyboard.press('Escape');
    await page.evaluate(async()=>{
      const q=window.__quest,{createLayout}=await import('/src/level-layout.js');q.state.currentLevel=q.levels.findIndex(l=>l.workshops.length===6);
      const l=createLayout(q.levels[q.state.currentLevel],q.state.seed),w=l.workshops[0];l.spawn={x:w.approach[0],z:w.approach[1]};window.__renderIsland=l;q.world.loadLevel(l);q.refresh(l);
    });
    await page.waitForTimeout(350);await page.keyboard.down('ArrowDown');
    const markers=await page.evaluate(async()=>{
      const q=window.__quest,{elevationAt}=await import('/src/terrain.js'),{workshopArchitecture}=await import('/src/workshop-designs.js');let frames=0,checks=0,maxError=0,previous=-1;
      const end=performance.now()+1000;
      while(performance.now()<end){await new Promise(requestAnimationFrame);const snapshot=q.world.getDebugSnapshot();if(snapshot.renderCount===previous)continue;previous=snapshot.renderCount;frames++;
        for(const marker of document.querySelectorAll('[data-world]')){
          if(marker.hidden)continue;
          const w=q.layout.workshops.find(w=>w.id===marker.dataset.world),a=workshopArchitecture(w).marker,r=marker.getBoundingClientRect(),y=a.y+elevationAt(q.layout,...w.position),x=w.position[0]+a.x,z=w.position[1]+a.z;
          const p=q.world.screenPoint(x,y,z),left=q.world.screenPoint(x-a.halfWidth,y,z),right=q.world.screenPoint(x+a.halfWidth,y,z);
          maxError=Math.max(maxError,Math.abs(r.x+r.width/2-p.x),Math.abs(r.bottom+8-Math.min(left.y,right.y)));checks++;
        }
      }
      return {frames,checks,maxError};
    });await page.keyboard.up('ArrowDown');assert.ok(markers.checks>10);assert.ok(markers.maxError<.1,JSON.stringify(markers));
    await page.waitForTimeout(1000);const stats=await page.evaluate(()=>{const s=window.__quest.world.getDebugSnapshot();return {drawCalls:s.drawCalls,triangles:s.triangles,geometries:s.geometryCount,idleFps:s.targetFps};});assert.ok(stats.drawCalls<80);
    await page.locator('#quality-settings').click();await page.locator('#quality-preset').selectOption('low');await page.locator('#quality-form [type=submit]').click();
    const low=await page.evaluate(()=>window.__quest.world.getQuality());assert.equal(low.stage,3);assert.equal(low.shadows,false);assert.equal(low.waves,false);assert.equal(low.particles,0);await page.keyboard.press('Escape');
    const scenery=await page.evaluate(async()=>{
      const q=window.__quest,{createLayout}=await import('/src/level-layout.js'),{elevationAt}=await import('/src/terrain.js'),level=structuredClone(q.levels[14]);level.map.features.villages=[1,1];level.map.features.camps=[1,1];
      const l=createLayout(level,q.state.seed),v=l.villages[0];l.spawn={...l.npcSpawns['village-0']};q.state.currentLevel=14;q.world.loadLevel(l);q.refresh(l);window.__sceneryIsland=l;
      let samples=0;for(const h of v.houses)for(let x=h.x-h.w/2;x<=h.x+h.w/2;x+=.4)for(let z=h.z-h.d/2;z<=h.z+h.d/2;z+=.4){if(elevationAt(l,x,z)!==h.baseHeight)throw Error('house footprint mismatch');samples++;}
      return {houses:v.houses.length,camps:l.camps.length,samples};
    });await page.locator('#fullscreen').click();await page.waitForTimeout(700);await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/scenery-grounded.png'});
    // Static matrices must remain correct when an island is offset for sailing.
    await page.evaluate(()=>{const q=window.__quest;q.world.travelTo(window.__renderIsland,()=>q.refresh(window.__renderIsland));});
    await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().travelPhase==='sailing',{},{timeout:5000});const sailing=await page.evaluate(()=>{const s=window.__quest.world.getDebugSnapshot();return {islands:s.islandCount,offset:s.incomingOffset};});assert.equal(sailing.islands,2);assert.ok(sailing.offset>40);
    await page.screenshot({path:'test-results/batched-voyage.png'});await page.waitForFunction(()=>!window.__quest.world.isTraveling(),{},{timeout:15000});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({markers,stats,low:{stage:low.stage,ratio:low.pixelRatio},scenery,sailing,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
