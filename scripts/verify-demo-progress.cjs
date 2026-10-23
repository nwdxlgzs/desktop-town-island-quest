const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

// One fixed offline route, one trip; no map-generation or FPS stress suite.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1050,height:760}}),errors=[],network=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    const original=JSON.stringify({version:3,routeVersion:1,seed:7,currentLevel:0,unlocked:0,completed:[],onboardingVersion:1,sound:false,exploration:{shards:[],restored:[],species:[],sail:'cream'}});
    await page.addInitScript(value=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',value);},original);
    const url=pathToFileURL(path.resolve('dist/index.html')).href;
    await page.goto(url+'#BYPASS');await page.locator('#world-loading').waitFor({state:'detached',timeout:20000});
    assert.equal(await page.locator('#teaching-library-nav').count(),0,'old hash cannot unlock');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).completed.length),0);
    await page.evaluate(()=>{location.hash='';window.unlockDocument=document.documentElement;window.unlockCanvas=document.querySelector('#world-container canvas');});
    for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])await page.keyboard.press(key);
    await page.locator('#teaching-library-nav').waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(await page.evaluate(()=>window.unlockDocument===document.documentElement&&window.unlockCanvas===document.querySelector('#world-container canvas')),true,'unlock keeps the document and WebGL canvas');
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    assert.equal(await page.locator('#explore-next').textContent(),'查看收藏');
    await page.locator('#explore-journal').click();
    const islandCount=await page.locator('.stamp-grid .lit').count();assert.ok(islandCount>=6);
    assert.equal(await page.locator('.stamp-grid span').count(),islandCount);assert.equal(await page.locator('[data-sail]:disabled').count(),0);assert.equal(await page.locator('[data-sail]').count(),4);
    assert.match(await page.locator('.journal-body').innerText(),/维修无人机/);assert.match(await page.locator('.journal-body').innerText(),/全部船帆已解锁/);
    await page.locator('[data-sail="star"]').click();assert.equal(await page.locator('[data-sail="star"]').getAttribute('aria-pressed'),'true');
    const full=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));
    assert.equal(full.exploration.shards.length,islandCount*3);assert.equal(full.exploration.restored.length,islandCount);assert.equal(full.exploration.species.length,19);assert.equal(full.graduated,true);
    assert.equal(full.unlockedMode,true);assert.equal(full.seed,7);assert.equal(full.exploration.sail,'star');assert.equal(full.completed.length,243);
    // Simulate a save from the older partial demo, then reload the same file.
    await page.evaluate(()=>{const key='desktop-quest-v3',save=JSON.parse(localStorage.getItem(key));save.exploration.shards=[];save.exploration.restored=[];save.exploration.species=[];localStorage.setItem(key,JSON.stringify(save));});
    await page.reload();await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    await page.locator('#explore-journal').click();assert.equal(await page.locator('[data-sail="star"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.stamp-grid .lit').count(),islandCount);await page.keyboard.press('Escape');
    await page.locator('#island-route').click();assert.equal(await page.locator('.route-modal [data-level]:disabled').count(),0);await page.locator('.route-modal [data-level="1"]').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).currentLevel===1,{},{timeout:25000});
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    assert.equal(await page.locator('[data-game-stopped]').count(),0);
    // Ordinary revisits retain the existing unlock without a special URL.
    await page.reload();await page.locator('#teaching-library-nav').waitFor();
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    await page.locator('#explore-journal').click();assert.equal(await page.locator('[data-sail]:disabled').count(),0);assert.equal(await page.locator('.stamp-grid .lit').count(),islandCount);await page.keyboard.press('Escape');
    await page.locator('#progress-nav').click();const downloading=page.waitForEvent('download');await page.locator('#export-progress').click();const downloaded=await downloading,portable=JSON.parse(await require('node:fs/promises').readFile(await downloaded.path(),'utf8'));
    assert.equal(portable.progress.unlockedMode,true);assert.equal(portable.progress.currentLevel,1);assert.equal(portable.progress.exploration.sail,'star');
    await page.locator('#import-progress').setInputFiles({name:'进度.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});await page.locator('#confirm-import').click();await page.locator('#teaching-library-nav').waitFor();
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.equal(restored.completed.length,243);assert.equal(restored.currentLevel,1);assert.equal(restored.unlockedMode,true);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    await page.locator('#progress-nav').click();await page.locator('#new-adventure summary').click();await page.locator('#new-seed').fill('1234');await page.locator('#seed-form button[type="submit"]').click();
    await Promise.all([page.waitForEvent('load'),page.locator('#confirm-new-adventure').click()]);await page.locator('.onboarding-layer[data-step="0"]').waitFor();
    const restarted=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.equal(restarted.seed,1234);assert.equal(restarted.onboardingVersion,0);assert.equal(restarted.currentLevel,0);assert.equal(restarted.unlockedMode,undefined);assert.equal(restarted.unlocked,0);assert.equal(restarted.completed.length,0);assert.equal(restarted.graduated,false);assert.equal(restarted.exploration.shards.length,0);assert.equal(await page.locator('#teaching-library-nav').count(),0);
    await page.reload();await page.locator('.onboarding-layer[data-step="0"]').waitFor();await page.locator('#onboarding-skip').click();await page.locator('.onboarding-layer').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).onboardingVersion),1);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log(JSON.stringify({islands:islandCount,shards:full.exploration.shards.length,species:full.exploration.species.length,allSails:true,graduated:true,olderDemoRepaired:true,sailChoicePreserved:true,landingCollectionReady:true,permanentUnlock:true,inPlaceActivation:true,oldHashIgnored:true,restartResetsOnboarding:true,progressTransfer:true,errors,network},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
