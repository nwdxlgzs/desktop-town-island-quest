import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {performance as wallClock} from 'node:perf_hooks';
import assert from 'node:assert/strict';

// Fixed small island, actual world logic, no browser/GPU and no map generator.
// Renderer submission is a stub: these timings describe JS only, never FPS.
const output=process.argv[2]||'test-results/world-cpu-current.json';
await mkdir('test-results',{recursive:true});
const phases=['movePlayer','updateNPC','updateOcclusion','updateView','renderScene','projectMarkers'];
const compiled=await build({entryPoints:['src/world.js'],bundle:true,write:false,format:'esm',platform:'node',external:['three','three/*'],define:{'import.meta.env.DEV':'true','import.meta.env.PROD':'false'},plugins:[{name:'cpu-probe-only',setup(b){
  b.onLoad({filter:/[\\/]shoreline\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('export function onLand(layout,x,z,margin=0) {','export function onLand(layout,x,z,margin=0) {globalThis.__worldCpuCounts.coastQueries++;').replace('Math.hypot(nx,nz)','(globalThis.__worldCpuCounts.coastRadialMath++,Math.hypot(nx,nz))').replace('Math.sqrt(lengthSq)','(globalThis.__worldCpuCounts.coastRadialMath++,Math.sqrt(lengthSq))'),loader:'js'}));
  b.onLoad({filter:/[\\/]view-draw-list\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('const p=object.position,s=object.scale,q=object.quaternion','globalThis.__worldCpuCounts.boundsVisits++;const p=object.position,s=object.scale,q=object.quaternion'),loader:'js'}));
  b.onLoad({filter:/[\\/]world\.js$/},async args=>{
    let source=await readFile(args.path,'utf8');
    source=source.replace('new THREE.WebGLRenderer(','new globalThis.__worldCpuRenderer(').replace('createFrameProfiler(renderer)','createFrameProfiler(renderer,globalThis.__worldCpuNow)');
    source=source.replace('function screenToWorld(e){','function screenToWorld(e){globalThis.__worldCpuCounts.groundPicks++;');
    source=source.replace('walkingHeightAt(island.layout,x,z)','(globalThis.__worldCpuCounts.groundQueries++,walkingHeightAt(island.layout,x,z))');
    const wrappers=[];
    for(const name of phases){
      source=source.replace(`function ${name}(`,`function measured_${name}(`);
      wrappers.push(`function ${name}(...args){const start=globalThis.__worldCpuNow();try{return measured_${name}(...args);}finally{const p=globalThis.__worldCpuCounts.phases.${name};p.calls++;p.ms+=globalThis.__worldCpuNow()-start;}}`);
    }
    source=source.replace('  const scene=new THREE.Scene();',wrappers.join('\n')+'\n  const scene=new THREE.Scene();');
    return {contents:source,loader:'js'};
  });
}}]});
await writeFile('test-results/world-cpu-runtime.mjs',compiled.outputFiles[0].text);

class Node extends EventTarget{
  constructor(){super();this.style={};this.dataset={};this.classList={toggle(){},remove(){},add(){}};this.hidden=false;this.width=1000;this.height=700;}
  setAttribute(){}getContext(){return {fillRect(){},fillText(){}};}closest(){return null;}
  remove(){}prepend(){}append(){}querySelector(){return null;}querySelectorAll(){return [];}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
  hasPointerCapture(){return false;}setPointerCapture(){}releasePointerCapture(){}
}
const document=new Node(),window=new Node(),container=new Node();
document.hidden=false;document.createElement=()=>new Node();document.activeElement=null;
container.clientWidth=1000;container.clientHeight=700;container.clientLeft=container.clientTop=0;
let clock=0,queue=new Map(),nextId=0,rendererInstance=null;
const originalPerformance=globalThis.performance;
globalThis.__worldCpuNow=()=>wallClock.now();globalThis.performance={now:()=>clock};
globalThis.document=document;globalThis.window=window;globalThis.matchMedia=()=>({matches:false});
globalThis.ResizeObserver=globalThis.MutationObserver=class{observe(){}disconnect(){}};
const originalTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
globalThis.requestAnimationFrame=callback=>{const id=++nextId;queue.set(id,callback);return id;};
globalThis.cancelAnimationFrame=id=>queue.delete(id);
globalThis.setTimeout=(callback,delay)=>requestAnimationFrame(t=>callback(t));
globalThis.clearTimeout=id=>queue.delete(id);
let currentTarget=null,pixelRatio=1,width=1000,height=700;
class Renderer{
  constructor(){rendererInstance=this;this.domElement=new Node();this.shadowMap={enabled:false,type:THREE.PCFShadowMap,autoUpdate:false,needsUpdate:false};this.info={render:{calls:0,triangles:0},memory:{geometries:0},reset:()=>{this.info.render.calls=this.info.render.triangles=0;}};this.autoClear=true;}
  getContext(){return {getExtension(){return null;}};}
  setPixelRatio(n){pixelRatio=n;}getPixelRatio(){return pixelRatio;}
  setDrawingBufferSize(w,h,r){width=w;height=h;pixelRatio=r;}
  getDrawingBufferSize(out){return out.set(width*pixelRatio,height*pixelRatio);}
  setRenderTarget(target){currentTarget=target;}getRenderTarget(){return currentTarget;}
  state={buffers:{depth:{setMask(){}}}};clearDepth(){}
  render(){globalThis.__worldCpuCounts.submissions++;this.shadowMap.needsUpdate=false;}
  compileAsync(){return Promise.resolve();}
  dispose(){}
}
globalThis.__worldCpuRenderer=Renderer;
function counts(){return {groundPicks:0,groundQueries:0,coastQueries:0,coastRadialMath:0,boundsVisits:0,submissions:0,matrices:0,phases:Object.fromEntries(phases.map(name=>[name,{calls:0,ms:0}]))};}
globalThis.__worldCpuCounts=counts();
const originalMatrix=THREE.Object3D.prototype.updateMatrix;
THREE.Object3D.prototype.updateMatrix=function(){globalThis.__worldCpuCounts.matrices++;return originalMatrix.call(this);};
const {stations}=await import('../src/curriculum.js');
const {workshopObstacles}=await import('../src/level-layout.js');
const workshops=stations.slice(0,4).map((s,i)=>({...s,id:s.id,theme:s.id,design:['market','library','observatory','caravan'][i],position:[(i%2)*12-6,Math.floor(i/2)*12-6],approach:[(i%2)*12-6,Math.floor(i/2)*12-2.7],tasks:[]}));
const layout={seed:91,width:32,depth:32,shoreline:{radii:Array(32).fill(1)},bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},shoreX:16,dock:{x:14,z:0},boat:{x:18,z:0},spawn:{x:0,z:0},level:{id:'cpu-fixture',map:{npcLimit:8},npc:{radius:2.6,speed:.65}},workshops,npcSpawns:Object.fromEntries(workshops.map(w=>[w.id,{x:w.position[0]+1.55,z:w.position[1]-.6}])),obstacles:workshops.flatMap(workshopObstacles),roads:[],ladders:[],terraces:[],trees:[{x:1.2,z:2,scale:1}],mountains:[],villages:[],camps:[],reefs:[],exploration:[{id:'shard',type:'shard',x:2,z:-1}],wildlife:[{id:'fox',type:'animal',species:'fox',x:-2,z:1,phase:.7}]};
function event(target,type,values={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(values))Object.defineProperty(event,key,{value});target.dispatchEvent(event);}
function step(count){for(let i=0;i<count;i++){const callbacks=[...queue.values()];queue.clear();clock+=1000/30;for(const callback of callbacks)callback(clock);}}
let world;const results={note:'CPU-only actual game-loop fixture; no GPU timing or device FPS estimate.'};
try{
  const {createWorld}=await import(pathToFileURL(process.cwd()+'/test-results/world-cpu-runtime.mjs').href+'?'+Date.now());
  world=createWorld(container,{layout,onInteract(){},onBoard(){},onReady(){},onError(error){throw error;},onTravelState(){},isPaused:()=>false});
  step(12);
  function scenario(name,setup,frames=60){
    setup();const before=world.getDebugSnapshot();globalThis.__worldCpuCounts=counts();const start=wallClock.now();step(frames);const cpuMs=wallClock.now()-start,after=world.getDebugSnapshot();
    results[name]={...structuredClone(globalThis.__worldCpuCounts),cpuMs,work:{frames:after.renderCount-before.renderCount,npcSteps:after.npcSimSteps-before.npcSimSteps,animalSteps:after.animalSimSteps-before.animalSimSteps,routeChecks:(after.routeMovement?.validations||0)-(before.routeMovement?.validations||0),cacheCaptures:after.staticCache.captures-before.staticCache.captures,cacheHits:after.staticCache.hits-before.staticCache.hits},snapshot:after};delete results[name].snapshot.layout;
  }
  scenario('idleWithActivity',()=>{});
  scenario('keyboardMoving',()=>event(window,'keydown',{key:'d',code:'KeyD'}),30);event(window,'keyup',{key:'d'});
  scenario('routeFollowing',()=>world.walkTo({x:0,z:0}),30);
  globalThis.__worldCpuCounts=counts();
  event(rendererInstance.domElement,'pointermove',{clientX:450,clientY:350,buttons:0,pointerId:1});
  results.hover={groundPicks:globalThis.__worldCpuCounts.groundPicks,groundQueries:globalThis.__worldCpuCounts.groundQueries};
  assert.equal(results.hover.groundPicks,0);assert.equal(results.hover.groundQueries,0,'hover must not sample terrain');
  world.setQuality({npcMovement:false,waves:false,weather:true,shadowQuality:'baked-high'});step(30);
  scenario('sunnyQuiet',()=>{},30);
  assert.equal(results.routeFollowing.work.routeChecks,0,'planned walking must reuse certified segments');
  assert.equal(results.sunnyQuiet.groundQueries,0,'an idle player reuses its ground height');
  assert.equal(results.sunnyQuiet.work.npcSteps,0,'frozen residents do no work while decorations keep animating');
  assert.ok(results.idleWithActivity.work.npcSteps>0&&results.idleWithActivity.work.animalSteps>0,'normal environment activity remains enabled');
  world.toggleOverview();step(2);globalThis.__worldCpuCounts=counts();
  const boat=world.getDebugSnapshot().boat,point=world.screenPoint(boat.x,.85,boat.z);
  event(rendererInstance.domElement,'pointerdown',{...point,clientX:point.x,clientY:point.y,button:0,pointerId:1});
  results.boatPick={groundPicks:globalThis.__worldCpuCounts.groundPicks,routeRemaining:world.getDebugSnapshot().routeRemaining};
  assert.equal(results.boatPick.groundPicks,0,'dynamic boat hit volume must stay clickable');assert.ok(results.boatPick.routeRemaining>0);
  const home=layout.npcSpawns[workshops[0].id];world.loadLevel({...layout,spawn:{x:home.x,z:home.z+.5}});step(4);
  const frozen=world.getDebugSnapshot();world.interact();step(6);const waving=world.getDebugSnapshot();
  assert.ok(waving.npcs.some(n=>n.arm>1),'a frozen resident still responds to E with a greeting');assert.ok(waving.npcSimSteps>frozen.npcSimSteps);
  step(90);const settled=world.getDebugSnapshot();step(12);assert.equal(world.getDebugSnapshot().npcSimSteps,settled.npcSimSteps,'residents freeze again when the greeting finishes');
  world.setQuality({npcMovement:true});step(18);const resumed=world.getDebugSnapshot();assert.ok(resumed.npcSimSteps>settled.npcSimSteps,'re-enabling movement wakes residents');
  results.frozenGreeting={work:{greetingSteps:waving.npcSimSteps-frozen.npcSimSteps,frozenSteps:0,resumedSteps:resumed.npcSimSteps-settled.npcSimSteps}};
  // Audit the actual frame boundaries/call sites, rather than just summing all
  // work in a scenario. Real CPU clock, simulated scheduling, no GPU evidence.
  world.setQuality({preset:'auto',resolution:'1.2',adaptive:false,npcMovement:true,waves:true,weather:true,shadowQuality:'baked-high'});step(4);
  const captured=world.profileFrames(32);event(window,'keydown',{key:'a',code:'KeyA'});step(32);event(window,'keyup',{key:'a'});
  const audit=await captured,violations=[];
  for(const record of audit.records){
    if(record.work.fullCaptures)violations.push({frame:record.frame,rule:'steady-walking-full-recapture',count:record.work.fullCaptures});
    if(record.work.staticSelections>1)violations.push({frame:record.frame,rule:'repeated-index-selection-between-draws',count:record.work.staticSelections});
    if(record.work.shadowBakes)violations.push({frame:record.frame,rule:'fixed-shadow-rebake-on-walking',count:record.work.shadowBakes});
  }
  assert.equal(audit.frames,32);assert.equal(audit.gpuSupported,false);assert.equal(audit.gpu,null);
  assert.ok(audit.records.every(r=>r.dominantPhase&&r.phases.drawSubmission!==undefined&&r.work.occlusionChecks!==undefined),'every frame needs correlated phases and work');
  assert.deepEqual(violations,[],'steady walking must pass the per-frame work budgets');
  results.frameAudit={evidence:'actual-world CPU and work only; stubbed renderer; no DOM, GPU or FPS acceptance',violations,report:audit};
  await writeFile(output,JSON.stringify(results,null,2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).filter(([k])=>k!=='note'&&k!=='frameAudit').map(([k,v])=>[k,{cpuMs:v.cpuMs,groundQueries:v.groundQueries,groundPicks:v.groundPicks,coastQueries:v.coastQueries,coastRadialMath:v.coastRadialMath,boundsVisits:v.boundsVisits,matrices:v.matrices,submissions:v.submissions,work:v.work,phases:v.phases,routeRemaining:v.routeRemaining}])),null,2));
  console.log(JSON.stringify({frameAudit:{frames:audit.frames,cpu:audit.cpu,stallFrames:audit.stallFrames,overBudgetFrames:audit.overBudgetFrames,workBudgetViolations:violations.length,worstFrame:audit.worstFrames[0]}},null,2));
}finally{
  world?.dispose();queue.clear();THREE.Object3D.prototype.updateMatrix=originalMatrix;
  globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClearTimeout;
  globalThis.performance=originalPerformance;
}
