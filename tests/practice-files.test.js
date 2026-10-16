import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeFiles} from '../src/practice-files.js';
import {exerciseSteps} from '../src/exercise-guide.js';
import {tasks,taskIds} from '../src/curriculum.js';

test('folders exist immediately, rename safely and contain genuinely moved files',()=>{
  const fs=createPracticeFiles(['核查.txt','草稿.tmp','来源.pdf']),a=fs.folder('root'),b=fs.folder('root');
  assert.equal(a.name,'新建文件夹');assert.equal(b.name,'新建文件夹 (2)');assert.deepEqual(fs.list(a.id),[]);
  assert.ok(fs.rename(a.id,'bad/name'));assert.equal(a.name,'新建文件夹');
  assert.equal(fs.rename(a.id,'核查资料'),null);assert.ok(fs.rename(b.id,'核查资料'));
  assert.equal(fs.transfer(['file-0','file-2'],a.id),null);
  assert.deepEqual(fs.list('root').filter(e=>e.type==='file').map(e=>e.name),['草稿.tmp']);
  assert.equal(fs.matches('核查资料',[0,2]),true);assert.equal(fs.matches('核查资料',[0,2],true),false);
  assert.equal(fs.rename('file-2','来源说明.pdf'),null);assert.equal(fs.matches('核查资料',[0,2]),true,'selection tracks identities after rename');
});

test('copy preserves originals; failed batches do not overwrite or partly move files',()=>{
  const fs=createPracticeFiles(['数据.csv','备注.txt','截图.png']),dest=fs.folder('root');fs.rename(dest.id,'备份');
  assert.equal(fs.transfer(['file-0','file-2'],dest.id,true),null);assert.equal(fs.list('root').filter(e=>e.type==='file').length,3);assert.equal(fs.matches('备份',[0,2],true),true);
  const before=JSON.stringify([...fs.entries]);assert.ok(fs.transfer(['file-1','file-0'],dest.id));assert.equal(JSON.stringify([...fs.entries]),before);
  assert.ok(fs.transfer([dest.id],dest.id));assert.ok(fs.transfer(['file-0'],'missing'));assert.equal(JSON.stringify([...fs.entries]),before);
  assert.equal(fs.matches('备份',[0,1],true),false);assert.equal(fs.transfer(['file-1'],dest.id,true),null);assert.equal(fs.matches('备份',[0,2],true),false,'extra files must be corrected');
});

test('all course exercises have specific, resolved guidance and file tasks teach real transfers',()=>{
  const kinds=new Set();
  for(const id of taskIds){const task=tasks[id],steps=exerciseSteps(task);kinds.add(task.kind);assert.ok(steps.length>0,id);assert.ok(task.context,id+' has a scenario');
    for(const step of steps){assert.ok(step.label&&step.help,id);assert.ok(!/undefined|\{\w+\}/.test(step.label+step.help),id);}
    if(task.kind==='files'){assert.ok(['move','copy'].includes(task.params.operation));assert.ok(task.params.targets.every(i=>Number.isInteger(i)&&task.params.files[i]));assert.ok(!task.params.folder.includes('资料资料'));assert.ok(!/双击.{0,5}归档/.test(task.instruction+task.objective));}
  }
  assert.ok(kinds.size>=31);assert.equal(taskIds.length,243);
  const operations=new Set(taskIds.filter(id=>tasks[id].kind==='files').map(id=>tasks[id].params.operation));assert.deepEqual(operations,new Set(['move','copy']));
});
