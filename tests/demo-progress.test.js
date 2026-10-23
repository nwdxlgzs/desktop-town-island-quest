import test from 'node:test';
import assert from 'node:assert/strict';
import {taskIds,levels,biomes} from '../src/curriculum.js';

function fullCollections(state){
  assert.deepEqual(state.completed,taskIds);assert.equal(state.unlocked,levels.length-1);assert.equal(state.graduated,true);
  assert.deepEqual(state.exploration.shards,levels.flatMap(level=>Array.from({length:3},(_,i)=>`${level.id}:shard-${i}`)));
  assert.deepEqual(state.exploration.restored,levels.map(level=>level.id));
  assert.deepEqual(state.exploration.species,[...new Set(biomes.flatMap(b=>b.fauna))]);
  assert.ok(state.exploration.species.includes('维修无人机'));assert.ok(state.exploration.species.includes('企鹅'));
  assert.ok(state.exploration.restored.length>=6,'all four sail rewards are unlocked');
}

test('in-place unlock persists on the existing save; the old hash has no effect',async()=>{
  const data=new Map(),listeners=[];
  data.set('desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,currentLevel:2,unlocked:2,completed:[taskIds[0]],onboardingVersion:1,attempts:{[taskIds[0]]:3},records:{note:'保留原记录'},exploration:{shards:[],restored:[],species:[],sail:'rose'}}));
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  let reloads=0;globalThis.location={hash:'#BYPASS',reload:()=>reloads++};globalThis.addEventListener=(name,handler)=>listeners.push({name,handler});
  try{
    const game=await import('../src/state.js?in-place-unlock'),original=game.state;
    assert.deepEqual(game.state.completed,[taskIds[0]]);assert.equal(game.state.unlockedMode,undefined);assert.deepEqual(listeners,[]);
    assert.equal(game.unlockAllContent(),true);assert.equal(game.state,original);fullCollections(game.state);
    assert.equal(game.state.seed,7);assert.equal(game.state.currentLevel,2);assert.equal(game.state.onboardingVersion,1);assert.equal(game.state.records.note,'保留原记录');assert.equal(game.state.attempts[taskIds[0]],3);assert.equal(game.state.exploration.sail,'rose');
    const stored=JSON.parse(data.get('desktop-quest-v3'));fullCollections(stored);assert.equal(stored.unlockedMode,true);assert.equal(data.has('desktop-quest-v3-demo'),false);assert.equal(reloads,0);assert.equal(globalThis.location.hash,'#BYPASS');
    globalThis.location.hash='';const ordinary=await import('../src/state.js?in-place-reload');fullCollections(ordinary.state);assert.equal(ordinary.state.unlockedMode,true);
    const transferred=ordinary.exportProgress();transferred.progress.seed=1234;transferred.progress.currentLevel=0;transferred.progress.unlocked=0;transferred.progress.completed=[];transferred.progress.records={};for(const key of ['shards','restored','species'])transferred.progress.exploration[key]=[];
    ordinary.importProgress(JSON.stringify(transferred));fullCollections(ordinary.state);fullCollections(JSON.parse(data.get('desktop-quest-v3')));assert.equal(ordinary.state.seed,1234);
    // Importing a normal save replaces the current unlock state as well.
    delete transferred.progress.unlockedMode;ordinary.importProgress(JSON.stringify(transferred));assert.equal(ordinary.state.unlockedMode,undefined);assert.deepEqual(ordinary.state.completed,[]);
    ordinary.unlockAllContent();ordinary.resetState(7);assert.deepEqual(ordinary.state.completed,[]);assert.equal(ordinary.state.unlockedMode,undefined);assert.equal(ordinary.state.unlocked,0);assert.equal(ordinary.state.graduated,false);assert.deepEqual(ordinary.state.exploration,{shards:[],restored:[],species:[],sail:'cream'});assert.equal(ordinary.state.onboardingVersion,0);assert.equal(ordinary.state.currentLevel,0);assert.deepEqual(ordinary.state.attempts,{});assert.deepEqual(ordinary.state.records,{});assert.equal(ordinary.state.seconds,0);
    const afterReset=await import('../src/state.js?in-place-after-reset');assert.deepEqual(afterReset.state.completed,[]);assert.equal(afterReset.state.unlockedMode,undefined);assert.equal(afterReset.state.onboardingVersion,0);
  }finally{delete globalThis.location;delete globalThis.localStorage;delete globalThis.addEventListener;}
});

test('new adventures reset onboarding for ordinary saves too',async()=>{
  const data=new Map([['desktop-quest-v3',JSON.stringify({version:3,routeVersion:1,seed:7,currentLevel:0,unlocked:0,completed:[taskIds[0]],onboardingVersion:1,sound:false,music:true,musicPreference:1})]]);
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  try{
    const game=await import('../src/state.js?restart-onboarding');game.resetState(1234);
    assert.equal(game.state.onboardingVersion,0);assert.equal(game.state.unlockedMode,undefined);assert.deepEqual(game.state.completed,[]);assert.equal(game.state.currentLevel,0);assert.equal(game.state.seed,1234);assert.equal(game.state.sound,false);assert.equal(game.state.music,true);
    const restored=await import('../src/state.js?restart-onboarding-reload');assert.equal(restored.state.onboardingVersion,0);assert.deepEqual(restored.state.completed,[]);
  }finally{delete globalThis.localStorage;}
});

test('fresh and unreadable saves require activation; unlock never skips onboarding and survives blocked storage in memory',async()=>{
  globalThis.location={hash:'#BYPASS'};
  try{
    for(const [i,raw]of [null,'broken JSON'].entries()){
      globalThis.localStorage={getItem:()=>raw,setItem(){throw new Error('blocked');}};
      const game=await import(`../src/state.js?fresh-in-place-${i}`);assert.deepEqual(game.state.completed,[]);assert.equal(game.state.unlockedMode,undefined);
      assert.equal(game.unlockAllContent(),false);fullCollections(game.state);assert.equal(game.state.onboardingVersion,0);
      game.state.onboardingVersion=1;game.resetState(7);assert.equal(game.state.onboardingVersion,0);assert.deepEqual(game.state.completed,[]);assert.equal(game.state.unlockedMode,undefined);assert.equal(game.state.unlocked,0);
    }
  }finally{delete globalThis.location;delete globalThis.localStorage;}
});
