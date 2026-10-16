import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {blockedAt} from '../src/level-layout.js';
import {canWalkSegment} from '../src/terrain.js';

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
  let clock=0,nextId=0,queue=new Map(),target=null,ratio=1,width=1000,height=700;
  class Renderer{
    constructor(){this.domElement=new Node();this.shadowMap={enabled:false,autoUpdate:false,needsUpdate:false};this.info={render:{calls:0,triangles:0},memory:{geometries:0},reset(){}};this.autoClear=true;}
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
  function key(type,key){const event=new Event(type,{cancelable:true});Object.defineProperty(event,'key',{value:key});window.dispatchEvent(event);}
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
        assert.equal(blockedAt(current,next.x,next.z),false,'player never enters the tree collision box');assert.ok(canWalkSegment(current,previous,next));
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
