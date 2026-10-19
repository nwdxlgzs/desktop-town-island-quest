const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

(async()=>{
  let browser,server,page,clipboardBefore;
  try{
    const {createServer}=await import('vite');server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1200,height:1000}}),errors=[];page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));await fs.mkdir('test-results',{recursive:true});
    const url=server.resolvedUrls.local[0];await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
    await page.route('**/__reuse.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"></head><body style="display:block"><main class="lesson-main"><div class="exercise" id="exercise"></div></main><script type="module">import {openExerciseDemo} from '/src/exercise-demo.js';import {demoActions} from '/src/demo-actions.js';import {mountExercise} from '/src/exercises.js';import {tasks,taskIds} from '/src/curriculum.js';window.reuseTest={tasks,taskIds,demoActions,open(id,options={}){this.demo?.dispose();return this.demo=openExerciseDemo(id,{autoplay:false,timing:0,...options});},mount(id){this.cleanup?.();this.success=0;this.cleanup=mountExercise(id,document.querySelector('#exercise'),{success:()=>{this.success++;return true;},feedback(){},sound(){},capture:()=>''});}};</script></body></html>`}));
    await page.goto(url+'__reuse.html');await page.waitForFunction(()=>!!window.reuseTest);
    clipboardBefore=await page.evaluate(()=>navigator.clipboard.readText());await page.evaluate(()=>navigator.clipboard.writeText('Keep the learner clipboard'));
    const ids=await page.evaluate(()=>reuseTest.taskIds.filter(id=>reuseTest.demoActions(reuseTest.tasks[id]).some(action=>action.type==='copyText'))),report=[];
    for(const id of ids){
      const result=await page.evaluate(async id=>{
        const task=reuseTest.tasks[id],plan=reuseTest.demoActions(task),demo=reuseTest.open(id),layer=document.querySelector('.exercise-demo-layer'),copies=[],pastes=[],inputs=[];
        layer.addEventListener('copy',event=>{const el=event.target,selected=typeof el.value==='string'?el.value.slice(el.selectionStart,el.selectionEnd):getSelection().toString();copies.push({text:event.clipboardData.getData('text/plain'),selected,visible:el.getBoundingClientRect().height>0,source:el.textContent});},true);
        layer.addEventListener('paste',event=>{const el=event.target;pastes.push({target:el.id||el.dataset.cell,text:event.clipboardData.getData('text/plain'),before:el.value,start:el.selectionStart,end:el.selectionEnd});},true);
        layer.addEventListener('input',event=>{if(event.inputType==='insertFromPaste')inputs.push({target:event.target.id||event.target.dataset.cell,value:event.target.value});},true);
        const completed=await demo.runAll(),expected=plan.filter(action=>action.type==='copyText').map(action=>{const at=plan.indexOf(action);return plan[at-1].value;});
        const result={id,kind:task.kind,completed,expected,copies,pastes,inputs};demo.dispose();return result;
      },id);
      assert.equal(result.completed,true,id);assert.deepEqual(result.copies.map(copy=>copy.text),result.expected,id);
      assert.equal(result.copies.length,result.pastes.length,id);assert.equal(result.inputs.length,result.pastes.length,id);
      result.copies.forEach((copy,i)=>{assert.equal(copy.text,copy.selected,id);assert.equal(copy.visible,true,id);assert.ok(copy.source.includes(copy.text),id);assert.equal(result.pastes[i].text,copy.text,id);});
      result.pastes.forEach((paste,i)=>assert.equal(result.inputs[i].value,paste.before.slice(0,paste.start)+paste.text+paste.before.slice(paste.end),id));
      if(result.kind==='document'){
        const input=result.pastes.find(paste=>paste.target==='word-body');if(input.before.includes('____')){assert.equal(input.before.slice(input.start,input.end),'____',id);assert.ok(input.before.slice(0,input.start).endsWith('\n'),id);}
      }
      if(result.kind==='mail'){
        const input=result.pastes.find(paste=>paste.target==='mail-body');if(input?.before){assert.equal(input.start,input.before.length,id);assert.equal(input.end,input.before.length,id);}
      }
      report.push(result);
    }
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Keep the learner clipboard');
    // Native browser copy/paste must work too, including while the file list has focus.
    const fileId=ids.find(id=>report.find(result=>result.id===id).kind==='files');await page.evaluate(id=>reuseTest.mount(id),fileId);
    const folder=await page.evaluate(id=>reuseTest.tasks[id].params.folder,fileId);
    await page.evaluate(()=>{const source=document.querySelector('#exercise .fm-assignment'),node=source.querySelector('b:last-child').firstChild,range=document.createRange();document.querySelector('#fm-items').focus();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.keyboard.press('Control+c');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),folder);
    await page.locator('#exercise #new-folder').click();await page.keyboard.press('Control+v');assert.equal(await page.locator('#exercise #folder-name').inputValue(),folder);await page.keyboard.press('Enter');
    assert.ok(await page.locator('#exercise [data-folder]').innerText().then(text=>text.includes(folder)));
    const documentId=ids.find(id=>report.find(result=>result.id===id).kind==='document');await page.evaluate(id=>reuseTest.mount(id),documentId);
    await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#exercise .exercise-source-text'));getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.keyboard.press('Control+c');await page.locator('#exercise #word-body').click();await page.keyboard.press('Control+a');await page.keyboard.press('Control+v');assert.equal(await page.locator('#exercise #word-body').inputValue(),await page.evaluate(id=>reuseTest.tasks[id].params.body,documentId));
    await page.locator('#exercise #word-body').fill('未完成的自己的草稿');
    await page.evaluate(async id=>{await reuseTest.open(id).runAll();reuseTest.demo.dispose();},documentId);assert.equal(await page.locator('#exercise #word-body').inputValue(),'未完成的自己的草稿');assert.equal(await page.evaluate(()=>reuseTest.success),0);
    // Watch a real timed drag selection, pause on the source, then finish and replay.
    await page.evaluate(id=>reuseTest.open(id,{autoplay:true,timing:.3}),documentId);await page.waitForFunction(()=>document.querySelector('.demo-instruction span').textContent.startsWith('按 Ctrl+C'));
    await page.locator('.demo-pause').click();await page.waitForTimeout(100);await page.screenshot({path:'test-results/text-reuse-selection.png'});
    assert.ok(await page.evaluate(()=>getSelection().toString().length>0));await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.waitForFunction(()=>{const target=document.querySelector('.demo-target').getBoundingClientRect(),viewport=document.querySelector('.demo-viewport').getBoundingClientRect();return target.top>=viewport.top-1&&target.bottom<=viewport.bottom+1;});await page.screenshot({path:'test-results/text-reuse-mobile.png'});
    await page.locator('.demo-speed').selectOption('2');await page.locator('.demo-pause').click();await page.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:15000});
    await page.locator('.demo-replay').click();await page.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:20000});await page.locator('.demo-close').click();
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/text-reuse.json',JSON.stringify(report,null,2));console.log(JSON.stringify({questions:report.length,kinds:new Set(report.map(result=>result.kind)).size,visibleSources:true,clipboardEvents:true,preservesDrafts:true,nativeCopyPaste:true,systemClipboardPreserved:true,mobile:true,errors},null,2));
  }finally{if(page&&!page.isClosed()&&clipboardBefore!==undefined)await page.evaluate(text=>navigator.clipboard.writeText(text),clipboardBefore).catch(()=>{});await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
