const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const solveOffice=require('./solve-office.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,seed:314159,currentLevel:0,unlocked:3,completed:[],sound:false,music:true}));window.__fullScreenCalls=0;Element.prototype.requestFullscreen=()=>{window.__fullScreenCalls++;throw Error('Native fullscreen must not be used');};const Audio=window.AudioContext;window.__audioContexts=[];window.AudioContext=class extends Audio{constructor(...args){super(...args);window.__audioContexts.push(this);}};});
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__quest?.world);await fs.mkdir('test-results',{recursive:true});
    await page.locator('#fullscreen').click();assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),true);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);assert.equal(await page.evaluate(()=>window.__fullScreenCalls),0);
    await page.waitForFunction(()=>{const r=document.querySelector('#world-container').getBoundingClientRect();return r.height>800&&r.width>1400;});
    const canvas=await page.locator('#world-container').boundingBox();assert.ok(canvas.height>800&&canvas.width>1400);await page.screenshot({path:'test-results/immersive.png'});
    assert.equal(await page.evaluate(()=>window.__audioContexts.length),1,'music did not start on a user gesture');assert.equal(await page.evaluate(()=>window.__audioContexts[0].state),'running');
    await page.evaluate(()=>window.__quest.openTask('click'));await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),false);
    await page.locator('#music-toggle').click();assert.deepEqual(await page.evaluate(()=>[window.__quest.state.music,window.__quest.state.sound]),[false,false]);await page.locator('#sound-toggle').click();assert.deepEqual(await page.evaluate(()=>[window.__quest.state.music,window.__quest.state.sound]),[false,true]);await page.locator('#sound-toggle').click();await page.locator('#music-toggle').click();assert.deepEqual(await page.evaluate(()=>[window.__quest.state.music,window.__quest.state.sound]),[true,false]);
    await page.locator('#guide-nav').click();const guide=await page.locator('.guide-body').innerText();assert.ok(guide.includes('81 个完整工坊、243 个操作步骤'));assert.ok(guide.includes('Home / End'));assert.ok(guide.includes('音乐与音效'));await page.locator('#guide-start').click();assert.equal(await page.locator('#modal-layer').isVisible(),false);
    const checked=new Set();
    for(let index=0;index<await page.evaluate(()=>window.__quest.levels.length);index++){
      await page.evaluate(i=>{const q=window.__quest;q.state.currentLevel=i;q.refresh();q.world.loadLevel(q.layout);},index);
      const levelTasks=await page.evaluate(i=>window.__quest.levels[i].tasks.map(id=>({id,...window.__quest.tasks[id]})),index);
      for(const task of levelTasks){
        if(checked.has(task.kind)||!['document','hover','files','sheet','search','settings','mail','keys','presentation','resize'].includes(task.kind))continue;
        await page.evaluate(id=>window.__quest.openTask(id),task.id);
        if(task.kind==='document'){
          await page.locator('[data-word-tool="bold"]').click();assert.equal(await page.locator('[data-word-tool="bold"]').getAttribute('aria-pressed'),'false','formatting accepted without a selection');
        }
        await solveOffice(page,task);await page.locator('#success-banner').waitFor({state:'visible',timeout:7000});await page.screenshot({path:`test-results/app-${task.kind}.png`});await page.keyboard.press('Escape');checked.add(task.kind);console.log('verified',task.kind);
      }
      const snap=await page.evaluate(()=>window.__quest.world.getDebugSnapshot());assert.ok(snap.layout.terrain);assert.ok(snap.layout.workshops.some(w=>w.elevation>0));assert.ok(snap.layout.reefs.length);
      const heightErrors=await page.evaluate(async()=>{const {elevationAt}=await import('/src/terrain.js'),s=window.__quest.world.getDebugSnapshot();return s.npcs.map(n=>Math.abs(n.y-.25-elevationAt(s.layout,n.x,n.z)));});assert.ok(heightErrors.every(d=>d<.001),'station or resident NPC sits below a terrace with reduced motion');
      if(checked.size===10)break;
      if(index===1){await page.locator('#overview-camera').click();await page.waitForTimeout(400);await page.screenshot({path:'test-results/terrain-overview.png'});await page.locator('#overview-camera').click();}
    }
    assert.equal(checked.size,10);assert.deepEqual(errors,[]);console.log(JSON.stringify({apps:[...checked],immersive:'game viewport only',music:'independent, running after gesture',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
