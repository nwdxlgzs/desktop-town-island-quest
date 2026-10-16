import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShadowMotion} from '../src/shadow-motion.js';

test('idle breathing/bobbing reuse shadows; movement, jump and greeting latch until rendered',()=>{
  const tracker=createShadowMotion(),actor=new THREE.Group(),boat=new THREE.Group(),sources=[actor,boat];actor.userData.armR=new THREE.Group();
  assert.equal(tracker.sample(sources),true);tracker.commit(sources);
  for(let i=0;i<20;i++){actor.position.y=Math.sin(i)*.012;boat.position.y=Math.sin(i)*.025;boat.rotation.z=Math.sin(i)*.015;assert.equal(tracker.sample(sources),false);}
  actor.position.x=.06;assert.equal(tracker.sample(sources),true);actor.position.x=.07;assert.equal(tracker.sample(sources),true,'stopped motion remains pending until budget permits refresh');tracker.commit(sources);assert.equal(tracker.sample(sources),false);
  actor.position.x+=.02;assert.equal(tracker.sample(sources),false);actor.position.x+=.025;assert.equal(tracker.sample(sources),true,'small steps accumulate against the rendered pose');tracker.commit(sources);
  actor.position.y+=.3;assert.equal(tracker.sample(sources),true);tracker.commit(sources);actor.userData.armR.rotation.z=2.2;assert.equal(tracker.sample(sources),true);
  tracker.commit(sources);boat.scale.y+=.2;assert.equal(tracker.sample(sources),true,'animated prop scale also refreshes its shadow');
  tracker.reset();tracker.commit(sources);actor.userData.inView=false;actor.position.x+=10;assert.equal(tracker.sample(sources),false);actor.userData.inView=true;assert.equal(tracker.sample(sources),true,'reentering actor uses its latest pose');
  tracker.commit(sources);actor.visible=false;assert.equal(tracker.sample(sources),true,'collecting/hiding a prop erases its old shadow without another moving actor');tracker.commit(sources);assert.equal(tracker.sample(sources),false);actor.visible=true;assert.equal(tracker.sample(sources),true);
});
