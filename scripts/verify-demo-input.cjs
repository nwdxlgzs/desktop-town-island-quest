const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// Original question controls, visible input animations, and short real waits.
(async()=>{
  let server,browser;
  try{
    const {createServer}=await import('vite');server=await createServer({configFile:false,cacheDir:'.tmp-demo-input-vite',optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await fs.mkdir('test-results',{recursive:true});
    await page.route('**/__input.html',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/adventure.css"><body><script type="module">
      import {openExerciseDemo} from '/src/exercise-demo.js';import {tasks,taskIds} from '/src/curriculum.js';
      window.openInputDemo=(kind,timing=.35)=>{
        window.demo?.dispose();window.observer?.disconnect();window.inputLog=[];window.controlLog=[];
        const id=taskIds.find(id=>tasks[id].kind===kind);window.demo=openExerciseDemo(id,{autoplay:true,timing});
        const host=document.querySelector('.demo-input'),root=document.querySelector('.demo-exercise');
        const snapshot=()=>({type:host.dataset.type,phase:host.dataset.phase,pressed:host.dataset.pressed,mouse:host.dataset.mouse,mousePressed:host.dataset.mousePressed,keys:[...host.querySelectorAll('kbd')].map(k=>k.textContent),held:[...host.querySelectorAll('kbd[data-pressed="true"]')].map(k=>k.textContent),label:host.querySelector('.demo-input-label').textContent,time:performance.now(),fill:host.dataset.mouse?getComputedStyle(host.querySelector('[data-mouse="'+(host.dataset.mouse==='wheel'?'middle':host.dataset.mouse)+'"]')||host).fill:'',animation:[...host.querySelectorAll('kbd,[data-mouse]')].map(el=>getComputedStyle(el).animationName).filter(n=>n!=='none')});
        window.observer=new MutationObserver(records=>{if(records.some(r=>r.attributeName==='data-phase'||r.attributeName==='data-pressed'&&r.oldValue==='false'&&host.dataset.pressed==='true'))inputLog.push(snapshot());});
        observer.observe(host,{attributes:true,attributeOldValue:true});
        for(const type of ['click','contextmenu','auxclick','wheel','keydown','keyup','dragstart','drop','pointerdown','pointerup','input'])root.addEventListener(type,e=>controlLog.push({...snapshot(),event:type,key:e.key,button:e.button,ctrl:e.ctrlKey,shift:e.shiftKey} ),true);
        demo.play();
      };
    </script></body></html>`}));
    await page.goto(server.resolvedUrls.local[0]+'__input.html');await page.waitForFunction(()=>!!window.openInputDemo);
    const reports=[];
    for(const kind of ['right','double','middle','wheel','drag','copy','tab','typing','files','capture']){
      await page.evaluate(kind=>openInputDemo(kind,kind==='files'?.15:.35),kind);
      if(kind==='drag'){
        await page.locator('.demo-input[data-type="drag"][data-pressed="true"]').waitFor();await page.evaluate(()=>demo.pause());
        const before=await page.locator('.demo-exercise').innerHTML(),cursor=await page.locator('.demo-cursor').getAttribute('style');
        await page.waitForTimeout(180);assert.equal(await page.locator('.demo-exercise').innerHTML(),before);assert.equal(await page.locator('.demo-cursor').getAttribute('style'),cursor);
        assert.equal(await page.locator('.demo-input').getAttribute('data-pressed'),'true');await page.screenshot({path:'test-results/demo-input-drag.png'});await page.evaluate(()=>demo.play());
      }
      if(kind==='copy'){
        await page.locator('.demo-input[data-phase="modifier-down"] kbd[data-key="C"][data-pressed="false"]').waitFor();await page.evaluate(()=>demo.pause());
        assert.equal(await page.locator('.demo-input kbd[data-key="Ctrl"]').getAttribute('data-pressed'),'true');
        const keysBefore=await page.locator('.demo-input-keys').innerHTML();await page.waitForTimeout(180);assert.equal(await page.locator('.demo-input-keys').innerHTML(),keysBefore);assert.equal(await page.locator('.demo-input').getAttribute('data-phase'),'modifier-down');
        const textPlacement=await page.locator('.demo-input kbd').first().evaluate(el=>{const key=el.getBoundingClientRect(),text=el.querySelector('span').getBoundingClientRect();return {inside:text.top>=key.top&&text.bottom<=key.bottom,offset:(text.top+text.bottom-key.top-key.bottom)/2};});assert.equal(textPlacement.inside,true);assert.ok(textPlacement.offset<-1&&textPlacement.offset>-7,JSON.stringify(textPlacement));
        await page.screenshot({path:'test-results/demo-input-ctrl-held.png'});await page.evaluate(()=>demo.play());
        await page.locator('.demo-input[data-phase="action-down"] kbd[data-key="C"][data-pressed="true"]').waitFor();await page.evaluate(()=>demo.pause());
        const key=page.locator('.demo-input kbd').first();assert.ok((await key.evaluate(el=>getComputedStyle(el).animationName)).includes('demo-key-down'));
        await page.screenshot({path:'test-results/demo-input-keyboard.png'});await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:'test-results/demo-input-mobile.png'});await page.setViewportSize({width:1100,height:950});await page.evaluate(()=>demo.play());
        await page.locator('.demo-input[data-phase="action-up"] kbd[data-key="C"][data-pressed="false"]').waitFor();await page.evaluate(()=>demo.pause());assert.equal(await page.locator('.demo-input kbd[data-key="Ctrl"]').getAttribute('data-pressed'),'true');await page.screenshot({path:'test-results/demo-input-c-released.png'});await page.evaluate(()=>demo.play());
      }
      await page.locator('.exercise-demo-layer[data-complete="true"]').waitFor({timeout:30000});
      assert.equal(await page.locator('.demo-input').getAttribute('data-pressed'),'false');
      const report=await page.evaluate(()=>({input:inputLog,controls:controlLog}));reports.push({kind,...report});
      assert.ok(report.input.length>0,kind+' has visible key/mouse cues');
      for(const event of report.controls)if(event.event!=='keyup')assert.equal(event.pressed,'true',kind+' input indicator is pressed during '+event.event);
      if(kind==='right'){const cue=report.input.find(e=>e.type==='context'&&e.phase==='action-down');assert.equal(cue.mouse,'right');assert.equal(cue.fill,'rgb(239, 184, 58)');assert.ok(cue.animation.includes('demo-mouse-down'));}
      if(kind==='double'){const presses=report.input.filter(e=>e.type==='double'&&e.phase==='action-down'&&e.pressed==='true');assert.equal(presses.length,2);assert.ok(presses[1].time-presses[0].time>=50);}
      if(kind==='middle')assert.ok(report.input.some(e=>e.mouse==='middle'&&e.mousePressed==='true'));
      if(kind==='wheel'){assert.ok(report.input.some(e=>e.mouse==='wheel'&&e.mousePressed==='true'));assert.equal(report.controls.find(e=>e.event==='wheel').mouse,'wheel');}
      if(kind==='drag'){assert.ok(report.input.some(e=>e.label.includes('按住')));assert.equal(report.controls.find(e=>e.event==='drop').pressed,'true');}
      if(kind==='copy'){
        const phases=report.input.filter(e=>e.keys.join('+')==='Ctrl+C'),first=phase=>phases.find(e=>e.phase===phase);
        assert.deepEqual(first('modifier-down').held,['Ctrl']);assert.deepEqual(first('action-down').held,['Ctrl','C']);assert.deepEqual(first('action-up').held,['Ctrl']);assert.deepEqual(first('released').held,[]);
        assert.ok(first('action-down').time-first('modifier-down').time>=150);assert.ok(first('released').time-first('action-up').time>=60);
        const copyKeys=report.controls.filter(e=>e.keys.join('+')==='Ctrl+C'&&['keydown','keyup'].includes(e.event));assert.deepEqual(copyKeys.map(e=>[e.event,e.key]),[['keydown','Control'],['keydown','c'],['keyup','c'],['keyup','Control']]);assert.ok(copyKeys[1].ctrl&&copyKeys[2].ctrl);assert.equal(copyKeys[3].ctrl,false);
        assert.ok(report.input.some(e=>e.keys.join('+')==='Ctrl+V'&&e.phase==='modifier-down'));
      }
      if(kind==='tab')assert.ok(report.input.some(e=>e.keys.join('+')==='Shift+Tab'));
      if(kind==='typing'){assert.ok(report.input.some(e=>e.keys[0]==='空格'));assert.ok(report.input.some(e=>e.keys[0]==='!'));}
      if(kind==='files'){const cue=report.input.find(e=>e.mouse==='left'&&e.keys[0]==='Ctrl'&&e.phase==='modifier-down');assert.deepEqual(cue.held,['Ctrl']);assert.equal(cue.mousePressed,'false');assert.ok(report.input.some(e=>e.keys[0]==='Ctrl'&&e.mousePressed==='true'));}
      if(kind==='capture'){const modifiers=report.input.filter(e=>e.type==='systemCapture'&&e.phase==='modifier-down');assert.ok(modifiers.length>=2);assert.equal(modifiers[0].held.length,1);assert.equal(modifiers[1].held.length,2);}
    }
    await page.evaluate(()=>{document.querySelector('.demo-replay').click();demo.pause();});
    assert.equal(await page.locator('.demo-input').getAttribute('data-pressed'),'false');assert.equal(await page.locator('.demo-input kbd').count(),0);
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>openInputDemo('right'));
    await page.locator('.demo-input[data-type="context"][data-pressed="true"]').waitFor();await page.evaluate(()=>demo.pause());
    assert.equal(await page.locator('.demo-input [data-mouse="right"]').evaluate(el=>getComputedStyle(el).fill),'rgb(239, 184, 58)');
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/demo-input.json',JSON.stringify(reports,null,2));
    console.log(JSON.stringify({originalKinds:reports.map(r=>r.kind),inputSynchronized:true,modifierFirstAndLast:true,separateMainKeyPressRelease:true,raisedKeyText:true,doublePress:true,heldDrag:true,typingCharacters:true,modifierClick:true,pauseReplay:true,mobile:true,reducedMotion:true,errors},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
