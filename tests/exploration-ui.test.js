import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationUI} from '../src/exploration-ui.js';

test('find-shard button delegates nearby selection, then visits the beacon only after collection',()=>{
  const calls=[],state={exploration:{shards:[],restored:[]}},layout={level:{id:'fixed'},exploration:[{id:'s1',type:'shard'},{id:'s2',type:'shard'},{id:'lamp',type:'beacon'}]};
  const ui=createExplorationUI({state,getLayout:()=>layout,getWorld:()=>({exploreNearest:(...args)=>calls.push(structuredClone(args))})});
  ui.next();state.exploration.shards.push('s1');ui.next();state.exploration.shards.push('s2');ui.next();
  assert.deepEqual(calls,[['shard',[]],['shard',['s1']],['beacon',['s1','s2']]]);
});
