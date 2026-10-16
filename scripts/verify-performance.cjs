const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One browser, one normal six-workshop sample. Boundary fixtures use a single
// wave cube; no map-generation stress loops or CPU throttling.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,seed:314159,sound:false,music:false,quality:{version:2,adaptive:false,npcMovement:false}})));
    await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world);await page.keyboard.press('Escape');
    assert.equal(await page.locator('.fps-display').isVisible(),false);
    const waves=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createOcean}=await import('/src/ocean.js'),o=createOcean(),r=new THREE.WebGLRenderer(),s=new THREE.Scene(),c=new THREE.OrthographicCamera(-8,8,4,-4,.1,100),target=new THREE.WebGLRenderTarget(256,128),pixels=new Uint8Array(256*128*4),matrix=new THREE.Matrix4();
      r.setSize(256,128);r.setRenderTarget(target);s.background=new THREE.Color(0);s.add(o.waves);o.waves.count=1;let maxHorizontal=0,maxVertical=0;
      for(const axis of ['x','z'])for(const shift of [-.2,0,.2]){
        const x=axis==='x'?72+shift:0,z=axis==='z'?68+shift:0;
        matrix.compose(new THREE.Vector3(x,-.23,z),new THREE.Quaternion(),new THREE.Vector3(.7,.035,.18));o.waves.setMatrixAt(0,matrix);o.waves.instanceMatrix.needsUpdate=true;
        c.position.set(axis==='x'?72:0,30,axis==='z'?68:0);c.up.set(0,0,-1);c.lookAt(c.position.x,0,c.position.z);o.update(0,0,0,true);r.render(s,c);r.readRenderTargetPixels(target,0,0,256,128,pixels);
        let minX=256,maxX=-1,minY=128,maxY=-1;
        for(let y=0;y<128;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;if(pixels[i]+pixels[i+1]+pixels[i+2]>30){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
        maxHorizontal=Math.max(maxHorizontal,maxX<0?0:maxX-minX+1);maxVertical=Math.max(maxVertical,maxY<0?0:maxY-minY+1);
      }
      o.dispose();target.dispose();r.dispose();return {maxHorizontal,maxVertical};
    });assert.ok(waves.maxHorizontal<=13&&waves.maxVertical<=5,JSON.stringify(waves));
    await page.evaluate(async()=>{
      const q=window.__quest,{createLayout}=await import('/src/level-layout.js'),l=createLayout(q.levels.find(l=>l.workshops.length===6),314159);
      q.world.loadLevel(l);q.refresh(l);q.world.setQuality({adaptive:false,maxFps:60,resolution:'1',npcMovement:false});
    });await page.waitForTimeout(300);await page.keyboard.down('ArrowDown');
    const moving=await page.evaluate(async()=>{
      const w=window.__quest.world,end=performance.now()+650,work=[],frames=[];let previous=-1;
      while(performance.now()<end){await new Promise(requestAnimationFrame);const s=w.getDebugSnapshot();if(previous===s.renderCount)continue;previous=s.renderCount;work.push(s.workMs);frames.push(s.frameMs);}
      const s=w.getDebugSnapshot();return {drawCalls:s.drawCalls,triangles:s.triangles,geometryCount:s.geometryCount,terrainVertices:s.terrainVertices,cpuSubmitMs:work.reduce((a,b)=>a+b,0)/work.length,frameMs:frames.reduce((a,b)=>a+b,0)/frames.length,samples:work.length};
    });await page.keyboard.up('ArrowDown');assert.ok(moving.drawCalls<=22,JSON.stringify(moving));
    // Modal pauses simulation, so off/on image differences cannot be animations.
    await page.locator('#quality-settings').click();
    const shadows=await page.evaluate(async()=>{
      const w=window.__quest.world;
      async function pixels(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const settings={adaptive:false,npcMovement:false};w.setQuality({...settings,shadowQuality:'off'});const off=await pixels(w.capture()),result={};
      for(const mode of ['baked','cached','low','high']){
        w.setQuality({...settings,shadowQuality:mode});const data=await pixels(w.capture());let darkened=0;
        for(let i=0;i<off.length;i+=4)if(off[i]+off[i+1]+off[i+2]-data[i]-data[i+1]-data[i+2]>18)darkened++;
        w.capture();result[mode]={darkened,steadyDrawCalls:w.getDebugSnapshot().drawCalls};
      }
      return result;
    });for(const [mode,result]of Object.entries(shadows))assert.ok(result.darkened>100,`${mode}: ${JSON.stringify(result)}`);
    assert.ok(shadows.cached.steadyDrawCalls<=moving.drawCalls+1,'cached shadows do not repeat the shadow pass');
    await page.locator('#quality-shadow-level').selectOption('baked');await page.locator('#quality-show-fps').check();await page.locator('#quality-form [type=submit]').click();await page.keyboard.press('Escape');await page.waitForTimeout(1100);assert.ok(await page.locator('.fps-display').isVisible());assert.match(await page.locator('.fps-display').innerText(),/FPS/);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).quality);assert.equal(saved.showFps,true);assert.equal(saved.shadowQuality,'baked');
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/performance-baked.png'});
    // Quiet mode must remain quiet after adding FPS and shadow support.
    await page.evaluate(()=>window.__quest.world.setQuality({preset:'low',adaptive:false,showFps:true,shadowQuality:'baked'}));await page.waitForTimeout(1600);
    const before=await page.evaluate(()=>window.__quest.world.getDebugSnapshot());await page.waitForTimeout(1100);const after=await page.evaluate(()=>window.__quest.world.getDebugSnapshot());
    assert.equal(after.renderCount,before.renderCount);assert.equal(after.actorTicks,before.actorTicks);assert.equal(after.propUpdates,before.propUpdates);assert.match(await page.locator('.fps-display').innerText(),/静止待机/);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({waves,moving,shadows,idle:{draws:after.renderCount-before.renderCount,actorTicks:after.actorTicks-before.actorTicks,propUploads:after.propUpdates-before.propUpdates},fpsDefaultOff:true,fpsPersisted:true,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
