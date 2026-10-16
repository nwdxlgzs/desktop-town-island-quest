const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// A fixed small island, not a generated-map or FPS stress test. Exercise the
// actual world's detection -> fade -> outline -> cache path, not manual opacity.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:640,height:460}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2000));});
    await page.route('**/__occlusion.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><div id="world-container" style="width:640px;height:460px;position:relative"></div></body></html>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__occlusion.html');
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js');
      const layout={seed:7,width:18,depth:18,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},shoreX:8,dock:{x:7,z:-4},boat:{x:10,z:-4},spawn:{x:0,z:0},level:{id:'occlusion-fixture',map:{npcLimit:0},npc:{radius:2}},workshops:[],roads:[],ladders:[],mountains:[],villages:[],camps:[],reefs:[],trees:[{x:1.2,z:2,scale:1.8}],obstacles:[],terraces:[]};
      window.fixtureLayout=layout;window.paused=false;
      window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>window.paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},qualitySettings:{adaptive:false,resolution:'1.5',antialias:'fxaa',shadowQuality:'high',weather:false,waves:false,npcMovement:false}});
    });
    const snapshot=()=>page.evaluate(()=>{const s=world.getDebugSnapshot();return {faded:s.faded,outline:s.outline,captures:s.staticCache.captures,hits:s.staticCache.hits,staticChecks:s.view.checks.staticTests};});
    try{await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return s.faded===1&&s.outline;},{},{timeout:3000});}catch(e){console.error(JSON.stringify({state:await snapshot(),errors}));throw e;}
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/occlusion-tree.png'});
    const hidden=await snapshot();
    await page.locator('canvas').focus();await page.keyboard.down('ArrowLeft');
    try{await page.waitForFunction(()=>world.getDebugSnapshot().position.x<-3,{},{timeout:2000});}finally{await page.keyboard.up('ArrowLeft');}
    await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return s.faded===0&&!s.outline;},{},{timeout:3000});const clear=await snapshot();
    await page.evaluate(()=>world.setQuality({...world.getQuality().settings,preset:'low',shadowQuality:'baked'}));
    await page.keyboard.down('ArrowRight');
    try{await page.waitForFunction(()=>world.getDebugSnapshot().position.x>-.1,{},{timeout:2000});}finally{await page.keyboard.up('ArrowRight');}
    await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return s.faded===1&&s.outline;},{},{timeout:3000});
    await page.waitForTimeout(500);const reduced=await snapshot();assert.equal(reduced.outline,true);assert.equal(reduced.faded,1);
    await page.evaluate(()=>{window.paused=true;});
    const comparison=await page.evaluate(async()=>{
      async function rgba(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const cached=await rgba(world.capture()),a=world.getDebugSnapshot();world.capture();const b=world.getDebugSnapshot(),direct=await rgba(world.capture({cache:false}));let different=0,glowPixels=0;
      for(let i=0;i<cached.length;i+=4){if(Math.abs(cached[i]-direct[i])+Math.abs(cached[i+1]-direct[i+1])+Math.abs(cached[i+2]-direct[i+2])>45)different++;if(cached[i]>160&&cached[i+1]>220&&cached[i+2]<180)glowPixels++;}
      return {differentFraction:different/(cached.length/4),glowPixels,reused:b.staticCache.hits-a.staticCache.hits,staticChecks:b.view.checks.staticTests-a.view.checks.staticTests};
    });assert.ok(comparison.differentFraction<.025,JSON.stringify(comparison));assert.ok(comparison.glowPixels>15,JSON.stringify(comparison));assert.equal(comparison.reused,1);assert.equal(comparison.staticChecks,0);
    const styles=await page.evaluate(()=>{
      const start=world.getDebugSnapshot(),result=[];
      for(const terrainLines of ['off','beveled']){
        const before=world.getDebugSnapshot();world.setQuality({...world.getQuality().settings,terrainLines});world.capture();const after=world.getDebugSnapshot();
        world.setQuality({...world.getQuality().settings,terrainLines});world.capture();const repeated=world.getDebugSnapshot();
        result.push({style:after.quality.terrainLines,recaptures:after.staticCache.captures-before.staticCache.captures,repeated:repeated.staticCache.captures-after.staticCache.captures,stage:after.quality.stage,shadowRefreshes:after.shadowRefreshes-start.shadowRefreshes,outline:after.outline});
      }
      return result;
    });assert.ok(styles.every(s=>s.recaptures===1&&s.repeated===0&&s.stage===3&&s.shadowRefreshes===0&&s.outline),JSON.stringify(styles));
    await page.evaluate(()=>{world.loadLevel({...fixtureLayout,trees:[],terraces:[{x:2.4,z:4,r:1.2,height:6,ramp:.1}]});window.paused=false;});
    await page.waitForFunction(()=>{const s=world.getDebugSnapshot();return !s.faded&&s.outline;},{},{timeout:3000});const cliff=await snapshot();await page.screenshot({path:'test-results/occlusion-cliff.png'});
    await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);
    const result={hidden,clear,reduced,comparison,styles,cliff,errors};await fs.writeFile('test-results/occlusion.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
