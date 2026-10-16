const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// One still for every workshop exterior. Fixed coordinates cover all biomes,
// exteriors, all six furniture sets, flora, cliffs, houses, camps and residents.
// No random layouts, running worlds, autonomous movement or FPS benchmarks.
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1080}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__scenery-models.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><body style="margin:0;background:#e6eef0;font:16px sans-serif"></body></html>'}));
    await page.goto((process.env.QUEST_URL||'http://127.0.0.1:5174/')+'__scenery-models.html');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{buildIsland}=await import('/src/scene-assets.js'),{stations}=await import('/src/curriculum.js'),{workshopDesigns}=await import('/src/workshop-designs.js'),config=await(await fetch('/src/levels.json')).json(),cube=new THREE.BoxGeometry(),materials=new Map();
      const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));return materials.get(color);};
      const designs=Object.keys(workshopDesigns),count=Math.max(config.biomes.length,designs.length),height=Math.ceil(count/4)*360;
      const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,height);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eef0');scene.add(new THREE.HemisphereLight('#fff8eb','#8ea694',1.8));const sun=new THREE.DirectionalLight('#fff4dc',2.8);sun.position.set(-12,28,16);scene.add(sun);
      const camera=new THREE.OrthographicCamera(-9,9,7.594,-7.594,.1,100);camera.position.set(12,16,21);camera.lookAt(0,.5,0);camera.updateMatrixWorld();camera.layers.enable(1);
      const summary=[];
      renderer.clear();renderer.setScissorTest(true);
      for(let i=0;i<count;i++){
        const biome=config.biomes[i%config.biomes.length];
        const theme=stations[i%stations.length],design=designs[i%designs.length],workshop={...theme,theme:theme.id,id:'sample',name:theme.name,design,position:[-2,1],tasks:[],approach:[-2,4.3]};
        const layout={seed:8,width:18,depth:18,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},shoreX:8,dock:{x:8,z:5},boat:{x:10,z:5},spawn:{x:0,z:5},level:{id:'model-'+biome.id,biome,map:{npcLimit:8}},workshops:[workshop],npcSpawns:{sample:{x:-.3,z:0},'village-0':{x:4,z:3},'camp-0':{x:4,z:3}},roads:[],ladders:[],terraces:[],obstacles:[],trees:[{x:4,z:-.4,scale:1}],mountains:[{x:1,z:-5,w:3,d:2.5,height:3,baseHeight:0}],villages:i===0?[{x:4,z:4,w:4,d:3,houses:[{x:4.5,z:2,w:2.5,d:2.1,color:'#d2b594',baseHeight:0}]}]:[],camps:i===1?[{x:4,z:3,tentHeight:0,fireHeight:0,benchHeight:0}]:[],reefs:[{x:8,z:-4,r:.6,height:1}],exploration:[{id:'shard',type:'shard',x:-5,z:5},{id:'beacon',type:'beacon',x:0,z:5}]};
        const island=buildIsland(layout,cube,material);scene.add(island.root);scene.updateMatrixWorld(true);
        let meshes=0;island.root.traverse(m=>{if(!m.isMesh)return;meshes++;for(const a of Object.values(m.geometry.attributes))if(!a.array.every(Number.isFinite))throw Error(`${biome.id}: invalid model attribute`);});
        renderer.setViewport(i%4*320,height-(Math.floor(i/4)+1)*360,320,360);renderer.setScissor(i%4*320,height-(Math.floor(i/4)+1)*360,320,360);renderer.render(scene,camera);summary.push({biome:biome.id,flora:biome.flora,design,furniture:theme.id,meshes,triangles:renderer.info.render.triangles});
        const label=document.createElement('div');label.textContent=`${biome.name||biome.id} · ${design}`;label.style.cssText=`position:absolute;left:${i%4*320}px;top:${Math.floor(i/4)*360+330}px;width:320px;text-align:center;color:#284955;font-weight:600`;document.body.append(label);
        scene.remove(island.root);island.propsBatch.dispose();const geometries=new Set(),owned=new Set(),textures=new Set(),shared=new Set(materials.values());island.root.traverse(m=>{if(!m.isMesh)return;if(m.geometry!==cube)geometries.add(m.geometry);for(const a of [m.material].flat())if(!shared.has(a)){owned.add(a);if(a.map)textures.add(a.map);}});geometries.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      }
      cube.dispose();materials.forEach(m=>m.dispose());renderer.dispose();return summary;
    });
    const {workshopDesigns}=await import('../src/workshop-designs.js');
    assert.equal(new Set(result.map(m=>m.biome)).size,12);assert.equal(new Set(result.map(m=>m.design)).size,Object.keys(workshopDesigns).length);assert.equal(new Set(result.map(m=>m.furniture)).size,6);assert.deepEqual(errors,[]);
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/scenery-models.png',fullPage:true});await fs.writeFile('test-results/scenery-models.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
