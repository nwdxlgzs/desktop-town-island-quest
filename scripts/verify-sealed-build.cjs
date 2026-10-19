const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {gunzipSync}=require('node:zlib');

async function verifySealedBuild(browser){
  const html=await fs.readFile('dist/index.html','utf8'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'island-flow-check-'));
  const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[],network=[],results=[],files=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  const sha=s=>createHash('sha256').update(s).digest('base64');
  const old=html.match(/id="game-bootstrap">([\s\S]*?)<\/script>/)[1],changed=old.replace('document.dispatchEvent','void');
  assert.notEqual(old,changed,'must actually disable loader notification');
  assert.ok(!/crypto|DecompressionStream|function halt/.test(old));
  const program=JSON.parse(gunzipSync(Buffer.from(html.match(/id="game-program">([^<]+)</)[1],'base64'))).program;
  for(const name of ['createSessionFlow','useSessionStep','cancelSession','watchGuide','releaseGuide','onViolation','startCreditGuard','disposeCreditGuard','__ISLAND_RELEASE_BINDING__'])assert.ok(!program.includes(name),name+' must be mangled in the executable, not merely hidden in packed data');
  for(const executable of [old,program]){
    const decoded=executable.replace(/\\u([\da-f]{4})|\\x([\da-f]{2})/gi,(_,u,x)=>String.fromCharCode(parseInt(u||x,16)));
    for(const text of ['securitypolicyviolation','island-integrity-failed','integrityFailed','data-integrity-failed','gameStopped','文件完整性检查未通过','教具署名缺失或被修改','#game-credit-source','[data-sponsor-credit]','meta[http-equiv="Content-Security-Policy" i]','style,link[rel="stylesheet"]'])assert.ok(!decoded.includes(text),'plaintext/escaped check string: '+text);
    assert.ok(!executable.includes('__ISLAND_CHECK_STRINGS__'));
  }
  const meta=html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0];
  const variants={
    credit:html.replace(/PoweredBy@nwdxlgzs[^<]+/,'changed'),
    payload:html.replace('id="game-program">','id="game-program">AAAA'),
    disabledLoaderNotificationAndRehash:html.replace(old,()=>changed).replace(sha(old),sha(changed)),
    policyDeletion:html.replace(meta,''),
    policyMovedToBody:html.replace(meta,'').replace('</body>',`${meta}<style>.sponsor-credit{display:none}</style></body>`),
    policyAfterActiveContent:html.replace(meta,'').replace('</head>',`<style>.sponsor-credit{display:none}</style>${meta}</head>`),
    policyEdit:html.replace("connect-src 'none'","connect-src *"),
  };
  try{
    for(const [name,body]of Object.entries(variants)){
      assert.notEqual(body,html,name+' must not be a no-op');const file=path.join(dir,name+'.html');files.push(file);await fs.writeFile(file,body);
      await page.goto(pathToFileURL(file).href);await page.locator('[data-game-stopped=true]').waitFor({timeout:10000}).catch(async e=>{throw new Error(name+': '+(await page.locator('body').innerText()).slice(0,160)+' '+errors.join('; '));});await page.waitForTimeout(60);
      assert.equal(await page.locator('canvas').count(),0,name);assert.equal(await page.evaluate(()=>!!window.injectedCodeRan),false,name);results.push({name,stopped:true});
    }
    // Both optional native APIs are unavailable for the legitimate control.
    await page.addInitScript(()=>{
      Object.defineProperty(window,'crypto',{configurable:true,value:undefined});Object.defineProperty(window,'DecompressionStream',{configurable:true,value:undefined});
      localStorage.setItem('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,completed:[],onboardingVersion:1,sound:false}));
    });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);await page.locator('#world-loading').waitFor({state:'detached',timeout:15000});
    await page.locator('#map-help').click();assert.match(await page.locator('#modal [data-sponsor-credit]').textContent(),/^PoweredBy@nwdxlgzs/);await page.keyboard.press('Escape');
    await page.locator('#quality-settings').click();await page.locator('#quality-form [type=submit]').click();
    await page.locator('#go-station').click();await page.locator('#exercise').waitFor({state:'visible',timeout:20000});const parcels=page.locator('#exercise .parcel.green');assert.equal(await parcels.count(),3);for(let i=0;i<3;i++)await parcels.nth(i).click();await page.locator('#success-banner').waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-game-stopped]').count(),0);assert.equal(await page.locator('canvas').count(),1);
    // A blocked preview/extension injection has not changed the application.
    // CSP must prevent its execution without aborting the legitimate game.
    await page.evaluate(()=>{
      const script=document.createElement('script');script.textContent='window.injectedCodeRan=true';document.body.append(script);
      const style=document.createElement('style');style.textContent='.sponsor-credit{display:none}';document.head.append(style);
      const link=document.createElement('link');link.rel='stylesheet';link.href='data:text/css,.sponsor-credit%7Bdisplay%3Anone%7D';document.head.append(link);
    });
    await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>!!window.injectedCodeRan),false);assert.equal(await page.locator('[data-game-stopped]').count(),0);assert.equal(await page.locator('canvas').count(),1);
    // Editing an actual delivered stylesheet still invalidates the session.
    await page.evaluate(()=>{document.head.querySelector('style').textContent+='\n.sponsor-credit{display:none}';});
    await page.locator('[data-game-stopped=true]').waitFor();assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    return {variants:results,nativeCryptoAndDecompressionAbsent:true,legitimateOfflineTask:true,callNamesMangled:true,checkStringsEncryptedInExecutable:true,blockedPreviewResourcesAllowed:true,deliveredStyleEditStopsRendering:true,errors,network};
  }finally{await page.close();for(const file of files)await fs.unlink(file);await fs.rmdir(dir);}
}
module.exports=verifySealedBuild;
if(require.main===module)(async()=>{const browser=await chromium.launch({headless:true});try{console.log(JSON.stringify(await verifySealedBuild(browser),null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
