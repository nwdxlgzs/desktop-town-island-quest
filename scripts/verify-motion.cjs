const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:740},deviceScaleFactor:.5}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:17,completed:[],sound:false})));
  await page.goto('http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__quest?.world);
  assert.ok(await page.evaluate(()=>window.__quest.world.getQuality().pixelRatio<=1.5));
  await page.locator('#quality-settings').click();await page.locator('#render-resolution').selectOption('.5');await page.locator('#quality-adaptive').uncheck();await page.locator('#quality-form [type=submit]').click();assert.equal(await page.evaluate(()=>window.__quest.world.getQuality().pixelRatio),.5);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
   const q=window.__quest,{createShoreline}=await import('/src/shoreline.js'),{randomSource}=await import('/src/random.js');
   const l={...structuredClone(q.layout),seed:1,width:24,depth:22,shoreline:createShoreline(24,22,'oval',randomSource(1)),spawn:{x:4,z:0},dock:{x:10,z:0},boat:{x:14,z:0},shoreX:11,bounds:{minX:-11,maxX:11,minZ:-10,maxZ:10},terrain:{baseLayers:0,layerHeight:.75,coastLayers:Array(12).fill(0)},terrainReady:true,foundations:[],mountains:[],workshops:[],npcSpawns:{'village-0':{x:3,z:0}},villages:[{x:7,z:0,w:1,d:1,houses:[]}],camps:[],trees:[],reefs:[],forests:[],lakes:[],river:null,exploration:[],wildlife:[],obstacles:[],terraces:[{x:0,z:0,r:2,ramp:.05,height:4.5}],roads:[],ladders:[{id:'test-ladder',bottom:{x:3,z:0,y:0},top:{x:1,z:0,y:4.5},face:{x:2.3,z:0},height:4.5,width:1.3}]};
   q.world.loadLevel(l);window.__motionFixture=l;
  });
  const snapshot=()=>page.evaluate(()=>window.__quest.world.getDebugSnapshot());
  await page.locator('#world-container canvas').focus();const start=(await snapshot()).position;
  await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');const walked=(await snapshot()).position;
  await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');await page.keyboard.up('Shift');const ran=(await snapshot()).position;
  assert.ok(Math.abs(ran.z-walked.z)>Math.abs(walked.z-start.z)*1.15,'Shift runs faster');
  await page.keyboard.down('Space');await page.waitForTimeout(220);assert.ok((await snapshot()).motion.jump>0);assert.ok((await snapshot()).position.y>.6);await page.keyboard.up('Space');await page.waitForTimeout(550);
  const beforeModifiers=(await snapshot()).position;
  await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Control',ctrlKey:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',ctrlKey:true}));});
  await page.waitForTimeout(150);const afterModifiers=await snapshot();assert.ok(Math.hypot(afterModifiers.position.x-beforeModifiers.x,afterModifiers.position.z-beforeModifiers.z)<.01);assert.equal(Object.hasOwn(afterModifiers.motion,'roll'),false);
  // Climb the steep face, then descend: both rely on the exact same ladder navigation.
  await page.evaluate(()=>window.__quest.world.walkTo(window.__motionFixture.ladders[0].top));
  await page.waitForFunction(()=>{const s=window.__quest.world.getDebugSnapshot();return s.motion.climbing&&s.position.y>1&&s.position.y<3;},{},{timeout:10000});
  const midClimb=await snapshot();await page.waitForTimeout(250);const nextClimb=await snapshot();assert.ok(Math.abs(midClimb.position.x-nextClimb.position.x)<.001);assert.ok(Math.abs(midClimb.position.z-nextClimb.position.z)<.001);assert.ok(nextClimb.position.y>midClimb.position.y);assert.ok(midClimb.position.x>2.4);
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/vertical-ladder.png'});
  await page.waitForFunction(()=>{const s=window.__quest.world.getDebugSnapshot();return !s.routeRemaining&&!s.motion.climbing&&s.position.y>4.6;},{},{timeout:12000});
  assert.ok((await snapshot()).npcs[0].y>4.6,'resident can climb the same vertical ladder onto the platform');
  await page.evaluate(()=>window.__quest.world.useLadder('test-ladder'));await page.waitForFunction(()=>{const s=window.__quest.world.getDebugSnapshot();return !s.routeRemaining&&!s.motion.climbing&&s.position.y<.4;},{},{timeout:10000});
  await page.evaluate(()=>window.__quest.world.walkTo({x:-3,z:-3}));await page.waitForFunction(()=>!window.__quest.world.getDebugSnapshot().routeRemaining,{},{timeout:10000});
  await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().outline,{},{timeout:2500});
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/motion-outline.png'});
  // Return to the existing real island for NPC greeting and weather rendering.
  await page.evaluate(()=>{const q=window.__quest;q.world.loadLevel(q.layout);q.world.syncExploration(q.state.exploration);const n=q.world.getDebugSnapshot().npcs[0];q.world.walkTo({x:n.x,z:n.z});});
  await page.waitForFunction(()=>!window.__quest.world.getDebugSnapshot().routeRemaining,{},{timeout:16000});await page.keyboard.press('e');assert.ok((await snapshot()).motion.wave>0);await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().npcs.some(n=>n.arm>1),{},{timeout:2000});
  await page.evaluate(()=>{const q=window.__quest,l=structuredClone(q.layout);l.level.environment=q.levels.find(l=>l.environment.id==='rain').environment;q.world.loadLevel(l);});await page.waitForTimeout(200);await page.screenshot({path:'test-results/motion-rain.png'});
  const result=await snapshot();assert.equal(result.environment.id,'rain');assert.deepEqual(errors,[]);console.log(JSON.stringify({walkDistance:Math.abs(walked.z-start.z),runDistance:Math.abs(ran.z-walked.z),ladder:'up/down',outline:true,greeting:true,terrainVertices:result.terrainVertices,triangles:result.triangles,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
