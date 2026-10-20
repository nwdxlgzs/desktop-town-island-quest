const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,completed:[],onboardingVersion:1,sound:false})));
    await page.route('**/src/main.js',async route=>{
      const response=await route.fetch(),code=await response.text(),modified=code.replace(/function stopGame\(\)\s*\{[\s\S]*?\n\}/,'function stopGame() {}');
      assert.notEqual(modified,code,'must really replace the shutdown function');await route.fulfill({response,body:modified});
    });
    await page.goto('http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world);
    await page.evaluate(()=>__quest.openTask(__quest.levels[0].tasks[0]));
    await page.evaluate(()=>{window.originalText=document.querySelector('#game-credit-source').content.firstElementChild.textContent;document.querySelector('#game-credit-source').content.firstElementChild.textContent='changed';});
    await page.waitForTimeout(40);
    const parcels=page.locator('#exercise .parcel.green');assert.equal(await parcels.count(),3);for(let i=0;i<3;i++)await parcels.nth(i).click();
    assert.equal(await page.locator('#success-banner').isVisible(),false);
    assert.equal(await page.evaluate(()=>__quest.state.completed.length),0,'no completed task/XP despite disabled shutdown');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).completed.length),0);
    const refused=await page.evaluate(async()=>{
      const {visitLevel}=await import('/src/state.js'),q=__quest,next=q.levels[0].tasks[1],before=q.state.attempts[next]||0;
      q.openTask(next);const travel=q.world.travelTo(null,()=>{}),visit=visitLevel(1,true);
      document.querySelector('#game-credit-source').content.firstElementChild.textContent=window.originalText;
      q.openTask(next);
      return {travel,visit,attemptsUnchanged:(q.state.attempts[next]||0)===before,level:q.state.currentLevel};
    });
    assert.deepEqual(refused,{travel:false,visit:false,attemptsUnchanged:true,level:0});
    await page.unroute('**/src/main.js');await page.reload();await page.waitForFunction(()=>window.__quest?.world);
    // One normal trip covers boarding, world creation, landing and persistence.
    await page.evaluate(()=>{const q=__quest,level=q.levels[0],done=level.workshops.map(w=>w.tasks[0]);for(const id of level.tasks)if(done.length<Math.ceil(level.tasks.length*.6)&&!done.includes(id))done.push(id);q.state.completed=done;q.refresh();});
    assert.equal(await page.locator('#boat-marker.ready').count(),0,'partial eligibility must not show the full-completion boat prompt');
    await page.evaluate(()=>__quest.world.goToBoat());
    await page.waitForFunction(()=>__quest.state.currentLevel===1,{},{timeout:25000});
    assert.equal(await page.evaluate(()=>__quest.world.getDebugSnapshot().islandCount),1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).currentLevel),1);
    const idleReads=await page.evaluate(async()=>{
      const original=document.querySelectorAll.bind(document);let count=0;document.querySelectorAll=function(selector){if(selector==='#game-credit-source')count++;return original(selector);};
      await new Promise(resolve=>setTimeout(resolve,250));document.querySelectorAll=original;return count;
    });
    assert.equal(idleReads,0,'flow checkpoints add no idle/frame-loop reads');assert.deepEqual(errors,[]);
    // Exercise persistence uses a small DOM fixture, with no additional maps.
    await page.route('**/__flow-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.goto('http://127.0.0.1:5174/__flow-fixture.html');
    const records=await page.evaluate(async()=>{
      const [{mountExercise},{tasks},{state,finishTask,persist},{createSessionFlow,dropSessionStep}]=await Promise.all([import('/src/exercises.js'),import('/src/curriculum.js'),import('/src/state.js'),import('/src/session-flow.js')]);
      const results=[];
      for(const kind of ['save','delivery'])for(const mode of ['valid','changed','closed']){
        const [id,task]=Object.entries(tasks).find(([,t])=>t.kind===kind),key=task.params?.record||id,expected=task.params?.expected||(kind==='save'?'实验成功':'任务完成，出发！');
        document.body.innerHTML='<template id="game-credit-source"><span class="sponsor-credit" data-sponsor-credit>PoweredBy@nwdxlgzs赞助提供此游戏化教具</span></template><div id="exercise"></div>';
        delete state.records[key];state.completed=state.completed.filter(t=>t!==id);delete state.finishedAt[id];persist();
        const root=document.querySelector('#exercise'),issue=createSessionFlow(()=>{}),ticket=issue(2,id);let result,sounds=0;
        const cleanup=mountExercise(id,root,{sound:()=>sounds++,feedback(){},capture:()=>'',success(){result=finishTask(id,ticket);return result!==null;}});
        if(kind==='delivery')root.querySelector('#message-file').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
        const input=root.querySelector(kind==='save'?'#save-input':'#message-input');input.value=expected;
        if(mode==='changed')document.querySelector('#game-credit-source').content.firstElementChild.textContent='changed';
        if(mode==='closed')dropSessionStep(ticket);
        root.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));
        const saved=JSON.parse(localStorage.getItem('desktop-quest-v3'));
        results.push({kind,mode,result,record:state.records[key]??null,persisted:saved.records[key]??null,completed:state.completed.includes(id),storedCompleted:saved.completed.includes(id),expected,sounds,savedUI:kind==='save'?!root.querySelector('#download-record').hidden:root.querySelector('#message-save').textContent==='已保存并派送'});
        cleanup();
      }return results;
    });
    for(const r of records){const valid=r.mode==='valid';assert.equal(r.result,valid?true:null,r.kind+' '+r.mode);assert.equal(r.record,valid?r.expected:null);assert.equal(r.persisted,valid?r.expected:null);assert.equal(r.completed,valid);assert.equal(r.storedCompleted,valid);assert.equal(r.savedUI,valid);assert.equal(r.sounds,valid?1:0);}
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({shutdownNoopStillRejectsProgress:true,forgedTrueRejected:true,restoredTextDoesNotReviveSession:true,partialCompletionBoatArrival:true,idleCheckpointReads:idleReads,exerciseRecordCases:records.map(({kind,mode})=>({kind,mode,passed:true})),errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
