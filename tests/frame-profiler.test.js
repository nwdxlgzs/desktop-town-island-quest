import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createFrameProfiler} from '../src/frame-profiler.js';

function fixture({gpu=true,ready=true}={}){
  let time=0,frame=0,reads=0,disjoint=false,current=null;
  const created=[],deleted=[],ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension(){reads++;return gpu?ext:null;},getParameter(){return disjoint;},
    createQuery(){const q={frame};created.push(q);return q;},beginQuery(_kind,q){assert.equal(current,null);current=q;},endQuery(){assert.ok(current);current=null;},deleteQuery(q){deleted.push(q);},
    getQueryParameter(q,kind){if(kind===3)return ready&&q.frame<frame;assert.ok(ready&&q.frame<frame,'never read an unavailable GPU result');return 4e6;}};
  const renderer={getContext(){return gl;},info:{render:{calls:3,triangles:24}}},profiler=createFrameProfiler(renderer,()=>time);
  return {profiler,created,deleted,get reads(){return reads;},get current(){return current;},setDisjoint(value){disjoint=value;},step(){frame++;profiler.begin();time+=1;profiler.mark('player');profiler.beginGPU();time+=2;profiler.endGPU();profiler.mark('draw');profiler.end();}};
}

test('capture stays entirely dormant until requested and supports CPU-only devices',async()=>{
  const f=fixture({gpu:false});for(let i=0;i<10;i++)f.step();assert.equal(f.reads,0);
  const result=f.profiler.capture(8);for(let i=0;i<8;i++)f.step();const report=await result;
  assert.equal(report.frames,8);assert.equal(report.cpu.meanMs,3);assert.equal(report.phases.player.meanMs,1);assert.equal(report.phases.draw.meanMs,2);assert.equal(report.gpu,null);assert.equal(report.gpuSupported,false);assert.equal(report.draws,24);
});

test('GPU samples are asynchronous and pending queries remain bounded on a stalled GPU',async()=>{
  const f=fixture(),promise=f.profiler.capture(8);for(let i=0;i<8;i++)f.step();const report=await promise;
  assert.equal(report.gpu.meanMs,4);assert.equal(report.gpu.samples,7);assert.equal(f.created.length,f.deleted.length);
  const stalled=fixture({ready:false}),pending=stalled.profiler.capture(8);for(let i=0;i<8;i++)stalled.step();const partial=await pending;
  assert.equal(stalled.created.length,4);assert.equal(stalled.deleted.length,4);assert.equal(partial.gpu,null);
});

test('disjoint timing and cancellation release queries and resolve the capture',async()=>{
  const f=fixture(),promise=f.profiler.capture(8);for(let i=0;i<4;i++)f.step();f.setDisjoint(true);for(let i=0;i<4;i++)f.step();const report=await promise;
  assert.equal(report.gpuDisjoint,true);assert.equal(report.gpu,null);assert.equal(f.created.length,f.deleted.length);
  const f2=fixture(),cancelled=f2.profiler.capture(8);f2.profiler.begin();f2.profiler.beginGPU();f2.profiler.dispose();
  assert.equal((await cancelled).reason,'disposed');assert.equal(f2.current,null);assert.equal(f2.created.length,f2.deleted.length);
});

test('a single 110ms submission is retained with its exact frame, operation and work; external gaps stay distinct',async()=>{
  let time=0,clockReads=0;const profiler=createFrameProfiler({getContext:()=>({getExtension:()=>null}),info:{render:{calls:2,triangles:12}}},()=>{clockReads++;return time;});
  profiler.begin();profiler.measure('dormant',()=>{});profiler.end();assert.equal(clockReads,0);
  const pending=profiler.capture(60);
  for(let i=0;i<60;i++){
    profiler.begin({intervalMs:i===40?110:1000/30,targetFps:30,moving:true},{fullCaptures:0,cachePixels:0});
    time+=1;profiler.mark('player');profiler.measure('staticSceneSubmit',()=>{time+=i===23?110:1;});profiler.mark('drawSubmission');
    profiler.end({fullCaptures:i===23?1:0,cachePixels:i===23?4160070:0});
  }
  const report=await pending,spike=report.worstFrames[0];
  assert.ok(report.cpu.meanMs<4);assert.equal(report.cpu.p95Ms,2);assert.equal(report.cpu.p99Ms,111);assert.equal(report.cpu.maxMs,111);
  assert.equal(report.stallFrames,2);assert.equal(report.overBudgetFrames,1);assert.equal(spike.frame,24);assert.equal(spike.dominantPhase,'drawSubmission');assert.equal(spike.operations.staticSceneSubmit,110);assert.equal(spike.work.fullCaptures,1);assert.equal(spike.work.cachePixels,4160070);
  assert.equal(report.records[40].cpuMs,2);assert.equal(report.records[40].intervalMs,110);assert.equal(report.records[40].work.fullCaptures,0,'late presentation alone cannot be labelled a CPU draw stall');
});

test('delayed GPU results stay attached to their originating frame',async()=>{
  const f=fixture(),pending=f.profiler.capture(8);for(let i=0;i<8;i++)f.step();const report=await pending;
  assert.equal(report.records.length,8);assert.equal(report.records[0].gpuMs,4);assert.equal(report.records[6].gpuMs,4);assert.equal(report.records[7].gpuMs,null,'an unavailable final query must not inherit the previous frame\'s GPU result');
});

test('normal pacing tolerances and waking from the idle cap do not invent stalls',async()=>{
  let time=0;const profiler=createFrameProfiler({getContext:()=>({getExtension:()=>null}),info:{render:{calls:0,triangles:0}}},()=>time),pending=profiler.capture(8);
  for(let i=0;i<8;i++){profiler.begin({intervalMs:i<2?1000/12:2000/30+1e-8,targetFps:30,previousTargetFps:i<2?12:30});time++;profiler.end();}
  const report=await pending;assert.equal(report.stallFrames,0);assert.equal(report.records[0].intervalMs,null);assert.equal(report.presentation.samples,7);
});

test('production compilation removes the opt-in profiler and its per-stage timers',async()=>{
  const result=await build({entryPoints:['src/world.js'],bundle:true,write:false,format:'esm',minify:true,external:['three','three/*'],define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'}});
  const program=result.outputFiles[0].text;
  for(const key of ['drawSubmission','residentsAndAnimals','gpuSupported','staticSceneSubmit','staticIndexSelection','worstFrames','dominantPhase','diagnosticCounters'])assert.ok(!program.includes(key),`development diagnostics must be stripped: ${key}`);
});
