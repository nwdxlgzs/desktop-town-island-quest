const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One browser, one six-workshop sample. Short checks only, no CPU throttle or
// machine-specific FPS gate. The route sample reuses the initial island.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2500));});
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:314159,sound:false})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world,{},{timeout:10000});await page.keyboard.press('Escape');
    await page.locator('#quality-settings').click();
    for(const id of ['quality-npcs','quality-waves','quality-weather'])assert.equal(await page.locator('#'+id).isChecked(),true,id);
    assert.equal(await page.locator('#quality-adaptive').isChecked(),true);assert.equal(await page.locator('#quality-preset').inputValue(),'auto');assert.equal(await page.locator('#quality-antialias').inputValue(),'off');assert.equal(await page.locator('#quality-shadow-level').inputValue(),'baked-high');assert.equal(await page.locator('#render-resolution').inputValue(),'1.5');assert.doesNotMatch(await page.locator('#quality-form').innerText(),/默认/);await page.keyboard.press('Escape');
    await page.locator('#fullscreen').click();
    const alignment=await page.locator('.world-tools .icon-button').evaluateAll(buttons=>buttons.map(b=>{const a=b.getBoundingClientRect(),r=b.querySelector('svg').getBoundingClientRect();return {id:b.id,x:Math.abs(a.x+a.width/2-r.x-r.width/2),y:Math.abs(a.y+a.height/2-r.y-r.height/2)};}));
    assert.ok(alignment.every(a=>a.x<.1&&a.y<.1),JSON.stringify(alignment));
    await page.locator('#island-route').click();assert.equal(await page.locator('.route-modal').isVisible(),true);assert.equal(await page.locator('.route-modal [data-level="1"]').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),true);
    await page.evaluate(async()=>{
      const q=window.__quest,{createLayout}=await import('/src/level-layout.js'),l=createLayout(q.levels.find(l=>l.workshops.length===6),314159);
      window.__cacheIsland=l;q.world.loadLevel(l);q.refresh(l);q.world.setQuality({adaptive:false,resolution:'1.5',antialias:'fxaa',shadowQuality:'high',weather:true,waves:true,npcMovement:true});
    });await page.waitForTimeout(300);
    const canvas=page.locator('#world-container canvas'),r=await canvas.boundingBox();await canvas.focus();await page.keyboard.down('ArrowDown');
    const high=await page.evaluate(async()=>{const w=window.__quest.world,a=w.getDebugSnapshot();await new Promise(r=>setTimeout(r,650));const b=w.getDebugSnapshot();return {hits:b.staticCache.hits-a.staticCache.hits,captures:b.staticCache.captures-a.staticCache.captures,frames:b.renderCount-a.renderCount,ratio:b.quality.pixelRatio,shadow:b.quality.shadowQuality,shadowRefreshes:b.shadowRefreshes-a.shadowRefreshes,bufferResizes:b.bufferResizes};});await page.keyboard.up('ArrowDown');assert.equal(high.ratio,1.5);assert.equal(high.shadow,'high');assert.ok(high.hits>2,JSON.stringify(high));
    await page.evaluate(()=>window.__quest.world.setQuality({adaptive:false,resolution:'1.5',antialias:'fxaa',shadowQuality:'baked',weather:false,waves:false,npcMovement:false}));
    assert.equal(await page.evaluate(()=>window.__quest.world.getDebugSnapshot().bufferResizes),high.bufferResizes,'effect-only change must retain 150% canvas buffers');await canvas.focus();await page.keyboard.down('ArrowDown');
    const moving=await page.evaluate(async()=>{
      const w=window.__quest.world,a=w.getDebugSnapshot(),end=performance.now()+700;let cached=0,draws=0,triangles=0;
      while(performance.now()<end){await new Promise(requestAnimationFrame);const s=w.getDebugSnapshot();if(s.renderCount===a.renderCount+draws)continue;draws=s.renderCount-a.renderCount;if(s.staticCache.active)cached++;triangles=s.triangles;}
      const b=w.getDebugSnapshot();return {cacheHits:b.staticCache.hits-a.staticCache.hits,captures:b.staticCache.captures-a.staticCache.captures,triangles,drawCalls:b.drawCalls,ratio:b.quality.pixelRatio,aaBuffers:b.antialiasBuffers,staticChecks:b.view.checks.staticTests-a.view.checks.staticTests};
    });await page.keyboard.up('ArrowDown');assert.equal(moving.ratio,1.5);assert.equal(moving.aaBuffers,1);assert.ok(moving.cacheHits>5,JSON.stringify(moving));if(moving.captures===0)assert.equal(moving.staticChecks,0,"reuse frames must not rescan opaque scenery");
    // A small pan must reuse the guard border, including depth, rather than
    // simply validating a stationary image. Camera/poses then stay identical.
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down({button:'middle'});await page.mouse.move(r.x+r.width/2-14,r.y+r.height/2-9);await page.mouse.up({button:'middle'});await page.waitForTimeout(180);
    await page.locator('#quality-settings').click();
    const pixels=await page.evaluate(async()=>{
      const w=window.__quest.world;
      const before=w.getDebugSnapshot();w.setQuality({...w.getQuality().settings,showFps:true});w.capture();const after=w.getDebugSnapshot();if(after.staticCache.captures!==before.staticCache.captures)throw Error('FPS display change recaptured the opaque scene');
      async function rgba(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const a=await rgba(w.capture()),cacheStats=w.getDebugSnapshot().staticCache,b=await rgba(w.capture({cache:false}));let changed=0,sum=0;
      for(let i=0;i<a.length;i+=4){const difference=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=difference;if(difference>45)changed++;}
      w.setQuality({adaptive:false,resolution:'1',antialias:'fxaa',shadowQuality:'off',weather:false,waves:false,npcMovement:false});const aa=await rgba(w.capture());w.setQuality({adaptive:false,resolution:'1',antialias:'off',shadowQuality:'off',weather:false,waves:false,npcMovement:false});const noAA=await rgba(w.capture());let filtered=0;for(let i=0;i<aa.length;i+=4)if(Math.abs(aa[i]-noAA[i])+Math.abs(aa[i+1]-noAA[i+1])+Math.abs(aa[i+2]-noAA[i+2])>8)filtered++;
      return {cacheStats,changedFraction:changed/(a.length/4),meanChannelDifference:sum/(a.length*.75),filteredPixels:filtered};
    });assert.ok(pixels.changedFraction<.035,JSON.stringify(pixels));assert.ok(pixels.meanChannelDifference<2,JSON.stringify(pixels));assert.ok(pixels.filteredPixels>100,JSON.stringify(pixels));await page.keyboard.press('Escape');
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/quality-cache.png'});
    // Move between two small ordinary islands; drawer selection must sail,
    // preserve unlocked progress, and never enable the following locked island.
    await page.evaluate(()=>{const q=window.__quest;window.__firstIsland=q.layout;q.state.completed.push(...q.levels[0].tasks.filter(id=>!q.state.completed.includes(id)));q.state.currentLevel=1;q.state.unlocked=1;q.world.loadLevel(window.__firstIsland);q.refresh(window.__firstIsland);});
    await page.locator('#island-route').click();assert.equal(await page.locator('.route-modal [data-level="2"]').isDisabled(),true);await page.locator('.route-modal [data-level="0"]').click();await page.waitForFunction(()=>window.__quest.world.isTraveling(),{},{timeout:10000});await page.waitForFunction(()=>!window.__quest.world.isTraveling()&&window.__quest.state.currentLevel===0,{},{timeout:16000});
    assert.deepEqual(errors,[]);const report={high,moving,pixels,alignment,errors};await fs.writeFile('test-results/quality-cache.json',JSON.stringify(report,null,2));console.log(JSON.stringify({defaults:'150%, 30 FPS, baked contacts, active surroundings; AA off; automatic runtime adaptation',alignment,high,moving,pixels,route:'locked island disabled; unlocked selection sails back',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
