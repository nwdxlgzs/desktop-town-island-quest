const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

// Four tiny fixed palette samples, a few still frames; no generated maps or FPS load.
(async()=>{
  let server;const browser=await chromium.launch({headless:true});
  try{
    if(!process.env.QUEST_URL){const {createServer}=await import('vite');server=await createServer({configFile:false,cacheDir:'.tmp-terrain-vite',optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();}
    const page=await browser.newPage({viewport:{width:900,height:650}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2500));});
    await page.route('**/__terrain-detail.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
    await page.goto((process.env.QUEST_URL||server.resolvedUrls.local[0])+'__terrain-detail.html');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js'),{buildTerrainMesh}=await import('/src/terrain-mesh.js'),{setTerrainLines}=await import('/src/terrain-style.js'),{installVoxelLighting}=await import('/src/voxel-lighting.js'),{bakeIslandShadows}=await import('/src/baked-shadows.js'),{createAntialias}=await import('/src/antialias.js'),{createStaticFrameCache}=await import('/src/static-frame-cache.js');
      const config=await (await fetch('/src/levels.json')).json(),renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(900,650);renderer.setPixelRatio(1.5);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.info.autoReset=false;document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#dfeee9');const camera=new THREE.OrthographicCamera(-23,23,16.6,-16.6,.1,200);camera.position.set(22,32,38);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.layers.enable(1);
      const ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.8),sun=new THREE.DirectionalLight('#fff5db',2.8);sun.position.set(-12,28,16);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:1,far:100});scene.add(ambient,sun,sun.target);
      const samples=[];
      for(const [i,id]of ['meadow','snow','desert','cyber'].entries()){
        const palette=config.biomes.find(b=>b.id===id).palette,layout={width:13,depth:13,shoreline:{radii:Array(32).fill(1)},terraces:[{x:-1.3,z:-1.3,r:2,height:2.5,ramp:1.3}],lakes:[{x:2.6,z:2.6,w:3,d:3}],level:{environment:{sun:[-12,28,16]}}},mesh=buildTerrainMesh(layout,palette),root=new THREE.Group();root.add(mesh);scene.add(root);
        const baked=bakeIslandShadows(root,layout,[]);root.position.set((i%2)*16-8,0,Math.floor(i/2)*16-8);samples.push({id,root,mesh,baked});
      }
      installVoxelLighting(scene);const aa=createAntialias(renderer,scene,camera);aa.prepare(scene);aa.configure(true,900,650,1.5);const cache=createStaticFrameCache(renderer,scene,camera,aa.renderWorld,()=>{});
      function frame(cached=false){scene.updateMatrixWorld(true);renderer.info.reset();aa.render(output=>cache.render(output,cached));return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,vertices:samples.reduce((n,s)=>n+s.mesh.geometry.attributes.position.count,0)};}
      async function pixels(url){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      for(const s of samples)setTerrainLines(s.mesh,'off',sun.position);
      const plain=frame(),before=renderer.domElement.toDataURL(),a=await pixels(before);
      for(const s of samples)setTerrainLines(s.mesh,'beveled');
      const detailed=frame(),after=renderer.domElement.toDataURL(),b=await pixels(after);let changed=0;
      for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
      // Deep inside each lake, brick detail must not turn water into tiled land.
      const water=samples.map(s=>{const p=new THREE.Vector3(2.6,-.075,2.6).add(s.root.position).project(camera),x=Math.round((p.x*.5+.5)*renderer.domElement.width),y=Math.round((.5-p.y*.5)*renderer.domElement.height),i=(y*renderer.domElement.width+x)*4;return {id:s.id,difference:Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])};});
      // Compare a real seam with the same pixel in the line-free frame. The
      // pigment contribution must stay green/brown/blue across local palettes.
      const seamColors=samples.map(s=>{const p=new THREE.Vector3(-1.3,2.575,-.65).add(s.root.position).project(camera),cx=Math.round((p.x*.5+.5)*renderer.domElement.width),cy=Math.round((.5-p.y*.5)*renderer.domElement.height);let score=0,base,ink;
        for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++){const i=(y*renderer.domElement.width+x)*4,d=a[i]+a[i+1]+a[i+2]-b[i]-b[i+1]-b[i+2];if(d>score){score=d;base=Array.from(a.slice(i,i+3));ink=Array.from(b.slice(i,i+3));}}
        return{id:s.id,base,ink,darkening:score};});
      cache.invalidate();frame(true);const start={...cache.stats};frame(true);const reused={hits:cache.stats.hits-start.hits,captures:cache.stats.captures-start.captures};
      for(const s of samples)s.baked.setEnabled(true);cache.invalidate();frame(true);const baked=renderer.domElement.toDataURL();
      // Compile the real-shadow variant too; cheap vertex-lit and sun-map paths
      // must both retain detail after their shader hooks are composed.
      for(const s of samples){s.baked.setEnabled(false);s.mesh.material.needsUpdate=true;}
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;frame();const shadow=renderer.domElement.toDataURL(),shadowPixels=await pixels(shadow);
      for(const s of samples)setTerrainLines(s.mesh,'off');
      frame();const noShadowDetail=await pixels(renderer.domElement.toDataURL());let shadowChanged=0;for(let i=0;i<shadowPixels.length;i+=4)if(Math.abs(shadowPixels[i]-noShadowDetail[i])+Math.abs(shadowPixels[i+1]-noShadowDetail[i+1])+Math.abs(shadowPixels[i+2]-noShadowDetail[i+2])>12)shadowChanged++;
      cache.dispose();aa.dispose();sun.shadow.dispose();samples.forEach(s=>{s.mesh.geometry.dispose();s.mesh.material.dispose();});renderer.dispose();return {plain,detailed,changed,shadowChanged,water,seamColors,reused,images:{before,after,baked,shadow}};
    });
    assert.deepEqual(result.plain,result.detailed,'brick detail adds no objects, triangles, vertices or draws');assert.ok(result.changed>1500);assert.ok(result.shadowChanged>1500);assert.ok(result.water.every(w=>w.difference<=3),JSON.stringify(result.water));assert.deepEqual(result.reused,{hits:1,captures:0});assert.deepEqual(errors,[]);
    await fs.mkdir('test-results',{recursive:true});for(const [name,data]of Object.entries(result.images))await fs.writeFile('test-results/terrain-'+name+'.png',Buffer.from(data.split(',')[1],'base64'));delete result.images;await fs.writeFile('test-results/terrain-detail.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,errors},null,2));
    // The off image now removes bevel lighting as well as seams. The delta
    // includes that real slope shading; pigments must still avoid black grout.
    const color=id=>result.seamColors.find(c=>c.id===id).ink;for(const c of result.seamColors)assert.ok(c.darkening>3&&c.darkening<120&&Math.min(...c.ink)>90,'relief retains its local palette: '+JSON.stringify(c));assert.ok(color('meadow')[1]>color('meadow')[0]&&color('meadow')[1]>color('meadow')[2]);assert.ok(color('desert')[0]>color('desert')[2]+15);assert.ok(color('cyber')[2]>color('cyber')[0]+10);
  }finally{await browser.close();await server?.close();}
})().catch(e=>{console.error(e);process.exit(1);});
