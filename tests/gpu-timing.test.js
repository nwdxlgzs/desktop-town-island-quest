import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuTiming} from '../src/gpu-timing.js';

function fixture({supported=true,ready=true}={}){
  let reads=0,current=null,disjoint=false,external=false;const created=[],deleted=[],ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,CURRENT_QUERY:5,
    getExtension(){reads++;return supported?ext:null;},getParameter(){return disjoint;},getQuery(){return external?{}:current;},
    createQuery(){const q={};created.push(q);return q;},beginQuery(_type,q){assert.equal(current,null);current=q;},endQuery(){assert.ok(current);current=null;},deleteQuery(q){deleted.push(q);},
    getQueryParameter(_q,kind){if(kind===3)return ready;assert.ok(ready,'never read unavailable results');return 28e6;}};
  const meter=createGpuTiming({getContext:()=>gl});
  return {meter,created,deleted,get reads(){return reads;},get current(){return current;},external(value){external=value;},disjoint(value){disjoint=value;},step(time){meter.begin(time);meter.end(time);}};
}

test('GPU timing stays dormant when disabled, samples at most once per second and expires old evidence',()=>{
  const f=fixture();for(let t=0;t<1000;t+=33)f.step(t);assert.equal(f.reads,0);
  f.meter.configure(true);for(let t=1000;t<3000;t+=33)f.step(t);assert.equal(f.reads,1);assert.equal(f.created.length,2);assert.equal(f.meter.value(3000),28);assert.equal(f.meter.value(7000),null);
  f.meter.configure(false);assert.equal(f.created.length,f.deleted.length);f.step(8000);assert.equal(f.created.length,2);f.meter.dispose();
});

test('unsupported or stalled GPU never blocks or accumulates unbounded queries',()=>{
  const unsupported=fixture({supported:false});unsupported.meter.configure(true);for(let t=0;t<10000;t+=100)unsupported.step(t);assert.equal(unsupported.reads,1);assert.equal(unsupported.created.length,0);assert.equal(unsupported.meter.value(1000),null);
  const stalled=fixture({ready:false});stalled.meter.configure(true);for(let t=0;t<10000;t+=100)stalled.step(t);assert.equal(stalled.created.length,2);stalled.meter.dispose();assert.equal(stalled.deleted.length,2);
});

test('GPU disjoint, quality changes and disposal discard samples and release every query; profiler queries do not nest',()=>{
  const f=fixture();f.meter.configure(true);f.external(true);f.step(0);assert.equal(f.created.length,0);f.external(false);f.step(1000);f.step(1300);assert.equal(f.meter.value(1300),28);
  f.disjoint(true);f.step(1600);assert.equal(f.meter.value(1600),null);assert.equal(f.created.length,f.deleted.length);f.disjoint(false);f.step(2700);
  f.meter.configure(true,true);assert.equal(f.meter.value(2700),null);assert.equal(f.created.length,f.deleted.length);
  f.meter.begin(3000);assert.ok(f.current);f.meter.dispose();assert.equal(f.current,null);assert.equal(f.created.length,f.deleted.length);
});
