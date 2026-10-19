import test from 'node:test';
import assert from 'node:assert/strict';
import {createShoreline} from '../src/shoreline.js';
import {randomSource} from '../src/random.js';
import {createVoyage,sampleVoyage,voyageClear,voyageReefs,harbourBerth} from '../src/voyage.js';
test('a freeform shore pair has a clear rounded outward and return route',()=>{
  const island=seed=>{const shoreline=createShoreline(46,38,'freeform',randomSource(seed));return {width:46,depth:38,shoreline,boat:{x:shoreline.points[0].x+3.4,z:0},reefs:[]};};
  const a=island(17),b=island(31);
  for(const [from,to] of [[a,b],[b,a]]){
    const route=createVoyage(from,to);for(let i=0;i<=100;i++)assert.ok(voyageClear(sampleVoyage(route,i/100),from,to,route.offset));
  }
});
test('cross-island random reefs cannot block either berth while other reefs still block hulls',()=>{
  const island=seed=>{const shoreline=createShoreline(46,38,'freeform',randomSource(seed));return {width:46,depth:38,shoreline,shoreX:shoreline.points[0].x,dock:{x:shoreline.points[0].x-1.3,z:0},boat:{x:shoreline.points[0].x+3.4,z:0},reefs:[]};};
  const a=island(17),b=island(31),offset=56;
  const atArrival={x:offset+b.boat.x,z:b.boat.z,r:1,height:.5},atDeparture={x:a.boat.x-offset,z:a.boat.z,r:1,height:.5},oceanRock={x:a.boat.x+4,z:10,r:.8,height:.5};
  a.reefs.push(atArrival,oceanRock);b.reefs.push(atDeparture);
  const reefs=voyageReefs(a,b,offset);assert.equal(reefs.source.includes(atArrival),false);assert.equal(reefs.destination.includes(atDeparture),false);assert.ok(reefs.source.includes(oceanRock));
  assert.equal(voyageClear(oceanRock,a,b,offset),false);const route=createVoyage(a,b);
  for(let i=0;i<=100;i++)assert.ok(voyageClear(sampleVoyage(route,i/100),a,b,offset));
  // A steeply slanting eastern shore needs a berth further out than x + 3.4.
  const c=island(1);c.shoreline.radii[0]=.55;c.shoreline.points[0].x=.55*c.width/2;c.shoreX=c.shoreline.points[0].x;c.dock.x=c.shoreX-1.3;c.boat=harbourBerth(c);
  assert.ok(voyageClear(c.boat,c,null,0));
});
