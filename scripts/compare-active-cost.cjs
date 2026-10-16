const {chromium}=require('playwright');
const fs=require('node:fs/promises');
// Four bounded 0.8 s samples of one fixed island. Work counts, not a low-end FPS benchmark.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:720,height:500}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__active-cost.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100%;height:100%;display:block}</style><div id="world-container" style="width:720px;height:500px"></div>'}));
    await page.goto('http://127.0.0.1:5174/__active-cost.html');
    await page.evaluate(async()=>{
      window.upload={bytes:0,calls:0,textureBytes:0,textureCalls:0};
      const proto=WebGL2RenderingContext.prototype,buffer=proto.bufferSubData,texture=proto.texSubImage2D;
      proto.bufferSubData=function(target,offset,data,start=0,length){upload.calls++;upload.bytes+=(length??data.length-start)*data.BYTES_PER_ELEMENT;return buffer.apply(this,arguments);};
      proto.texSubImage2D=function(...a){if(a.length>=9&&ArrayBuffer.isView(a[8])){upload.textureCalls++;upload.textureBytes+=a[4]*a[5]*4*a[8].BYTES_PER_ELEMENT;}return texture.apply(this,a);};
      const {createWorld}=await import('/src/world.js');
      const environment={id:'rain',sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:true};
      const layout={seed:7,width:22,depth:22,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},shoreX:10,dock:{x:9,z:-5},boat:{x:12,z:-5},spawn:{x:0,z:0},level:{id:'cost-fixture',environment,map:{npcLimit:8},npc:{radius:2.6,speed:.65}},workshops:[],roads:[],ladders:[],terraces:[],mountains:[],villages:[],camps:[{x:-5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0},{x:5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0}],npcSpawns:{'camp-0':{x:-3,z:-3},'camp-1':{x:3,z:-3}},reefs:[],trees:[{x:1.2,z:2,scale:1.5}],obstacles:[],exploration:[{id:'shard',type:'shard',name:'星图碎片',x:4,z:4}],wildlife:[{id:'rabbit',type:'animal',species:'兔子',name:'兔子',x:-2,z:3,phase:.1},{id:'bird',type:'animal',species:'小鸟',name:'小鸟',x:2,z:3,phase:.4}]};
      window.paused=false;window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},onTravelState(){}});world.toggleOverview();
    });
    const reports=[];
    for(const [name,config] of [['auto150',{}],['auto150-still',{waves:false,weather:false,npcMovement:false}],['auto100',{resolution:'1'}],['low100',{preset:'low',resolution:'1'}]]){
      await page.evaluate(config=>world.setQuality({resolution:'1.5',antialias:'off',maxFps:30,adaptive:false,shadowQuality:'baked-contact',waves:true,weather:true,npcMovement:true,...config}),config);
      await page.waitForTimeout(220);await page.locator('canvas').focus();
      const before=await page.evaluate(()=>({s:world.getDebugSnapshot(),u:{...upload}}));await page.keyboard.down('ArrowDown');await page.waitForTimeout(800);await page.keyboard.up('ArrowDown');
      const after=await page.evaluate(()=>({s:world.getDebugSnapshot(),u:{...upload}})),frames=after.s.renderCount-before.s.renderCount;
      reports.push({name,frames,draws:after.s.drawCalls,triangles:after.s.triangles,bufferBytesPerFrame:Math.round((after.u.bytes-before.u.bytes)/frames),bufferCallsPerFrame:(after.u.calls-before.u.calls)/frames,textureBytesPerFrame:Math.round((after.u.textureBytes-before.u.textureBytes)/frames),textureCallsPerFrame:(after.u.textureCalls-before.u.textureCalls)/frames,npcSteps:after.s.npcSimSteps-before.s.npcSimSteps,animalSteps:after.s.animalSimSteps-before.s.animalSimSteps,captures:after.s.staticCache.captures-before.s.staticCache.captures,hits:after.s.staticCache.hits-before.s.staticCache.hits});
    }
    await page.evaluate(()=>{paused=true;world.dispose();});await fs.mkdir('test-results',{recursive:true});
    const result={reports,errors};await fs.writeFile(`test-results/active-cost-${process.env.PASS||'after'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(errors.length)throw Error(errors.join('\n'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

