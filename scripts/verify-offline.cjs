const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

// One offline island, no dev-server requests or generated stress samples.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[],network=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    await page.addInitScript(()=>{if(!localStorage.getItem('desktop-quest-v3'))localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,completed:[]}));});
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});assert.equal(await page.evaluate(()=>!!window.__quest),false);
    await page.locator('.onboarding-layer').waitFor();assert.equal(await page.locator('.onboarding-layer').getAttribute('data-step'),'0');
    assert.ok(!(await page.locator('.onboarding-card').innerText()).includes('右键'));await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/offline-onboarding.png'});
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='1');assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-mode')),true);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
    for(let i=0;i<3;i++)await page.locator('#onboarding-next').click();await page.locator('.onboarding-layer').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).onboardingVersion),1);await page.keyboard.press('Escape');
    await page.locator('#quality-settings').click();for(const id of ['quality-npcs','quality-waves','quality-weather'])assert.equal(await page.locator('#'+id).isChecked(),true,id);assert.equal(await page.locator('#quality-adaptive').isChecked(),false);assert.equal(await page.locator('#quality-shadow-level').inputValue(),'baked-high');assert.equal(await page.locator('#render-resolution').inputValue(),'1.5');assert.equal(await page.locator('#quality-fps').inputValue(),'30');assert.equal(await page.locator('#quality-antialias').inputValue(),'off');assert.equal(await page.locator('#quality-preset').inputValue(),'auto');
    assert.equal(await page.locator('#quality-terrain-lines').getAttribute('type'),'checkbox');assert.equal(await page.locator('#quality-terrain-lines').isChecked(),true);
    await page.locator('#quality-adaptive').uncheck();await page.locator('#render-resolution').selectOption('1.5');
    for(const enabled of [false,true]){await page.locator('#quality-terrain-lines').setChecked(enabled);await page.locator('#quality-form [type=submit]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-quest-v3')).quality.terrainLines),enabled?'beveled':'off');assert.equal(await page.locator('#modal-layer').isVisible(),false,'saving closes the modal');assert.equal(await page.evaluate(()=>document.body.classList.contains('has-modal')),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'quality-settings','focus returns to game settings');await page.locator('#quality-settings').click();assert.equal(await page.locator('#quality-terrain-lines').isChecked(),enabled);}
    const status=await page.locator('.quality-status').innerText();assert.match(status,/150%.*转静态烘焙.*1024 柔和投影 \+ 脚底简影/);await page.locator('#quality-form [type=submit]').click();assert.equal(await page.locator('#modal-layer').isVisible(),false);
    await page.reload();await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});assert.equal(await page.locator('.onboarding-layer').count(),0);await page.keyboard.press('Escape');await page.locator('#quality-settings').click();assert.equal(await page.locator('#quality-terrain-lines').isChecked(),true);await page.keyboard.press('Escape');
    await page.locator('#fullscreen').click();await page.waitForTimeout(200);
    const result=await page.locator('#world-container canvas').evaluate(c=>({ratio:c.width/c.clientWidth,title:document.title}));assert.ok(Math.abs(result.ratio-1.5)<.002);assert.match(result.title,/岛屿/);
    await page.locator('#island-route').click();assert.equal(await page.locator('.route-modal [data-level="1"]').isDisabled(),true);await page.keyboard.press('Escape');
    const canvas=page.locator('#world-container canvas'),bounds=await canvas.boundingBox(),x=bounds.x+bounds.width*.25,y=bounds.y+bounds.height*.5;
    await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+bounds.width*.45,y,{steps:6});await page.waitForTimeout(100);
    assert.equal(await canvas.evaluate(c=>c.style.cursor),'grabbing');await page.screenshot({path:'test-results/offline-orbit.png'});await page.mouse.up({button:'right'});assert.equal(await canvas.evaluate(c=>c.style.cursor),'default');
    await page.waitForTimeout(650);await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/offline-polished.png'});
    // Use the always-present course action: the first world label can be
    // legitimately outside the camera and culled after restoring the view.
    await page.locator('#fullscreen').click();await page.locator('#go-station').click();await page.locator('#exercise').waitFor({state:'visible',timeout:20000});
    const parcels=page.locator('#exercise .parcel.green');assert.equal(await parcels.count(),3);
    for(let i=0;i<3;i++)await parcels.nth(i).click();await page.locator('#success-banner').waitFor({state:'visible'});await page.keyboard.press('Escape');
    await page.screenshot({path:'test-results/offline-street-lamp.png'});
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);console.log(JSON.stringify({...result,lineStyles:'checkbox on/off save, close, restore focus, reopen and survive offline reload',exerciseCompleted:true,errors,network},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
