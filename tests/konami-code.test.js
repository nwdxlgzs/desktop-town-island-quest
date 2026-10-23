import test from 'node:test';
import assert from 'node:assert/strict';
import {installKonamiCode} from '../src/konami-code.js';

const code=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
function fixture(){
  let handler,activations=0,time=0,enabled=true;
  const target={addEventListener(name,fn,options){assert.equal(name,'keydown');assert.equal(options.capture,true);handler=fn;},removeEventListener(name,fn,capture){assert.equal(fn,handler);assert.equal(capture,true);handler=null;}};
  const dispose=installKonamiCode(target,{activate(){activations++;},enabled:()=>enabled,now:()=>time});
  return {send(keys,extra={}){for(const key of keys)handler?.({key,...extra});},get activations(){return activations;},set enabled(value){enabled=value;},delay(ms){time+=ms;},dispose};
}
test('classic sequence activates once per complete entry, handles uppercase BA and overlapping up presses',()=>{
  const f=fixture();f.send(['ArrowUp',...code.slice(0,8),'B','A']);assert.equal(f.activations,1);f.send(['a']);assert.equal(f.activations,1);f.send(code);assert.equal(f.activations,2);f.dispose();f.send(code);assert.equal(f.activations,2);
});
test('typing, modified keys, composition, stale fragments and disabled sessions never activate',()=>{
  for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{target:{isContentEditable:true}},{target:{closest:()=>({})}}]){
    const f=fixture();f.send(code.slice(0,4));f.send(['ArrowLeft'],extra);f.send(code.slice(5));assert.equal(f.activations,0);f.send(code,extra);assert.equal(f.activations,0);f.send(code);assert.equal(f.activations,1);
  }
  const f=fixture();f.send(code.slice(0,4));f.delay(5001);f.send(code.slice(4));assert.equal(f.activations,0);f.enabled=false;f.send(code);assert.equal(f.activations,0);f.enabled=true;f.send(code);assert.equal(f.activations,1);
});
test('held key autorepeat does not supply missing presses or disturb a correct sequence',()=>{
  const f=fixture();f.send(['ArrowUp']);f.send(['ArrowUp'],{repeat:true});f.send(code.slice(2));assert.equal(f.activations,0);for(const key of code){f.send([key]);f.send([key],{repeat:true});}assert.equal(f.activations,1);
});

test('the activating A key is consumed so it cannot start moving the character',()=>{
  const f=fixture();let prevented=0,stopped=0;f.send(code.slice(0,-1),{preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(prevented,0);assert.equal(stopped,0);
  f.send(['a'],{preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(f.activations,1);assert.equal(prevented,1);assert.equal(stopped,1);
});
