const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One tiny shadow fixture and one fixed island. Brief activity samples only;
// no generated maps, CPU throttling, long FPS runs or machine-specific gates.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:720,height:500}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2500));});
    await page.route('**/__active-environment.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>#world-container canvas{width:100%;height:100%;display:block}</style></head><body style="margin:0"></body></html>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__active-environment.html');
    const pixels=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createStaticFrameCache}=await import('/src/static-frame-cache.js'),{createShadowRefresh}=await import('/src/shadow-refresh.js'),{createShadowDamage}=await import('/src/shadow-damage.js'),{createAntialias}=await import('/src/antialias.js'),{installVoxelLighting}=await import('/src/voxel-lighting.js');
      const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(720,500);renderer.setPixelRatio(1.5);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#c4dcd8');const sun=new THREE.DirectionalLight('#fff5db',2.8);sun.position.set(-4,12,5);sun.layers.enable(1);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});scene.add(sun,sun.target);const ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.5);ambient.layers.enable(1);scene.add(ambient);
      const camera=new THREE.OrthographicCamera(-9,9,6.25,-6.25,.1,100);camera.position.set(12,18,23);camera.lookAt(0,1,0);camera.layers.enable(1);camera.updateMatrixWorld();
      const all=[];function box(x,y,z,w,h,d,color,layer=0){const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshLambertMaterial({color}),o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;o.layers.set(layer);scene.add(o);all.push(o);return o;}
      box(0,-.15,0,18,.3,16,'#b7cba3');box(-4,1.5,-2,4,3,5,'#b5bda3');const actor=box(0,.7,1,.6,1.4,.6,'#5a95bd',1);
      installVoxelLighting(scene);const aa=createAntialias(renderer,scene,camera);aa.prepare(scene);aa.configure(true,720,500,1.5);const cache=createStaticFrameCache(renderer,scene,camera,aa.renderWorld,()=>{}),refresh=createShadowRefresh(renderer,scene,camera),damage=createShadowDamage();
      function frame(full=false){scene.updateMatrixWorld(true);if(full)cache.invalidate();renderer.shadowMap.needsUpdate=true;refresh.refresh();const boxes=damage.regions([actor],sun.position);if(boxes)cache.invalidateRegions(boxes);else cache.invalidate();aa.render(out=>cache.render(out,true));damage.commit([actor]);}
      async function rgba(){const im=new Image();im.src=renderer.domElement.toDataURL();await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      frame(true);const start={...cache.stats},comparisons=[];let image;
      for(const pose of [{x:.8,y:.7,z:1,visible:true},{x:-3,y:3.7,z:-2,visible:true},{x:-3,y:3.7,z:-2,visible:false},{x:1,y:.7,z:2,visible:true},{x:1.8,y:.7,z:2,visible:true,pan:.2}]){
        if(pose.pan){camera.position.x+=pose.pan;camera.updateMatrixWorld();}
        actor.position.set(pose.x,pose.y,pose.z);actor.visible=pose.visible;frame();image=renderer.domElement.toDataURL();const cached=await rgba();aa.render(out=>aa.renderWorld(camera,out));const direct=await rgba();let different=0,sum=0;for(let i=0;i<cached.length;i+=4){const d=Math.abs(cached[i]-direct[i])+Math.abs(cached[i+1]-direct[i+1])+Math.abs(cached[i+2]-direct[i+2]);sum+=d;if(d>45)different++;}comparisons.push({pose,differentFraction:different/(cached.length/4),meanDifference:sum/(cached.length*.75)});
      }
      const end={...cache.stats},result={comparisons,fullCaptures:end.captures-start.captures,patches:end.patches-start.patches,repaintPixels:end.patchPixels-start.patchPixels+end.fullPixels-start.fullPixels,previousFullRepaintPixels:comparisons.length*Math.ceil(1080*1.18)*Math.ceil(750*1.18),image};
      refresh.dispose();cache.dispose();aa.dispose();sun.shadow.dispose();all.forEach(o=>{o.geometry.dispose();o.material.dispose();});renderer.dispose();return result;
    });
    for(const c of pixels.comparisons)assert.ok(c.differentFraction<.02&&c.meanDifference<2,JSON.stringify(c));assert.ok(pixels.patches>=3);assert.ok(pixels.repaintPixels<pixels.previousFullRepaintPixels*.65,JSON.stringify(pixels));
    await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/active-shadow-patches.png',Buffer.from(pixels.image.split(',')[1],'base64'));delete pixels.image;
    await page.reload();
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js');document.body.innerHTML='<div id="world-container" style="width:720px;height:500px;position:relative"></div>';
      const layout={seed:7,width:22,depth:22,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},shoreX:10,dock:{x:9,z:-5},boat:{x:12,z:-5},spawn:{x:0,z:0},level:{id:'active-fixture',map:{npcLimit:8},npc:{radius:2.6,speed:.65}},workshops:[],roads:[],ladders:[],terraces:[],mountains:[],villages:[],camps:[{x:-5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0},{x:5,z:-3,tentHeight:0,fireHeight:0,benchHeight:0}],npcSpawns:{'camp-0':{x:-3,z:-3},'camp-1':{x:3,z:-3}},reefs:[],trees:[{x:1.2,z:2,scale:1.5}],obstacles:[],exploration:[{id:'shard',type:'shard',name:'星图碎片',x:4,z:4}],wildlife:[{id:'rabbit',type:'animal',species:'兔子',name:'兔子',x:-2,z:3,phase:.1},{id:'bird',type:'animal',species:'小鸟',name:'小鸟',x:2,z:3,phase:.4}]};
      window.activeLayout=layout;window.paused=false;window.world=createWorld(document.querySelector('#world-container'),{layout,isPaused:()=>window.paused,onReady(){},onError(e){throw e;},onInteract(){},onBoard(){},qualitySettings:{adaptive:false,resolution:'1.5',antialias:'fxaa',shadowQuality:'high',weather:false,waves:false,npcMovement:true}});world.toggleOverview();
    });
    await page.waitForTimeout(350);await page.locator('canvas').focus();await page.keyboard.down('ArrowDown');
    const activity=await page.evaluate(async()=>{const a=world.getDebugSnapshot();await new Promise(r=>setTimeout(r,1200));const b=world.getDebugSnapshot();window.paused=true;return{frames:b.renderCount-a.renderCount,npcSteps:b.npcSimSteps-a.npcSimSteps,animalSteps:b.animalSimSteps-a.animalSimSteps,propUpdates:b.propUpdates-a.propUpdates,fullCaptures:b.staticCache.captures-a.staticCache.captures,patches:b.staticCache.patches-a.staticCache.patches,repaintPixels:b.staticCache.patchPixels-a.staticCache.patchPixels+b.staticCache.fullPixels-a.staticCache.fullPixels,shadowRefreshes:b.shadowRefreshes-a.shadowRefreshes,quality:b.quality,npcs:b.npcs,wildlife:b.wildlife};});await page.keyboard.up('ArrowDown');
    assert.ok(activity.npcSteps>0&&activity.animalSteps>0&&activity.propUpdates>0);assert.equal(activity.quality.npcMovement,true);assert.equal(activity.quality.ambientAnimation,true);assert.equal(activity.quality.shadowQuality,'high');assert.ok(activity.patches>0);assert.ok(activity.frames>activity.fullCaptures*2);
    const comparison=await page.evaluate(async()=>{async function rgba(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}const a=await rgba(world.capture()),b=await rgba(world.capture({cache:false}));let different=0,sum=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=d;if(d>45)different++;}return{differentFraction:different/(a.length/4),meanDifference:sum/(a.length*.75)};});assert.ok(comparison.differentFraction<.025&&comparison.meanDifference<2,JSON.stringify(comparison));
    await page.screenshot({path:'test-results/active-environment.png'});
    await page.evaluate(()=>{const l=structuredClone(activeLayout);l.npcSpawns['camp-0']={x:1,z:0};window.paused=false;world.loadLevel(l);world.interact();});
    await page.waitForFunction(()=>world.getDebugSnapshot().npcs.some(n=>n.arm>1),{},{timeout:2000});
    const greeting=await page.evaluate(()=>{const s=world.getDebugSnapshot();return{playerWave:s.motion.wave>0,residentWave:s.npcs.some(n=>n.arm>1)};});assert.equal(greeting.playerWave,true);assert.equal(greeting.residentWave,true);
    await page.mouse.move(350,250);await page.mouse.wheel(0,-1600);await page.mouse.down({button:'middle'});await page.mouse.move(-1800,-1800);await page.mouse.up({button:'middle'});await page.waitForTimeout(180);
    const offscreen=await page.evaluate(async()=>{const a=world.getDebugSnapshot();await new Promise(r=>setTimeout(r,250));const b=world.getDebugSnapshot();return{visible:b.view.visibleNPCs,npcSteps:b.npcSimSteps-a.npcSimSteps,animalSteps:b.animalSimSteps-a.animalSimSteps,propUpdates:b.propUpdates-a.propUpdates};});assert.equal(offscreen.visible,0);assert.equal(offscreen.npcSteps,0);assert.equal(offscreen.animalSteps,0);assert.equal(offscreen.propUpdates,0);
    await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);const report={pixels,activity,comparison,greeting,offscreen,errors};await fs.writeFile('test-results/active-environment.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
