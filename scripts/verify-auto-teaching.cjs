const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

(async()=>{
  let browser,server;
  try{
    const {createServer}=await import('vite');server=await createServer({configFile:false,cacheDir:'.tmp-auto-teaching-vite',optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__auto.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"></head><body style="display:block"><main class="lesson-main"><div id="exercise" class="exercise"></div></main><script type="module">import {openExerciseDemo} from '/src/exercise-demo.js';import {mountExercise} from '/src/exercises.js';import {tasks,taskIds} from '/src/curriculum.js';window.autoTest={tasks,taskIds,open(id,options={}){this.demo?.dispose();return this.demo=openExerciseDemo(id,{autoplay:false,timing:0,...options});},mount(id){this.cleanup?.();this.success=0;this.cleanup=mountExercise(id,document.querySelector('#exercise'),{success:()=>{this.success++;return true;},feedback(){},sound(){},capture:()=>''});}};</script></body></html>`}));
    await page.goto(server.resolvedUrls.local[0]+'__auto.html');await page.waitForFunction(()=>!!window.autoTest);
    const ids=await page.evaluate(()=>autoTest.taskIds),report=[];
    for(const id of ids){
      const result=await page.evaluate(async id=>{try{const demo=autoTest.open(id);const completed=await demo.runAll();const result={id,kind:autoTest.tasks[id].kind,completed,steps:demo.count,error:document.querySelector('.exercise-demo-layer').dataset.error,feedback:document.querySelector('.demo-feedback').textContent};demo.dispose();return result;}catch(error){return {id,error:error.stack};}},id);
      report.push(result);if(!result.completed){console.log(JSON.stringify(result,null,2));await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/auto-teaching-failure.png'});throw new Error('Demonstration did not complete: '+id);}
    }
    assert.deepEqual(errors,[]);
    // A regular learner opens an actual independent UI; pausing freezes it,
    // replay starts over, and closing preserves the unfinished original.
    await page.evaluate(()=>autoTest.mount('typing'));await page.locator('#exercise #typing-input').fill('My unfinished answer');const classroom=await page.evaluate(()=>localStorage.getItem('desktop-quest-v3'));
    await page.locator('#exercise-teaching').click();await page.locator('.demo-target').waitFor();await page.locator('.demo-pause').click();const before=await page.locator('.demo-exercise').innerHTML();await page.waitForTimeout(300);assert.equal(await page.locator('.demo-exercise').innerHTML(),before);
    await page.screenshot({path:'test-results/auto-teaching-paused.png'});await page.locator('.demo-replay').click();await page.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:15000});await page.screenshot({path:'test-results/auto-teaching-typing.png'});
    await page.locator('.demo-close').click();assert.equal(await page.locator('#exercise #typing-input').inputValue(),'My unfinished answer');assert.equal(await page.evaluate(()=>autoTest.success),0);assert.equal(await page.evaluate(()=>localStorage.getItem('desktop-quest-v3')),classroom);
    const fileId=await page.evaluate(()=>autoTest.taskIds.find(id=>autoTest.tasks[id].kind==='files'&&autoTest.tasks[id].params.operation==='copy'));
    await page.evaluate(id=>autoTest.open(id,{autoplay:true,timing:.4}),fileId);await page.locator('.exercise-demo-layer[data-step="5"]').waitFor({timeout:20000});await page.locator('.demo-pause').click();await page.waitForTimeout(100);await page.screenshot({path:'test-results/auto-teaching-files.png'});await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/auto-teaching-mobile.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('.exercise-demo-layer').count(),0);
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/auto-teaching.json',JSON.stringify(report,null,2));console.log(JSON.stringify({questions:report.length,kinds:new Set(report.map(r=>r.kind)).size,allCompleted:true,independentOriginal:true,pauseReplayClose:true,mobile:true,errors},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
