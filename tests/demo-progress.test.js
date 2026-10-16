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

test('the requested URL opens complete progress without changing the classroom save',async()=>{
  const data=new Map(),original=JSON.stringify({version:3,routeVersion:1,seed:7,currentLevel:0,unlocked:0,completed:[taskIds[0]],records:{note:'保留'},exploration:{shards:['island-001:shard-0'],restored:[],species:['兔子'],sail:'rose'}}),listeners=[];
  data.set('desktop-quest-v3',original);
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  let reloads=0;globalThis.location={hash:'#BYPASS',reload:()=>reloads++};globalThis.addEventListener=(name,handler)=>listeners.push({name,handler});
  try{
    const demo=await import('../src/state.js?demo-progress');
    fullCollections(demo.state);assert.equal(demo.state.currentLevel,0);assert.equal(demo.state.seed,7);assert.equal(demo.state.records.note,'保留');assert.equal(demo.state.exploration.sail,'rose');
    assert.equal(demo.collectDiscovery({type:'shard',id:'island-001:shard-0'}),false);assert.equal(demo.collectDiscovery({type:'animal',species:'维修无人机'}),false);
    demo.persist();assert.equal(data.get('desktop-quest-v3'),original);assert.equal(JSON.parse(data.get('desktop-quest-v3-demo')).completed.length,taskIds.length);
    fullCollections(JSON.parse(data.get('desktop-quest-v3-demo')));
    const partial=JSON.parse(data.get('desktop-quest-v3-demo'));partial.exploration={shards:[],restored:[],species:[],sail:'star'};partial.currentLevel=2;
    data.set('desktop-quest-v3-demo',JSON.stringify(partial));const resumed=await import('../src/state.js?resumed-demo-progress');
    fullCollections(resumed.state);assert.equal(resumed.state.currentLevel,2);assert.equal(resumed.state.exploration.sail,'star');
    demo.resetState();fullCollections(demo.state);assert.equal(data.get('desktop-quest-v3'),original);
    globalThis.location.hash='';listeners.at(-1).handler();assert.equal(reloads,1);
    const ordinary=await import('../src/state.js?ordinary-progress');assert.deepEqual(ordinary.state.completed,[taskIds[0]]);assert.equal(ordinary.state.unlocked,0);assert.equal(ordinary.state.graduated,false);assert.deepEqual(ordinary.state.exploration,JSON.parse(original).exploration);
    globalThis.location.hash='#BYPASS';listeners.at(-1).handler();assert.equal(reloads,2);
  }finally{delete globalThis.location;delete globalThis.localStorage;delete globalThis.addEventListener;}
});

test('fresh and unreadable saves also receive the entire demonstration collection',async()=>{
  globalThis.location={hash:'#BYPASS'};
  try{
    for(const [i,raw]of [null,'broken JSON'].entries()){
      globalThis.localStorage={getItem:()=>raw,setItem(){}};
      const demo=await import(`../src/state.js?fresh-demo-collections-${i}`);fullCollections(demo.state);
    }
  }finally{delete globalThis.location;delete globalThis.localStorage;}
});
