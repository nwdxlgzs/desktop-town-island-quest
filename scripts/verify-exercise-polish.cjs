const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const solveOffice=require('./solve-office.cjs');

(async()=>{
  let browser,server;
  try{
    const {createServer}=await import('vite');
    server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    const url=server.resolvedUrls.local[0];browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1100,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__practice.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"></head><body style="display:block;background:#eff3eb"><main class="lesson-main" style="max-width:850px;margin:20px auto"><div id="exercise" class="exercise"></div><p id="feedback" role="status"></p></main><script type="module">import {mountExercise} from '/src/exercises.js';import {tasks,taskIds} from '/src/curriculum.js';let cleanup;window.practice={tasks,taskIds,mount(id='files'){cleanup?.();this.success=0;document.querySelector('#feedback').textContent='';cleanup=mountExercise(id,document.querySelector('#exercise'),{success:()=>{this.success++;return true;},sound(){},feedback(text){document.querySelector('#feedback').textContent=text;},capture:()=>''});}};practice.mount();</script></body></html>`}));
    await page.goto(url+'__practice.html');await page.waitForFunction(()=>!!window.practice);
    await fs.mkdir('test-results',{recursive:true});
    const mount=id=>page.evaluate(id=>practice.mount(id),id),count=()=>page.evaluate(()=>practice.success);
    // A folder is a real row; default naming, invalid rename, and context menu.
    await page.locator('#new-folder').click();assert.equal(await page.locator('[data-folder]').count(),1);await page.locator('#folder-name').press('Enter');
    await page.locator('[data-folder]').click({button:'right'});await page.screenshot({path:'test-results/file-manager-context.png'});await page.locator('[data-context="rename"]').click();
    await page.locator('#folder-name').fill('bad/name');await page.locator('#folder-name').press('Enter');assert.match(await page.locator('#feedback').innerText(),/名称/);
    await page.locator('#folder-name').fill('查证资料');await page.locator('#folder-name').press('Enter');
    await page.locator('[data-file="0"]').click();await page.locator('[data-file="2"]').click({modifiers:['Control']});assert.equal(await page.locator('.fm-entry.selected').count(),2);
    await page.locator('[data-folder]').dblclick();assert.equal(await page.locator('[data-file]').count(),0);assert.equal(await count(),0,'double-click only navigates');await page.locator('#fm-check').click();assert.match(await page.locator('#feedback').innerText(),/还缺/);
    await page.locator('#fm-address [data-nav="root"]').click();await page.locator('[data-file="0"]').click();await page.locator('[data-file="2"]').click({modifiers:['Control']});await page.keyboard.press('Control+X');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');
    assert.equal(await page.locator('[data-file]').count(),2);await page.screenshot({path:'test-results/file-manager-organized.png'});await page.locator('#fm-check').click();assert.equal(await count(),1);
    await page.locator('#fm-address [data-nav="root"]').click();assert.equal(await page.locator('[data-file]').count(),2,'moved originals leave root');
    // Incorrect contents remain editable; moving back and fixing is supported.
    await mount('files');await page.locator('#new-folder').click();await page.locator('#folder-name').fill('查证资料');await page.locator('#folder-name').press('Enter');
    for(const i of [0,1,2])await page.locator(`[data-file="${i}"]`).click({modifiers:['Control']});await page.keyboard.press('Control+X');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');await page.locator('#fm-check').click();assert.equal(await count(),0);assert.match(await page.locator('#feedback').innerText(),/临时草稿/);
    await page.locator('[data-file="1"]').click();await page.keyboard.press('Control+X');await page.locator('#fm-up').click();await page.keyboard.press('Control+V');await page.locator('#fm-check').click();assert.equal(await count(),1,'mistakes can be repaired');
    // Dragging a multi-selection into a folder really moves the same entries.
    await mount('files');await page.locator('#new-folder').click();await page.locator('#folder-name').fill('查证资料');await page.locator('#folder-name').press('Enter');await page.locator('[data-file="0"]').click();await page.locator('[data-file="2"]').click({modifiers:['Control']});await page.locator('[data-file="0"]').dragTo(page.locator('[data-folder]'));await page.locator('[data-folder]').dblclick();assert.equal(await page.locator('[data-file]').count(),2);await page.locator('#fm-check').click();assert.equal(await count(),1);
    // Cover each changed application with a single real DOM fixture, no maps.
    const cases=await page.evaluate(()=>['files','document','sheet','mail','settings','presentation','search','keys'].map(kind=>{const id=practice.taskIds.find(id=>practice.tasks[id].kind===kind&&(kind!=='files'||practice.tasks[id].params.operation==='copy'));return {id,task:practice.tasks[id]};}));
    const backup=cases.find(c=>c.task.kind==='files');await mount(backup.id);await page.locator('#new-folder').click();await page.locator('#folder-name').fill(backup.task.params.folder);await page.locator('#folder-name').press('Enter');
    for(const i of backup.task.params.targets){await page.locator(`[data-file="${i}"]`).click();await page.keyboard.press('Control+C');await page.locator('[data-folder]').dblclick();await page.keyboard.press('Control+V');await page.locator('#fm-up').click();}
    await page.locator('#fm-check').click();assert.equal(await count(),0);assert.match(await page.locator('#feedback').innerText(),/多选/,'correct copies without multi-select explain the missing skill');
    for(const {id,task}of cases){await mount(id);if(task.kind==='document'){assert.ok((await page.locator('#word-body').inputValue()).includes('____'));await page.screenshot({path:'test-results/practice-word-guide.png'});}await solveOffice(page,task);assert.equal(await count(),1,id);assert.equal(await page.locator('.exercise-coach .coach-now small').textContent(),'操作完成');if(task.kind==='document'){await page.locator('#word-body').fill('完成后继续试用编辑工具');assert.equal(await page.locator('.exercise-coach .coach-now small').textContent(),'操作完成');assert.equal(await page.locator('.exercise-coach li:not(.done)').count(),0);assert.equal(await count(),1);}}
    // Feedback identifies a particular field and focuses it, not a generic retry.
    const mail=cases.find(c=>c.task.kind==='mail');await mount(mail.id);await page.locator('#mail-send').click();assert.match(await page.locator('#feedback').innerText(),/收件地址/);assert.equal(await page.evaluate(()=>document.activeElement.id),'mail-to');assert.equal(await count(),0);
    await mount('files');await page.setViewportSize({width:390,height:850});await page.screenshot({path:'test-results/file-manager-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({realDirectories:true,contextRename:true,invalidNameRejected:true,doubleClickOnlyNavigates:true,cutPaste:true,dragMove:true,repairMistakes:true,applicationCases:cases.map(c=>c.task.kind),liveGuidance:true,completionStaysComplete:true,fieldFeedback:true,missingMultiSelectFeedback:true,mobileNoOverflow:true,errors},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(e=>{console.error(e);process.exit(1);});
