const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

// One teacher session, all question UIs, and one small imported student course.
// Student renderer is disabled here; map/render regressions have separate checks.
(async()=>{
  let server,browser;
  try{
    const built=process.argv.includes('--built');
    if(!built){const {createServer}=await import('vite'),{teacherPreviewPlugin}=await import('./teacher-preview-plugin.mjs');server=await createServer({configFile:false,cacheDir:'.tmp-teacher-vite',plugins:[teacherPreviewPlugin()],server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();}
    if(built){await fs.mkdir('test-results/single-teacher',{recursive:true});await fs.copyFile('dist/teacher.html','test-results/single-teacher/teacher.html');}
    const url=file=>built?pathToFileURL(path.resolve(file==='teacher.html'?'test-results/single-teacher':'dist',file)).href:server.resolvedUrls.local[0]+file;
    const {defaultCourse,validateCourse}=await import('../src/course-config.js'),{questionTemplates,newTaskVariant}=await import('../src/teacher/catalog.js');
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1680,height:1050},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],network=[];
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
    if(built)context.on('request',r=>{if(/^https?:/.test(r.url())||r.url().includes('teacher-preview.html'))network.push(r.url());});
    await fs.mkdir('test-results',{recursive:true});
    await page.goto(url('teacher.html'));await page.locator('.teacher-header').waitFor();
    const preview=page.frameLocator('iframe');await preview.locator('#preview-exercise .exercise-teaching').waitFor();
    assert.equal(await page.locator('iframe').getAttribute('src'),null);assert.ok((await page.locator('iframe').getAttribute('srcdoc')).length>(built?10000:200));
    assert.match(await page.locator('.course-summary').innerText(),/81 个工坊 · 243 道题目/);
    await page.getByRole('textbox',{name:'题目名称',exact:true}).fill('教师审核题目');
    await page.getByRole('textbox',{name:'学生看到的题干',exact:true}).fill('请收集绿色资料包，留意标签的位置。');
    await preview.locator('#preview-instruction').filter({hasText:'请收集绿色资料包'}).waitFor();
    await preview.locator('.parcel.green').first().waitFor();
    for(const item of await preview.locator('.parcel.green').all())await item.click();
    await preview.locator('#preview-feedback').filter({hasText:'试做成功'}).waitFor();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出课程 JSON',exact:true}).click();const file=await download,exported=JSON.parse(await fs.readFile(await file.path(),'utf8'));
    assert.deepEqual(validateCourse(exported).errors,[]);assert.equal(exported.variants[exported.missions[0].tasks[0]].title,'教师审核题目');
    await page.screenshot({path:`test-results/teacher-${built?'offline':'dev'}.png`});
    const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('desktop-quest-v3'))));
    for(const {task}of questionTemplates){
      await page.evaluate(task=>document.querySelector('iframe').contentWindow.postMessage({type:'quest-teacher-preview',task},'*'),task);
      await preview.locator('#preview-instruction').filter({hasText:task.instruction}).waitFor();
      assert.equal(await preview.locator('#preview-exercise .exercise-teaching').count(),1,task.kind);
      assert.doesNotMatch(await preview.locator('#preview-feedback').innerText(),/题目材料有误/,task.kind);
    }
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('desktop-quest-v3')))),before,'preview does not create/change student progress');

    const task={...questionTemplates.find(t=>t.task.kind==='files').task,params:{files:['来源.txt','保留.csv','报告.pdf'],targets:[0,2],folder:'归档',operation:'move'}};
    await page.evaluate(task=>document.querySelector('iframe').contentWindow.postMessage({type:'quest-teacher-preview',task},'*'),task);
    await preview.locator('#exercise-teaching').click();await preview.locator('.demo-speed').selectOption('2');await preview.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:25000});await preview.locator('.demo-close').click();
    assert.equal(await preview.locator('#fm-items [data-folder]').count(),0,'custom material demonstration keeps original preview untouched');
    await preview.locator('#new-folder').click();await preview.locator('#folder-name').fill('归档');await preview.locator('#folder-name').press('Enter');
    await preview.locator('[data-entry="file-0"]').click();await page.keyboard.down('Control');await preview.locator('[data-entry="file-2"]').click();await page.keyboard.up('Control');
    await preview.locator('[data-entry="file-0"]').dragTo(preview.locator('#fm-tree [data-nav="folder-0"]'));
    assert.equal(await preview.locator('#fm-items [data-entry][data-file]').count(),1);
    await preview.locator('#fm-tree [data-nav="folder-0"]').click();assert.equal(await preview.locator('#fm-items [data-entry][data-file]').count(),2);
    await preview.locator('#fm-check').click();await preview.locator('#preview-feedback').filter({hasText:'整理好'}).waitFor();
    // Sidebar folder as source, nested destination, Ctrl-copy, and self-cycle rejection.
    await preview.locator('#fm-tree [data-nav="root"]').click();await preview.locator('#new-folder').click();await preview.locator('#folder-name').fill('备份');await preview.locator('#folder-name').press('Enter');
    await page.keyboard.down('Control');await preview.locator('#fm-tree [data-nav="folder-0"]').dragTo(preview.locator('#fm-tree [data-nav="folder-1"]'));await page.keyboard.up('Control');
    await preview.locator('#fm-tree [data-nav="folder-1"]').click();assert.equal(await preview.locator('#fm-items [data-folder]').count(),1);
    await preview.locator('#fm-items [data-folder]').dblclick();assert.equal(await preview.locator('#fm-items [data-file]').count(),2);
    const copyId=await preview.locator('#fm-tree button.active').getAttribute('data-nav');
    await preview.locator('#fm-tree [data-nav="folder-1"]').dragTo(preview.locator(`#fm-tree [data-nav="${copyId}"]`));
    assert.match(await preview.locator('#preview-feedback').innerText(),/自己/);
    await preview.locator('#fm-tree [data-nav="root"]').click();await preview.locator('#new-folder').click();await preview.locator('#folder-name').fill('');await preview.locator('.fm-assignment').click();
    assert.equal(await preview.locator('#folder-name').count(),0,'empty rename releases focus');assert.match(await preview.locator('#fm-items').innerText(),/新建文件夹/);
    await page.screenshot({path:`test-results/teacher-files-${built?'offline':'dev'}.png`});

    const small=structuredClone(defaultCourse);small.missions=small.missions.slice(0,1);small.variants={};small.targetMinutes=5;
    small.missions[0].name='教师自定义工坊';small.missions[0].tasks=['teacher-a','teacher-b','teacher-c'];
    for(const id of small.missions[0].tasks){small.variants[id]=newTaskVariant(questionTemplates.find(t=>t.task.kind==='click'));small.variants[id].params.targetColor='green';}
    small.variants['teacher-a'].title='教师自定义挑战';
    await page.locator('input[type="file"]').setInputFiles({name:'课程.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(small))});
    await page.getByRole('button',{name:'载入课程',exact:true}).click();await page.locator('.course-summary').filter({hasText:'1 个工坊 · 3 道题目'}).waitFor();
    // Adding any of the 40 templates must work without the shipped variant graph.
    await page.getByRole('combobox',{name:'添加题型'}).click();await page.getByRole('combobox',{name:'添加题型'}).fill('文件');
    await page.locator('.ant-select-item-option').filter({hasText:'文件'}).first().click();
    await preview.locator('#new-folder').waitFor();
    assert.equal(await page.locator('.validation-errors').count(),0);

    const student=await context.newPage();await student.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};});
    await student.goto(url('index.html'));await student.locator('.fallback').waitFor();
    await student.locator('#onboarding-skip').click();await student.locator('#progress-nav').click();
    const originalSave=await student.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));
    await student.locator('#import-course').setInputFiles({name:'课程.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(small))});
    await student.locator('#course-preview button').click();await student.locator('#station-focus h2').filter({hasText:'教师自定义工坊'}).waitFor();
    await student.locator('#onboarding-skip').click();
    assert.match(await student.locator('.route-heading').innerText(),/1 个岛 · 1 个工坊/);
    await student.locator('#go-station').click();await student.locator('.parcel.green').first().waitFor();
    for(const item of await student.locator('#modal .parcel.green').all())await item.click();
    await student.waitForFunction(()=>Object.entries(localStorage).some(([k,v])=>k.includes('-course-')&&JSON.parse(v).completed?.includes('teacher-a')));
    await student.keyboard.press('Escape');await student.locator('#progress-nav').click();await student.locator('#default-course').click();
    await student.locator('#station-focus h2').waitFor();
    const restored=await student.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));
    assert.equal(restored.seed,originalSave.seed);assert.deepEqual(restored.completed,originalSave.completed);assert.equal(restored.onboardingVersion,originalSave.onboardingVersion);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log(JSON.stringify({built,templates:40,livePreview:true,previewNoProgressWrites:true,recursiveSidebarDrag:true,ctrlDragCopy:true,selfCycleRejected:true,emptyRenameBlur:true,teacherImportExport:true,studentCourseCompletion:true,defaultProgressRestored:true,errors,network},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
