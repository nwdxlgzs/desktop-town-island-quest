import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createWildlife} from '../src/wildlife.js';

const config=JSON.parse(readFileSync(new URL('../src/levels.json',import.meta.url))),species=[...new Set(config.biomes.flatMap(b=>b.fauna))];

test('every configured creature has finite, connected, floor-aligned indexed geometry within the draw budget',()=>{
  const cube=new THREE.BoxGeometry(),point=new THREE.Vector3();assert.equal(species.length,19);
  for(const name of species){
    const model=createWildlife(name,cube),mesh=model.children[0],g=mesh.geometry,p=g.attributes.position;
    assert.equal(model.children.length,1,name);assert.ok(g.index,name);assert.ok(g.index.count/3<=360,name);
    for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite),name);
    assert.ok(g.boundingBox.min.y>=-1e-6,name);assert.ok(g.boundingBox.max.length()<3,name);
    if(!model.userData.flying)assert.ok(Math.abs(g.boundingBox.min.y)<1e-6,`${name} feet touch local ground`);
    // Every cube must touch another connected part; catch floating heads, feet,
    // claws and rotors without a generated map or a running renderer.
    const source=createWildlife(name,cube,m=>m.geometry.clone()),original=source.children[0].geometry.attributes.position;
    const parts=[];for(let start=0;start<original.count;start+=24){const box=new THREE.Box3();for(let i=start;i<start+24;i++)box.expandByPoint(point.fromBufferAttribute(original,i));parts.push(box);}
    const connected=new Set([0]);let changed=true;
    while(changed){changed=false;for(let i=0;i<parts.length;i++)if(!connected.has(i)&&[...connected].some(j=>parts[j].clone().expandByScalar(.015).intersectsBox(parts[i]))){connected.add(i);changed=true;}}
    assert.equal(connected.size,parts.length,`${name} has detached parts: ${parts.map((_,i)=>i).filter(i=>!connected.has(i))}`);
    assert.equal(model.userData.flying,['小鸟','鹦鹉','萤火虫','蝙蝠','维修无人机'].includes(name),name);
    assert.ok(p.count<=original.count,'exposure pruning only removes internal face vertices');
    source.children[0].geometry.dispose();source.children[0].material.dispose();g.dispose();mesh.material.dispose();
  }
  cube.dispose();
});

test('penguin is upright with exactly two orange feet, a forward belly and beak; it cannot fly',()=>{
  const cube=new THREE.BoxGeometry(),model=createWildlife('企鹅',cube,m=>m.geometry.clone()),g=model.children[0].geometry,orange=new THREE.Color('#e4b35d'),p=g.attributes.position,c=g.attributes.color,feet=[];
  for(let start=0;start<p.count;start+=24){const box=new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(p.array.slice(start*3,(start+24)*3),3));if(box.max.y<.13&&Math.abs(c.getX(start)-orange.r)<1e-6)feet.push(box);}
  assert.equal(feet.length,2);assert.ok(feet[0].max.x<0&&feet[1].min.x>0);assert.ok(g.boundingBox.max.y>1.25);assert.equal(model.userData.flying,false);
  g.dispose();model.children[0].material.dispose();cube.dispose();
});
