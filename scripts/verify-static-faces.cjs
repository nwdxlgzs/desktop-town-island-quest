const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// Eight small fixed captures, with an independent full-index reference. Check
// corners, tiers, rotated faces and offscreen shadow casters during a full turn.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__static-faces.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:5174/__static-faces.html');
    const results=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{mergeGeometries}=await import('/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),{spatialDrawList,createIslandView}=await import('/src/view-draw-list.js');
      const renderer=new THREE.WebGLRenderer({antialias:false}),target=new THREE.WebGLRenderTarget(400,300);renderer.setSize(400,300);renderer.setRenderTarget(target);renderer.shadowMap.type=THREE.PCFShadowMap;
      const scene=new THREE.Scene(),root=new THREE.Group();root.position.set(3,0,-2);scene.add(root);scene.background=new THREE.Color('#c9e0df');
      const sun=new THREE.DirectionalLight('#fff5de',2.2);sun.position.set(-8,16,5);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:.1,far:80});scene.add(sun,sun.target,new THREE.HemisphereLight('#e8f5ff','#7b9277',1.6));
      const pieces=[],staticLists=[],cube=new THREE.BoxGeometry(),dummy=new THREE.Object3D();
      function box(x,y,z,w,h,d,rotation=0){dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.y=rotation;dummy.updateMatrix();pieces.push(cube.clone().applyMatrix4(dummy.matrix));}
      box(0,-.8,0,15,1.6,14);box(-2,.6,-2,6,1.2,5);box(-3,1.8,-2,3,1.2,3);box(3,1.3,-1,2.5,2.6,2,Math.PI/5);box(-1,1.1,4,2,2.2,1.8,-Math.PI/7);
      box(-11,3,0,2,6,2); // Outside some camera views, still casts into the scene.
      const geometry=mergeGeometries(pieces),material=new THREE.MeshLambertMaterial({color:'#9db99b'}),mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);staticLists.push(spatialDrawList(mesh,2.5));
      let shadowTriangles=0;const beforeShadow=mesh.onBeforeShadow;mesh.onBeforeShadow=function(...args){beforeShadow.apply(this,args);shadowTriangles+=geometry.drawRange.count/3;};
      const sheet=new THREE.Mesh(new THREE.PlaneGeometry(2,1.5),new THREE.MeshLambertMaterial({color:'#e5bc84',side:THREE.DoubleSide}));sheet.geometry.rotateY(.6);sheet.geometry.translate(2,2,3);root.add(sheet);staticLists.push(spatialDrawList(sheet));
      const view=createIslandView(root,{staticLists}),camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100),frustum=new THREE.Frustum(),vp=new THREE.Matrix4(),a=new Uint8Array(400*300*4),b=new Uint8Array(a.length),results=[];
      root.updateMatrixWorld(true);
      for(const shadows of [false,true])for(const angle of [.15,Math.PI/2+.15,Math.PI+.15,Math.PI*1.5+.15]){
        camera.position.set(root.position.x+Math.cos(angle)*18,22,root.position.z+Math.sin(angle)*18);camera.lookAt(root.position.x,0,root.position.z);camera.updateMatrixWorld();frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));renderer.shadowMap.enabled=shadows;
        for(const list of staticLists)list.update(()=>true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,400,300,a);const complete=renderer.info.render.triangles;
        view.updateStatic(frustum);shadowTriangles=0;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,400,300,b);const selected=renderer.info.render.triangles;
        let different=0,lit=0;for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)different++;if(Math.abs(a[i]-a[0])+Math.abs(a[i+1]-a[1])+Math.abs(a[i+2]-a[2])>12)lit++;}
        results.push({shadows,angle,complete,selected,shadowTriangles,selectedColorTriangles:view.selectedTriangles,totalColorTriangles:view.totalTriangles,differentPixels:different,scenePixels:lit});
      }
      pieces.forEach(g=>g.dispose());cube.dispose();geometry.dispose();material.dispose();sheet.geometry.dispose();sheet.material.dispose();sun.shadow.dispose();target.dispose();renderer.dispose();return results;
    });
    for(const r of results){assert.ok(r.scenePixels>2000);assert.ok(r.differentPixels<=4,JSON.stringify(r));assert.ok(r.selected<r.complete,JSON.stringify(r));assert.ok(r.selectedColorTriangles<r.totalColorTriangles*.65,JSON.stringify(r));assert.equal(r.shadowTriangles,r.shadows?72:0,'shadow pass retains all caster faces');}
    assert.deepEqual(errors,[]);await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/static-faces.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
