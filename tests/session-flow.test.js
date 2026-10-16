import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionFlow,useSessionStep,cancelSession,dropSessionStep } from '../src/session-flow.js';

function fixture(){
  const body={},node={tagName:'SPAN',className:'sponsor-credit',attributes:{length:2},hasAttribute:()=>true,childNodes:[{}],firstChild:{nodeType:3},textContent:'PoweredBy@nwdxlgzs赞助提供此游戏化教具'},source={isConnected:true,parentNode:body,content:{childElementCount:1,firstElementChild:node}};
  const doc={body,documentElement:{hasAttribute:()=>false},querySelectorAll:()=>[source]};return {doc,node,source};
}
test('flow receipts are operation-bound, single-use and cannot be replaced with true',()=>{
  const {doc}=fixture(),issue=createSessionFlow(()=>{},doc,null);
  assert.equal(useSessionStep(true,2,'task'),false);assert.equal(useSessionStep({},2,'task'),false);assert.equal(useSessionStep(undefined,2,'task'),false);
  const ticket=issue(2,'task');assert.equal(useSessionStep(ticket,2,'task'),true);assert.equal(useSessionStep(ticket,2,'task'),false);
  const wrong=issue(2,'other');assert.equal(useSessionStep(wrong,2,'task'),false);assert.equal(issue(2,'task'),null,'failure stays latched');
});
test('no-op shutdown cannot authorize XP/arrival after editing or deleting the credit',()=>{
  for(const change of ['edit','remove']){
    const {doc,node,source}=fixture();let notices=0;const issue=createSessionFlow(()=>notices++,doc,null),task=issue(2,'task'),arrival=issue(5,1);
    if(change==='edit')node.textContent='changed';else source.isConnected=false;
    assert.equal(useSessionStep(task,2,'task'),false);assert.equal(useSessionStep(arrival,5,1),false);assert.equal(issue(1,'task'),null);assert.equal(notices,1);
  }
});
test('closing a task revokes its callback; session cancellation survives restoring text',()=>{
  const {doc}=fixture(),issue=createSessionFlow(()=>{},doc,null),old=issue(2,'task');dropSessionStep(old);
  assert.equal(useSessionStep(old,2,'task'),false);assert.equal(useSessionStep(issue(2,'task'),2,'task'),true);
  const live=issue(5,1);cancelSession(issue);assert.equal(useSessionStep(live,5,1),false);assert.equal(issue(0,7),null);
});
test('missing or emptied credit template fails closed without throwing',()=>{
  for(const content of [undefined,{childElementCount:0,firstElementChild:null}]){
    const {doc,source}=fixture();let notices=0;const issue=createSessionFlow(()=>notices++,doc,null),ticket=issue(2,'task');
    source.content=content;
    assert.equal(useSessionStep(ticket,2,'task'),false);assert.equal(issue(0,7),null);assert.equal(notices,1);
  }
});
