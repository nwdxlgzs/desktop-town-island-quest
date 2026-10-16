const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// A few boxes at 150%, not a generated map. Each fixture closes its browser.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:620,height:440}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2000));});
    await page.route('**/__render-polish.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__render-polish.html');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createAntialias}=await import('/src/antialias.js'),{installVoxelLighting}=await import('/src/voxel-lighting.js'),{createStaticFrameCache}=await import('/src/static-frame-cache.js'),{createShadowRefresh}=await import('/src/shadow-refresh.js');
      const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(600,400);renderer.setPixelRatio(1.5);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.info.autoReset=false;document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#c4dcd8');const camera=new THREE.OrthographicCamera(-6,6,4,-4,.1,100);camera.position.set(10,14,16);camera.lookAt(0,0,0);camera.layers.enable(1);camera.updateMatrixWorld();
      const sun=new THREE.DirectionalLight('#fff5db',2.8);sun.position.set(-4,12,5);sun.layers.enable(1);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:40});scene.add(sun,sun.target);const ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.5);ambient.layers.enable(1);scene.add(ambient);
      const geometries=[],materials=[];
      function box(x,y,z,w,h,d,color,layer=0){const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshLambertMaterial({color}),o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.layers.set(layer);o.castShadow=o.receiveShadow=true;scene.add(o);geometries.push(g);materials.push(m);return o;}
      box(0,-.15,0,11,.3,8,'#cad2a6');box(-1,1,-1,2,2,2,'#bbc5a1');box(2,.5,-2,2,1,2,'#e2c48d');const actor=box(0,.7,1,.6,1.4,.6,'#5a95bd',1);
      installVoxelLighting(scene);const aa=createAntialias(renderer,scene,camera);aa.prepare(scene);aa.configure(true,600,400,1.5);const cache=createStaticFrameCache(renderer,scene,camera,aa.renderWorld,()=>{}),shadows=createShadowRefresh(renderer,scene,camera);
      const clearCounts=[],shadowTriangles=[];let clears=0;const originalClear=renderer.clear.bind(renderer);renderer.clear=(...args)=>{clears++;return originalClear(...args);};
      function frame(cached=true){clears=0;scene.updateMatrixWorld(true);camera.updateMatrixWorld();renderer.info.reset();if(cached&&shadows.refresh()){shadowTriangles.push(renderer.info.render.triangles);cache.invalidate();}aa.render(output=>cache.render(output,cached));clearCounts.push(clears);if(scene.overrideMaterial!==null)throw Error("shadow material was not restored");}
      async function pixels(){const im=new Image();im.src=renderer.domElement.toDataURL();await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      frame();const first=await pixels();
      for(let i=1;i<12;i++){actor.position.x=i*.08;if(i===6)renderer.shadowMap.needsUpdate=true;frame();}
      const reuseClears=clearCounts.slice(0,12).reduce((n,c,i)=>n+((i===0||i===6)?0:c),0);
      const cached=await pixels(),stats={...cache.stats},cachedTriangles=renderer.info.render.triangles;frame(false);const direct=await pixels(),directTriangles=renderer.info.render.triangles;let different=0,mean=0,changed=0;
      for(let i=0;i<cached.length;i+=4){const d=Math.abs(cached[i]-direct[i])+Math.abs(cached[i+1]-direct[i+1])+Math.abs(cached[i+2]-direct[i+2]);mean+=d;if(d>45)different++;if(Math.abs(first[i]-cached[i])+Math.abs(first[i+1]-cached[i+1])+Math.abs(first[i+2]-cached[i+2])>30)changed++;}
      // Opacity-only frames must reuse the opaque island and retain depth ordering.
      const {batchOccluders}=await import('/src/render-batches.js');
      const fadeGroup=new THREE.Group(),fadeGeometry=new THREE.BoxGeometry(1.8,3,1.8).translate(-2,1.5,1),fadeMaterial=new THREE.MeshLambertMaterial({transparent:true,vertexColors:true});fadeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(fadeGeometry.attributes.position.count*3).fill(.7),3));fadeGroup.add(new THREE.Mesh(fadeGeometry,fadeMaterial));scene.add(fadeGroup);const occluder={group:fadeGroup},batch=batchOccluders([occluder],scene);installVoxelLighting(scene);aa.prepare(scene);
      cache.invalidate();frame();const start={...cache.stats};if(batch.setFading(occluder,true))cache.invalidate();
      for(let i=0;i<8;i++){fadeMaterial.opacity=1-(i+1)*.085;fadeMaterial.depthWrite=fadeMaterial.opacity>.95;frame();}
      const faded=await pixels(),end={...cache.stats};frame(false);const fadeDirect=await pixels();let fadeDifference=0;
      for(let i=0;i<faded.length;i+=4)if(Math.abs(faded[i]-fadeDirect[i])+Math.abs(faded[i+1]-fadeDirect[i+1])+Math.abs(faded[i+2]-fadeDirect[i+2])>45)fadeDifference++;
      const result={shadowTriangles,reuseClears,fades:{captures:end.captures-start.captures,hits:end.hits-start.hits,differentFraction:fadeDifference/(faded.length/4)},shadows:{refreshes:shadows.updates,captures:stats.captures,hits:stats.hits,cachedTriangles,directTriangles,differentFraction:different/(cached.length/4),meanDifference:mean/(cached.length*.75),movingPixels:changed}};
      shadows.dispose();cache.dispose();aa.dispose();renderer.shadowMap.enabled=false;sun.shadow.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();return result;
    });
    assert.deepEqual(result.shadowTriangles,[48,48],"shadow setup submits only the four real shadow casters, no duplicate color vertices");assert.equal(result.reuseClears,0);assert.equal(result.fades.captures,1);assert.equal(result.fades.hits,7);assert.ok(result.fades.differentFraction<.025,JSON.stringify(result));assert.equal(result.shadows.refreshes,2);assert.equal(result.shadows.captures,2);assert.equal(result.shadows.hits,10);assert.ok(result.shadows.cachedTriangles<result.shadows.directTriangles);assert.ok(result.shadows.differentFraction<.025&&result.shadows.meanDifference<2,JSON.stringify(result));assert.ok(result.shadows.movingPixels>100);assert.deepEqual(errors,[]);
    await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/render-polish.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
