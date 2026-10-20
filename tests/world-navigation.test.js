import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {blockedAt} from '../src/level-layout.js';
import {canWalkSegment,playerRadius,terrainTopOffset,footRadius} from '../src/terrain.js';

// Actual input, planning and player loop, with no browser, GPU or map generator.
test('actual movement rounds trees diagonally and exploration searches nearby reachable shards',async()=>{
  const compiled=await build({entryPoints:['src/world.js'],bundle:true,write:false,format:'esm',platform:'node',external:['three','three/*'],define:{'import.meta.env.DEV':'true','import.meta.env.PROD':'false'},plugins:[{name:'navigation-renderer-stub',setup(b){b.onLoad({filter:/[\\/]world\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('new THREE.WebGLRenderer(','new globalThis.__navigationRenderer('),loader:'js'}));}}]});
  await mkdir('test-results',{recursive:true});const runtime=pathToFileURL(process.cwd()+'/test-results/navigation-runtime.mjs');await writeFile(runtime,compiled.outputFiles[0].text);
  class Node extends EventTarget{
    constructor(){super();this.style={};this.dataset={};this.classList={toggle(){},remove(){},add(){}};this.hidden=false;this.width=1000;this.height=700;}
    setAttribute(){}getContext(){return {fillRect(){},fillText(){}};}closest(){return null;}
    remove(){}prepend(){}append(){}querySelector(){return null;}querySelectorAll(){return [];}
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
    hasPointerCapture(){return false;}setPointerCapture(){}releasePointerCapture(){}
  }
  const document=new Node(),window=new Node(),container=new Node();document.createElement=()=>new Node();document.activeElement=null;container.clientWidth=1000;container.clientHeight=700;container.clientLeft=container.clientTop=0;
  let clock=0,nextId=0,queue=new Map(),target=null,ratio=1,width=1000,height=700,renderer;
  class Renderer{
    constructor(){renderer=this;this.domElement=new Node();this.shadowMap={enabled:false,autoUpdate:false,needsUpdate:false};this.info={render:{calls:0,triangles:0},memory:{geometries:0},reset(){}};this.autoClear=true;}
    getContext(){return {getExtension(){return null;}};}
    setPixelRatio(value){ratio=value;}getPixelRatio(){return ratio;}setDrawingBufferSize(w,h,r){width=w;height=h;ratio=r;}
    getDrawingBufferSize(out){return out.set(width*ratio,height*ratio);}getRenderTarget(){return target;}setRenderTarget(value){target=value;}
    state={buffers:{depth:{setMask(){}}}};clearDepth(){}
    render(){this.shadowMap.needsUpdate=false;}compileAsync(){return Promise.resolve();}dispose(){}
  }
  const overrides={document,window,performance:{now:()=>clock},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},__navigationRenderer:Renderer,
    requestAnimationFrame:callback=>{const id=++nextId;queue.set(id,callback);return id;},cancelAnimationFrame:id=>queue.delete(id),
    setTimeout:callback=>{const id=++nextId;queue.set(id,callback);return id;},clearTimeout:id=>queue.delete(id)};
  const originals=new Map(Object.keys(overrides).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(overrides))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  function step(ms=1000/30){const callbacks=[...queue.values()];queue.clear();clock+=ms;for(const callback of callbacks)callback(clock);}
  function key(type,key,code=key){const event=new Event(type,{cancelable:true});Object.defineProperties(event,{key:{value:key},code:{value:code}});window.dispatchEvent(event);}
  function click(x,y,z){const p=world.screenPoint(x,y,z),event=new Event('pointerdown',{cancelable:true});for(const [key,value]of Object.entries({clientX:p.x,clientY:p.y,button:0,pointerId:1}))Object.defineProperty(event,key,{value});renderer.domElement.dispatchEvent(event);}
  function layout(spawn){return {seed:1,width:16,depth:16,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-7,maxX:7,minZ:-7,maxZ:7},shoreX:8,dock:{x:6,z:0},boat:{x:10,z:0},spawn,level:{id:'fixed-tree',map:{npcLimit:0},npc:{radius:2,speed:.65}},workshops:[],npcSpawns:{},obstacles:[{x:0,z:0,w:.5,d:.5,type:'tree'}],roads:[],ladders:[],terraces:[],trees:[{x:0,z:0,scale:1}],mountains:[],villages:[],camps:[],reefs:[],exploration:[],wildlife:[]};}
  let world;const notices=[],explored=[];
  try{
    const {createWorld}=await import(runtime.href+'?'+Date.now()),map=layout({x:-3,z:-2});
    world=createWorld(container,{layout:map,onInteract(){},onBoard(){},onReady(){},onError(error){throw error;},onTravelState(){},onExplore:item=>explored.push(item.id),onNotice:text=>notices.push(text),isPaused:()=>false});
    for(let i=0;i<4;i++)step();const start=world.getDebugSnapshot().position;
    key('keydown','d');key('keydown','s');for(let i=0;i<5;i++)step();key('keyup','d');key('keyup','s');
    const manual=world.getDebugSnapshot().position;assert.ok(manual.x-start.x>.2&&manual.z-start.z>.2,'two held direction keys move both axes');
    for(const [current,goal]of [[map,{x:3,z:2}],[layout({x:3,z:2}),{x:-3,z:-2}]]){
      if(current!==map)world.loadLevel(current);
      world.walkTo(goal);assert.ok(world.getDebugSnapshot().routeRemaining>0);let previous=world.getDebugSnapshot().position,diagonal=0;
      for(let frame=0;frame<160&&world.getDebugSnapshot().routeRemaining;frame++){
        step([1000/60,1000/30,100][frame%3]);const next=world.getDebugSnapshot().position;
        assert.equal(blockedAt(current,next.x,next.z,playerRadius),false,'the whole player stays outside the tree collision box');assert.ok(canWalkSegment(current,previous,next));
        if(Math.abs(next.x-previous.x)>1e-5&&Math.abs(next.z-previous.z)>1e-5)diagonal++;previous=next;
      }
      const after=world.getDebugSnapshot();assert.equal(after.routeRemaining,0,'the route must finish without stalling at a turn');assert.ok(Math.hypot(after.position.x-goal.x,after.position.z-goal.z)<1e-6);assert.ok(diagonal>5,'automatic movement uses diagonal segments');
    }
    assert.deepEqual(notices,[]);
    const treasures={...layout({x:0,z:0}),trees:[],obstacles:[],exploration:[{id:'far',type:'shard',x:-6,z:0},{id:'middle',type:'shard',x:4,z:1},{id:'near',type:'shard',x:2,z:0},{id:'lamp',type:'beacon',x:0,z:5}]};
    world.loadLevel(treasures);assert.equal(world.exploreNearest('shard'),true);assert.deepEqual(world.getDebugSnapshot().nextPoint,{x:2,z:0},'the last item in the list is closest');
    for(let i=0;i<100&&world.getDebugSnapshot().routeRemaining;i++)step();assert.deepEqual(explored,['near']);
    world.syncExploration({shards:['near'],restored:[],sail:'cream'});world.walkTo({x:-4,z:0});for(let i=0;i<100&&world.getDebugSnapshot().routeRemaining;i++)step();
    assert.equal(world.exploreNearest('shard',['near']),true);assert.deepEqual(world.getDebugSnapshot().nextPoint,{x:-6,z:0},'selection follows the new player position and skips collected shards');
    assert.equal(world.explore('middle'),true);assert.deepEqual(world.getDebugSnapshot().nextPoint,{x:4,z:1},'clicking a specific discovery retains its explicit destination');
    world.syncExploration({shards:['near','middle','far'],restored:[],sail:'cream'});assert.equal(world.exploreNearest('beacon'),true);assert.deepEqual(world.getDebugSnapshot().nextPoint,{x:0,z:5});
    const blockedTreasures={...treasures,obstacles:[{x:2,z:0,w:1,d:1}],exploration:[{id:'blocked',type:'shard',x:2,z:0},{id:'reachable',type:'shard',x:-3,z:0}]};world.loadLevel(blockedTreasures);
    assert.equal(world.exploreNearest('shard'),true);assert.deepEqual(world.getDebugSnapshot().nextPoint,{x:-3,z:0},'a blocked nearby shard falls back to the next candidate');assert.deepEqual(notices,[],'rejected candidates do not emit intermediate failure notices');
    assert.equal(world.exploreNearest('shard',['blocked','reachable']),false,'an empty candidate set starts no new route');
    assert.equal(world.exploreNearest('shard',['reachable']),false);assert.equal(notices.length,1,'all unreachable candidates produce one failure notice');
    // Actual pointer events must use the drawn high floor, not a y=0 plane.
    const voxel={...layout({x:0,z:0}),width:13,depth:13,shoreline:{radii:Array(96).fill(.9)},bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},terrain:{baseLayers:0,layerHeight:.75,coastLayers:Array(12).fill(0)},terrainReady:true,trees:[],obstacles:[],terraces:[{x:0,z:0,r:1.2,ramp:.01,height:4}],fences:[]};
    world.loadLevel(voxel);for(let i=0;i<4;i++)step();notices.length=0;
    click(.2,4+terrainTopOffset,.2);assert.equal(notices.length,0);assert.ok(world.getDebugSnapshot().routeRemaining);
    for(let i=0;i<30&&world.getDebugSnapshot().routeRemaining;i++)step();
    const high=world.getDebugSnapshot();assert.ok(Math.hypot(high.position.x-.2,high.position.z-.2)<1e-5,'click ends at the exact raised surface coordinates');assert.ok(Math.abs(high.position.y-4.25)<.1,'feet follow the raised floor with the normal walking bob');
    click(12,0,12);assert.equal(world.getDebugSnapshot().routeRemaining,0);assert.match(notices.at(-1),/岛上的地面/);
    click(0,2,1.3);assert.equal(world.getDebugSnapshot().routeRemaining,0);assert.match(notices.at(-1),/崖壁/);
    // Keyboard motion cannot bury shoulders in the high voxel, even when only
    // the centre would fit. A route around the same corner must remain usable.
    const cliff={...voxel,spawn:{x:2.2,z:0}};world.loadLevel(cliff);for(let i=0;i<4;i++)step();key('keydown','a');for(let i=0;i<24;i++)step();key('keyup','a');
    const stopped=world.getDebugSnapshot();assert.ok(stopped.position.x>=1.3+playerRadius,'body stops before the cliff');assert.equal(blockedAt(cliff,stopped.position.x,stopped.position.z,playerRadius),false);
    world.walkTo({x:-2.2,z:0});assert.ok(world.getDebugSnapshot().routeRemaining);
    for(let i=0;i<200&&world.getDebugSnapshot().routeRemaining;i++){step();const p=world.getDebugSnapshot().position;assert.equal(blockedAt(cliff,p.x,p.z,playerRadius),false);}
    assert.equal(world.getDebugSnapshot().routeRemaining,0);assert.ok(Math.abs(world.getDebugSnapshot().position.x+2.2)<1e-6);
    const coast={...voxel,spawn:{x:4.1,z:3.1},terraces:[]};world.loadLevel(coast);for(let i=0;i<4;i++)step();notices.length=0;
    click(4.55,terrainTopOffset,3.25);assert.ok(world.getDebugSnapshot().routeRemaining,'safe visible coastal floor has no inland air wall');
    for(let i=0;i<30&&world.getDebugSnapshot().routeRemaining;i++)step();assert.ok(Math.hypot(world.getDebugSnapshot().position.x-4.55,world.getDebugSnapshot().position.z-3.25)<1e-5);
    key('keydown','d');for(let i=0;i<20;i++)step();key('keyup','d');const edge=world.getDebugSnapshot().position;assert.equal(blockedAt(coast,edge.x,edge.z,playerRadius),false);assert.ok(edge.x<=5.2-footRadius,'feet remain on the rendered tile');assert.deepEqual(notices,[]);
    const steps={...voxel,spawn:{x:0,z:1.45},terraces:[{x:0,z:0,r:1.2,ramp:.01,height:1},{x:2,z:0,r:1.2,ramp:.01,height:.5}]};
    world.loadLevel(steps);for(let i=0;i<4;i++)step();key('keydown','w');for(let i=0;i<8;i++)step();key('keyup','w');assert.ok(world.getDebugSnapshot().position.z>=1.3,'walking alone cannot climb a one-unit riser');
    key('keydown',' ','Space');key('keyup',' ','Space');key('keydown','w');for(let i=0;i<4;i++)step();key('keyup','w');assert.ok(world.getDebugSnapshot().position.z<1.3,'space grants a temporary extra-height crossing to a walk-connected landing');
    for(let i=0;i<30;i++)step();assert.equal(world.getDebugSnapshot().motion.jump,0);key('keydown','s');for(let i=0;i<6;i++)step();key('keyup','s');assert.ok(world.getDebugSnapshot().position.z>1.3,'the same limited descent works without jumping');
    world.loadLevel(steps);for(let i=0;i<4;i++)step();key('keydown',' ','Space');key('keyup',' ','Space');for(let i=0;i<30;i++)step();key('keydown','w');for(let i=0;i<8;i++)step();key('keyup','w');assert.ok(world.getDebugSnapshot().position.z>=1.3,'expired jumps no longer grant step clearance');
    // Slow presentation must never change the default user's chosen visuals.
    // A renderer stub verifies the real scheduling path, not actual GPU FPS.
    world.setQuality({preset:'auto',resolution:'1.5',maxFps:30});
    key('keydown','d');
    for(let i=0;i<100;i++)step(1000/12);
    key('keyup','d');const walking=world.getDebugSnapshot();
    for(let i=0;i<100;i++)step(1000/12);const resting=world.getDebugSnapshot();
    for(const snapshot of [walking,resting]){assert.equal(snapshot.quality.stage,0);assert.equal(snapshot.quality.pixelRatio,1.5);assert.equal(snapshot.quality.shadows,true);assert.equal(snapshot.quality.shadowQuality,'baked-high');assert.equal(snapshot.quality.npcMovement,true);assert.equal(snapshot.quality.waves,true);assert.ok(snapshot.staticCache.active);}
    assert.equal(resting.shadowBakes,walking.shadowBakes,'stopping never clears or rebakes the static sun map');
    world.setQuality({...world.getQuality().settings,preset:'low'});assert.equal(world.getDebugSnapshot().quality.stage,3);
    world.setQuality({...world.getQuality().settings,preset:'auto'});assert.equal(world.getDebugSnapshot().quality.stage,0,'switching back restores the original selected effects');
    world.setQuality({...world.getQuality().settings,resolution:'1.2'});step();assert.equal(world.getQuality().pixelRatio,1.2);assert.equal(world.getQuality().shadowQuality,'baked-high');
  }finally{
    world?.dispose();queue.clear();for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
