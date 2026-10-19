import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/levels.json' with {type:'json'};
import {createJourney} from '../src/journey.js';
import {taskIds,missionCount,tasks,levels} from '../src/curriculum.js';

test('missions are packed into seeded islands independent of the naming pool',()=>{
  const a=createJourney(config,17),b=createJourney(config,17),c=createJourney(config,18);
  assert.deepEqual(a,b);assert.notDeepEqual(a.map(l=>l.workshops.map(w=>w.id)),c.map(l=>l.workshops.map(w=>w.id)));
  assert.ok(a.length>config.islandNames.length);assert.ok(a.every(l=>l.workshops.length>=1&&l.workshops.length<=6));
  const oneName=createJourney({...config,islandNames:['一个名字']},17);
  assert.deepEqual(oneName.map(l=>l.workshops.map(w=>w.id)),a.map(l=>l.workshops.map(w=>w.id)));
  assert.equal(missionCount,81);assert.equal(taskIds.length,243);assert.equal(new Set(a.flatMap(l=>l.tasks)).size,243);
  assert.ok(new Set(taskIds.map(id=>tasks[id].kind)).size>=31);
  assert.equal(new Set(a.map(l=>l.biome.id)).size,12);
  assert.ok(a.filter(l=>l.environment.id==='predawn').length<=1);assert.equal(a[0].environment.id,'morning');
  assert.deepEqual(createJourney({...config,biomes:config.biomes.slice(0,1)},17).map(l=>l.workshops.map(w=>w.id)),a.map(l=>l.workshops.map(w=>w.id)));
});

test('old progress resumes at an unfinished new island, and new voyages persist by seed',async()=>{
  const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  data.set('desktop-quest-v3',JSON.stringify({version:3,seed:17,currentLevel:3,unlocked:3,graduated:true,completed:['click'],records:{note:'保留'}}));
  const old=await import('../src/state.js?old');assert.equal(old.state.music,false);assert.equal(old.state.currentLevel,0);assert.equal(old.state.graduated,false);assert.equal(old.state.records.note,'保留');assert.deepEqual(old.state.completed,['click']);
  assert.equal(old.visitLevel(1),false);levels[0].tasks.forEach(old.finishTask);assert.equal(old.visitLevel(1),true);
  const before=JSON.stringify(levels.map(l=>l.workshops.map(w=>w.id)));old.persist();
  const reload=await import('../src/state.js?reload');assert.equal(reload.state.currentLevel,1);assert.equal(before,JSON.stringify(levels.map(l=>l.workshops.map(w=>w.id))));
});
