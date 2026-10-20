const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  let server,browser;
  try{
    const built=process.argv.includes('--built'),{journeyForSeed}=await import('../src/curriculum.js'),{normalizeQuality}=await import('../src/quality.js'),{progressFile}=await import('../src/progress-file.js');
    const save=(seed,completed=[])=>({version:3,routeVersion:1,seed,completed,currentLevel:0,unlocked:0,attempts:{},finishedAt:{},records:{},seconds:42,startedAt:'2026-10-20T00:00:00.000Z',graduated:false,onboardingVersion:1,sound:false,music:false,musicPreference:1,quality:normalizeQuality(),exploration:{shards:[],restored:[],species:[],sail:'cream'}});
    const minimum=level=>{const ids=level.workshops.map(w=>w.tasks[0]);for(const id of level.tasks)if(ids.length<Math.ceil(level.tasks.length*.6)&&!ids.includes(id))ids.push(id);return ids;};
    const initial=save(7,[journeyForSeed(7)[0].tasks[0]]),partial=save(18,minimum(journeyForSeed(18)[0]));partial.unlocked=1;
    if(!built){const {createServer}=await import('vite');server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();}
    const url=built?pathToFileURL(path.resolve('dist/index.html')).href:server.resolvedUrls.local[0];
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[],net=[];
    page.on('pageerror',e=>errors.push(e.message));if(built)page.on('request',request=>{if(/^https?:/.test(request.url()))net.push(request.url());});
    await page.addInitScript(initial=>{
      if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify(initial));
      // The exercised features must remain usable when a classroom GPU fails.
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};
    },initial);
    const ready=()=>page.locator('#station-focus h2').waitFor();
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));
    const open=async()=>{await page.locator('body:not(.has-modal) #progress-nav').click();await page.locator('#current-seed').waitFor();};
    const select=async value=>{await page.locator('#import-progress').setInputFiles({name:'进度.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(()=>document.querySelector('#progress-feedback').textContent||!document.querySelector('#import-preview').hidden);};
    const restore=async value=>{await select(value);await page.locator('#confirm-import').waitFor();await Promise.all([page.waitForEvent('load'),page.locator('#confirm-import').click()]);await ready();};
    await fs.mkdir('test-results',{recursive:true});await page.goto(url);await ready();
    assert.ok(await page.locator('.workshop-chip.untouched').count());assert.ok(await page.locator('.world-marker.workshop-pending').count());
    await page.locator('#boat-marker').click();assert.match(await page.locator('#toast').innerText(),/60%/);assert.equal((await stored()).currentLevel,0);
    await open();await page.screenshot({path:'test-results/progress-desktop.png',animations:'disabled'});
    const downloadEvent=page.waitForEvent('download');await page.locator('#export-progress').click();const download=await downloadEvent;await download.saveAs('test-results/progress-export.json');const exported=JSON.parse(await fs.readFile('test-results/progress-export.json','utf8'));
    assert.equal(exported.format,'desktop-town-island-quest-progress');assert.equal(exported.progress.seed,7);assert.deepEqual(exported.progress.completed,initial.completed);
    await select({title:'学习报告',completed:1});assert.match(await page.locator('#progress-feedback').innerText(),/学习报告/);assert.equal(await page.locator('#confirm-import').count(),0);assert.deepEqual((await stored()).completed,initial.completed);
    await select(progressFile(initial,true));assert.match(await page.locator('#progress-feedback').innerText(),/分别保存/);
    await restore(progressFile(partial));assert.equal((await stored()).seed,18);assert.deepEqual((await stored()).completed,partial.completed);
    assert.equal(await page.locator('#boat-marker.ready').count(),0,'60% must not trigger the full-completion boat prompt');assert.equal(await page.locator('#go-station').innerText().then(t=>t.includes('工坊')),true);
    await page.locator('#boat-marker').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).currentLevel===1);assert.equal((await stored()).unlocked,1);
    await page.locator('#station-list [data-level="0"]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).currentLevel===0);
    await open();assert.equal(await page.locator('#current-seed').inputValue(),'18');
    await page.locator('#new-adventure summary').click();await page.locator('#new-seed').fill('1234');await page.locator('#seed-form button[type="submit"]').click();assert.equal((await stored()).seed,18,'preparing must not reset');
    await Promise.all([page.waitForEvent('load'),page.locator('#confirm-new-adventure').click()]);await ready();assert.equal((await stored()).seed,1234);assert.equal((await stored()).completed.length,0);
    await open();await restore(exported);assert.equal((await stored()).seed,7);assert.deepEqual((await stored()).completed,initial.completed);
    await open();await restore(progressFile(save(7,journeyForSeed(7)[0].tasks)));assert.equal(await page.locator('#boat-marker.ready').count(),1);assert.match(await page.locator('#go-station').innerText(),/小船/);
    await page.locator('#fullscreen').click();await page.locator('#progress-world').click();assert.equal(await page.locator('#current-seed').inputValue(),'7');await page.setViewportSize({width:390,height:850});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/progress-mobile.png',animations:'disabled'});await page.locator('[data-close]').click();
    if(!built){
      await page.route('**/__rename.html',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"></head><body style="display:block"><div id="exercise" class="exercise"></div><button id="outside">外部按钮</button><script type="module">import {mountExercise} from '/src/exercises.js';window.cleanup=mountExercise('files',document.querySelector('#exercise'),{sound(){},feedback(){},success:()=>true,capture:()=>''});document.querySelector('#outside').onclick=()=>window.outsideClicks=(window.outsideClicks||0)+1;</script></body></html>`}));
      await page.setViewportSize({width:1200,height:950});await page.goto(server.resolvedUrls.local[0]+'__rename.html');await page.locator('#new-folder').click();await page.locator('#folder-name').fill('');await page.locator('#outside').click();assert.equal(await page.locator('#folder-name').count(),0);assert.equal(await page.evaluate(()=>outsideClicks),1);assert.match(await page.locator('[data-folder]').innerText(),/新建文件夹/);
      await page.locator('#new-folder').click();await page.locator('#folder-name').fill('');await page.locator('[data-file="0"]').click();assert.equal(await page.locator('#folder-name').count(),0);assert.equal(await page.locator('[data-file="0"]').getAttribute('aria-selected'),'true','first click after blur selects the file');assert.match(await page.locator('[data-folder]').nth(1).innerText(),/新建文件夹 \(2\)/);
      await page.locator('[data-folder]').nth(1).click();await page.locator('[data-fm-action="rename"]').click();await page.locator('#folder-name').fill('bad/name');await page.locator('#outside').click();assert.equal(await page.locator('#folder-name').count(),0);assert.equal(await page.evaluate(()=>outsideClicks),2);
      await page.locator('[data-folder]').first().click();await page.locator('[data-fm-action="rename"]').click();await page.locator('#folder-name').fill('bad/name');await page.keyboard.press('Enter');assert.equal(await page.locator('#folder-name').count(),1,'Enter allows correcting an invalid name');await page.keyboard.press('Escape');
      await page.locator('#new-folder').click();await page.locator('#folder-name').fill('');await page.locator('.fm-assignment').click();assert.equal(await page.locator('#folder-name').count(),0);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(net,[]);
    console.log(JSON.stringify({built,partialTravel:true,fullOnlyBoatPrompts:true,portableRestoreAcrossSeeds:true,seededRestart:true,invalidImportsPreserveProgress:true,immersiveAndMobile:true,renameBlur:!built,errors,networkRequests:net.length},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
