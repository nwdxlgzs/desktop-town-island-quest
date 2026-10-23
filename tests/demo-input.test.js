import test from 'node:test';
import assert from 'node:assert/strict';
import {demoInput} from '../src/demo-input.js';
import {demoActions} from '../src/demo-actions.js';
import {tasks,taskIds} from '../src/curriculum.js';

test('demonstrations identify real buttons, held drags, typing, and combined keys',()=>{
  assert.deepEqual(demoInput({type:'key',key:'Tab',shiftKey:true}).keys,['Shift','Tab']);
  assert.deepEqual(demoInput({type:'key',key:'s',ctrlKey:true}).keys,['Ctrl','S']);
  assert.deepEqual(demoInput({type:'paste'}).keys,['Ctrl','V']);
  assert.deepEqual(demoInput({type:'paste'}).heldKeys,['Ctrl']);assert.match(demoInput({type:'paste'}).label,/先按住 Ctrl/);
  assert.deepEqual(demoInput({type:'key',key:'Tab',shiftKey:true}).heldKeys,['Shift']);
  assert.deepEqual(demoInput({type:'click',ctrlKey:true}).heldKeys,['Ctrl']);
  assert.deepEqual(demoInput({type:'repair'}).keys,['Backspace']);
  assert.equal(demoInput({type:'context'}).mouse,'right');assert.equal(demoInput({type:'middle'}).mouse,'middle');
  assert.equal(demoInput({type:'scroll'}).mouse,'wheel');assert.equal(demoInput({type:'double'}).double,true);
  assert.equal(demoInput({type:'selectText'}).hold,true);assert.equal(demoInput({type:'pointerDrag'}).mouse,'left');
  assert.deepEqual(demoInput({type:'click',ctrlKey:true}).keys,['Ctrl']);
  assert.deepEqual(demoInput({type:'systemCapture'},'Linux x86_64').keys,['Ctrl','Alt','A']);
  assert.deepEqual(demoInput({type:'systemCapture'},'MacIntel').keys,['⌘','Control','Shift','4']);
  assert.deepEqual(demoInput({type:'systemCapture'},'Win32').keys,['Win','Shift','S']);
  for(const id of taskIds)for(const action of demoActions(tasks[id])){const cue=demoInput(action);assert.ok(cue.label,id);assert.ok(cue.keys.length||cue.mouse,id);}
});
