const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__pose.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0">'}));await page.goto('http://127.0.0.1:5174/__pose.html');
    const report=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{createPerson}=await import('/src/scene-assets.js'),{createWildlife}=await import('/src/wildlife.js'),{batchResidents,batchProps}=await import('/src/render-batches.js'),{installVoxelLighting}=await import('/src/voxel-lighting.js');
      const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(640,460);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
      const camera=new THREE.OrthographicCamera(-6.4,6.4,4.6,-4.6,.1,100);camera.position.set(12,18,23);camera.lookAt(0,.5,0);camera.layers.enable(1);const cube=new THREE.BoxGeometry();
      function create(batched){
        const scene=new THREE.Scene();scene.background=new THREE.Color('#dfeee9');const sun=new THREE.DirectionalLight('#fff5db',2.8);sun.layers.enable(1);sun.position.set(-4,12,5);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:40});scene.add(sun,sun.target);const ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.8);ambient.layers.enable(1);scene.add(ambient);
        const root=new THREE.Group();scene.add(root);const floor=new THREE.Mesh(new THREE.BoxGeometry(12,.3,9),new THREE.MeshLambertMaterial({color:'#b5d3a2'}));floor.position.y=-.3;floor.receiveShadow=true;scene.add(floor);
        const people=[0,1].map(i=>createPerson(cube,c=>new THREE.MeshLambertMaterial({color:c}),i?'#af97b7':'#75a591',undefined,true,batched?undefined:m=>m.geometry.clone()));root.add(...people);
        const rabbit=createWildlife('兔子',cube,batched?undefined:m=>m.geometry.clone()),bird=createWildlife('小鸟',cube,batched?undefined:m=>m.geometry.clone()),prop=new THREE.Group(),box=new THREE.Mesh(cube,new THREE.MeshLambertMaterial({color:'#d69745'}));prop.add(box);box.rotation.set(.3,.2,.1);box.scale.set(.6,1,.5);box.position.y=.5;root.add(rabbit,bird,prop);
        const sources=[rabbit,bird,prop];let residents,props;
        if(batched){residents=batchResidents(people.map(object=>({object})),root);props=batchProps(sources,root);}
        installVoxelLighting(scene);
        function pose(index){people[0].position.set(-2,.1,.4);people[0].rotation.y=.4+index*.3;people[0].userData.armR.rotation.z=index>0?2.3:0;people[0].userData.left.rotation.x=.5;people[1].position.set(.2,.5,-1);people[1].userData.armL.rotation.x=-1.5;people[1].userData.right.rotation.x=-.4;rabbit.position.set(-.8,0,2);rabbit.rotation.y=index*.5;bird.position.set(2,1,1);prop.position.set(2.3,0,-1.5);prop.scale.set(1,1.4,.7);prop.rotation.y=.7;prop.visible=index!==2;box.material.color.set(index===3?'#8ad4cb':'#d69745');residents?.update();props?.update();scene.updateMatrixWorld(true);}
        return {scene,pose,residents,props,sun};
      }
      const reference=create(false),batch=create(true),results=[];let image;
      function pixels(world){renderer.shadowMap.needsUpdate=true;renderer.render(world.scene,camera);const data=new Uint8Array(640*460*4);renderer.getContext().readPixels(0,0,640,460,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,data);return data;}
      for(const shadows of [false,true]){renderer.shadowMap.enabled=shadows;for(let pose=0;pose<4;pose++){
        reference.pose(pose);batch.pose(pose);const a=pixels(reference),b=pixels(batch);let different=0,sum=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=d;if(d>45)different++;}results.push({shadows,pose,differentFraction:different/(a.length/4),meanDifference:sum/(a.length*.75)});
      }}image=renderer.domElement.toDataURL();
      for(const w of [reference,batch]){w.residents?.dispose();w.props?.dispose();w.sun.shadow.dispose();w.scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}renderer.dispose();return{results,image};
    });
    await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/gpu-poses.png',Buffer.from(report.image.split(',')[1],'base64'));delete report.image;
    for(const result of report.results)assert.ok(result.differentFraction<.005&&result.meanDifference<.5,JSON.stringify(result));assert.deepEqual(errors,[]);await fs.writeFile('test-results/gpu-poses.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
