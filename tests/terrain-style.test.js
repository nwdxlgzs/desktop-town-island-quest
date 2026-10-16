import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeQuality,migrateQuality,createQualityController} from '../src/quality.js';
import {normalizeTerrainLines,setTerrainLines} from '../src/terrain-style.js';
import {buildTerrainMesh} from '../src/terrain-mesh.js';

test('line checkbox preserves off and migrates both former enabled styles',()=>{
  for(const terrainLines of ['off','beveled']){
    assert.equal(normalizeQuality({terrainLines}).terrainLines,terrainLines);
    assert.equal(migrateQuality({terrainLines,resolution:'.75',adaptive:false}).terrainLines,terrainLines);
  }
  assert.equal(migrateQuality({terrainLines:'simple'}).terrainLines,'beveled');
  assert.equal(normalizeQuality().terrainLines,'beveled');assert.equal(normalizeTerrainLines('invalid'),'beveled');assert.equal(normalizeTerrainLines('__proto__'),'beveled');
});

test('switching line style preserves the learned adaptation stage and does not get overwritten by degradation',()=>{
  const q=createQualityController({adaptive:true},()=>{},{cores:2});assert.equal(q.profile.stage,2);
  q.configure({...q.settings,terrainLines:'off'});assert.equal(q.profile.stage,2);assert.equal(q.profile.terrainLines,'off');
  for(let i=0;i<40;i++)q.observe(150,100,.15);
  assert.equal(q.profile.stage,4);assert.equal(q.profile.terrainLines,'off');
  q.configure({...q.settings,terrainLines:'beveled'});assert.equal(q.profile.stage,4);assert.equal(q.profile.terrainLines,'beveled');
});

test('material styles keep geometry and baked defines, and repeated settings avoid recompilation',()=>{
  const palette={ground:'#b5d3a2',groundAlt:'#a5c591',sand:'#dfd0a9',rock:['#9da98f','#b0b599','#c6ba99','#d2c29e'],water:'#70b4bf'},layout={width:8,depth:8,shoreline:{radii:Array(16).fill(1)}};
  const mesh=buildTerrainMesh(layout,palette),geometry=mesh.geometry,material=mesh.material,sun=new THREE.Vector3(-12,28,16);
  material.defines.BAKED_VOXEL_SHADOW=1;
  assert.equal(setTerrainLines(mesh,'beveled',sun),false);assert.equal(material.userData.terrainSun.value,sun);
  for(const [style,mode]of [['off',0],['beveled',1]]){
    assert.equal(setTerrainLines(mesh,style),true);assert.equal(material.defines.TERRAIN_LINE_STYLE,mode);assert.equal(material.defines.BAKED_VOXEL_SHADOW,1);
    const version=material.version;assert.equal(setTerrainLines(mesh,style),false);assert.equal(material.version,version);assert.equal(mesh.geometry,geometry);
  }
  const version=material.version;assert.equal(setTerrainLines(mesh,'simple'),false);assert.equal(material.version,version);
  assert.ok([...geometry.attributes.terrainFace.array].every(Number.isFinite));geometry.dispose();material.dispose();
});
