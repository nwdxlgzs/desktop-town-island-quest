import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { workshopDesigns,workshopArchitecture,workshopApplication,chooseWorkshopDesign } from '../src/workshop-designs.js';
import { workshopObstacles,createLayout,blockedAt } from '../src/level-layout.js';
import { levels,stations } from '../src/curriculum.js';
import { findPath,clearSegment } from '../src/navigation.js';
import { canWalkSegment } from '../src/terrain.js';
import { workshopAt } from '../src/interactions.js';

const styles=Object.keys(workshopDesigns);
const sample=design=>({...stations[0],theme:stations[0].id,design,position:[0,0],approach:[0,3.3]});

test('all banner text clears actual voxel geometry in the main view and while inspecting',()=>{
  const signatures=new Set();
  for(const design of styles){
    const recipe=workshopArchitecture(sample(design)),s=recipe.sign;
    assert.ok(s.y-s.width/8>recipe.roofTop+.15,`${design}: whole banner clears the roof`);
    assert.ok(recipe.parts.length<45,`${design}: bounded static voxel budget`);
    signatures.add(JSON.stringify(recipe.parts.map(p=>[p.x,p.y,p.z,p.w,p.h,p.d])));
    const boxes=recipe.parts.map(p=>new THREE.Box3(new THREE.Vector3(p.x-p.w/2,p.y-p.h/2,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,p.y+p.h/2,p.z+p.d/2)));
    for(const p of recipe.parts){
      for(const key of ['x','y','z','w','h','d'])assert.ok(Number.isFinite(p[key]),`${design}: finite ${key}`);
      assert.ok(p.w>0&&p.h>0&&p.d>0);
      assert.ok(Math.abs(p.x)+p.w/2<=3.5,`${design}: fits reserved width`);
      assert.ok(p.z-p.d/2>=-3.4&&p.z+p.d/2<=4.2,`${design}: fits reserved depth`);
    }
    for(const yaw of [-Math.PI,-Math.PI/2,0,Math.PI/2]){
      const direction=new THREE.Vector3(18*Math.cos(yaw)+30*Math.sin(yaw),25,30*Math.cos(yaw)-18*Math.sin(yaw)).normalize();
      for(const dx of [-.5,-.25,0,.25,.5])for(const dy of [-.5,0,.5]){
        const ray=new THREE.Ray(new THREE.Vector3(s.x+s.width*dx,s.y+s.width/4*dy,s.z),direction);
        assert.ok(boxes.every(box=>!ray.intersectsBox(box)),`${design}: text sightline clear at ${yaw}, ${dx}, ${dy}`);
      }
    }
    assert.equal(recipe.marker.y,s.y+s.width/8,'DOM button anchors to the top edge');
  }
  assert.equal(signatures.size,styles.length,'each exterior has a distinct shape');
});

test('new solids block walking while the front work area, long table and NPC lane remain reachable',()=>{
  for(const design of styles){
    const station=sample(design),recipe=workshopArchitecture(station);
    const layout={width:20,depth:20,shoreline:{radii:Array(32).fill(1)},workshops:[station],obstacles:workshopObstacles(station),roads:[],lakes:[],terraces:[]};
    for(const p of recipe.obstacles)assert.equal(blockedAt(layout,p.x,p.z,.05),true,`${design}: solid ${p.x}, ${p.z}`);
    const spawn={x:0,z:4.5},approach={x:0,z:3.3},npcLane={x:1.55,z:-.6};
    assert.ok(clearSegment(spawn,approach,(x,z)=>blockedAt(layout,x,z)),`${design}: entry stays open`);
    const path=findPath(approach,npcLane,(x,z)=>blockedAt(layout,x,z),{minX:-4,maxX:4,minZ:-3.5,maxZ:4.5});
    assert.ok(path.length,`${design}: front connects to resident side of table`);
    assert.equal(workshopAt(layout,npcLane),station,`${design}: E works by the long table`);
    assert.equal(workshopAt(layout,approach),station,`${design}: E works in front of the stand`);
    assert.equal(blockedAt(layout,-.6,-.7),true,`${design}: table collision retained`);
  }
});

test('software families include newer exercises and same-island designs vary before repeating',()=>{
  for(const [kind,family] of [['browser-tabs','browser'],['browser-bookmark','browser'],['sheet-chart','sheet'],['sheet-filter','sheet'],['mail-reply','mail'],['calendar','calendar']])assert.equal(workshopApplication(['click',kind]),family);
  for(const app of [undefined,'browser','paint','pdf','sheet','calendar']){
    const used=[];
    for(let i=0;i<4;i++){
      const design=chooseWorkshopDesign(app,used,()=>.4);
      assert.ok(!used.some(w=>w.design===design),`${app}: no repeat while choices remain`);
      used.push({design});
    }
  }
});

test('one generated island still connects every workshop and resident to the dock',()=>{
  const layout=createLayout(levels.find(l=>l.workshops.length===3)||levels[0],23),walk=(x,z)=>blockedAt(layout,x,z),traverse=(a,b)=>canWalkSegment(layout,a,b);
  for(const goal of [layout.dock,...layout.workshops.map(w=>({x:w.approach[0],z:w.approach[1]})),...Object.values(layout.npcSpawns)]){
    if(Math.hypot(goal.x-layout.spawn.x,goal.z-layout.spawn.z)<.01)continue;
    const path=findPath(layout.spawn,goal,walk,layout.bounds,traverse,layout.ladders);
    assert.ok(path.length,'generated endpoint is reachable');
    assert.ok(Math.hypot(path.at(-1).x-goal.x,path.at(-1).z-goal.z)<.15);
    let last=layout.spawn;
    for(const p of path){assert.ok(p.ladder||clearSegment(last,p,walk,traverse));last=p;}
  }
});
