import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCourse,validateCourse,readCourse,resolveCourse,courseFingerprint} from '../src/course-config.js';
import {questionTemplates,newTaskVariant} from '../src/teacher/catalog.js';
import {createJourney} from '../src/journey.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function small(){const c=clone(defaultCourse);c.missions=c.missions.slice(0,1);c.variants={};c.missions[0].tasks=['a','b','c'];for(const id of c.missions[0].tasks)c.variants[id]={base:'click'};return c;}

test('default course and all 40 independent teacher templates validate and resolve',()=>{
  assert.deepEqual(validateCourse(defaultCourse).errors,[]);
  assert.equal(questionTemplates.length,40);assert.equal(new Set(questionTemplates.map(t=>t.task.kind)).size,40);
  const c=small();c.missions[0].tasks=questionTemplates.map((t,i)=>{const id=`question-${i}`;c.variants[id]=newTaskVariant(t);return id;});
  assert.deepEqual(validateCourse(c).errors,[]);
  const resolved=resolveCourse(readCourse(JSON.stringify(c)));
  for(const [i,t]of questionTemplates.entries()){assert.equal(resolved[`question-${i}`].kind,t.task.kind);assert.deepEqual(resolved[`question-${i}`].params,t.task.params);}
});

test('a three-question course creates a playable single island and retains teacher instructions',()=>{
  const c=small();c.variants.a.instruction='教师设计的题干';
  assert.deepEqual(validateCourse(c).errors,[]);const route=createJourney(c,7);
  assert.equal(route.length,1);assert.equal(route[0].tasks.length,3);assert.equal(resolveCourse(c).a.instruction,'教师设计的题干');
  assert.equal(courseFingerprint(clone(c)),courseFingerprint(c));c.variants.a.title='新题目';assert.notEqual(courseFingerprint(c),courseFingerprint(defaultCourse));
});

test('bad references, cycles, duplicate tasks, material targets and reversed ranges are rejected',()=>{
  const invalid=change=>{const c=small();change(c);assert.ok(validateCourse(c).errors.length,JSON.stringify(c.variants));assert.throws(()=>readCourse(JSON.stringify(c)));};
  invalid(c=>c.variants.a.base='missing');invalid(c=>{c.variants.a.base='b';c.variants.b.base='a';});
  invalid(c=>c.missions[0].tasks[1]='a');invalid(c=>c.missions[0].tasks[1]='missing');
  invalid(c=>c.variants.a={base:'files',params:{files:['文件.txt'],targets:[4],folder:'归档',operation:'copy'}});
  invalid(c=>c.islands.workshopCount=[5,2]);invalid(c=>c.missions[0].tasks.pop());
  invalid(c=>c.variants.a={base:'typing',params:{expected:''}});
  invalid(c=>c.variants.a={base:'typing',params:{expected:34}});
  invalid(c=>c.variants.a={base:'files',params:{files:['文件.txt'],targets:[0],folder:'bad/name',operation:'move'}});
  invalid(c=>{const t=questionTemplates.find(t=>t.task.kind==='calendar');c.variants.a=newTaskVariant(t);c.variants.a.params.end='08:00';});
  invalid(c=>{const t=questionTemplates.find(t=>t.task.kind==='sheet');c.variants.a=newTaskVariant(t);c.variants.a.params.items.pop();});
  assert.throws(()=>readCourse('{broken'));assert.throws(()=>readCourse(' '.repeat(2*1024*1024+1)));
});
