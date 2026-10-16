import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotion,startJump,tickMotion,visualJump,runSpeed,walkSpeed} from '../src/motion.js';
import {createQualityController,normalizeQuality,migrateQuality} from '../src/quality.js';

test('jump remains a visual offset and running remains faster than walking',()=>{
  const m=createMotion();assert.ok(runSpeed>walkSpeed);assert.equal(startJump(m),true);assert.equal(startJump(m),false);
  tickMotion(m,.34);assert.ok(visualJump(m)>.8);tickMotion(m,.35);assert.equal(visualJump(m),0);assert.equal(startJump(m),true);
});
test('mild pressure sheds waves first, severe stalls degrade promptly, and manual quality persists',()=>{
  const stages=[],q=createQualityController({adaptive:true,resolution:'1.5',maxFps:30,waves:true,shadows:true,antialias:'fxaa'},p=>stages.push(p));assert.equal(q.profile.pixelRatio,1.5);
  for(let i=0;i<120;i++)q.observe(50,24,.05);
  assert.equal(stages[0].stage,1);assert.equal(stages[0].waves,false);assert.equal(stages[0].pixelRatio,1.5);assert.equal(stages[0].shadowQuality,'cached');
  for(let i=0;i<60;i++)q.observe(120,65,.12);
  assert.equal(q.profile.stage,4);assert.equal(q.profile.shadows,false);assert.equal(q.profile.npcMovement,false);assert.equal(q.profile.antialias,'fxaa');
  for(let i=0;i<1600;i++)q.observe(33,4,.033,q.profile.fps,4);assert.ok(q.profile.stage<4);
  q.configure({resolution:'2',adaptive:false,waves:false,shadows:true});for(let i=0;i<200;i++)q.observe(100,60,.1);assert.equal(q.profile.pixelRatio,2);assert.equal(q.profile.stage,0);assert.equal(q.profile.waves,false);assert.equal(normalizeQuality(null).resolution,'1.2');
});
test('low preset works immediately, hardware bootstrap is conservative, and idle cadence is not a stall',()=>{
  const low=createQualityController({preset:'low',adaptive:false});assert.equal(low.profile.stage,3);assert.equal(low.profile.shadows,false);assert.equal(low.profile.waves,false);assert.equal(low.profile.particles,0);assert.equal(low.profile.npcMovement,false);
  const weak=createQualityController({adaptive:true},()=>{},{cores:2,memory:2});assert.equal(weak.profile.stage,2);
  const manual=createQualityController({resolution:'2',adaptive:false},()=>{},{cores:2});assert.equal(manual.profile.pixelRatio,2);
  const idle=createQualityController();for(let i=0;i<400;i++)idle.observe(1000/15,3,1/15,15);assert.equal(idle.profile.stage,0);
  low.configure({preset:'auto',adaptive:false});assert.equal(low.profile.stage,0);
});
test('fresh auto settings retain 120%, 30 FPS, static soft 1024 shadows and environment at sustained low FPS',()=>{
  const settings=normalizeQuality();assert.equal(settings.preset,'auto');assert.equal(settings.resolution,'1.2');assert.equal(settings.maxFps,30);assert.equal(settings.shadows,true);assert.equal(settings.shadowQuality,'baked-high');assert.equal(settings.waves,true);assert.equal(settings.weather,true);assert.equal(settings.antialias,'off');assert.equal(settings.adaptive,false);assert.equal(settings.npcMovement,true);assert.equal(createQualityController({},()=>{},{cores:2,memory:2}).profile.pixelRatio,1.2);
  const q=createQualityController();for(let i=0;i<80;i++)q.observe(150,120,.15);assert.equal(q.profile.stage,0);assert.equal(q.profile.contactShadows,true);assert.equal(q.profile.bakedShadows,false);assert.equal(q.profile.shadows,true);assert.equal(q.profile.fixedShadows,true);assert.equal(q.profile.softShadows,true);assert.equal(q.profile.shadowSize,1024);assert.equal(q.profile.shadowInterval,Infinity);
  assert.equal(q.profile.adaptive,false);const auto=createQualityController();for(let i=0;i<80;i++)auto.observe(150,1.2,.15);assert.equal(auto.profile.stage,0);assert.equal(auto.profile.waves,true);assert.equal(auto.profile.npcMovement,true);
  const old=migrateQuality({version:2,shadows:false,waves:false,weather:false,antialias:'off',adaptive:false,resolution:'.75'});assert.equal(old.shadows,false);assert.equal(old.waves,false);assert.equal(old.resolution,'.75');assert.equal(old.adaptive,false);assert.equal(old.antialias,'off');
  const manual=normalizeQuality({...old,shadowQuality:'high',waves:true,antialias:'fxaa',maxFps:24});assert.deepEqual(migrateQuality(manual),manual);
});
test('shadow levels retain a baked fallback under pressure, and FPS is an explicit saved opt-in',()=>{
  const q=createQualityController({adaptive:true,shadowQuality:'high',showFps:true});assert.equal(q.profile.shadowQuality,'high');assert.equal(q.profile.shadowSize,1024);assert.equal(q.profile.showFps,true);
  for(let i=0;i<20;i++)q.observe(120,65,.12);
  assert.equal(q.profile.shadowQuality,'baked-contact');assert.equal(q.profile.shadows,false);assert.equal(q.settings.shadowQuality,'high');assert.equal(q.profile.bakedShadows,true);
  assert.equal(normalizeQuality().showFps,false);assert.equal(normalizeQuality({shadows:true}).shadowQuality,'low');
  assert.equal(normalizeQuality({shadowQuality:'baked'}).shadowQuality,'baked');assert.equal(normalizeQuality({shadowQuality:'invalid'}).shadowQuality,'baked-high');assert.equal(createQualityController({shadowQuality:'baked'}).profile.contactShadows,false);
});

test('the old complete default preset migrates once while customized choices survive',()=>{
  const old={version:3,preset:'auto',resolution:'auto',antialias:'fxaa',maxFps:60,adaptive:true,shadowQuality:'high',showFps:true,terrainLines:'off'};
  const migrated=migrateQuality(old);assert.equal(migrated.version,8);assert.equal(migrated.resolution,'1.2');assert.equal(migrated.antialias,'off');assert.equal(migrated.maxFps,30);assert.equal(migrated.adaptive,false);assert.equal(migrated.shadowQuality,'baked-high');assert.equal(migrated.showFps,true);assert.equal(migrated.terrainLines,'off');
  const custom={...old,resolution:'2'};assert.deepEqual(migrateQuality(custom),normalizeQuality(custom));assert.deepEqual(migrateQuality({...old,version:4}),normalizeQuality({...old,version:4}));
});

test('previous default shadows upgrade once, with custom and later choices preserved',()=>{
  const old={...normalizeQuality(),version:4,resolution:'1.5',adaptive:false,shadowQuality:'baked-contact',showFps:true,terrainLines:'off'};
  const upgraded=migrateQuality(old);assert.equal(upgraded.shadowQuality,'baked-high');assert.equal(upgraded.version,8);assert.equal(upgraded.adaptive,false);assert.equal(upgraded.showFps,true);assert.equal(upgraded.terrainLines,'off');
  assert.equal(migrateQuality({...old,resolution:'1'}).shadowQuality,'baked-contact');
  assert.equal(migrateQuality({...old,shadowQuality:'off'}).shadowQuality,'off');
  assert.equal(migrateQuality({...old,version:5}).shadowQuality,'baked-contact');
  const q=createQualityController({adaptive:true,shadowQuality:'baked-high'});
  for(let i=0;i<120;i++)q.observe(50,24,.05);
  assert.equal(q.profile.stage,1);assert.equal(q.profile.shadowQuality,'baked-high');assert.equal(q.profile.shadowInterval,Infinity);
  for(let i=0;i<30;i++)q.observe(120,65,.12);
  assert.equal(q.profile.shadowQuality,'baked-contact');assert.equal(q.profile.shadows,false);assert.equal(q.settings.shadowQuality,'baked-high');
});
