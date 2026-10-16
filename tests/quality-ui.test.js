import test from 'node:test';
import assert from 'node:assert/strict';
import {showQuality} from '../src/quality-ui.js';
import {normalizeQuality,migrateQuality} from '../src/quality.js';

test('two-mode migration undoes forced v6 adaptation while preserving visual preferences and low selections',()=>{
  const old={version:5,preset:'auto',adaptive:false,resolution:'2',antialias:'fxaa',shadowQuality:'off',waves:false,npcMovement:false,maxFps:24,terrainLines:'off',showFps:true};
  const next=migrateQuality(old);assert.equal(next.version,8);assert.equal(next.preset,'auto');assert.equal(next.adaptive,false);
  for(const key of ['resolution','antialias','shadowQuality','waves','npcMovement','maxFps','terrainLines','showFps'])assert.equal(next[key],old[key]);
  assert.equal(migrateQuality({...old,preset:'low'}).preset,'low');assert.equal(migrateQuality({...old,preset:'low'}).adaptive,false);
  assert.equal(migrateQuality({...old,version:6,adaptive:true}).adaptive,false,'undo the forced v6 default once');
  assert.equal(migrateQuality({...old,version:6,preset:'fixed'}).preset,'auto');
  assert.equal(migrateQuality({...old,version:6,preset:'low',adaptive:true}).adaptive,true,'explicit low preferences survive');
  assert.equal(migrateQuality({...next,adaptive:true}).adaptive,true,'new opt-in survives future loads');
  assert.equal(migrateQuality({preset:'auto',adaptive:false}).adaptive,false);
});

test('only two modes, independent automatic relief and 120% resolution save and close correctly',()=>{
  const original=globalThis.document,state={quality:normalizeQuality()},fields=new Map();let html='',saved=0,closed=0,applied;
  const field=(id,value)=>{const item=new EventTarget();Object.assign(item,typeof value==='boolean'?{checked:value}:{value:String(value)});fields.set(id,item);return item;};
  const preset=field('#quality-preset','auto'),adaptive=field('#quality-adaptive',false);
  for(const [id,value]of [['#render-resolution','1.5'],['#quality-antialias','off'],['#quality-terrain-lines',true],['#quality-fps',30],['#quality-npcs',true],['#quality-waves',true],['#quality-shadow-level','baked-high'],['#quality-show-fps',false],['#quality-weather',true]])field(id,value);
  const form=new EventTarget();form.querySelector=id=>fields.get(id);globalThis.document={querySelector:()=>form,createElementNS:()=>({setAttribute(){},appendChild(){},outerHTML:'<svg></svg>'})};
  try{
    showQuality({state,world:{getQuality:()=>({pixelRatio:1.5,stage:0,shadowQuality:'baked-high'}),setQuality(value){applied=value;}},persist(){saved++;},closeModal(){closed++;},showModal(value){html=value;}});
    const options=html.match(/id="quality-preset"[\s\S]*?<\/select>/)[0];assert.equal((options.match(/<option /g)||[]).length,2);assert.doesNotMatch(options,/fixed/);assert.match(html,/120%/);
    preset.value='low';preset.dispatchEvent(new Event('change'));assert.equal(adaptive.checked,false);
    preset.value='auto';preset.dispatchEvent(new Event('change'));assert.equal(adaptive.checked,false);
    adaptive.checked=true;adaptive.dispatchEvent(new Event('change'));assert.equal(preset.value,'auto');
    adaptive.checked=false;adaptive.dispatchEvent(new Event('change'));assert.equal(preset.value,'auto');fields.get('#render-resolution').value='1.2';
    form.dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(saved,1);assert.equal(closed,1);assert.equal(applied,state.quality);assert.equal(applied.preset,'auto');assert.equal(applied.adaptive,false);assert.equal(applied.resolution,'1.2');
    assert.equal(migrateQuality(applied).resolution,'1.2');
    preset.value='low';preset.dispatchEvent(new Event('change'));assert.equal(adaptive.checked,false);
    form.dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(applied.preset,'low');
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
