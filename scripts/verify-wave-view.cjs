const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
// Twelve small static captures: compare view-selected waves with a complete
// independent CPU lattice, including opposite views and lattice-boundary times.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__wave-view.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:5174/__wave-view.html');
    const results=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createOcean}=await import('/src/ocean.js');
      const ocean=createOcean(),renderer=new THREE.WebGLRenderer({antialias:false}),target=new THREE.WebGLRenderTarget(400,300);renderer.setSize(400,300);renderer.setRenderTarget(target);
      const scene=new THREE.Scene();scene.background=new THREE.Color(0);const camera=new THREE.OrthographicCamera(-15,15,11.25,-11.25,.1,200),cube=new THREE.BoxGeometry(),mat=new THREE.MeshBasicMaterial({color:'#e5f1e8'}),reference=new THREE.InstancedMesh(cube,mat,13*13*3),dummy=new THREE.Object3D(),a=new Uint8Array(400*300*4),b=new Uint8Array(a.length),results=[];
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const time of [0,14.9,15.1]){
        camera.position.set(18*Math.cos(angle)+30*Math.sin(angle),25,30*Math.cos(angle)-18*Math.sin(angle));camera.lookAt(0,0,0);camera.updateMatrixWorld();ocean.setCamera(camera);ocean.setView(camera.position.x,camera.position.z);ocean.update(time,0,0,true);
        scene.add(ocean.waves);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,400,300,a);scene.remove(ocean.waves);
        let i=0;for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++)for(let part=0;part<3;part++){
          const x=-65+col*16+((row%2)+2)%2*5+part*.65,z=-58+row*17+(part%2)*.2;
          dummy.position.set(x+time*.45,-.23+Math.floor(Math.sin(time*1.4+x*.2)*2)*.008,z+time*1.2);dummy.scale.set(.7,.035,.18);dummy.updateMatrix();reference.setMatrixAt(i++,dummy.matrix);
        }reference.instanceMatrix.needsUpdate=true;scene.add(reference);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,400,300,b);scene.remove(reference);
        let different=0,lit=0;for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>45)different++;if(b[i]+b[i+1]+b[i+2]>30)lit++;}results.push({angle,time,instances:ocean.instances,previousInstances:216,differentPixels:different,wavePixels:lit});
      }ocean.dispose();cube.dispose();mat.dispose();reference.dispose();target.dispose();renderer.dispose();return results;
    });
    for(const r of results){assert.ok(r.wavePixels>5);assert.ok(r.differentPixels<=8,JSON.stringify(r));assert.ok(r.instances<216);}
    assert.deepEqual(errors,[]);await fs.writeFile('test-results/wave-view.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
