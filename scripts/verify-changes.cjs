const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    // One low-density browser, three new apps, one ordinary boat trip; no full-course run.
    const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:.65,reducedMotion:'no-preference'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:17,currentLevel:0,unlocked:0,completed:[],sound:false,music:false})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__quest?.world);
    const journey=await page.evaluate(()=>window.__quest.levels.map(l=>({id:l.id,count:l.workshops.length,tasks:l.tasks})));
    assert.ok(journey.length>12);assert.ok(journey.every(l=>l.count>=1&&l.count<=6));
    await fs.mkdir('test-results',{recursive:true});
    await page.locator('#overview-camera').click();await page.waitForTimeout(160);await page.screenshot({path:'test-results/layered-small-island.png'});
    const snapshot=await page.evaluate(()=>window.__quest.world.getDebugSnapshot());assert.ok(snapshot.npcs.length<=8);
    // Ship to the next random stop and inspect actual rendered physics, with no exercise solving.
    await page.evaluate(()=>{const q=window.__quest;q.state.completed=[...q.levels[0].tasks];q.refresh();});
    await page.locator('#go-station').click();await page.waitForFunction(()=>window.__quest.world.isTraveling(),{},{timeout:10000});
    const flight=await page.evaluate(async()=>{const {voyageClear}=await import('/src/voyage.js');let frames=0;const w=window.__quest.world;while(w.isTraveling()){const s=w.getDebugSnapshot();if(!voyageClear(s.boat,s.layout,s.incomingLayout,s.incomingOffset))throw Error('boat overlaps new shore');if(s.islandCount>2)throw Error('too many rendered islands');frames++;await new Promise(requestAnimationFrame);}return frames;});
    assert.ok(flight>10);assert.equal(await page.evaluate(()=>window.__quest.state.currentLevel),1);
    for(const kind of ['browser','paint','pdf']){
      const task=await page.evaluate(kind=>{const q=window.__quest;const i=q.levels.findIndex(l=>l.tasks.some(id=>q.tasks[id].kind===kind));return {i,id:q.levels[i].tasks.find(id=>q.tasks[id].kind===kind)};},kind);
      await page.evaluate(t=>{const q=window.__quest;q.state.currentLevel=t.i;q.state.unlocked=Math.max(q.state.unlocked,t.i);q.refresh();q.world.loadLevel(q.layout);q.openTask(t.id);},task);
      if(kind==='browser'){await page.locator('#browser-bookmark').click();await page.locator('#browser-query').fill('人工智能');await page.locator('#browser-query').press('Enter');await page.locator('#browser-result').click();}
      if(kind==='paint'){await page.locator('[data-paint-tool="rect"]').click();await page.locator('[data-paint-color="blue"]').click();const r=await page.locator('#paint-canvas').boundingBox();await page.mouse.move(r.x+150/600*r.width,r.y+65/300*r.height);await page.mouse.down();await page.mouse.move(r.x+450/600*r.width,r.y+235/300*r.height,{steps:8});await page.mouse.up();await page.locator('#paint-save').click();}
      if(kind==='pdf'){await page.locator('[data-pdf-page="2"]').click();await page.locator('#pdf-search').fill('验证码');await page.locator('#pdf-highlight').click();await page.locator('#pdf-target').click();}
      await page.locator('#success-banner').waitFor({state:'visible'});await page.screenshot({path:`test-results/app-${kind}.png`});await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({islands:journey.length,workshopCounts:journey.map(l=>l.count),apps:['browser','paint','pdf'],voyageFrames:flight,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
