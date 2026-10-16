export const islandShapes = ['freeform','oval','bean','crescent','coves'];

export function createShoreline(width,depth,shape,random) {
  const phase=random()*Math.PI*2,radii=[],count=96;
  const lobes=Array.from({length:5+Math.floor(random()*4)},(_,i)=>({angle:random()*Math.PI*2,width:.25+random()*.65,amount:(i%2?-1:1)*(.08+random()*.2)}));
  for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2;
    let r=1;
    if(shape==='bean')r=.87+.08*Math.cos(a)+.04*Math.sin(2*a+phase);
    if(shape==='crescent'){
      const delta=Math.atan2(Math.sin(a-Math.PI),Math.cos(a-Math.PI));
      r=.97-.36*Math.exp(-delta*delta/.48)+.02*Math.sin(3*a+phase);
    }
    if(shape==='coves')r=.88+.075*Math.cos(3*a+phase)+.04*Math.sin(5*a-phase);
    if(shape==='freeform'){
      r=.83+.055*Math.sin(2*a+phase)+.035*Math.cos(5*a-phase);
      for(const lobe of lobes){const delta=Math.atan2(Math.sin(a-lobe.angle),Math.cos(a-lobe.angle));r+=lobe.amount*Math.exp(-delta*delta/lobe.width);}
      r=Math.max(.5,Math.min(.99,r));
    }
    radii.push(r);
  }
  const points=radii.map((r,i)=>({x:Math.cos(i/count*Math.PI*2)*r*width/2,z:Math.sin(i/count*Math.PI*2)*r*depth/2}));
  return {shape,radii,points};
}

// Coastlines are immutable during an island visit. Collision, ambient route
// checks and shadow baking share precomputed edges instead of four trig calls
// for every point. Conservative inner/outer circles reject the common cases.
const edgeCaches=new WeakMap();
function coastEdges(radii){
  let data=edgeCaches.get(radii);if(data)return data;
  const edges=new Float64Array(radii.length*3);let min=Infinity,max=0;
  for(let i=0;i<radii.length;i++){
    const j=(i+1)%radii.length,a=i/radii.length*Math.PI*2,b=(i+1)/radii.length*Math.PI*2,ax=Math.cos(a)*radii[i],az=Math.sin(a)*radii[i],bx=Math.cos(b)*radii[j],bz=Math.sin(b)*radii[j];
    edges[i*3]=ax*bz-az*bx;edges[i*3+1]=bz-az;edges[i*3+2]=bx-ax;min=Math.min(min,radii[i]);max=Math.max(max,radii[i]);
  }
  data={edges,min,max,inner:min*Math.cos(Math.PI/radii.length)};edgeCaches.set(radii,data);return data;
}
// Query the very same polygon used by the map, including inward/outward clearance.
export function onLand(layout,x,z,margin=0) {
  const hx=layout.width/2,hz=layout.depth/2,nx=x/hx,nz=z/hz,lengthSq=nx*nx+nz*nz;
  const {radii}=layout.shoreline;
  const coast=coastEdges(radii),clearance=margin/Math.min(hx,hz);
  if(lengthSq<1e-16)return margin<coast.min*Math.min(hx,hz);
  // Most walking samples are well inside the island. The conservative radial
  // bounds need only squared distances; reserve sqrt/trig for the coast band.
  const inner=coast.inner-clearance-1e-12,outer=coast.max-clearance+1e-12;
  if(inner>0&&lengthSq<inner*inner)return true;
  if(outer<0||lengthSq>outer*outer)return false;
  const length=Math.sqrt(lengthSq);
  let angle=Math.atan2(nz,nx);if(angle<0)angle+=Math.PI*2;
  const i=(Math.floor(angle/(Math.PI*2)*radii.length)%radii.length)*3;
  const edgeRadius=coast.edges[i]/((nx/length)*coast.edges[i+1]-(nz/length)*coast.edges[i+2]);
  return length<=edgeRadius-clearance;
}

export function distanceToShore(layout,x,z) {
  let distance=Infinity;const points=layout.shoreline.points;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));}
  return distance;
}
