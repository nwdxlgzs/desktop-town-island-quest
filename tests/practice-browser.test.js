import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeBrowser} from '../src/practice-browser.js';
import {calendarConflict} from '../src/calendar-exercise.js';
import {tasks,taskIds} from '../src/curriculum.js';
import {exerciseSteps} from '../src/exercise-guide.js';

test('browser input distinguishes addresses, searches local content and keeps independent tab history',()=>{
  const browser=createPracticeBrowser({address:'https://learn.school.test/ai',query:'AI查证'});
  assert.equal(browser.go('https://learn.school.test/ai/').type,'site');
  browser.go('AI查证');assert.equal(browser.view().type,'results');assert.equal(browser.results('ai查证').length,3);
  const homeTab=browser.active;browser.open('source',true);assert.equal(browser.active,homeTab);assert.equal(browser.tabs.length,2);
  const second=browser.tabs[1].id;browser.activate(second);assert.equal(browser.view().record,'source');browser.go('town://start');browser.travel(-1);assert.equal(browser.view().record,'source');
  browser.activate(homeTab);assert.equal(browser.view().type,'results');browser.open('discussion');browser.travel(-1);assert.equal(browser.view().type,'results');browser.travel(1);assert.equal(browser.view().record,'discussion');
  browser.go('https://example.test/unknown');assert.equal(browser.view().type,'unknown');browser.travel(-1);assert.equal(browser.view().record,'discussion');
  browser.close(homeTab);assert.equal(browser.active,second);browser.close(second);assert.equal(browser.tabs.length,1);assert.equal(browser.view().type,'home');
});

test('calendar preserves adjacent slots and detects actual overlapping intervals',()=>{
  const events=[{id:'old',date:'2026-10-14',start:'13:00',end:'14:00'}];
  assert.equal(calendarConflict({date:'2026-10-14',start:'14:00',end:'14:30'},events),false);
  assert.equal(calendarConflict({date:'2026-10-14',start:'13:30',end:'14:30'},events),true);
  assert.equal(calendarConflict({date:'2026-10-15',start:'13:30',end:'14:30'},events),false);
  assert.equal(calendarConflict({...events[0],start:'13:15'},events),false,'editing an event does not conflict with itself');
});

test('new application operations have real course assignments and complete data-driven guidance',()=>{
  const kinds=['browser','browser-tabs','browser-bookmark','browser-find','browser-download','sheet-sort','sheet-filter','sheet-chart','mail-reply','calendar'];
  for(const kind of kinds){const ids=taskIds.filter(id=>tasks[id].kind===kind);assert.ok(ids.length>=3,kind);for(const id of ids){const task=tasks[id],p=task.params,steps=exerciseSteps(task);assert.equal(steps.length,3,id);assert.ok(!/\{\w+\}|undefined/.test(JSON.stringify(steps)),id);if(kind.startsWith('browser')){assert.ok(p.targetIds.every(target=>p.pages.some(page=>page.id===target)),id);const browser=createPracticeBrowser(p);assert.ok(browser.results(p.query).some(page=>p.targetIds.includes(page.id)),id);if(kind==='browser-find')assert.ok(p.pages.find(page=>page.id===p.targetIds[0]).body.split(p.find).length>=3,id);}
    if(kind.startsWith('sheet-')){assert.equal(p.rows.length,5);assert.equal(new Set(p.rows.map(row=>row.id)).size,5);assert.ok(p.rows.every(row=>row.label&&Number.isFinite(row.value)),id);}
  }}
  assert.equal(new Set(taskIds.map(id=>tasks[id].kind)).size,40);assert.equal(taskIds.length,243);
});
