import test from 'node:test';
import assert from 'node:assert/strict';
import {onLand,createShoreline,islandShapes} from '../src/shoreline.js';
import {randomSource} from '../src/random.js';

test('cached coast queries preserve the exact polygon and inward/outward margins',()=>{
  // Independent ray/edge intersection reference; fixed shapes, no map building.
  function reference(l,x,z,margin){
    const hx=l.width/2,hz=l.depth/2,nx=x/hx,nz=z/hz,length=Math.hypot(nx,nz),r=l.shoreline.radii;
    if(length<1e-8)return margin<Math.min(...r)*Math.min(hx,hz);
    let a=Math.atan2(nz,nx);if(a<0)a+=Math.PI*2;const i=Math.floor(a/(Math.PI*2)*r.length)%r.length;
    const a0=i/r.length*Math.PI*2,a1=(i+1)/r.length*Math.PI*2,ax=Math.cos(a0)*r[i],az=Math.sin(a0)*r[i],bx=Math.cos(a1)*r[(i+1)%r.length],bz=Math.sin(a1)*r[(i+1)%r.length];
    return length<=(ax*bz-az*bx)/((nx/length)*(bz-az)-(nz/length)*(bx-ax))-margin/Math.min(hx,hz);
  }
  for(const shape of islandShapes){
    const l={width:40,depth:26,shoreline:createShoreline(40,26,shape,randomSource(7))};
    for(const margin of [-1,0,.4,2,30])for(let i=0;i<192;i++)for(const r of [.1,.55,.85,1.01]){
      const a=(i+.2)/192*Math.PI*2,x=Math.cos(a)*20*r,z=Math.sin(a)*13*r;assert.equal(onLand(l,x,z,margin),reference(l,x,z,margin),`${shape} ${i} ${r} ${margin}`);
    }
    assert.equal(onLand(l,0,0,30),false);assert.equal(onLand(l,0,0),true);
  }
});
