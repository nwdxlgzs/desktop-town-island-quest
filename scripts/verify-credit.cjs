const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const verifySealedBuild=require('./verify-sealed-build.cjs');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{
      // Replacing a dev HTML response can block Vite's optional HMR socket in
      // Chromium. Keep game/shader errors; this test never uses hot reload.
      if(m.type()==='error'&&!/^(WebSocket connection to 'ws:\/\/127\.0\.0\.1:5174\/|\[vite\] failed to connect to websocket)/.test(m.text()))errors.push(m.text());
    });
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,completed:[],onboardingVersion:1})));
    const url='http://127.0.0.1:5174/';
    await page.goto(url);await page.waitForFunction(()=>window.__quest?.world?.getDebugSnapshot().renderCount>0);
    assert.ok(await page.evaluate(()=>__quest.world.getDebugSnapshot().fenceCount)>0);
    assert.equal(await page.evaluate(()=>__quest.world.getDebugSnapshot().lampCount),await page.evaluate(()=>__quest.world.getDebugSnapshot().layout.lamps.length));
    await page.locator('#fullscreen').click();await page.locator('#overview-camera').click();await page.waitForFunction(()=>{const p=__quest.world.getDebugSnapshot().cameraFocus;return Math.abs(p.x)+Math.abs(p.z)<.001;});
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/coastal-fences.png'});
    const a=await page.evaluate(()=>__quest.world.getDebugSnapshot());await page.waitForTimeout(350);const b=await page.evaluate(()=>__quest.world.getDebugSnapshot());
    assert.equal(b.markerProjections,a.markerProjections,'stationary view does not reproject labels');assert.ok(b.renderCount>a.renderCount);
    assert.equal(b.occlusionFadeSteps,a.occlusionFadeSteps,'settled occluders have no per-frame fade work');
    await page.locator('#map-help').click();
    assert.equal(await page.locator('#modal [data-sponsor-credit]').textContent(),'PoweredBy@nwdxlgzs赞助提供此游戏化教具');
    assert.match(await page.locator('.device-note').innerText(),/需要对应设备。[\s\S]*PoweredBy@nwdxlgzs/);
    await page.locator('.device-note').screenshot({path:'test-results/sponsor-credit.png'});
    await page.keyboard.press('Escape');await page.locator('#quality-settings').click();await page.keyboard.press('Escape');await page.locator('#map-help').click();
    assert.equal(await page.locator('[data-game-stopped]').count(),0,'normal modal replacement is allowed');
    await page.evaluate(()=>{window.stoppedWorld=__quest.world;document.querySelector('#modal [data-sponsor-credit]').textContent='changed';});
    await page.locator('[data-game-stopped=true]').waitFor();assert.equal(await page.locator('canvas').count(),0);
    const stopped=await page.evaluate(()=>stoppedWorld.getDebugSnapshot().renderCount);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>stoppedWorld.getDebugSnapshot().renderCount),stopped);
    assert.equal(await page.evaluate(()=>__quest.world),null);
    await page.reload();await page.waitForFunction(()=>window.__quest?.world);
    await page.locator('#map-help').click();await page.evaluate(()=>document.querySelector('#modal [data-sponsor-credit]').remove());await page.locator('[data-game-stopped=true]').waitFor();
    await page.reload();await page.waitForFunction(()=>window.__quest?.world);
    await page.evaluate(()=>document.querySelector('#game-credit-source').remove());await page.locator('[data-game-stopped=true]').waitFor();
    // Static source text changed before initialization: no renderer may start.
    await page.route(url,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('PoweredBy@nwdxlgzs赞助提供此游戏化教具','changed')});});
    await page.reload();await page.locator('[data-game-stopped=true]').waitFor();assert.equal(await page.locator('canvas').count(),0);await page.unroute(url);
    // Attachment lifecycle in a small guard fixture, without more maps.
    await page.route('**/__guard.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.goto(url+'__guard.html');
    const guideAttachment=await page.evaluate(async()=>{
      const {createCreditGuard}=await import('/src/credit-guard.js'),text='PoweredBy@nwdxlgzs赞助提供此游戏化教具',results=[];
      const savedAnimations=Element.prototype.getAnimations;Element.prototype.getAnimations=undefined;
      const styles=document.createElement('style');styles.textContent='.fixture-entry{animation:modal-in .2s ease-out}@keyframes modal-in{from{opacity:0}to{opacity:1}}';document.head.append(styles);
      for(const mode of ['span','host','ancestor','hide','opacity','release','animation-api-absent','stuck-entrance','release-entrance']){
        document.body.innerHTML=`<template id="game-credit-source"><span class="sponsor-credit" data-sponsor-credit>${text}</span></template><main><div id="layer"><div id="guide"><span class="sponsor-credit" data-sponsor-credit>${text}</span></div></div></main>`;
        const host=document.querySelector('#guide'),animated=mode==='animation-api-absent'||mode==='stuck-entrance'||mode==='release-entrance';
        if(animated)host.className='fixture-entry';if(mode==='stuck-entrance')host.style.animationPlayState='paused';
        let failed=false;const guard=createCreditGuard({onViolation(){failed=true;}});guard.startCreditGuard();const watched=guard.watchGuide(host);
        if(mode==='release'||mode==='release-entrance')guard.releaseGuide();
        if(mode==='hide')document.querySelector('#guide span').parentElement.hidden=true;
        else if(mode==='opacity')document.querySelector('#layer').style.opacity='0';
        else if(mode!=='animation-api-absent'&&mode!=='stuck-entrance')document.querySelector(mode==='span'?'#guide span':mode==='ancestor'?'#layer':'#guide').remove();
        await new Promise(resolve=>setTimeout(resolve,animated?300:0));results.push({mode,watched,failed});guard.disposeCreditGuard();
      }Element.prototype.getAnimations=savedAnimations;styles.remove();return results;
    });
    for(const result of guideAttachment){assert.equal(result.watched,true,result.mode+' opens normally');assert.equal(result.failed,!['release','release-entrance','animation-api-absent'].includes(result.mode),result.mode);}
    const sealed=process.argv.includes('--built')?await verifySealedBuild(browser):null;
    assert.deepEqual(errors,[]);const report={coastalFences:true,streetLamps:true,stationaryMarkerProjections:b.markerProjections-a.markerProjections,frames:b.renderCount-a.renderCount,normalModalSwitch:true,liveEditStopsRendering:true,liveDeletion:true,sourceDeletion:true,staticCreditEdit:true,guideAttachment,builtSeals:sealed,errors};
    await fs.writeFile('test-results/credit-and-fences.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
