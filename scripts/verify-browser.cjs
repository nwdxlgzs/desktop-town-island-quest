const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const solveOffice=require('./solve-office.cjs');

(async()=>{
  const browser=await chromium.launch({headless:true});
  // The full course verifies CSS coordinates and physics at reduced raster density;
  // verify-world and verify-features separately inspect the scene at native density.
  const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:.5,permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await fs.mkdir('test-results',{recursive:true});
  await page.addInitScript(()=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,seed:314159,currentLevel:0,unlocked:0,completed:[],sound:false}));});
  await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__quest?.world);
  const snapshot=()=>page.evaluate(()=>window.__quest.world.getDebugSnapshot());
  let initial=await snapshot();
  assert.equal(initial.islandCount,1);
  assert.equal(await page.locator('[data-level="1"]').isDisabled(),true);
  const instructions=await page.locator('#map-instructions').boundingBox(),canvas=await page.locator('#world-container').boundingBox();
  assert.ok(instructions.y>=canvas.y+canvas.height,'map instruction obscures the canvas');
  // Walk to the first workshop, then keyboard movement must stop at its visible counter.
  const approach=initial.layout.workshops[0].approach;await page.evaluate(p=>window.__quest.world.walkTo(p),{x:approach[0],z:approach[1]});await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().routeRemaining===0,{},{timeout:30000});
  await page.keyboard.down('w');await page.waitForTimeout(1600);await page.keyboard.up('w');
  let moved=await snapshot(),counter=moved.layout.obstacles.find(o=>o.type==='counter');
  assert.ok(moved.position.z>=counter.z+counter.d/2+.26,'player walked through the counter');
  // Raycast a physical table, bypassing every HTML label.
  const point=await page.evaluate(()=>{const w=window.__quest.world,l=w.getDebugSnapshot().layout;return w.screenPoint(l.workshops[0].position[0]-.6,1.25+l.workshops[0].elevation,l.workshops[0].position[1]-.7);});
  await page.mouse.click(point.x,point.y);await page.locator('#modal-layer').waitFor({state:'visible'});
  await page.screenshot({path:'test-results/first-lesson.png'});
  const image=await page.screenshot();
  const visited=[],geometries=[];
  async function solve(id){await page.locator('#modal').evaluate(el=>Promise.allSettled(el.getAnimations().map(animation=>animation.finished)));const task=await page.evaluate(id=>window.__quest.tasks[id],id),p=task.params||{};
    if(!await solveOffice(page,task))switch(task.kind){
      case 'click':for(const el of await page.locator('.parcel.'+(p.targetColor||'green')).all())await el.click();break;
      case 'double':await page.locator('#toolbox').dblclick();break;
      case 'right':await page.locator('#fragile-parcel').click({button:'right'});await page.locator('[data-action="fragile"]').click();break;
      case 'wheel':await page.locator('#cargo-list').hover();await page.mouse.wheel(0,1800);await page.locator(`[data-cargo="${p.target??11}"]`).click();break;
      case 'middle':await page.locator('#beacon').click({button:'middle'});break;
      case 'select':{
        const box=await page.locator('#selection-text span').boundingBox();await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width+1,box.y+box.height/2,{steps:20});await page.mouse.up();break;}
      case 'drag':await page.locator('#drag-note').dragTo(page.locator('#drop-box'));break;
      case 'typing':case 'chinese':await page.locator('#typing-input').fill(p.expected||(task.kind==='chinese'?'我会使用电脑。':'Hello, PC!'));break;
      case 'repair':await page.locator('#typing-input').click();await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');await page.keyboard.press('Enter');break;
      case 'tab':await page.locator('#order-name').fill(p.name||'PC');await page.keyboard.press('Tab');await page.keyboard.insertText(p.count||'3');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');break;
      case 'copy':case 'cut':await page.locator('#source-input').click();await page.keyboard.press('Control+A');await page.keyboard.press(task.kind==='copy'?'Control+C':'Control+X');await page.locator('#destination-input').click();await page.keyboard.press('Control+V');break;
      case 'undo':{const mark=/[\u4e00-\u9fff]/.test(p.original||'')?'！':'!';await page.locator('#undo-input').click();await page.keyboard.press('End');await page.keyboard.insertText(mark);await page.keyboard.press('Control+Z');break;}
      case 'save':await page.locator('#save-input').fill(p.expected||'实验成功');await page.keyboard.press('Control+S');break;
      case 'crop':{
        const box=await page.locator('#crop-canvas').boundingBox(),r=p.crop||{x:160,y:75,w:540,h:350};const from={x:box.x+(r.x-4)/860*box.width,y:box.y+(r.y-4)/500*box.height},to={x:box.x+(r.x+r.w+4)/860*box.width,y:box.y+(r.y+r.h+4)/500*box.height};await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();await page.locator('#success-banner').waitFor({state:'visible'});const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('#download-crop').click()]);assert.ok(download.suggestedFilename().endsWith('.png'));break;}
      case 'capture':await page.locator('#image-file').setInputFiles({name:'system-screenshot.png',mimeType:'image/png',buffer:image});break;
      case 'delivery':await page.locator('#message-file').dblclick();await page.locator('#message-input').press('Control+A');await page.keyboard.insertText(p.expected||'任务完成，出发！');await page.keyboard.press('Control+S');break;
      default:throw new Error(`Unknown exercise kind ${task.kind}`);
    }
    await page.locator('#success-banner').waitFor({state:'visible',timeout:5000});
    assert.equal(await page.evaluate(id=>window.__quest.state.completed.includes(id),id),true,`exercise ${id} did not finish`);
  }
  const islandCount=await page.evaluate(()=>window.__quest.levels.length);
  for(let index=0;index<islandCount;index++){
    const level=await page.evaluate(index=>window.__quest.levels[index],index),layout=(await snapshot()).layout;
    visited.push({id:level.id,workshops:layout.workshops.length,size:[layout.width,layout.depth]});
    if(index>0){
      assert.ok(layout.workshops.length>=3);
      await page.locator('#overview-camera').click();await page.waitForTimeout(700);await page.screenshot({path:`test-results/island-${index+1}-overview.png`});
      await page.locator('#overview-camera').click();await page.locator('#go-station').click();
    }
    const walkingSamples=new Set([0,Math.floor(layout.workshops.length/2),layout.workshops.length-1]);
    for(const [workshopIndex,workshop] of layout.workshops.entries()){
      // Every exercise uses real DOM interactions. Native movement is exercised at
      // the first/middle/last workshop; the small generator samples and cliff rules are checked separately.
      if(!walkingSamples.has(workshopIndex))await page.evaluate(id=>window.__quest.openTask(id),workshop.tasks[0]);
      try{await page.locator('#modal-layer').waitFor({state:'visible',timeout:120000});}catch(e){console.log('navigation failed',await snapshot());await page.screenshot({path:'test-results/navigation-failed.png'});throw e;}
      for(let i=0;i<workshop.tasks.length;i++){
        const id=workshop.tasks[i];console.log('solve',index+1,workshop.id,id);await solve(id);
        await page.locator('#next-task').click();
      }
      if(workshop!==layout.workshops.at(-1)){
        assert.equal(await page.evaluate(()=>window.__quest.world.isTraveling()),false,'finishing one workshop sailed away early');
      }
    }
    await page.waitForFunction(()=>window.__quest.world.isTraveling(),{},{timeout:120000});
    const traveling=await snapshot();assert.equal(traveling.islandCount,index===islandCount-1?1:2);
    if(index===0)await page.screenshot({path:'test-results/voyage.png'});
    await page.waitForFunction(()=>!window.__quest.world.isTraveling(),{},{timeout:15000});
    const after=await snapshot();assert.equal(after.islandCount,1);geometries.push(after.geometryCount);
    if(index<islandCount-1)assert.equal(await page.evaluate(()=>window.__quest.state.currentLevel),index+1);
    if(index===1){const before=JSON.stringify(after.layout);await page.reload();await page.waitForFunction(()=>window.__quest?.world);assert.equal(JSON.stringify((await snapshot()).layout),before,'refresh changed the island');}
  }
  assert.equal(await page.evaluate(()=>window.__quest.state.completed.length),243);
  assert.equal(await page.evaluate(()=>window.__quest.state.graduated),true);
  assert.ok(Math.max(...geometries)<700,'geometry resources accumulated across voyages');
  const exported=page.waitForEvent('download');await page.locator('#export-report').click();const download=await exported;await download.saveAs('test-results/report.json');const report=JSON.parse(await fs.readFile('test-results/report.json','utf8'));assert.equal(report.completed,243);assert.equal(report.total,243);assert.equal(report.missionCount,81);assert.equal(report.completedMissions,81);assert.equal(report.estimatedChallengeMinutes,45);assert.equal(report.challengesPerMinute,1.8);assert.equal(report.islands.length,islandCount);assert.equal(report.graduated,true);
  await page.screenshot({path:'test-results/graduation.png'});await page.keyboard.press('Escape');
  // An unlocked prior island can be revisited only through the boat.
  await page.locator('[data-level="0"]').click();assert.equal(await page.evaluate(()=>window.__quest.state.currentLevel),islandCount-1);await page.waitForFunction(()=>window.__quest.state.currentLevel===0,{},{timeout:120000});
  const notice=await page.locator('#toast').boundingBox(),map=await page.locator('#world-container').boundingBox();
  assert.ok(notice.y>=map.y+map.height,'arrival notice obscures the map');
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test-results/map-${viewport.width}.png`});await page.locator('#replay-island').click();await page.screenshot({path:`test-results/lesson-${viewport.width}.png`});await page.keyboard.press('Escape');
  }
  const offline=await context.newPage(),requests=[];offline.on('pageerror',e=>errors.push(e.message));offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await context.setOffline(true);await offline.goto(pathToFileURL(path.resolve('dist/index.html')).href);await offline.locator('#world-loading').waitFor({state:'detached'});assert.equal(await offline.locator('[data-level]').count(),islandCount);assert.deepEqual(requests,[]);assert.equal(await offline.evaluate(()=>!!window.__quest),false,'development helpers shipped in release');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({visited,geometries,errors,offlineRequests:requests},null,2));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
