const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'no-preference'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:314159,currentLevel:0,unlocked:0,completed:[],sound:false})));
  await page.goto(process.env.QUEST_URL||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__quest?.world);
  const snapshot=()=>page.evaluate(()=>window.__quest.world.getDebugSnapshot());
  await fs.mkdir('test-results',{recursive:true});
  async function walk(point){await page.evaluate(p=>window.__quest.world.walkTo(p),point);await page.waitForFunction(p=>{const s=window.__quest.world.getDebugSnapshot();return !s.routeRemaining&&Math.hypot(s.position.x-p.x,s.position.z-p.z)<.15;},point,{timeout:60000});}
  const workshop=(await snapshot()).layout.workshops[0],[wx,wz]=workshop.position;
  // Exercise the long counter's back and right side with real E key presses.
  for(const point of [{x:wx-.6,z:wz-1.8},{x:wx+3.15,z:wz-.6}]){
    await walk(point);await page.waitForFunction(()=>document.querySelector('#interaction-hint').classList.contains('available'));
    if(point.x>wx+3)await page.screenshot({path:'test-results/counter-zone.png'});
    await page.keyboard.press('e');await page.locator('#modal-layer').waitFor({state:'visible'});assert.equal((await snapshot()).routeRemaining,0);
    await page.locator('#modal').evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));await page.keyboard.press('Escape');
  }
  // Click the physical counter, with no HTML marker under the pointer.
  const counterPoint=await page.evaluate(()=>{const w=window.__quest.world,s=w.getDebugSnapshot().layout.workshops[0];return w.screenPoint(s.position[0]-.6,1.25+s.elevation,s.position[1]-.7);});
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,counterPoint),'CANVAS');
  await page.mouse.click(counterPoint.x,counterPoint.y);await page.locator('#modal-layer').waitFor({state:'visible'});
  await page.screenshot({path:'test-results/counter-interaction.png'});await page.keyboard.press('Escape');
  await walk((await snapshot()).layout.dock);
  const before=await snapshot();await page.waitForTimeout(5500);const after=await snapshot();
  assert.ok(Math.hypot(before.npcs[0].x-after.npcs[0].x,before.npcs[0].z-after.npcs[0].z)>.1,'NPC did not roam');
  const [sx,sz]=after.layout.workshops[0].position;assert.ok(Math.hypot(after.npcs[0].x-sx-1.75,after.npcs[0].z-sz+.8)<=after.layout.level.npc.radius+.01,'NPC left its configured roaming radius');
  await page.evaluate(()=>{const w=window.__quest.world,n=w.getDebugSnapshot().npcs[0];w.walkTo(n);});
  await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().npcs[0].arm>1,{},{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('#interaction-hint').classList.contains('available'));
  await page.keyboard.press('e');await page.locator('#modal-layer').waitFor({state:'visible'});await page.keyboard.press('Escape');
  const npcPoint=await page.evaluate(()=>{const w=window.__quest.world,n=w.getDebugSnapshot().npcs[0];return w.screenPoint(n.x,n.y+.65,n.z);});await page.mouse.click(npcPoint.x,npcPoint.y);await page.locator('#modal-layer').waitFor({state:'visible'});await page.keyboard.press('Escape');
  // Find an unobstructed point just behind a tree relative to the camera.
  const candidates=await page.evaluate(async()=>{const {blockedAt}=await import('/src/level-layout.js'),l=window.__quest.layout;return l.trees.map(t=>({x:t.x-.6,z:t.z-1})).filter(p=>!blockedAt(l,p.x,p.z));});
  assert.ok(candidates.length);
  let faded=false;
  for(const p of candidates){await page.evaluate(p=>window.__quest.world.walkTo(p),p);await page.waitForFunction(p=>{const pos=window.__quest.world.getDebugSnapshot().position;return Math.hypot(pos.x-p.x,pos.z-p.z)<.2;},p,{timeout:60000});await page.waitForTimeout(500);if((await snapshot()).faded>0){faded=true;break;}}
  assert.ok(faded,'tree between camera and player did not become translucent');
  await page.screenshot({path:'test-results/tree-transparency.png'});
  // Ordinary-duration sailing must show at most two islands, then release the old one.
  await page.evaluate(()=>{const q=window.__quest;q.state.completed.push(...q.levels[0].tasks);q.refresh();});
  await page.locator('#world-container').hover();await page.mouse.wheel(0,-1800);const zoomed=(await snapshot()).cameraHalf;
  await page.locator('#go-station').click();await page.waitForFunction(()=>window.__quest.world.isTraveling(),{},{timeout:90000});assert.equal((await snapshot()).islandCount,2);
  const flight=page.evaluate(async()=>{const {voyageClear}=await import('/src/voyage.js'),w=window.__quest.world,phases=new Set();let frames=0,minIslands=2,maxIslands=0,lastHeading=null,maxTurn=0;while(w.isTraveling()){const s=w.getDebugSnapshot();if(!voyageClear(s.boat,s.layout,s.incomingLayout,s.incomingOffset))throw Error('boat hull overlaps shore during '+s.travelPhase);if(lastHeading!==null)maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(s.boat.heading-lastHeading),Math.cos(s.boat.heading-lastHeading))));lastHeading=s.boat.heading;phases.add(s.travelPhase);frames++;minIslands=Math.min(minIslands,s.islandCount);maxIslands=Math.max(maxIslands,s.islandCount);await new Promise(requestAnimationFrame);}return {frames,phases:[...phases],minIslands,maxIslands,maxTurn};});
  await page.waitForFunction(()=>window.__quest.world.getDebugSnapshot().travelPhase==='sailing');await page.waitForFunction(h=>window.__quest.world.getDebugSnapshot().cameraHalf>h*2,zoomed);await page.waitForTimeout(2300);await page.screenshot({path:'test-results/voyage-normal.png'});
  const voyage=await flight;assert.ok(voyage.frames>20);assert.ok(voyage.maxTurn<.65,'boat makes an abrupt turn');assert.deepEqual(voyage.phases,['boarding','sailing','landing']);assert.equal(voyage.minIslands,2);assert.equal(voyage.maxIslands,2);
  await page.waitForFunction(()=>window.__quest.state.currentLevel===1,{},{timeout:15000});assert.equal((await snapshot()).islandCount,1);
  await page.locator('#overview-camera').click();await page.waitForTimeout(500);await page.screenshot({path:'test-results/irregular-island.png'});
  const map=await snapshot();assert.ok(map.layout.workshops.length>=3);assert.equal(await page.locator('.mini-map > polygon').getAttribute('points'),map.layout.shoreline.points.map(p=>`${p.x},${p.z}`).join(' '));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({counter:'back and side E + physical click',npc:'E + roam + wave',voyage,shape:map.layout.shoreline.shape,errors},null,2));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
