// Shared boxes keep the cave's protruding rocks inside its collision boundary.
export function mountainParts(mountain,biome,palette){
  const {x,z,w,d,height:h}=mountain,parts=[];
  const box=(x,y,z,w,h,d,color)=>parts.push({x,y,z,w,h,d,color});
  for(let tier=0;tier<4;tier++){const scale=1-tier*.21;box(x+(tier%2)*.25,tier*h*.23+h*.13,z-tier*.15,w*scale,h*.27,d*scale,palette?.rock[tier]);}
  box(x-w*.32,.55,z+d*.34,w*.22,1.1,d*.3,palette?.rock[1]);
  if(biome==='cave'){box(x,.9,z+d*.51,w*.45,1.8,.08,'#415569');for(let i=0;i<3;i++)box(x-w*.22+i*w*.22,1.2+i*.2,z+d*.53,.35,.9,.4,palette?.leaf[i]);}
  if(biome==='inferno')box(x,h*.92,z-.45,w*.3,.12,d*.25,palette?.accent);
  return parts;
}
export function mountainObstacles(mountain,biome){
  const parts=mountainParts(mountain,biome),base=parts[0];
  return parts.filter((p,i)=>i===0||Math.abs(p.x-base.x)+p.w/2>base.w/2+1e-6||Math.abs(p.z-base.z)+p.d/2>base.d/2+1e-6).map(({x,z,w,d})=>({x,z,w,d,type:'mountain'}));
}
