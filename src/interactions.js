export function workshopArea(workshop) {
  const [x,z]=workshop.position;
  return {x,z:z+.25,w:6.8,d:7.4};
}
export function workshopAt(layout,point,npcs=[]) {
  const candidates=layout.workshops.filter(workshop=>{
    const a=workshopArea(workshop);
    return Math.abs(point.x-a.x)<=a.w/2 && Math.abs(point.z-a.z)<=a.d/2 ||
      npcs.some(n=>n.workshop===workshop.id&&Math.hypot(n.x-point.x,n.z-point.z)<=2.4);
  });
  return candidates.sort((a,b)=>Math.hypot(point.x-a.position[0],point.z-a.position[1])-Math.hypot(point.x-b.position[0],point.z-b.position[1]))[0]||null;
}
