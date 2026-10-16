const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const solve=require('./solve-office.cjs');

(async()=>{
  const course=await import('../src/curriculum.js');course.configureJourney(7);
  const id=course.taskIds.find(id=>course.tasks[id].kind==='browser'),task=course.tasks[id],level=course.levels.findIndex(l=>l.tasks.includes(id)),saved={version:3,routeVersion:1,seed:7,currentLevel:level,unlocked:level,completed:course.taskIds.filter(t=>t!==id),onboardingVersion:1,sound:false};
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    await page.addInitScript(save=>localStorage.setItem('desktop-quest-v3',JSON.stringify(save)),saved);await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});
    const before=Number(await page.locator('#xp-total').textContent());await page.locator('#go-station').click();await page.locator('.practice-browser').waitFor({timeout:25000});assert.equal(await page.locator('#modal-title').textContent(),task.title);await solve(page,task);await page.locator('#success-banner').waitFor({state:'visible'});
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.ok(after.completed.includes(id));assert.equal(Number(await page.locator('#xp-total').textContent())-before,task.xp);assert.equal(after.completed.length,243);assert.equal(await page.evaluate(()=>!!window.__quest),false);assert.equal(await page.locator('[data-game-stopped]').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/software-browser-offline.png'});console.log(JSON.stringify({task:id,level:level+1,ordinaryTaskCommitted:true,xpAwarded:task.xp,offlineOnly:true,errors,network},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
