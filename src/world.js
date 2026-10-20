import * as THREE from 'three';
import { createNavigator, clearSegment,terrainNavigationGrid } from './navigation.js';
import { createOcean } from './ocean.js';
import { blockedAt, onLand } from './level-layout.js';
import { buildIsland, createPerson } from './scene-assets.js';
import { workshopAt } from './interactions.js';
import { createVoyage, sampleVoyage, boatHeight, hullRadius,voyageReefs } from './voyage.js';
import { elevationAt, walkingHeightAt,ladderAt,canWalkSegment,playerRadius } from './terrain.js';
import { createMotion,startJump,tickMotion,visualJump,walkSpeed,runSpeed } from './motion.js';
import { createPlayerTraversal } from './player-traversal.js';
import { ladderFrame,createLadderClimb,tickLadderClimb } from './ladder-motion.js';
import { createQualityController } from './quality.js';
import { createEnvironment } from './environment.js';
import { createAvatarOutline } from './avatar-outline.js';
import { createAntialias } from './antialias.js';
import { mergeRigidGroup,paintRigidPart } from './render-batches.js';
import { installVoxelLighting } from './voxel-lighting.js';
import { createContactShadows } from './baked-shadows.js';
import { createFrameMeter } from './frame-meter.js';
import { createStaticFrameCache } from './static-frame-cache.js';
import { createShadowRefresh,configureShadowCasters } from './shadow-refresh.js';
import { createRenderSize } from './render-size.js';
import { createShadowMotion } from './shadow-motion.js';
import { setTerrainLines } from './terrain-style.js';
import { createShadowDamage } from './shadow-damage.js';
import { createAmbientWalk } from './ambient-walk.js';
import { batchPlayer } from './player-batch.js';
import { createViewOrbit } from './view-orbit.js';
import { workshopArchitecture } from './workshop-designs.js';
import { createLiveTransforms } from './live-transforms.js';
import { createFrameProfiler } from './frame-profiler.js';
import { createGpuTiming } from './gpu-timing.js';
import { warmHiddenShaders } from './shader-warmup.js';

export function createWorld(container,{layout,onInteract,onBoard,onReady,onError,isPaused,onTravelState,onNotice=()=>{},onExplore=()=>{},passage=()=>true,qualitySettings={},onQuality=()=>{}}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dfeee9');scene.updateMatrix();scene.matrixAutoUpdate=false;scene.matrixWorldAutoUpdate=false;
  scene.fog=new THREE.Fog('#dfeee9',130,280);
  const camera=new THREE.OrthographicCamera(-18,18,14,-14,.1,400);
  camera.layers.enable(1);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:false,stencil:false,powerPreference:'high-performance'});}catch(error){onError(error);return null;}
  renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  const antialias=createAntialias(renderer,scene,camera);
  const renderSize=createRenderSize(renderer,antialias),shadowMotion=createShadowMotion(),shadowDamage=createShadowDamage(),cachedShadowSun=new THREE.Vector3(Infinity,0,0);
  let shadowIsland=null,shadowSources=[],shadowBakes=0;
  function updateShadowSources(){if(shadowIsland!==active){shadowIsland=active;shadowSources=[player,boat,...active.npcs.map(n=>n.object),...(active.propsBatch.sources||[])];shadowMotion.reset();shadowDamage.reset();}}
  renderer.info.autoReset=false;
  const profiler=import.meta.env.DEV?createFrameProfiler(renderer):null;
  const gpuTiming=createGpuTiming(renderer);
  let diagnosticSelections=0;
  const renderCapturedWorld=import.meta.env.DEV?(view,output,background=true)=>profiler.measure(background?'staticSceneSubmit':'actorSceneSubmit',()=>antialias.renderWorld(view,output,background)):antialias.renderWorld;
  const cacheFrustum=new THREE.Frustum(),cacheMatrix=new THREE.Matrix4(),cacheClip=new THREE.Matrix4(),cacheRegions=[];
  const staticFrame=createStaticFrameCache(renderer,scene,camera,renderCapturedWorld,(view,rects,width,height)=>{
    cacheFrustum.setFromProjectionMatrix(cacheMatrix.multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse));
    if(rects){
      for(let i=0;i<rects.length;i++){
        const r=rects[i],w=r.right-r.x,h=r.top-r.y;cacheClip.makeScale(width/w,height/h,1);cacheClip.elements[12]=(width-2*r.x-w)/w;cacheClip.elements[13]=(height-2*r.y-h)/h;
        cacheMatrix.multiplyMatrices(cacheClip,view.projectionMatrix).multiply(view.matrixWorldInverse);(cacheRegions[i]??=new THREE.Frustum()).setFromProjectionMatrix(cacheMatrix);
      }
      cacheRegions.length=rects.length;
    }
    if(import.meta.env.DEV){diagnosticSelections++;profiler.measure('staticIndexSelection',()=>active.view.updateStatic(cacheFrustum,rects?cacheRegions:null));}
    else active.view.updateStatic(cacheFrustum,rects?cacheRegions:null);
  });
  let cachedPropsIsland=null,cachedPropsRevision=-1;
  function renderScene(useCache=true){
    if(cachedPropsIsland!==active||cachedPropsRevision!==active.propsBatch.staticRevision){staticFrame.invalidate();cachedPropsIsland=active;cachedPropsRevision=active.propsBatch.staticRevision;}
    renderer.info.reset();const cached=useCache&&!travel&&!orbit.active&&!environment.transitioning,refresh=qualityProfile.shadows&&renderer.shadowMap.needsUpdate;
    if(refresh){
      if(cached){if(import.meta.env.DEV)profiler.measure('sunShadowSubmit',()=>shadowRefresh.refresh());else shadowRefresh.refresh();}
      const shadowCamera=sun.shadow.camera,padding=Math.max(.15,2*Math.max(shadowCamera.right-shadowCamera.left,shadowCamera.top-shadowCamera.bottom)/sun.shadow.mapSize.x);
      const regions=cached&&!qualityProfile.fixedShadows&&cachedShadowSun.distanceToSquared(sun.position)<1e-8?shadowDamage.regions(shadowSources,sun.position,padding):null;
      if(regions)staticFrame.invalidateRegions(regions);else staticFrame.invalidate();
    }
    if(!cached){active.view.updateStatic(viewFrustum);incoming?.view.updateStatic(viewFrustum);}
    antialias.render(output=>staticFrame.render(output,cached));
    if(refresh){shadowBakes++;if(!qualityProfile.fixedShadows){updateShadowSources();shadowMotion.commit(shadowSources);shadowDamage.commit(shadowSources);}cachedShadowSun.copy(sun.position);}
  }
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','岛屿冒险地图。点击工作区进入练习，完成后点击小船启航。按住右键水平拖动环视，松手平滑回到主视角。');container.prepend(renderer.domElement);
  const ambient=new THREE.HemisphereLight('#fff9e9','#86a496',1.8);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff5db',2.8);sun.position.set(-12,25,16);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-30,right:30,top:28,bottom:-28,near:1,far:100});sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);scene.add(sun.target);
  const fill=new THREE.DirectionalLight('#d6ebff',.65);fill.position.set(15,10,-10);scene.add(fill);for(const light of [ambient,sun,fill])light.layers.enable(1);
  const shadowRefresh=createShadowRefresh(renderer,scene,camera);
  const materials=new Map(),cube=new THREE.BoxGeometry(1,1,1),controller=new AbortController();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));return materials.get(color);}
  const ocean=createOcean();ocean.waves.layers.set(1);scene.add(ocean.mesh,ocean.waves);
  const contacts=createContactShadows(scene),frameMeter=createFrameMeter(container);
  const environment=createEnvironment({scene,sun,ambient,fill,renderer,ocean,cube});environment.set(layout.level.environment,true);
  const player=createPerson(cube,material,'#5a95bd','#7aa9c3');scene.add(player);
  player.traverse(o=>{if(o.isMesh)o.userData.dynamicShadow=true;});
  const motion=createMotion();
  const ring=new THREE.Mesh(new THREE.RingGeometry(.48,.59,32),new THREE.MeshBasicMaterial({color:'#fff7d8',transparent:true,opacity:.9,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  const destination=new THREE.Mesh(new THREE.RingGeometry(.2,.31,24),new THREE.MeshBasicMaterial({color:'#367f6f',transparent:true,opacity:.8,side:THREE.DoubleSide}));destination.rotation.x=-Math.PI/2;destination.visible=false;scene.add(destination);
  const boat=new THREE.Group();scene.add(boat);
  function boatBox(x,y,z,w,h,d,color){const mesh=new THREE.Mesh(cube,material(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;boat.add(mesh);return mesh;}
  boatBox(0,0,0,1.2,.35,2.8,'#bca580');boatBox(0,.2,0,1,.12,2.55,'#ebd2a3');boatBox(-.5,.37,0,.14,.35,2.7,'#a98963');boatBox(.5,.37,0,.14,.35,2.7,'#a98963');boatBox(0,1.05,-.5,.09,2,.09,'#a18967');const sail=boatBox(.4,1.55,-.5,.85,1.1,.05,'#fff7df');boatBox(0,.5,-.95,.95,.12,.35,'#977c5d');
  const boatHit=new THREE.Mesh(new THREE.BoxGeometry(2.3,3,3.8),new THREE.MeshBasicMaterial({visible:false}));boatHit.position.y=1;boatHit.userData.boat=true;boat.add(boatHit);
  const boatSurface=mergeRigidGroup(boat,[],[sail]);
  const gangway=new THREE.Mesh(cube,material('#e4c698'));gangway.visible=false;scene.add(gangway);
  for(const object of [player,boat,gangway,ring,destination])object.traverse(o=>{o.layers.set(1);if(object===boat&&o.isMesh)o.userData.dynamicShadow=true;});
  const playerBatch=batchPlayer(player),outline=createAvatarOutline(player,playerBatch.installPose);
  const liveTransforms=createLiveTransforms(),liveRoots=[player,boat,gangway,ring,destination];
  let active=buildIsland(layout,cube,material),incoming=null,travel=null,route=[],target=null,zoom=1,overview=false,manualPan=false,panX=0,panZ=0,drag=null,last=performance.now(),elapsed=0,lastOcclusion=0,frame=0,disposed=false;
  const orbit=createViewOrbit();
  const groundHeight=(island,x,z)=>walkingHeightAt(island.layout,x,z);
  scene.add(active.root);player.position.set(layout.spawn.x,.25,layout.spawn.z);boat.position.set(layout.boat.x,boatHeight,layout.boat.z);boat.rotation.y=-Math.PI/2;
  player.position.y=.25+groundHeight(active,layout.spawn.x,layout.spawn.z);
  const keys=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),cameraTarget=new THREE.Vector3(),projected=new THREE.Vector3();
  // Hit volumes use their source object's layer (the boat is dynamic). The
  // explicit target list, rather than render layers, limits interaction rays.
  raycaster.layers.enableAll();
  const viewFrustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),previousView=new THREE.Matrix4(),viewSphere=new THREE.Sphere();let viewVersion=0,npcSimSteps=0,animalSimSteps=0,npcPlans=0;
  const inView=object=>object.userData.inView!==false;
  function updateView(dirty=null){
    if(dirty===null){
      viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      if(!viewProjection.equals(previousView)){previousView.copy(viewProjection);viewFrustum.setFromProjectionMatrix(viewProjection);viewVersion++;}
      viewSphere.center.copy(boat.position);viewSphere.center.y+=.9;viewSphere.radius=2.5;boat.userData.inView=viewFrustum.intersectsSphere(viewSphere);boat.visible=!!travel||boat.userData.inView;
    }
    let changed=false;
    // Opaque indices matter only when actually capturing/drawing the island.
    // Do not alternate main-view and guard-view indices on cached frames.
    for(const island of [active,incoming])if(island){const visibleChanged=island.view.update(viewFrustum,viewVersion,false,dirty);if(island.view.entered.size){island.residentBatch.update(island.view.entered);island.propsBatch.update(island.view.entered);}changed=visibleChanged||changed;}
    return changed;
  }
  const boatMarker=container.querySelector('#boat-marker');
  let routeGoal=null,playerClimb=null,jumpOrigin=null,queuedBoarding=false,stalled=0,replans=0,lastShadow=0,lastShadowFrame=0,lastHUD=0,lastActors=0,nextRender=0;
  const gpuInfo=renderer.getContext().getExtension('WEBGL_debug_renderer_info'),gpuName=gpuInfo?renderer.getContext().getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):'';
  const quality=createQualityController(qualitySettings,applyQuality,{cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory,softwareGPU:/swiftshader|llvmpipe|software/i.test(gpuName)});let qualityProfile=quality.profile;
  let viewport={width:0,height:0},wakeUntil=0,viewDirty=true,residentDirty=true,idleTimer=0,lastHover=0,actorTicks=0,occlusionChecks=0,qualityIsland=null;
  function schedule(delay=0){if(disposed||frame||idleTimer)return;if(delay>1)idleTimer=setTimeout(()=>{idleTimer=0;frame=requestAnimationFrame(animate);},delay);else frame=requestAnimationFrame(animate);}
  function wake(){const now=performance.now(),inactive=now>wakeUntil;if(inactive&&idleTimer)last=now-1000/qualityProfile.fps;if(inactive||idleTimer)nextRender=0;wakeUntil=now+500;viewDirty=true;if(idleTimer){clearTimeout(idleTimer);idleTimer=0;}schedule();}
  function applyQuality(profile){
    const previous=qualityProfile,islandChanged=qualityIsland!==active;qualityProfile=profile;qualityIsland=active;
    const resized=resizeRenderer(),wasShadowEnabled=renderer.shadowMap.enabled,type=profile.softShadows?THREE.PCFSoftShadowMap:THREE.BasicShadowMap;
    const shadowsChanged=wasShadowEnabled!==profile.shadows||profile.shadows&&(renderer.shadowMap.type!==type||previous.shadowQuality!==profile.shadowQuality);
    const bakedChanged=previous.bakedShadows!==profile.bakedShadows;
    const terrainChanged=previous.terrainLines!==profile.terrainLines;
    if(islandChanged||terrainChanged)for(const island of [active,incoming])if(island)setTerrainLines(island.root.children.find(o=>o.userData.terrain),profile.terrainLines,sun.position);
    // FPS display/pacing changes must not invalidate a high-resolution island,
    // traverse every material or recreate a shadow map that has not changed.
    if(resized||islandChanged||shadowsChanged||bakedChanged||terrainChanged)staticFrame.invalidate();
    gpuTiming.configure(profile.adaptive||profile.showFps,resized||islandChanged||previous.stage!==profile.stage||shadowsChanged||previous.antialias!==profile.antialias);
    renderer.shadowMap.enabled=profile.shadows;
    if(shadowsChanged||islandChanged)renderer.shadowMap.needsUpdate=true;
    if(renderer.shadowMap.type!==type||wasShadowEnabled!==profile.shadows){renderer.shadowMap.type=type;scene.traverse(o=>{for(const m of [o.material].flat())if(m?.isMeshLambertMaterial)m.needsUpdate=true;});}
    if(sun.shadow.mapSize.x!==profile.shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(profile.shadowSize,profile.shadowSize);}
    if(!profile.shadows&&sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
    if(islandChanged||bakedChanged)for(const island of [active,incoming])if(island)island.bakedShadows.setEnabled(profile.bakedShadows);
    if(islandChanged||shadowsChanged)configureShadowCasters(scene,profile.fixedShadows);
    if(islandChanged){installVoxelLighting(scene);antialias.prepare(scene);staticFrame.prepare(scene);}
    if(islandChanged||shadowsChanged||previous.antialias!==profile.antialias)warmHiddenShaders(scene,antialias.compile).catch(error=>console.warn('Shader warmup deferred',error));
    if(islandChanged||previous.npcMovement!==profile.npcMovement||previous.ambientAnimation!==profile.ambientAnimation)residentDirty=true;
    updateCamera();frameMeter.setEnabled(profile.showFps);wake();onQuality({...profile,pixelRatio:renderer.getPixelRatio()});
  }
  function resizeRenderer(){return renderSize.configure(qualityProfile,viewport.width,viewport.height);}

  function fitCamera(){const aspect=viewport.width/viewport.height;if(!aspect)return;
    const halfFor=size=>Math.max(size.depth*.44+2,(size.width*.62+size.depth*.25+3)/aspect);
    const progress=travel?Math.min(1,travel.time/travel.duration):0,ease=progress*progress*(3-2*progress);
    const exploreHalf=size=>Math.min(halfFor(size),Math.max(11,11/aspect));
    let travelHalf;
    if(travel){const oceanHalf=Math.max(halfFor(active.layout),travel.next?halfFor(travel.next.layout):halfFor(active.layout))*1.28;const destinationHalf=travel.next?exploreHalf(travel.next.layout):exploreHalf(active.layout);if(progress<.24)travelHalf=THREE.MathUtils.lerp(travel.startHalf,oceanHalf,THREE.MathUtils.smoothstep(progress,0,.24));else if(progress<.7)travelHalf=oceanHalf;else travelHalf=THREE.MathUtils.lerp(oceanHalf,destinationHalf,THREE.MathUtils.smoothstep(progress,.7,1));}
    const half=(travel?travelHalf:overview?halfFor(active.layout):exploreHalf(active.layout))/zoom;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  }
  function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;if(width!==viewport.width||height!==viewport.height){viewport={width,height};resizeRenderer();}fitCamera();wake();}

  let shadowFitIsland=null,cameraUpdates=0;const cameraState={x:NaN,z:NaN,panX:NaN,panZ:NaN,top:NaN,right:NaN,yaw:NaN},shadowFitSun=new THREE.Vector3(Infinity,0,0),shadowCorner=new THREE.Vector3(),shadowBounds=new THREE.Box3();
  function updateCamera(){const distance=Math.max(1,camera.top/16),changed=cameraState.x!==cameraTarget.x||cameraState.z!==cameraTarget.z||cameraState.panX!==panX||cameraState.panZ!==panZ||cameraState.top!==camera.top||cameraState.right!==camera.right||cameraState.yaw!==orbit.yaw;
    if(changed){cameraState.x=cameraTarget.x;cameraState.z=cameraTarget.z;cameraState.panX=panX;cameraState.panZ=panZ;cameraState.top=camera.top;cameraState.right=camera.right;cameraState.yaw=orbit.yaw;cameraUpdates++;camera.far=1200;const c=Math.cos(orbit.yaw),s=Math.sin(orbit.yaw),dx=18*c+30*s,dz=30*c-18*s;camera.position.set(cameraTarget.x+dx*distance+panX,25*distance,cameraTarget.z+dz*distance+panZ);camera.lookAt(cameraTarget.x+panX,0,cameraTarget.z+panZ);ocean.setView(dx,dz);environment.setView(dx,25,dz);scene.fog.near=130*distance;scene.fog.far=280*distance;}
    // A camera-following sun invalidates every cached shadow when walking.
    // Anchor its map to the island, with enough coverage for all terrain tiers.
    const span=Math.max(active.layout.width,active.layout.depth)*.76+8,light=environment.sunPosition;
    const sx=light[0]*span/22,sy=light[1]*span/22,sz=light[2]*span/22;
    if(sun.position.x!==sx||sun.position.y!==sy||sun.position.z!==sz){sun.position.set(sx,sy,sz);sun.updateMatrixWorld();sun.target.updateMatrixWorld();}
    if(qualityProfile.shadows&&(!qualityProfile.fixedShadows||!environment.transitioning)&&(shadowFitIsland!==active||shadowFitSun.distanceToSquared(sun.position)>.01)){
      shadowFitIsland=active;shadowFitSun.copy(sun.position);const c=sun.shadow.camera;
      c.position.copy(sun.position);c.lookAt(sun.target.position);c.updateMatrixWorld(true);shadowBounds.makeEmpty();
      if(!active.shadowTop){const terrain=active.root.children.find(m=>m.userData.terrain);terrain.geometry.computeBoundingBox();active.shadowTop=Math.max(terrain.geometry.boundingBox.max.y,...active.occluders.map(o=>o.sphere.center.y+o.sphere.radius))+1;}
      for(const x of [-active.layout.width/2-1,active.layout.width/2+1])for(const y of [-1.2,active.shadowTop])for(const z of [-active.layout.depth/2-1,active.layout.depth/2+1])shadowBounds.expandByPoint(shadowCorner.set(x,y,z).applyMatrix4(c.matrixWorldInverse));
      Object.assign(c,{left:Math.floor(shadowBounds.min.x)-1,right:Math.ceil(shadowBounds.max.x)+1,bottom:Math.floor(shadowBounds.min.y)-1,top:Math.ceil(shadowBounds.max.y)+1,near:Math.max(.1,-shadowBounds.max.z-2),far:-shadowBounds.min.z+2});c.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
    }if(changed){camera.updateMatrixWorld();ocean.setCamera(camera);}return changed;}
  const observer=new ResizeObserver(resize);observer.observe(container);cameraTarget.set(layout.width>20?player.position.x:0,0,layout.width>20?player.position.z:0);resize();applyQuality(qualityProfile);updateCamera();
  function localPlayer(){return {x:player.position.x-active.root.position.x,z:player.position.z-active.root.position.z};}
  let footingIsland=null,footingX=NaN,footingZ=NaN,footingY=0;
  function playerGroundHeight(){
    const x=player.position.x-active.root.position.x,z=player.position.z-active.root.position.z;
    if(footingIsland!==active||footingX!==x||footingZ!==z){footingIsland=active;footingX=x;footingZ=z;footingY=groundHeight(active,x,z);}
    return footingY;
  }
  const interactionHint=document.querySelector('#interaction-hint');let hintText='';
  function nearbyWorkshop(){return workshopAt(active.layout,localPlayer(),active.npcs.map(n=>({workshop:n.workshop,x:n.object.position.x,z:n.object.position.z})));}
  function nearbyNPC(){const p=localPlayer();let nearest=null,distance=2.1;for(const n of active.npcs){const d=Math.hypot(n.object.position.x-p.x,n.object.position.z-p.z);if(!n.climb&&d<distance&&Math.abs(n.object.position.y-player.position.y)<1.3){nearest=n;distance=d;}}return nearest;}
  function nearbyLadder(){const p=localPlayer();return active.layout.ladders.find(l=>[l.top,l.bottom].some(q=>Math.hypot(q.x-p.x,q.z-p.z)<1.1&&Math.abs(q.y-groundHeight(active,p.x,p.z))<.7));}
  function useLadder(id){if(playerClimb||travel||isPaused())return false;const l=active.layout.ladders.find(l=>l.id===id);if(!l)return false;const p=localPlayer(),height=groundHeight(active,p.x,p.z),fromTop=Math.abs(height-l.top.y)<Math.abs(height-l.bottom.y),entry=fromTop?l.top:l.bottom;return pathTo(entry,{ladder:id,fromTop});}
  function nearbyDiscovery(){const p=localPlayer();return active.discoveries.filter(d=>d.object.visible&&Math.hypot(d.object.position.x-p.x,d.object.position.z-p.z)<1.6).sort((a,b)=>Math.hypot(a.object.position.x-p.x,a.object.position.z-p.z)-Math.hypot(b.object.position.x-p.x,b.object.position.z-p.z))[0];}
  function stopWalking(){queuedBoarding=false;keys.clear();route=[];target=null;routeGoal=null;stalled=0;destination.visible=false;motion.autoRun=false;}
  function enterWorkshop(id){stopWalking();onInteract(id);}
  function updateInteraction(){const s=!travel&&!isPaused()?nearbyWorkshop():null,d=!travel&&!isPaused()?nearbyDiscovery():null,n=nearbyNPC(),l=nearbyLadder(),p=localPlayer(),atDock=!travel&&Math.hypot(p.x-active.layout.dock.x,p.z-active.layout.dock.z)<1.5;
    const text=playerClimb?'正在沿崖壁垂直攀爬':atDock?'按 E 乘船 · 每工坊至少 1 题且全岛达到 60%':n?n.wave&&n.workshop?'再按 E 进入工坊 · 点击长台也可开始':'按 E 与居民招手':d?`按 E · ${d.type==='animal'?'观察':''}${d.name}`:l?'按 E 爬梯子 · 也可以朝梯口移动':s?`按 E / 点击长台 · ${s.name}`:'Shift 跑步 · 空格跳跃 · E 互动';
    if(interactionHint&&text!==hintText){interactionHint.textContent=text;interactionHint.classList.toggle('available',!!s||!!d||!!n||!!l||atDock);hintText=text;}}
  let plannerIsland=null,planner=null,playerTraversal=null;
  function ensurePlanner(){if(plannerIsland===active)return;const island=active;plannerIsland=island;planner=createNavigator((x,z)=>blockedAt(island.layout,x,z,playerRadius),island.layout.bounds,(a,b)=>canWalkSegment(island.layout,a,b),island.layout.ladders,terrainNavigationGrid(island.layout));playerTraversal=createPlayerTraversal(island.layout,(from,to)=>planner.findPath(from,to));}
  function canMove(from,to){ensurePlanner();return playerTraversal.canMove(from,to,motion.jump?jumpOrigin:null);}
  function pathTo(point,action,retry=false,notify=true){if(travel||playerClimb)return false;wake();keys.clear();manualPan=false;panX=panZ=0;const offset=active.root.position;ensurePlanner();route=planner.findPath(localPlayer(),point).map(p=>Object.assign(new THREE.Vector3(p.x+offset.x,.25,p.z+offset.z),{ladder:p.ladder,fromTop:p.fromTop,corridor:p}));
    destination.visible=false;if(!route.length){target=null;routeGoal=null;if(notify)onNotice('这里暂时走不到，试试沿小路绕行。');return false;}
    motion.autoRun=route.reduce((n,p,i)=>{const previous=route[i-1]||player.position;return n+Math.hypot(p.x-previous.x,p.z-previous.z);},0)>13;target=action;routeGoal={x:point.x,z:point.z};stalled=0;if(!retry)replans=0;const end=route.at(-1);destination.position.set(end.x,.29+groundHeight(active,end.x-offset.x,end.z-offset.z),end.z);destination.visible=true;return true;}
  function explore(id,quiet=false){if(playerClimb||travel)return false;const item=active.discoveries.find(d=>d.id===id&&d.object.visible);if(!item)return false;const point={x:item.object.position.x,z:item.object.position.z};
    if(Math.hypot(localPlayer().x-point.x,localPlayer().z-point.z)<1.6){stopWalking();onExplore(item);return true;}return pathTo(point,{discovery:id},false,!quiet);}
  function exploreNearest(type='shard',excluded=[]){
    if(playerClimb||travel||isPaused())return false;
    const p=localPlayer(),distance=d=>(d.object.position.x-p.x)**2+(d.object.position.z-p.z)**2;
    const nearby=active.discoveries.filter(d=>d.type===type&&d.object.visible&&!excluded.includes(d.id)).sort((a,b)=>distance(a)-distance(b));
    for(const item of nearby)if(explore(item.id,true))return true;
    if(nearby.length)onNotice('这里暂时走不到，试试沿小路绕行。');return false;
  }
  function goToStation(id){if(playerClimb)return;const s=active.layout.workshops.find(s=>s.id===id)||active.layout.workshops[0];if(nearbyWorkshop()?.id===s.id){enterWorkshop(s.id);return;}pathTo({x:s.approach[0],z:s.approach[1]},{workshop:s.id});}
  function goToBoat(){if(playerClimb){queuedBoarding=true;onNotice('到达梯口后，继续前往码头。');return true;}if(Math.hypot(localPlayer().x-active.layout.dock.x,localPlayer().z-active.layout.dock.z)<1.5){stopWalking();onBoard();return true;}return pathTo(active.layout.dock,'boat');}
  function interact(){if(travel||playerClimb||isPaused())return;const p=localPlayer();if(Math.hypot(p.x-active.layout.dock.x,p.z-active.layout.dock.z)<1.5){stopWalking();onBoard();return;}const n=nearbyNPC(),d=nearbyDiscovery(),s=nearbyWorkshop(),l=nearbyLadder();if(n){if(n.wave>0&&n.workshop){enterWorkshop(n.workshop);return;}stopWalking();motion.wave=1.8;n.wave=1.8;wake();onNotice(n.workshop?'居民向你招手！再按 E 可以开始工坊。':'居民开心地向你挥了挥手。');return;}if(d){stopWalking();onExplore(d);return;}if(l){useLadder(l.id);return;}if(s){enterWorkshop(s.id);}}
  function pointerRay(e){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function screenToWorld(e){pointerRay(e);return active.groundPicker.pick(raycaster.ray);}
  const pickTargets=[],pickHits=[];
  function hit(e,surface=null){
    pointerRay(e);pickTargets.length=0;pickHits.length=0;
    for(const o of active.hitTargets){let parent=o;while(parent&&parent!==active.root&&parent.userData.inView!==false)parent=parent.parent;if(parent===active.root)pickTargets.push(o);}
    if(boat.visible)pickTargets.push(boatHit);
    const first=raycaster.intersectObjects(pickTargets,false,pickHits)[0];return first&&(!surface||first.distance<=surface.distance+.02)?first.object:null;
  }
  function endOrbit(id=orbit.pointer,immediate=false){const pointerId=orbit.pointer;if(!orbit.end(id,immediate))return;renderer.domElement.style.cursor='default';if(pointerId!==null&&renderer.domElement.hasPointerCapture(pointerId))renderer.domElement.releasePointerCapture(pointerId);lastOcclusion=-Infinity;updateCamera();wake();}
  function onDown(e){if(e.button===2){e.preventDefault();e.stopPropagation();if(!isPaused()&&!travel&&orbit.start(e.pointerId,e.clientX)){drag=null;renderer.domElement.setPointerCapture(e.pointerId);renderer.domElement.style.cursor='grabbing';wake();}return;}if(orbit.active||isPaused()||travel||playerClimb)return;if(e.button===1){e.preventDefault();drag={x:e.clientX,y:e.clientY,panX,panZ};renderer.domElement.setPointerCapture(e.pointerId);return;}if(e.button!==0)return;const surface=screenToWorld(e),object=hit(e,surface);if(object===boatHit){goToBoat();return;}if(object?.userData.ladder){useLadder(object.userData.ladder);return;}if(object?.userData.discovery){explore(object.userData.discovery);return;}if(object?.userData.station){goToStation(object.userData.station);return;}if(!surface||!surface.walkable){stopWalking();onNotice(surface?'这里是崖壁，请点击平台上方的地面，或从梯子攀爬。':'请点击岛上的地面，水面和岛外不能行走。');return;}const point=surface.point;pathTo({x:point.x-active.root.position.x,z:point.z-active.root.position.z},null);}
  function onMove(e){if(orbit.dragging){e.preventDefault();e.stopPropagation();if(!(e.buttons&2)){endOrbit(e.pointerId);return;}if(orbit.move(e.pointerId,e.clientX,viewport.width)){updateCamera();wake();}return;}if(drag){manualPan=true;panX=THREE.MathUtils.clamp(drag.panX-(e.clientX-drag.x)*.035,-active.layout.width/2,active.layout.width/2);panZ=THREE.MathUtils.clamp(drag.panZ-(e.clientY-drag.y)*.045,-active.layout.depth/2,active.layout.depth/2);updateCamera();wake();return;}if(!orbit.active&&!travel&&performance.now()-lastHover>120){lastHover=performance.now();renderer.domElement.style.cursor=hit(e)?'pointer':'default';}}
  const on=(el,name,fn,options={})=>el.addEventListener(name,fn,{signal:controller.signal,...options});
  on(renderer.domElement,'pointerdown',onDown,{capture:true});on(renderer.domElement,'pointermove',onMove,{capture:true});
  on(window,'pointerup',e=>{if(e.button===2||!(e.buttons&2))endOrbit(e.pointerId);drag=null;},{capture:true});
  for(const event of ['pointercancel','lostpointercapture'])on(renderer.domElement,event,e=>{endOrbit(e.pointerId);drag=null;});
  for(const event of ['contextmenu','auxclick'])on(renderer.domElement,event,e=>{e.preventDefault();e.stopPropagation();},{capture:true});
  on(renderer.domElement,'wheel',e=>{if(isPaused()||travel)return;e.preventDefault();zoom=THREE.MathUtils.clamp(zoom-e.deltaY*.0007,.6,2);resize();},{passive:false});
  const directions=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
  function keyboardDirection(){return {x:(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)};}
  on(window,'keydown',e=>{
    if(isPaused()||travel||playerClimb||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
    // Browser shortcuts are never movement commands. Shift remains available for running.
    if(e.ctrlKey||e.metaKey||e.altKey){keys.clear();return;}
    wake();const key=e.key.toLowerCase();
    if(key==='shift'){keys.add(key);return;}
    if(directions.includes(key)){
      e.preventDefault();keys.add(key);manualPan=false;panX=panZ=0;route=[];target=null;routeGoal=null;motion.autoRun=false;destination.visible=false;
    }
    if(e.code==='Space'&&!e.repeat){if(document.activeElement?.closest('.world-tools,.explore-hud'))return;e.preventDefault();if(startJump(motion))jumpOrigin={...localPlayer()};}
    if(key==='e'&&!e.repeat){e.preventDefault();interact();}
  });
  on(window,'keyup',e=>{keys.delete(e.key.toLowerCase());wake();});on(window,'blur',()=>{keys.clear();drag=null;endOrbit(undefined,true);});on(document,'visibilitychange',()=>{keys.clear();endOrbit(undefined,true);quality.resetSampling();wake();});
  function animatePerson(person,walking,phase,dt,baseY=.25,idleBreathing=true){const amplitude=reducedMotion?0:walking ? .38 : 0;person.userData.left.rotation.x=Math.sin(phase)*amplitude;person.userData.right.rotation.x=-Math.sin(phase)*amplitude;person.userData.armL.rotation.x=-Math.sin(phase)*amplitude;person.userData.armR.rotation.x=Math.sin(phase)*amplitude;person.position.y=baseY+(reducedMotion?0:walking?Math.abs(Math.sin(phase))*.04:idleBreathing?Math.sin(phase*.15)*.012:0);}
  const changedResidents=new Set(),changedProps=new Set(),changedViewObjects=new Set(),noViewChanges=[];
  const ambientWalks=new WeakMap();
  function ambientWalk(island){let walk=ambientWalks.get(island);if(!walk){walk=createAmbientWalk((a,b,radius)=>clearSegment(a,b,(x,z)=>blockedAt(island.layout,x,z,radius),(a,b)=>canWalkSegment(island.layout,a,b)));ambientWalks.set(island,walk);}return walk;}
  function updateNPC(island,dt){
    actorTicks++;let moving=false,changed=residentDirty,routeBudget=1;const forceResidents=residentDirty;residentDirty=false;changedResidents.clear();changedProps.clear();changedViewObjects.clear();
    const walk=ambientWalk(island),safe=walk.prepare;
    for(const n of island.npcs){
      if(!inView(n.object))continue;
      const npc=n.object,p=npc.position,settings=island.layout.level.npc,autonomous=qualityProfile.npcMovement&&((p.x+island.root.position.x-cameraTarget.x)**2+(p.z+island.root.position.z-cameraTarget.z)**2<qualityProfile.actorRadius**2);
      if(!forceResidents&&!autonomous&&n.frozen&&!n.climb&&!n.wave)continue;
      npcSimSteps++;
      if(forceResidents)changedResidents.add(npc);
      // Frozen residents do no random sampling, collision checks or pose uploads.
      if(!autonomous&&!n.climb&&!n.wave){
        if(!n.frozen){animatePerson(npc,false,0,0,.25+groundHeight(island,p.x,p.z),false);npc.userData.armR.rotation.z=0;npc.userData.idleBreath=false;n.frozen=true;n.resting=true;changed=true;changedResidents.add(npc);}
        continue;
      }
      n.frozen=false;
      n.timer-=dt;n.wave=Math.max(0,(n.wave||0)-dt);const nearby=Math.hypot(player.position.x-p.x,player.position.z-p.z)<2.4;
      if(autonomous&&n.timer<=0&&!n.route.length&&!n.climb&&!n.wave&&routeBudget){
        routeBudget--;npcPlans++;
        const ladder=island.layout.ladders.find(l=>Math.min(Math.hypot(l.bottom.x-n.home.x,l.bottom.z-n.home.z),Math.hypot(l.top.x-n.home.x,l.top.z-n.home.z))<settings.radius);
        for(let tries=0;tries<2;tries++){
          const angle=n.random()*Math.PI*2,r=(.3+.6*n.random())*settings.radius;
          let goal={x:n.home.x+Math.cos(angle)*r,z:n.home.z+Math.sin(angle)*r};
          if(ladder&&n.random()<.35){
            const fromTop=Math.abs(groundHeight(island,p.x,p.z)-ladder.top.y)<.5,entry=fromTop?ladder.top:ladder.bottom,exit=fromTop?ladder.bottom:ladder.top;
            if(safe(p,entry)){n.route=[{...entry},{...exit,ladder:ladder.id,fromTop}];break;}
          }
          if(safe(p,goal)){n.route=[goal];break;}
        }
        n.timer=4+n.random()*5;
      }
      let walking=false,climbY=null;
      if(autonomous&&n.route[0]?.ladder&&!n.climb){const q=n.route[0],ladder=island.layout.ladders.find(l=>l.id===q.ladder);if(ladder)n.climb=createLadderClimb(ladder,q.fromTop);else n.route=[];}
      const climbing=!!n.climb;
      if(n.climb){
        const point=tickLadderClimb(n.climb,dt),{direction}=ladderFrame(n.climb.ladder);p.x=point.x;p.z=point.z;climbY=point.y;walking=true;npc.rotation.y=Math.atan2(direction.x,direction.z);
        if(point.done){n.climb=null;n.route.shift();}
      }else if(autonomous&&n.route.length&&!n.wave&&(!nearby||!n.workshop)){
        const q=n.route[0],dx=q.x-p.x,dz=q.z-p.z,length=Math.hypot(dx,dz),next=walk.advance(p,q,settings.speed*dt);
        if(next){p.x=next.x;p.z=next.z;npc.rotation.y=Math.atan2(dx,dz);walking=length>.01;if(next.done)n.route.shift();}else n.route=[];
      }
      moving ||=walking||n.wave>0;
      const resting=!walking&&!climbing&&!n.wave,breathing=resting&&autonomous&&qualityProfile.ambientAnimation&&!reducedMotion;
      if(!resting||!n.resting||forceResidents||npc.userData.idleBreath!==breathing){
        changed=true;changedResidents.add(npc);npc.userData.idleBreath=breathing;
        animatePerson(npc,walking&&!climbing,elapsed*8+n.phase,dt,.25+(climbY??groundHeight(island,p.x,p.z)),false);
        if(climbing){npc.userData.armL.rotation.x=-1.5+Math.sin(elapsed*8)*.35;npc.userData.armR.rotation.x=-1.5-Math.sin(elapsed*8)*.35;npc.userData.left.rotation.x=Math.sin(elapsed*8)*.25;npc.userData.right.rotation.x=-Math.sin(elapsed*8)*.25;}
        if(n.wave){npc.rotation.y=Math.atan2(player.position.x-p.x,player.position.z-p.z);npc.userData.armR.rotation.z=2.2+Math.sin(elapsed*12)*.3;}
        else{npc.userData.armR.rotation.z=0;if(!walking)npc.userData.armL.rotation.x=-.25;}
      }
      n.resting=resting;
    }
    if(!reducedMotion&&qualityProfile.ambientAnimation)for(const a of island.animated){
      if(!inView(a.object))continue;
      changedProps.add(a.object);
      if(a.type==='fire'){a.object.scale.y=.5+Math.sin(elapsed*6+a.seed)*.15;a.object.position.y=a.base+Math.sin(elapsed*7)*.05;}
      else if(a.type==='petal'){a.object.position.y=a.base-(elapsed*.45+a.seed)%2.5;a.object.position.x=a.x+Math.sin(elapsed+a.seed)*.5;a.object.rotation.y=elapsed*.6;}
      else a.object.position.y=a.base+((elapsed*.28+a.seed*.18)%.65);
    }
    for(const a of island.dynamicDiscoveries){
      if(!a.object.visible||!inView(a.object))continue;
      if(a.type==='shard'&&!reducedMotion&&qualityProfile.ambientAnimation){a.object.rotation.y=elapsed*.55;a.object.position.y=a.base+Math.sin(elapsed*2+a.x)*.1;changedProps.add(a.object);}
      if(a.type!=='animal'||!qualityProfile.npcMovement||(a.object.position.x-cameraTarget.x)**2+(a.object.position.z-cameraTarget.z)**2>qualityProfile.actorRadius**2)continue;
      animalSimSteps++;
      const p=a.object.position;a.timer=(a.timer??a.phase)-dt;
      if(a.timer<=0&&!a.goal){for(let i=0;i<2;i++){const angle=elapsed*.7+a.phase+i*2.2,r=.6+(a.phase%1)*1.4,goal={x:a.home.x+Math.cos(angle)*r,z:a.home.z+Math.sin(angle)*r};if(safe(p,goal,.32)){a.goal=goal;break;}}a.timer=3+(a.phase%2)*2;}
      let moved=false;
      if(a.goal){const dx=a.goal.x-p.x,dz=a.goal.z-p.z,next=walk.advance(p,a.goal,.65*dt,.32);
        if(next){p.x=next.x;p.z=next.z;a.object.rotation.y=Math.atan2(dx,dz);moving=true;moved=true;if(next.done)a.goal=null;}else a.goal=null;
      }
      if(!moved&&!a.object.userData.flying)continue;
      p.y=.08+groundHeight(island,p.x,p.z)+(a.object.userData.flying?.65+(reducedMotion?0:Math.sin(elapsed*4+a.phase)*.05):0);
      changedProps.add(a.object);
    }
    for(const object of changedResidents)changedViewObjects.add(object);for(const object of changedProps)changedViewObjects.add(object);
    if(changedResidents.size)island.residentBatch.update(changedResidents);const propsChanged=island.propsBatch.update(changedProps);return moving||changed||propsChanged;
  }
  const occlusionRay=new THREE.Raycaster(),occlusionHits=[];
  // Picking and occlusion have different layer requirements. Fading source
  // meshes live on the dynamic layer even while their opaque batch is cached;
  // detect their geometry regardless of render layer or batch visibility.
  // Only the explicit occluder groups below are tested, never the whole scene.
  occlusionRay.layers.enableAll();
  const fadingOccluders=new Map();let occlusionFadeSteps=0;
  const occlusionAim=new THREE.Vector3(),occlusionDirection=new THREE.Vector3(),occlusionCenter=new THREE.Vector3(),lastOcclusionCamera=new THREE.Vector3(Infinity,0,0),lastOcclusionPlayer=new THREE.Vector3(Infinity,0,0);let lastOcclusionIsland=null,lastOcclusionTravel=null,terrainOcclusionSamples=0;
  function updateOcclusion(dt){
    if(elapsed-lastOcclusion>qualityProfile.occlusionInterval&&(lastOcclusionIsland!==active||lastOcclusionTravel!==!!travel||lastOcclusionCamera.distanceToSquared(camera.position)>.0004||lastOcclusionPlayer.distanceToSquared(player.position)>.0025)){
      occlusionChecks++;lastOcclusionIsland=active;lastOcclusionTravel=!!travel;lastOcclusionCamera.copy(camera.position);lastOcclusionPlayer.copy(player.position);
      lastOcclusion=elapsed;occlusionAim.copy(player.position);occlusionAim.y+=1.05;occlusionDirection.copy(occlusionAim).sub(camera.position);const length=occlusionDirection.length();occlusionRay.set(camera.position,occlusionDirection.normalize());occlusionRay.far=length-.25;
      let hidden=false;
      for(const island of [active,incoming])if(island)for(const o of island.occluders){
        occlusionCenter.copy(o.sphere.center).add(island.root.position);
        occlusionHits.length=0;
        o.target=!travel&&occlusionRay.ray.distanceSqToPoint(occlusionCenter)<o.sphere.radius**2&&occlusionRay.intersectObjects(o.group.children,true,occlusionHits).length?.28:1;
        if(o.opacity!==o.target)fadingOccluders.set(o,island);
        if(o.target<1)hidden=true;
      }
      if(!hidden&&!travel){
        if(active.terrainTop===undefined){const g=active.root.children.find(o=>o.userData.terrain).geometry;if(!g.boundingBox)g.computeBoundingBox();active.terrainTop=g.boundingBox.max.y;}
        // A ray above the island's highest voxel cannot hit terrain. Keep
        // scenery rays intact, and only step through the possible height band.
        const highest=active.terrainTop+active.root.position.y+.08,dy=occlusionAim.y-camera.position.y;
        const steps=Math.ceil(length/.65);
        const first=camera.position.y>highest&&dy<0?Math.max(1,Math.ceil((highest-camera.position.y)/dy*steps)):1;
        for(let i=first;i<steps-1;i++){
          terrainOcclusionSamples++;
          const t=i/steps,x=camera.position.x+(occlusionAim.x-camera.position.x)*t-active.root.position.x,z=camera.position.z+(occlusionAim.z-camera.position.z)*t;
          if(!onLand(active.layout,x,z))continue;
          const y=camera.position.y+(occlusionAim.y-camera.position.y)*t;
          if(elevationAt(active.layout,x,z)+.08>y){hidden=true;break;}
        }
      }
      outline.set(hidden&&!travel);
    }
    let changing=false;for(const [o,island]of fadingOccluders){
      if(o.opacity===o.target){fadingOccluders.delete(o);continue;}
      occlusionFadeSteps++;
      changing=true;
      o.opacity=THREE.MathUtils.lerp(o.opacity,o.target,Math.min(1,dt*9));if(Math.abs(o.opacity-o.target)<.008)o.opacity=o.target;
      if(o.fading!==(o.opacity<1)){
        o.fading=o.opacity<1;island.view.invalidate();
        // Removing/restoring one opaque tree or building only damages its own
        // projected bounds. Keep the rest of the island color/depth intact.
        staticFrame.invalidateRegions([o.sphere.getBoundingBox(new THREE.Box3()).translate(island.root.position)]);
      }
      island.sceneryBatch.setFading(o,o.opacity<1);island.signBatch.setOpacity(o,o.opacity);for(const m of o.materials){m.opacity=o.opacity;m.depthWrite=o.opacity>.95;}
      if(o.opacity===o.target)fadingOccluders.delete(o);
    }
    return changing;
  }
  function disposeIsland(island){for(const [o,owner]of fadingOccluders)if(owner===island)fadingOccluders.delete(o);if(plannerIsland===island){plannerIsland=planner=playerTraversal=null;}if(shadowIsland===island){shadowIsland=null;shadowSources=[];shadowMotion.reset();shadowDamage.reset();}scene.remove(island.root);island.groundPicker.dispose();island.residentBatch.dispose?.();island.propsBatch.dispose?.();const geometries=new Set(),owned=new Set(),textures=new Set(),shared=new Set(materials.values());island.root.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.geometry!==cube)geometries.add(mesh.geometry);if(mesh.isInstancedMesh)mesh.dispose();for(const m of [mesh.material].flat()){if(!shared.has(m)){owned.add(m);if(m.map)textures.add(m.map);}}});geometries.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  function travelTo(nextLayout,done){if(!passage(4)||travel||playerClimb)return false;endOrbit(undefined,true);keys.clear();route=[];target=null;drag=null;destination.visible=false;panX=panZ=0;zoom=1;manualPan=false;overview=false;container.classList.remove('overview');
    motion.jump=motion.wave=0;jumpOrigin=null;playerClimb=null;outline.set(false);quality.resetSampling();
    const voyage=createVoyage(active.layout,nextLayout);
    staticFrame.release();incoming=nextLayout?buildIsland(nextLayout,cube,material):null;if(incoming){incoming.root.position.x=voyage.offset;incoming.root.updateMatrix();scene.add(incoming.root);incoming.root.updateMatrixWorld(true);incoming.bakedShadows.setEnabled(qualityProfile.bakedShadows);configureShadowCasters(incoming.root,qualityProfile.fixedShadows);setTerrainLines(incoming.root.children.find(o=>o.userData.terrain),qualityProfile.terrainLines,sun.position);antialias.prepare(incoming.root);staticFrame.prepare(incoming.root);}
    const reefs=voyageReefs(active.layout,nextLayout,voyage.offset);
    for(const [island,allowed]of [[active,reefs.source],[incoming,reefs.destination]])if(island){const visible=new Set(allowed);island.reefObjects.forEach((r,i)=>r.object.visible=visible.has(island.layout.reefs[i]));island.propsBatch.update();}
    const boarding=reducedMotion?.25:1.4,sailing=reducedMotion?1:Math.max(6,Math.min(11,voyage.length/15)),landing=reducedMotion?.25:1.4;
    travel={voyage,startBoatHeading:boat.rotation.y,startHalf:camera.top,startFocus:cameraTarget.clone(),playerStart:player.position.clone(),time:0,duration:boarding+sailing+landing,boarding,sailing,landing,phase:'boarding',next:incoming,done,environmentChanged:false};onTravelState(true);resize();return true;
  }
  function showGangway(dock,offset){const x=dock.x+offset,direction=new THREE.Vector3(boat.position.x-x,boatHeight+.28-.25,boat.position.z-dock.z);gangway.visible=true;gangway.position.set((x+boat.position.x)/2,(.25+boatHeight+.28)/2-.035,(dock.z+boat.position.z)/2);gangway.scale.set(direction.length(),.07,.7);gangway.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize());}
  function updateTravel(dt){const t=travel;t.time=Math.min(t.duration,t.time+dt);const progress=t.time/t.duration,ease=p=>p*p*(3-2*p);
    if(progress>.45&&!t.environmentChanged&&t.next){environment.set(t.next.layout.level.environment);t.environmentChanged=true;}
    const sailProgress=THREE.MathUtils.clamp((t.time-t.boarding)/t.sailing,0,1),sample=sampleVoyage(t.voyage,ease(sailProgress));
    boat.position.set(sample.x,boatHeight,sample.z);boat.rotation.z=0;gangway.visible=false;ring.visible=false;
    if(t.time<t.boarding){t.phase='boarding';const p=t.time/t.boarding,dock=new THREE.Vector3(active.layout.dock.x,.25,active.layout.dock.z),deck=new THREE.Vector3(boat.position.x,boatHeight+.28,boat.position.z);showGangway(active.layout.dock,0);const heading=sampleVoyage(t.voyage,0).heading,turn=Math.atan2(Math.sin(heading-t.startBoatHeading),Math.cos(heading-t.startBoatHeading));boat.rotation.y=t.startBoatHeading+turn*ease(p);
      if(p<.28)player.position.lerpVectors(t.playerStart,dock,ease(p/.28));else player.position.lerpVectors(dock,deck,ease((p-.28)/.72));player.rotation.y=Math.PI/2;animatePerson(player,true,elapsed*12,dt);player.position.y=THREE.MathUtils.lerp(.25,deck.y,Math.max(0,(p-.28)/.72));
    }else if(sailProgress<1){t.phase='sailing';const delta=Math.atan2(Math.sin(sample.heading-boat.rotation.y),Math.cos(sample.heading-boat.rotation.y));boat.rotation.y+=delta*Math.min(1,dt*10);animatePerson(player,false,0,dt);player.position.set(boat.position.x,boatHeight+.28,boat.position.z);player.rotation.y=boat.rotation.y;player.userData.armR.rotation.z=0;
    }else{t.phase='landing';const p=ease(Math.min(1,(t.time-t.boarding-t.sailing)/t.landing)),dock=t.next?.layout.dock||active.layout.dock,offset=t.next?t.voyage.offset:0;showGangway(dock,offset);animatePerson(player,true,elapsed*12,dt);player.position.set(THREE.MathUtils.lerp(boat.position.x,offset+dock.x,p),THREE.MathUtils.lerp(boatHeight+.28,.25,p),THREE.MathUtils.lerp(boat.position.z,dock.z,p));player.rotation.y=-Math.PI/2;}
    const oceanLook=new THREE.Vector3((t.voyage.start.x+t.voyage.end.x)/2,0,(t.voyage.start.z+t.voyage.end.z)/2);
    if(progress<.24)cameraTarget.lerpVectors(t.startFocus,oceanLook,THREE.MathUtils.smoothstep(progress,0,.24));else if(progress<.7)cameraTarget.lerp(oceanLook,Math.min(1,dt*6));else cameraTarget.lerp(player.position,Math.min(1,dt*4));cameraTarget.y=0;
    if(progress===1){if(!passage(6)){travel=null;onTravelState(false);return;}const callback=t.done,offset=incoming?t.voyage.offset:0;if(incoming){disposeIsland(active);active=incoming;incoming=null;active.root.position.set(0,0,0);active.root.updateMatrix();active.root.updateMatrixWorld(true);active.reefObjects.forEach(r=>r.object.visible=true);active.propsBatch.update();}player.position.x-=offset;boat.position.x-=offset;cameraTarget.x-=offset;gangway.visible=false;ring.visible=true;travel=null;renderer.shadowMap.needsUpdate=true;applyQuality(qualityProfile);onTravelState(false);resize();callback?.();}
  }
  const markerHost=container.querySelector('#workshop-markers');let markerLayout=null,markerAnchors=[],markerVersion=-1,markerTravel=null,markerWidth=0,markerHeight=0,markerOffset=NaN,boatMarkerX=NaN,boatMarkerZ=NaN,markerProjections=0;
  function cacheMarkers(){markerVersion=-1;markerLayout=active.layout;markerAnchors=[...(markerHost?.querySelectorAll('[data-world]')||[])].map(marker=>{
    const s=active.layout.workshops.find(s=>s.id===marker.dataset.world),anchor=s?workshopArchitecture(s).marker:null;
    return {marker,s,x:s?s.position[0]+anchor.x:0,y:s?anchor.y+groundHeight(active,...s.position):0,z:s?s.position[1]+anchor.z:0,halfWidth:anchor?.halfWidth||0};
  });}
  const markerObserver=new MutationObserver(cacheMarkers);if(markerHost)markerObserver.observe(markerHost,{childList:true});cacheMarkers();
  function projectMarker(marker,x,y,z,halfWidth=0){if(!marker)return;markerProjections++;projected.set(x,y,z).project(camera);const hidden=!!travel||Math.abs(projected.x)>.92||Math.abs(projected.y)>.9;if(marker.hidden!==hidden)marker.hidden=hidden;
    if(!hidden){
      // Anchor above the highest projected banner corner, with a screen-space
      // gap. CSS accounts for button height without a layout read on each move.
      const rise=Math.abs(camera.matrixWorldInverse.elements[1]*camera.projectionMatrix.elements[5])*halfWidth;
      const transform=`translate3d(${((projected.x*.5+.5)*viewport.width).toFixed(2)}px,${(((-projected.y-rise)*.5+.5)*viewport.height).toFixed(2)}px,0) translate(-50%,${halfWidth?'calc(-100% - 8px)':'-50%'})`;
      if(marker.style.transform!==transform)marker.style.transform=transform;
    }}
  function projectMarkers(){
    if(markerLayout!==active.layout)cacheMarkers();
    const changed=markerVersion!==viewVersion||markerTravel!==!!travel||markerWidth!==viewport.width||markerHeight!==viewport.height||markerOffset!==active.root.position.x;
    if(changed){
      markerVersion=viewVersion;markerTravel=!!travel;markerWidth=viewport.width;markerHeight=viewport.height;markerOffset=active.root.position.x;
      for(const {marker,s,x,y,z,halfWidth}of markerAnchors){if(s)projectMarker(marker,x+active.root.position.x,y,z,halfWidth);else marker.hidden=true;}
    }
    if(changed||boatMarkerX!==boat.position.x||boatMarkerZ!==boat.position.z){boatMarkerX=boat.position.x;boatMarkerZ=boat.position.z;projectMarker(boatMarker,boat.position.x,3.2,boat.position.z);}
  }
  function arriveAtGoal(){
    destination.visible=false;const action=target;target=null;routeGoal=null;motion.autoRun=false;stalled=0;
    if(action?.ladder){const ladder=active.layout.ladders.find(l=>l.id===action.ladder);if(ladder)beginPlayerClimb(ladder,action.fromTop,false);}
    else if(action?.workshop)onInteract(action.workshop);
    else if(action?.discovery)explore(action.discovery);
    else if(action==='boat')onBoard();
  }
  function beginPlayerClimb(ladder,fromTop,consumeRoute){
    playerClimb={...createLadderClimb(ladder,fromTop),consumeRoute};keys.clear();motion.jump=0;jumpOrigin=null;motion.running=false;motion.autoRun=false;
  }
  function movePlayer(dt){
    if(!playerClimb&&route[0]?.ladder){const q=route[0],ladder=active.layout.ladders.find(l=>l.id===q.ladder);if(ladder)beginPlayerClimb(ladder,q.fromTop,true);else stopWalking();}
    if(playerClimb){
      const point=tickLadderClimb(playerClimb,dt),{direction}=ladderFrame(playerClimb.ladder);player.position.set(point.x+active.root.position.x,point.y+.25,point.z+active.root.position.z);player.rotation.y=Math.atan2(direction.x,direction.z);
      if(point.done){const consume=playerClimb.consumeRoute;playerClimb=null;if(queuedBoarding){queuedBoarding=false;route=[];goToBoat();}else if(consume){route.shift();if(!route.length)arriveAtGoal();}}
      return true;
    }
    const direction=keyboardDirection(),manual=!!(direction.x||direction.z);let dx=0,dz=0,walking=false;
    if(manual){dx=direction.x;dz=direction.z;}
    else if(route.length){dx=route[0].x-player.position.x;dz=route[0].z-player.position.z;}
    const length=Math.hypot(dx,dz),position=localPlayer(),landing=manual?ladderAt(active.layout,position.x,position.z):null;
    if(landing){const {direction:normal}=ladderFrame(landing.ladder),entry=landing.fromTop?landing.ladder.top:landing.ladder.bottom;
      if((dx*normal.x+dz*normal.z)*(landing.fromTop?-1:1)>.5&&Math.abs(groundHeight(active,position.x,position.z)-entry.y)<.5){useLadder(landing.ladder.id);return false;}}
    motion.running=keys.has('shift')||(!manual&&motion.autoRun&&!!route.length);
    const speed=motion.running?runSpeed:walkSpeed;
    if(length){
      const step=Math.min(manual?Infinity:length,speed*dt),next={x:position.x+dx/length*step,z:position.z+dz/length*step};
      const certified=!manual&&route[0]?.corridor,along=certified?planner.advance(position,route[0].corridor,step):null;
      if(along||!certified&&canMove(position,next)){const point=along||next;player.position.x=point.x+active.root.position.x;player.position.z=point.z+active.root.position.z;walking=true;}
      else if(manual){
        const slideX={x:next.x,z:position.z};if(canMove(position,slideX)){player.position.x=slideX.x+active.root.position.x;walking=true;}
        const slideZ={x:localPlayer().x,z:next.z};if(canMove(localPlayer(),slideZ)){player.position.z=slideZ.z+active.root.position.z;walking=true;}
      }
      player.rotation.y=Math.atan2(dx,dz);
      if(route.length&&!manual){
        if(walking&&step>=length-1e-6){player.position.x=route[0].x;player.position.z=route[0].z;route.shift();stalled=0;if(!route.length)arriveAtGoal();}
        else if(!walking){stalled+=dt;if(stalled>.35){const goal=routeGoal,action=target;if(goal&&replans++<2)pathTo(goal,action,true);else{stopWalking();onNotice('这条路被挡住了，请换一条小路。');}}}else stalled=0;
      }
    }else if(route.length){route.shift();if(!route.length)arriveAtGoal();}
    return walking;
  }
  const lastShadowSun=new THREE.Vector3(999,0,999);
  let lastFrameMs=33,lastWorkMs=0,renderCount=0,lastRenderFps=30,lastDrawResize=-1;
  function diagnosticCounters(){
    const c=staticFrame.stats,v=active.view.checks;
    return {shaderPrograms:renderer.info.programs?.length||0,fullCaptures:c.captures,cachePatches:c.patches,cachePixels:c.fullPixels+c.patchPixels,cacheScrolls:c.scrolls,staticSelections:diagnosticSelections,staticRangeTests:v.staticTests,shadowBakes,npcSteps:npcSimSteps,animalSteps:animalSimSteps,npcPlans,occlusionChecks,occlusionFadeSteps,terrainOcclusionSamples,routeValidations:planner?.movement?.validations||0,playerPoseUploads:playerBatch.updates,propUploads:active.propsBatch.updates};
  }
  function drawFrame(){
    playerBatch.update();for(const object of liveRoots)liveTransforms.update(object);
    contacts.update(active,player,qualityProfile.contactShadows&&!travel);
    projectMarkers();renderScene();viewDirty=false;renderCount++;lastDrawResize=renderSize.resizes;
  }
  function animate(time){
    frame=0;if(disposed)return;
    frameMeter.sample(time,document.hidden||isPaused());
    if(document.hidden||isPaused()&&!travel){
      if(import.meta.env.DEV)profiler.cancel('paused');
      endOrbit(undefined,true);
      // A tutorial/modal pauses simulation. A resized canvas still needs one
      // fresh frame; do not leave a blank map after entering game fullscreen.
      if(!document.hidden&&(renderCount===0||lastDrawResize!==renderSize.resizes)){environment.update(0,elapsed,player.position,qualityProfile);updateCamera();updateView();drawFrame();}
      last=time;quality.resetSampling();schedule(200);return;
    }
    const busy=orbit.active||travel||playerClimb||route.length||keys.size||motion.jump||motion.wave||time<wakeUntil||(!manualPan&&!overview&&active.layout.width>=20&&Math.hypot(cameraTarget.x-player.position.x,cameraTarget.z-player.position.z)>.02);
    const renderFps=busy?qualityProfile.fps:qualityProfile.idleFps,period=1000/renderFps;
    if(time+.5<nextRender){schedule(busy?0:Math.min(200,nextRender-time));return;}nextRender=time+period-((time-nextRender)%period);
    const frameMs=time-last,dt=Math.min(frameMs/1000,.1);last=time;
    const started=performance.now();if(import.meta.env.DEV&&profiler.active)profiler.begin({intervalMs:frameMs,targetFps:renderFps,previousTargetFps:lastRenderFps,moving:!!busy},diagnosticCounters());elapsed+=dt;tickMotion(motion,dt);
    if(orbit.tick(dt)){viewDirty=true;if(!orbit.active)lastOcclusion=-Infinity;}
    let walking=false;
    if(travel){updateTravel(dt);if(disposed)return;}
    else{
      const wasClimbing=!!playerClimb||!!route[0]?.ladder;walking=movePlayer(dt);const pos=localPlayer(),climbing=wasClimbing||!!playerClimb;
      const climbHeight=player.position.y;
      animatePerson(player,walking&&!climbing,qualityProfile.ambientAnimation||walking?elapsed*(motion.running?20:14):0,dt,climbing?climbHeight:.25+playerGroundHeight()+visualJump(motion),false);
      ring.visible=!climbing;
      if(climbing){player.position.y=climbHeight;player.userData.armL.rotation.x=-1.5+Math.sin(elapsed*10)*.35;player.userData.armR.rotation.x=-1.5-Math.sin(elapsed*10)*.35;player.userData.left.rotation.x=Math.sin(elapsed*10)*.25;player.userData.right.rotation.x=-Math.sin(elapsed*10)*.25;}
      player.userData.armR.rotation.z=motion.wave?2.2+Math.sin(elapsed*12)*.3:0;
      if(inView(boat)){boat.position.y=boatHeight+(reducedMotion||!qualityProfile.ambientAnimation?0:Math.sin(elapsed*1.4)*.025);boat.rotation.z=reducedMotion||!qualityProfile.ambientAnimation?0:Math.sin(elapsed*1.1)*.015;}
    }
    if(travel)fitCamera();else if(!manualPan){const x=overview||active.layout.width<20?0:player.position.x,z=overview||active.layout.width<20?0:player.position.z;cameraTarget.x=Math.abs(x-cameraTarget.x)<.005?x:cameraTarget.x+(x-cameraTarget.x)*Math.min(1,dt*5);cameraTarget.z=Math.abs(z-cameraTarget.z)<.005?z:cameraTarget.z+(z-cameraTarget.z)*Math.min(1,dt*5);}
    if(import.meta.env.DEV)profiler.mark('player');
    environment.update(dt,elapsed,player.position,qualityProfile);updateCamera();const visibleChanged=updateView();
    if(import.meta.env.DEV)profiler.mark('cameraAndVisibility');
    const visibleActors=active.npcs.some(n=>inView(n.object)),visibleAnimals=active.wildlife.some(d=>d.object.visible&&inView(d.object));
    const visibleDecorations=!reducedMotion&&qualityProfile.ambientAnimation&&(active.dynamicDiscoveries.some(d=>d.type==='shard'&&d.object.visible&&inView(d.object))||active.animated.some(a=>inView(a.object)));
    const actorWork=qualityProfile.npcMovement&&(visibleActors||visibleAnimals)||visibleDecorations||residentDirty||active.npcs.some(n=>inView(n.object)&&(n.climb||n.wave||!n.frozen));
    let actorChanged=false;
    if(!travel&&actorWork&&elapsed-lastActors>=qualityProfile.actorInterval){actorChanged=updateNPC(active,Math.min(.25,elapsed-lastActors));lastActors=elapsed;}else if(!actorWork)lastActors=elapsed;
    active.residentBatch.setTime?.(elapsed,qualityProfile.ambientAnimation&&!reducedMotion);
    const playerBreathing=qualityProfile.ambientAnimation&&!reducedMotion&&!walking&&!playerClimb&&!travel;
    playerBatch.setTime(elapsed,playerBreathing);
    if(import.meta.env.DEV)profiler.mark('residentsAndAnimals');
    const fading=updateOcclusion(dt);ocean.update(reducedMotion?0:elapsed,cameraTarget.x,cameraTarget.z,qualityProfile.waves);
    if(import.meta.env.DEV)profiler.mark('occlusionAndOcean');
    if(qualityProfile.shadows&&!qualityProfile.fixedShadows)updateShadowSources();
    // A slow GPU must still get reuse frames: a wall-clock-only 10 Hz shadow
    // budget would otherwise rerender both the sun map and island every frame.
    if(qualityProfile.shadows&&(renderer.shadowMap.needsUpdate||!qualityProfile.fixedShadows&&(lastShadowSun.distanceToSquared(sun.position)>.02&&elapsed-lastShadow>.5||renderCount-lastShadowFrame>=3&&elapsed-lastShadow>qualityProfile.shadowInterval&&(travel||shadowMotion.sample(shadowSources))))){
      renderer.shadowMap.needsUpdate=true;lastShadow=elapsed;lastShadowFrame=renderCount;lastShadowSun.copy(sun.position);
    }
    const p=localPlayer();if(!travel&&!playerClimb)ring.position.set(player.position.x,.27+playerGroundHeight(),player.position.z);
    if(elapsed-lastHUD>.15){
      lastHUD=elapsed;
      const miniPlayer=document.querySelector('#mini-player');if(miniPlayer){miniPlayer.setAttribute('cx',p.x);miniPlayer.setAttribute('cy',p.z);miniPlayer.style.visibility=travel?'hidden':'visible';}updateInteraction();
    }
    const continuous=busy||actorWork||playerBreathing||qualityProfile.ambientAnimation&&!reducedMotion&&inView(boat)||qualityProfile.waves&&!reducedMotion||environment.moving;
    if(!viewDirty&&!continuous&&!actorChanged&&!fading&&!visibleChanged){if(import.meta.env.DEV)profiler.cancel('idle');schedule(200);return;}
    // Static island matrices were computed once at creation. Refresh only the
    // few live roots; renderer no longer recursively visits every hidden rig.
    if(actorChanged||fading)updateView(actorChanged?changedViewObjects:noViewChanges);if(import.meta.env.DEV){profiler.mark('hudAndShadows');profiler.beginGPU();}gpuTiming.begin(time);try{drawFrame();}finally{gpuTiming.end(time);if(import.meta.env.DEV)profiler.endGPU();}
    if(import.meta.env.DEV){profiler.mark('drawSubmission');if(profiler.active)profiler.end(diagnosticCounters());}lastRenderFps=renderFps;lastFrameMs=frameMs;lastWorkMs=performance.now()-started;frameMeter.frame(lastWorkMs,renderFps,gpuTiming.value(time));
    if(!travel)quality.observe(frameMs,lastWorkMs,Math.min(frameMs/1000,.5),renderFps,gpuTiming.value(time));
    // A timeout followed by rAF can miss vsync even with a cheap frame. During
    // input/travel, rAF handles pacing and the guard above enforces the cap.
    schedule(busy?0:Math.max(0,period-8));
  }
  installVoxelLighting(scene);scene.updateMatrixWorld(true);schedule();onReady();
  return {profileFrames(frames=60){if(import.meta.env.DEV){const result=profiler.capture(frames);wake();return result;}return Promise.resolve(null);},goToStation,goToBoat,explore,exploreNearest,useLadder,setQuality(settings){quality.configure(settings);},getQuality(){return {...qualityProfile,antialias:antialias.active?'fxaa':'off',pixelRatio:renderer.getPixelRatio(),settings:quality.settings};},syncExploration(progress){for(const d of active.discoveries){if(d.type==='shard')d.object.visible=!progress.shards.includes(d.id);if(d.lamp)d.lamp.material=material(progress.restored.includes(active.layout.level.id)?'#f5dc89':'#a0adb3');}sail.material=material({cream:'#fff7df',rose:'#eeadc8',aurora:'#8ad4cb',star:'#b6a9ea'}[progress.sail]||'#fff7df');active.propsBatch.update(active.discoveries.map(d=>d.object));paintRigidPart(boatSurface,sail);wake();},walkTo(point){pathTo(point,null);},interact,travelTo,isTraveling:()=>!!travel,updateCompleted(done){active.beacons.forEach(b=>b.object.material=material(done.includes(b.workshop)?'#69c88c':'#f4df96'));active.propsBatch.update(active.beacons.map(b=>b.object));wake();},toggleOverview(){endOrbit(undefined,true);overview=!overview;manualPan=false;panX=panZ=0;zoom=1;container.classList.toggle('overview',overview);container.querySelector('#overview-camera')?.setAttribute('aria-pressed',String(overview));resize();return overview;},resetView(){endOrbit(undefined,true);panX=panZ=0;zoom=1;overview=false;manualPan=false;container.classList.remove('overview');container.querySelector('#overview-camera')?.setAttribute('aria-pressed','false');resize();},loadLevel(nextLayout){if(travel)return;endOrbit(undefined,true);disposeIsland(active);active=buildIsland(nextLayout,cube,material);scene.add(active.root);active.root.updateMatrixWorld(true);active.bakedShadows.setEnabled(qualityProfile.bakedShadows);environment.set(nextLayout.level.environment,true);applyQuality(qualityProfile);quality.resetSampling();residentDirty=true;queuedBoarding=false;motion.jump=motion.wave=0;jumpOrigin=null;playerClimb=null;motion.autoRun=false;outline.set(false);renderer.shadowMap.needsUpdate=true;player.position.set(nextLayout.spawn.x,.25+groundHeight(active,nextLayout.spawn.x,nextLayout.spawn.z),nextLayout.spawn.z);boat.position.set(nextLayout.boat.x,boatHeight,nextLayout.boat.z);boat.rotation.y=-Math.PI/2;route=[];target=null;destination.visible=false;cameraTarget.set(0,0,0);this.resetView();},capture(options={}){updateCamera();camera.updateMatrixWorld();updateView();contacts.update(active,player,qualityProfile.contactShadows&&!travel);renderScene(options.cache!==false);return renderer.domElement.toDataURL('image/png');},getDebugSnapshot(){return {islandCount:1+(incoming?1:0),layout:active.layout,position:{...localPlayer(),y:player.position.y},cameraHalf:camera.top,zoom,traveling:!!travel,travelProgress:travel?travel.time/travel.duration:0,travelPhase:travel?.phase||null,boat:{x:boat.position.x,z:boat.position.z,heading:boat.rotation.y,hullRadius},incomingLayout:incoming?.layout||null,overview,orbit:{active:orbit.active,dragging:orbit.dragging,returning:orbit.returning,yaw:orbit.yaw},cameraPosition:{x:camera.position.x,y:camera.position.y,z:camera.position.z},cameraFocus:{x:cameraTarget.x,z:cameraTarget.z},incomingOffset:incoming?.root.position.x||0,incomingDock:incoming?.layout.dock||null,npcs:active.npcs.map(n=>({workshop:n.workshop,x:n.object.position.x,y:n.object.position.y,z:n.object.position.z,arm:n.object.userData.armR.rotation.z,climbing:!!n.climb})),faded:active.occluders.filter(o=>o.opacity<.9).length,routeRemaining:route.length,nextPoint:route[0]?{x:route[0].x,z:route[0].z}:null,wildlife:active.wildlife.map(a=>({id:a.id,species:a.species,x:a.object.position.x,z:a.object.position.z})),discoveries:active.discoveries.map(a=>({id:a.id,type:a.type,x:a.object.position.x,z:a.object.position.z,visible:a.object.visible})),motion:{...motion,climbing:!!playerClimb,climb:playerClimb?{id:playerClimb.ladder.id,time:playerClimb.time,duration:playerClimb.duration}:null},outline:outline.visible,environment:environment.profile,quality:{...qualityProfile,pixelRatio:renderer.getPixelRatio()},frameMs:lastFrameMs,workMs:lastWorkMs,fps:frameMeter.fps,bakedSamples:active.bakedShadows.samples,propUpdates:active.propsBatch.updates,propBatches:active.propsBatch.stats,batchChecks:{residents:active.residentBatch.checks,props:active.propsBatch.checks},npcSimSteps,animalSimSteps,npcPlans,view:{visibleNPCs:active.view.visibleNPCs,selectedTriangles:active.view.selectedTriangles,totalTriangles:active.view.totalTriangles,changes:active.view.changes,checks:active.view.checks},adaptation:quality.adaptation,renderCount,actorTicks,occlusionChecks,antialias:antialias.active,antialiasBuffers:antialias.buffers,bufferResizes:renderSize.resizes,contactShadows:contacts.stats,occlusionFadeSteps,markerProjections,fenceCount:active.fences.length,lampCount:active.lamps.length,liveTransforms:liveTransforms.stats,routeMovement:planner?.movement||null,playerPoseUpdates:playerBatch.updates,weatherUploads:environment.particleUploads,cameraUpdates,terrainOcclusionSamples,staticCache:staticFrame.stats,shadowRefreshes:shadowRefresh.updates,shadowBakes,shadowMap:{size:sun.shadow.map?.width||0,soft:renderer.shadowMap.type===THREE.PCFSoftShadowMap,fixed:qualityProfile.fixedShadows},targetFps:lastRenderFps,oceanTime:ocean.time,waveInstances:ocean.instances,triangles:renderer.info.render.triangles,terrainVertices:active.root.children.find(m=>m.userData.terrain)?.geometry.attributes.position.count,geometryCount:renderer.info.memory.geometries,drawCalls:renderer.info.render.calls};},screenPoint(x,y,z){projected.set(x,y,z).project(camera);const rect=container.getBoundingClientRect();return{x:rect.left+container.clientLeft+(projected.x*.5+.5)*viewport.width,y:rect.top+container.clientTop+(-projected.y*.5+.5)*viewport.height};},dispose(){if(import.meta.env.DEV)profiler.dispose();endOrbit(undefined,true);disposed=true;cancelAnimationFrame(frame);clearTimeout(idleTimer);controller.abort();observer.disconnect();markerObserver.disconnect();disposeIsland(active);if(incoming)disposeIsland(incoming);player.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});outline.dispose();playerBatch.dispose();contacts.dispose();frameMeter.dispose();gpuTiming.dispose();environment.dispose();ocean.dispose();shadowRefresh.dispose();staticFrame.dispose();antialias.dispose();sun.shadow.dispose();const remainingGeometry=new Set(),remainingMaterials=new Set(),sharedMaterials=new Set(materials.values());for(const object of [boat,ring,destination,gangway])object.traverse(o=>{if(!o.isMesh)return;if(o.geometry!==cube)remainingGeometry.add(o.geometry);for(const m of [o.material].flat())if(!sharedMaterials.has(m))remainingMaterials.add(m);});remainingGeometry.forEach(g=>g.dispose());remainingMaterials.forEach(m=>m.dispose());renderer.dispose();cube.dispose();materials.forEach(m=>m.dispose());renderer.domElement.remove();}};
}
