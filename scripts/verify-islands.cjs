const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780},deviceScaleFactor:.5}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:17,music:true,completed:[],sound:false}));});
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world);
    assert.equal(await page.title(),'电脑小镇 · 岛屿探索');assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');
    for(const id of ['xp-total','fullscreen'])assert.ok(await page.locator(`#${id}`).evaluate(el=>!!el.closest('#world-container')));
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.body.classList.contains('immersive-mode'));
    const ocean=await page.evaluate(()=>window.__quest.world.getDebugSnapshot().oceanTime);await page.waitForTimeout(160);assert.ok(await page.evaluate(()=>window.__quest.world.getDebugSnapshot().oceanTime)>ocean);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/explore-immersive.png'});
    // Actual walking and collection, without teleporting to the targets.
    if(!process.env.RESUME_STAR)for(let i=0;i<3;i++){await page.locator('#explore-next').click();await page.waitForFunction(n=>window.__quest.state.exploration.shards.length===n,i+1,{timeout:16000});}
    const animal=await page.evaluate(()=>window.__quest.layout.wildlife[0]?.id);
    if(animal&&!process.env.RESUME_STAR){await page.evaluate(id=>window.__quest.world.explore(id),animal);await page.waitForFunction(()=>window.__quest.state.exploration.species.length>0,{timeout:16000});}
    await page.evaluate(resume=>{const q=window.__quest;if(resume)q.state.exploration.shards=q.layout.exploration.filter(d=>d.type==='shard').map(d=>d.id);q.state.completed.push(...q.layout.workshops[0].tasks);q.refresh();},!!process.env.RESUME_STAR);
    await page.locator('#explore-next').click();await page.locator('#star-replay').waitFor({timeout:35000}).catch(async e=>{const debug=await page.evaluate(()=>{const q=window.__quest,s=q.world.getDebugSnapshot();return {position:s.position,remaining:s.routeRemaining,next:s.nextPoint,toast:document.querySelector('#toast').textContent}});console.log({errors,debug});throw e;});
    await page.locator('#star-replay').click();const sequence=[];
    for(let i=0;i<4;i++){await page.waitForFunction(n=>document.querySelector('#star-status').textContent.startsWith(`第 ${n} 束`),i+1);sequence.push(Number((await page.locator('#star-status').textContent()).match(/星星 (\d+)/)[1])-1);}
    await page.waitForFunction(()=>!document.querySelector('[data-star]').disabled);
    for(const n of sequence)await page.locator(`[data-star="${n}"]`).click();
    assert.equal(await page.evaluate(()=>window.__quest.state.exploration.restored.length),1);
    await page.locator('#star-replay').click();await page.locator('[data-sail="rose"]').click();assert.equal(await page.evaluate(()=>window.__quest.state.exploration.sail),'rose');
    await page.screenshot({path:'test-results/explore-journal.png'});await page.keyboard.press('Escape');
    await page.reload();await page.waitForFunction(()=>window.__quest?.world);assert.equal(await page.evaluate(()=>window.__quest.state.exploration.sail),'rose');assert.equal(await page.evaluate(()=>window.__quest.state.exploration.shards.length),3);
    const snapshots=[];
    for(const biome of ['snow','cyber']){
      await page.evaluate(b=>{const q=window.__quest;q.state.currentLevel=q.levels.findIndex(l=>l.biome.id===b);q.state.unlocked=Math.max(q.state.unlocked,q.state.currentLevel);q.refresh();q.world.loadLevel(q.layout);q.world.syncExploration(q.state.exploration);q.world.toggleOverview();},biome);
      await page.waitForTimeout(180);const s=await page.evaluate(()=>window.__quest.world.getDebugSnapshot());assert.ok(s.wildlife.length<=4);snapshots.push({biome,drawCalls:s.drawCalls,creatures:s.wildlife.length});await page.screenshot({path:`test-results/biome-${biome}.png`});
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({collected:3,restored:1,sail:'rose',snapshots,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
