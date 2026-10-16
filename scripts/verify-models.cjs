const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// Static contact sheets for every configured species: no worlds, animation or
// random map generation. Each creature still consists of one indexed mesh.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__models.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><body style="margin:0;background:#e6eef0;font:16px sans-serif"></body></html>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__models.html');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createWildlife}=await import('/src/wildlife.js'),{batchProps}=await import('/src/render-batches.js'),config=await(await fetch('/src/levels.json')).json();
      const species=[...new Set(config.biomes.flatMap(b=>b.fauna))],cube=new THREE.BoxGeometry(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,1000);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eef0');scene.add(new THREE.AmbientLight('#fff8eb',2));const sun=new THREE.DirectionalLight('#fff4dc',2.6);sun.position.set(-3,6,4);scene.add(sun);
      const floor=new THREE.Mesh(new THREE.BoxGeometry(2.5,.06,2.5),new THREE.MeshLambertMaterial({color:'#c1d0c2'}));floor.position.y=-.03;scene.add(floor);
      const camera=new THREE.OrthographicCamera(-1.3,1.3,1.355,-1.355,.1,30);camera.position.set(2.4,1.8,4);camera.lookAt(0,.62,0);camera.updateMatrixWorld();
      const models=species.map(name=>createWildlife(name,cube));
      species.forEach((name,i)=>{const label=document.createElement('div');label.textContent=`${i+1}. ${name}`;label.style.cssText=`position:absolute;left:${i%5*240}px;top:${Math.floor(i/5)*250+222}px;width:240px;text-align:center;font-weight:600;color:#284955`;document.body.append(label);});
      const summary=models.map((m,i)=>{const g=m.children[0].geometry;return{species:species[i],flying:m.userData.flying,vertices:g.attributes.position.count,triangles:g.index.count/3,bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()},draws:m.children.length};});
      window.drawModels=(rear=false)=>{renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);models.forEach((m,i)=>{m.rotation.y=rear?Math.PI:0;scene.add(m);renderer.setViewport(i%5*240,1000-(Math.floor(i/5)+1)*250,240,250);renderer.setScissor(i%5*240,1000-(Math.floor(i/5)+1)*250,240,250);renderer.render(scene,camera);scene.remove(m);});};
      window.drawModels();
      const root=new THREE.Group();root.add(...models);root.updateMatrixWorld(true);const batch=batchProps(models,root),g=batch.viewList.mesh.geometry;
      const vertices=g.attributes.position.count,expanded=summary.reduce((n,m)=>n+m.triangles*3,0),n=g.attributes.normal,p=g.attributes.position,nv=n.version;for(const model of models)model.position.x+=.1;batch.update(models);
      const performance={indexedVertices:vertices,previousExpandedVertices:expanded,vertexReduction:1-vertices/expanded,translationNormalUploads:n.version-nv,translationPositionBytes:0,translationPoseBytes:batch.palette.bytes,previousPositionNormalBytes:expanded*6*4};
      models.forEach(m=>{m.position.x-=.1;m.children[0].layers.set(0);});batch.dispose();root.remove(...models);root.remove(batch.viewList.mesh);g.dispose();batch.viewList.mesh.material.dispose();
      const originals=species.map(name=>createWildlife(name,cube,m=>m.geometry.clone())),visual=[];
      function pixels(list,angle){
        renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
        list.forEach((m,i)=>{m.rotation.y=angle;scene.add(m);renderer.setViewport(i%5*240,1000-(Math.floor(i/5)+1)*250,240,250);renderer.setScissor(i%5*240,1000-(Math.floor(i/5)+1)*250,240,250);renderer.render(scene,camera);scene.remove(m);});
        const gl=renderer.getContext(),data=new Uint8Array(1200*1000*4);gl.readPixels(0,0,1200,1000,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
      }
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        const a=pixels(originals,angle),b=pixels(models,angle);let different=0,sum=0;
        for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=delta;if(delta>45)different++;}
        visual.push({angle,differentFraction:different/(a.length/4),meanDifference:sum/(a.length*.75)});
      }
      window.drawModels();
      window.releaseModels=()=>{[...models,...originals].forEach(m=>{m.children[0].geometry.dispose();m.children[0].material.dispose();});cube.dispose();floor.geometry.dispose();floor.material.dispose();renderer.dispose();};
      return{summary,performance,visual};
    });
    assert.equal(result.summary.length,19);for(const m of result.summary){assert.equal(m.draws,1,m.species);assert.ok(m.triangles<=360,m.species);assert.ok(m.bounds.min[1]>=-1e-6,m.species);}
    assert.equal(result.performance.translationNormalUploads,0);assert.ok(result.performance.vertexReduction>.3);
    for(const comparison of result.visual)assert.ok(comparison.differentFraction<.005&&comparison.meanDifference<.5,JSON.stringify(comparison));
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/models-front.png'});await page.evaluate(()=>window.drawModels(true));await page.screenshot({path:'test-results/models-rear.png'});await page.evaluate(()=>window.releaseModels());
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/models.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
