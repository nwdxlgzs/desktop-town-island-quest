import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderSize} from '../src/render-size.js';
import {normalizeQuality,createQualityController,migrateQuality,defaultQuality} from '../src/quality.js';

test('120% is the new default and old complete defaults migrate once without replacing custom choices',()=>{
  assert.equal(defaultQuality.resolution,'1.2');assert.equal(createQualityController().profile.pixelRatio,1.2);assert.equal(createQualityController({resolution:'auto'}).profile.pixelRatio,1.2);
  const old={...defaultQuality,version:7,resolution:'1.5'};assert.equal(migrateQuality(old).resolution,'1.2');assert.equal(migrateQuality({...old,showFps:true}).resolution,'1.2');
  for(const custom of [{resolution:'2'},{resolution:'1'},{preset:'low'},{terrainLines:'off'},{shadowQuality:'off'},{adaptive:true}])assert.equal(migrateQuality({...old,...custom}).resolution,custom.resolution||'1.5');
  assert.equal(migrateQuality({...old,version:8}).resolution,'1.5','subsequent manual 150% selections survive reload');
});

test('120% retains its saved selection and produces exactly 120% buffers',()=>{
  const settings=normalizeQuality({resolution:'1.2'}),profile=createQualityController(settings).profile,sizes=[],filters=[];
  const sizer=createRenderSize({setDrawingBufferSize(...args){sizes.push(args);}},{configure(...args){filters.push(args);}});
  sizer.configure(profile,1000,700);assert.equal(normalizeQuality(settings).resolution,'1.2');assert.equal(profile.pixelRatio,1.2);assert.deepEqual(sizes,[[1000,700,1.2]]);
});

test('150% buffers survive effect changes and are resized once per actual dimensions or scale change',()=>{
  const sizes=[],filters=[],sizer=createRenderSize({setDrawingBufferSize(...args){sizes.push(args);}},{configure(...args){filters.push(args);}}),profile={adaptive:false,resolution:'1.5',preset:'auto',pixelRatio:1.5,maxPixels:5000000,antialias:'fxaa'};
  sizer.configure(profile,1000,700);assert.deepEqual(sizes,[[1000,700,1.5]]);
  for(let i=0;i<30;i++)sizer.configure({...profile,waves:!!(i%2),shadowQuality:'baked'},1000,700);
  assert.equal(sizes.length,1);assert.equal(filters.length,1);
  sizer.configure({...profile,antialias:'off'},1000,700);assert.equal(sizes.length,1);assert.equal(filters.at(-1)[0],false);
  sizer.configure({...profile,pixelRatio:1,resolution:'1'},1000,700);assert.equal(sizes.length,2);assert.deepEqual(sizes.at(-1),[1000,700,1]);
  sizer.configure({...profile,adaptive:true,maxPixels:700000},1000,700);assert.equal(sizes.length,2,'same effective size after adaptive cap reuses buffers');
  sizer.configure(profile,1200,700);assert.deepEqual(sizes.at(-1),[1200,700,1.5]);assert.equal(sizer.resizes,3);
});
