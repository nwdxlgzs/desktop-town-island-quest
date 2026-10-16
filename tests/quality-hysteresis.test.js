import test from 'node:test';
import assert from 'node:assert/strict';
import {createQualityController} from '../src/quality.js';

function sample(q,seconds,frame,work=4,target,gpu=4){
  for(let t=0;t<seconds;){const ms=typeof frame==='function'?frame(q.profile):frame,dt=ms/1000;q.observe(ms,work,dt,target??q.profile.fps,gpu);t+=dt;}
}

test('tolerance band and transient spikes keep quality steady; sustained overload still degrades',()=>{
  const stages=[],q=createQualityController({adaptive:true,maxFps:60,shadowQuality:'high'},p=>stages.push(p.stage));
  sample(q,20,1000/48,20);assert.equal(q.profile.stage,0,'48–60 FPS is within tolerance');
  sample(q,.7,100,70);sample(q,10,1000/60,4);assert.deepEqual(stages,[],'a short stall does not trigger a settings change');
  sample(q,7,32,20);assert.ok(q.profile.stage>0,'sustained 31 FPS at a 60 FPS target eventually reduces load');
  sample(q,6,160,100);assert.equal(q.profile.stage,4,'critical stalls bypass the longer ordinary hold');
  assert.equal(q.settings.shadowQuality,'high','the user preference is retained');
});

test('explicitly enabled relief tolerates low frames, holds a stable stage and resets when the user selects auto again',()=>{
  const stages=[],q=createQualityController({adaptive:true,resolution:'1.5'},p=>stages.push({stage:p.stage,ratio:p.pixelRatio}));
  sample(q,12,p=>p.stage<3?1000/12:1000/30,1.2,undefined,29);
  assert.equal(q.profile.stage,3);assert.equal(q.profile.pixelRatio,1);
  const low=createQualityController({preset:'low'});
  for(const key of ['pixelRatio','maxPixels','waves','particles','shadows','shadowQuality','ambientAnimation','npcMovement','fps'])assert.equal(q.profile[key],low.profile[key],key);
  assert.deepEqual(stages,[{stage:2,ratio:1.5},{stage:3,ratio:1}]);
  sample(q,180,1000/30,1.2,undefined,29);assert.equal(q.profile.stage,3,'GPU near budget must not trigger a promotion because JS is cheap');
  q.configure({...q.settings,showFps:true});assert.equal(q.profile.stage,3,'display-only saves preserve the stable stage');
  q.configure({...q.settings,preset:'low'});q.configure({...q.settings,preset:'auto',adaptive:false});assert.equal(q.profile.stage,0,'returning to auto restores the selected visual configuration');
  assert.equal(q.profile.pixelRatio,1.5);assert.equal(q.profile.shadows,true);assert.equal(q.profile.waves,true);
  sample(q,180,1000/12,1.2,undefined,80);assert.equal(q.profile.stage,0,'without opt-in, slow frames never change effects');
});

test('short stops preserve partial overload evidence; missing GPU timing uses a conservative recovery hold',()=>{
  const q=createQualityController({adaptive:true});for(let i=0;i<8;i++){sample(q,.45,1000/12,1.2);sample(q,.3,1000/12,1.2,12);}
  assert.ok(q.profile.stage>=2,'short walking inputs accumulate enough evidence to adapt');
  const unknown=createQualityController({preset:'low',adaptive:true});assert.equal(unknown.profile.stage,3);
  sample(unknown,60,1000/30,1.2,undefined,null);assert.equal(unknown.profile.stage,3,'CPU-only headroom is not treated as 45 seconds of GPU evidence');
  // Low mode deliberately stays at its selected base stage. Auto can recover
  // only when opt-in relief has actually accumulated a lower workload.
  const recovering=createQualityController({adaptive:true});sample(recovering,8,1000/12,1.2);const initial=recovering.profile.stage;
  sample(recovering,60,1000/30,1.2,undefined,null);assert.equal(recovering.profile.stage,initial);
  sample(recovering,65,1000/30,1.2,undefined,null);assert.equal(recovering.profile.stage,initial-1,'unsupported devices can still make a bounded recovery trial');
});

test('30 FPS CPU budget is relative to the selected cap, not a fixed 16ms',()=>{
  const q=createQualityController({adaptive:true,maxFps:30});sample(q,40,1000/30,20);assert.equal(q.profile.stage,0);
  sample(q,30,1000/24,39);assert.equal(q.profile.stage,0,'24–30 FPS stays inside the band');
  sample(q,8,1000/18,40);assert.ok(q.profile.stage>0);
});

test('idle and short fast bursts cannot promote a low-end machine',()=>{
  const q=createQualityController({adaptive:true,maxFps:60},()=>{},{cores:2});assert.equal(q.profile.stage,2);
  sample(q,180,1000/6,2,6);assert.equal(q.profile.stage,2,'idle has no recovery evidence');
  sample(q,25,p=>1000/p.fps,3);sample(q,5,1000/25,12);sample(q,25,p=>1000/p.fps,3);assert.equal(q.profile.stage,2,'recovery needs uninterrupted active headroom');
  q.configure({...q.settings,showFps:true});assert.equal(q.profile.stage,2,'saving a display-only preference preserves the stable stage');
  q.configure(q.settings);assert.equal(q.profile.stage,2);
});

test('failed promotion waits at least two minutes before retry, surviving pause and idle',()=>{
  const stages=[],q=createQualityController({adaptive:true,maxFps:60},p=>stages.push(p.stage),{cores:2});
  sample(q,47,p=>1000/p.fps,3);assert.equal(q.profile.stage,1,'45s active headroom permits a one-tier trial');
  sample(q,6,45,22);assert.equal(q.profile.stage,2,'bad promotion rolls back after sustained overload');assert.ok(q.adaptation.retryIn>110);
  for(let i=0;i<20;i++)q.resetSampling();sample(q,60,p=>1000/p.fps,3);assert.equal(q.profile.stage,2,'the former 20-second recovery loop is suppressed');
  sample(q,65,p=>1000/p.fps,3);assert.equal(q.profile.stage,1,'recovery can be retried after the backoff');
  sample(q,6,45,22);assert.equal(q.profile.stage,2);assert.ok(q.adaptation.retryIn>220,'a repeated failed recovery increases backoff');
  assert.deepEqual(stages,[1,2,1,2]);
});
