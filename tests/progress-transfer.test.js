import test from 'node:test';
import assert from 'node:assert/strict';
import {islandProgress,unlockedThrough} from '../src/progress-rules.js';
import {readProgress,progressFile,parseSeed,maxProgressBytes} from '../src/progress-file.js';
import {journeyForSeed,taskIds} from '../src/curriculum.js';
import {normalizeQuality} from '../src/quality.js';

function minimum(level){
  const ids=level.workshops.map(w=>w.tasks[0]);
  for(const id of level.tasks)if(ids.length<Math.ceil(level.tasks.length*.6)&&!ids.includes(id))ids.push(id);
  return ids;
}
function snapshot(seed=7){return {version:3,routeVersion:1,seed,completed:[],currentLevel:0,unlocked:0,attempts:{},finishedAt:{},records:{},seconds:125,startedAt:'2026-10-20T00:00:00.000Z',graduated:false,onboardingVersion:1,sound:false,music:true,quality:normalizeQuality({resolution:'.75'}),exploration:{shards:['island-001:shard-0'],restored:[],species:['兔子'],sail:'cream'}};}
const encode=state=>JSON.stringify(progressFile(state));

test('travel requires 60% rounded up AND one completed question in each workshop',()=>{
  for(let count=1;count<=6;count++){
    const workshops=Array.from({length:count},(_,i)=>({tasks:Array.from({length:3},(_,j)=>`${i}:${j}`)})),level={workshops,tasks:workshops.flatMap(w=>w.tasks)},done=minimum(level);
    assert.equal(islandProgress(level,done).eligible,true);
    assert.equal(islandProgress(level,done).complete,false);
    assert.equal(islandProgress(level,done.slice(0,-1)).eligible,false);
    if(count>=3){const untouched=workshops.slice(0,-1).flatMap(w=>w.tasks);assert.ok(untouched.length>=Math.ceil(level.tasks.length*.6));assert.equal(islandProgress(level,untouched).eligible,false);}
  }
  const level={workshops:[{tasks:['a','b','c','d','e']}],tasks:['a','b','c','d','e']};
  assert.equal(islandProgress(level,['a','b','c']).eligible,true,'exactly 60% qualifies');
});

test('unlocking stops at first ineligible island, even if later islands are finished',()=>{
  const route=journeyForSeed(7),done=minimum(route[0]);
  assert.equal(unlockedThrough(route,done),1);
  assert.equal(unlockedThrough(route,[...done,...route[2].tasks]),1);
  assert.equal(unlockedThrough(route,[...done,...minimum(route[1])]),2);
});

test('portable progress preserves the seed, partial itinerary, records, collection and settings',()=>{
  const save=snapshot(),route=journeyForSeed(save.seed);save.completed=minimum(route[0]);save.unlocked=1;save.currentLevel=1;
  save.attempts[save.completed[0]]=3;save.finishedAt[save.completed[0]]=save.startedAt;save.records.save='自己的练习记录';
  const restored=readProgress(encode(save));
  assert.equal(restored.seed,7);assert.equal(restored.currentLevel,1);assert.equal(restored.unlocked,1);assert.deepEqual(restored.completed,save.completed);
  assert.deepEqual(restored.records,save.records);assert.deepEqual(restored.attempts,save.attempts);assert.deepEqual(restored.finishedAt,save.finishedAt);assert.deepEqual(restored.exploration,save.exploration);assert.deepEqual(restored.quality,save.quality);assert.equal(restored.seconds,125);
  assert.deepEqual(journeyForSeed(restored.seed),route);
});

test('bad files, reports, impossible itineraries and cross-mode imports are rejected',()=>{
  for(const text of ['no JSON','null','{}',JSON.stringify({title:'学习报告',completed:10})])assert.throws(()=>readProgress(text));
  assert.throws(()=>readProgress(' '.repeat(maxProgressBytes+1)),/过大/);
  const changed=change=>{const save=snapshot();change(save);return encode(save);};
  for(const change of [s=>s.seed=-1,s=>s.seed=4294967296,s=>s.seed=1.5,s=>s.currentLevel=1,s=>s.unlocked=2,s=>s.completed=['not-a-task'],s=>s.completed=[taskIds[0],taskIds[0]],s=>s.seconds=-1,s=>s.records={__bad:{x:1}},s=>s.attempts[taskIds[0]]=Infinity,s=>s.exploration.shards=['fake-island'],s=>s.startedAt='wrong'])assert.throws(()=>readProgress(changed(change)));
  const demo=JSON.stringify(progressFile(snapshot(),true));assert.throws(()=>readProgress(demo),/分别保存/);assert.equal(readProgress(demo,true).seed,7);assert.throws(()=>readProgress(encode(snapshot()),true),/分别保存/);
});

test('seed input accepts the entire uint32 range and rejects ambiguous values',()=>{
  assert.equal(parseSeed(' 0007 '),7);assert.equal(parseSeed(0),0);assert.equal(parseSeed('4294967295'),4294967295);
  for(const value of ['','-1','1.5','1e3','+1','4294967296','文字',NaN,null])assert.throws(()=>parseSeed(value));
});

test('task completion unlocks partial travel, restores on reload, and importing persists atomically',async()=>{
  const data=new Map();globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  try{
    data.set('desktop-quest-v3',JSON.stringify(snapshot()));
    const game=await import('../src/state.js?progress-transfer'),route=journeyForSeed(7),done=minimum(route[0]);
    for(const id of done.slice(0,-1))game.finishTask(id);assert.equal(game.state.unlocked,0);assert.equal(game.visitLevel(1),false);
    game.finishTask(done.at(-1));assert.equal(game.state.unlocked,1);assert.equal(game.canSail(route[0]),true);assert.equal(game.levelComplete(route[0]),false);assert.equal(game.visitLevel(1),true);
    const reloaded=await import('../src/state.js?progress-transfer-reload');assert.equal(reloaded.state.currentLevel,1);assert.equal(reloaded.state.unlocked,1);
    const next=snapshot(1234);next.completed=[journeyForSeed(next.seed)[0].tasks[0]];
    game.importProgress(encode(next));game.persist();assert.equal(JSON.parse(data.get('desktop-quest-v3')).seed,1234);assert.deepEqual(game.state.completed,next.completed);
    const before=JSON.stringify(game.state),stored=data.get('desktop-quest-v3');assert.throws(()=>game.importProgress('broken'));assert.equal(JSON.stringify(game.state),before);assert.equal(data.get('desktop-quest-v3'),stored);
    globalThis.localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>game.importProgress(encode(snapshot())),/当前进度已保留/);assert.equal(JSON.stringify(game.state),before);
  }finally{delete globalThis.localStorage;}
});
