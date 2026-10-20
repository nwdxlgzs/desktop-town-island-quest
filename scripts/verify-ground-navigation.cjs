const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One fixed tiny island in the actual WebGL world. No random map generation.
(async()=>{
  let server,browser;
  try{
    const {createServer}=await import('vite');server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__ground-check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><style>body{margin:0}#world{width:900px;height:700px}canvas{display:block}</style><body><div id="world"></div></body></html>'}));
    await page.goto(server.resolvedUrls.local[0]+'__ground-check.html');await fs.mkdir('test-results',{recursive:true});
    await page.evaluate(async()=>{
      const {createWorld}=await import('/src/world.js'),{mountainObstacles}=await import('/src/mountain-shape.js');
      window.groundMap={seed:1,width:13,depth:13,shoreline:{radii:Array(96).fill(.9)},bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},shoreX:6,dock:{x:4,z:0},boat:{x:9,z:0},spawn:{x:0,z:0},level:{id:'fixed-ground',map:{npcLimit:0},npc:{radius:2,speed:.65}},terrain:{baseLayers:0,layerHeight:.75,coastLayers:Array(12).fill(0)},terrainReady:true,workshops:[],npcSpawns:{},obstacles:[],roads:[],ladders:[],terraces:[{x:0,z:0,r:1.2,ramp:.01,height:4}],trees:[],mountains:[],villages:[],camps:[],reefs:[],exploration:[],wildlife:[],fences:[]};
      window.mountainObstacles=mountainObstacles;window.notices=[];window.groundWorld=createWorld(document.querySelector('#world'),{layout:groundMap,onInteract(){},onBoard(){},onReady(){},onError(e){throw e;},onTravelState(){},onNotice:text=>notices.push(text),isPaused:()=>false});
      groundWorld.setQuality({resolution:'1',maxFps:30,npcMovement:false,waves:false,shadowQuality:'off'});
    });
    const snapshot=()=>page.evaluate(()=>groundWorld.getDebugSnapshot());
    const settle=()=>page.waitForFunction(()=>groundWorld.getDebugSnapshot().renderCount>2);
    const click=async(x,y,z)=>{const p=await page.evaluate(p=>groundWorld.screenPoint(...p),[x,y,z]);assert.ok(p.x>=0&&p.x<900&&p.y>=0&&p.y<700);await page.mouse.click(p.x,p.y);};
    const arrived=point=>page.waitForFunction(p=>{const s=groundWorld.getDebugSnapshot();return !s.routeRemaining&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.015;},point,{timeout:15000});
    await settle();await click(.2,4.075,.2);await arrived({x:.2,z:.2});assert.ok((await snapshot()).position.y>4.2);await page.screenshot({path:'test-results/ground-high-click.png'});
    // Native pointer pixels must reject a visible side face and the open sea.
    await click(0,2,1.3);assert.match(await page.evaluate(()=>notices.at(-1)),/崖壁/);assert.equal((await snapshot()).routeRemaining,0);
    await click(6,0,5);assert.match(await page.evaluate(()=>notices.at(-1)),/岛上的地面/);assert.equal((await snapshot()).routeRemaining,0);
    await page.evaluate(()=>groundWorld.loadLevel({...groundMap,spawn:{x:2.2,z:0}}));
    await page.keyboard.down('a');await page.waitForTimeout(600);await page.keyboard.up('a');let p=(await snapshot()).position;assert.ok(p.x>=1.87&&p.x<2.2);await page.screenshot({path:'test-results/ground-cliff-clearance.png'});
    await page.evaluate(()=>groundWorld.walkTo({x:-2.2,z:0}));await arrived({x:-2.2,z:0});
    await page.evaluate(()=>groundWorld.loadLevel({...groundMap,spawn:{x:4.1,z:3.1},terraces:[]}));await click(4.55,.075,3.25);await arrived({x:4.55,z:3.25});await page.screenshot({path:'test-results/ground-coast-clearance.png'});
    await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');p=(await snapshot()).position;assert.ok(p.x<=4.92,'feet stay supported on the coast tile');
    await page.evaluate(()=>{const mountain={x:-2,z:0,w:2,d:2,height:3,baseHeight:0};groundWorld.loadLevel({...groundMap,terraces:[],spawn:{x:-2,z:2.3},mountains:[mountain],obstacles:mountainObstacles(mountain,'cave'),level:{...groundMap.level,biome:{id:'cave'}}});});
    await page.keyboard.down('w');await page.waitForTimeout(650);await page.keyboard.up('w');p=(await snapshot()).position;assert.ok(p.z>=1.83&&p.z<2.3,'walking body stays outside the protruding central cave pillar');await page.screenshot({path:'test-results/ground-mountain-clearance.png'});
    // Native input in a one-unit step fixture with a normal half-step detour.
    await page.evaluate(()=>{window.stepMap={...groundMap,spawn:{x:0,z:1.45},terraces:[{x:0,z:0,r:1.2,ramp:.01,height:1},{x:2,z:0,r:1.2,ramp:.01,height:.5}]};groundWorld.loadLevel(stepMap);});await settle();
    await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');assert.ok((await snapshot()).position.z>=1.3,'ordinary walking stops at a one-unit rise');
    await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForFunction(()=>groundWorld.getDebugSnapshot().position.z<1.1,null,{timeout:3000});await page.keyboard.up('w');assert.ok((await snapshot()).position.y>1.2,'jump crosses onto the higher floor');
    await page.screenshot({path:'test-results/ground-jump-step.png'});await page.waitForFunction(()=>!groundWorld.getDebugSnapshot().motion.jump);
    await page.keyboard.down('s');await page.waitForFunction(()=>groundWorld.getDebugSnapshot().position.z>1.4,null,{timeout:3000});await page.keyboard.up('s');assert.ok((await snapshot()).position.y<.5,'limited descent works without jumping');
    await page.evaluate(()=>groundWorld.loadLevel(stepMap));await settle();await page.keyboard.press('Space');await page.waitForFunction(()=>!groundWorld.getDebugSnapshot().motion.jump);await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');assert.ok((await snapshot()).position.z>=1.3,'jump clearance expires');
    await page.evaluate(()=>groundWorld.loadLevel({...stepMap,terraces:[stepMap.terraces[0]]}));await settle();await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');assert.ok((await snapshot()).position.z>=1.3,'isolated landing cannot be jumped onto');
    await page.evaluate(()=>groundWorld.loadLevel({...stepMap,spawn:{x:0,z:1.1},terraces:[stepMap.terraces[0]]}));await settle();await page.keyboard.down('s');await page.waitForTimeout(350);await page.keyboard.up('s');assert.ok((await snapshot()).position.z<=1.3,'isolated descent remains blocked');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:['actual high-floor click','cliff and sea rejection','manual cliff clearance','automatic route around cliff','visible coast tile reachable','coastal support','protruding cave collision','temporary jump step clearance','connected descent','expired jump resets clearance','isolated rise and drop rejected'],errors},null,2));
    await page.evaluate(()=>groundWorld.dispose());
  }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exit(1);});
