const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const solveOffice=require('./solve-office.cjs');

(async()=>{
  let browser,server;
  try{
    const {createServer}=await import('vite');
    server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1120,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await fs.mkdir('test-results',{recursive:true});
    const url=server.resolvedUrls.local[0];
    await page.route('**/__learning.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"></head><body style="display:block"><main style="max-width:900px;margin:20px auto"><div id="exercise" class="exercise"></div><p id="feedback"></p></main><script type="module">import {mountExercise} from '/src/exercises.js';import {tasks,taskIds} from '/src/curriculum.js';let cleanup;window.practice={tasks,taskIds,mount(id){cleanup?.();this.success=0;cleanup=mountExercise(id,document.querySelector('#exercise'),{success:()=>{this.success++;return true;},sound(){},feedback(text){document.querySelector('#feedback').textContent=text;},capture:()=>''});}};</script></body></html>`}));
    await page.goto(url+'__learning.html');await page.waitForFunction(()=>!!window.practice);
    const mount=id=>page.evaluate(id=>practice.mount(id),id);
    const representatives=await page.evaluate(()=>[...new Set(practice.taskIds.map(id=>practice.tasks[id].kind))].map(kind=>practice.taskIds.find(id=>practice.tasks[id].kind===kind)));
    for(const id of representatives){
      await mount(id);await page.locator('#exercise-teaching').click();await page.locator('.exercise-demo-layer').waitFor();assert.equal(await page.locator('.demo-exercise').count(),1,id);await page.locator('.demo-close').click();await page.locator('.teaching-written summary').click();
      assert.ok(await page.locator('.teaching-steps li').count()>=2,id);
      assert.doesNotMatch(await page.locator('#exercise-teaching-content').innerText(),/undefined|\{\w+\}/,id);
      await page.locator('.teaching-written summary').click();assert.equal(await page.locator('#exercise-teaching-content').isVisible(),false,id);
    }
    // Opening teaching keeps the student's current inputs intact.
    await mount('typing');await page.locator('#typing-input').fill('Hello');await page.locator('#exercise-teaching').click();await page.locator('.demo-close').click();assert.equal(await page.locator('#typing-input').inputValue(),'Hello');
    await mount('files');await page.locator('[data-file="1"]').click();await page.locator('[data-fm-action="delete"]').click();assert.equal(await page.locator('[data-file="1"]').count(),0);assert.match(await page.locator('.exercise-recovery').innerText(),/重置本题/);await page.locator('#fm-check').click();assert.equal(await page.evaluate(()=>practice.success),0);
    await page.locator('#fm-reset').click();assert.equal(await page.locator('[data-file]').count(),4);assert.equal(await page.locator('.exercise-recovery').isVisible(),false);assert.equal(await page.locator('.exercise-coach li.done').count(),0);
    await page.locator('#new-folder').click();await page.locator('#folder-name').fill('临时');await page.locator('#folder-name').press('Delete');assert.equal(await page.locator('[data-folder]').count(),1,'Delete edits names without removing the selected folder');await page.locator('#folder-name').fill('临时');await page.locator('#folder-name').press('Enter');
    await page.locator('[data-folder]').click({button:'right'});await page.locator('[data-context="delete"]').click();assert.equal(await page.locator('[data-folder]').count(),0);assert.equal(await page.locator('.exercise-recovery').isVisible(),false);
    await page.locator('[data-file="0"]').click();await page.keyboard.press('Delete');assert.equal(await page.locator('[data-file="0"]').count(),0);await page.locator('#fm-reset').click();
    const copy=await page.evaluate(()=>{const id=practice.taskIds.find(id=>practice.tasks[id].kind==='files'&&practice.tasks[id].params.operation==='copy');return {id,task:practice.tasks[id]};});
    await mount(copy.id);await page.locator('#new-folder').click();await page.locator('#folder-name').fill(copy.task.params.folder);await page.locator('#folder-name').press('Enter');
    for(const [j,i] of copy.task.params.targets.entries())await page.locator(`[data-file="${i}"]`).click({modifiers:j?['Control']:[]});
    await page.keyboard.press('Control+X');assert.equal(await page.locator('.exercise-recovery').isVisible(),false,'cut alone has not moved the originals');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');assert.match(await page.locator('.exercise-recovery').innerText(),/原件已被移动/);
    // The reported cut-then-copy dead end stays visibly flagged, with one-click recovery.
    await page.locator('[data-file]').first().click();await page.keyboard.press('Control+C');await page.locator('#fm-check').click();assert.equal(await page.evaluate(()=>practice.success),0);await page.screenshot({path:'test-results/learning-file-reset.png'});
    await page.locator('#fm-reset').click();await solveOffice(page,copy.task);assert.equal(await page.evaluate(()=>practice.success),1,'correct copy succeeds after reset');
    // A mistaken duplicate can be deleted without invalidating originals.
    await mount(copy.id);const p=copy.task.params;await page.locator('#new-folder').click();await page.locator('#folder-name').fill(p.folder);await page.locator('#folder-name').press('Enter');
    for(const [j,i] of p.targets.entries())await page.locator(`[data-file="${i}"]`).click({modifiers:j?['Control']:[]});await page.keyboard.press('Control+C');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');await page.locator('[data-file]').first().click();await page.keyboard.press('Delete');assert.equal(await page.locator('.exercise-recovery').isVisible(),false);
    await page.locator('#fm-up').click();await page.locator(`[data-file="${p.targets[0]}"]`).click();await page.keyboard.press('Control+C');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');await page.locator('#fm-check').click();assert.equal(await page.evaluate(()=>practice.success),1);
    await mount('cut');await page.locator('#source-input').fill('误删后的文字');assert.match(await page.locator('.exercise-recovery').innerText(),/正确剪切之前/);await page.locator('.exercise-recovery button').click();assert.equal(await page.locator('#source-input').inputValue(),await page.evaluate(()=>practice.tasks.cut.params.recipe||'查来源，看日期，核实重要信息。'));
    // Configured sites may have multiple downloadable sources. Occupying the
    // required name with a different source must provide an immediate reset.
    const download=await page.evaluate(()=>{const id=practice.taskIds.find(id=>practice.tasks[id].kind==='browser-download'),original=practice.tasks[id],params=structuredClone(original.params),other=params.pages.find(page=>!params.targetIds.includes(page.id));other.download={name:'其他资料.txt',content:'其他来源'};practice.tasks.__downloadRecovery={...original,params};return {task:practice.tasks.__downloadRecovery,other:other.address};});
    await mount('__downloadRecovery');await page.locator('#browser-address').fill(download.other);await page.locator('#browser-address').press('Enter');await page.locator('#browser-download-file').click();await page.locator('#browser-save-name').fill(download.task.params.downloadName);await page.locator('#browser-save-folder').selectOption(download.task.params.downloadFolder||'下载');await page.locator('#browser-save-form').getByRole('button',{name:'保存文件'}).click();assert.match(await page.locator('.exercise-recovery').innerText(),/占用了本题目标文件/);await page.locator('.exercise-recovery button').click();await solveOffice(page,download.task);assert.equal(await page.evaluate(()=>practice.success),1);
    await page.setViewportSize({width:390,height:850});await mount(copy.id);await page.locator('.teaching-written summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/learning-tutorial-mobile.png'});

    // Tour fixture exercises the actual controller with game actions behind it.
    await page.setViewportSize({width:1120,height:900});
    await page.route('**/__tour.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="UTF-8"></head><body><button id="fullscreen">全屏</button><div id="world-container" style="height:400px"><button id="game-action">工坊</button></div><button id="island-route">航线</button><button id="quality-settings">设置</button><script type="module">import {createOnboarding} from '/src/onboarding.js';window.tourTest={completed:0,actions:0};document.querySelector('#fullscreen').onclick=()=>document.body.classList.add('immersive-mode');document.querySelector('#game-action').onclick=()=>tourTest.actions++;window.tour=createOnboarding({isComplete:()=>false,onComplete:()=>tourTest.completed++,isFullscreen:()=>document.body.classList.contains('immersive-mode')});tour.start();</script></body></html>`}));
    await page.goto(url+'__tour.html');await page.locator('.onboarding-layer').waitFor();await page.locator('#fullscreen').click();assert.equal(await page.locator('.onboarding-layer').getAttribute('data-step'),'1');assert.match(await page.locator('#onboarding-required').innerText(),/只打开全屏还没有完成/);
    // A real click through the highlighted world area must be blocked and reinforce the instructions.
    await page.locator('#game-action').click({force:true});assert.equal(await page.evaluate(()=>tourTest.actions),0);assert.equal(await page.locator('.needs-attention').count(),1);assert.match(await page.locator('#onboarding-required').innerText(),/游戏仍在暂停/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.onboarding-layer').count(),1);assert.equal(await page.evaluate(()=>tourTest.completed),0);await page.screenshot({path:'test-results/learning-tour-required.png'});
    await page.locator('#onboarding-next').click();await page.locator('#onboarding-back').click();assert.equal(await page.locator('.onboarding-layer').getAttribute('data-step'),'1');
    await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();assert.equal(await page.locator('.onboarding-layer').count(),0);assert.equal(await page.evaluate(()=>tourTest.completed),1);
    await page.locator('#game-action').click();assert.equal(await page.evaluate(()=>tourTest.actions),1);await page.evaluate(()=>tour.start(true));await page.locator('#onboarding-skip').click();assert.equal(await page.evaluate(()=>tourTest.completed),2);
    assert.deepEqual(errors,[]);

    // The delivered offline file permanently unlocks the current save.
    const offline=await browser.newPage({viewport:{width:1200,height:900}}),offlineErrors=[],network=[];offline.on('pageerror',error=>offlineErrors.push(error.message));offline.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    const original=JSON.stringify({version:3,routeVersion:1,seed:7,completed:[],onboardingVersion:1,sound:false});
    await offline.addInitScript(value=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',value);},original);
    const file=pathToFileURL(path.resolve('dist/index.html')).href;
    await offline.goto(file);await offline.locator('#world-loading').waitFor({state:'detached',timeout:20000});for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])await offline.keyboard.press(key);await offline.locator('#fullscreen').click();await offline.locator('#teaching-library-world').click();assert.equal(await offline.locator('[data-teaching-kind]').count(),40);
    for(const kind of await offline.locator('[data-teaching-kind]').evaluateAll(buttons=>buttons.map(b=>b.dataset.teachingKind))){await offline.locator(`[data-teaching-kind="${kind}"]`).click();assert.ok(await offline.locator('#teaching-example option').count()>0);assert.ok(await offline.locator('.teaching-example-content .teaching-steps li').count()>=2);await offline.locator('#teaching-watch').click();await offline.locator('.exercise-demo-layer').waitFor();assert.equal(await offline.locator('.demo-exercise').count(),1);await offline.locator('.demo-close').click();await offline.locator('#teaching-practice').click();assert.equal(await offline.locator('#exercise-teaching').count(),1);}
    await offline.locator('[data-teaching-kind="files"]').click();await offline.locator('#teaching-example').selectOption(copy.id);await offline.locator('#teaching-watch').click();await offline.locator('.demo-speed').selectOption('2');await offline.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:25000});await offline.screenshot({path:'test-results/learning-offline-auto-files.png'});await offline.locator('.demo-close').click();
    await offline.locator('[data-teaching-kind="typing"]').click();await offline.locator('#teaching-watch').click();await offline.locator('.demo-speed').selectOption('2');await offline.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:15000});await offline.locator('.demo-close').click();await offline.locator('#teaching-practice').click();await offline.locator('#typing-input').fill(await offline.locator('.typing-desk .target-copy strong').innerText());assert.match(await offline.locator('.teaching-library-status').innerText(),/教学练习完成/);
    const unlocked=await offline.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.equal(unlocked.unlockedMode,true);assert.equal(unlocked.completed.length,243);assert.equal(unlocked.seed,7);await offline.screenshot({path:'test-results/learning-unlocked-library.png'});
    await offline.setViewportSize({width:390,height:850});assert.equal(await offline.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await offline.screenshot({path:'test-results/learning-library-mobile.png'});
    await offline.keyboard.press('Escape');await offline.goto(file);await offline.locator('#world-loading').waitFor({state:'detached',timeout:20000});assert.equal(await offline.locator('#teaching-library-nav').count(),1);
    assert.deepEqual(offlineErrors,[]);assert.deepEqual(network,[]);
    console.log(JSON.stringify({tutorialKinds:representatives.length,teachingPreservesInputs:true,deleteToolbarContextKeyboard:true,copyErrorResetAndSuccess:true,duplicateDeletionRecoverable:true,cutTextRecovery:true,tourBlocksUntilFinishedOrSkipped:true,unlockedLibraryKinds:40,isolatedDemonstrations:true,mobileNoOverflow:true,offlineErrors,network},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
