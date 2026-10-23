const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

// The user's exact island plus a render-failure page; no map stress suite.
(async()=>{
  let server,browser;
  try{
    const built=process.argv.includes('--built');
    if(!built){const {createServer}=await import('vite');server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();}
    const url=built?pathToFileURL(path.resolve('dist/index.html')).href:server.resolvedUrls.local[0];
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:'reduce'}),errors=[],network=[];
    page.on('pageerror',error=>errors.push(error.message));if(built)page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    const save={version:3,routeVersion:1,seed:3763093038,currentLevel:2,unlocked:2,completed:[],onboardingVersion:1,sound:false};
    await page.addInitScript(save=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify(save));},save);
    // Offline builds hide diagnostics; the development run verifies exact
    // path execution. Both deliveries verify in-place native key activation.
    await page.goto(url);await page.locator('#world-loading').waitFor({state:'detached',timeout:20000});
    for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])await page.keyboard.press(key);await page.locator('#teaching-library-nav').waitFor();
    assert.equal(await page.locator('#island-name').textContent(),'山林探索岛');
    await fs.mkdir('test-results',{recursive:true});
    if(!built){
      await page.locator('#overview-camera').click();await page.waitForFunction(()=>Math.hypot(__quest.world.getDebugSnapshot().cameraFocus.x,__quest.world.getDebugSnapshot().cameraFocus.z)<.02);
      const point=await page.evaluate(()=>{const l=__quest.layout,q=l.ladders[0].top;return __quest.world.screenPoint(q.x,q.y+.075,q.z)});await page.mouse.click(point.x,point.y);
      await page.screenshot({path:'test-results/reported-start.png'});
      assert.ok(await page.evaluate(()=>__quest.world.getDebugSnapshot().routeRemaining)>0,'click starts a route to the mountain ledge');
      await page.waitForFunction(()=>{const s=__quest.world.getDebugSnapshot(),q=s.layout.ladders[0].top;return !s.routeRemaining&&Math.hypot(s.position.x-q.x,s.position.z-q.z)<.05;},null,{timeout:25000});
      await page.screenshot({path:'test-results/reported-mountain-ledge.png'});
      assert.ok(await page.evaluate(()=>__quest.world.getDebugSnapshot().position.y)>6.4);
      await page.evaluate(()=>__quest.world.walkTo(__quest.layout.dock));
      await page.waitForFunction(()=>{const s=__quest.world.getDebugSnapshot(),p=s.layout.dock;return !s.routeRemaining&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.05;},null,{timeout:25000});
      // Walk beside the reported right-side cactus using native held keys.
      const cactus=await page.evaluate(()=>__quest.layout.trees.find(t=>t.x>7&&t.x<13)),start={x:cactus.x+1.5,z:cactus.z+.6};
      await page.evaluate(p=>__quest.world.walkTo(p),start);await page.waitForFunction(p=>{const s=__quest.world.getDebugSnapshot();return !s.routeRemaining&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.02;},start,{timeout:15000});
      await page.keyboard.down('s');await page.waitForFunction(z=>__quest.world.getDebugSnapshot().position.z>z,cactus.z+.8,{timeout:3000});await page.keyboard.up('s');
      const corner=await page.evaluate(()=>__quest.world.getDebugSnapshot().position);assert.ok(Math.abs(corner.x-start.x)<.02,'cactus corner needs no sideways collision slide');await page.screenshot({path:'test-results/reported-cactus-slope.png'});
      await page.keyboard.down('w');await page.waitForFunction(z=>__quest.world.getDebugSnapshot().position.z<z,start.z+.05,{timeout:3000});await page.keyboard.up('w');
    }
    await page.reload();await page.locator('#teaching-library-nav').waitFor();
    const unlocked=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.equal(unlocked.unlockedMode,true);assert.equal(unlocked.completed.length,243);
    // A fresh student save tests the native cheat sequence independently.
    await page.addInitScript(save=>{if(sessionStorage.getItem('verify-fresh')==='1'){localStorage.setItem('desktop-quest-v3',JSON.stringify(save));sessionStorage.removeItem('verify-fresh');}},save);await page.evaluate(()=>sessionStorage.setItem('verify-fresh','1'));
    const keys=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    // With GPU unavailable, the recovery hint and key activation still work.
    await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};});
    await page.reload();await page.locator('.fallback').waitFor();assert.equal(await page.locator('#teaching-library-nav').count(),0);assert.match(await page.locator('#world-loading').innerText(),/--ignore-gpu-blocklist/);
    await page.locator('#progress-nav').click();await page.locator('#new-adventure summary').click();await page.locator('#new-seed').focus();
    for(const key of keys)await page.keyboard.press(key);assert.equal(new URL(page.url()).hash,'','sequence while editing text must not activate');await page.keyboard.press('Escape');
    for(const key of keys)await page.keyboard.press(key);
    await page.locator('#teaching-library-nav').waitFor();assert.equal(new URL(page.url()).hash,'');
    await page.locator('#teaching-library-nav').click();assert.equal(await page.locator('[data-teaching-kind]').count(),40);
    const demo=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')));assert.equal(demo.completed.length,243);assert.equal(demo.seed,3763093038);assert.equal(demo.unlockedMode,true);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log(JSON.stringify({built,seed:3763093038,island:3,actualLedgeRoundTrip:!built,cactusSlopeKeyboardRoundTrip:!built,konamiActivation:true,typingIgnored:true,teachingKinds:40,gpuRecoveryHint:true,permanentUnlock:true,errors,network},null,2));
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
