const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// Fixed small raster comparisons: six source outlines versus one pose batch,
// and complete rain boxes versus selected faces. No generated-map benchmark.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__live-detail.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:5174/__live-detail.html');
    const results=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createPerson}=await import('/src/scene-assets.js'),{batchPlayer}=await import('/src/player-batch.js'),{createAvatarOutline}=await import('/src/avatar-outline.js'),{createEnvironment}=await import('/src/environment.js');
      const renderer=new THREE.WebGLRenderer({antialias:false}),target=new THREE.WebGLRenderTarget(400,300);renderer.setSize(400,300);renderer.setRenderTarget(target);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#294b43');scene.fog=new THREE.Fog('#294b43',100,150);const camera=new THREE.OrthographicCamera(-2.5,2.5,1.875,-1.875,.1,100);camera.layers.enable(1);
      const sun=new THREE.DirectionalLight('#fff5db',2.6),ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.8),fill=new THREE.DirectionalLight();scene.add(sun,ambient,fill);
      const cube=new THREE.BoxGeometry(),actor=createPerson(cube,color=>new THREE.MeshLambertMaterial({color}),'#5a95bd');scene.add(actor);
      const body=batchPlayer(actor),outline=createAvatarOutline(actor,body.installPose),line=actor.children.find(o=>o.isLineSegments),references=actor.userData.parts.map(p=>{const l=new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry,25),new THREE.LineBasicMaterial({color:'#d2ff83',transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false}));l.renderOrder=10000;l.layers.set(1);p.add(l);return l;});
      const a=new Uint8Array(400*300*4),b=new Uint8Array(a.length),outlines=[],rainResults=[];
      function pixels(out){renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,400,300,out);return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
      function difference(){let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)count++;return count;}
      for(let i=0;i<4;i++){
        const angle=i*Math.PI/2+.2;camera.position.set(Math.cos(angle)*6,5,Math.sin(angle)*6);camera.lookAt(0,.9,0);
        actor.userData.armR.rotation.z=i%2?2.3:0;actor.userData.armL.rotation.x=i%2?-.7:0;actor.userData.left.rotation.x=i%2?.6:0;actor.userData.head.rotation.y=i%2?.4:0;body.update();
        outline.set(false);references.forEach(l=>l.visible=true);const full=pixels(a);references.forEach(l=>l.visible=false);outline.set(true);const selected=pixels(b);
        outlines.push({angle,full,selected,differentPixels:difference()});
      }
      actor.visible=false;
      const env=createEnvironment({scene,sun,ambient,fill,renderer,ocean:{setTint(){}},cube}),rain=scene.children.at(-1),reference=new THREE.InstancedMesh(cube.clone(),rain.material,96);reference.instanceMatrix=rain.instanceMatrix;reference.frustumCulled=false;reference.layers.set(1);scene.add(reference);
      env.set({sun:[-12,28,16],sunColor:'#fff5db',sunIntensity:2.6,ambient:1.8,fill:.65,sky:'#dfeee9',sea:'#c1d9d6',exposure:1.02,rain:true},true);
      camera.left=-12;camera.right=12;camera.top=9;camera.bottom=-9;camera.updateProjectionMatrix();const indexVersion=rain.geometry.index.version;
      for(let i=0;i<4;i++){
        const angle=i*Math.PI/2+.2,x=18*Math.cos(angle)+30*Math.sin(angle),z=30*Math.cos(angle)-18*Math.sin(angle);camera.position.set(x,25,z);camera.lookAt(0,0,0);env.setView(x,25,z);env.update(0,2+i*.4,new THREE.Vector3(),{particles:64});
        const version=rain.geometry.index.version;env.setView(x*2,50,z*2);if(rain.geometry.index.version!==version)throw Error('Unchanged facing reuploaded rain indices');
        rain.visible=false;reference.visible=true;reference.count=64;const full=pixels(a);reference.visible=false;rain.visible=true;const selected=pixels(b);
        rainResults.push({angle,full,selected,differentPixels:difference()});
      }
      const result={outlines,rain:rainResults,outlinePositionUploads:line.geometry.attributes.position.version,rainPoseUploads:rain.instanceMatrix.version,rainIndexChanges:rain.geometry.index.version-indexVersion};
      references.forEach(l=>{l.geometry.dispose();l.material.dispose();});outline.dispose();body.dispose();env.dispose();reference.geometry.dispose();reference.dispose();actor.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});cube.dispose();target.dispose();renderer.dispose();return result;
    });
    for(const r of results.outlines){assert.equal(r.full.draws-r.selected.draws,5);assert.ok(r.differentPixels<=3,JSON.stringify(r));}
    for(const r of results.rain){assert.equal(r.full.triangles,768);assert.equal(r.selected.triangles,384);assert.equal(r.differentPixels,0,JSON.stringify(r));}
    assert.equal(results.outlinePositionUploads,0);assert.deepEqual(errors,[]);await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/live-detail.json',JSON.stringify({...results,errors},null,2));console.log(JSON.stringify({...results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
