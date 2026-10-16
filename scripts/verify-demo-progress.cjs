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
    await page.goto(url+'#BYPASS');await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    assert.equal(await page.locator('#explore-next').textContent(),'查看收藏');
    await page.locator('#explore-journal').click();
    const islandCount=await page.locator('.stamp-grid .lit').count();assert.ok(islandCount>=6);
    assert.equal(await page.locator('.stamp-grid span').count(),islandCount);assert.equal(await page.locator('[data-sail]:disabled').count(),0);assert.equal(await page.locator('[data-sail]').count(),4);
    assert.match(await page.locator('.journal-body').innerText(),/维修无人机/);assert.match(await page.locator('.journal-body').innerText(),/全部船帆已解锁/);
    await page.locator('[data-sail="star"]').click();assert.equal(await page.locator('[data-sail="star"]').getAttribute('aria-pressed'),'true');
    const full=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3-demo')));
    assert.equal(full.exploration.shards.length,islandCount*3);assert.equal(full.exploration.restored.length,islandCount);assert.equal(full.exploration.species.length,19);assert.equal(full.graduated,true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('desktop-quest-v3')),original);
    // Simulate a save from the older partial demo, then reload the same file.
    await page.addInitScript(()=>{if(location.hash!=='#BYPASS')return;const key='desktop-quest-v3-demo',save=JSON.parse(localStorage.getItem(key));save.exploration.shards=[];save.exploration.restored=[];save.exploration.species=[];localStorage.setItem(key,JSON.stringify(save));});
    await page.reload();await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    await page.locator('#explore-journal').click();assert.equal(await page.locator('[data-sail="star"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.stamp-grid .lit').count(),islandCount);await page.keyboard.press('Escape');
    await page.locator('#island-route').click();assert.equal(await page.locator('.route-modal [data-level]:disabled').count(),0);await page.locator('.route-modal [data-level="1"]').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('desktop-quest-v3-demo')).currentLevel===1,{},{timeout:25000});
    assert.equal(await page.locator('#explore-objective b').textContent(),'星灯已点亮');
    assert.equal(await page.locator('[data-game-stopped]').count(),0);
    // Removing the hash restores the original classroom progress and locks.
    await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelector('#explore-objective b')?.textContent?.includes('星图 0/3'),{},{timeout:15000});
    await page.locator('#explore-journal').click();assert.equal(await page.locator('[data-sail]:disabled').count(),3);assert.equal(await page.locator('.stamp-grid .lit').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log(JSON.stringify({islands:islandCount,shards:full.exploration.shards.length,species:full.exploration.species.length,allSails:true,graduated:true,olderDemoRepaired:true,sailChoicePreserved:true,landingCollectionReady:true,classroomProgressIsolated:true,errors,network},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
