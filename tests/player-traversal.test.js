import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerTraversal} from '../src/player-traversal.js';
import {createNavigator,terrainNavigationGrid,clearSegment} from '../src/navigation.js';
import {blockedAt,createLayout} from '../src/level-layout.js';
import {journeyForSeed} from '../src/curriculum.js';
import {canWalkSegment,playerRadius,extraStepHeight,terrainCellAt} from '../src/terrain.js';

const main={x:0,z:0,r:1.2,ramp:.01,height:1},half={x:2,z:0,r:1.2,ramp:.01,height:.5};
function layout(terraces=[main,half],obstacles=[]){return {width:13,depth:13,terrain:{baseLayers:0,layerHeight:.75,coastLayers:Array(12).fill(0)},terrainReady:true,shoreline:{radii:Array(96).fill(.9)},bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},workshops:[],terraces,obstacles,roads:[],lakes:[],ladders:[]};}
function traversal(l){const nav=createNavigator((x,z)=>blockedAt(l,x,z,playerRadius),l.bounds,(a,b)=>canWalkSegment(l,a,b),l.ladders,terrainNavigationGrid(l));return createPlayerTraversal(l,(a,b)=>nav.findPath(a,b));}
const low={x:0,z:1.4},high={x:0,z:1.2};

test('one-unit jump and descent shortcuts require an ordinary walk route; the solid body stays intact',()=>{
  const l=layout(),move=traversal(l);assert.equal(extraStepHeight,1.25);assert.equal(move.canMove(low,high),false);assert.equal(move.canMove(low,high,low),true);assert.equal(move.canMove(high,low),true);
  const isolated=traversal(layout([main]));assert.equal(isolated.canMove(low,high,low),false,'jump cannot enter an isolated ledge');assert.equal(isolated.canMove(high,low),false,'descending cannot strand the player below an isolated platform');
  const wall=traversal(layout([main,half],[{x:0,z:1.3,w:2,d:.15}]));assert.equal(wall.canMove(low,high,low),false,'jump never ignores scenery collision');
  assert.equal(move.canMove({x:0,z:0},{x:9,z:0},low),false,'sea remains unsupported');
});

test('jump ceiling is bounded from takeoff and repeated airborne checks reuse reachability',()=>{
  const l=layout(),move=traversal(l);for(let i=0;i<15;i++)assert.equal(move.canMove(low,{x:i*.001,z:1.2},low),true);assert.equal(move.searches,1,'no per-frame route searches during the same crossing');
  const tooTall=traversal(layout([{...main,height:1.5},half]));assert.equal(tooTall.canMove(low,high,low),false,'the bonus does not climb a 1.5-unit riser');assert.equal(tooTall.searches,0);
  const chained=layout([{...main,height:2},half]),trusted=createPlayerTraversal(chained,(_a,b)=>[b]);assert.equal(trusted.canMove({x:1.4,z:0},{x:1.2,z:0},{x:4,z:0}),false,'several short moves cannot stack extra height beyond the takeoff ceiling');
  const denied=traversal(layout([main]));for(let i=0;i<15;i++)assert.equal(denied.canMove(low,high,low),false);assert.equal(denied.searches,1,'holding against an unreachable ledge reuses a failed query');
});

test('reported cactus slope permits the formerly blocked stair corner and keeps trunk and edge support',()=>{
  const l=createLayout(journeyForSeed(3763093038)[2],3763093038),tree=l.trees.find(t=>t.x>8&&t.x<10),p={x:tree.x+.8,z:tree.z+.8},blocked=(x,z)=>blockedAt(l,x,z,playerRadius);
  assert.equal(terrainCellAt(l,p.x,p.z).elevation,2);assert.equal(blocked(p.x,p.z),false,'a lower neighbour no longer blocks the full body at a stair corner');
  assert.equal(blocked(tree.x,tree.z),true,'the cactus itself remains solid');
  const from={x:tree.x+1,z:tree.z},to={x:tree.x+.8,z:tree.z+1};assert.ok(clearSegment(from,to,blocked,(a,b)=>canWalkSegment(l,a,b)),'ordinary half-steps beside the cactus remain navigable');
});
