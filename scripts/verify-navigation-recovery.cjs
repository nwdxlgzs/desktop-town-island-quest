const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

(async()=>{
  let server,browser;
  try{
    const {createServer}=await import('vite');server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',error=>errors.push(error.stack||error.message));
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:734619820,currentLevel:1,unlocked:1,completed:[],onboardingVersion:1,sound:false,quality:{preset:'low',resolution:'.5',maxFps:30}})));
    await page.goto(server.resolvedUrls.local[0]);await page.locator('#world-loading').waitFor({state:'detached',timeout:20000});
    assert.equal(await page.locator('#island-name').textContent(),'溪谷村庄');
    // Allow the real initial frames to finish shader prewarming before replacing
    // the scene with a test spawn; the first normal render can block on linking.
    await page.waitForFunction(()=>__quest.world.getDebugSnapshot().renderCount>=3);
    await page.evaluate(()=>{
      const l=__quest.layout;__quest.world.loadLevel({...l,spawn:{...l.ladders[2].top}});
    });
    for(const name of ['bottom','top']){
      assert.equal(await page.evaluate(()=>__quest.world.useLadder(__quest.layout.ladders[2].id)),true);
      await page.waitForFunction(name=>{const s=__quest.world.getDebugSnapshot(),p=__quest.layout.ladders[2][name];return !s.routeRemaining&&!s.motion.climbing&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.01;},name,{timeout:15000});
      assert.equal(await page.locator('#return-to-start').isVisible(),false);
    }
    await page.evaluate(()=>__quest.world.walkTo(__quest.layout.dock));
    await page.waitForFunction(()=>{const s=__quest.world.getDebugSnapshot(),p=__quest.layout.dock;return !s.routeRemaining&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.02;},null,{timeout:30000});
    // Retain the old bad landing in a fixture to exercise the emergency UI.
    const saved=await page.evaluate(()=>JSON.stringify(__quest.state));
    await page.evaluate(()=>{
      const l=__quest.layout,bad={...l.ladders[2],bottom:{...l.ladders[2].bottom,x:l.ladders[2].bottom.x+.15}};
      __quest.world.loadLevel({...l,spawn:{...bad.top},ladders:l.ladders.map(q=>q.id===bad.id?bad:q)});
      __quest.world.useLadder(bad.id);
    });
    await page.locator('#return-to-start').waitFor({state:'visible',timeout:15000});
    await fs.mkdir('test-results',{recursive:true});await page.locator('#world-container').screenshot({path:'test-results/navigation-recovery.png'});
    await page.setViewportSize({width:390,height:844});
    const rect=await page.locator('#return-to-start').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=391);
    await page.locator('#world-container').screenshot({path:'test-results/navigation-recovery-mobile.png'});
    await page.locator('#reset-position').click();await page.locator('#return-to-start').waitFor({state:'hidden'});
    const recovered=await page.evaluate(()=>__quest.world.getDebugSnapshot());assert.ok(Math.hypot(recovered.position.x-recovered.layout.spawn.x,recovered.position.z-recovered.layout.spawn.z)<.01);assert.equal(recovered.stranded,false);assert.equal(recovered.motion.climbing,false);
    // Active time may advance; recovery must leave learning records untouched.
    const [before,after]=[JSON.parse(saved),await page.evaluate(()=>JSON.parse(JSON.stringify(__quest.state)))];
    for(const key of ['completed','unlocked','seed','currentLevel','exploration','records'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({seed:734619820,island:2,ladderRoundTrip:true,dockReturn:true,strandedPrompt:true,resetPosition:true,progressPreserved:true,mobile:true,errors},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
