import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameMeter} from '../src/frame-meter.js';

test('FPS distinguishes movement target from actual throughput and JS submission time without extra rendering',()=>{
  const original=globalThis.document,element={hidden:false,setAttribute(){},remove(){}};globalThis.document={createElement:()=>element};
  try{
    const meter=createFrameMeter({append(){}});meter.frame(1.2,30);meter.sample(performance.now()+2000);assert.equal(element.hidden,true);
    meter.setEnabled(true);const start=performance.now();for(let i=0;i<12;i++)meter.frame(1.2,30);meter.sample(start+1001);
    assert.equal(element.textContent,'12/30 FPS · JS 提交 1.2 ms · 峰值 1.2 ms');assert.ok(meter.fps>11&&meter.fps<13);
    for(let i=0;i<12;i++)meter.frame(1.2,12);meter.sample(start+2002);assert.equal(element.textContent,'12/12 FPS · JS 提交 1.2 ms · 峰值 1.2 ms');
    meter.sample(start+3003,true);assert.equal(element.textContent,'已暂停');assert.equal(meter.fps,0);
    meter.sample(start+4004);assert.equal(element.textContent,'0 FPS · 静止待机');
    for(let i=0;i<12;i++)meter.frame(1.2,30,28);meter.sample(start+5005);assert.equal(element.textContent,'12/30 FPS · JS 提交 1.2 ms · 峰值 1.2 ms · GPU 28.0 ms');
    for(let i=0;i<29;i++)meter.frame(1,30);meter.frame(110,30);meter.sample(start+6006);assert.match(element.textContent,/JS 提交 4\.6 ms · 峰值 110\.0 ms/,'a single stall must remain visible despite the cheap mean');
    meter.setEnabled(false);assert.equal(element.hidden,true);meter.dispose();
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
