const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2500));});
    await page.addInitScript(()=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,completed:[],onboardingVersion:0}));});
    await page.goto('http://127.0.0.1:5174/');await page.locator('#world-loading').waitFor({state:'detached'});const tour=page.locator('.onboarding-layer');await tour.waitFor();
    assert.equal(await tour.getAttribute('data-step'),'0');assert.equal(await page.evaluate(()=>document.activeElement.id),'fullscreen');
    await page.waitForFunction(()=>__quest.world.getDebugSnapshot().renderCount>0);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/onboarding-first.png'});
    const before=await page.evaluate(()=>__quest.world.getDebugSnapshot());await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='1');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),true);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
    await page.waitForFunction(count=>__quest.world.getDebugSnapshot().renderCount>count,before.renderCount);
    const paused=await page.evaluate(()=>({s:__quest.world.getDebugSnapshot(),text:document.querySelector('.onboarding-card').innerText}));assert.equal(paused.s.npcSimSteps,before.npcSimSteps);assert.ok(!paused.text.includes('右键'));
    await page.screenshot({path:'test-results/onboarding-fullscreen.png'});await page.locator('#onboarding-next').click();assert.equal(await tour.getAttribute('data-step'),'2');
    await page.locator('#onboarding-back').click();assert.equal(await tour.getAttribute('data-step'),'1');await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();assert.equal(await tour.getAttribute('data-step'),'3');
    await page.setViewportSize({width:720,height:500});await page.waitForTimeout(100);const rect=await page.locator('.onboarding-card').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=721&&rect.y+rect.height<=501,JSON.stringify(rect));
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('.onboarding-layer')!==null),true);
    await page.locator('#onboarding-next').click();await tour.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).onboardingVersion),1);
    await page.reload();await page.locator('#world-loading').waitFor({state:'detached'});assert.equal(await tour.count(),0);
    await page.locator('#map-help').click();await page.locator('#guide-tour').click();await tour.waitFor();assert.equal(await tour.getAttribute('data-step'),'0');
    await page.keyboard.press('Escape');await tour.waitFor({state:'detached'});assert.equal(await page.locator('#modal-layer').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).onboardingVersion),1);
    assert.equal(await page.evaluate(()=>__quest.world.getQuality().settings.resolution),'1.5');assert.deepEqual(errors,[]);
    const report={fullscreenViaHighlightedButton:true,browserFullscreen:false,pausedDuringTour:true,resizeWhilePausedRenders:true,backAndKeyboard:true,remembered:true,replayAndSkip:true,errors};await fs.writeFile('test-results/onboarding.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
