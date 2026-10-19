const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const course=JSON.parse(fs.readFileSync('src/levels.json','utf8'));
const all=course.missions.flatMap(m=>m.tasks);
(async()=>{
  const {createJourney}=await import('../src/journey.js');const route=createJourney(course,314159),last=route.at(-1).tasks;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const legacy={version:3,routeVersion:1,seed:314159,currentLevel:route.length-1,unlocked:route.length-1,graduated:true,sound:false,music:false,completed:[...new Set([...all.filter(id=>!/-stage[23]$/.test(id)),...last])],records:{oldNote:'原有存档'}};
    await page.addInitScript(data=>localStorage.setItem('desktop-quest-v3',JSON.stringify(data)),legacy);
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__quest?.world);
    assert.equal(await page.evaluate(()=>window.__quest.state.graduated),false);
    await page.locator('#go-station').click();await page.waitForFunction(()=>window.__quest.world.isTraveling());
    assert.equal(await page.locator('#voyage-title').textContent(),'正在前往 · '+route[0].name);
    await page.waitForFunction(()=>!window.__quest.world.isTraveling()&&window.__quest.state.currentLevel===0,{},{timeout:15000});
    assert.equal(await page.evaluate(()=>window.__quest.state.graduated),false);
    assert.deepEqual(await page.evaluate(()=>window.__quest.state.completed),legacy.completed);
    assert.equal(await page.evaluate(()=>window.__quest.state.records.oldNote),'原有存档');
    assert.match(await page.locator('#toast').textContent(),/补齐新增任务/);
    // Also verify the final graduation branch after every new stage has been finished.
    await page.evaluate(ids=>{const q=window.__quest;q.state.completed=ids;q.state.currentLevel=q.levels.length-1;q.refresh();q.world.loadLevel(q.layout);},all);
    await page.locator('#go-station').click();await page.waitForFunction(()=>window.__quest.state.graduated,{},{timeout:15000});
    await page.locator('.report-modal').waitFor({state:'visible'});assert.deepEqual(errors,[]);
    console.log(JSON.stringify({legacy:'returns by boat to first unfinished island; original progress preserved',complete:'graduation requires all 243 stages',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
