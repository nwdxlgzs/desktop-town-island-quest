const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One browser, two normal islands and small deterministic fixtures. No stress run.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:740}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:17,completed:[],sound:false,quality:{version:2,preset:'low',adaptive:false}})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world,{},{timeout:10000});await page.keyboard.press('Escape');
    const snapshot=()=>page.evaluate(()=>window.__quest.world.getDebugSnapshot());
    await page.waitForTimeout(2000);const before=await snapshot();await page.waitForTimeout(1000);const after=await snapshot();
    assert.equal(after.renderCount,before.renderCount,'static low preset does not redraw');assert.equal(after.actorTicks,before.actorTicks,'NPC simulation is suspended');assert.equal(after.occlusionChecks,before.occlusionChecks,'unchanged occlusion does not raycast');assert.deepEqual(after.npcs,before.npcs);assert.equal(after.quality.shadows,false);assert.equal(after.quality.waves,false);
    // FXAA can be enabled/disabled live and must release its buffers afterward.
    await page.locator('#quality-settings').click();await page.locator('#quality-preset').selectOption('auto');await page.locator('#quality-antialias').selectOption('fxaa');await page.locator('#quality-npcs').uncheck();await page.locator('#quality-form [type=submit]').click();assert.equal(await page.evaluate(()=>window.__quest.world.getQuality().antialias),'fxaa');await page.keyboard.press('Escape');
    await page.evaluate(()=>window.__quest.world.setQuality({preset:'low',adaptive:false}));assert.equal((await snapshot()).antialias,false);
    // Freeze the camera and every other object: moving waves alone must change pixels,
    // while the static instance buffer version remains unchanged.
    const waves=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createOcean}=await import('/src/ocean.js'),o=createOcean(),r=new THREE.WebGLRenderer({antialias:false}),s=new THREE.Scene(),c=new THREE.OrthographicCamera(-30,30,24,-24,.1,100);
      r.setSize(240,192);c.position.set(0,30,0);c.up.set(0,0,-1);c.lookAt(0,0,0);s.add(o.mesh,o.waves);o.update(0,0,0,true);r.render(s,c);const a=r.domElement.toDataURL(),version=o.waves.instanceMatrix.version;
      o.update(2,0,0,true);r.render(s,c);const b=r.domElement.toDataURL(),result={pixelsChanged:a!==b,staticInstances:version===o.waves.instanceMatrix.version};o.update(3,0,0,false);result.disabled=!o.waves.visible;o.dispose();r.dispose();return result;
    });assert.equal(waves.pixelsChanged,true);assert.equal(waves.staticInstances,true);assert.equal(waves.disabled,true);
    // Freeze roaming, not greetings: E still animates the resident beside us.
    await page.evaluate(()=>{const q=window.__quest,l=structuredClone(q.layout),key=l.workshops[0].id;l.spawn={...l.npcSpawns[key]};q.world.loadLevel(l);});await page.waitForTimeout(250);await page.locator('#world-container canvas').focus();await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().npcs.some(n=>n.arm>1),{},{timeout:2000});
    // At a completed dock, an overlapping NPC must not steal E from boarding.
    await page.evaluate(()=>{const q=window.__quest,l=structuredClone(q.layout);l.spawn={...l.dock};l.npcSpawns[l.workshops[0].id]={...l.dock};q.state.completed.push(...q.levels[0].tasks.filter(id=>!q.state.completed.includes(id)));q.world.loadLevel(l);q.refresh(l);});
    await page.waitForTimeout(250);await page.locator('#world-container canvas').focus();await page.keyboard.press('e');await page.waitForFunction(()=>window.__quest.world.isTraveling(),{},{timeout:7000});
    await page.waitForFunction(()=>window.__quest.state.currentLevel===1&&!window.__quest.world.isTraveling(),{},{timeout:16000});
    const boarding=await snapshot();assert.equal(boarding.islandCount,1);assert.ok(Math.hypot(boarding.position.x-boarding.layout.dock.x,boarding.position.z-boarding.layout.dock.z)<.1);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/low-end-arrival.png'});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({idle:{renders:after.renderCount-before.renderCount,actorTicks:after.actorTicks-before.actorTicks,occlusionChecks:after.occlusionChecks-before.occlusionChecks},drawCalls:after.drawCalls,antialias:'live on/off',waves,greeting:true,completedDockE:'arrived on next island',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
