import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {configureShadowCasters} from '../src/shadow-refresh.js';

test('static baking excludes moving batches and restores them when dynamic shadows return',()=>{
  const root=new THREE.Group(),objects=['dynamicShadow','residentBatch','movingPropBatch',null].map(key=>{const o=new THREE.Object3D();o.castShadow=true;if(key)o.userData[key]=true;root.add(o);return o;});
  configureShadowCasters(root,true);assert.deepEqual(objects.map(o=>o.castShadow),[false,false,false,true]);
  configureShadowCasters(root,false);assert.deepEqual(objects.map(o=>o.castShadow),[true,true,true,true]);
});
