import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeFiles} from '../src/practice-files.js';
import {exerciseSteps} from '../src/exercise-guide.js';
import {tasks,taskIds} from '../src/curriculum.js';
import {taskTeaching,exerciseKindNames} from '../src/exercise-teaching.js';
import {demoActions} from '../src/demo-actions.js';

test('every course question has a complete tutorial with resolved task material',()=>{
  const kinds=new Set(taskIds.map(id=>tasks[id].kind));assert.equal(kinds.size,40);assert.deepEqual(new Set(Object.keys(exerciseKindNames)),kinds);
  for(const id of taskIds){const lesson=taskTeaching(tasks[id]);assert.ok(lesson.name,id);assert.ok(lesson.steps.length>=2,id);for(const step of lesson.steps){assert.ok(step.label&&step.help,id);assert.doesNotMatch(step.help+step.label,/undefined|\{\w+\}/,id);}const actions=demoActions(tasks[id]);assert.ok(actions.length>0,id);assert.ok(actions.every(action=>action.target&&action.label),id);}
  for(const id of taskIds.filter(id=>tasks[id].kind==='files')){const lesson=taskTeaching(tasks[id]),text=lesson.steps.map(s=>s.help).join(' ');assert.ok(text.includes(tasks[id].params.folder));for(const i of tasks[id].params.targets)assert.ok(text.includes(tasks[id].params.files[i]));assert.match(text,/Ctrl/);}
});

test('deleting originals or moving them in backup questions explains reset; deleting copies is recoverable',()=>{
  const fs=createPracticeFiles(['清单.txt','草稿.tmp','数据.csv']),folder=fs.folder('root');fs.rename(folder.id,'备份');
  assert.equal(fs.completionIssue([0,2],true),null);
  fs.transfer(['file-0'],folder.id);assert.equal(fs.completionIssue([0,2],true).kind,'moved-original');
  assert.equal(fs.completionIssue([0,2]),null,'move questions allow moving originals');
  fs.transfer(['file-0'],'root');assert.equal(fs.completionIssue([0,2],true),null);
  fs.transfer(['file-0','file-2'],folder.id,true);const copies=fs.list(folder.id).map(e=>e.id);fs.remove([copies[0]]);assert.equal(fs.completionIssue([0,2],true),null);
  fs.remove(['file-0']);assert.equal(fs.completionIssue([0,2],true).kind,'deleted-original');assert.equal(fs.matches('备份',[0,2],true),false);
});

test('recursive deletion removes folder contents, and other originals must remain in the source area',()=>{
  const fs=createPracticeFiles(['目标.txt','保留.txt']),folder=fs.folder('root');fs.rename(folder.id,'归档');fs.transfer(['file-0','file-1'],folder.id);
  fs.transfer(['file-1'],'root');assert.equal(fs.matches('归档',[0]),true);
  const other=fs.folder('root');fs.transfer(['file-1'],other.id);assert.equal(fs.matches('归档',[0]),false,'unlisted originals must stay at root');
  fs.remove([other.id]);assert.match(fs.completionIssue([0]).message,/保留.txt/);
  fs.remove([folder.id]);assert.equal(fs.entries.has(folder.id),false);assert.equal(fs.entries.has('file-0'),false);assert.equal(fs.entries.has('root'),true);
});

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

test('folder transfers recurse, preserve original identities, and reject cycles atomically',()=>{
  const fs=createPracticeFiles(['来源.txt','保留.csv']),a=fs.folder('root'),b=fs.folder(a.id),dest=fs.folder('root');
  fs.rename(a.id,'素材');fs.rename(b.id,'子目录');fs.rename(dest.id,'目标');fs.transfer(['file-0'],b.id);
  const before=JSON.stringify([...fs.entries]);
  assert.ok(fs.transfer([a.id],b.id));assert.ok(fs.transfer([a.id],a.id,true));assert.equal(JSON.stringify([...fs.entries]),before);
  assert.equal(fs.transfer([a.id,b.id,'file-0'],dest.id,true),null);
  const copied=fs.list(dest.id);assert.equal(copied.length,1);assert.equal(copied[0].name,'素材');
  const nested=fs.list(copied[0].id)[0],file=fs.list(nested.id)[0];assert.equal(file.name,'来源.txt');assert.equal(file.source,'file-0');assert.notEqual(file.id,'file-0');
  assert.equal(fs.entries.get('file-0').parent,b.id);
  assert.equal(fs.transfer([b.id],'root'),null);assert.equal(fs.entries.get('file-0').parent,b.id);
  assert.equal(fs.list(a.id).length,0);
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
